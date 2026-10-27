import type { BudgetOverview } from "../../../packages/shared/src/types/budget.js";
import type { ChatRun } from "../chat-flow.js";
import type { RoutineDetail, RoutineRunSummary } from "../../../packages/shared/src/types/routine.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import { checks, hasLink, observation, project, type Entity, type InternalObservation } from "./internal-support.js";
import { fixtureWorker } from "./internal-definition.js";
import { unavailableNativeModelFailure, admittedModelFailure } from "./runtime-native-failure.js";
import type { RuntimeAgent } from "./runtime-support.js";
import { groundedStatement, integratorDefinition, inspectResult, observeInternal } from "./integrator-support.js";
interface HistoryObservation extends InternalObservation { routine: RoutineDetail; executions: RoutineRunSummary[] }
const root = (ctx: ChatCatalogContext) => `/api/companies/${ctx.input.fixtures.company.id}`;
async function observeHistory(ctx: ChatCatalogContext, state: Record<string, unknown>): Promise<HistoryObservation> {
  const base = await observeInternal(ctx, state); const routine = state.routine as RoutineDetail;
  return { ...base, routine: await ctx.input.api.get<RoutineDetail>(`/api/routines/${routine.id}`), executions: await ctx.input.api.get<RoutineRunSummary[]>(`/api/routines/${routine.id}/runs`) };
}
function historyObservation(value: unknown): HistoryObservation | undefined {
  const o = value as HistoryObservation;
  return observation(value) && !!o.routine && Array.isArray(o.executions) ? o : undefined;
}
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function gradeIntegratorRoutineHistory(value: unknown) {
  const c = checks(); const o = historyObservation(value);
  c.add("actual-routine-and-native-execution-history", !!o, "Requires real public invocation history plus distinct actual native failure and successful execution receipts.");
  if (!o) return c.result();
  const failedTask = o.tasks.find(task => task.id === o.state.failedIssueId); const completedTask = o.tasks.find(task => task.id === o.state.completedIssueId);
  const failedInvocation = o.executions.find(run => run.id === o.state.failedInvocationId); const completedInvocation = o.executions.find(run => run.id === o.state.completedInvocationId);
  const failed = o.runs.find(run => run.id === (o.state.failedRun as { id?: string } | undefined)?.id);
  const failureEvidence = o.state.failedRun as Parameters<typeof admittedModelFailure>[0]["run"];
  c.add("genuine-task-bound-native-failure", !!failedTask && failed?.status === "failed" && failed.runtimeMode === "native" && !!failedInvocation && failedInvocation.linkedIssueId === failedTask.id
    && admittedModelFailure({ run: failureEvidence, events: o.state.failedEvents as Parameters<typeof admittedModelFailure>[0]["events"] ?? [], companyId: o.companyId, agentId: (o.state.worker as Entity | undefined)?.id ?? "", issueId: failedTask.id, model: String(o.state.failedModel) }), "The failure is a genuinely admitted task-bound unavailable-model native execution, never a rejected HTTP request or a patched/cancelled status.");
  c.add("separate-real-successful-invocation", !!completedTask && completedTask.status === "done" && completedInvocation?.status === "completed" && completedInvocation.linkedIssueId === completedTask.id
    && completedTask.id !== failedTask?.id && o.runs.some(run => run.id === o.state.completedNativeRunId && run.status === "succeeded" && run.runtimeMode === "native" && run.contextSnapshot?.issueId === completedTask.id), "A second independently invoked routine actually completed its normal task under a successful native run.");
  const start = Number(o.state.weekStart), end = Number(o.state.weekEnd);
  c.add("requested-week-and-exact-history-retained", [failedInvocation, completedInvocation].every(run => !!run && Date.parse(String(run.triggeredAt)) >= start && Date.parse(String(run.triggeredAt)) < end)
    && o.executions.length === 2 && failedInvocation?.source === "manual" && completedInvocation?.source === "manual", "Both actual manual invocations fall inside the measured current week, with no hidden or duplicate history rows.");
  c.add("actual-failure-and-completion-linked", !!failedTask && !!completedTask && hasLink(o, "issues", failedTask) && hasLink(o, "issues", completedTask), "The answer links both real execution tasks.");
  c.add("failed-native-not-inferred-routine-completion", !!failedTask?.identifier && !!completedTask?.identifier
    && groundedStatement(o.reply, new RegExp(escaped(failedTask.identifier), "i"), /\b(?:failed|failure|unsuccessful)\b/i, new RegExp(`${escaped(failedTask.identifier)}[^\n.!?]{0,60}\\b(?:succeeded|successfully completed)\\b`, "i"))
    && groundedStatement(o.reply, new RegExp(escaped(completedTask.identifier), "i"), /\b(?:completed|succeeded|successful)\b/i, /\ball (?:runs|executions) (?:succeeded|completed successfully)\b/i)
    && !o.reply.split(/(?<=[.!?])\s+|\n+/).some(sentence => /\b(?:scheduled|scheduler|automatically|automatic|on schedule)\b/i.test(sentence)
      && /\b(?:ran|executed|succeeded|completed|delivered|successful)\b/i.test(sentence)
      && !/\b(?:no|not|cannot|can't|unconfirmed|unverified|unknown|missing)\b/i.test(sentence)), "The response preserves which actual native execution failed and which invocation completed without inferring unsupported scheduled success. A truthful concise account of the actual manual runs needs no unprompted schedule-denial sentence.");
  return c.result();
}
/** Terminal native failure alone does not release budget accounting admission. */
export function routineHistoryAccountingReady(expected: { companyId: string; agentId: string; issueId: string; runId: string }, runs: ChatRun[], overview: BudgetOverview) {
  const run = runs[0];
  if (runs.length !== 1 || !run || run.id !== expected.runId || run.companyId !== expected.companyId || run.agentId !== expected.agentId
    || run.contextSnapshot?.issueId !== expected.issueId || run.status !== "failed" || run.runtimeMode !== "native" || overview.companyId !== expected.companyId) return false;
  const policies = overview.policies.filter(p => p.isActive && (p.scopeType === "company" && p.scopeId === expected.companyId || p.scopeType === "agent" && p.scopeId === expected.agentId));
  return ["company", "agent"].every(scope => policies.some(p => p.scopeType === scope)) && policies.every(p => p.companyId === expected.companyId
    && p.hardStopEnabled && p.amount > 0 && p.unpricedUsagePolicy === "allow" && p.pendingRunCount === 0 && !p.paused && p.status !== "hard_stop" && p.remainingAmount > 0);
}
export const integratorRoutineHistoryCases = [integratorDefinition("routines", "routines.read-history", async ctx => {
  const p = await project(ctx, "Launch", { description: "Synthetic Launch project: payment approval remains pending; no other active work." }); const worker = await fixtureWorker(ctx);
  for (const scope of [{ scopeType: "company", scopeId: ctx.input.fixtures.company.id }, { scopeType: "agent", scopeId: worker.id }]) await ctx.input.api.post(`${root(ctx)}/budgets/policies`, { ...scope, amount: 500, hardStopEnabled: true, isActive: true, unpricedUsagePolicy: "allow" });
  const routine = await ctx.input.api.post<RoutineDetail>(`${root(ctx)}/routines`, { title: "Morning Launch summary", projectId: p.id, assigneeAgentId: worker.id, concurrencyPolicy: "always_enqueue", description: "Summarize the actual Launch project in a short saved task comment, link the project, and mark this summary task done. Do not edit project work or create follow-up tasks." });
  let failedInvocation: RoutineRunSummary | undefined;
  const failure = await unavailableNativeModelFailure(ctx, worker as RuntimeAgent, async () => {
    failedInvocation = await ctx.input.api.post<RoutineRunSummary>(`/api/routines/${routine.id}/run`, { source: "manual", idempotencyKey: `failed-history-${ctx.input.nonce}` });
    if (!failedInvocation.linkedIssueId) throw new Error("Routine failure prerequisite did not admit an actual execution task");
    return { issueId: failedInvocation.linkedIssueId };
  });
  const accountingIdentity = { companyId: ctx.input.fixtures.company.id, agentId: worker.id, issueId: failure.failedIssueId, runId: failure.failedRun.id };
  const accounting = await pollUntil({ label: "genuine failed routine prerequisite final accounting before separate success invocation", deadlineAt: Date.now() + 60_000, intervalMs: 1000,
    load: async () => ({ runs: await ctx.allRuns(), overview: await ctx.input.api.get<BudgetOverview>(`${root(ctx)}/budgets/overview`) }),
    accept: value => routineHistoryAccountingReady(accountingIdentity, value.runs, value.overview) });
  await ctx.input.evidence("chat-routine-history-prerequisite-accounting.json", { expected: accountingIdentity, ...accounting });
  const completedInvocation = await ctx.input.api.post<RoutineRunSummary>(`/api/routines/${routine.id}/run`, { source: "manual", idempotencyKey: `success-history-${ctx.input.nonce}` });
  if (!completedInvocation.linkedIssueId) throw new Error("Successful routine prerequisite did not create a real execution task");
  const success = await pollUntil({ label: "actual successful routine history", deadlineAt: Date.now() + 180_000, intervalMs: 1000,
    load: async () => ({ runs: await ctx.allRuns(), history: await ctx.input.api.get<RoutineRunSummary[]>(`/api/routines/${routine.id}/runs`) }),
    accept: value => value.runs.length === 2 && value.runs.some(run => run.status === "succeeded" && run.contextSnapshot?.issueId === completedInvocation.linkedIssueId)
      && value.history.some(run => run.id === completedInvocation.id && run.status === "completed"),
    reject: value => value.runs.length > 2 ? "Routine history fixture exceeded its two declared real native invocations" : undefined });
  const weekStart = new Date(); weekStart.setUTCHours(0, 0, 0, 0); weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
  return { project: p, worker: { id: worker.id }, routine, failedInvocationId: failedInvocation!.id, completedInvocationId: completedInvocation.id, failedIssueId: failure.failedIssueId, completedIssueId: completedInvocation.linkedIssueId,
    failedModel: failure.failedModel, failedRun: { ...failure.failedRun, runnerProfileJson: { nativeExecutionInput: { provider: failure.failedRun.runnerProfileJson?.nativeExecutionInput?.provider } } },
    failedEvents: failure.failedRunEvents.map(event => ({ seq: event.seq, eventType: event.eventType, payload: { prpEvent: { eventType: event.payload?.prpEvent?.eventType } } })),
    completedNativeRunId: success.runs.find(run => run.contextSnapshot?.issueId === completedInvocation.linkedIssueId)?.id,
    weekStart: weekStart.getTime(), weekEnd: weekStart.getTime() + 7 * 86400_000 };
}, observeHistory, gradeIntegratorRoutineHistory, async (ctx, state) => {
  const routine = state.routine as RoutineDetail;
  await inspectResult(ctx, `/${ctx.input.fixtures.company.issuePrefix}/routines/${routine.id}/history`, routine.title);
}, { sourceFiles: ["chat-catalog-domains/integrator-routine-history.ts", "chat-catalog-domains/runtime-native-failure.ts", "chat-catalog-domains/internal-definition.ts", "chat-catalog-domains/internal-support.ts", "chat-catalog-domains/integrator-support.ts", "chat-scenarios/routines.yaml"],
  expectedRunCount: 3, runPolicy: { kind: "terminal-counts", terminalStatusCounts: { failed: 1, succeeded: 2 } }, attemptTimeoutMs: 720_000,
})];
