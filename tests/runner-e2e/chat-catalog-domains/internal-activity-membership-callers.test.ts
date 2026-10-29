import { afterEach, expect, it, vi } from "vitest";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { updateUserCompanyAccessSchema, updateCompanyMemberWithPermissionsSchema } from "../../../packages/shared/src/validators/access.js";
import { grantsForHumanRole } from "../../../server/src/services/company-member-roles.js";
const controls = vi.hoisted(() => ({ person: undefined as unknown, nextStage: vi.fn(async () => { throw new Error("CONTROL: membership readback complete before native setup"); }) }));
vi.mock("./identity-auth.js", async importOriginal => ({ ...await importOriginal<object>(), createAuthenticatedPerson: vi.fn(async () => controls.person) }));
vi.mock("./internal-definition.js", async importOriginal => ({ ...await importOriginal<object>(), fixtureWorker: controls.nextStage }));
import { agentFeedbackCases } from "./internal-agent-feedback.js";
import { workTimelineCases } from "./internal-work-timeline.js";
afterEach(() => { vi.useRealTimers(); controls.nextStage.mockClear(); });
const company = "11111111-1111-4111-8111-111111111111", admin = "22222222-2222-4222-8222-222222222222", personId = "33333333-3333-4333-8333-333333333333", memberId = "44444444-4444-4444-8444-444444444444";
function fixture(scenarioId: string) {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const state = { assigned: false, missingSession: false, wrongSession: false, admin: false, wrongRole: false, foreign: false, wrongPrincipal: false, wrongGrantActor: false };
  const writes: Array<{ route: string; body: unknown }> = [], requests: string[] = [], invitations: string[] = [];
  const membership = () => ({ id: memberId, companyId: state.foreign ? "other" : company, principalType: "user", principalId: state.wrongPrincipal ? admin : personId, status: "active", membershipRole: state.wrongRole ? "viewer" : "operator" });
  const api = {
    baseURL: "http://127.0.0.1:3100",
    get: vi.fn(async (route: string) => {
      requests.push(route);
      if (route === "/api/health") return { deploymentMode: "authenticated" };
      if (route === "/api/auth/get-session") return { user: { id: admin } };
      if (route === `/api/admin/users/${admin}/company-access`) return { user: { id: admin, isInstanceAdmin: true }, companyAccess: [] };
      if (route === `/api/admin/users/${personId}/company-access`) return { user: { id: personId, isInstanceAdmin: state.admin }, companyAccess: state.assigned ? [membership()] : [] };
      if (route === `/api/companies/${company}/members`) return { members: [{ ...membership(), grants: grantsForHumanRole("operator").map(grant => ({ ...grant, companyId: company, principalId: personId, principalType: "user", grantedByUserId: state.wrongGrantActor ? personId : admin })) }] };
      throw new Error("Unexpected public setup read");
    }),
    putSensitive: vi.fn(async (route: string, body: unknown) => { updateUserCompanyAccessSchema.parse(body); writes.push({ route, body }); state.assigned = true; return { user: { id: personId, isInstanceAdmin: false }, companyAccess: [{ ...membership(), membershipRole: "operator" }] }; }),
    patchSensitive: vi.fn(async (route: string, body: unknown) => { updateCompanyMemberWithPermissionsSchema.parse(body); writes.push({ route, body }); return membership(); }),
    postSensitive: vi.fn(async (route: string) => { invitations.push(route); throw new Error("Unexpected invitation dependency before frozen activity context"); }),
  };
  const person = { id: personId, dispose: vi.fn(async () => undefined), request: vi.fn(async (route: string, method = "GET") => {
    requests.push(`person:${method}:${route}`);
    if (route === "/api/auth/get-session") return new Response(JSON.stringify(state.missingSession ? {} : { user: { id: state.wrongSession ? admin : personId } }));
    if (route === `/api/companies/${company}`) return new Response(JSON.stringify({ id: company }), { status: state.assigned ? 200 : 403 });
    if (route === "/api/admin/users") return new Response("denied", { status: 403 });
    if (route === `/api/companies/${company}/issues` && method === "POST") return controls.nextStage();
    throw new Error("Unexpected real-person fixture operation");
  }) };
  controls.person = person;
  const evidence = vi.fn(async () => undefined);
  const ctx = { scenario: { id: scenarioId }, observationDeadlineAt: 100000, input: { nonce: "owned-control", execution: { id: `chat-features.runner-opencode.local.${scenarioId}` },
    api, fixtures: { company: { id: company }, agent: { id: "lead" } }, privateSecrets: [], page: { context: () => ({ browser: () => ({}) }) }, evidence } } as unknown as ChatCatalogContext;
  const implementation = [...agentFeedbackCases, ...workTimelineCases].find(row => row.scenarioId === scenarioId)!;
  return { ctx, implementation, state, writes, requests, invitations, evidence };
}
it.each(["activity.agent-feedback", "activity.work-timeline"])("actual activity setup %s establishes Casey through supported public membership before any native setup", async id => {
  const f = fixture(id);
  await expect(f.implementation.setup(f.ctx)).rejects.toThrow("CONTROL: membership readback complete before native setup");
  expect(f.writes).toEqual([{ route: `/api/admin/users/${personId}/company-access`, body: { companyIds: [company] } },
    { route: `/api/companies/${company}/members/${memberId}/role-and-grants`, body: { membershipRole: "operator", status: "active", grants: grantsForHumanRole("operator") } }]);
  expect(f.evidence).toHaveBeenCalledWith("identity-public-prerequisite-membership.json", expect.objectContaining({ userId: personId, companyId: company, role: "operator", beforeStatus: 403, companyReadStatus: 200, instanceAdminReadStatus: 403 }));
  expect(f.invitations).toEqual([]); expect(f.requests.some(route => /invites|join-requests/.test(route))).toBe(false);
  expect(controls.nextStage).toHaveBeenCalledOnce();
});
it.each(["activity.agent-feedback", "activity.work-timeline"].flatMap(id => ["missingSession", "wrongSession", "admin", "wrongRole", "foreign", "wrongPrincipal", "wrongGrantActor"].map(invalid => [id, invalid])))("actual %s caller rejects %s public principal/grant corruption before work", async (id, invalid) => {
  const f = fixture(id); Object.assign(f.state, { [invalid]: true });
  await expect(f.implementation.setup(f.ctx)).rejects.toThrow();
  expect(f.evidence).not.toHaveBeenCalled(); expect(controls.nextStage).not.toHaveBeenCalled(); expect(f.invitations).toEqual([]);
});
