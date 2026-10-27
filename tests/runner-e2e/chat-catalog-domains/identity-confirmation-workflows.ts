import { expect, type Page, type Route } from "@playwright/test";
import { createIssueThreadInteractionSchema } from "../../../packages/shared/src/validators/issue.js";
import type { ChatCatalogCase, ChatCatalogContext } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import { sendChatMessage } from "../chat-flow.js";
import { checks, entity, hasLink, verifyInternalResult, type Entity } from "./internal-support.js";
import { identityDefinition, identityObservation, identityWorker, observeIdentity, openStandingChat, waitForReply, type Interaction } from "./identity-support.js";

interface SourceComment extends Entity { authorType?: string }
const tabs = new WeakMap<ChatCatalogContext, Page>();
const sources = ["chat-catalog-domains/identity-confirmation-workflows.ts", "chat-catalog-domains/identity-support.ts", "chat-catalog-domains/internal-support.ts", "chat-scenarios/questions-and-approvals.yaml"];
export function gradeConfirmationWorkflow(value: unknown) {
  const c = checks(); const o = identityObservation(value);
  c.add("complete-confirmation-workflow", !!o, "Persisted request version, real human events, native run identities and actual output records are independently required."); if (!o) return c.result();
  const original = o.state.original as Interaction | undefined; const current = o.interactions.find(row => row.id === original?.id);
  if (o.scenarioId === "questions-and-approvals.accept-one-proposal") {
    const first = o.state.firstTask as Entity | undefined;
    c.add("same-proposal-and-human-comment", !!original && current?.status === "accepted" && current.resolvedByAgentId === o.leadId
      && typeof o.state.canonicalCommentId === "string" && current.result?.commentId === o.state.canonicalCommentId
      && JSON.stringify(current.payload) === JSON.stringify(original.payload), "The responding real agent binds acceptance to the original proposal payload and the exact canonical human reply.");
    c.add("one-attributed-conversational-decision", o.activity.filter(row => row.action === "issue.thread_interaction_accepted" && row.details?.interactionId === original?.id
      && row.details?.source === "conversation_reply" && row.details.responseCommentId === o.state.canonicalCommentId && row.agentId === o.leadId).length === 1,
      "The public decision audit retains one exact comment/proposal binding across the repeated human reply.");
    c.add("actual-action-once", !!first && o.tasks.length === 1 && o.tasks[0]?.id === first.id && first.title === o.state.taskTitle
      && o.tasks[0]?.status === "backlog" && o.tasks[0]?.companyId === o.companyId && hasLink(o, "issues", o.tasks[0])
      && o.activity.filter(row => row.action === "issue.created" && row.entityId === first.id && row.agentId === o.leadId).length === 1
      && o.state.afterReloadTaskId === first.id, "Acceptance is credited only when the named backlog task actually exists once, remains the same after repeat/reload and has a rendered result link.");
    c.add("repeat-did-not-replace-decision", o.state.afterRepeatResolvedCommentId === o.state.canonicalCommentId && o.humanQueries.length === 2
      && o.humanQueries.every(query => query.trim() === "Yes, go ahead with that."), "Repeating the actual human reply does not replace the saved decision or create a duplicate instruction side effect.");
  } else if (o.scenarioId === "questions-and-approvals.duplicate-answer") {
    const answers = current?.result?.answers;
    c.add("one-real-human-answer", current?.status === "answered" && current.resolvedByUserId === o.state.humanId && !current.resolvedByAgentId
      && answers?.length === 1 && answers[0]?.questionId === "product" && answers[0].otherText === "Acorn"
      && JSON.stringify(current.payload) === JSON.stringify(original?.payload), "Both real browser tabs target the same original question and only one saved human answer exists.");
    c.add("real-simultaneous-conflict", o.state.actualSubmitRequests === 2 && Array.isArray(o.state.submitStatuses) && [...o.state.submitStatuses].sort().join(",") === "200,409"
      && o.state.noTaskBeforeAnswers === true && o.state.bothTabsResolved === true,
      "Both actual visible submit controls race, yielding one accepted response and one real conflict; both views converge on the same saved receipt.");
    c.add("single-answer-delivery", o.activity.filter(row => row.action === "issue.thread_interaction_answered" && row.details?.interactionId === original?.id && row.actorType === "user").length === 1
      && o.runs.filter(run => run.contextSnapshot?.interactionId === original?.id).length === 1,
      "Exactly one answer audit and one interaction-bound continuation are observed; the losing tab cannot add a run or a new human chat comment.");
    c.add("one-actual-answer-artifact", o.tasks.length === 1 && o.tasks[0]?.companyId === o.companyId && hasLink(o, "issues", o.tasks[0])
      && o.documents.length === 1 && (o.documents[0]?.body ?? "").includes("Acorn") && !!o.documents[0]?.latestRevisionId
      && o.activity.some(row => row.action === "issue.document_created" && row.entityId === o.tasks[0]?.id && [o.leadId, (o.state.worker as Entity | undefined)?.id].includes(row.agentId ?? ""))
      && o.runs.some(run => run.id === o.documents[0]?.createdByRunId && [o.leadId, (o.state.worker as Entity | undefined)?.id].includes(run.agentId)),
      "The one continuation produces one linked ordinary draft task and one real saved introduction document using Acorn; an empty task or a prose promise is insufficient.");
  } else c.add("known-workflow", false, "This workflow has no independent oracle.");
  return c.result();
}
async function sourceComments(ctx: ChatCatalogContext) { return ctx.input.api.get<SourceComment[]>(`/api/issues/${ctx.issue()!.id}/comments?order=asc`); }
async function observeWorkflow(ctx: ChatCatalogContext, state: Record<string, unknown>) {
  const o = await observeIdentity(ctx, state);
  const comments = await sourceComments(ctx);
  state.canonicalCommentId = comments.find(row => row.authorUserId && !row.createdByRunId && row.body?.trim() === ctx.scenario.query)?.id;
  if (ctx.scenario.id === "questions-and-approvals.accept-one-proposal") state.afterRepeatResolvedCommentId = o.interactions.find(row => row.id === entity(state, "original").id)?.result?.commentId;
  if (ctx.scenario.id === "questions-and-approvals.duplicate-answer" && o.tasks.length === 1) {
    const target = o.tasks[0]!; state.task = target;
    o.documents = await Promise.all((await ctx.input.api.get<Entity[]>(`/api/issues/${target.id}/documents`)).map(row => ctx.input.api.get<Entity>(`/api/issues/${target.id}/documents/${encodeURIComponent(row.key!)}`)));
  }
  return o;
}
export const confirmationWorkflowIdentityCases: readonly ChatCatalogCase[] = [
  identityDefinition("questions-and-approvals.accept-one-proposal", async ctx => {
    const source = await openStandingChat(ctx); const taskTitle = `Acorn launch checklist ${ctx.input.nonce}`;
    const original = await ctx.input.api.post<Interaction>(`/api/issues/${source.id}/interactions`, createIssueThreadInteractionSchema.parse({
      kind: "request_confirmation", title: "Create Acorn launch checklist", resolverPolicy: "anyone", continuationPolicy: "none",
      payload: { version: 1, prompt: `Create one backlog task titled ${taskTitle}?`, detailsMarkdown: `The proposed action only records a backlog task named **${taskTitle}** with the scope: draft our launch checklist for later. Do not start its execution or publish anything.`, supersedeOnUserComment: false },
    }));
    await ctx.input.page.reload({ waitUntil: "domcontentloaded" }); return { original, taskTitle };
  }, gradeConfirmationWorkflow, {
    authentication: "human-session", sourceFiles: sources, expectedRunCount: 2, expectedHumanMessageCount: 2, attemptTimeoutMs: 420_000,
    observe: observeWorkflow,
    async act(ctx, state) {
      await waitForReply(ctx);
      const created = await ctx.input.api.get<Entity[]>(`/api/companies/${ctx.input.fixtures.company.id}/issues?includeAgentCreatedTasks=true`);
      const first = created.filter(row => row.id !== ctx.issue()!.id); if (first.length !== 1 || first[0]?.title !== state.taskTitle) throw new Error("The approved named task was not actually created once");
      state.firstTask = first[0];
      const comments = await sourceComments(ctx); state.canonicalCommentId = comments.find(row => row.authorUserId && row.body?.trim() === ctx.scenario.query)?.id;
      await ctx.input.page.reload({ waitUntil: "domcontentloaded" });
      state.afterReloadTaskId = (await ctx.input.api.get<Entity>(`/api/issues/${first[0]!.id}`)).id;
      await sendChatMessage(ctx.input.page, ctx.scenario.query);
      await ctx.input.evidence("identity-repeat-original-confirmation.json", { requestId: entity(state, "original").id, firstTaskId: first[0]!.id, canonicalCommentId: state.canonicalCommentId, repeatedOriginalReply: true });
    }, verifyResult: verifyInternalResult,
  }),
  identityDefinition("questions-and-approvals.duplicate-answer", async ctx => {
    const source = await openStandingChat(ctx); const session = await ctx.input.api.get<{ user: { id: string } }>("/api/auth/get-session");
    if (!session.user?.id || session.user.id === "local-board") throw new Error("Answer-race attribution requires a genuine human session");
    const worker = await identityWorker(ctx);
    await ctx.input.api.patch(`/api/issues/${source.id}`, { description: "A small local product introduction draft is waiting only for its product name. The person must submit the pending human-only question; an ordinary comment does not resolve that protected form. After its actual submission, produce one ordinary draft task with one short saved introduction document using the answer, delegating its execution to Morgan if necessary, and return its review link. Do not publish externally." });
    const original = await ctx.input.api.post<Interaction>(`/api/issues/${source.id}/interactions`, createIssueThreadInteractionSchema.parse({ kind: "ask_user_questions", title: "Product name for the introduction draft", resolverPolicy: "human_only", continuationPolicy: "wake_assignee",
      payload: { version: 1, supersedeOnUserComment: false, questionSet: { schema: "paperclip.question_set.v1", title: "Product name for the introduction draft", submitLabel: "Submit answers",
        questions: [{ id: "product", prompt: "What is the product name for the local introduction draft?", answerMode: "text", required: true }] } } }));
    await ctx.input.page.reload({ waitUntil: "domcontentloaded" });
    const other = await ctx.input.page.context().newPage(); tabs.set(ctx, other); await other.goto(ctx.input.page.url(), { waitUntil: "domcontentloaded" });
    await expect(other.getByTestId("task-chat-composer-takeover")).toBeVisible();
    return { original, humanId: session.user.id, worker };
  }, gradeConfirmationWorkflow, {
    authentication: "human-session", sourceFiles: sources, expectedRunCount: 4, minimumRunCount: 2, runPolicy: { kind: "source-settled-with-active-work", maximumActiveWorkerRuns: 1 }, attemptTimeoutMs: 600_000,
    observe: observeWorkflow,
    async act(ctx, state) {
      await waitForReply(ctx); const other = tabs.get(ctx); if (!other) throw new Error("The second real browser tab is missing");
      const before = await ctx.input.api.get<Entity[]>(`/api/companies/${ctx.input.fixtures.company.id}/issues?includeAgentCreatedTasks=true`); state.noTaskBeforeAnswers = before.filter(row => row.id !== ctx.issue()!.id).length === 0;
      for (const page of [ctx.input.page, other]) {
        const form = page.getByTestId("task-chat-composer-takeover");
        if (!(await form.isVisible())) await page.locator(`#interaction-${entity(state, "original").id}`).click();
        await expect(form).toBeVisible(); await form.getByTestId("question-text-answer-composer").locator('[contenteditable="true"],textarea').first().fill("Acorn");
      }
      const endpoint = `/api/issues/${ctx.issue()!.id}/interactions/${entity(state, "original").id}/respond`;
      let release!: () => void; const bothActualRequests = new Promise<void>(resolve => { release = resolve; }); let submitted = 0;
      const handler = async (route: Route) => {
        if (route.request().method() !== "POST") return route.continue();
        submitted++; if (submitted === 2) release();
        await bothActualRequests; await route.continue();
      };
      const url = ctx.input.api.baseURL + endpoint; const context = ctx.input.page.context(); await context.route(url, handler);
      const timer = setTimeout(release, 30_000);
      try {
        // Hold only transport admission until both genuine visible buttons have
        // submitted. Both unmodified requests then reach the real public route;
        // no response is fulfilled, replayed, or manufactured by this barrier.
        const responses = [ctx.input.page, other].map(page => page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === endpoint));
        await Promise.all([ctx.input.page, other].map(page => page.getByTestId("task-chat-composer-takeover").getByRole("button", { name: "Submit answers", exact: true }).click()));
        state.submitStatuses = (await Promise.all(responses)).map(response => response.status()); state.actualSubmitRequests = submitted;
      } finally { release(); clearTimeout(timer); await context.unroute(url, handler); }
      await pollUntil({ label: "One answer-race continuation completed", deadlineAt: Date.now() + 180_000,
        load: async () => { await ctx.refreshIssue(); return { runs: await ctx.allRuns(), source: ctx.issue() }; },
        accept: value => value.runs.filter(run => run.agentId === ctx.input.fixtures.agent.id).length >= 2
          && value.runs.filter(run => run.agentId === ctx.input.fixtures.agent.id).every(run => run.status === "succeeded") && value.source?.conversationState === "waiting" });
      for (const page of [ctx.input.page, other]) {
        await page.reload({ waitUntil: "domcontentloaded" });
        const receipt = page.locator(`#interaction-${entity(state, "original").id}`).getByTestId("task-chat-answered-questions-receipt");
        await expect(receipt).toBeVisible(); await receipt.locator("summary").click(); await expect(receipt).toContainText("Acorn");
        await expect(page.locator(`#interaction-${entity(state, "original").id}`).getByTestId("task-chat-unanswered-question")).toHaveCount(0);
      }
      state.bothTabsResolved = true;
      await ctx.input.evidence("identity-simultaneous-question-answer.json", { questionId: entity(state, "original").id, userId: state.humanId, submitStatuses: state.submitStatuses, bothTabsResolved: true });
    }, verifyResult: verifyInternalResult,
    async cleanup(ctx) { await tabs.get(ctx)?.close(); tabs.delete(ctx); },
  }),
];
