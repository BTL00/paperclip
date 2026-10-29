import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NEW_COMPANY_NATIVE_MODEL, NEW_COMPANY_PROVIDER_MODEL, nativeSetupRequest } from "./identity-new-company-native-proof.js";
import { gradeResumedNativeWizard, requireResumedDraft, requireResumedNativeAgentProof, type ResumeNativeReceipt } from "./identity-resume-wizard-native-proof.js";
import { wizardIdentityBoundaryCases, gradeWizardBoundary } from "./identity-wizard-boundaries.js";
import { resolveRouteOnboardingOptions } from "../../../ui/src/lib/onboarding-route.js";
type Proof = Parameters<typeof requireResumedNativeAgentProof>[0];
const companyId = "11111111-1111-4111-8111-111111111111", agentId = "22222222-2222-4222-8222-222222222222";
function proof(): Proof {
  const binding = { provider: "openrouter", method: "api_key", mode: "delegated", connectionId: "connection", grantId: "grant" };
  const request = { companyId, agentId, environmentId: "local-target", adapterType: "paperclip_runner", provider: "opencode", model: NEW_COMPANY_NATIVE_MODEL, binding, containsCredential: false };
  return {
    company: { id: companyId, name: "Website business", issuePrefix: "WEB", defaultResponsibleUserId: "human" },
    agent: { id: agentId, companyId, name: "CEO", role: "general", adapterType: "paperclip_runner", adapterConfig: { provider: "opencode", model: NEW_COMPANY_NATIVE_MODEL }, runtimeConfig: { aiConnection: binding, heartbeat: { enabled: false } }, defaultEnvironmentId: "local-target", lifecycleState: "ready", status: "idle" },
    humanId: "human", environment: { id: "local-target", driver: "local" }, savedSetupAgentId: agentId, savedRole: "general",
    probes: [{ ...request, sequence: 1, httpStatus: 200, resultAdapterType: "paperclip_runner", status: "pass", checks: [{ code: "opencode_hello_probe_passed", level: "info" }] }],
    hires: [{ ...request, sequence: 2, httpStatus: 201, resultAgentId: agentId }], connection: { connectionId: "connection", grantId: "grant" },
    accounts: { currentUserId: "human", canManageConnections: true, connections: [{ id: "connection", grantId: "grant", companyId, provider: "openrouter", method: "api_key", name: "My OpenRouter", status: "connected", ownership: "personal", ownerUserId: "human", isDefault: false,
      routing: { kind: "openrouter", protocol: "chat", auth: "bearer", models: [{ id: NEW_COMPANY_PROVIDER_MODEL }] } }] },
    grants: { currentUserId: "human", connection: { id: "connection", uid: "connection" }, grants: [{ id: "grant", connectionId: "connection", companyId, kind: "user", subjectUserId: "human", status: "active" }] },
    installs: [{ companyId, connectionId: "connection", targetType: "agent", targetId: agentId }],
  } as unknown as Proof;
}
describe("native first-agent public setup custody", () => {
  it("accepts the same saved general-role agent/account/local model test and hire", () => expect(() => requireResumedNativeAgentProof(proof())).not.toThrow());
  for (const [name, mutate] of Object.entries<(p: Proof) => void>({
    "remote target": p => { p.environment.driver = "remote"; },
    "wrong selected target": p => { p.probes[0]!.environmentId = "other"; },
    "wrong company": p => { p.probes[0]!.companyId = "other"; },
    "foreign setup agent": p => { p.probes[0]!.agentId = "other"; },
    "legacy adapter": p => { p.probes[0]!.adapterType = "opencode_local"; },
    "legacy result": p => { p.probes[0]!.resultAdapterType = "opencode_local"; },
    "wrong runtime": p => { p.probes[0]!.provider = "codex"; },
    "wrong model": p => { p.probes[0]!.model = "openrouter/other"; },
    "key validation only": p => { p.probes[0]!.checks = [{ code: "ai_connection_api_key_reverified", level: "info" }]; },
    "wrong hello": p => { p.probes[0]!.checks = [{ code: "codex_hello_probe_passed", level: "info" }]; },
    "probe denied": p => { p.probes[0]!.httpStatus = 403; },
    "warning probe": p => { p.probes[0]!.status = "warn"; },
    "probe error": p => { p.probes[0]!.checks.push({ code: "adapter_auth_missing", level: "error" }); },
    "missing probe": p => { p.probes = []; },
    "second probe": p => { p.probes.push(p.probes[0]!); },
    "late probe": p => { p.probes[0]!.sequence = 3; },
    "missing chronology": p => { p.probes[0]!.sequence = Number.NaN; },
    "foreign account tested": p => { p.probes[0]!.binding = { ...p.probes[0]!.binding!, mode: "delegated", connectionId: "other", grantId: "grant" }; },
    "default-account substitution": p => { p.probes[0]!.binding = { provider: "openrouter", method: "api_key", mode: "responsible_user" }; },
    "raw credential in test": p => { p.probes[0]!.containsCredential = true; },
    "duplicate hire": p => { p.hires.push(p.hires[0]!); },
    "different hire model": p => { p.hires[0]!.model = "other"; },
    "hire replaces setup": p => { p.hires[0]!.resultAgentId = "other"; },
    "hire denied": p => { p.hires[0]!.httpStatus = 403; },
    "final different company": p => { p.agent.companyId = "other"; },
    "role changed to CEO": p => { p.agent.role = "ceo"; },
    "not ready": p => { p.agent.lifecycleState = "setup"; },
    "wrong saved model": p => { p.agent.adapterConfig.model = "other"; },
    "foreign saved environment": p => { p.agent.defaultEnvironmentId = "other"; },
    "enabled first work": p => { p.agent.runtimeConfig.heartbeat = { enabled: true }; },
    "foreign saved grant": p => { p.agent.runtimeConfig.aiConnection = { provider: "openrouter", method: "api_key", mode: "delegated", connectionId: "connection", grantId: "other" }; },
    "other responsible person": p => { p.company.defaultResponsibleUserId = "other"; },
    "other signed-in person": p => { p.accounts.currentUserId = "other"; },
    "shared account": p => { p.accounts.connections[0]!.ownership = "shared"; },
    "unavailable account": p => { p.accounts.connections[0]!.status = "needs_attention"; },
    "foreign account owner": p => { p.accounts.connections[0]!.ownerUserId = "other"; },
    "wrong route protocol": p => { p.accounts.connections[0]!.routing!.protocol = "responses"; },
    "wrong catalog model": p => { p.accounts.connections[0]!.routing!.models[0]!.id = "other"; },
    "no public grant": p => { p.grants.grants = []; },
    "foreign grant": p => { p.grants.grants[0]!.companyId = "other"; },
    "other grant owner": p => { p.grants.grants[0]!.subjectUserId = "other"; },
    "revoked grant": p => { p.grants.grants[0]!.status = "revoked"; },
    "no installation": p => { p.installs = []; },
    "company-wide access": p => { p.installs[0]!.targetType = "company"; p.installs[0]!.targetId = companyId; },
    "other agent access": p => { p.installs[0]!.targetId = "other"; },
  })) it(`rejects ${name}`, () => { const p = proof(); mutate(p); expect(() => requireResumedNativeAgentProof(p)).toThrow(); });
  it("normalizes the existing public test and hire shapes without exposing raw credentials", () => {
    const p = proof(); const config = { provider: "opencode", model: NEW_COMPANY_NATIVE_MODEL };
    expect(nativeSetupRequest({ companyId, adapterType: "paperclip_runner", sequence: 1, body: { agentId, environmentId: "local-target", adapterConfig: config, aiConnection: p.agent.runtimeConfig.aiConnection } }, "synthetic-private-key"))
      .toMatchObject({ agentId, environmentId: "local-target", containsCredential: false, binding: p.agent.runtimeConfig.aiConnection });
    const result = nativeSetupRequest({ companyId, adapterType: "paperclip_runner", sequence: 2, body: { setupAgentId: agentId, defaultEnvironmentId: "local-target", adapterConfig: { ...config, env: { OPENROUTER_API_KEY: "synthetic-private-key" } }, runtimeConfig: p.agent.runtimeConfig } }, "synthetic-private-key");
    expect(result).toMatchObject({ agentId, environmentId: "local-target", containsCredential: true }); expect(JSON.stringify(result)).not.toContain("synthetic-private-key");
  });
});

function draftProof(): Parameters<typeof requireResumedDraft>[0] {
  const p = proof();
  const saved = { ...p.agent, lifecycleState: "paused", status: "paused", pauseReason: "setup", lifecycleVersion: 1, metadata: { setupAdapterPending: true } };
  const draft = { companyId, agentId, companyName: p.company.name, agentName: saved.name, harness: "codex_local", step: 4, containsCredential: false };
  return { company: p.company, saved, restored: structuredClone(saved), draft, restoredDraft: structuredClone(draft) };
}
function receipt() {
  const p = proof(), d = draftProof();
  const w: ResumeNativeReceipt = { companyId, companyPrefix: "WEB", firstAgentId: agentId, companyName: p.company.name, agentName: p.agent.name,
    requestedHarness: "opencode_local", actualHarness: "opencode_local", model: NEW_COMPANY_NATIVE_MODEL,
    environmentId: p.environment.id, environmentDriver: "local", actualProbeEnvironmentId: p.environment.id,
    beforeCompanyIds: [], afterCompanyIds: [companyId], beforeReadyAgents: 0, afterAgentIds: [agentId], publicSetupRoute: `/WEB/agents/new?setupAgentId=${agentId}`,
    savedSetupAgentId: agentId, hello: p.probes[0]!, helloCount: 1, hiredThroughPublicSetup: true, hireCount: 1, firstAgentReady: true, chatComposerVisible: true,
    heartbeatRunIds: [], readyConversationPath: `/WEB/chats/${agentId}`,
    account: { id: "connection", grantId: "grant", provider: "openrouter", method: "api_key", status: "connected", ownership: "personal", ownerUserId: "human", currentUserId: "human", responsibleUserId: "human", bindingMode: "delegated" },
    exactPublicGrantAndAgentInstall: true, draftContainsCredential: false, publicAgentContainsCredential: false, verificationKind: "public-native-hello-probe", firstWorkExecuted: false, probeUsage: "unavailable-outside-heartbeat-accounting",
    savedRole: "general", actualRole: "general", savedLifecycleVersion: 1, restoredLifecycleVersion: 1, savedSetupHeld: true, restoredSetupHeld: true,
    draft: d.draft, restoredDraft: d.restoredDraft, finishSetupFromSavedAgent: true, secureFieldEmptyBeforeEntry: true, credentialEnteredBeforeReload: false };
  return { resumeWizard: w, personId: "human", returnedPersonId: "human" };
}
describe("actual saved wizard reload boundary", () => {
  it("retains a real pending general-role agent and a nonsecret provider-unselected draft", () => expect(() => requireResumedDraft(draftProof())).not.toThrow());
  for (const [name, change] of Object.entries<(p: ReturnType<typeof draftProof>) => void>({
    "duplicate agent": p => { p.restored.id = "other"; }, "foreign company": p => { p.restored.companyId = "other"; },
    "wrong role": p => { p.saved.role = "ceo"; p.restored.role = "ceo"; }, "premature ready": p => { p.restored.lifecycleState = "ready"; },
    "not setup held": p => { p.saved.pauseReason = "manual"; }, "already selected provider": p => { p.restored.metadata = { setupAdapterPending: false }; },
    "missing version": p => { p.saved.lifecycleVersion = undefined; }, "stale version": p => { p.restored.lifecycleVersion = 2; },
    "enabled work": p => { p.restored.runtimeConfig.heartbeat = { enabled: true }; }, "missing draft": p => { p.restoredDraft.agentId = null; },
    "other draft company": p => { p.draft.companyId = "other"; }, "wrong draft step": p => { p.restoredDraft.step = 3; },
    "wrong saved name": p => { p.restoredDraft.agentName = "other"; }, "lost draft provider": p => { p.restoredDraft.harness = "other"; },
    "draft raw credential": p => { p.draft.containsCredential = true; },
  })) it(`rejects ${name}`, () => { const p = draftProof(); change(p); expect(() => requireResumedDraft(p)).toThrow(); });
  it("grades the selected real native receipt, without inheriting the old Codex-only grade", () => {
    const o = receipt(); expect(gradeWizardBoundary(o, "onboarding.resume-wizard").passed).toBe(true);
    expect(gradeResumedNativeWizard(undefined).passed).toBe(false); expect(gradeResumedNativeWizard({ resumeWizard: {} }).passed).toBe(false);
  });
  for (const [name, change] of Object.entries<(w: ResumeNativeReceipt) => void>({
    "secure restored key": w => { Object.assign(w, { secureFieldEmptyBeforeEntry: false }); }, "wrong provider credential entry": w => { Object.assign(w, { credentialEnteredBeforeReload: true }); },
    "new agent identity": w => { w.savedSetupAgentId = "other"; }, "no public finish": w => { Object.assign(w, { finishSetupFromSavedAgent: false }); },
    "wrong route": w => { w.publicSetupRoute = `/OTHER/agents/new?setupAgentId=${agentId}`; }, "foreign route agent": w => { w.publicSetupRoute = "/WEB/agents/new?setupAgentId=other"; },
    "legacy probe": w => { w.hello.resultAdapterType = "opencode_local"; }, "different probe model": w => { w.hello.model = "other"; },
    "duplicate companies": w => { w.afterCompanyIds.push("other"); }, "duplicate agent": w => { w.afterAgentIds.push("other"); },
    "work dispatch": w => { w.heartbeatRunIds.push("run"); }, "private credential leak": w => { w.draftContainsCredential = true; },
    "foreign person account": w => { w.account.ownerUserId = "other"; }, "foreign selected grant": w => { w.hello.binding = { provider: "openrouter", method: "api_key", mode: "delegated", connectionId: "connection", grantId: "other" }; },
  })) it(`does not qualify ${name}`, () => { const o = receipt(); change(o.resumeWizard); expect(gradeResumedNativeWizard(o).passed).toBe(false); });
  it("keeps selected zero authored turns and original caps, plus other wizard defaults", () => {
    const selected = wizardIdentityBoundaryCases.find(row => row.scenarioId === "onboarding.resume-wizard")!;
    expect(selected).toMatchObject({ requiredCredentials: ["OPENROUTER_API_KEY"], expectedRunCount: 0, expectedHumanMessageCount: 0, attemptTimeoutMs: 600000, turnTimeoutMs: 180000 });
    expect(wizardIdentityBoundaryCases.find(row => row.scenarioId === "onboarding.choose-first-runtime")!.requiredCredentials).toEqual(["ANTHROPIC_API_KEY"]);
    expect(wizardIdentityBoundaryCases.find(row => row.scenarioId === "onboarding.new-instance")!.requiredCredentials).toEqual(["OPENAI_API_KEY"]);
  });
  it("uses the shipped saved-ID route, no forced draft write or hidden new-company shortcut", () => {
    const read = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
    const worker = read("tests/runner-e2e/chat-catalog-domains/identity-resume-wizard-native.ts");
    expect(worker).toContain('await page.reload({ waitUntil: "domcontentloaded" })');
    expect(worker).toContain('getByRole("button", { name: "Finish setup", exact: true }).click()');
    expect(worker).toContain('await expect(secureField).toHaveAttribute("type", "password")');
    expect(worker).not.toContain('localStorage.setItem'); expect(worker).not.toContain('runNativeNewCompanyInPrivateBrowser');
    expect(worker.indexOf('requireResumedDraft({ company, saved: provisional, restored: restoredAgents[0]!')).toBeLessThan(worker.indexOf('Finish setup", exact: true }).click()'));
    expect(worker.indexOf('if (await secureField.inputValue() !== "")')).toBeLessThan(worker.indexOf('await secureField.fill(input.credential)'));
    expect(read("ui/src/components/AgentActionButtons.tsx")).toContain('setupAgentId: agent.id');
    expect(read("ui/src/components/AgentActionButtons.tsx")).toContain('agent.pauseReason === "setup" && agent.lifecycleState === "paused"');
    expect(read("ui/src/components/new-agent/AgentBasicsDialog.tsx")).toContain('const setupId = useRef(setupAgentId ?? crypto.randomUUID())');
    expect(resolveRouteOnboardingOptions({ pathname: "/WEB/agents/new", companyPrefix: "WEB", companies: [{ id: companyId, issuePrefix: "WEB" }] })).toBeNull();
  });
});
