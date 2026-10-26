import { expect } from "@playwright/test";
import type { ConnectionIntentInteraction } from "../../../packages/shared/src/types/issue.js";
import { definition, externalObservation, observeExternal, root, checks } from "./external-support.js";
import { pollUntil } from "../api.js";

export function gradeConnectionDecline(value: unknown) {
  const c = checks(); const o = externalObservation(value);
  c.add("complete-declined-connection-evidence", !!o, "The actual addressed connection request and persisted decline are required."); if (!o) return c.result();
  const cards = o.interactions.filter(row => row.kind === "connection_intent" && row.payload?.serviceSlug === "notion");
  const card = cards[0] as unknown as ConnectionIntentInteraction | undefined;
  c.add("single-addressed-human-decline", cards.length === 1 && !!card && card.id === o.state.intentId && card.status !== "pending"
    && card.result?.outcome === "declined" && !!card.resolvedByUserId && card.resolvedByUserId === card.addresseeUserId && !card.resolvedByAgentId
    && o.state.cardVisibleBeforeDecline === true, "The intended person visibly declines one Notion request; no replacement request is created.");
  c.add("no-connected-account-or-provider-read", o.connections.length === 0 && o.state.connectedBeforeDecline === 0
    && o.state.providerInvocations === 0, "There is no credential-bearing connection and no provider invocation after a decline.");
  c.add("post-decline-response-bound", typeof o.state.initialRunId === "string" && o.phaseReplies.some(row => row.runId !== o.state.initialRunId && o.runs.some(run => run.id === row.runId && run.status === "succeeded")), "The incomplete research explanation belongs to the actual decline continuation run.");
  const continuationReply = o.phaseReplies.filter(row => row.runId !== o.state.initialRunId).map(row => row.body).join("\n");
  c.add("honest-incomplete-research", /(?:not|couldn.t|cannot|can.t|unable|declin|without).*(?:read|connect|access|notion)|(?:notion|access).*(?:declin|not connected)/is.test(continuationReply)
    && /paste|excerpt|share|provide|copy/i.test(continuationReply), "The reply explains unavailable research and offers supplied content as an alternative.");
  return c.result();
}
export const connectionSetupExternalCases = [definition("connection-setup.notion-declined", async ctx => {
  const current = await ctx.input.api.get<{ connections: unknown[] }>(`${root(ctx)}/tools/connections`);
  if (current.connections.length) throw new Error("No-connection prerequisite violated in disposable company");
  return { connectedBeforeDecline: current.connections.length };
}, gradeConnectionDecline, {
  authentication: "human-session", expectedRunCount: 2, minimumRunCount: 1, attemptTimeoutMs: 420_000,
  sourceFiles: ["chat-catalog-domains/external-connection-setup.ts", "chat-catalog-domains/external-support.ts", "chat-catalog-domains/internal-support.ts", "chat-scenarios/connection-setup.yaml"],
  async act(ctx, state) {
    const cards = await pollUntil({ label: "addressed Notion connection request", deadlineAt: Date.now() + 150_000,
      load: async () => { await ctx.refreshIssue(); return ctx.issue() ? ctx.input.api.get<ConnectionIntentInteraction[]>(`/api/issues/${ctx.issue()!.id}/interactions`) : []; },
      accept: rows => rows.some(row => row.kind === "connection_intent" && row.payload.serviceSlug === "notion" && row.status === "pending") });
    const pending = cards.filter(row => row.kind === "connection_intent" && row.payload.serviceSlug === "notion" && row.status === "pending");
    if (pending.length !== 1) throw new Error("Expected exactly one Notion connection request");
    state.intentId = pending[0]!.id; state.initialRunId = pending[0]!.sourceRunId;
    await expect(ctx.input.page.getByText("Notion", { exact: true }).first()).toBeVisible();
    const button = ctx.input.page.getByRole("button", { name: "Not now", exact: true }); await expect(button).toBeVisible(); state.cardVisibleBeforeDecline = true; await button.click();
  },
  async observe(ctx, state) {
    // A public connection activity read is only available for real connections.
    // With zero connections there is no credential-bearing provider path. Also
    // count persisted tool gateway events to reject attempted alternate calls.
    const o = await observeExternal(ctx, state);
    const activity = await ctx.input.api.get<Array<{ action?: string }>>(`${root(ctx)}/activity?limit=1000`);
    state.providerInvocations = activity.filter(row => /tool.*(?:invoked|called|executed)/.test(row.action ?? "")).length;
    return { ...o, state };
  },
  async verifyResult(ctx, state) {
    const card = ctx.input.page.locator(`[data-interaction-id=${JSON.stringify(String(state.intentId))}]`);
    if (await card.count()) await expect(card).toContainText(/declined|not connected|not now/i);
    else await expect(ctx.input.page.getByText(/declined|not connected/i).first()).toBeVisible();
    await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible();
  },
})];
