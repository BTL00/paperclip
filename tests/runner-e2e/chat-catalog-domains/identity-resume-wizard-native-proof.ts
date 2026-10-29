import type { AiConnectionList } from "../../../packages/shared/src/ai-connections.js";
import type { ConnectionGrantsResponse, ToolConnectionInstall } from "../../../packages/shared/src/types/tool-access.js";
import { NEW_COMPANY_NATIVE_MODEL, NEW_COMPANY_PROVIDER_MODEL, type NativeCompany, type NativeFirstAgent, type NativeSetupProbe, type NativeSetupRequest, type NewCompanyNativeReceipt } from "./identity-new-company-native-proof.js";
import { checks } from "./internal-support.js";
export interface ResumeSavedAgent extends NativeFirstAgent { pauseReason?: string | null; lifecycleVersion?: number; metadata?: Record<string, unknown> | null }
export interface ResumeDraft { companyId: string | null; agentId: string | null; companyName: string | null; agentName: string | null; harness: string | null; step: number | null; containsCredential: boolean }
export interface ResumeNativeReceipt extends Omit<NewCompanyNativeReceipt, "noAgentBeforeRouteDeparture"> {
  savedRole: string; actualRole: string; savedLifecycleVersion: number; restoredLifecycleVersion: number;
  savedSetupHeld: true; restoredSetupHeld: true; draft: ResumeDraft; restoredDraft: ResumeDraft;
  finishSetupFromSavedAgent: true; secureFieldEmptyBeforeEntry: true; credentialEnteredBeforeReload: false;
}
export function requireResumedDraft(input: { company: NativeCompany; saved: ResumeSavedAgent; restored: ResumeSavedAgent; draft: ResumeDraft; restoredDraft: ResumeDraft }): void {
  const { company, saved, restored, draft, restoredDraft } = input;
  const held = (agent: ResumeSavedAgent) => agent.id.length > 0 && agent.companyId === company.id && agent.role === "general"
    && agent.lifecycleState === "paused" && agent.pauseReason === "setup" && agent.metadata?.setupAdapterPending === true
    && agent.runtimeConfig.heartbeat?.enabled === false && Number.isInteger(agent.lifecycleVersion) && agent.lifecycleVersion! >= 1;
  const matches = (value: ResumeDraft) => value.companyId === company.id && value.agentId === saved.id
    && value.companyName === company.name && value.agentName === saved.name && !!value.harness && value.step === 4 && value.containsCredential === false;
  if (!held(saved) || !held(restored) || restored.id !== saved.id || restored.name !== saved.name || restored.role !== saved.role
    || restored.lifecycleVersion !== saved.lifecycleVersion || !matches(draft) || !matches(restoredDraft) || restoredDraft.harness !== draft.harness)
    throw new Error("Reload must retain the exact setup-held agent and nonsecret wizard draft");
}
export function gradeResumedNativeWizard(value: unknown) {
  const o = value as { resumeWizard?: ResumeNativeReceipt; personId?: string; returnedPersonId?: string } | undefined;
  const w = o?.resumeWizard; const c = checks();
  if (!w || !w.draft || !w.restoredDraft || !w.hello || !Array.isArray(w.hello.checks)
    || !Array.isArray(w.beforeCompanyIds) || !Array.isArray(w.afterCompanyIds) || !Array.isArray(w.afterAgentIds) || !Array.isArray(w.heartbeatRunIds)) {
    c.add("complete-resume-receipt", false, "The independent saved-draft, native verification and completed identity evidence is required.");
    return c.result();
  }
  c.add("restored-nonsecret-draft", !!w && w.draft.companyId === w.companyId && w.restoredDraft.companyId === w.companyId
    && w.draft.agentId === w.firstAgentId && w.restoredDraft.agentId === w.firstAgentId
    && w.draft.companyName === w.companyName && w.restoredDraft.companyName === w.companyName
    && w.draft.agentName === w.agentName && w.restoredDraft.agentName === w.agentName
    && !!w.draft.harness && w.draft.harness === w.restoredDraft.harness && w.draft.step === 4 && w.restoredDraft.step === 4
    && w.draft.containsCredential === false && w.restoredDraft.containsCredential === false
    && w.savedSetupHeld === true && w.restoredSetupHeld === true && w.savedRole === "general" && w.actualRole === w.savedRole
    && Number.isInteger(w.savedLifecycleVersion) && w.savedLifecycleVersion >= 1 && w.savedLifecycleVersion === w.restoredLifecycleVersion,
    "A real reload retains the actual setup-held company, agent, role and nonsecret draft before public Finish setup.");
  c.add("same-public-finish-setup", !!w && w.finishSetupFromSavedAgent === true && w.savedSetupAgentId === w.firstAgentId
    && typeof w.companyPrefix === "string" && w.companyPrefix.length > 0 && typeof w.publicSetupRoute === "string"
    && w.publicSetupRoute.startsWith(`/${w.companyPrefix}/agents/new?`) && new URL(w.publicSetupRoute, "http://fixture.invalid").searchParams.get("setupAgentId") === w.firstAgentId
    && w.secureFieldEmptyBeforeEntry === true && w.credentialEnteredBeforeReload === false
    && w.hiredThroughPublicSetup === true && w.hireCount === 1 && w.firstAgentReady === true && w.chatComposerVisible === true,
    "The visible Finish setup route reuses the saved agent and obtains missing credentials only in the proper masked field.");
  c.add("native-same-target-model", !!w && w.requestedHarness === "opencode_local" && w.actualHarness === "opencode_local" && w.model === NEW_COMPANY_NATIVE_MODEL
    && w.environmentDriver === "local" && !!w.environmentId && w.actualProbeEnvironmentId === w.environmentId && w.helloCount === 1
    && w.hello?.companyId === w.companyId && w.hello.agentId === w.firstAgentId && w.hello.environmentId === w.environmentId
    && w.hello.adapterType === "paperclip_runner" && w.hello.resultAdapterType === "paperclip_runner" && w.hello.provider === "opencode"
    && w.hello.model === w.model && w.hello.httpStatus === 200 && w.hello.status === "pass" && w.hello.containsCredential === false
    && w.hello.checks.some(row => row.code === "opencode_hello_probe_passed") && !w.hello.checks.some(row => row.level === "error"),
    "The selected saved agent, local target and exact model pass the native public hello test; legacy validation cannot qualify.");
  const a = w?.account;
  c.add("real-person-scoped-account", !!w && typeof o?.personId === "string" && o.personId.length > 0 && o.personId !== "local-board" && o.returnedPersonId === o.personId
    && a?.ownerUserId === o.personId && a.currentUserId === o.personId && a.responsibleUserId === o.personId
    && !!a.id && !!a.grantId && a.provider === "openrouter" && a.method === "api_key" && a.status === "connected" && a.ownership === "personal"
    && a.bindingMode === "delegated" && w.hello.binding?.provider === "openrouter" && w.hello.binding.method === "api_key" && w.exactPublicGrantAndAgentInstall === true && w.hello.binding?.mode === "delegated"
    && w.hello.binding.connectionId === a.id && w.hello.binding.grantId === a.grantId,
    "Independent public account, grant and installation reads bind the real human to only the actual resumed agent.");
  c.add("no-duplicates-or-authored-work", !!w && w.beforeCompanyIds.length === 0 && w.afterCompanyIds.length === 1 && w.afterCompanyIds[0] === w.companyId
    && w.afterAgentIds.length === 1 && w.afterAgentIds[0] === w.firstAgentId && w.beforeReadyAgents === 0 && w.heartbeatRunIds.length === 0
    && w.firstWorkExecuted === false && w.probeUsage === "unavailable-outside-heartbeat-accounting" && w.verificationKind === "public-native-hello-probe"
    && w.draftContainsCredential === false && w.publicAgentContainsCredential === false
    && w.readyConversationPath === `/${w.companyPrefix}/chats/${w.firstAgentId}`,
    "No duplicate identity or authored chat/work is introduced. Probe usage remains explicitly unavailable, never zero.");
  return c.result();
}
export function requireResumedNativeAgentProof(input: {
  company: NativeCompany; agent: NativeFirstAgent; humanId: string; environment: { id: string; driver: string };
  savedSetupAgentId: string; savedRole: string; probes: NativeSetupProbe[]; hires: Array<NativeSetupRequest & { httpStatus: number; resultAgentId: string }>;
  connection: { connectionId: string; grantId: string }; accounts: AiConnectionList;
  grants: ConnectionGrantsResponse; installs: ToolConnectionInstall[];
}): void {
  const { company, agent, humanId, environment, savedSetupAgentId, savedRole, probes, hires, connection, accounts, grants, installs } = input;
  const binding = agent.runtimeConfig.aiConnection;
  const matches = (request: NativeSetupRequest) => request.companyId === company.id && request.agentId === savedSetupAgentId
    && request.environmentId === environment.id && request.adapterType === "paperclip_runner" && request.provider === "opencode"
    && request.model === NEW_COMPANY_NATIVE_MODEL && request.containsCredential === false
    && request.binding?.provider === "openrouter" && request.binding.method === "api_key" && request.binding.mode === "delegated"
    && request.binding.connectionId === connection.connectionId && request.binding.grantId === connection.grantId;
  if (environment.driver !== "local" || !environment.id || probes.length !== 1 || hires.length !== 1
    || !matches(probes[0]!) || probes[0]!.httpStatus !== 200 || probes[0]!.resultAdapterType !== "paperclip_runner" || probes[0]!.status !== "pass"
    || probes[0]!.checks.some(check => check.level === "error") || !probes[0]!.checks.some(check => check.code === "opencode_hello_probe_passed")
    || !Number.isInteger(probes[0]!.sequence) || probes[0]!.sequence < 1 || !Number.isInteger(hires[0]!.sequence) || probes[0]!.sequence >= hires[0]!.sequence
    || !matches(hires[0]!) || hires[0]!.httpStatus < 200 || hires[0]!.httpStatus >= 300 || hires[0]!.resultAgentId !== savedSetupAgentId)
    throw new Error("Resumed wizard requires one current same-agent native OpenCode account/model/local-target test and hire");
  if (agent.id !== savedSetupAgentId || agent.companyId !== company.id || (savedRole !== "general" || agent.role !== savedRole) || agent.adapterType !== "paperclip_runner"
    || agent.adapterConfig.provider !== "opencode" || agent.adapterConfig.model !== NEW_COMPANY_NATIVE_MODEL
    || agent.defaultEnvironmentId !== environment.id || agent.lifecycleState !== "ready" || !["idle", "active"].includes(agent.status)
    || agent.runtimeConfig.heartbeat?.enabled !== false
    || binding?.provider !== "openrouter" || binding.method !== "api_key" || binding.mode !== "delegated"
    || binding.connectionId !== connection.connectionId || binding.grantId !== connection.grantId
    || company.defaultResponsibleUserId !== humanId || accounts.currentUserId !== humanId)
    throw new Error("Resumed wizard public first-agent identity/configuration differs from the tested setup");
  const account = accounts.connections.find(row => row.id === connection.connectionId && row.grantId === connection.grantId);
  const grant = grants.grants.find(row => row.id === connection.grantId);
  if (!account || account.companyId !== company.id || account.provider !== "openrouter" || account.method !== "api_key"
    || account.status !== "connected" || account.ownership !== "personal" || account.ownerUserId !== humanId
    || account.routing?.kind !== "openrouter" || account.routing.protocol !== "chat" || account.routing.auth !== "bearer"
    || account.routing.models.length !== 1 || account.routing.models[0]?.id !== NEW_COMPANY_PROVIDER_MODEL
    || grants.connection.id !== connection.connectionId || grants.currentUserId !== humanId || grant?.connectionId !== connection.connectionId
    || grant.companyId !== company.id || grant.kind !== "user" || grant.subjectUserId !== humanId || grant.status !== "active"
    || installs.length !== 1 || installs[0]?.companyId !== company.id || installs[0]?.connectionId !== connection.connectionId
    || installs[0]?.targetType !== "agent" || installs[0]?.targetId !== agent.id)
    throw new Error("Resumed wizard account requires its actual personal grant and exact first-agent public installation");
}
