import { expect } from "@playwright/test";
import { pollUntil } from "../api.js";
import { checks, sameTask, type Entity } from "./internal-support.js";
import { runtimeDefinition, runtimeWorker, runtimeObservation, observeRuntime } from "./runtime-support.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
interface WorkspaceView { workspace: { id: string; companyId: string; projectId?: string | null; name: string; cwd: string }; repositories: unknown[] }
async function savedTaskWorkspace(ctx: ChatCatalogContext) {
  const { execution, fixtures, workspacePath, nonce, api } = ctx.input;
  const base = execution.profile.buildAgent({ environmentId: fixtures.environment.id, environmentFixtureId: execution.environment.id,
    workspacePath, secretRefs: fixtures.secretRefs, executionId: nonce });
  const { cwd: _cwd, ...taskConfig } = base.adapterConfig as Record<string, unknown>;
  const worker = await runtimeWorker(ctx, "Morgan", { adapterConfig: taskConfig });
  const company = `/api/companies/${fixtures.company.id}`;
  for (const scope of [{ scopeType: "company", scopeId: fixtures.company.id }, { scopeType: "agent", scopeId: worker.id }])
    await api.post(`${company}/budgets/policies`, { ...scope, amount: 500, hardStopEnabled: true, isActive: true, unpricedUsagePolicy: "allow" });
  const marker = `Saved website prerequisite ${nonce}`;
  const task = await api.post<Entity>(`${company}/issues`, { title: "Website task", status: "todo", assigneeAgentId: worker.id,
    description: `Create a local file website-fixture.txt containing exactly ${JSON.stringify(marker)} in your admitted task workspace. Save a brief task document as evidence, then complete this fixture task normally. Do not create a project, repository, another task, or remote side effect.` });
  await pollUntil({ label: "Real projectless website fixture completion", deadlineAt: Date.now() + 180_000,
    load: async () => ({ task: await api.get<Entity>(`/api/issues/${task.id}`), runs: await ctx.allRuns() }),
    accept: value => value.task.status === "done" && value.runs.length === 1 && value.runs.every(run => run.status === "succeeded"),
    reject: value => value.runs.some(run => ["failed", "cancelled", "timed_out"].includes(run.status)) ? "Projectless prerequisite provider run failed" : undefined });
  const view = await api.get<WorkspaceView>(`/api/issues/${task.id}/workspace`);
  const file = await api.get<{ resource?: { workspaceKind?: string }; content?: { data?: string } }>(`/api/issues/${task.id}/file-resources/content?workspace=execution&path=website-fixture.txt`);
  if (view.workspace.projectId || file.resource?.workspaceKind !== "execution_workspace" || file.content?.data?.trim() !== marker)
    throw new Error("Projectless fixture has no actual task-bound saved file");
  return { worker, task: await api.get<Entity>(`/api/issues/${task.id}`), workspaceBefore: view, marker,
    fileBefore: file.content.data, fixtureRunId: (await ctx.allRuns())[0]!.id };
}
export function gradeLocateFiles(value: unknown) {
  const c = checks(); const o = runtimeObservation(value);
  c.add("actual-task-workspace-evidence", !!o, "The actual admitted binding, file bytes and setup run identity are independently required."); if (!o) return c.result();
  const before = o.state.workspaceBefore as WorkspaceView | undefined; const after = o.state.workspaceAfter as WorkspaceView | undefined;
  const task = o.state.task as Entity | undefined;
  c.add("same-projectless-task-binding", !!before?.workspace?.id && !!after && before.workspace.id === after.workspace.id
    && before.workspace.cwd === after.workspace.cwd && after.workspace.companyId === o.companyId && after.workspace.projectId == null
    && !!task && sameTask(task, o.tasks.find(row => row.id === task.id)), "The correct projectless binding persists without reassigning or changing the task.");
  c.add("concrete-authorized-location", !!after && (o.reply.includes(after.workspace.cwd) || o.reply.includes(after.workspace.id)),
    "The answer identifies the actual bound workspace rather than inferring an agent default or project directory.");
  c.add("actual-saved-files-retained", o.state.fileAfter === o.state.fileBefore && typeof o.state.fileBefore === "string"
    && o.state.fileBefore.trim() === o.state.marker && o.runs.some(run => run.id === o.state.fixtureRunId && run.agentId === (o.state.worker as Entity).id
      && run.status === "succeeded"), "A genuine worker created the prerequisite file and it remains unchanged.");
  c.add("actual-workspace-result-link", !!after && o.links.some(href => workspaceLink(o.origin, href, after.workspace.id)),
    "The response renders the real workspace view link.");
  return c.result();
}
function workspaceLink(origin: string, href: string, id: string) {
  try { const url = new URL(href, origin); const parts = url.pathname.split("/").map(decodeURIComponent); const at = parts.indexOf("execution-workspaces");
    return url.origin === new URL(origin).origin && at >= 0 && parts[at + 1] === id; } catch { return false; }
}
export const runtimeWorkspacesCases = [runtimeDefinition("workspaces.locate-files", savedTaskWorkspace, gradeLocateFiles, {
  expectedRunCount: 2, attemptTimeoutMs: 540_000,
  async observe(ctx, state) {
    const id = (state.task as Entity).id;
    state.workspaceAfter = await ctx.input.api.get<WorkspaceView>(`/api/issues/${id}/workspace`);
    const file = await ctx.input.api.get<{ content: { data: string } }>(`/api/issues/${id}/file-resources/content?workspace=execution&path=website-fixture.txt`);
    state.fileAfter = file.content.data;
    return observeRuntime(ctx, state);
  },
  async verifyResult(ctx, state, value) {
    const o = runtimeObservation(value); if (!o) throw new Error("Workspace result missing");
    const view = state.workspaceAfter as WorkspaceView;
    const href = o.links.find(link => workspaceLink(o.origin, link, view.workspace.id)); if (!href) throw new Error("No actual workspace result link");
    const source = ctx.input.page.url();
    await ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(href)}]`).first().click();
    await expect(ctx.input.page.getByRole("heading", { name: view.workspace.name, exact: true }).first()).toBeVisible();
    await ctx.input.evidence("runtime-task-workspace-opened.json", { taskId: (state.task as Entity).id, workspaceId: view.workspace.id, url: ctx.input.page.url() });
    await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" });
  },
})];
