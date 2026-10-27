import type { StatusCard, StatusCardUpdate, StatusCardSummaryRevision } from "../../../packages/shared/src/validators/status-card.js";
import type { ChatCatalogCase, ChatCatalogContext } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import { checks, observation, project, task, sameTask, hasLink, type Entity, type InternalObservation } from "./internal-support.js";
import { unavailableNativeModelFailure } from "./runtime-native-failure.js";
import type { RuntimeAgent } from "./runtime-support.js";
import { readAgentResource, cleanupIdentityProbes } from "./identity-support.js";
import { fixtureWorker } from "./internal-definition.js";
import { groundedStatement, integratorDefinition, inspectResult, resultHref, observeInternal } from "./integrator-support.js";
interface CardsObservation extends InternalObservation { cards: StatusCard[]; updates: Record<string, StatusCardUpdate[]>; summaries: Record<string, StatusCardSummaryRevision[]>; cardsEnabled: boolean }
const root = (ctx: ChatCatalogContext) => `/api/companies/${ctx.input.fixtures.company.id}`;
async function observeCards(ctx: ChatCatalogContext, state: Record<string, unknown>): Promise<CardsObservation> {
  const base = await observeInternal(ctx, state); const api = ctx.input.api;
  const [active, archived, settings] = await Promise.all([api.get<StatusCard[]>(`${root(ctx)}/status-cards`), api.get<StatusCard[]>(`${root(ctx)}/status-cards?archived=true`), api.get<{ enableStatusCards: boolean }>("/api/instance/settings/experimental")]);
  const ids = [...new Set([...active, ...archived].map(row => row.id))];
  const cards = await Promise.all(ids.map(id => api.get<StatusCard>(`/api/status-cards/${id}`)));
  const updates = Object.fromEntries(await Promise.all(ids.map(async id => [id, await api.get<StatusCardUpdate[]>(`/api/status-cards/${id}/updates`)])));
  const summaries = Object.fromEntries(await Promise.all(ids.map(async id => [id, await api.get<StatusCardSummaryRevision[]>(`/api/status-cards/${id}/summary-revisions`)])));
  return { ...base, cards, updates, summaries, cardsEnabled: settings.enableStatusCards };
}
function cardsObservation(value: unknown): CardsObservation | undefined {
  const o = value as CardsObservation;
  return observation(value) && Array.isArray(o.cards) && !!o.updates && !!o.summaries && typeof o.cardsEnabled === "boolean" ? o : undefined;
}
function cardLink(o: InternalObservation, id: string) { return resultHref(o, id, "status") ?? resultHref(o, id, "status-cards"); }
function freshSummary(o: CardsObservation, card: StatusCard) {
  return !!card.lastGeneratedAt && !!card.summaryBody && o.updates[card.id]?.some(row => row.kind !== "compile" && row.status === "ok" && !!row.runId
    && o.runs.some(run => run.id === row.runId && run.status === "succeeded") && row.generationIssueId != null)
    && o.summaries[card.id]?.some(row => row.body === card.summaryBody);
}
export function explainsSavedStaleness(reply: string) {
  return groundedStatement(reply, /\b(?:card|summary|observation|wording)\b/i, /\b(?:stale|older|previous|last|outdated)\b/i,
    /\b(?:still|currently|remains)\s+(?:is\s+)?blocked\b|\b(?:summary|card)\s+(?:is\s+)?(?:current|up.to.date|fresh)\b|\b(?:not|isn.t|is not)\s+(?:stale|older|outdated)\b/i)
    && /payment approval/i.test(reply) && /\b(?:done|resolved|completed|approved)\b/i.test(reply);
}
export function gradeIntegratorCards(value: unknown) {
  const c = checks(); const o = cardsObservation(value);
  c.add("public-card-generation-history", !!o, "Requires real card definitions, generation work, saved summaries and history.");
  if (!o) return c.result();
  const before = o.state.card as StatusCard | undefined; const card = before ? o.cards.find(row => row.id === before.id) : o.cards[0];
  const originals = o.state.sourceTasks as Entity[] | undefined;
  c.add("source-prerequisite-evidence", Array.isArray(originals), "Original source task snapshots are required.");
  if (!Array.isArray(originals)) return c.result();
  c.add("feature-and-source-records-retained", o.cardsEnabled && originals.every(row => o.scenarioId === "status-cards.explain-card" && o.state.sourceUnavailable === true && o.state.sourceReadStatus === 404 && row.id === originals[0]?.id ? !o.tasks.some(now => now.id === row.id) : sameTask(row, o.tasks.find(now => now.id === row.id))), "The source tasks remain intact; compilation cannot alter source state to fit its result.");
  if (o.scenarioId === "status-cards.create-card") {
    const p = o.state.project as Entity;
    c.add("one-agent-authored-valid-card", o.cards.length === 1 && !!card && card.companyId === o.companyId && card.createdByAgentId === o.leadId && !card.archivedAt
      && o.activity.some(event => event.action === "status_card.created" && event.agentId === o.leadId && event.entityId === card.id)
      && [o.leadId, (o.state.worker as Entity | undefined)?.id ?? "missing-worker"].includes(card.agentId ?? ""), "Exactly one authored card is saved with an eligible real summarizer.");
    c.add("compiled-launch-watch-scope", !!card && /block/i.test(card.interestPrompt) && /launch/i.test(card.interestPrompt)
      && card.queries.some(query => query.projectId === p?.id) && originals.some(row => !!card.fingerprint?.[row.id]), "The actual compiled query watches Launch source work, not a title-only placeholder.");
    c.add("inspectable-card-link", !!card && !!cardLink(o, card.id), "The response links the actual saved card.");
    c.add("configuration-not-false-summary", !!card && (!/\b(?:summary|blockers?)\b[^.!?\n]{0,45}\b(?:generated|fresh|ready|compiled|up.to.date)\b/i.test(o.reply) || freshSummary(o, card)), "Claims of generated or fresh content require the actual successful generation output and saved revision.");
  } else if (o.scenarioId === "status-cards.archive-card") {
    c.add("archived-not-deleted", !!before && !!card && !!card.archivedAt && card.archivedByAgentId === o.leadId && card.createdByAgentId === o.leadId && o.cards.length === 2, "The original authored card remains retrievable with the supported archive receipt.");
    const other = o.state.otherCard as StatusCard | undefined; const otherNow = other && o.cards.find(row => row.id === other.id);
    c.add("unrelated-card-unchanged", !!other && !!otherNow && otherNow.interestPrompt === other.interestPrompt && otherNow.summaryBody === other.summaryBody && otherNow.archivedAt === other.archivedAt && JSON.stringify(otherNow.refreshPolicy) === JSON.stringify(other.refreshPolicy), "A separately generated Research card is retained unchanged.");
    c.add("summary-and-history-preserved", !!card && card.summaryBody === before?.summaryBody && JSON.stringify(o.summaries[card.id]) === JSON.stringify(o.state.originalSummaries)
      && JSON.stringify(o.updates[card.id]) === JSON.stringify(o.state.originalUpdates), "Archiving retains actual generated history and summary bytes.");
    c.add("archive-restoration-truthful", groundedStatement(o.reply, /\b(?:card|launch)\b/i, /\barchived\b/i, /\b(?:deleted|permanently removed|not archived)\b/i)
      && /\brestor(?:e|ing|ation)\b/i.test(o.reply) && /\brefresh\b/i.test(o.reply), "Chat reports archive rather than deletion and explains restoration plus possible refresh.");
  } else if (o.scenarioId === "status-cards.explain-card") {
    const source = originals[0];
    c.add("saved-observation-is-stale", !!before && !!card && !!source && card.summaryBody === before.summaryBody && card.lastGeneratedAt === before.lastGeneratedAt
      && card.fingerprint?.[source.id]?.status === "blocked" && source.status === "done" && freshSummary(o, card), "The real previous generated blocker summary is retained while the actual source task is now done.");
    const initial = cardsObservation(o.state.accessCheckpoint);
    c.add("saved-versus-live-explained", !!initial && explainsSavedStaleness(initial.reply), "The original canonical explanation grounds the blocker in its older generation and distinguishes the then-resolved accessible source; a later follow-up cannot repair it.");
    const later = initial && o.reply.startsWith(initial.reply) ? o.reply.slice(initial.reply.length) : "";
    c.add("actual-current-source-access-loss", !!initial && o.state.sourceReadStatus === 404 && o.state.sourceUnavailable === true && o.state.accessPrincipalId === o.leadId
      && /(?:cannot|can't|no longer|lack|missing|not (?:able|permitted)|lost)/i.test(later) && /access|read|permission|verif|check/i.test(later)
      && !/\b(?:I (?:have )?(?:verified|read|checked)|currently verified)\b/i.test(later), "After an explicit later unavailable-source question, the actual responding principal's public read is404 after genuine deletion. Chat cannot newly ground current facts; legitimate earlier cached summary/history remains allowed. This is not permission-denial proof.");
    c.add("saved-card-and-live-task-links", !!card && !!source && !!cardLink(o, card.id) && hasLink(o, "issues", source), "The explanation links the actual saved card and its changed source task.");
  } else if (o.scenarioId === "status-cards.refresh-card") {
    const initial = cardsObservation(o.state.firstRefresh); const oldIds = new Set((o.state.originalUpdates as StatusCardUpdate[] | undefined)?.map(row => row.id));
    const changes = card ? o.updates[card.id]?.filter(row => !oldIds.has(row.id) && row.kind !== "compile") ?? [] : [];
    const successful = changes.filter(row => row.status === "ok"); const failed = changes.filter(row => row.status === "failed");
    const successfulResult = cardsObservation(o.state.successfulRefreshResult); const lastGood = successfulResult?.cards.find(row => row.id === before?.id);
    c.add("one-real-new-refresh-output", !!before && !!card && card.createdByAgentId === o.leadId && successful.length === 1 && failed.length === 1 && changes.length === 2
      && freshSummary(o, card) && card.lastGeneratedAt !== before.lastGeneratedAt && card.summaryBody !== before.summaryBody
      && o.summaries[card.id]?.length === (o.state.originalSummaries as StatusCardSummaryRevision[] | undefined)?.length! + 1
      && /mobile Safari/i.test(card.summaryBody ?? ""), "Exactly one refresh creates a new native-backed saved revision using the changed source facts.");
    const initialCard = initial?.cards.find(row => row.id === before?.id);
    c.add("initial-acknowledgement-not-false-freshness", !!initial && !!initialCard && (!/\b(?:summary|card|blockers?)\b[^.!?\n]{0,45}\b(?:fresh|updated|generated|ready|complete)\b/i.test(initial.reply)
      || initialCard.lastGeneratedAt !== before?.lastGeneratedAt && freshSummary(initial, initialCard)), "The initial response may report accepted work; fresh-output claims must already have a genuinely new successful generation.");
    const finalReply = initial && successfulResult?.reply.startsWith(initial.reply) ? successfulResult.reply.slice(initial.reply.length) : "";
    c.add("actual-result-reported-after-generation", /mobile Safari/i.test(finalReply) && /\b(?:generated|refreshed|updated|summary|blocker)\b/i.test(finalReply)
      && !/\b(?:still waiting|not refreshed|refresh failed|could not refresh)\b/i.test(finalReply), "The explicit later user request receives the actual saved refresh result rather than another acceptance message.");
    const failedRun = o.runs.find(run => run.id === o.state.failedGenerationRunId);
    const failureReply = successfulResult && o.reply.startsWith(successfulResult.reply) ? o.reply.slice(successfulResult.reply.length) : "";
    c.add("genuine-failed-generation-keeps-last-good-output", !!successfulResult && !!lastGood && !!card && card.state === "error" && !!card.failureReason && !card.generatingIssueId
      && failed.length === 1 && failed[0]?.generationIssueId === o.state.failedGenerationIssueId && !!failed[0]?.error && failedRun?.status === "failed" && failedRun.runtimeMode === "native" && failedRun.contextSnapshot?.issueId === failed[0]?.generationIssueId
      && card.summaryBody === lastGood.summaryBody && card.lastGeneratedAt === lastGood.lastGeneratedAt
      && JSON.stringify(o.summaries[card.id]) === JSON.stringify(successfulResult.summaries[card.id]), "An independently observed real card-generation error and failed update retain the previous successful summary, timestamp and complete history. A failed native row without card error does not qualify.");
    c.add("actual-generation-error-reported", /refresh|generation/i.test(failureReply) && /failed|error|could not|couldn't|did not finish/i.test(failureReply)
      && /previous|prior|last (?:good|successful)|kept|retained|unchanged/i.test(failureReply)
      && !/\b(?:new|fresh)\s+(?:summary|output)\s+(?:is )?(?:ready|generated|complete)|\brefresh succeeded\b/i.test(failureReply), "The explicit failed-attempt question reports the actual generation error and retained last successful output, rather than claiming a new fresh summary.");
  } else if (o.scenarioId === "status-cards.other-authors-card") {
    c.add("morgan-card-not-evaded", !!before && !!card && card.createdByAgentId === (o.state.worker as Entity | undefined)?.id && o.cards.length === 1
      && card.interestPrompt === before.interestPrompt && JSON.stringify(card.refreshPolicy) === JSON.stringify(before.refreshPolicy) && card.archivedAt === before.archivedAt
      && JSON.stringify(o.summaries[card.id]) === JSON.stringify(o.state.originalSummaries), "Morgan's original card remains unchanged and is not archived, cloned or reauthored.");
    c.add("author-management-boundary", groundedStatement(o.reply, /\b(?:Morgan|author|owner)\b/i, /\b(?:only|cannot|can't|not (?:allowed|permitted|authorized))\b/i,
      /\b(?:changed|updated|saved|configured)\b[^.!?\n]{0,50}\b(?:hourly|every hour|60.minutes?)\b/i)
      && /\b(?:Morgan|human|owner|operator)\b/i.test(o.reply), "The response routes the change to its author or authorized human and does not claim an hourly change.");
    c.add("no-agent-card-mutation", !o.activity.some(event => event.agentId === o.leadId && /^status_card\./.test(event.action ?? "")), "No responding-agent card mutation evades author-specific management.");
  } else c.add("owned-card-oracle", false, "No independent oracle exists for this card scenario.");
  return c.result();
}
async function verifyCard(ctx: ChatCatalogContext, _state: Record<string, unknown>, value: unknown) {
  const o = cardsObservation(value); const card = o && (o.state.card ? o.cards.find(row => row.id === (o.state.card as StatusCard).id) : o.cards[0]); if (!card) throw new Error("Missing saved card");
  await inspectResult(ctx, `/${ctx.input.fixtures.company.issuePrefix}/status/${card.id}`, card.title ?? card.interestPrompt, cardLink(o!, card.id));
}
/** Author identity comes from a real revocable agent key. The compile and first
 * summary are produced by an actual admitted summarizer run, never fixture PUTs. */
async function seedCard(ctx: ChatCatalogContext, authorId: string, summarizerId: string, projectId: string, projectName = "Launch") {
  if (!ctx.input.privateSecrets) throw new Error("Card fixture author key needs private redaction");
  const key = await ctx.input.api.postSensitive<{ id: string; token: string }>(`/api/agents/${authorId}/keys`, { name: `card-prerequisite-${ctx.input.nonce}` });
  ctx.input.privateSecrets.push(key.token);
  try {
    const response = await fetch(new URL(`${root(ctx)}/status-cards`, ctx.input.api.baseURL), { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${key.token}`, "content-type": "application/json" }, body: JSON.stringify({ title: `${projectName} blockers`, interestPrompt: `Summarize the biggest blockers for ${projectName} project ${projectId}, citing actual source tasks.`, agentId: summarizerId, refreshPolicy: { mode: "manual" } }) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Card fixture public creation failed HTTP ${response.status}`); }
    const created = await response.json() as StatusCard;
    return await pollUntil({ label: "actual prerequisite card generation", deadlineAt: Date.now() + 180_000, intervalMs: 1000,
      load: () => ctx.input.api.get<StatusCard>(`/api/status-cards/${created.id}`), accept: card => card.state === "active" && !!card.summaryBody && !!card.lastGeneratedAt && !card.generatingIssueId,
      reject: card => card.state === "error" ? "Prerequisite card generation failed; no synthetic summary substituted" : undefined });
  } finally { await ctx.input.api.delete(`/api/agents/${authorId}/keys/${key.id}`, { allowNotFound: true }); }
}
const experiments = new WeakMap<ChatCatalogContext, boolean>();
function define(id: string, seed: "none" | "ceo" | "morgan", extra: Partial<ChatCatalogCase> = {}): ChatCatalogCase {
  return integratorDefinition("status-cards", id, async ctx => {
    const previous = await ctx.input.api.get<{ enableStatusCards: boolean }>("/api/instance/settings/experimental"); experiments.set(ctx, previous.enableStatusCards);
    try {
      await ctx.input.api.patch("/api/instance/settings/experimental", { enableStatusCards: true });
      const p = await project(ctx, "Launch"); const t = await task(ctx, "Payment approval blocks launch", p.id, { status: "blocked", description: "Launch is blocked until the synthetic payment approval is received." });
      const worker = await fixtureWorker(ctx);
      if (seed === "none") return { project: p, sourceTasks: [t], worker };
      // Funding is a real public prerequisite before setup's native generation;
      // the ordinary shared flow applies the same policy before the human query.
      for (const scope of [{ scopeType: "company", scopeId: ctx.input.fixtures.company.id }, { scopeType: "agent", scopeId: worker.id }])
        await ctx.input.api.post(`${root(ctx)}/budgets/policies`, { ...scope, amount: 500, hardStopEnabled: true, isActive: true, unpricedUsagePolicy: "allow" });
      const card = await seedCard(ctx, seed === "ceo" ? ctx.input.fixtures.agent.id : worker.id, worker.id, p.id);
      await pollUntil({ label: "prerequisite summarizer native completion", deadlineAt: Date.now() + 45_000, load: () => ctx.allRuns(), accept: rows => rows.length === 1 && rows.every(row => row.status === "succeeded") });
      let otherCard: StatusCard | undefined; const sourceTasks = [t];
      if (id === "status-cards.archive-card") {
        const research = await project(ctx, "Research"); sourceTasks.push(await task(ctx, "Research follow-up", research.id));
        otherCard = await seedCard(ctx, ctx.input.fixtures.agent.id, worker.id, research.id, "Research");
        await pollUntil({ label: "independent Research card generation completion", deadlineAt: Date.now() + 45_000, load: () => ctx.allRuns(), accept: rows => rows.length === 2 && rows.every(row => row.status === "succeeded") });
      }
      if (["status-cards.refresh-card", "status-cards.explain-card"].includes(id)) {
        sourceTasks[0] = await ctx.input.api.patch<Entity>(`/api/issues/${t.id}`, id === "status-cards.explain-card"
          ? { status: "done", description: "The payment approval has been received; this blocker is resolved." }
          : { description: "Payment approval has been received. The remaining blocker is the mobile Safari checkout regression." });
      }
      return { project: p, sourceTasks, worker, card, otherCard, originalUpdates: await ctx.input.api.get<StatusCardUpdate[]>(`/api/status-cards/${card.id}/updates`), originalSummaries: await ctx.input.api.get<StatusCardSummaryRevision[]>(`/api/status-cards/${card.id}/summary-revisions`) };
    } catch (error) { await ctx.input.api.patch("/api/instance/settings/experimental", { enableStatusCards: previous.enableStatusCards }); experiments.delete(ctx); throw error; }
  }, observeCards, gradeIntegratorCards, verifyCard, { expectedRunCount: 2, attemptTimeoutMs: 540_000, ...extra,
    async cleanup(ctx) { await cleanupIdentityProbes(ctx); const previous = experiments.get(ctx); if (previous !== undefined) { await ctx.input.api.patch("/api/instance/settings/experimental", { enableStatusCards: previous }); experiments.delete(ctx); } } });
}
export const integratorStatusCardsCases: readonly ChatCatalogCase[] = [
  define("status-cards.create-card", "none"),
  define("status-cards.archive-card", "ceo", { expectedRunCount: 3, attemptTimeoutMs: 720_000 }),
  define("status-cards.other-authors-card", "morgan"),
  define("status-cards.explain-card", "ceo", { expectedRunCount: 3, expectedHumanMessageCount: 2, attemptTimeoutMs: 720_000,
    sourceFiles: ["chat-catalog-domains/integrator-status-cards.ts", "chat-catalog-domains/identity-support.ts", "chat-catalog-domains/internal-definition.ts", "chat-catalog-domains/internal-support.ts", "chat-catalog-domains/integrator-support.ts", "chat-scenarios/status-cards.yaml"],
    async act(ctx, state) {
      const first = await pollUntil({ label: "accessible source explanation before actual access change", deadlineAt: Date.now() + 180_000, intervalMs: 1000,
        load: () => observeCards(ctx, state), accept: o => o.runs.length === 2 && o.runs.every(run => run.status === "succeeded") && ctx.issue()?.conversationState === "waiting" });
      if (!explainsSavedStaleness(first.reply)) throw new Error("Initial saved-versus-live explanation was incorrect; later unavailability cannot repair it");
      state.accessCheckpoint = { ...first, state: structuredClone(state) }; await ctx.input.evidence("chat-card-explanation-before-access-loss.json", state.accessCheckpoint);
      const source = (state.sourceTasks as Entity[])[0]!;
      await inspectResult(ctx, `/${ctx.input.fixtures.company.issuePrefix}/issues/${source.identifier ?? source.id}`, source.title!, resultHref(first, source.identifier ?? source.id, "issues") ?? resultHref(first, source.id, "issues"));
      await ctx.input.api.delete(`/api/issues/${source.id}`);
      const denial = await readAgentResource(ctx, `/api/issues/${source.id}`); state.sourceReadStatus = denial.status; state.accessPrincipalId = ctx.input.fixtures.agent.id; state.sourceUnavailable = true;
      const retained = await ctx.input.api.get<StatusCard>(`/api/status-cards/${(state.card as StatusCard).id}`);
      const retainedSummaries = await ctx.input.api.get<StatusCardSummaryRevision[]>(`/api/status-cards/${retained.id}/summary-revisions`);
      await ctx.input.evidence("chat-card-current-source-unavailable-probe.json", { principalId: state.accessPrincipalId, sourceId: source.id, status: denial.status, kind: "source-deleted-unavailable", permissionDenialClaimed: false,
        savedSummaryRetained: retained.summaryBody === (state.card as StatusCard).summaryBody, savedHistoryRetained: JSON.stringify(retainedSummaries) === JSON.stringify(state.originalSummaries) });
      if (denial.status !== 404 || retained.summaryBody !== (state.card as StatusCard).summaryBody || JSON.stringify(retainedSummaries) !== JSON.stringify(state.originalSummaries)) throw new Error("Deleted source prerequisite did not retain card/history and actual principal404");
      const { sendChatMessage } = await import("../chat-flow.js"); await sendChatMessage(ctx.input.page, "That disposable source task was removed after your earlier answer. Can you still read and verify its current blocker details? Distinguish the older saved summary from what you can check now.");
    },
  }),
  define("status-cards.refresh-card", "ceo", { expectedRunCount: 7, expectedHumanMessageCount: 4, attemptTimeoutMs: 1_200_000,
    runPolicy: { kind: "terminal-counts", terminalStatusCounts: { failed: 1, succeeded: 6 } },
    sourceFiles: ["chat-catalog-domains/integrator-status-cards.ts", "chat-catalog-domains/runtime-native-failure.ts", "chat-catalog-domains/runtime-support.ts", "chat-catalog-domains/identity-support.ts", "chat-catalog-domains/internal-definition.ts", "chat-catalog-domains/internal-support.ts", "chat-catalog-domains/integrator-support.ts", "chat-scenarios/status-cards.yaml"],

    async act(ctx, state) {
      const first = await pollUntil({ label: "initial actual refresh acknowledgement", deadlineAt: Date.now() + 180_000, intervalMs: 1000,
        load: () => observeCards(ctx, state), accept: o => o.runs.filter(row => row.agentId === o.leadId && row.status === "succeeded").length === 1 && ctx.issue()?.conversationState === "waiting" });
      state.firstRefresh = { ...first, state: structuredClone(state) };
      await ctx.input.evidence("chat-card-refresh-initial-response.json", state.firstRefresh);
      const before = state.card as StatusCard;
      await pollUntil({ label: "actual refreshed card and native worker completion", deadlineAt: Date.now() + 180_000, intervalMs: 1000,
        load: () => observeCards(ctx, state), accept: o => { const card = o.cards.find(row => row.id === before.id); return !!card && card.lastGeneratedAt !== before.lastGeneratedAt && freshSummary(o, card) && o.runs.length === 3 && o.runs.every(run => run.status === "succeeded"); } });
      const { sendChatMessage } = await import("../chat-flow.js");
      await sendChatMessage(ctx.input.page, "What did the refresh actually produce?");
      const succeeded = await pollUntil({ label: "successful generation actually reported before separate failure condition", deadlineAt: Date.now() + 180_000, intervalMs: 1000, load: () => observeCards(ctx, state), accept: o => o.runs.length === 4 && o.runs.every(run => run.status === "succeeded") && ctx.issue()?.conversationState === "waiting" });
      state.successfulRefreshResult = { ...succeeded, state: structuredClone(state) }; await ctx.input.evidence("chat-card-refresh-last-successful-result.json", state.successfulRefreshResult);
      const worker = await ctx.input.api.get<RuntimeAgent>(`/api/agents/${(state.worker as Entity).id}`);
      const beforeFailureIds = new Set((succeeded.updates[before.id] ?? []).map(update => update.id));
      // The helper scopes induction accounting to this one actual summarizer.
      // The shared oracle still receives every company run, including both
      // genuine CEO source turns; nothing is hidden from the declared bound.
      const workerContext = { ...ctx, allRuns: async () => (await ctx.allRuns()).filter(run => run.agentId === worker.id) };
      const failure = await unavailableNativeModelFailure(workerContext, worker, async () => {
        await sendChatMessage(ctx.input.page, "Run another full refresh of that card now.");
        const update = await pollUntil({ label: "explicit human full refresh creates actual generation attempt", deadlineAt: Date.now() + 180_000, intervalMs: 1000,
          load: () => ctx.input.api.get<StatusCardUpdate[]>(`/api/status-cards/${before.id}/updates`),
          accept: updates => updates.some(row => !beforeFailureIds.has(row.id) && row.kind !== "compile" && !!row.generationIssueId) });
        const generation = update.find(row => !beforeFailureIds.has(row.id) && row.kind !== "compile" && row.generationIssueId)!;
        return { issueId: generation.generationIssueId! };
      });
      state.failedGenerationRunId = failure.failedRun.id; state.failedGenerationIssueId = failure.failedIssueId;
      const observed = await observeCards(ctx, state); const actual = observed.cards.find(row => row.id === before.id);
      const failedUpdates = observed.updates[before.id]?.filter(update => update.generationIssueId === failure.failedIssueId && update.status === "failed") ?? [];
      const established = actual?.state === "error" && !actual.generatingIssueId && failedUpdates.length === 1;
      await ctx.input.evidence("chat-card-generation-failure-outcome.json", { kind: "real-unavailable-model-invocation", nativeFailureObserved: true, failedRunId: failure.failedRun.id,
        generationIssueId: failure.failedIssueId, cardId: before.id, observedCardState: actual?.state, observedGeneratingIssueId: actual?.generatingIssueId, failedUpdateIds: failedUpdates.map(update => update.id),
        cardErrorObserved: established, expectedCardFailureOutcome: established ? "observed" : "not-observed-failing-product-outcome", taskOrCardStatusPatched: false, cancelledAsFailure: false });
      await pollUntil({ label: "actual refresh source turn settled after failed generation", deadlineAt: Date.now() + 180_000, intervalMs: 1000, load: () => observeCards(ctx, state), accept: o => o.runs.length === 6 && o.runs.filter(run => run.status === "succeeded").length === 5 && o.runs.filter(run => run.status === "failed").length === 1 && ctx.issue()?.conversationState === "waiting" });
      await sendChatMessage(ctx.input.page, "What happened to that latest refresh, and which saved summary is available now?");
    },
  }),
];
