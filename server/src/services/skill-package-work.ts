import { readPaperclipSkillSyncPreference } from "@paperclipai/adapter-utils/server-utils";
import { promises as fs } from "node:fs";
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { companySkillRepositorySnapshots as snapshots, companySkillVersions as versions,
  skillPackageDeletions, agents, type Db } from "@paperclipai/db";
import { getStorageService, type StorageService } from "../storage/index.js";
import { logger } from "../middleware/logger.js";
import { DELIVERY_QUEUES } from "./delivery-work-notifications.js";
import type { createDeliveryWorkCoordinator } from "./delivery-work-coordinator.js";
import { validateSkillPackageManifest, skillPackageManifestBytes, packageSha256 } from "./skill-package-files.js";
import { skillPackageMaintenance } from "./skill-package-maintenance.js";
import { skillPackagePaths, skillPackageStorageEnabled } from "./skill-package-store.js";
import { ensureSkillCacheDirectory, protectedVersions, SkillCacheBusy, withSkillVersionCacheLock } from "./skill-version-cache.js";

export const SKILL_PACKAGE_RETENTION_MS = 30 * 24 * 60 * 60_000;
const RETRY_MS = 60 * 60_000;
const PAGE_SIZE = 4;

/** A finite upgrade plus persisted cleanup deadlines. No work is added to turn
 * preparation; completed history has no recurring SQL/network obligation. */
export function skillPackageWork(db: Db, storage?: StorageService) {
  const maintenance = skillPackageMaintenance(db, storage);
  const backend = () => storage ?? getStorageService();
  async function retire(id: string, signal: AbortSignal) {
    const [row] = await db.select({ id: snapshots.id, companyId: snapshots.companyId, contentHash: snapshots.contentHash, createdAt: snapshots.createdAt,
      storage: snapshots.storage, upload: snapshots.upload, restore: snapshots.restore, migrationAt: snapshots.migrationAt })
      .from(snapshots).where(eq(snapshots.id, id));
    if (!row) return;
    signal.throwIfAborted();
    // Orphan deletion is delayed so an upload can publish its first version.
    const removeLocal = async () => {
      const paths = skillPackagePaths(row.companyId, id);
      try {
        await ensureSkillCacheDirectory(paths.parent);
        await fs.rm(paths.directory, { recursive: true, force: true });
        await fs.rm(paths.manifest, { force: true });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    };
    if (await withSkillVersionCacheLock(db, row.companyId, async () => {
      if (!(await maintenance.collectOrphans({ id, apply: true, signal })).removed) return false;
      await removeLocal();
      return true;
    }, true)) return;
    const orphanAt = row.createdAt.getTime() + 24 * 60 * 60_000;
    let next: Date | null = orphanAt > Date.now() ? new Date(orphanAt) : null;
    if (row.upload) next = new Date(Math.max(Date.now() + RETRY_MS, new Date(row.upload.expiresAt).getTime(), row.createdAt.getTime() + 24 * 60 * 60_000));
    else if (row.restore && row.storage) {
      const expires = row.createdAt.getTime() + SKILL_PACKAGE_RETENTION_MS;
      if (expires > Date.now()) next = new Date(expires);
      else if (!row.migrationAt) {
        const manifest = validateSkillPackageManifest(row.restore.manifest);
        if (row.restore.version !== 1 || manifest.contentHash !== row.contentHash
          || packageSha256(skillPackageManifestBytes(manifest)) !== row.storage.manifestSha256) throw new Error("Invalid skill restore recipe; keep durable bytes");
        await withSkillVersionCacheLock(db, row.companyId, async () => {
          const referenced = await db.select({ id: versions.id }).from(versions).where(and(eq(versions.companyId, row.companyId),
            sql`(${versions.repositorySnapshotId} = ${id} or ${versions.packageSnapshotId} = ${id})`));
          const [current] = await db.execute(sql`select 1 from company_skills s where s.company_id = ${row.companyId}
            and s.current_version_id in (select id from company_skill_versions where repository_snapshot_id = ${id} or package_snapshot_id = ${id})
            union all select 1 from company_skill_test_runs t where t.company_id = ${row.companyId}
              and t.status in ('queued', 'running') and t.skill_version_id in
                (select id from company_skill_versions where repository_snapshot_id = ${id} or package_snapshot_id = ${id}) limit 1`);
          if (current) return;
          const pinned = new Set<string>();
          for (const agent of await db.select({ config: agents.adapterConfig }).from(agents).where(eq(agents.companyId, row.companyId))) {
            for (const entry of readPaperclipSkillSyncPreference(agent.config ?? {}).desiredSkillEntries) if (entry.versionId) pinned.add(entry.versionId);
          }
          const active = await protectedVersions(db, row.companyId);
          if (!active || referenced.some(version => active.has(version.id) || pinned.has(version.id))) return;
          signal.throwIfAborted();
          // Metadata/recipe remain. Triggered deletion receipts retain the old
          // object keys through the rollback grace; future reads reacquire the SHA.
          await db.update(snapshots).set({ storage: null }).where(and(eq(snapshots.id, id), isNull(snapshots.upload)));
          await removeLocal();
        }, true);
      }
    }
    await db.update(snapshots).set({ maintenanceAt: next }).where(and(eq(snapshots.id, id), lte(snapshots.maintenanceAt, new Date())));
  }
  async function tick(signal: AbortSignal) {
    if (!skillPackageStorageEnabled()) return;
    for (const table of [snapshots, versions]) {
      const rows = await db.select({ id: table.id }).from(table).where(lte(table.migrationAt, new Date())).orderBy(table.migrationAt).limit(PAGE_SIZE);
      for (const row of rows) {
        signal.throwIfAborted();
        try {
          if (table === snapshots) await maintenance.migrateSnapshots({ id: row.id, apply: true, clearLegacy: true, signal });
          else {
            // Bundled releases intentionally retain their small inline contract.
            const result = await maintenance.migrateVersions({ id: row.id, apply: true, clearLegacy: true, signal });
            if (!result.inspected) await db.update(versions).set({ migrationAt: null }).where(eq(versions.id, row.id));
          }
        } catch (error) {
          signal.throwIfAborted();
          await db.update(table).set({ migrationAt: new Date(Date.now() + RETRY_MS) }).where(and(eq(table.id, row.id), isNotNull(table.migrationAt)));
          logger.warn({ packageId: row.id }, "Skill package conversion deferred; original contents retained");
        }
      }
    }
    const due = await db.select({ id: snapshots.id }).from(snapshots).where(lte(snapshots.maintenanceAt, new Date())).orderBy(snapshots.maintenanceAt).limit(PAGE_SIZE);
    for (const { id } of due) {
      try { await retire(id, signal); }
      catch (error) {
        signal.throwIfAborted();
        await db.update(snapshots).set({ maintenanceAt: new Date(Date.now() + (error instanceof SkillCacheBusy ? 60_000 : RETRY_MS)) }).where(and(eq(snapshots.id, id), lte(snapshots.maintenanceAt, new Date())));
        if (!(error instanceof SkillCacheBusy)) logger.warn({ packageId: id }, "Skill package cleanup deferred");
      }
    }
    const deletions = await db.select({ id: skillPackageDeletions.id }).from(skillPackageDeletions).where(and(
      eq(skillPackageDeletions.provider, backend().provider), lte(skillPackageDeletions.deleteAfter, new Date()))).limit(PAGE_SIZE);
    for (const { id } of deletions) {
      try { await maintenance.deleteObjects({ id, apply: true, signal }); }
      catch (error) {
        signal.throwIfAborted();
        await db.update(skillPackageDeletions).set({ deleteAfter: new Date(Date.now() + RETRY_MS) }).where(eq(skillPackageDeletions.id, id));
        logger.warn({ deletionId: id }, "Skill package object deletion deferred");
      }
    }
  }
  async function deadline() {
    if (!skillPackageStorageEnabled()) return null;
    const [row] = await db.execute<{ at: string | Date | null }>(sql`select min(at) as at from (
      select min(migration_at) as at from company_skill_repository_snapshots
      union all select min(migration_at) from company_skill_versions
      union all select min(maintenance_at) from company_skill_repository_snapshots
      union all select min(delete_after) from skill_package_deletions where provider = ${backend().provider}
    ) deadlines`);
    return row?.at ? new Date(row.at).getTime() : null;
  }
  function start(coordinator: Pick<ReturnType<typeof createDeliveryWorkCoordinator>, "register">) {
    let requested = 0, completed = -1, next: number | null = null;
    let recovered = false;
    return coordinator.register(DELIVERY_QUEUES.skillPackages, {
      retryMs: 5_000, pausePassiveMaintenance: true,
      onSettled: () => { requested++; },
      async run(signal) {
        const generation = requested;
        if (!recovered && skillPackageStorageEnabled()) {
          // A package previously protected by a run/pin may now be unused.
          // Reconsider it once on restart, not on an idle polling interval.
          await db.update(snapshots).set({ maintenanceAt: new Date() }).where(and(isNull(snapshots.maintenanceAt),
            sql`${snapshots.storage} is not null and ${snapshots.restore} is not null`,
            lte(snapshots.createdAt, new Date(Date.now() - SKILL_PACKAGE_RETENTION_MS))));
          recovered = true;
        }
        await tick(signal);
        next = await deadline();
        if (next !== null) next = Math.max(Date.now() + 1_000, next);
        completed = generation;
      },
      hasPending: async () => false,
      nextRunAt: () => requested !== completed ? Date.now() + 5_000 : next,
    });
  }
  return { tick, deadline, start };
}
