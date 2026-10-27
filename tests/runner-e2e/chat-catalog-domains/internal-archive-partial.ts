import { expect } from "@playwright/test";
import type { ChatCatalogCase, ChatCatalogContext } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import { makeDefinition } from "./internal-definition.js";
import type { ArchiveTransportReceipt } from "./internal-archive-transport.js";
import { checks, entity, observation, observeInternal, project, sameTask, task, type Entity, type InternalObservation } from "./internal-support.js";
interface Item extends Entity { archivedByActorType?: string; archivedByAgentId?: string; archivedByRunId?: string }
interface PartialArchive extends InternalObservation { ownerItems: Item[]; transport: ArchiveTransportReceipt[]; phaseReply: string }
/** Optional private launcher handle: no environment/JSON credential or fake response fallback. */
function transport(ctx: ChatCatalogContext) { return ctx.input.archiveFaultTransport; }
function firstIsValid(o: PartialArchive) {
  const originals = o.state.originalTasks as Entity[]; const forwarded = o.transport.filter(row => row.phase === "initial" && row.forwarded && row.status === 200); const dropped = o.transport.filter(row => row.phase === "initial" && !row.forwarded);
  const archived = o.ownerItems.filter(row => originals.some(old => old.id === row.id) && !!row.archivedAt);
  const failed = originals.find(row => dropped.some(receipt => receipt.taskId === row.id));
  return originals.length === 3 && forwarded.length === 2 && new Set(forwarded.map(row => row.taskId)).size === 2 && dropped.length > 0 && new Set(dropped.map(row => row.taskId)).size === 1
    && dropped.every(row => row.sequence > Math.max(...forwarded.map(ok => ok.sequence))) && !!failed && archived.length === 2 && !archived.some(row => row.id === failed.id)
    && o.transport.every(receipt => o.runs.some(run => run.id === receipt.runId && run.agentId === o.leadId) && (!receipt.explicitUserId || receipt.explicitUserId === o.state.personId))
    && archived.every(row => forwarded.some(receipt => receipt.taskId === row.id) && row.archivedByAgentId === o.leadId && row.archivedByActorType === "agent"
      && o.runs.some(run => run.id === row.archivedByRunId && run.agentId === o.leadId && run.status === "succeeded"))
    && o.activity.filter(row => row.action === "issue.inbox_archived" && row.agentId === o.leadId).length === 2
    && /\b(?:2|two)\b/i.test(o.reply) && /\b(?:fail|unable|couldn't|could not|remaining|not archived|error)/i.test(o.reply)
    && [failed.id, failed.identifier, failed.title].filter(Boolean).some(text => o.reply.includes(text!))
    && !/\binbox (?:is |now |looks )*(?:clear|empty)\b|\ball (?:three|3|items|tasks)[^.\n]*archived\b/i.test(o.reply);
}
export function gradeArchivePartial(value: unknown) {
  const c = checks(); const o = observation(value) as PartialArchive | undefined;
  c.add("real-archive-state-and-transport", !!o && Array.isArray(o.ownerItems) && Array.isArray(o.transport) && typeof o.phaseReply === "string", "Independent per-user saved archive state and actual request/drop receipts are required.");
  if (!o || !Array.isArray(o.ownerItems) || !Array.isArray(o.transport)) return c.result();
  const first = observation(o.state.firstPartial) as PartialArchive | undefined;
  c.add("two-real-commits-before-third-request-fails", !!first && Array.isArray(first.ownerItems) && Array.isArray(first.transport) && firstIsValid(first), "Initial native requests commit exactly two archives and genuinely drop one item's transport before backend admission; the first reply reports that partial result separately.");
  const originals = (o.state.originalTasks as Entity[] | undefined) ?? []; const failedId = first?.transport.find(row => !row.forwarded)?.taskId;
  const retry = o.transport.filter(row => row.phase === "retry" && row.forwarded && row.status === 200);
  const firstRunIds = new Set(first?.runs.map(run => run.id) ?? []); const retryRunIds = new Set(o.runs.filter(run => !firstRunIds.has(run.id) && run.agentId === o.leadId && run.status === "succeeded").map(run => run.id));
  c.add("explicit-retry-reconciles-only-remaining-item", originals.length === 3 && retry.length === 1 && retry[0]?.taskId === failedId && retryRunIds.has(retry[0]?.runId ?? "")
    && o.ownerItems.some(row => row.id === failedId && retryRunIds.has(row.archivedByRunId ?? ""))
    && originals.every(old => o.ownerItems.some(row => row.id === old.id && !!row.archivedAt && row.archivedByAgentId === o.leadId && row.archivedByActorType === "agent"))
    && (first?.ownerItems.filter(row => row.archivedAt) ?? []).every(old => o.ownerItems.some(row => row.id === old.id && row.archivedAt === old.archivedAt && row.archivedByRunId === old.archivedByRunId))
    && o.activity.filter(row => row.agentId === o.leadId && row.action === "issue.inbox_archived").length === 3
    && o.activity.filter(row => row.agentId === o.leadId && row.action === "issue.inbox_archived").every(row => originals.some(old => old.id === row.entityId) && row.details?.userId === o.state.personId), "The declared human retry reads actual saved state and writes only the still-failed item; both prior timestamps/run attributions and exact person scope remain intact.");
  c.add("truthful-final-reconciliation", /\b(?:remaining|previous|retry|already|now)\b/i.test(o.phaseReply) && /\barchiv/i.test(o.phaseReply)
    && !o.activity.some(row => row.agentId === o.leadId && row.action === "issue.inbox_unarchived"), "The final reply reports the reconciled result and never undoes successful archives.");
  c.add("task-completion-never-rewritten", originals.length === 3 && originals.every(old => old.status === "done" && sameTask(old, o.tasks.find(row => row.id === old.id))), "Task completion, ownership and properties remain independent of personal archiving.");
  return c.result();
}
function archivePartial(): ChatCatalogCase {
  const base = makeDefinition("inbox-search.archive-partial-failure", async ctx => {
    const proxy = transport(ctx);
    if (!proxy || proxy.backendOrigin !== ctx.input.api.baseURL || proxy.origin === ctx.input.api.baseURL) {
      await ctx.input.evidence("chat-catalog-archive-native-transport-prerequisite.json", { qualified: false, required: "Start owned transparent archive proxy before server bootstrap; set that server's real PAPERCLIP_API_URL to its proxy origin, retain browser/fixture API on actual backend, inject authenticated owned cross-process archiveFaultTransport control. Native per-item POST traffic must traverse it. Browser route interception and manufactured HTTP errors do not qualify." });
      throw new Error("Missing real native archive transport binding: the single-case launcher must start the owned proxy before server bootstrap and route native PAPERCLIP_API_URL through it. No user query admitted.");
    }
    const session = await ctx.input.api.get<{ user?: { id: string } }>("/api/auth/get-session"); if (!session.user?.id) throw new Error("Archive requires actual responsible human");
    const p = await project(ctx); const originals: Entity[] = [];
    for (const title of ["Delivered launch design", "Delivered launch copy", "Delivered launch checklist"]) { const t = await task(ctx, title, p.id, { status: "done" }); await ctx.input.api.post(`/api/issues/${t.id}/comments`, { body: "Following this completed delivery in my personal inbox." }); originals.push(t); }
    await ctx.input.api.putSensitive(`/api/companies/${ctx.input.fixtures.company.id}/users/me/inbox-agent-policy`, { mode: "allowlist", allowedAgentIds: [ctx.input.fixtures.agent.id] });
    await proxy.arm({ companyId: ctx.input.fixtures.company.id, agentId: ctx.input.fixtures.agent.id, personId: session.user.id, taskIds: originals.map(row => row.id) });
    return { project: p, task: originals[0], originalTasks: originals, personId: session.user.id };
  }, gradeArchivePartial);
  const observe = async (ctx: ChatCatalogContext, state: Record<string, unknown>): Promise<PartialArchive> => {
    const o = await observeInternal(ctx, state); const first = observation(state.firstPartial); const ids = new Set(first?.runs.map(row => row.id) ?? []);
    const comments = ctx.issue() ? await ctx.input.api.get<Entity[]>(`/api/issues/${ctx.issue()!.id}/comments?order=asc`) : [];
    return { ...o, ownerItems: await ctx.input.api.get(`/api/companies/${ctx.input.fixtures.company.id}/issues?touchedByUserId=me&includeAgentCreatedTasks=true&limit=1000`), transport: await transport(ctx)?.receipts() ?? [], phaseReply: comments.filter(row => row.authorAgentId === o.leadId && !ids.has(row.createdByRunId ?? "") && o.runs.some(run => run.id === row.createdByRunId)).map(row => row.body ?? "").join("\n") };
  };
  return { ...base, coverageGaps: [], authentication: "human-session", expectedRunCount: 2, minimumRunCount: 2, expectedHumanMessageCount: 2, attemptTimeoutMs: 480000,
    sourceFiles: [...base.sourceFiles, "chat-catalog-domains/internal-archive-partial.ts", "chat-catalog-domains/internal-archive-transport.ts", "../e2e/fetch-allowed-port.ts", "chat-archive-fault-control.ts"],
    async act(ctx, state) { const first = await pollUntil({ label: "Real initial partial archive turn settles", deadlineAt: Date.now() + 150000, load: () => observe(ctx, state), accept: o => o.runs.length === 1 && o.runs[0]?.status === "succeeded" && ctx.issue()?.conversationState === "waiting" });
      state.firstPartial = { ...first, state: structuredClone(state) }; await ctx.input.evidence("chat-catalog-before-partial-archive-retry.json", state.firstPartial);
      if (!firstIsValid(first)) throw new Error("Initial partial archive evidence failed before declared retry");
      await transport(ctx)!.releaseForExplicitRetry(); const { sendChatMessage } = await import("../chat-flow.js"); await sendChatMessage(ctx.input.page, ctx.scenario.query); },
    observe,
    async verifyResult(ctx, state) { const source = ctx.input.page.url(); try { await ctx.input.page.goto(new URL(`/${ctx.input.fixtures.company.issuePrefix}/issues/${entity(state, "task").identifier}`, ctx.input.api.baseURL).href); await expect(ctx.input.page.getByRole("heading", { name: entity(state, "task").title!, exact: true }).first()).toBeVisible(); } finally { await ctx.input.page.goto(source); await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible(); } },
    // Launcher owns the pre-bootstrap transport lifetime; it closes only after server shutdown.
  };
}
export const archivePartialCases: readonly ChatCatalogCase[] = [archivePartial()];
