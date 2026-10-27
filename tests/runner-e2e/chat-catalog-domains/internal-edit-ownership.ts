import type { ChatCatalogCase } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import { fixtureWorker } from "./internal-definition.js";
import { startRunBriefGate } from "./internal-run-brief.js";
import { checks, entity, hasLink, observation, observeInternal, sameTask, type Entity, type InternalObservation } from "./internal-support.js";
interface OwnedTask extends Entity { executionRunId?: string | null; checkoutRunId?: string | null }
interface EditOwnership extends InternalObservation { currentTask: OwnedTask; phaseReply: string }
export function gradeEditOwnership(value: unknown, initialGrade: ChatCatalogCase["grade"]) {
  const c = checks(); const o = observation(value) as EditOwnership | undefined;
  c.add("both-edit-boundary-contexts", !!o && !!o.currentTask && typeof o.phaseReply === "string" && !!o.state.firstEdit, "The initial permitted edit and actual later ownership-denied context must both be independently observed."); if (!o || !o.currentTask || typeof o.phaseReply !== "string") return c.result();
  const first = observation(o.state.firstEdit); c.add("permitted-primary-edits-fully-validated", !!first && initialGrade(first).passed, "The first canonical request really saves the intended High priority and Morgan assignment before the separately established denial context.");
  const held = o.state.heldTask as OwnedTask | undefined; const riley = o.state.riley as Entity | undefined; const run = o.state.heldRun as Entity | undefined;
  const workers = o.runs.filter(row => row.agentId !== o.leadId);
  c.add("actual-riley-ownership-not-stolen", !!held && !!riley && !!run && held.assigneeAgentId === riley.id && held.executionRunId === run.id
    && sameTask(held, o.currentTask, ["priority"]) && o.currentTask.executionRunId === run.id && o.currentTask.checkoutRunId === held.checkoutRunId
    && workers.length === 1 && workers[0]?.agentId === riley.id && workers[0]?.id === run.id && workers[0]?.status === "running"
    && Array.isArray(o.state.gateCalls) && (o.state.gateCalls as Array<{ authorized?: boolean }>).some(row => row.authorized),
    "Riley's actual running checkout remains the sole admitted execution; Morgan is not started and ownership is not overwritten.");
  const denial = /\b(?:cannot|can't|couldn't|unable|denied|blocked|pending|wait|until|not (?:yet )?assigned)\b/i.test(o.phaseReply);
  const falseAssign = o.phaseReply.split(/[.\n;]|,\s*(?:but|and)\s*/).some(part => /\b(?:assigned|reassigned|moved)\b[^.\n]*\b(?:to )?Morgan\b|\bMorgan\b[^.\n]*(?:has started|is (?:running|working)|now owns)/i.test(part)
    && !/\b(?:cannot|can't|couldn't|not|pending|denied|until|would|could)\b/i.test(part));
  c.add("final-phase-assignment-boundary-explained", denial && /\bRiley\b/.test(o.phaseReply) && /\b(?:checkout|execution|running|ownership|in.progress)\b/i.test(o.phaseReply) && !falseAssign,
    "The repeated canonical request identifies the newly observed Riley execution and truthfully separates denied reassignment from accepted work.");
  const firstRunIds = new Set(first?.runs.map(run => run.id) ?? []); const finalRunIds = new Set(o.runs.filter(run => run.agentId === o.leadId && !firstRunIds.has(run.id)).map(run => run.id));
  const prioritySaved = o.currentTask.priority === "high";
  const claimsSavedPriority = o.phaseReply.split(/[.\n;]|,\s*but\s*/).some(part => /\b(?:set|saved|updated|changed|now)\b[^.\n]*\bhigh\b|\bhigh\b[^.\n]*\b(?:saved|set|updated)\b/i.test(part)
    && !/\b(?:not|cannot|can't|couldn't|denied|pending)\b/i.test(part));
  c.add("actual-priority-outcome-distinguished", /\bpriority\b/i.test(o.phaseReply) && (prioritySaved ? claimsSavedPriority
    && o.activity.some(row => row.action === "issue.updated" && row.entityId === o.currentTask.id && row.agentId === o.leadId && row.details?.priority === "high" && finalRunIds.has((row as Entity & { runId?: string }).runId ?? ""))
    : o.currentTask.priority === held?.priority && denial && !claimsSavedPriority),
    "If priority was independently saved it is proven and reported; if the ownership boundary denied it too, chat cannot claim that save.");
  c.add("same-task-no-workaround", o.tasks.length === 1 && o.tasks[0]?.id === o.currentTask.id && hasLink(o, "issues", o.currentTask), "The conditional refusal does not create a duplicate task or lose the actual source link.");
  return c.result();
}
export function withEditOwnership(primary: ChatCatalogCase): ChatCatalogCase {
  let gate: Awaited<ReturnType<typeof startRunBriefGate>> | undefined;
  return { ...primary, coverageGaps: [], expectedRunCount: 3, minimumRunCount: 3, expectedHumanMessageCount: 2, attemptTimeoutMs: 600000,
    runPolicy: { kind: "source-settled-with-active-work", maximumActiveWorkerRuns: 1 },
    sourceFiles: [...primary.sourceFiles, "chat-catalog-domains/internal-edit-ownership.ts", "chat-catalog-domains/internal-run-brief.ts", "../e2e/fetch-allowed-port.ts"],
    async setup(ctx) { const state = await primary.setup(ctx); const riley = await fixtureWorker(ctx); await ctx.input.api.patch(`/api/agents/${riley.id}`, { name: "Riley" }); return { ...state, riley }; },
    grade: value => gradeEditOwnership(value, primary.grade),
    async act(ctx, state) {
      const first = await pollUntil({ label: "Fully validated initial permitted property edit", deadlineAt: Date.now() + 150000,
        load: () => observeInternal(ctx, state), accept: o => o.runs.length === 1 && o.runs[0]?.status === "succeeded" && ctx.issue()?.conversationState === "waiting" && primary.grade(o).passed });
      state.firstEdit = { ...first, state: structuredClone(state) }; const riley = entity(state, "riley"); const t = entity(state, "task");
      await ctx.input.api.post(`/api/companies/${ctx.input.fixtures.company.id}/budgets/policies`, { scopeType: "agent", scopeId: riley.id, amount: 500, hardStopEnabled: true, isActive: true, unpricedUsagePolicy: "allow" });
      gate = await startRunBriefGate(ctx, riley.id);
      try {
        await ctx.input.api.patch(`/api/issues/${t.id}`, { assigneeAgentId: riley.id, priority: "medium", status: "todo",
          description: "Read the Website Brief app's read_website_brief tool before doing any implementation. Its actual source may still be pending; wait for that result rather than inventing its contents." });
        const held = await pollUntil({ label: "Actual later Riley checkout for the ownership-denied variant", deadlineAt: Date.now() + 150000,
          load: async () => ({ task: await ctx.input.api.get<OwnedTask>(`/api/issues/${t.id}`), runs: await ctx.allRuns() }),
          accept: value => gate!.calls.length > 0 && value.runs.length === 2 && value.runs.some(run => run.agentId === riley.id && run.status === "running" && run.id === value.task.executionRunId),
          reject: value => value.runs.some(run => run.agentId === riley.id && ["failed", "cancelled", "succeeded", "timed_out"].includes(run.status)) ? "The conditional real checkout ended before the denial request" : undefined });
        state.heldTask = held.task; state.heldRun = held.runs.find(run => run.agentId === riley.id); state.gateCalls = structuredClone(gate.calls);
        await ctx.input.evidence("chat-catalog-edit-properties-boundary-variant.json", { firstEdit: state.firstEdit, heldTask: state.heldTask, heldRun: state.heldRun, gateCalls: state.gateCalls });
        const { sendChatMessage } = await import("../chat-flow.js"); await sendChatMessage(ctx.input.page, ctx.scenario.query);
      } catch (error) { await gate.close(); gate = undefined; throw error; }
    },
    async observe(ctx, state): Promise<EditOwnership> {
      const o = await observeInternal(ctx, state); const first = observation(state.firstEdit); const ids = new Set(first?.runs.map(run => run.id) ?? []);
      const rows = ctx.issue() ? await ctx.input.api.get<Entity[]>(`/api/issues/${ctx.issue()!.id}/comments?order=asc`) : [];
      return { ...o, currentTask: await ctx.input.api.get<OwnedTask>(`/api/issues/${entity(state, "task").id}`), phaseReply: rows.filter(row => row.authorAgentId === o.leadId && !ids.has(row.createdByRunId ?? "") && o.runs.some(run => run.id === row.createdByRunId)).map(row => row.body ?? "").join("\n") };
    },
    async cleanup(ctx, state) { try { await primary.cleanup?.(ctx, state); } finally { await gate?.close(); gate = undefined; } },
  };
}
