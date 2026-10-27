import { expect } from "@playwright/test";
import { createIssueThreadInteractionSchema } from "../../../packages/shared/src/validators/issue.js";
import type { ChatCatalogCase } from "../chat-catalog-contract.js";
import type { IssueWorkProduct } from "../../../packages/shared/src/types/work-product.js";
import type { IssueDocument, IssueDocumentSummary, DocumentRevision } from "../../../packages/shared/src/types/issue.js";
import { pollUntil } from "../api.js";
import { checks, entity, hasLink, putDocument, verifyInternalResult, type Entity } from "./internal-support.js";
import { identityDefinition, identityObservation, identityWorker, observeIdentity, openStandingChat, type Interaction } from "./identity-support.js";

interface PlanInteraction extends Interaction { payload: Interaction["payload"] & { target?: { revisionId?: string } } }
export function gradePlanReview(value: unknown) {
  const c = checks(); const o = identityObservation(value); c.add("complete-versioned-workflow", !!o, "Actual versioned decisions, attributed ordinary work and browser receipts are required."); if (!o) return c.result();
  const original = o.state.original as PlanInteraction | undefined; const current = o.interactions.find(row => row.id === original?.id) as PlanInteraction | undefined;
  const plan = o.state.plan as Entity | undefined; const saved = o.tasks[0]; const worker = o.state.worker as Entity | undefined;
  c.add("same-request-version", !!original && !!current && typeof plan?.latestRevisionId === "string" && JSON.stringify(current.payload) === JSON.stringify(original.payload)
    && original.payload.target?.revisionId === plan?.latestRevisionId,
    "The actual current request retains the reviewed source document revision without authorizing another version.");
  if (o.scenarioId === "questions-and-approvals.review-plan") {
    c.add("ordinary-linked-execution", o.tasks.length === 1 && saved?.companyId === o.companyId && saved.id !== o.state.sourceId && saved.parentId == null
    && saved.assigneeAgentId === worker?.id && hasLink(o, "issues", saved) && o.activity.some(row => row.action === "issue.created" && row.entityId === saved.id && row.agentId === o.leadId)
    && o.state.sourceRetainsConversation === true && o.runs.some(run => run.agentId === worker?.id && (run.contextSnapshot?.issueId === saved.id || (run as unknown as { nativeIssueId?: string }).nativeIssueId === saved.id)),
    "The agent creates one linked ordinary task assigned to the real Morgan, whose actual admitted execution is bound to that task; chat remains a conversation.");
    c.add("canonical-human-approval-bound", current?.status === "accepted" && current.resolvedByAgentId === o.leadId
      && o.state.sourcePlanRevisionAfter === plan?.latestRevisionId && typeof o.state.canonicalCommentId === "string" && current.result?.commentId === o.state.canonicalCommentId
      && o.activity.some(row => row.action === "issue.thread_interaction_accepted" && row.details?.interactionId === original?.id && row.details?.responseCommentId === o.state.canonicalCommentId),
      "The exact canonical conversational approval is attached to the real reviewed revision and decision audit.");
    c.add("reviewed-scope-handed-off", !!saved && `${saved.title} ${saved.description}`.includes(String(o.state.scopeMarker)), "The actual ordinary task retains the substantive scope of the approved plan.");
    c.add("stale-review-shows-new-version", o.state.staleAttemptStatus === 409 && o.state.staleErrorCode === "interaction_stale_target" && o.state.newerRevisionVisible === true
      && o.state.newerRevisionId !== o.state.staleRevisionId && o.state.staleExpired === true,
      "A separately opened real old revision becomes unapprovable after a public edit; the browser shows the actual newer version instead of approving unseen work.");
  } else if (o.scenarioId === "questions-and-approvals.reject-and-revise") {
    c.add("publication-decision-declined", ["rejected", "superseded"].includes(current?.status ?? "") && !o.activity.some(row => row.action === "issue.thread_interaction_accepted" && row.details?.interactionId === original?.id)
      && o.state.rejectedReceiptVisible === true, "The old publication request remains visibly declined or superseded and is never accepted.");
    c.add("real-local-review-draft", o.documents.length > 0 && o.documents.some(row => (row.body ?? "").includes(String(o.state.scopeMarker)) && /draft|review/i.test(row.body ?? "")
      && !!row.latestRevisionId && row.latestRevisionId !== plan?.latestRevisionId && o.revisions.some(revision => revision.id === row.latestRevisionId && revision.documentId === row.id
        && o.runs.some(run => run.id === revision.createdByRunId && run.agentId === revision.createdByAgentId && [o.leadId, worker?.id].includes(run.agentId)))
      && (row.issueId === o.state.sourceId ? o.links.some(link => link.includes(`#document-${encodeURIComponent(row.key!)}`)) : o.tasks.some(task => task.id === row.issueId && hasLink(o, "issues", task))))
      && o.state.sourceRetainsConversation === true && o.state.noPublishedWorkProduct === true && !/\b(?:I|we)(?:'ve| have)?\s+(?:published|deployed)\b/i.test(o.reply),
      "The revised scope produces an actual attributed local review document and linked task, without a published delivery record or claimed publication.");
  } else c.add("known-plan-workflow", false, "No oracle exists for this workflow.");
  return c.result();
}
const sources = ["chat-catalog-domains/identity-plan-review.ts", "chat-catalog-domains/identity-support.ts", "chat-catalog-domains/internal-support.ts", "chat-scenarios/questions-and-approvals.yaml"];
export const planReviewIdentityCases: readonly ChatCatalogCase[] = ["questions-and-approvals.review-plan", "questions-and-approvals.reject-and-revise"].map(scenarioId => identityDefinition(scenarioId, async ctx => {
  const source = await openStandingChat(ctx); const worker = await identityWorker(ctx); const review = scenarioId.endsWith("review-plan");
  const scopeMarker = `Acorn research launch ${ctx.input.nonce}`;
  const plan = await putDocument(ctx, source.id, `# ${scopeMarker}\n${review ? "Create a local implementation checklist for a research notes website. Begin the assigned checklist work after the current plan revision is approved." : "Proposed action: publish the research notes introduction page. Its subject is a research notebook product for small science teams."}\nUse the exact project context ${scopeMarker}.`);
  const original = await ctx.input.api.post<PlanInteraction>(`/api/issues/${source.id}/interactions`, createIssueThreadInteractionSchema.parse({ kind: "request_confirmation", title: review ? "Approve current research launch plan" : "Publish research launch introduction",
    resolverPolicy: "anyone", continuationPolicy: "none", payload: { version: 1, prompt: review ? "Approve the current plan and start its linked ordinary work?" : "Publish the proposed introduction page?",
      detailsMarkdown: `Review the actual attached plan revision ${plan.latestRevisionNumber}. ${review ? "Approval hands off one ordinary task to Morgan, not the conversation." : "A different requested draft scope must decline this publication proposal and create a local review draft instead. Publication requires a separate explicit accepted decision."}`,
      supersedeOnUserComment: false, target: { type: "issue_document", issueId: source.id, documentId: plan.id, key: "plan", revisionId: plan.latestRevisionId, revisionNumber: plan.latestRevisionNumber } } }));
  await ctx.input.page.reload({ waitUntil: "domcontentloaded" }); return { sourceId: source.id, worker, plan, original, scopeMarker };
}, gradePlanReview, {
  sourceFiles: sources, authentication: "human-session", expectedRunCount: 3, minimumRunCount: scenarioId.endsWith("review-plan") ? 2 : 1, attemptTimeoutMs: 600_000,
  runPolicy: { kind: "source-settled-with-active-work", maximumActiveWorkerRuns: 1 },
  async act(ctx, state) {
    await pollUntil({ label: "Plan decision source settled", deadlineAt: Date.now() + 180_000,
      load: async () => { await ctx.refreshIssue(); return { source: ctx.issue(), runs: await ctx.allRuns() }; },
      accept: value => value.source?.conversationState === "waiting" && value.runs.filter(run => run.agentId === ctx.input.fixtures.agent.id).length === 1
        && value.runs.filter(run => run.agentId === ctx.input.fixtures.agent.id).every(run => run.status === "succeeded") });
    const original = entity(state, "original");
    if (scenarioId.endsWith("reject-and-revise")) {
      const card = ctx.input.page.locator(`#interaction-${original.id}`); await expect(card).toContainText(/Declined|Superseded/i); state.rejectedReceiptVisible = true; return;
    }
    // A separate additional review opens before its actual public document edit.
    // The first canonical approval's source plan is never rewritten by this check.
    const target = await ctx.input.api.post<Entity>(`/api/companies/${ctx.input.fixtures.company.id}/issues`, { title: "Separate stale review fixture", status: "backlog" });
    state.staleTaskId = target.id;
    const old = await putDocument(ctx, target.id, "Old review: unrestricted publication.");
    const stale = await ctx.input.api.post<Interaction>(`/api/issues/${target.id}/interactions`, createIssueThreadInteractionSchema.parse({ kind: "request_confirmation", title: "Review before edit", resolverPolicy: "human_only", continuationPolicy: "none",
      payload: { version: 1, prompt: "Approve the currently opened older review?", supersedeOnUserComment: false, target: { type: "issue_document", issueId: target.id, documentId: old.id, key: "plan", revisionId: old.latestRevisionId, revisionNumber: old.latestRevisionNumber } } }));
    const current = await putDocument(ctx, target.id, "Newer review: local draft only, do not publish.", old.latestRevisionId!);
    const response = await ctx.input.page.context().request.post(`${ctx.input.api.baseURL}/api/issues/${target.id}/interactions/${stale.id}/accept`, { data: {}, headers: { Origin: ctx.input.api.baseURL } });
    state.staleAttemptStatus = response.status(); const body = await response.json() as { code?: string; details?: { code?: string } }; state.staleErrorCode = body.details?.code ?? body.code;
    state.staleRevisionId = old.latestRevisionId; state.newerRevisionId = current.latestRevisionId;
    const interactions = await ctx.input.api.get<Interaction[]>(`/api/issues/${target.id}/interactions`); state.staleExpired = interactions.find(row => row.id === stale.id)?.status === "expired";
    const source = ctx.input.page.url(); await ctx.input.page.goto(`/${ctx.input.fixtures.company.issuePrefix}/issues/${target.identifier ?? target.id}`, { waitUntil: "domcontentloaded" });
    // The supported plan deep link expands the real current document, not text fabricated by the harness.
    await ctx.input.page.goto(`/${ctx.input.fixtures.company.issuePrefix}/issues/${target.identifier ?? target.id}#document-plan&viewer=full`, { waitUntil: "domcontentloaded" });
    await expect(ctx.input.page.getByText("Newer review: local draft only, do not publish.", { exact: false }).first()).toBeVisible(); state.newerRevisionVisible = true;
    await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" });
    await ctx.input.evidence("identity-stale-plan-review.json", { oldRevisionId: old.latestRevisionId, newRevisionId: current.latestRevisionId, staleAttemptStatus: state.staleAttemptStatus, staleErrorCode: state.staleErrorCode, newerRevisionVisible: true });
  },
  async observe(ctx, state) {
    const o = await observeIdentity(ctx, state); o.tasks = o.tasks.filter(row => row.id !== state.staleTaskId);
    const comments = await ctx.input.api.get<Entity[]>(`/api/issues/${ctx.issue()!.id}/comments?order=asc`); state.canonicalCommentId = comments.find(row => row.authorUserId && row.body?.trim() === ctx.scenario.query)?.id;
    state.sourcePlanRevisionAfter = (await ctx.input.api.get<IssueDocument>(`/api/issues/${ctx.issue()!.id}/documents/plan`)).latestRevisionId;
    state.sourceRetainsConversation = ctx.issue()?.assigneeAgentId === ctx.input.fixtures.agent.id && ctx.issue()?.status === "in_review" && ctx.issue()?.conversationState === "waiting";
    o.documents = [];
    let published = false;
    const documentIssueIds = [...o.tasks.map(task => task.id), ...(scenarioId.endsWith("reject-and-revise") ? [ctx.issue()!.id] : [])];
    for (const issueId of documentIssueIds) {
      const docs = await ctx.input.api.get<IssueDocumentSummary[]>(`/api/issues/${issueId}/documents`);
      const full = await Promise.all(docs.map(doc => ctx.input.api.get<IssueDocument>(`/api/issues/${issueId}/documents/${encodeURIComponent(doc.key)}`)));
      o.documents.push(...full.map(doc => ({ id: doc.id, issueId: doc.issueId, key: doc.key, body: doc.body, latestRevisionId: doc.latestRevisionId ?? undefined })));
    }
    for (const issueId of [ctx.issue()!.id, ...o.tasks.map(task => task.id)]) {
      const products = await ctx.input.api.get<IssueWorkProduct[]>(`/api/issues/${issueId}/work-products`);
      published ||= products.some(product => !["document", "artifact"].includes(product.type) || product.provider !== "paperclip"
        || product.url != null && new URL(product.url, ctx.input.api.baseURL).origin !== ctx.input.api.baseURL);
    }
    const revisions = (await Promise.all(o.documents.map(row => ctx.input.api.get<DocumentRevision[]>(`/api/issues/${row.issueId}/documents/${encodeURIComponent(row.key!)}/revisions`)))).flat();
    o.revisions = revisions.map(row => ({ id: row.id, documentId: row.documentId, createdByRunId: row.createdByRunId, createdByAgentId: row.createdByAgentId }));
    state.noPublishedWorkProduct = !published; return o;
  },
  async verifyResult(ctx, state, value) {
    const o = identityObservation(value);
    if (scenarioId.endsWith("review-plan") || o?.tasks.length) { await verifyInternalResult(ctx, state, value); return; }
    const doc = o?.documents.find(row => o.revisions.some(revision => revision.id === row.latestRevisionId && revision.documentId === row.id && revision.createdByRunId)
      && (row.body ?? "").includes(String(state.scopeMarker)));
    if (!doc) throw new Error("Actual local review draft is missing");
    const href = await ctx.input.page.locator('[id^="comment-"] a[href]').evaluateAll(links => links.map(link => link.getAttribute("href")!));
    const reviewLink = href.find(link => link.includes(`#document-${encodeURIComponent(doc.key!)}`));
    if (!reviewLink) throw new Error("Actual draft review link missing from reply");
    await ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(reviewLink)}]`).first().click();
    await expect(ctx.input.page.getByText(String(state.scopeMarker), { exact: false }).first()).toBeVisible();
  },
}));
