import { skillPackageWork } from "../services/skill-package-work.js";
import * as recovery from "../services/skill-package-recovery.js";
import type { GitHubRead } from "../services/github-skill-source.js";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { companies, companySkills, companySkillVersions, companySkillRepositorySnapshots as snapshots,
  skillPackageDeletions, createDb } from "@paperclipai/db";
import type { CompanySkillVersionFileInventoryEntry } from "@paperclipai/shared";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import * as storageModule from "../storage/index.js";
import { createStorageService } from "../storage/service.js";
import { createLocalDiskStorageProvider } from "../storage/local-disk-provider.js";
import { companySkillService } from "../services/company-skills.js";
import { skillPackageStore, skillPackagePaths, withSkillPackageReadScope } from "../services/skill-package-store.js";
import { skillPackageMaintenance } from "../services/skill-package-maintenance.js";
import { skillPackageManifest, validateSkillPackageManifest, writeSkillPackageArchive, extractSkillPackageArchive,
  verifySkillPackageDirectory } from "../services/skill-package-files.js";
import { skillFileBytes, skillSnapshotHash } from "../services/skill-snapshot.js";
import { hasRestorableSnapshot } from "../services/skill-version-cache.js";

const support = await getEmbeddedPostgresTestSupport();
describe.skipIf(!support.supported)("external skill packages", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let home: string;
  let storage: storageModule.StorageService;
  const previousHome = process.env.PAPERCLIP_HOME;
  const files: CompanySkillVersionFileInventoryEntry[] = [
    { path: "skills/one/SKILL.md", kind: "skill", content: "---\nname: one\ndescription: Test one\n---\nUse ../../shared/run.sh\n" },
    { path: "skills/two/SKILL.md", kind: "skill", content: "---\nname: two\ndescription: Test two\n---\nUse ../../shared/run.sh\n" },
    { path: "shared/run.sh", kind: "script", content: "#!/bin/sh\necho original\n", executable: true },
    { path: "assets/binary", kind: "reference", content: Buffer.from([0, 255, 7]).toString("base64"), encoding: "base64" },
    { path: "assets/base64-text", kind: "reference", content: Buffer.from("text encoded explicitly").toString("base64"), encoding: "base64" },
  ];
  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("skill-packages-");
    db = createDb(database.connectionString, { maxConnections: 1 });
    home = await fs.mkdtemp(path.join(os.tmpdir(), "skill-packages-"));
    process.env.PAPERCLIP_HOME = home;
    storage = createStorageService(createLocalDiskStorageProvider(path.join(home, "objects")));
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (previousHome === undefined) delete process.env.PAPERCLIP_HOME;
    else process.env.PAPERCLIP_HOME = previousHome;
    await db?.$client.end({ timeout: 1 });
    await database?.cleanup();
    if (home) await fs.rm(home, { recursive: true, force: true });
  });
  async function company() {
    const id = randomUUID();
    await db.insert(companies).values({ id, name: "Package test", issuePrefix: `P${id.slice(0, 6)}` });
    return id;
  }
  async function fixture() {
    const companyId = await company();
    vi.spyOn(storageModule, "getStorageService").mockReturnValue(storage);
    const store = skillPackageStore(db, storage);
    const id = await store.prepare(companyId, files);
    const skills = [];
    for (const name of ["one", "two"]) {
      const [skill] = await db.insert(companySkills).values({ companyId, key: `company/${companyId}/${name}`, slug: name,
        name, markdown: files.find(file => file.path === `skills/${name}/SKILL.md`)!.content, sourceType: "github",
        metadata: { skillSourceId: randomUUID(), snapshotHash: "saved" } }).returning();
      const [version] = await db.insert(companySkillVersions).values({ companyId, companySkillId: skill!.id, revisionNumber: 1,
        repositorySnapshotId: id, repositorySkillPath: `skills/${name}/SKILL.md`, packageSnapshotId: id,
        packageFileMap: [{ path: "SKILL.md", kind: "skill", sourcePath: `skills/${name}/SKILL.md` }] }).returning();
      await db.update(companySkills).set({ currentVersionId: version!.id }).where(eq(companySkills.id, skill!.id));
      skills.push({ skill: skill!, version: version! });
    }
    const service = companySkillService(db);
    const resolve = () => service.listRuntimeSkillEntries(companyId, { onlyKeys: new Set(skills.map(({ skill }) => skill.key)), snapshotLatest: true });
    return { companyId, id, store, skills, service, resolve };
  }

  it("automatically converts legacy rows, clears verified payloads and preserves version identities", async () => {
    const companyId = await company();
    const [snapshot] = await db.insert(snapshots).values({ companyId, contentHash: skillSnapshotHash(files), fileInventory: files }).returning();
    const [skill] = await db.insert(companySkills).values({ companyId, key: "legacy", slug: "legacy", name: "Legacy", markdown: files[0]!.content }).returning();
    const [version] = await db.insert(companySkillVersions).values({ companyId, companySkillId: skill!.id, revisionNumber: 7,
      repositorySnapshotId: snapshot!.id, repositorySkillPath: files[0]!.path,
      fileInventory: [{ ...files[0]!, path: "SKILL.md" }] }).returning();
    const work = skillPackageWork(db, storage);
    await work.tick(new AbortController().signal);
    const [saved] = await db.select().from(snapshots).where(eq(snapshots.id, snapshot!.id));
    const [converted] = await db.select().from(companySkillVersions).where(eq(companySkillVersions.id, version!.id));
    expect(saved!.fileInventory).toEqual([]);
    expect(saved!.migrationAt).toBeNull();
    expect(saved!.storage).not.toBeNull();
    expect(converted!.fileInventory).toEqual([]);
    expect(converted!.migrationAt).toBeNull();
    expect(converted!.packageSnapshotId).toBe(snapshot!.id);
    expect(converted!.revisionNumber).toBe(7);
    expect(await skillPackageStore(db, storage).versionFiles(converted!)).toEqual([{ ...files[0]!, path: "SKILL.md" }]);
  });

  it("expires an unused Git package and reacquires its exact bytes without a migration command", async () => {
    const f = await fixture();
    const recipe = { version: 1 as const, sourceId: randomUUID(), repositoryId: "123", repositoryUrl: "https://github.com/acme/skills",
      commitSha: "a".repeat(40), skillPath: null, manifest: skillPackageManifest(files) };
    await f.store.prepare(f.companyId, files, true, undefined, recipe);
    await f.store.files(f.companyId, f.id);
    await db.update(snapshots).set({ createdAt: new Date(Date.now() - 40 * 86_400_000), maintenanceAt: new Date(0), migrationAt: null }).where(eq(snapshots.id, f.id));
    // Current versions stay pinned even after their cache age expires.
    await skillPackageWork(db, storage).tick(new AbortController().signal);
    expect((await f.store.descriptor(f.companyId, f.id)).storage).not.toBeNull();
    for (const { skill } of f.skills) await db.update(companySkills).set({ currentVersionId: null }).where(eq(companySkills.id, skill.id));
    await db.update(snapshots).set({ maintenanceAt: new Date(0) }).where(eq(snapshots.id, f.id));
    await skillPackageWork(db, storage).tick(new AbortController().signal);
    expect((await f.store.descriptor(f.companyId, f.id)).storage).toBeNull();
    expect(await fs.stat(skillPackagePaths(f.companyId, f.id).directory).catch(() => null)).toBeNull();
    const entries = recipe.manifest.files.map((file, i) => ({ path: file.path, mode: file.executable ? "100755" : "100644", type: "blob", size: file.size, sha: String(i).repeat(40) }));
    const read = Object.assign(vi.fn(async () => ({ id: 123 })), { openSnapshot: vi.fn(async () => ({ commitSha: recipe.commitSha, entries,
      readBlob: async (entry: typeof entries[number]) => skillFileBytes(files[entries.indexOf(entry)]!), release: async () => {} })) }) as unknown as GitHubRead;
    const authorization = vi.spyOn(recovery, "skillPackageRecoveryReader").mockResolvedValue(read);
    expect(await f.store.files(f.companyId, f.id)).toEqual(files);
    expect(read.openSnapshot).toHaveBeenCalledOnce();
    await f.store.files(f.companyId, f.id);
    expect(authorization).toHaveBeenCalledOnce();
    await fs.rm(skillPackagePaths(f.companyId, f.id).directory, { recursive: true });
    authorization.mockRejectedValue(new Error("grant revoked"));
    await expect(f.store.files(f.companyId, f.id)).rejects.toThrow("grant revoked");
    await expect(f.store.files(f.companyId, f.id)).rejects.toThrow("backoff");
    expect(authorization).toHaveBeenCalledTimes(2);
  });

  it("recovers missing archive and manifest objects while a published receipt still exists", async () => {
    const companyId = await company();
    const store = skillPackageStore(db, storage);
    const recipe = { version: 1 as const, sourceId: randomUUID(), repositoryId: "123", repositoryUrl: "https://github.com/acme/skills",
      commitSha: "a".repeat(40), skillPath: null, manifest: skillPackageManifest(files) };
    const id = await store.prepare(companyId, files, true, undefined, recipe);
    const receipt = (await store.descriptor(companyId, id)).storage!;
    await storage.deleteObject(companyId, receipt.archiveKey);
    await storage.deleteObject(companyId, receipt.manifestKey);
    await expect(recovery.skillPackageRecoveryReader(db, companyId, recipe)).rejects.toThrow("Reconnect its original repository");
    const entries = recipe.manifest.files.map((file, i) => ({ path: file.path, mode: file.executable ? "100755" : "100644", type: "blob", size: file.size, sha: String(i).repeat(40) }));
    const read = Object.assign(vi.fn(async () => ({ id: 123 })), { openSnapshot: vi.fn(async () => ({ commitSha: recipe.commitSha, entries,
      readBlob: async (entry: typeof entries[number]) => skillFileBytes(files[entries.indexOf(entry)]!), release: async () => {} })) }) as unknown as GitHubRead;
    vi.spyOn(recovery, "skillPackageRecoveryReader").mockResolvedValue(read);
    // PostgreSQL JSONB has reordered recipe object keys; its canonical bytes must
    // still agree with the original externally written manifest checksum.
    expect(await store.files(companyId, id)).toEqual(files);
    expect(read.openSnapshot).toHaveBeenCalledOnce();
  });

  it("retains referenced historical bytes without an exact Git recipe", async () => {
    const f = await fixture();
    for (const { skill } of f.skills) await db.update(companySkills).set({ currentVersionId: null }).where(eq(companySkills.id, skill.id));
    await db.update(snapshots).set({ createdAt: new Date(0), migrationAt: null, maintenanceAt: new Date(0) }).where(eq(snapshots.id, f.id));
    await skillPackageWork(db, storage).tick(new AbortController().signal);
    expect((await f.store.descriptor(f.companyId, f.id)).storage).not.toBeNull();
    expect(await f.store.files(f.companyId, f.id)).toEqual(files);
  });

  it("restores one shared archive, then prepares a warm turn without object reads or SQL file bodies", async () => {
    const f = await fixture();
    const read = vi.spyOn(storage, "getObject");
    const cold = await f.resolve();
    expect(cold.map(entry => entry.sourceStatus)).toEqual(["available", "available"]);
    expect(read.mock.calls.filter(call => call[1].endsWith("files.tar.gz"))).toHaveLength(1);
    expect(read.mock.calls.filter(call => call[1].endsWith("manifest.json"))).toHaveLength(1);
    const [row] = await db.select().from(snapshots).where(eq(snapshots.id, f.id));
    expect(row!.fileInventory).toEqual([]);
    const sql: string[] = [];
    const oldDebug = db.$client.options.debug;
    db.$client.options.debug = (_connection, query) => { sql.push(query); };
    read.mockClear();
    try { expect(await f.resolve()).toEqual(cold); }
    finally { db.$client.options.debug = oldDebug; }
    expect(read).not.toHaveBeenCalled();
    expect(sql.length).toBeLessThanOrEqual(6);
    for (const query of sql.filter(query => /from "company_skill_(repository_snapshots|versions)"/.test(query))) {
      // Bundled release validation returns only a DB-side digest.
      if (!query.includes("encode(sha256(")) expect(query).not.toMatch(/"file_inventory"/);
    }
    expect((await f.service.getVersion(f.companyId, f.skills[0]!.skill.id, f.skills[0]!.version.id))!.fileInventory)
      .toEqual([{ path: "SKILL.md", kind: "skill", content: files[0]!.content }]);
    const restored = await f.store.files(f.companyId, f.id);
    expect(restored.map(skillFileBytes)).toEqual(files.map(skillFileBytes));
    await expect(f.store.files(await company(), f.id)).rejects.toThrow("unavailable");
  });

  it("repairs a same-size cached edit and restores old versions without upstream access", async () => {
    const f = await fixture();
    const entries = await f.resolve();
    const target = path.join(entries[0]!.source, ".paperclip-repository/shared/run.sh");
    const stat = await fs.stat(target);
    await fs.chmod(target, 0o755);
    await fs.writeFile(target, "#!/bin/sh\necho modified\n");
    await fs.utimes(target, stat.atime, stat.mtime);
    const read = vi.spyOn(storage, "getObject");
    await f.resolve();
    expect(await fs.readFile(target, "utf8")).toBe(files[2]!.content);
    expect(read).not.toHaveBeenCalled();
    const upstream = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    for (const entry of entries) await fs.rm(entry.source, { recursive: true });
    await fs.rm(skillPackagePaths(f.companyId, f.id).directory, { recursive: true });
    expect((await f.resolve()).every(entry => entry.sourceStatus === "available")).toBe(true);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses cache eviction when durable objects are missing, even after an earlier verification", async () => {
    const f = await fixture();
    await f.resolve();
    expect(await hasRestorableSnapshot(db, f.companyId, f.skills[0]!.version.id)).toBe(true);
    const receipt = (await f.store.descriptor(f.companyId, f.id)).storage!;
    await storage.deleteObject(f.companyId, receipt.archiveKey);
    await expect(hasRestorableSnapshot(db, f.companyId, f.skills[0]!.version.id)).rejects.toThrow();
    // Existing local verified files remain usable while storage is unavailable.
    expect((await f.resolve()).every(entry => entry.sourceStatus === "available")).toBe(true);
  });

  it("retries expired upload claims with fresh keys and only deletes the abandoned attempt", async () => {
    const companyId = await company();
    const store = skillPackageStore(db, storage);
    const put = vi.spyOn(storage, "putFile").mockRejectedValueOnce(new Error("connection lost"));
    await expect(store.prepare(companyId, files)).rejects.toThrow("connection lost");
    put.mockRestore();
    const [pending] = await db.select().from(snapshots).where(eq(snapshots.companyId, companyId));
    expect(pending!.storage).toBeNull();
    await expect(store.prepare(companyId, files)).rejects.toThrow("being saved");
    await db.update(snapshots).set({ upload: { ...pending!.upload!, expiresAt: new Date(0).toISOString() } }).where(eq(snapshots.id, pending!.id));
    const id = await store.prepare(companyId, files);
    expect(id).toBe(pending!.id);
    const receipt = (await store.descriptor(companyId, id)).storage!;
    expect(receipt.archiveKey).not.toBe(pending!.upload!.archiveKey);
    const [deletion] = await db.select().from(skillPackageDeletions).where(eq(skillPackageDeletions.companyId, companyId));
    expect(deletion!.archiveKey).toBe(pending!.upload!.archiveKey);
    await db.update(skillPackageDeletions).set({ deleteAfter: new Date(0) }).where(eq(skillPackageDeletions.id, deletion!.id));
    expect((await skillPackageMaintenance(db, storage).deleteObjects({ companyId, apply: true })).removed).toBe(1);
    expect(await store.verifyDurable(companyId, id)).toBe(true);
    // Company cascades retain a receipt after removing the snapshot's DB row.
    await db.delete(companies).where(eq(companies.id, companyId));
    expect(await db.select().from(skillPackageDeletions).where(eq(skillPackageDeletions.companyId, companyId)))
      .toEqual([expect.objectContaining({ archiveKey: receipt.archiveKey })]);
  });

  it("cancels queued and active uploads without publishing or leaking I/O capacity", async () => {
    const ids = await Promise.all([company(), company(), company()]);
    const active = new AbortController();
    const queued = new AbortController();
    const put = vi.spyOn(storage, "putFile").mockImplementation(async input => {
      expect(input.signal).toBeDefined();
      await new Promise<void>((_resolve, reject) => {
        input.signal!.addEventListener("abort", () => reject(input.signal!.reason), { once: true });
      });
      throw new Error("Unreachable cancelled upload");
    });
    const store = skillPackageStore(db, storage);
    const running = ids.slice(0, 2).map(id => store.prepare(id!, files, false, active.signal).catch(error => error));
    try {
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
      const waiting = store.prepare(ids[2]!, files, false, queued.signal).catch(error => error);
      await vi.waitFor(async () => expect(await db.select({ id: snapshots.id }).from(snapshots)
        .where(eq(snapshots.companyId, ids[2]!))).toHaveLength(1));
      queued.abort(new Error("queued cancellation"));
      expect((await waiting).message).toBe("queued cancellation");
      expect(put).toHaveBeenCalledTimes(2);
    } finally {
      active.abort(new Error("active cancellation"));
      await Promise.all(running);
      put.mockRestore();
    }
    for (const id of ids) {
      const [row] = await db.select().from(snapshots).where(eq(snapshots.companyId, id!));
      expect(row!.storage).toBeNull();
      expect(row!.upload).not.toBeNull();
    }
    expect(await store.prepare(await company(), files)).toEqual(expect.any(String));
  });

  it("migrates both legacy payload locations in bounded resumable pages without changing version IDs", async () => {
    const companyId = await company();
    const [snapshot] = await db.insert(snapshots).values({ companyId, contentHash: skillSnapshotHash(files), fileInventory: files }).returning();
    const [skill] = await db.insert(companySkills).values({ companyId, key: "legacy", slug: "legacy", name: "Legacy", markdown: files[0]!.content }).returning();
    const original = { path: "SKILL.md", kind: "skill" as const, content: files[0]!.content };
    const [version] = await db.insert(companySkillVersions).values({ companyId, companySkillId: skill!.id, revisionNumber: 7,
      repositorySnapshotId: snapshot!.id, repositorySkillPath: files[0]!.path, fileInventory: [original] }).returning();
    const maintenance = skillPackageMaintenance(db, storage);
    expect((await maintenance.migrateSnapshots({ companyId })).migrated).toBe(0);
    const fail = vi.spyOn(storage, "getObject").mockRejectedValueOnce(new Error("verification interrupted"));
    await expect(maintenance.migrateSnapshots({ companyId, apply: true })).rejects.toThrow("verification interrupted");
    fail.mockRestore();
    const [pending] = await db.select().from(snapshots).where(eq(snapshots.id, snapshot!.id));
    expect(pending!.fileInventory).toEqual(files);
    await db.update(snapshots).set({ upload: { ...pending!.upload!, expiresAt: new Date(0).toISOString() } }).where(eq(snapshots.id, snapshot!.id));
    expect((await maintenance.migrateSnapshots({ companyId, limit: 1, apply: true })).migrated).toBe(1);
    const [soaked] = await db.select().from(snapshots).where(eq(snapshots.id, snapshot!.id));
    expect(soaked!.storage).not.toBeNull();
    expect(soaked!.fileInventory).toEqual(files);
    expect((await maintenance.migrateSnapshots({ companyId, limit: 1, apply: true, clearLegacy: true })).migrated).toBe(1);
    expect((await maintenance.migrateSnapshots({ companyId, apply: true })).inspected).toBe(0);
    expect((await maintenance.migrateVersions({ companyId, apply: true, clearLegacy: true })).migrated).toBe(1);
    const [saved] = await db.select().from(companySkillVersions).where(and(eq(companySkillVersions.id, version!.id), eq(companySkillVersions.companyId, companyId)));
    expect(saved).toMatchObject({ id: version!.id, revisionNumber: 7, fileInventory: [], repositorySnapshotId: snapshot!.id, packageSnapshotId: snapshot!.id });
    expect(await skillPackageStore(db, storage).versionFiles(saved!)).toEqual([original]);
  });

  it.each([false, true])("restores across legacy payload clearing with a cached manifest: %s", async cachedManifest => {
    const companyId = await company();
    const [snapshot] = await db.insert(snapshots).values({ companyId, contentHash: skillSnapshotHash(files), fileInventory: files }).returning();
    const store = skillPackageStore(db, storage);
    await withSkillPackageReadScope(db, async () => {
      expect((await store.descriptor(companyId, snapshot!.id)).storage).toBeNull();
      if (cachedManifest) await store.manifest(companyId, snapshot!.id);
      await store.prepare(companyId, files, true);
      await db.update(snapshots).set({ fileInventory: [] }).where(eq(snapshots.id, snapshot!.id));
      expect(skillSnapshotHash(await store.files(companyId, snapshot!.id))).toBe(skillSnapshotHash(files));
      expect(await store.verifyDurable(companyId, snapshot!.id)).toBe(true);
    });
  });

  it("bounds and validates archives, binaries, paths, executable modes, and corruption", async () => {
    const root = await fs.mkdtemp(path.join(home, "codec-"));
    const archive = path.join(root, "files.tar.gz");
    const manifest = skillPackageManifest(files);
    await writeSkillPackageArchive(archive, files);
    const output = path.join(root, "out");
    await fs.mkdir(output);
    await extractSkillPackageArchive(archive, output, manifest);
    expect(await verifySkillPackageDirectory(output, manifest.files)).toBe(true);
    expect((await fs.stat(path.join(output, "shared/run.sh"))).mode & 0o111).toBe(0o111);
    expect(() => validateSkillPackageManifest({ ...manifest, files: [{ ...manifest.files[0], path: "../escape" }] })).toThrow();
    expect(() => validateSkillPackageManifest({ ...manifest, files: [manifest.files[0], manifest.files[0]] })).toThrow();
    expect(() => validateSkillPackageManifest({ ...manifest, totalBytes: 1 })).toThrow();
    const bad = path.join(root, "bad");
    await fs.mkdir(bad);
    await fs.truncate(archive, 20);
    await expect(extractSkillPackageArchive(archive, bad, manifest)).rejects.toThrow();
  });
});
