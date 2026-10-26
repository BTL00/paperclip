import { expect } from "@playwright/test";
import { pollUntil } from "../api.js";
import { sendChatMessage } from "../chat-flow.js";
import { checks, type Entity } from "./internal-support.js";
import { readAgentResource, openStandingChat } from "./identity-support.js";
import { runtimeDefinition, runtimeObservation, observeRuntime } from "./runtime-support.js";

export function gradeReopenConversation(value: unknown) {
  const c = checks(); const o = runtimeObservation(value);
  c.add("persisted-reopen-evidence", !!o, "The existing conversation, original attributed history and navigation result are independently read."); if (!o) return c.result();
  c.add("same-existing-owned-conversation", typeof o.state.existingIssueId === "string" && o.state.reopenedIssueId === o.state.existingIssueId
    && o.state.reopenedAgentId === o.leadId && o.state.historyRetained === true,
    "The supported result opens the same person's existing Morgan conversation and retains its real prior turn.");
  c.add("navigation-started-no-work", o.state.beforeNavigationRuns === 2 && o.state.afterNavigationRuns === 2
    && o.state.beforeNavigationChatIds !== undefined && JSON.stringify(o.state.beforeNavigationChatIds) === JSON.stringify(o.state.afterNavigationChatIds)
    && o.tasks.length === 0,
    "The initial setup and canonical query are the only two runs; navigation creates neither work nor a duplicate standing chat.");
  c.add("private-chat-list-not-readable-to-agent", o.state.agentChatListStatus === 403,
    "The actual agent bearer cannot enumerate the person's private conversation list.");
  c.add("canonical-query-response-link", o.state.linkMatchedFinalRun === true,
    "A link to the actual existing conversation was rendered in a reply attributed to the canonical query's run.");
  return c.result();
}
export const runtimeAgentChatCases = [runtimeDefinition("agent-chat.reopen-conversation", async ctx => {
  await ctx.input.api.patch(`/api/agents/${ctx.input.fixtures.agent.id}`, { name: "Morgan" });
  const source = await openStandingChat(ctx);
  const lead = await ctx.input.api.get<Entity>(`/api/agents/${ctx.input.fixtures.agent.id}`);
  const historyMarker = `Retained launch context ${ctx.input.nonce}`;
  await sendChatMessage(ctx.input.page, `Remember this launch reference in our conversation: ${historyMarker}. Acknowledge briefly; no task is needed.`);
  await pollUntil({ label: "Genuine prior Morgan conversation", deadlineAt: Date.now() + 150_000,
    load: async () => { await ctx.refreshIssue(); return { source: ctx.issue(), runs: await ctx.allRuns() }; },
    accept: ({ source, runs }) => source?.conversationState === "waiting" && runs.length === 1 && runs.every(run => run.status === "succeeded") });
  const history = await ctx.input.api.get<Entity[]>(`/api/issues/${source.id}/comments?order=asc`);
  const firstRuns = await ctx.allRuns();
  if (!history.some(row => row.authorAgentId === ctx.input.fixtures.agent.id && firstRuns.some(run => run.id === row.createdByRunId)))
    throw new Error("Existing Morgan history requires a genuine attributed native reply");
  const read = await readAgentResource(ctx, `/api/companies/${ctx.input.fixtures.company.id}/chats`);
  return { existingIssueId: source.id, lead, history, historyMarker, setupRunIds: firstRuns.map(run => run.id), agentChatListStatus: read.status };
}, gradeReopenConversation, {
  authentication: "human-session", setupHumanMessageCount: 1, expectedHumanMessageCount: 2, expectedRunCount: 2, attemptTimeoutMs: 420_000,
  async act(ctx, state) {
    await pollUntil({ label: "Canonical reopen query settled", deadlineAt: Date.now() + 150_000,
      load: async () => { await ctx.refreshIssue(); return { source: ctx.issue(), runs: await ctx.allRuns() }; },
      accept: ({ source, runs }) => source?.conversationState === "waiting" && runs.length === 2 && runs.every(run => run.status === "succeeded") });
    const source = ctx.issue()!; const runs = await ctx.allRuns();
    const comments = await ctx.input.api.get<Entity[]>(`/api/issues/${source.id}/comments?order=asc`);
    const setupIds = state.setupRunIds as string[];
    const finalReplies = comments.filter(row => row.authorAgentId === ctx.input.fixtures.agent.id
      && runs.some(run => run.id === row.createdByRunId && !setupIds.includes(run.id)));
    let href: string | undefined;
    for (const reply of finalReplies) {
      const links = await ctx.input.page.locator(`[id=${JSON.stringify(`comment-${reply.id}`)}] a[href]`).evaluateAll(rows => rows.map(row => row.getAttribute("href")!));
      href = links.find(link => {
        const url = new URL(link, ctx.input.api.baseURL);
        return url.origin === ctx.input.api.baseURL && url.pathname.split("/").includes("chats")
          && [ctx.input.fixtures.agent.id, (state.lead as Entity).urlKey].includes(decodeURIComponent(url.pathname.split("/").at(-1)!));
      });
      if (href) break;
    }
    if (!href) throw new Error("Canonical reopen response lacks the existing Morgan conversation link");
    state.linkMatchedFinalRun = true; state.beforeNavigationRuns = runs.length;
    const chatList = `/api/companies/${ctx.input.fixtures.company.id}/chats`;
    state.beforeNavigationChatIds = (await ctx.input.api.get<Entity[]>(chatList)).map(row => row.id).sort();
    await ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(href)}]`).last().click();
    await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible();
    await ctx.input.page.reload({ waitUntil: "domcontentloaded" });
    await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible();
    await ctx.refreshIssue(); state.reopenedIssueId = ctx.issue()?.id;
    const reopened = await ctx.input.api.get<{ conversationAgentId: string }>(`/api/issues/${ctx.issue()!.id}`);
    state.reopenedAgentId = reopened.conversationAgentId;
    const after = await ctx.input.api.get<Entity[]>(`/api/issues/${source.id}/comments?order=asc`);
    state.historyRetained = (state.history as Entity[]).every(prior => after.some(row => row.id === prior.id && row.body === prior.body && row.createdByRunId === prior.createdByRunId));
    state.afterNavigationRuns = (await ctx.allRuns()).length;
    state.afterNavigationChatIds = (await ctx.input.api.get<Entity[]>(chatList)).map(row => row.id).sort();
  },
  observe: observeRuntime,
  async verifyResult(ctx) { await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible(); },
})];
