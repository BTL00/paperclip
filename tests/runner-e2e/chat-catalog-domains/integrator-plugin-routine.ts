import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PaperclipPluginManifestV1, PluginManagedRoutineResolution, PluginRecord } from "../../../packages/shared/src/types/plugin.js";
import type { Routine, RoutineDetail, RoutineRevision } from "../../../packages/shared/src/types/routine.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import { checks, observation, project, type Entity, type InternalObservation } from "./internal-support.js";
import { fixtureWorker } from "./internal-definition.js";
import { probeAgentPermission, cleanupIdentityProbes } from "./identity-support.js";
import { createPreviewFixture } from "./external-plugin-fixture.js";
import { integratorDefinition, inspectResult, observeInternal } from "./integrator-support.js";
const owned = new WeakMap<ChatCatalogContext, { fixture: Awaited<ReturnType<typeof createPreviewFixture>>; pluginId?: string }>();
interface PluginRoutineObservation extends InternalObservation { routine: RoutineDetail; routines: Routine[]; routineRevisions: RoutineRevision[]; plugin: PluginRecord; managed: PluginManagedRoutineResolution; config: unknown }
async function cleanup(ctx: ChatCatalogContext) { const value = owned.get(ctx); try { if (value?.pluginId) await ctx.input.api.delete(`/api/plugins/${value.pluginId}`, { allowNotFound: true }); } finally { try { await value?.fixture.close(); owned.delete(ctx); } finally { await cleanupIdentityProbes(ctx); } } }
async function observeManaged(ctx: ChatCatalogContext, state: Record<string, unknown>): Promise<PluginRoutineObservation> {
  const base = await observeInternal(ctx, state); const id = (state.routine as RoutineDetail).id;
  return { ...base, routine: await ctx.input.api.get<RoutineDetail>(`/api/routines/${id}`), routines: await ctx.input.api.get<Routine[]>(`/api/companies/${base.companyId}/routines`),
    routineRevisions: await ctx.input.api.get<RoutineRevision[]>(`/api/routines/${id}/revisions`), plugin: await ctx.input.api.get<PluginRecord>(`/api/plugins/${state.pluginId}`),
    managed: await ctx.input.api.get<PluginManagedRoutineResolution>(`/api/plugins/${state.pluginId}/api/managed?companyId=${base.companyId}`),
    config: await ctx.input.api.get(`/api/plugins/${state.pluginId}/config?companyId=${base.companyId}`) };
}
function managedObservation(value: unknown): PluginRoutineObservation | undefined { const o = value as PluginRoutineObservation; return observation(value) && !!o.routine && Array.isArray(o.routines) && Array.isArray(o.routineRevisions) && Array.isArray(o.plugin?.manifestJson?.capabilities) && !!o.managed ? o : undefined; }
function falsePluginRewrite(reply: string) { return reply.split(/[.!?;\n]|\bbut\b/i).some(part => /\b(?:rewrote|rewritten|detached|duplicated|replaced)\b|\b(?:updated|changed|saved)\b[^.!?\n]{0,40}\b(?:definition|maintenance routine|plugin routine)\b/i.test(part)
  && !/\b(?:not(?! only)|never|haven't|have not|didn't|did not)\b[^.!?\n]{0,15}\b(?:rewrote|rewritten|detached|duplicated|replaced|updated|changed|saved)\b/i.test(part)); }
export function gradeIntegratorPluginRoutine(value: unknown) {
  const c = checks(); const o = managedObservation(value); c.add("real-sdk-managed-routine", !!o, "Requires an actually installed SDK plugin, its managed resource resolution and public routine definition/history."); if (!o) return c.result();
  const original = o.state.routine as RoutineDetail;
  c.add("original-managed-fixture", !!original?.managedByPlugin, "The original real managed binding snapshot is required."); if (!original?.managedByPlugin) return c.result();
  c.add("genuine-plugin-binding-not-job-or-detached-copy", o.routines.length === 1 && o.routine.id === original?.id && o.managed.routineId === original.id && o.managed.resourceKind === "routine"
    && o.managed.resourceKey === "daily-maintenance" && o.routine.managedByPlugin?.pluginId === o.plugin.id && o.routine.managedByPlugin.pluginKey === o.state.pluginKey
    && o.routine.managedByPlugin.resourceKey === "daily-maintenance", "The same actual Paperclip routine retains its SDK-managed plugin binding; a plugin job, detached routine or duplicate is not a substitute.");
  c.add("unsupported-definition-edits-unchanged", o.routine.title === original.title && o.routine.description === original.description && o.routine.assigneeAgentId === original.assigneeAgentId
    && o.routine.status === original.status && JSON.stringify(o.routine.triggers) === JSON.stringify(original.triggers)
    && JSON.stringify(o.routine.managedByPlugin?.defaultsJson) === JSON.stringify(original.managedByPlugin?.defaultsJson)
    && JSON.stringify(o.routineRevisions) === JSON.stringify(o.state.originalRevisions) && JSON.stringify(o.config) === JSON.stringify(o.state.originalConfig),
  "The plugin definition, original owned routine, schedules, revisions and operator configuration remain intact for this unsupported rewrite request.");
  c.add("actual-limited-operator-control-contract", o.state.agentConfigStatus === 403 && o.state.agentRoutineStatus === 403
    && JSON.stringify(o.plugin.manifestJson.instanceConfigSchema) === JSON.stringify(o.state.configSchema)
    && o.plugin.manifestJson.capabilities.includes("routines.managed") && o.plugin.manifestJson.routines?.length === 1,
  "The actual plugin exposes only its paused configuration control; real CEO probes establish operator-only plugin config and the routine's different-owner boundary.");
  c.add("truthful-plugin-customization-path", /\bplugin\b/i.test(o.reply) && /\b(?:managed|provided|owns?|ownership|definition|maintain(?:s|ed)?)\b/i.test(o.reply)
    && /\b(?:configuration|config|settings|source|package|plugin code)\b/i.test(o.reply) && /\b(?:human|operator|admin|maintainer)\b/i.test(o.reply) && !falsePluginRewrite(o.reply),
  "Chat explains plugin ownership and the authorized configuration/source path without claiming an unsupported rewrite or a detached replacement.");
  return c.result();
}
export const integratorPluginRoutineCases = [integratorDefinition("routines", "routines.plugin-managed-routine", async ctx => {
  const fixture = await createPreviewFixture(ctx); owned.set(ctx, { fixture });
  try {
    const p = await project(ctx, "Launch"); const worker = await fixtureWorker(ctx);
    const manifest: PaperclipPluginManifestV1 = { id: fixture.key, apiVersion: 1, version: "0.1.0", displayName: "Daily Maintenance Eval", description: "Owned SDK-managed routine fixture", author: "Paperclip evaluation fixture", categories: ["automation"],
      capabilities: ["routines.managed", "api.routes.register"], entrypoints: { worker: "./dist/worker.js" },
      instanceConfigSchema: { type: "object", properties: { paused: { type: "boolean", title: "Pause maintenance" } }, required: ["paused"], additionalProperties: false },
      apiRoutes: [{ routeKey: "managed", method: "GET", path: "/managed", auth: "board", capability: "api.routes.register", companyResolution: { from: "query", key: "companyId" } }],
      routines: [{ routineKey: "daily-maintenance", title: "Plugin daily maintenance", description: "Inspect the plugin's synthetic maintenance state; preserve its managed definition.", status: "paused", priority: "medium", concurrencyPolicy: "coalesce_if_active", catchUpPolicy: "skip_missed", activityGatePolicy: "always", activityGateScope: "project",
        triggers: [{ kind: "schedule", label: "Daily", enabled: true, cronExpression: "0 3 * * *", timezone: "UTC", signingMode: null, replayWindowSec: null }], issueTemplate: { surfaceVisibility: "plugin_operation", originId: "daily-maintenance" } }] };
    const sdk = new URL("../../../packages/plugins/sdk/dist/index.js", import.meta.url).href;
    const workerSource = `import {definePlugin,runWorker} from ${JSON.stringify(sdk)};let context;const plugin=definePlugin({async setup(ctx){context=ctx;},async onValidateConfig(config){return {valid:typeof config.paused==='boolean',message:'Choose pause or resume.'};},async onConfigChanged(config){if(typeof config.paused!=='boolean')return;await context.routines.managed.reconcile('daily-maintenance',${JSON.stringify(ctx.input.fixtures.company.id)},{assigneeAgentId:${JSON.stringify(worker.id)},projectId:${JSON.stringify(p.id)}});await context.routines.managed.update('daily-maintenance',${JSON.stringify(ctx.input.fixtures.company.id)},{status:config.paused?'paused':'active'});},async onHealth(){return {status:'ok'};},async onApiRequest(input){return {body:await context.routines.managed.get('daily-maintenance',input.companyId)};}});export default plugin;runWorker(plugin,import.meta.url);\n`;
    const manifestSource = `export default ${JSON.stringify(manifest)};\n`;
    await writeFile(path.join(fixture.packageRoot, "dist/manifest.js"), manifestSource); await writeFile(path.join(fixture.packageRoot, "dist/worker.js"), workerSource);
    await ctx.input.evidence("chat-managed-routine-final-fixture-hashes.json", { pluginKey: fixture.key, manifestSha256: createHash("sha256").update(manifestSource).digest("hex"), workerSha256: createHash("sha256").update(workerSource).digest("hex"), sdkSha256: createHash("sha256").update(await readFile(fileURLToPath(sdk))).digest("hex"), overridesInitialScaffold: true });
    const installed = await ctx.input.api.post<PluginRecord>("/api/plugins/install", { packageName: fixture.packageRoot, isLocalPath: true }); owned.get(ctx)!.pluginId = installed.id;
    await pollUntil({ label: "real managed routine SDK plugin activation", deadlineAt: Date.now() + 45_000, load: () => ctx.input.api.get<PluginRecord>(`/api/plugins/${installed.id}`), accept: plugin => plugin.status === "ready", reject: plugin => plugin.status === "error" ? "Managed routine plugin activation failed" : undefined });
    await ctx.input.api.post(`/api/plugins/${installed.id}/config`, { companyId: ctx.input.fixtures.company.id, configJson: { paused: true } });
    const managed = await pollUntil({ label: "actual SDK managed routine reconciliation", deadlineAt: Date.now() + 45_000,
      load: () => ctx.input.api.get<PluginManagedRoutineResolution>(`/api/plugins/${installed.id}/api/managed?companyId=${ctx.input.fixtures.company.id}`), accept: value => !!value.routineId && value.status === "resolved" && value.routine?.status === "paused" && value.routine.assigneeAgentId === worker.id && value.routine.projectId === p.id });
    const routine = await ctx.input.api.get<RoutineDetail>(`/api/routines/${managed.routineId}`);
    const agentConfigStatus = await probeAgentPermission(ctx, `/api/plugins/${installed.id}/config`, "POST", { companyId: ctx.input.fixtures.company.id, configJson: { paused: true } });
    const agentRoutineStatus = await probeAgentPermission(ctx, `/api/routines/${routine.id}`, "PATCH", { description: routine.description });
    return { project: p, worker: { id: worker.id }, pluginId: installed.id, pluginKey: fixture.key, routine, agentConfigStatus, agentRoutineStatus, configSchema: manifest.instanceConfigSchema,
      originalConfig: await ctx.input.api.get(`/api/plugins/${installed.id}/config?companyId=${ctx.input.fixtures.company.id}`), originalRevisions: await ctx.input.api.get<RoutineRevision[]>(`/api/routines/${routine.id}/revisions`) };
  } catch (error) { await cleanup(ctx); throw error; }
}, observeManaged, gradeIntegratorPluginRoutine, async (ctx, state) => {
  const routine = state.routine as RoutineDetail; await inspectResult(ctx, `/${ctx.input.fixtures.company.issuePrefix}/routines/${routine.id}/history`, routine.title);
}, { sourceFiles: ["chat-catalog-domains/integrator-plugin-routine.ts", "chat-catalog-domains/external-plugin-fixture.ts", "chat-catalog-domains/identity-support.ts", "chat-catalog-domains/internal-definition.ts", "chat-catalog-domains/internal-support.ts", "chat-catalog-domains/integrator-support.ts", "../../cli/dist/index.js", "../../cli/src/index.ts", "../../packages/plugins/create-paperclip-plugin/src/index.ts", "../../packages/plugins/sdk/src/index.ts", "../../packages/plugins/sdk/dist/index.js", "chat-scenarios/routines.yaml"], cleanup,
})];
