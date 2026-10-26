import { randomBytes, randomUUID } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import type { RunnerApi } from "../api.js";

/** Credentials remain in this closure and the attempt redactor, never case state/evidence.
 * Call before enabling tracing on the new context, as in the public MCP suite. */
export async function createAuthenticatedPerson(input: {
  api: RunnerApi; browser: Browser; secrets: string[]; name: string; email?: string;
}) {
  const health = await input.api.get<{ deploymentMode: string }>("/api/health");
  if (health.deploymentMode !== "authenticated") throw new Error("Authenticated-person fixtures require authenticated deployment mode; implicit local board is not a human identity");
  const email = input.email ?? `chat-eval-${randomUUID()}@example.test`;
  const password = randomBytes(32).toString("base64url"); input.secrets.push(password);
  let cookie = "";
  async function auth(path: string, data: unknown) {
    const response = await fetch(new URL(`/api/auth/${path}`, input.api.baseURL), {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", Origin: input.api.baseURL, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Public authentication returned HTTP ${response.status}; details withheld`); }
    const cookies = response.headers.getSetCookie().map(value => value.split(";")[0]!).filter(value => value.includes("="));
    if (cookies.length) { cookie = cookies.join("; "); for (const value of cookies) input.secrets.push(value.slice(value.indexOf("=") + 1)); }
    return response;
  }
  const response = await auth("sign-up/email", { name: input.name, email, password });
  const user = (await response.json() as { user: { id: string; name: string } }).user;
  if (!user?.id || !cookie) throw new Error("Signup did not establish a real user session");
  const context = await input.browser.newContext({ baseURL: input.api.baseURL });
  async function installSession(target: BrowserContext) {
    await target.clearCookies();
    await target.addCookies(cookie.split("; ").map(value => ({ name: value.slice(0, value.indexOf("=")), value: value.slice(value.indexOf("=") + 1),
      url: input.api.baseURL, httpOnly: true, sameSite: "Lax" as const })));
  }
  await installSession(context);
  async function request(path: string, method = "GET", data?: unknown) {
    const url = new URL(path, input.api.baseURL);
    if (url.origin !== input.api.baseURL || !url.pathname.startsWith("/api/")) throw new Error("Person request escaped fixture API");
    return fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Cookie: cookie, Origin: input.api.baseURL,
      ...(data === undefined ? {} : { "content-type": "application/json" }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  }
  return { id: user.id, name: user.name, context, request,
    async signOut() { await auth("sign-out", {}); cookie = ""; await context.clearCookies(); },
    async signIn() { await auth("sign-in/email", { email, password }); await installSession(context); },
    async dispose() { try { if (cookie) await auth("sign-out", {}); } finally { cookie = ""; await context.close(); } },
  };
}

/** A member is admitted only by the normal authorized invite and acceptance.
 * No synthetic headers, direct memberships, or first-admin claim are used. */
export async function enrollAuthenticatedPerson(api: RunnerApi, companyId: string, person: Awaited<ReturnType<typeof createAuthenticatedPerson>>, secrets: string[], role: "operator" | "viewer" = "operator") {
  const invite = await api.postSensitive<{ id: string; token: string }>(`/api/companies/${companyId}/invites`, { allowedJoinTypes: "human", humanRole: role });
  secrets.push(invite.token);
  const response = await person.request(`/api/invites/${encodeURIComponent(invite.token)}/accept`, "POST", { requestType: "human" });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Public join request returned HTTP ${response.status}; details withheld`); }
  await response.body?.cancel();
  const requests = await api.get<Array<{ id: string; requestingUserId: string; status: string; inviteId: string }>>(`/api/companies/${companyId}/join-requests`);
  const pending = requests.filter(row => row.requestingUserId === person.id && row.inviteId === invite.id);
  if (pending.length !== 1 || !["pending_approval", "approved"].includes(pending[0]!.status)) throw new Error("Public invitation did not create one eligible scoped join request");
  // Human invitation acceptance normally auto-approves through the production
  // invited role. Retain support for a deployment's explicit approval gate.
  if (pending[0]!.status === "pending_approval") await api.post(`/api/companies/${companyId}/join-requests/${pending[0]!.id}/approve`);
  const companiesResponse = await person.request("/api/companies");
  if (!companiesResponse.ok || !(await companiesResponse.json() as Array<{ id: string }>).some(row => row.id === companyId)) throw new Error("Approved person cannot read the intended company");
  return { userId: person.id, companyId, inviteId: invite.id, joinRequestId: pending[0]!.id };
}
