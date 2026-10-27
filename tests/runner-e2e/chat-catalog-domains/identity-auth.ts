import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { privateIdentityBrowser } from "./identity-private-browser.js";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { RunnerApi } from "../api.js";

/** Finite session transfer. Only the private file path reaches Playwright Test. */
export async function installIdentitySession(target: BrowserContext, origin: string, cookie: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "identity-human-session-"));
  try {
    const file = path.join(directory, "storage.json");
    await writeFile(file, JSON.stringify({ cookies: cookie.split("; ").filter(Boolean).map(value => ({ name: value.slice(0, value.indexOf("=")), value: value.slice(value.indexOf("=") + 1),
      domain: new URL(origin).hostname, path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const })), origins: [] }), { mode: 0o600 });
    await target.setStorageState(file);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

/** Credentials remain in this closure and the attempt redactor, never case state/evidence.
 * Browser installation takes only a private state filename; password entry runs
 * in a standalone child with no Playwright Test API-step recorder. */
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
  async function installSession(target: BrowserContext) { await installIdentitySession(target, input.api.baseURL, cookie); }
  await installSession(context);
  async function request(path: string, method = "GET", data?: unknown) {
    const url = new URL(path, input.api.baseURL);
    if (url.origin !== input.api.baseURL || !url.pathname.startsWith("/api/")) throw new Error("Person request escaped fixture API");
    return fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Cookie: cookie, Origin: input.api.baseURL,
      ...(data === undefined ? {} : { "content-type": "application/json" }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  }
  return { id: user.id, name: user.name, context, request,
    async installSessionOn(target: BrowserContext) { await installSession(target); },
    bindApiSession(api: RunnerApi) {
      if (api.baseURL !== input.api.baseURL || !cookie) throw new Error("Public human API binding requires the same authenticated instance");
      api.setBrowserSession(cookie);
    },
    /** Server revocation leaves the old browser cookie in place so the next
     * navigation exercises an actually invalid session rather than a fake UI flag. */
    async expireSession() { await auth("sign-out", {}); cookie = ""; },
    async signInThroughBrowser(page: Page, returnPath: string) {
      if (page.context() !== context || !returnPath.startsWith("/") || returnPath.startsWith("//")) throw new Error("Human sign-in target must be the person's same-origin browser");
      await privateIdentityBrowser({ kind: "sign-in", origin: input.api.baseURL, startPath: page.url(), returnPath, email, password, cookies: [] }, {
        async storageState(file) {
          const state = JSON.parse(await readFile(file, "utf8")) as { cookies: Array<{ name: string; value: string }> };
          cookie = state.cookies.map(value => `${value.name}=${value.value}`).join("; ");
          for (const value of state.cookies) input.secrets.push(value.value);
          await context.setStorageState(file);
        },
      });
      await page.goto(new URL(returnPath, input.api.baseURL).href, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new URL(returnPath, input.api.baseURL).href);
      if (!cookie) throw new Error("Human browser sign-in returned no session");
    },
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
