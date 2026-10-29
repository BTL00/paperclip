import { afterEach, expect, it, vi } from "vitest";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import type { CompanyPortabilityPreviewResult } from "../../../packages/shared/src/types/company-portability.js";
import { captureReadyImportBaseline, consequentialImportChoice, sameImportConfiguration } from "./identity-import-preview-contract.js";
const boundary = vi.hoisted(() => ({ observation: {} as unknown, send: vi.fn(async () => { throw new Error("CONTROL: valid conflict choice reaches original second human send"); }) }));
vi.mock("./identity-support.js", async original => ({ ...await original<object>(), waitForReply: vi.fn(async () => undefined), observeIdentity: vi.fn(async () => boundary.observation) }));
vi.mock("../chat-flow.js", async original => ({ ...await original<object>(), sendChatMessage: boundary.send }));
import { portabilityIdentityCases } from "./identity-portability.js";
afterEach(() => { vi.useRealTimers(); boundary.send.mockClear(); });
const configuration = () => ({ id: "morgan", companyId: "company", name: "Morgan", role: "engineer", status: "idle", adapterType: "paperclip_runner", adapterConfig: { provider: "opencode", model: "openrouter/deepseek/deepseek-v4.1-flash-1017" }, runtimeConfig: { heartbeat: { enabled: false }, ordered: [1, "two", false] }, permissions: { canCreateAgents: false }, updatedAt: "2026-10-28T05:27:02.021Z" });
const preview = () => ({ targetCompanyId: "company", errors: [], plan: { agentPlans: [{ existingAgentId: "morgan", slug: "morgan", action: "create" }] } } as unknown as CompanyPortabilityPreviewResult);
const actualStyle = "This company already has an agent named Morgan. Importing into this company will collide.\n\nDo you want to import into this existing company with rename/skip, or use a separate company?";
function actFixture(reply: string, reorder: boolean) {
  const before = configuration(), after = reorder ? { ...before, adapterConfig: { model: before.adapterConfig.model, provider: before.adapterConfig.provider } } : structuredClone(before);
  const state = { existing: { id: "morgan", companyId: "company", name: "Morgan" }, existingConfiguration: before, beforeAgentIds: ["morgan"], sourcePackage: { type: "inline", files: {} } };
  const api = { get: vi.fn(async (path: string) => path.endsWith("/configuration") ? after : [{ id: "morgan" }]), post: vi.fn(async () => preview()) };
  boundary.observation = { reply };
  const ctx = { input: { fixtures: { company: { id: "company" } }, api, page: {} } } as unknown as ChatCatalogContext;
  return { state, ctx, implementation: portabilityIdentityCases.find(row => row.scenarioId === "companies.import-preview")! };
}
it.each([[actualStyle, false], ["Morgan has a collision with the existing name. Should I rename or skip the incoming Morgan?", true]] as const)("actual import act honors real consequential choice and full unchanged configuration (%s)", async (reply, reorder) => {
  const f = actFixture(reply, reorder);
  await expect(f.implementation.act!(f.ctx, f.state)).rejects.toThrow("CONTROL: valid conflict choice reaches original second human send");
  expect(boundary.send).toHaveBeenCalledOnce(); expect(f.state).toMatchObject({ beforeChoiceUnchanged: true, initialReplyAskedChoice: true });
});
it("keeps every full-DTO value and array/type/key invariant while ignoring JSON object order", () => {
  const before = configuration(); expect(sameImportConfiguration(before, { ...before, adapterConfig: { model: before.adapterConfig.model, provider: before.adapterConfig.provider } })).toBe(true);
  for (const next of [{ ...before, status: "paused" }, { ...before, updatedAt: "changed" }, { ...before, companyId: "other" }, { ...before, id: "other" }, { ...before, permissions: { canCreateAgents: true } },
    { ...before, runtimeConfig: { ...before.runtimeConfig, ordered: [false, "two", 1] } }, { ...before, runtimeConfig: { ...before.runtimeConfig, ordered: ["1", "two", false] } }, { ...before, extra: null }]) expect(sameImportConfiguration(before, next)).toBe(false);
  expect(sameImportConfiguration(undefined, undefined)).toBe(false);
});
it.each([
  [actualStyle, "company", "morgan", true],
  ["Morgan has a name conflict. Which should I choose: rename or skip?", "company", "morgan", true],
  ["Morgan has a conflict. I imported the package. Should I rename or skip?", "company", "morgan", false],
  ["Morgan has a conflict. I will rename it.", "company", "morgan", false],
  ["Riley has a conflict. Should I rename or skip Riley?", "company", "morgan", false],
  ["Morgan has a conflict. Should I overwrite Morgan?", "company", "morgan", false],
  ["Morgan is present. Should I rename or skip?", "company", "morgan", false],
  [actualStyle, "foreign", "morgan", false], [actualStyle, "company", "other", false],
])("grounds choice wording in same actual employee/company and original nonmutation (%s)", (reply, companyId, existingId, expected) => {
  expect(consequentialImportChoice({ reply, companyId, existingId, existingName: "Morgan", preview: preview() })).toBe(expected);
});
function baselineFixture() {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const ready = { id: "morgan", companyId: "company", name: "Morgan", lifecycleState: "ready", lifecycleVersion: 4, lifecycleHolds: [], status: "idle", updatedAt: configuration().updatedAt };
  const state = { wrongCompany: false, wrongAgent: false, held: false, expiredRead: false, unstable: false, wrongConfig: false, preparing: false, expiredConfig: false, expiredFinal: false, missingVersion: false, missingHolds: false, wrongName: false };
  let reads = 0;
  const api = { get: vi.fn(async (route: string) => {
    reads++; if (state.expiredRead || state.expiredConfig && reads === 2 || state.expiredFinal && reads === 3) vi.setSystemTime(10000);
    if (route.endsWith("/configuration")) return { ...configuration(), id: state.wrongConfig ? "other" : "morgan" };
    if (state.preparing && reads === 1) return { ...ready, lifecycleState: "preparing", lifecycleVersion: 2, status: "paused" };
    return { ...ready, name: state.wrongName ? "Riley" : "Morgan", companyId: state.wrongCompany ? "other" : "company", id: state.wrongAgent ? "other" : "morgan", lifecycleHolds: state.missingHolds ? undefined : state.held ? ["manual"] : [], lifecycleVersion: state.missingVersion ? undefined : state.unstable && reads > 1 ? 5 : 4 };
  }) };
  const ctx = { scenario: { id: "companies.import-preview" }, observationDeadlineAt: 10000, input: { execution: { id: "chat-features.runner-opencode.local.companies.import-preview" }, fixtures: { company: { id: "company" } }, api } } as unknown as ChatCatalogContext;
  return { ctx, api, state, created: { id: "morgan", companyId: "company", name: "Morgan", status: "paused", lifecycleState: "preparing" } };
}
it("captures the entire baseline only after existing genuine setup reaches stable ready/idle; performs GETs only", async () => {
  const f = baselineFixture(), saved = await captureReadyImportBaseline(f.ctx, f.created);
  expect(saved.existing.lifecycleVersion).toBe(4); expect(saved.existing.status).toBe("idle"); expect(saved.existingConfiguration).toEqual(configuration());
  expect(f.api.get.mock.calls.map(([route]) => route)).toEqual(["/api/agents/morgan", "/api/agents/morgan/configuration", "/api/agents/morgan"]);
});
it.each(["wrongCompany", "wrongAgent", "held", "expiredRead", "expiredConfig", "expiredFinal", "unstable", "wrongConfig", "missingVersion", "missingHolds", "wrongName"])("rejects %s without baseline waiver or a new clock", async invalid => {
  const f = baselineFixture(); Object.assign(f.state, { [invalid]: true }); await expect(captureReadyImportBaseline(f.ctx, f.created)).rejects.toThrow();
});
it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, 0, -1])("rejects missing/nonfinite/expired original clock (%s) before reads", async value => {
  const f = baselineFixture(); Object.assign(f.ctx, { observationDeadlineAt: value }); await expect(captureReadyImportBaseline(f.ctx, f.created)).rejects.toThrow(/budget/); expect(f.api.get).not.toHaveBeenCalled();
});

it("observes genuine preparing→ready before configuration baseline without a lifecycle write or probe", async () => {
  const f = baselineFixture(); f.state.preparing = true; const pending = captureReadyImportBaseline(f.ctx, f.created);
  await vi.advanceTimersByTimeAsync(500); const saved = await pending;
  expect(saved.existing.status).toBe("idle"); expect(saved.existing.lifecycleVersion).toBe(4);
  expect(f.api.get.mock.calls.map(([route]) => route)).toEqual(["/api/agents/morgan", "/api/agents/morgan", "/api/agents/morgan/configuration", "/api/agents/morgan"]);
});
it("does not retry a failed public readiness read or turn it into a claimed baseline", async () => {
  const f = baselineFixture(); f.api.get.mockRejectedValue(new Error("owned-control-read-failure"));
  await expect(captureReadyImportBaseline(f.ctx, f.created)).rejects.toThrow("owned-control-read-failure"); expect(f.api.get).toHaveBeenCalledOnce();
});

it.each(["companies.export-company", "other"])("does not establish an import baseline for an unrelated scenario %s", async scenarioId => {
 const f = baselineFixture(); f.ctx.scenario.id = scenarioId; await expect(captureReadyImportBaseline(f.ctx, f.created)).rejects.toThrow(/exact/); expect(f.api.get).not.toHaveBeenCalled();
});

it.each([
 "Morgan already exists and would collide.\n\nShould I rename or skip Riley?",
 "Morgan already exists and would collide.\n\nShould I rename or skip the Launch project?",
 "Morgan already exists and would collide. Should I rename or skip Riley before importing into this company?",
 "Morgan already exists and would collide. Should I rename or skip the incoming employee Riley?",
 "Morgan already exists and would collide.\n\nShould I rename or skip the company?",
])("does not lend a Morgan collision to an unrelated question target: %s", reply => {
 expect(consequentialImportChoice({reply,companyId:"company",existingId:"morgan",existingName:"Morgan",preview:preview()})).toBe(false);
});
it.each([
 "Morgan already exists and would collide.\n\nShould I rename or skip the incoming Morgan?",
 "Morgan already exists and would collide.\n\nDo you want to import the package into this company with rename/skip?",
 "Morgan already exists and would collide.\n\nShould I rename it or skip it?",
])("keeps the same actual incoming employee or scoped package choice: %s", reply => {
 expect(consequentialImportChoice({reply,companyId:"company",existingId:"morgan",existingName:"Morgan",preview:preview()})).toBe(true);
});
it("does not infer an unambiguous incoming target from multiple preview employees", () => {
 const p=preview();p.plan.agentPlans.push({...p.plan.agentPlans[0]!,existingAgentId:"riley",slug:"riley"});
 expect(consequentialImportChoice({reply:actualStyle,companyId:"company",existingId:"morgan",existingName:"Morgan",preview:p})).toBe(false);
});

it.each(["Riley", "the Launch project"])("rejects an explicit rename/skip for-target outside the incoming employee: %s", target => {
 expect(consequentialImportChoice({reply:`Morgan has a name conflict with the incoming import. Should I choose rename/skip for ${target}?`,companyId:"company",existingId:"morgan",existingName:"Morgan",preview:preview()})).toBe(false);
});
it("keeps an explicit for-target bound to the actual incoming Morgan", () => {
 expect(consequentialImportChoice({reply:"Morgan has a name conflict with the incoming import. Should I choose rename/skip for the incoming employee Morgan?",companyId:"company",existingId:"morgan",existingName:"Morgan",preview:preview()})).toBe(true);
});

const falseCompletionClaims = ["I've imported the package.", "We’ve imported the package.", "The package was imported.", "The package has been imported.", "I've already replaced Morgan.", "The package is overwritten."];
const unperformedClaims = ["I haven't imported the package.", "We have not imported the package.", "The package was not imported.", "The package has not yet been imported."];
it.each(falseCompletionClaims)("rejects pre-choice completion in the actual helper: %s", claim => {
 expect(consequentialImportChoice({reply:claim+"\n\n"+actualStyle,companyId:"company",existingId:"morgan",existingName:"Morgan",preview:preview()})).toBe(false);
});
it.each(falseCompletionClaims)("rejects pre-choice completion in the actual import act without sending a second human: %s", async claim => {
 const f=actFixture(claim+"\n\n"+actualStyle,false);
 await expect(f.implementation.act!(f.ctx,f.state)).rejects.toThrow("The consequential import conflict was not previewed without mutation and referred to the human");
 expect(boundary.send).not.toHaveBeenCalled();
});
it.each(unperformedClaims)("keeps explicitly unperformed pre-choice completion wording positive: %s", async claim => {
 const reply=claim+"\n\n"+actualStyle;expect(consequentialImportChoice({reply,companyId:"company",existingId:"morgan",existingName:"Morgan",preview:preview()})).toBe(true);
 const f=actFixture(reply,false);await expect(f.implementation.act!(f.ctx,f.state)).rejects.toThrow("CONTROL: valid conflict choice reaches original second human send");expect(boundary.send).toHaveBeenCalledOnce();
});
