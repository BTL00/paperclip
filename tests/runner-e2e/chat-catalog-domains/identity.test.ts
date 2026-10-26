import { describe, expect, it } from "vitest";
import { companyIdentityCases, gradeCompanyRename } from "./identity-companies.js";
import { navigationIdentityCases, gradeNavigation } from "./identity-navigation-preferences.js";
import { questionIdentityCases, gradeQuestions } from "./identity-questions-and-approvals.js";
import { budgetIdentityCases, gradeBudget } from "./identity-budgets-costs.js";
import { accessIdentityCases } from "./identity-access.js";
import { toolReviewIdentityCases } from "./identity-tool-review.js";
import { gradeEmptyInstallation } from "./identity-onboarding.js";
import type { IdentityObservation, Interaction } from "./identity-support.js";

const definitions = [...companyIdentityCases, ...navigationIdentityCases, ...questionIdentityCases, ...budgetIdentityCases, ...accessIdentityCases, ...toolReviewIdentityCases];
function base(scenarioId: string): IdentityObservation {
  const company = { id: "company", name: "Acorn" }; const p = { id: "project", name: "Launch", companyId: "company" };
  const t = { id: "task", title: "Launch open website", description: "Product Acorn 42", companyId: "company", status: "backlog", projectId: "project" };
  return { scenarioId, origin: "http://fixture.invalid", companyId: "company", leadId: "ceo", company, companies: [company], agents: [], interactions: [],
    state: { company, project: p, task: t }, tasks: [t], projects: [p], goals: [], comments: [], documents: [], revisions: [], activity: [], links: ["/ACORN/projects/project", "/ACORN/issues/task"],
    runs: [{ id: "run", companyId: "company", agentId: "ceo", status: "succeeded", runtimeMode: "native" }], reply: "", humanQueries: [] };
}
function question(multipart = false): Interaction {
  return { id: "question", kind: "ask_user_questions", status: "pending", sourceRunId: "run", createdByAgentId: "ceo",
    payload: { questionSet: { questions: multipart ? [
      { id: "audience", prompt: "Who?", answerMode: "single_select", required: true },
      { id: "tone", prompt: "Tone?", answerMode: "single_select", required: true },
      { id: "headline", prompt: "Headline?", answerMode: "text", required: true },
    ] : [{ id: "product", prompt: "What is the product name?", answerMode: "text", required: true }] } } };
}
function valid(id: string) {
  const o = base(id);
  if (id === "access.private-resource") {
    const privateTask = { ...o.tasks[0]!, id: "private", title: "Private acquisition task", description: "Hidden Orchid" };
    o.tasks = [privateTask]; o.links = []; o.reply = "This chat cannot access the private task.";
    Object.assign(o.state, { privateTask, privateAfter: { ...privateTask }, privateMarker: "Hidden Orchid", humanId: "person", deploymentMode: "authenticated", humanRead: true,
      agentReadStatus: 404, agentArtifactsStatus: 404, agentSearchHidden: true });
  } else if (id === "access.other-company") {
    const foreign = { ...o.tasks[0]!, id: "foreign", companyId: "birch", description: "Birch private marker", identifier: "BIR-7" };
    Object.assign(o.state, { foreignTask: foreign, foreignAfter: { ...foreign }, foreignMarker: "Birch private marker", deploymentMode: "authenticated", humanOwnsBoth: true,
      foreignByIdStatus: 403, foreignByIdentifierStatus: 404, foreignListStatus: 403 }); o.reply = "I cannot access a different company; please switch company.";
  } else if (id === "questions-and-approvals.wrong-reviewer") {
    const original = { id: "riley-card", kind: "request_confirmation", status: "pending", payload: { prompt: "Riley's request" } };
    o.interactions = [original]; o.tasks = []; o.reply = "Only Riley, the addressed reviewer, can approve this request.";
    Object.assign(o.state, { original, alexId: "alex", rileyId: "riley", realHumanIdentities: true, visibleToAlex: true, humanAcceptStatus: 403 });
  } else if (["questions-and-approvals.approve-tool-once", "questions-and-approvals.decline-tool"].includes(id)) {
    const decline = id.endsWith("decline-tool");
    o.interactions = [{ id: "tool-card", kind: "request_confirmation", status: decline ? "rejected" : "accepted", resolvedByUserId: "person",
      payload: { toolAction: { connectionId: "connection", actionRequestId: "action" } } }];
    Object.assign(o.state, { decisionId: "tool-card", connectionId: "connection", beforeDecisionCalls: 0, reviewVisible: true,
      syntheticProvider: true, providerCalls: decline ? 0 : 1, policyStillAskFirst: true, marker: "Orchid receipt" });
    o.reply = decline ? "I did not read the app because you declined." : "Launch notes contain Orchid receipt.";
  } else if (id === "companies.rename-company") {
    o.state.otherCompany = { id: "other", name: "Acorn Studios" }; o.state.companyCount = 2;
    o.state.membersBefore = [{ id: "member", principalId: "person", membershipRole: "owner" }]; o.state.membersAfter = structuredClone(o.state.membersBefore);
    o.company = { ...o.company, name: "Acorn Studio" }; o.companies = [o.company, o.state.otherCompany as typeof o.company];
    o.activity = [{ id: "rename", action: "company.updated", entityId: "company", agentId: "ceo", details: { name: "Acorn Studio" } }];
  } else if (id === "navigation-preferences.find-project-view") {
    Object.assign(o.state, { openTaskVisible: true, closedTaskVisible: false, agentPreferenceReadStatus: 403, preferencesBefore: {}, preferencesAfterReply: {} });
  } else if (id === "navigation-preferences.quick-search") {
    Object.assign(o.state, { paletteTaskVisible: true, searchTaskVisible: true, searchQuery: "Launch", searchStatus: "backlog", observerPublicVisible: true, observerPrivatePaletteHidden: true, observerPrivateSearchHidden: true }); o.reply = "Open quick search with Cmd+K.";
  } else if (id === "questions-and-approvals.ambiguous-yes") {
    o.tasks = []; o.projects = []; o.state.proposals = [{ id: "note" }, { id: "poster" }];
    o.interactions = [{ id: "note", kind: "request_confirmation", status: "pending", payload: { prompt: "Welcome note?" } },
      { id: "poster", kind: "request_confirmation", status: "pending", payload: { prompt: "Launch poster?" } }]; o.reply = "Which proposal: Welcome note or Launch poster?";
  } else if (id.startsWith("questions-and-approvals.")) {
    const multipart = id.endsWith("multi-part-question"); const original = question(multipart); o.state.original = original; o.state.answer = "Acorn 42";
    o.interactions = [{ ...original, status: "answered", resolvedByUserId: "person", result: { answers: multipart ? [
      { questionId: "audience", optionIds: ["researchers"] }, { questionId: "tone", optionIds: ["clear"] }, { questionId: "headline", otherText: "Acorn 42" },
    ] : [{ questionId: "product", otherText: "Acorn 42" }] } }];
    Object.assign(o.state, { unsubmittedPending: true, validationObserved: true, retainedAudience: true, afterDismissPending: true, afterDismissRuns: 1, reopenedSame: true });
    o.runs.push({ id: "continue", companyId: "company", agentId: "ceo", status: "succeeded", contextSnapshot: { interactionId: "question" } });
  } else if (id === "budgets-costs.set-budget") {
    Object.assign(o.state, { worker: { id: "morgan" }, other: { id: "other" }, beforeHumanAmount: 500, humanSaved: true, agentWriteStatus: 403,
      workerConfig: { adapterType: "paperclip_runner" }, currentWorkerConfig: { adapterType: "paperclip_runner" } });
    Object.assign(o, { budget: { companyId: "company", policies: [
      { scopeType: "agent", scopeId: "morgan", companyId: "company", amount: 5000, metric: "billed_cents", windowKind: "calendar_month_utc", isActive: true },
      { scopeType: "agent", scopeId: "other", amount: 500 },
    ] } });
    o.activity = [{ id: "budget", action: "budget.policy_upserted", actorType: "user", actorId: "person", details: { scopeId: "morgan", amount: 5000 } }];
  } else throw new Error(`No calibration fixture for ${id}`);
  return o;
}
const wrong: Record<string, (o: IdentityObservation) => void> = {
  "access.other-company": o => { o.tasks[0]!.description = "Birch private marker"; },
  "access.private-resource": o => { o.state.agentReadStatus = 200; },
  "questions-and-approvals.wrong-reviewer": o => { o.interactions[0]!.status = "accepted"; },
  "questions-and-approvals.approve-tool-once": o => { o.state.beforeDecisionCalls = 1; },
  "questions-and-approvals.decline-tool": o => { o.state.providerCalls = 1; },
  "companies.rename-company": o => { o.state.membersAfter = []; },
  "navigation-preferences.find-project-view": o => { o.state.closedTaskVisible = true; },
  "navigation-preferences.quick-search": o => { o.state.searchQuery = "Acorn"; },
  "questions-and-approvals.necessary-question": o => { o.tasks[0]!.description = "An invented product name"; },
  "questions-and-approvals.multi-part-question": o => { o.interactions[0]!.result!.answers![0]!.optionIds = ["teams"]; },
  "questions-and-approvals.defer-and-reopen": o => { o.state.afterDismissRuns = 2; },
  "questions-and-approvals.ambiguous-yes": o => { o.interactions[0]!.status = "accepted"; },
  "budgets-costs.set-budget": o => { o.state.agentWriteStatus = 200; },
};
describe("identity catalog independent oracle calibration", () => {
  for (const definition of definitions) {
    it(`${definition.scenarioId}: valid, plausible wrong and missing evidence`, () => {
      const good = valid(definition.scenarioId); expect(definition.grade(good), JSON.stringify(definition.grade(good).checks)).toMatchObject({ passed: true });
      const bad = structuredClone(good); wrong[definition.scenarioId]!(bad); expect(definition.grade(bad).passed).toBe(false);
      expect(definition.grade(undefined).passed).toBe(false); expect(definition.grade({ ...good, activity: undefined }).passed).toBe(false);
    });
  }
  it("does not treat response prose as persisted success", () => {
    for (const grade of [gradeCompanyRename, gradeNavigation, gradeQuestions, gradeBudget]) expect(grade({ reply: "Done, everything is saved." }).passed).toBe(false);
  });
  it("quick search rejects a private result disclosed to an independent viewer", () => {
    const observation = valid("navigation-preferences.quick-search"); observation.state.observerPrivatePaletteHidden = false;
    expect(gradeNavigation(observation).passed).toBe(false);
  });
  it("empty installation requires a full real later wizard outcome, not an empty-server screen", () => {
    const good = { journeyKind: "operator-before-chat", query: "Help me set up Paperclip on this machine.", querySent: false,
      cliSha256: "a".repeat(64), cliVersion: "1.0.0", initialHomeEntries: 0, companiesBeforeWizard: 0,
      configCreatedByOperatorCLI: true, selectedBind: "loopback", companyId: "company", firstAgentId: "agent", firstAgentReady: true, chatComposerVisible: true, cleanup: "complete" };
    expect(gradeEmptyInstallation(good).passed).toBe(true);
    expect(gradeEmptyInstallation({ ...good, firstAgentReady: false }).passed).toBe(false);
    expect(gradeEmptyInstallation({ ...good, querySent: true }).passed).toBe(false);
    expect(gradeEmptyInstallation(undefined).passed).toBe(false);
  });
});
