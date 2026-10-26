import { expect } from "@playwright/test";
import type { ChatCatalogCase, ChatCatalogContext } from "../chat-catalog-contract.js";
import { makeDefinition } from "./internal-definition.js";
import { checks, entity, observation, observeInternal, project, sameTask, task, type Entity, type InternalObservation } from "./internal-support.js";

interface Probe { status: number; body: unknown }
interface InboxObservation extends InternalObservation {
  personalItems: Entity[]; policy: { mode: string; allowedAgentIds: string[] }; personalProbe: Probe; archiveProbe?: Probe;
}
async function agentRequest(ctx: ChatCatalogContext, path: string, method = "GET", body?: unknown): Promise<Probe> {
  const id = ctx.input.fixtures.agent.id;
  const key = await ctx.input.api.postSensitive<{ id: string; token: string }>(`/api/agents/${id}/keys`, { name: `inbox-scope-control-${ctx.input.nonce}` });
  if (!ctx.input.privateSecrets) throw new Error("Agent probe requires an attempt-private secret redactor");
  ctx.input.privateSecrets.push(key.token);
  try {
    const url = new URL(path, ctx.input.api.baseURL);
    if (url.origin !== ctx.input.api.baseURL || !url.pathname.startsWith("/api/")) throw new Error("Inbox probe escaped fixture API");
    const response = await fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${key.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  } finally { await ctx.input.api.delete(`/api/agents/${id}/keys/${key.id}`); }
}
function minePath(ctx: ChatCatalogContext) {
  return `/api/companies/${ctx.input.fixtures.company.id}/issues?touchedByUserId=me&inboxArchivedByUserId=me&includeAgentCreatedTasks=true&limit=500`;
}
function mineLink(o: InternalObservation) {
  return o.links.some(href => {
    try {
      const url = new URL(href, o.origin);
      return url.origin === o.origin && (/\/inbox\/mine\/?$/.test(url.pathname)
        || /\/(?:tasks|issues)\/?$/.test(url.pathname) && url.searchParams.get("view") === "mine");
    } catch { return false; }
  });
}
export function gradeInbox(value: unknown) {
  const c = checks(); const o = observation(value) as InboxObservation | undefined;
  c.add("independent-personal-inbox", !!o && Array.isArray(o.personalItems) && !!o.personalProbe && !!o.policy,
    "The signed-in person's actual inbox, saved policy and agent access probe are required.");
  if (!o || !Array.isArray(o.personalItems) || !o.personalProbe || !o.policy) return c.result();
  const originals = o.state.originalTasks as Entity[] | undefined;
  c.add("task-state-and-inbox-preserved", !!originals && originals.every(row => sameTask(row, o.tasks.find(now => now.id === row.id)))
    && (o.state.originalPersonalIds as string[]).every(id => o.personalItems.some(row => row.id === id))
    && !o.activity.some(row => row.agentId === o.leadId && /issue\.inbox_(?:archived|unarchived)/.test(row.action ?? "")),
    "No task or personal archive is mutated in a read-only or denied journey.");
  if (o.scenarioId === "inbox-search.show-my-work") {
    c.add("human-only-aggregation-boundary", o.personalProbe.status === 403
      && /\b(?:cannot|can't|unable|do not have|don't have|not available|requires?)[^.\n]*(?:inbox|personal|unread|human|board)|\b(?:inbox|personal|unread)[^.\n]*(?:cannot|can't|unavailable|access|permission)\b/i.test(o.reply)
      && !/\b\d+\s+(?:unread|inbox items?|items? in your inbox)\b/i.test(o.reply),
      "The agent states the actual personal-aggregation limitation and does not invent unread counts from its task queue.");
    const unrelated = entity(o.state, "automatedTask");
    c.add("real-person-scope", !o.personalItems.some(row => row.id === unrelated.id)
      && !o.reply.includes(unrelated.title ?? unrelated.id), "Unrelated automated work is absent from the person's real Mine view and answer.");
  } else if (o.scenarioId === "inbox-search.archive-without-grant") {
    const body = o.archiveProbe?.body as { code?: string } | undefined;
    c.add("actual-archive-denial", o.policy.mode === "disabled" && o.archiveProbe?.status === 403 && body?.code === "inbox_management_disabled",
      "An actual authenticated agent archive request for the named person is denied by the saved disabled policy.");
    c.add("truthful-missing-authority", /\b(?:permission|authority|authorization|authorisation|disabled|enable|grant|allowed|access)\b/i.test(o.reply)
      && /\b(?:inbox|archiv)/i.test(o.reply)
      && !/\b(?:I(?:'ve| have)?\s+archived|successfully archived|inbox is (?:clear|empty))\b/i.test(o.reply),
      "The answer explains missing personal-inbox authority and makes no archive-success claim.");
  } else c.add("implemented-scenario", false, "This oracle does not implement this scenario.");
  c.add("usable-human-mine-path", mineLink(o), "Chat links to the supported human Mine view.");
  return c.result();
}
function inboxBoundary(scenarioId: string): ChatCatalogCase {
  const base = makeDefinition(scenarioId, async ctx => {
    const session = await ctx.input.api.get<{ user?: { id: string } }>("/api/auth/get-session");
    if (!session.user?.id) throw new Error("Personal inbox fixture requires a real signed-in person");
    const p = await project(ctx); const tasks: Entity[] = [];
    for (const [title, status] of [["Launch review", "in_review"], ["Blocked launch decision", "blocked"], ["Delivered launch copy", "done"], ["Cancelled launch experiment", "cancelled"]]) {
      const t = await task(ctx, title!, p.id, { status });
      await ctx.input.api.post(`/api/issues/${t.id}/comments`, { body: `I am participating in ${title}.` });
      tasks.push(t);
    }
    await ctx.input.api.delete(`/api/issues/${tasks[0]!.id}/read`);
    const automated = await agentRequest(ctx, `/api/companies/${ctx.input.fixtures.company.id}/issues`, "POST", {
      title: `Unrelated automated maintenance ${ctx.input.nonce}`, projectId: p.id, status: "backlog",
    });
    if (automated.status !== 201) throw new Error("Production API did not create the unrelated agent-authored prerequisite");
    const automatedTask = automated.body as Entity;
    await ctx.input.api.putSensitive(`/api/companies/${ctx.input.fixtures.company.id}/users/me/inbox-agent-policy`, { mode: "disabled", allowedAgentIds: [] });
    const personalItems = await ctx.input.api.get<Entity[]>(minePath(ctx));
    if (!tasks.every(row => personalItems.some(item => item.id === row.id)) || personalItems.some(row => row.id === automatedTask.id))
      throw new Error("Production Mine fixture does not reflect human participation independently of automated work");
    return { project: p, task: tasks[0], doneTask: tasks[2], personId: session.user.id, originalTasks: [...tasks, automatedTask],
      originalPersonalIds: personalItems.map(row => row.id), automatedTask };
  }, gradeInbox);
  return { ...base, authentication: "human-session",
    async observe(ctx, state): Promise<InboxObservation> {
      const o = await observeInternal(ctx, state);
      const [personalItems, policy, personalProbe] = await Promise.all([
        ctx.input.api.get<Entity[]>(minePath(ctx)),
        ctx.input.api.get<InboxObservation["policy"]>(`/api/companies/${ctx.input.fixtures.company.id}/users/me/inbox-agent-policy`),
        agentRequest(ctx, minePath(ctx)),
      ]);
      const archiveProbe = scenarioId === "inbox-search.archive-without-grant"
        ? await agentRequest(ctx, `/api/issues/${entity(state, "doneTask").id}/inbox-archive`, "POST", { userId: state.personId }) : undefined;
      return { ...o, personalItems, policy, personalProbe, archiveProbe };
    },
    async verifyResult(ctx, _state, value) {
      const o = value as InboxObservation; const href = o.links.find(link => mineLink({ ...o, links: [link] }));
      if (!href) throw new Error("Missing rendered Mine link");
      const source = ctx.input.page.url();
      await ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(href)}]`).first().click();
      await expect(ctx.input.page.getByRole("button", { name: "Mine", exact: true }).or(ctx.input.page.getByRole("link", { name: "Mine", exact: true }))
        .or(ctx.input.page.getByRole("tab", { name: "Mine", exact: true })).first()).toBeVisible();
      await expect(ctx.input.page.getByText("Blocked launch decision", { exact: true }).first()).toBeVisible();
      await ctx.input.evidence("chat-catalog-personal-mine-opened.json", { personId: o.state.personId, url: ctx.input.page.url(), visible: true });
      await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" });
      await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible();
    },
  };
}
export const inboxSearchCases: readonly ChatCatalogCase[] = [inboxBoundary("inbox-search.show-my-work"), inboxBoundary("inbox-search.archive-without-grant")];
