import { expect } from "@playwright/test";
import type { McpConnection, McpConnectionSetup } from "../../../packages/shared/src/public-mcp.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { definition, externalObservation, observeExternal, root, checks } from "./external-support.js";
import { waitForReply } from "./identity-support.js";
import { beginConnection, connect, mcp, origin, type Tokens } from "../public-mcp-client.js";

const requests = new WeakMap<ChatCatalogContext, Awaited<ReturnType<typeof beginConnection>>>();
const grants = new WeakMap<ChatCatalogContext, { tokens: Tokens }>();
async function prepare(ctx: ChatCatalogContext) {
  if (origin !== ctx.input.api.baseURL) throw new Error("Public MCP fixture origin differs from the disposable server");
  if (!ctx.input.privateSecrets) throw new Error("Public MCP requires the attempt-private redaction sink");
  await ctx.input.api.patch("/api/instance/settings/experimental", { enablePublicMcp: true });
  const setup = await ctx.input.api.get<McpConnectionSetup>("/api/mcp/setup");
  if (!setup.enabled || new URL(setup.serverUrl).origin !== origin) throw new Error("Setup blocker: authenticated public MCP issuer/resource is not configured for this disposable server");
  return setup;
}
export function gradeAssistantSetup(value: unknown) {
  const c = checks(); const o = externalObservation(value);
  c.add("complete-assistant-evidence", !!o, "Current setup metadata, actual signed-in consent and grant observations are required."); if (!o) return c.result();
  if (o.scenarioId === "assistant-connections.connect-external-assistant") {
    const connections = o.state.assistantConnections as McpConnection[] | undefined;
    c.add("actual-human-scoped-grant", Array.isArray(connections) && connections.length === 1 && connections[0]?.companyId === o.companyId
      && connections[0]?.scopes.includes("paperclip:read") && !connections[0]?.scopes.includes("paperclip:write")
      && o.state.humanConsentCompleted === true, "The person completes real OAuth browser consent for the intended company and read scope.");
    c.add("actual-client-usable", o.state.clientCompanyId === o.companyId && o.state.clientReadScope === true && o.state.directRestStatus === 401,
      "The real client calls the public MCP resource; its token is not a general REST board bearer.");
    c.add("no-unauthenticated-company-hint-access", o.state.unauthenticatedMcpStatus === 401, "A company hint is not a credential or membership grant.");
    c.add("supported-setup-link", o.links.some(href => { try { const url = new URL(href, o.origin); return url.origin === o.origin && url.pathname === o.state.resultPath; } catch { return false; } }),
      "The reply links the actual company setup surface.");
  } else if (o.scenarioId === "assistant-connections.decline-consent") {
    c.add("actual-human-denied-request", o.state.consentVisible === true && o.state.callbackError === "access_denied" && o.state.callbackStateMatched === true
      && o.state.newGrantCount === 0, "The real consent Cancel action denies this request and returns its original OAuth state.");
    c.add("unrelated-grant-preserved", o.state.otherGrantBefore === o.state.otherGrantAfter && o.state.otherGrantStillUsable === true,
      "Declining one authorization preserves the unrelated real grant and its access.");
    c.add("truthful-decline", /disconnect|declin|cancel|won.t|will not|not connect|don.t/i.test(o.reply), "Chat acknowledges the declined connection without claiming success.");
  } else c.add("known-assistant-scenario", false, "A case-specific assistant oracle is required.");
  return c.result();
}
export const assistantConnectionExternalCases = [definition("assistant-connections.connect-external-assistant", async ctx => {
  const setup = await prepare(ctx);
  const response = await fetch(setup.serverUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { companyId: ctx.input.fixtures.company.id } }) });
  const unauthenticatedMcpStatus = response.status; await response.body?.cancel();
  return { setupServerUrl: setup.serverUrl, unauthenticatedMcpStatus, resultPath: `/${ctx.input.fixtures.company.issuePrefix}/apps/assistant-connection`, resultLabel: "Assistant Connection (MCP)" };
}, gradeAssistantSetup, {
  authentication: "human-session",
  sourceFiles: ["chat-catalog-domains/external-assistant-connections.ts", "chat-catalog-domains/external-support.ts", "chat-catalog-domains/internal-support.ts", "chat-catalog-domains/identity-support.ts", "public-mcp-client.ts", "chat-scenarios/assistant-connections.yaml"],
  async act(ctx, state) {
    await waitForReply(ctx); const source = ctx.input.page.url();
    const link = ctx.input.page.locator(`[id^="comment-"] a[href$="/apps/assistant-connection"]`).first(); await expect(link).toBeVisible(); await link.click();
    await expect(ctx.input.page.getByRole("main")).toContainText(String(state.setupServerUrl));
    const connection = await connect(ctx.input.page.context(), { ...ctx.input.fixtures.company, issuePrefix: ctx.input.fixtures.company.issuePrefix ?? "EVAL" }, false, ctx.input.page, ctx.input.privateSecrets!); grants.set(ctx, connection);
    state.humanConsentCompleted = true;
    const client = await mcp(connection.tokens);
    try { const result = await client.call("paperclip_connection"); state.clientCompanyId = result.structuredContent?.companyId;
      state.clientReadScope = (result.structuredContent?.scopes as string[] | undefined)?.includes("paperclip:read") === true;
    } finally { await client.close(); }
    const response = await fetch(`${origin}${root(ctx)}/issues`, { headers: { Authorization: `Bearer ${connection.tokens.access_token}` } });
    state.directRestStatus = response.status; await response.body?.cancel();
    await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" }); await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible();
  },
  async observe(ctx, state) { state.assistantConnections = await ctx.input.api.get<McpConnection[]>("/api/mcp/connections"); return observeExternal(ctx, state); },
  async cleanup(ctx) { for (const grant of await ctx.input.api.get<McpConnection[]>("/api/mcp/connections")) await ctx.input.api.delete(`/api/mcp/connections/${grant.id}`); grants.delete(ctx); },
}), definition("assistant-connections.decline-consent", async ctx => {
  await prepare(ctx); const source = ctx.input.page.url();
  const other = await connect(ctx.input.page.context(), { ...ctx.input.fixtures.company, issuePrefix: ctx.input.fixtures.company.issuePrefix ?? "EVAL" }, false, ctx.input.page, ctx.input.privateSecrets!); grants.set(ctx, other);
  const before = await ctx.input.api.get<McpConnection[]>("/api/mcp/connections");
  const request = await beginConnection(true); requests.set(ctx, request); ctx.input.privateSecrets!.push(request.verifier, request.state);
  await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" });
  return { otherGrantId: before[0]?.id, otherGrantBefore: JSON.stringify(before[0]), requestId: request.requestId };
}, gradeAssistantSetup, {
  authentication: "human-session",
  sourceFiles: ["chat-catalog-domains/external-assistant-connections.ts", "chat-catalog-domains/external-support.ts", "chat-catalog-domains/internal-support.ts", "chat-catalog-domains/identity-support.ts", "public-mcp-client.ts", "chat-scenarios/assistant-connections.yaml"],
  async act(ctx, state) {
    await waitForReply(ctx); const request = requests.get(ctx); if (!request) throw new Error("Pending authorization fixture missing");
    const source = ctx.input.page.url(); await ctx.input.page.goto(request.consentUrl);
    await expect(ctx.input.page.getByRole("heading", { name: /^Connect .+ to Paperclip$/ })).toBeVisible();
    await ctx.input.page.getByRole("radio", { name: ctx.input.fixtures.company.name, exact: true }).check();
    state.consentVisible = true;
    await ctx.input.page.getByRole("button", { name: "Cancel", exact: true }).click();
    await ctx.input.page.waitForURL(url => url.searchParams.has("error"));
    const callback = new URL(ctx.input.page.url()); state.callbackError = callback.searchParams.get("error"); state.callbackStateMatched = callback.searchParams.get("state") === request.state;
    const rows = await ctx.input.api.get<McpConnection[]>("/api/mcp/connections"); state.newGrantCount = rows.filter(row => row.id !== state.otherGrantId).length;
    state.otherGrantAfter = JSON.stringify(rows.find(row => row.id === state.otherGrantId));
    const client = await mcp(grants.get(ctx)!.tokens);
    try { state.otherGrantStillUsable = (await client.call("paperclip_connection")).structuredContent?.companyId === ctx.input.fixtures.company.id; } finally { await client.close(); }
    await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" }); await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible();
  },
  async verifyResult(ctx) { await ctx.input.page.reload({ waitUntil: "domcontentloaded" }); await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible(); },
  async cleanup(ctx) { for (const grant of await ctx.input.api.get<McpConnection[]>("/api/mcp/connections")) await ctx.input.api.delete(`/api/mcp/connections/${grant.id}`); requests.delete(ctx); grants.delete(ctx); },
})];
