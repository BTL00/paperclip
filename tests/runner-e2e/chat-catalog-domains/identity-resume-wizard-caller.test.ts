import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ calls: [] as string[], input: undefined as Record<string, unknown> | undefined, fail: false, observed: [] as unknown[] }));
vi.mock("./identity-auth.js", () => ({ createAuthenticatedPerson: async () => {
  state.calls.push("create-human");
  return { id: "human", context: { request: {}, newPage: async () => ({}) }, bindApiSession() { state.calls.push("bind-session"); }, dispose: async () => { state.calls.push("dispose-human"); } };
} }));
vi.mock("../api.js", async original => ({ ...await original<object>(), RunnerApi: class {
  baseURL = "http://127.0.0.1:3100";
  async post(endpoint: string) { state.calls.push(endpoint); }
  async get(endpoint: string) { state.calls.push(endpoint); return { user: { id: "human" } }; }
  async delete(endpoint: string) { state.calls.push(`DELETE ${endpoint}`); }
} }));
vi.mock("./identity-resume-wizard-native.js", () => ({ finishNativeResumeWizard: async (input: Record<string, unknown>) => {
  state.input = input; state.calls.push("private-resume");
  (input.onCompany as (id: string) => void)("saved-company");
  (input.onConnection as (companyId: string, connectionId: string, grantId: string) => void)("saved-company", "owned-account", "grant");
  if (state.fail) throw new Error("synthetic partial setup");
  return { companyId: "saved-company", firstAgentId: "saved-agent", heartbeatRunIds: [] };
} }));
import { wizardIdentityBoundaryCases } from "./identity-wizard-boundaries.js";
import type { IdentityBoundaryContext } from "./identity-boundary-contract.js";
const selected = wizardIdentityBoundaryCases.find(row => row.scenarioId === "onboarding.resume-wizard")!;
function context() {
  return { api: {}, page: { context: () => ({ browser: () => ({}) }) }, nonce: "owned", credentials: { OPENROUTER_API_KEY: "synthetic-private-key" },
    privateSecrets: [], privateDir: "/unused", deadlineAt: 600000, evidence: async () => {}, capture: async () => {}, observeResources: (value: unknown) => state.observed.push(value) } as unknown as IdentityBoundaryContext;
}
beforeEach(() => { state.calls = []; state.input = undefined; state.fail = false; state.observed = []; });
it("actual selected callback passes the original deadline and selected credential to the isolated same-ID flow", async () => {
  const ctx = context(), value = await selected.run(ctx);
  expect(state.input).toMatchObject({ credential: "synthetic-private-key", deadlineAt: 600000, companyName: "Acorn wizard owned", agentName: "Morgan" });
  expect(state.calls).toEqual(["create-human", "bind-session", "/api/bootstrap/claim", "private-resume", "/api/auth/get-session"]);
  expect(value).toMatchObject({ personId: "human", returnedPersonId: "human", resumeWizard: { companyId: "saved-company", firstAgentId: "saved-agent", heartbeatRunIds: [] } });
  expect(state.observed).toContainEqual({ companyId: "saved-company", agentId: "saved-agent", runIds: [] });
  await selected.cleanup(ctx);
  expect(state.calls.slice(-3)).toEqual(["DELETE /api/tool-connections/owned-account", "DELETE /api/companies/saved-company", "dispose-human"]);
});
it("actual partial failure still owns cleanup of created account, saved company and human session", async () => {
  const ctx = context(); state.fail = true;
  await expect(selected.run(ctx)).rejects.toThrow("synthetic partial setup"); await selected.cleanup(ctx);
  expect(state.calls.slice(-3)).toEqual(["DELETE /api/tool-connections/owned-account", "DELETE /api/companies/saved-company", "dispose-human"]);
});
it("missing selected credential fails before human or browser setup instead of falling back to another account", async () => {
  const ctx = context(); ctx.credentials = { OPENAI_API_KEY: "synthetic-other-account" };
  await expect(selected.run(ctx)).rejects.toThrow("OPENROUTER_API_KEY"); expect(state.calls).toEqual([]);
});
