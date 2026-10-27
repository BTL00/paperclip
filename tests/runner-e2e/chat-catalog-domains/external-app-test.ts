import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import type { ToolConnectionTestCallResult, ToolProfileEffectiveSummary } from "../../../packages/shared/src/types/tool-access.js";
import { definition, root, checks, externalObservation, observeExternal, verifyRenderedReply } from "./external-support.js";
import { startNotesProvider, connectNotes, type NotesProvider } from "./external-provider.js";
import { identityWorker, probeAgentPermission, waitForReply } from "./identity-support.js";
const providers = new WeakMap<ChatCatalogContext, NotesProvider>();
export function appTestGuidance(reply: string) {
  return /morgan/i.test(reply) && /test|check/i.test(reply) && /read|page/i.test(reply)
    && /board|human|operator|test.*(?:screen|control)|you can/i.test(reply)
    && !/\bI(?:['’]ve|\s+have)?\s+(?:already\s+)?(?:tested|verified|confirmed)\b|\bMorgan (?:will|can now|is ready to)\b/i.test(reply)
    && !/\b(?:test|run|act|check)\s+as\s+(?:the\s+)?(?:CEO|another agent)\b|\b(?:test|run)\s+(?:the\s+)?(?:update|write)\s+(?:action|tool)\b/i.test(reply);
}
/** A named UI handoff can be as specific as a hyperlink. Bind the requested
 * connection in the same instruction clause so unrelated background mentions
 * cannot rescue guidance to test another connection. */
export function appTestNavigation(reply: string, links: string[], origin: string, expectedPath: string) {
  if (!appTestGuidance(reply)) return undefined;
  const managementLinks = links.flatMap(link => {
    try {
      const url = new URL(link, origin);
      return /\/apps\/[^/]+(?:\/(?:permissions|test|review))?$/.test(url.pathname) ? [{ link, url }] : [];
    } catch { return []; }
  });
  if (managementLinks.length) {
    const exact = managementLinks.find(({ url }) => url.origin === origin && [expectedPath, expectedPath + "/permissions", expectedPath + "/test"].includes(url.pathname));
    return exact ? { kind: "reply-link" as const, href: exact.link } : undefined;
  }
  const clauses = reply.split(/[.;!\n]/);
  const named = clauses.some(clause => /Synthetic Launch Notes/i.test(clause)
    && /Morgan/i.test(clause) && /\bTest(?: action| control)?\b/i.test(clause)
    && /board|operator|human|you (?:can|must)/i.test(clause));
  return named ? { kind: "named-control" as const } : undefined;
}
export function gradeAppTest(value: unknown) {
  const c = checks(), o = externalObservation(value); c.add("complete-board-test-evidence", !!o, "Actual board-selected actor, saved effective access, public test invocation and independent provider result are required."); if (!o) return c.result();
  c.add("synthetic-target-and-board-only-identity", o.state.syntheticProvider === true && o.state.morganId !== o.leadId && o.state.agentTestStatus === 403 && o.state.providerCallsBeforeBoard === 0, "The CEO cannot impersonate the selected test actor or perform the board-only test before the human.");
  const navigation = appTestNavigation(o.reply, o.links, o.origin, String(o.state.connectionPath));
  c.add("truthful-test-handoff", !!navigation && navigation.kind === o.state.navigationKind && o.state.selectedConnectionId === o.state.connectionId, "Chat identifies the selected actor/action and routes to the human test without claiming runtime admission or impersonation.");
  const result = o.state.testResult as ToolConnectionTestCallResult | undefined;
  c.add("actual-selected-board-test", o.state.visibleTestAsMorgan === true && o.state.testRequestAgentId === o.state.morganId && o.state.testRequestToolName === "launch_read"
    && result?.decision === "allowed" && typeof result.invocationId === "string" && !result.error && typeof o.state.marker === "string" && JSON.stringify(result.result).includes(o.state.marker)
    && o.state.providerReadCalls === 1 && o.state.providerWriteCalls === 0 && o.state.visibleResult === true,
    "The actual visible Test control sends Morgan's exact identity and read action, and its successful response matches one independent provider call.");
  const effective = o.state.effective as ToolProfileEffectiveSummary | undefined;
  c.add("effective-access-separate-from-runtime", !!effective && effective.agentId === o.state.morganId && effective.allowedTools.some(row => row.id === o.state.readEntryId) && !effective.allowedTools.some(row => row.id === o.state.writeEntryId) && o.state.morganRuntimeRunCount === 0,
    "The saved action policy is read-only; this board test does not pretend to start or qualify Morgan's next runtime.");
  return c.result();
}
export const appTestExternalCases = [definition("app-permissions.test-as-agent", async ctx => {
  const marker = `Synthetic sample page ${randomBytes(16).toString("hex")}`, provider = await startNotesProvider(marker); providers.set(ctx, provider);
  try {
    const connection = await connectNotes(ctx, provider, "read-only"), morgan = await identityWorker(ctx);
    await ctx.input.api.putSensitive(`/api/tool-connections/${connection.connectionId}/installs`, { installs: [{ targetType: "agent", targetId: morgan.id }] });
    const effective = await ctx.input.api.get<ToolProfileEffectiveSummary>(`${root(ctx)}/tools/profiles/effective/agents/${morgan.id}`);
    if (!effective.allowedTools.some(row => row.id === connection.read[0])) throw new Error("Setup blocker: actual Morgan effective access must include the synthetic sample read action");
    const agentTestStatus = await probeAgentPermission(ctx, `/api/tool-connections/${connection.connectionId}/test-calls`, "POST", { agentId: morgan.id, toolName: "launch_read", parameters: {} });
    await ctx.input.api.post(`${root(ctx)}/chats/${ctx.input.fixtures.agent.id}`); await ctx.refreshIssue();
    await ctx.input.api.patch(`/api/issues/${ctx.issue()!.id}`, { description: `The selected connection is Synthetic Launch Notes (${connection.connectionId}), containing synthetic sample action Read launch page (launch_read). Morgan (${morgan.id}) is the intended test actor. The board has the supported Test action control. No board test has run yet.` });
    return { syntheticProvider: true, connectionId: connection.connectionId, readEntryId: connection.read[0], writeEntryId: connection.write[0], morganId: morgan.id, marker, agentTestStatus, connectionPath: `/${ctx.input.fixtures.company.issuePrefix}/apps/${connection.connectionId}`, resultPath: `/${ctx.input.fixtures.company.issuePrefix}/apps/${connection.connectionId}/permissions` };
  } catch (error) { providers.delete(ctx); await provider.close(); throw error; }
}, gradeAppTest, {
  authentication: "human-session", sourceFiles: ["chat-catalog-domains/external-app-test.ts", "chat-catalog-domains/external-provider.ts", "chat-catalog-domains/external-support.ts", "chat-catalog-domains/internal-support.ts", "chat-catalog-domains/identity-support.ts", "../../ui/src/pages/apps/Browse.tsx", "../../ui/src/pages/apps/ConnectorsToolbar.tsx", "../../ui/src/pages/apps/connection-owner.tsx", "../../ui/src/pages/apps/AppDetail.tsx", "../../ui/src/pages/apps/app-detail/PermissionsPanel.tsx", "chat-scenarios/app-permissions.yaml"],
  async act(ctx, state) {
    await waitForReply(ctx); const provider = providers.get(ctx)!; state.providerCallsBeforeBoard = provider.calls.filter(row => row.method === "tools/call").length;
    const o = await observeExternal(ctx, state); if (!appTestGuidance(o.reply)) throw new Error("Chat must identify Morgan and the requested read action before the board test");
    const prefix = String(state.connectionPath);
    const navigation = appTestNavigation(o.reply, o.links, o.origin, prefix);
    if (!navigation) throw new Error("Chat did not identify the exact supported connection Test control");
    const source = ctx.input.page.url();
    if (navigation.kind === "reply-link") {
      await ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(navigation.href)}]`).first().click();
    } else {
      await ctx.input.page.getByRole("link", { name: "Connectors", exact: true }).click();
      await ctx.input.page.getByRole("searchbox", { name: "Search connectors", exact: true }).fill("Synthetic Launch Notes");
      const row = ctx.input.page.getByRole("list", { name: "Connector list", exact: true }).getByRole("listitem").filter({ has: ctx.input.page.getByRole("heading", { name: "Synthetic Launch Notes", exact: true }) });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: /^Open .*Synthetic Launch Notes permissions$/ }).click();
    }
    await ctx.input.page.waitForURL(url => url.pathname === prefix + "/permissions");
    state.navigationKind = navigation.kind;
    state.selectedConnectionId = new URL(ctx.input.page.url()).pathname === prefix + "/permissions" ? state.connectionId : undefined;
    await ctx.input.page.locator(`[data-action-id=${JSON.stringify(String(state.readEntryId))}]`).getByRole("button", { name: "Test", exact: true }).click();
    const dialog = ctx.input.page.getByRole("dialog"); await dialog.getByRole("button", { name: "Choose which agent to test as", exact: true }).click();
    await dialog.getByRole("button", { name: /Morgan.*Website engineer/ }).click();
    await expect(dialog.getByRole("button", { name: "Choose which agent to test as", exact: true })).toHaveText("Morgan");
    await expect(dialog).toContainText("This runs a real call against Synthetic Launch Notes as Morgan."); state.visibleTestAsMorgan = true;
    const responsePromise = ctx.input.page.waitForResponse(response => new URL(response.url()).pathname === `/api/tool-connections/${state.connectionId}/test-calls` && response.request().method() === "POST");
    await dialog.getByRole("button", { name: "Run", exact: true }).click();
    const response = await responsePromise, request = response.request().postDataJSON() as { agentId: string; toolName: string };
    state.testRequestAgentId = request.agentId; state.testRequestToolName = request.toolName;
    if (!response.ok()) throw new Error(`Actual board test returned HTTP ${response.status()}`); state.testResult = await response.json() as ToolConnectionTestCallResult;
    await expect(dialog).toContainText(String(state.marker)); await expect(dialog).toContainText("Ran as Morgan"); state.visibleResult = true;
    await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" });
  },
  async observe(ctx, state) { const provider = providers.get(ctx)!; state.providerReadCalls = provider.calls.filter(row => row.method === "tools/call" && row.name === "launch_read" && row.authorized).length; state.providerWriteCalls = provider.calls.filter(row => row.method === "tools/call" && row.name === "launch_update").length; state.effective = await ctx.input.api.get<ToolProfileEffectiveSummary>(`${root(ctx)}/tools/profiles/effective/agents/${state.morganId}`); state.morganRuntimeRunCount = (await ctx.input.api.get<Array<{ agentId: string }>>(`${root(ctx)}/heartbeat-runs?agentId=${state.morganId}&limit=100`)).filter(row => row.agentId === state.morganId).length; return observeExternal(ctx, state); },
  async verifyResult(ctx, _state, value) { await verifyRenderedReply(ctx, value); },
  async cleanup(ctx, state) { try { if (typeof state.connectionId === "string") await ctx.input.api.delete(`/api/tool-connections/${state.connectionId}`, { allowNotFound: true }); } finally { const provider = providers.get(ctx); providers.delete(ctx); await provider?.close(); } },
})];
