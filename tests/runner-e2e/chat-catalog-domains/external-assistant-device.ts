import { expect } from "@playwright/test";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import { definition, externalObservation, observeExternal, checks, verifyRenderedReply } from "./external-support.js";
import { waitForReply } from "./identity-support.js";
import { oauthPost, mcp, origin, resource, type Tokens } from "../public-mcp-client.js";

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
interface DeviceCode { device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; expires_in: number; interval: number }
interface DeviceFixture { clientId: string; otherClientId: string; primary: DeviceCode; expiring: DeviceCode; expiresAt: number; polledAt: number; tokens?: Tokens }
const fixtures = new WeakMap<ChatCatalogContext, DeviceFixture>();
async function requestDevice(clientId: string, companyId: string): Promise<DeviceCode> {
  const response = await oauthPost("device_authorization", { client_id: clientId, resource, company_id: companyId, scope: "paperclip:read offline_access" });
  if (response.status !== 200) { await response.body?.cancel(); throw new Error("Device authorization setup failed; response withheld"); }
  return response.json() as Promise<DeviceCode>;
}
async function registerClient() {
  const response = await oauthPost("register", { client_name: "Paperclip disposable CLI", application_type: "native", redirect_uris: [], grant_types: [DEVICE_GRANT, "refresh_token"] });
  if (response.status !== 201) { await response.body?.cancel(); throw new Error("Disposable CLI registration failed; response withheld"); }
  return (await response.json() as { client_id: string }).client_id;
}
async function exchange(fixture: DeviceFixture, code: DeviceCode, override: Record<string, unknown> = {}) {
  return oauthPost("token", { grant_type: DEVICE_GRANT, client_id: fixture.clientId, device_code: code.device_code, resource, ...override });
}
export function gradeDeviceLogin(value: unknown) {
  const c = checks(), o = externalObservation(value);
  c.add("complete-device-evidence", !!o, "Actual CLI device request, browser consent, token/resource tests and real expiration are required."); if (!o) return c.result();
  c.add("correct-human-verification", o.state.verificationPath === "/mcp-device" && o.state.currentCodeVisible === true && o.state.companyConsentVisible === true && o.state.readScopeVisible === true
    && o.state.humanApproved === true && o.state.clientCompanyId === o.companyId && o.state.clientReadOnly === true,
    "The person follows the issuer's actual page/current code and authorizes exactly the intended company and read scope.");
  c.add("pending-without-human-approval", o.state.pendingError === "authorization_pending", "The waiting CLI cannot obtain credentials before human approval.");
  c.add("resource-and-client-mismatch-denied", o.state.wrongResourceDenied === true && o.state.wrongClientDenied === true && o.state.correctExchangeSucceeded === true,
    "Mismatched resource/client requests fail without consuming the valid selected grant.");
  c.add("spent-code-denied", o.state.reusedCodeDenied === true, "A consumed device code cannot mint another credential.");
  c.add("actually-expired-code-denied", o.state.expirationWaitMs === 600_000 && Number(o.state.elapsedBeforeExpiryProbe) >= 600_000
    && o.state.expiredCodeDenied === true && o.state.expiredPageVisible === true, "A distinct real code expires under the actual issuer clock and the browser and token endpoint reject it.");
  c.add("supported-guidance", /device|code|CLI/i.test(o.reply) && /sign.in|verif|connect/i.test(o.reply)
    && !/I (?:have )?(?:approved|signed in|authorized).*?(?:you|your behalf)/i.test(o.reply), "Chat guides the human without self-consent or impersonation.");
  return c.result();
}
export const assistantDeviceExternalCases = [definition("assistant-connections.device-login", async ctx => {
  if (origin !== ctx.input.api.baseURL || !ctx.input.privateSecrets) throw new Error("Device setup requires the owned issuer and private redaction context");
  await ctx.input.api.patch("/api/instance/settings/experimental", { enablePublicMcp: true });
  const setup = await ctx.input.api.get<{ enabled: boolean; serverUrl: string }>("/api/mcp/setup");
  if (!setup.enabled || setup.serverUrl !== resource) throw new Error("Setup blocker: this disposable instance has no compatible public MCP issuer/resource");
  const clientId = await registerClient(), otherClientId = await registerClient();
  const primary = await requestDevice(clientId, ctx.input.fixtures.company.id), expiring = await requestDevice(clientId, ctx.input.fixtures.company.id);
  if (primary.expires_in !== 600 || expiring.expires_in !== 600 || primary.verification_uri !== `${origin}/mcp-device`) throw new Error("Declared bounded device-code lifetime or verification origin differs from the real issuer");
  ctx.input.privateSecrets.push(primary.device_code, primary.user_code, expiring.device_code, expiring.user_code);
  const expiresAt = Date.now() + expiring.expires_in * 1000;
  const fixture = { clientId, otherClientId, primary, expiring, expiresAt, polledAt: Date.now() }; fixtures.set(ctx, fixture);
  const pending = await exchange(fixture, primary); const pendingBody = await pending.json() as { error?: string };
  return { verificationPath: new URL(primary.verification_uri).pathname, pendingError: pendingBody.error, expirationWaitMs: 600_000 };
}, gradeDeviceLogin, {
  authentication: "human-session", attemptTimeoutMs: 780_000,
  sourceFiles: ["chat-catalog-domains/external-assistant-device.ts", "chat-catalog-domains/external-support.ts", "chat-catalog-domains/internal-support.ts", "chat-catalog-domains/identity-support.ts", "public-mcp-client.ts", "chat-scenarios/assistant-connections.yaml"],
  async act(ctx, state) {
    await waitForReply(ctx); const fixture = fixtures.get(ctx); if (!fixture) throw new Error("Device fixture missing");
    const source = ctx.input.page.url(); await ctx.input.page.goto(fixture.primary.verification_uri_complete);
    await expect(ctx.input.page.getByRole("heading", { name: /^Connect .+ to Paperclip$/ })).toBeVisible();
    await expect(ctx.input.page.getByText(fixture.primary.user_code.toUpperCase(), { exact: true })).toBeVisible(); state.currentCodeVisible = true;
    await expect(ctx.input.page.getByText(ctx.input.fixtures.company.name, { exact: true })).toBeVisible(); state.companyConsentVisible = true;
    await expect(ctx.input.page.getByText("Read all of your Paperclip data", { exact: true })).toBeVisible(); state.readScopeVisible = true;
    await ctx.input.page.getByRole("button", { name: "Connect organization", exact: true }).click();
    await expect(ctx.input.page.getByText(/connected|approved/i).first()).toBeVisible(); state.humanApproved = true;
    const wrongResource = await exchange(fixture, fixture.primary, { resource: origin + "/mcp/not-the-resource" }); state.wrongResourceDenied = wrongResource.status === 400; await wrongResource.body?.cancel();
    const wrongClient = await exchange(fixture, fixture.primary, { client_id: fixture.otherClientId }); state.wrongClientDenied = wrongClient.status === 400; await wrongClient.body?.cancel();
    if (Date.now() < fixture.polledAt + fixture.primary.interval * 1000) await pollUntil({ label: "advertised device polling interval", deadlineAt: Date.now() + 15_000, intervalMs: 200, load: async () => Date.now(), accept: now => now >= fixture.polledAt + fixture.primary.interval * 1000 });
    const correct = await exchange(fixture, fixture.primary); state.correctExchangeSucceeded = correct.status === 200;
    if (!correct.ok) { await correct.body?.cancel(); throw new Error("Approved device exchange failed; response withheld"); }
    fixture.tokens = await correct.json() as Tokens; ctx.input.privateSecrets!.push(fixture.tokens.access_token, fixture.tokens.refresh_token);
    const client = await mcp(fixture.tokens);
    try { const receipt = (await client.call("paperclip_connection")).structuredContent; state.clientCompanyId = receipt?.companyId;
      state.clientReadOnly = Array.isArray(receipt?.scopes) && receipt.scopes.includes("paperclip:read") && !receipt.scopes.includes("paperclip:write");
    } finally { await client.close(); }
    const reused = await exchange(fixture, fixture.primary); state.reusedCodeDenied = reused.status === 400; await reused.body?.cancel();
    // Deliberately spend the issuer's actual 10-minute lifetime, never mock time,
    // rewrite database expiry or silently relax an observed failed deadline.
    await pollUntil({ label: "real unused device-code expiration", deadlineAt: fixture.expiresAt + 15_000, intervalMs: 1000,
      load: async () => Date.now(), accept: now => now >= fixture.expiresAt + 500 });
    state.elapsedBeforeExpiryProbe = Date.now() - (fixture.expiresAt - 600_000);
    const expired = await exchange(fixture, fixture.expiring); const body = await expired.json() as { error?: string };
    state.expiredCodeDenied = expired.status === 400 && body.error === "expired_token";
    await ctx.input.page.goto(fixture.expiring.verification_uri_complete);
    await expect(ctx.input.page.getByText(/expired|invalid/i).first()).toBeVisible(); state.expiredPageVisible = true;
    await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" });
  },
  async observe(ctx, state) { return observeExternal(ctx, state); },
  async verifyResult(ctx, _state, value) { await verifyRenderedReply(ctx, value); },
  async cleanup(ctx) { for (const grant of await ctx.input.api.get<Array<{ id: string }>>("/api/mcp/connections")) await ctx.input.api.delete(`/api/mcp/connections/${grant.id}`); fixtures.delete(ctx); },
})];
