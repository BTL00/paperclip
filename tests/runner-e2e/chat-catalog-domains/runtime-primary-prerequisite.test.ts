import { afterEach, expect, it, vi } from "vitest";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { updateUserCompanyAccessSchema, updateCompanyMemberWithPermissionsSchema } from "../../../packages/shared/src/validators/access.js";
import { grantsForHumanRole } from "../../../server/src/services/company-member-roles.js";
const owned = vi.hoisted(() => ({ person: undefined as unknown }));
vi.mock("./identity-auth.js", async original => ({ ...await original<object>(),
  createAuthenticatedPerson: vi.fn(async () => owned.person),
  enrollAuthenticatedPerson: vi.fn(async () => { throw new Error("Invitation path must not run for primary preference context"); }),
}));
vi.mock("./runtime-support.js", async original => ({ ...await original<object>(), runtimeWorker: vi.fn(async () => ({ id: "morgan", companyId: "11111111-1111-4111-8111-111111111111" })) }));
import { createAuthenticatedPerson, enrollAuthenticatedPerson } from "./identity-auth.js";
import { runtimePrimaryCases } from "./runtime-primary.js";
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const member = { id: "membership", companyId: "11111111-1111-4111-8111-111111111111", principalId: "person", principalType: "user", membershipRole: "operator", status: "active" };
  const state = { assigned: false, admin: true, targetAdmin: false, personalId: "person", companyId: "11111111-1111-4111-8111-111111111111", role: "operator", grantActor: "admin", grantsForeign: false, extraGrant: false, failOtherRead: false, failCompanyCreate: false, failDispose: false };
  const primary = { companyId: "11111111-1111-4111-8111-111111111111", userId: "admin", primaryAgentId: "ceo" };
  const api = {
    get: vi.fn(async (route: string) => {
      if (route === "/api/companies/11111111-1111-4111-8111-111111111111/primary-agent/me") return primary;
      if (route === "/api/companies/owned-other/primary-agent/me") { if (state.failOtherRead) throw new Error("other primary read failed"); return { companyId: "owned-other", userId: "admin", primaryAgentId: null }; }
      if (route === "/api/health") return { deploymentMode: "authenticated" };
      if (route === "/api/auth/get-session") return { user: { id: "admin" } };
      if (route === "/api/admin/users/admin/company-access") return { user: { id: "admin", isInstanceAdmin: state.admin }, companyAccess: [] };
      if (route === "/api/admin/users/person/company-access") return { user: { id: "person", isInstanceAdmin: state.targetAdmin }, companyAccess: state.assigned ? [{ ...member, membershipRole: state.role }] : [] };
      if (route === "/api/companies/11111111-1111-4111-8111-111111111111/members") return { members: [{ ...member, membershipRole: state.role, grants: [...grantsForHumanRole("operator"), ...(state.extraGrant ? [{ permissionKey: "users:manage_permissions", scope: null }] : [])].map(g => ({ ...g, companyId: state.grantsForeign ? "foreign" : "11111111-1111-4111-8111-111111111111", principalId: "person", principalType: "user", grantedByUserId: state.grantActor })) }] };
      throw new Error("Unexpected public primary setup read");
    }),
    putSensitive: vi.fn(async (_route: string, body: unknown) => { updateUserCompanyAccessSchema.parse(body); state.assigned = true; return { user: { id: "person", isInstanceAdmin: state.targetAdmin }, companyAccess: [member] }; }),
    patchSensitive: vi.fn(async (_route: string, body: unknown) => { updateCompanyMemberWithPermissionsSchema.parse(body); return member; }),
    post: vi.fn(async (route: string) => { if (route !== "/api/companies") throw new Error("Unexpected public setup write"); if (state.failCompanyCreate) throw new Error("company create failed"); return { id: "owned-other" }; }),
    delete: vi.fn(async () => undefined),
  };
  const person = { id: "person", request: vi.fn(async (route: string) => {
    if (route === "/api/auth/get-session") return new Response(JSON.stringify({ user: { id: state.personalId } }));
    if (route === "/api/companies/11111111-1111-4111-8111-111111111111") return new Response(JSON.stringify({ id: state.companyId }), { status: state.assigned ? 200 : 403 });
    if (route === "/api/admin/users") return new Response("closed", { status: 403 });
    if (route === "/api/companies/11111111-1111-4111-8111-111111111111/primary-agent/me") return new Response(JSON.stringify({ companyId: "11111111-1111-4111-8111-111111111111", userId: "person", primaryAgentId: null }));
    throw new Error("Unexpected secondary session read");
  }), dispose: vi.fn(async () => { if (state.failDispose) throw new Error("owned person disposal failed"); }) };
  owned.person = person;
  const ctx = { scenario: { id: "agents.choose-primary" }, observationDeadlineAt: 100000,
    input: { privateSecrets: [], page: { context: () => ({ browser: () => ({}) }) }, execution: { id: "chat-features.runner-opencode.local.agents.choose-primary" }, nonce: "test", api, fixtures: { company: { id: "11111111-1111-4111-8111-111111111111" }, agent: { id: "ceo" } }, evidence: vi.fn() } } as unknown as ChatCatalogContext;
  return { ctx, api, person, state };
}
it("actual primary setup establishes the existing independent operator by public membership without any invitation", async () => {
  const f = fixture(); const result = await runtimePrimaryCases[0]!.setup(f.ctx);
  expect(result).toMatchObject({ worker: { id: "morgan" }, primaryBefore: { primaryAgentId: "ceo" }, otherCompany: { id: "owned-other" }, otherPersonBefore: { userId: "person", primaryAgentId: null } });
  expect(enrollAuthenticatedPerson).not.toHaveBeenCalled(); expect(createAuthenticatedPerson).toHaveBeenCalledOnce();
  expect(f.api.putSensitive).toHaveBeenCalledExactlyOnceWith("/api/admin/users/person/company-access", { companyIds: ["11111111-1111-4111-8111-111111111111"] });
  expect(f.api.patchSensitive).toHaveBeenCalledWith("/api/companies/11111111-1111-4111-8111-111111111111/members/membership/role-and-grants", { membershipRole: "operator", status: "active", grants: grantsForHumanRole("operator") });
  expect(f.person.request).toHaveBeenCalledWith("/api/companies/11111111-1111-4111-8111-111111111111/primary-agent/me");
  expect(f.person.dispose).not.toHaveBeenCalled(); expect(f.api.delete).not.toHaveBeenCalled();
  await runtimePrimaryCases[0]!.cleanup!(f.ctx, result); expect(f.person.dispose).toHaveBeenCalledOnce();
  expect(f.api.delete).toHaveBeenCalledExactlyOnceWith("/api/companies/owned-other", { allowNotFound: true });
});
it.each(["admin", "targetAdmin", "personalId", "companyId", "role", "grantActor", "grantsForeign", "extraGrant", "execution"])("actual primary setup rejects invalid %s and releases only its owned secondary person", async invalid => {
  const f = fixture();
  if (invalid === "admin") f.state.admin = false;
  if (invalid === "targetAdmin") f.state.targetAdmin = true;
  if (invalid === "personalId") f.state.personalId = "foreign";
  if (invalid === "companyId") f.state.companyId = "foreign";
  if (invalid === "role") f.state.role = "viewer";
  if (invalid === "grantActor") f.state.grantActor = "foreign";
  if (invalid === "grantsForeign") f.state.grantsForeign = true;
  if (invalid === "extraGrant") f.state.extraGrant = true;
  if (invalid === "execution") f.ctx.input.execution.id = "chat-features.runner-codex.local.agents.choose-primary";
  await expect(runtimePrimaryCases[0]!.setup(f.ctx)).rejects.toThrow();
  expect(f.person.dispose).toHaveBeenCalledOnce(); expect(f.api.post).not.toHaveBeenCalled(); expect(f.api.delete).not.toHaveBeenCalled();
  expect(enrollAuthenticatedPerson).not.toHaveBeenCalled();
  await expect(runtimePrimaryCases[0]!.observe!(f.ctx, {})).rejects.toThrow("Secondary authenticated person missing");
});
it("failure after recording a new company deletes only that exact owned company and disposes its person", async () => {
  const f = fixture(); f.state.failOtherRead = true;
  await expect(runtimePrimaryCases[0]!.setup(f.ctx)).rejects.toThrow("other primary read failed");
  expect(f.person.dispose).toHaveBeenCalledOnce(); expect(f.api.delete).toHaveBeenCalledExactlyOnceWith("/api/companies/owned-other", { allowNotFound: true });
});
it("a failed company create never guesses an identifier to delete", async () => {
  const f = fixture(); f.state.failCompanyCreate = true;
  await expect(runtimePrimaryCases[0]!.setup(f.ctx)).rejects.toThrow("company create failed");
  expect(f.person.dispose).toHaveBeenCalledOnce(); expect(f.api.delete).not.toHaveBeenCalled();
});
it("cleanup failure remains visible while still attempting deletion of the recorded owned company", async () => {
  const f = fixture(); f.state.failOtherRead = true; f.state.failDispose = true;
  await expect(runtimePrimaryCases[0]!.setup(f.ctx)).rejects.toThrow("Primary prerequisite setup cleanup failed");
  expect(f.api.delete).toHaveBeenCalledExactlyOnceWith("/api/companies/owned-other", { allowNotFound: true });
});
