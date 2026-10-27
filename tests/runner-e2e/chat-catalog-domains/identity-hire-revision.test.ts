import { describe, expect, it } from "vitest";
import { gradeHireRevision } from "./identity-hire-revision.js";
import type { IdentityObservation } from "./identity-support.js";
function valid(): IdentityObservation {
  return { scenarioId: "questions-and-approvals.formal-hire-revision", origin: "http://fixture.invalid", companyId: "acorn", leadId: "ceo", company: { id: "acorn" }, companies: [], agents: [{ id: "ceo" }], tasks: [], projects: [], goals: [], interactions: [], comments: [], documents: [], revisions: [], links: [], runs: [], humanQueries: [], reply: "The proposal is back for board approval.",
    activity: [{ id: "revision", action: "approval.revision_requested", entityId: "approval", actorType: "user" }, { id: "resubmit", action: "approval.resubmitted", entityId: "approval", actorType: "agent", agentId: "ceo" }],
    state: { originalApproval: { id: "approval", payload: { adapterConfig: { model: "gpt-6.1-sol" } } }, currentApproval: { id: "approval", companyId: "acorn", type: "hire_agent", requestedByAgentId: "ceo", status: "pending", decidedByUserId: null, decidedAt: null, payload: { adapterConfig: { model: "gpt-6-luna" } } },
      originalModel: "gpt-6.1-sol", cheaperModel: "gpt-6-luna", eligibleModels: ["gpt-6.1-sol", "gpt-6-luna"], originalOtherFieldsPreserved: true, humanId: "alex", originalHistoryCommentId: "history", beforeAgentCount: 1, pendingProposalVisible: true, revisedModelVisible: true,
      approvalComments: [{ id: "history", authorUserId: "alex", body: "Original gpt-6.1-sol, board selected gpt-6-luna" }, { id: "revision-comment", authorAgentId: "ceo", body: "Revised to gpt-6-luna and resubmitted for approval." }] } };
}
describe("formal hire remains a proposal after cost revision", () => {
  it("requires actual model choice, attributed history and a still pending proposal", () => { expect(gradeHireRevision(valid()).passed).toBe(true); expect(gradeHireRevision(undefined).passed).toBe(false); });
  it("rejects treating requested revision as approval or activating the hire", () => { const o = valid(); (o.state.currentApproval as { status: string }).status = "approved"; expect(gradeHireRevision(o).passed).toBe(false); const wrong = valid(); wrong.agents.push({ id: "new-hire" }); expect(gradeHireRevision(wrong).passed).toBe(false); });
  it("rejects changing only prose while retaining the expensive config", () => { const o = valid(); (o.state.currentApproval as { payload: { adapterConfig: { model: string } } }).payload.adapterConfig.model = "gpt-6.1-sol"; expect(gradeHireRevision(o).passed).toBe(false); });
  it("rejects an unsupported substituted model and missing historical record", () => { const o = valid(); o.state.eligibleModels = []; expect(gradeHireRevision(o).passed).toBe(false); const wrong = valid(); wrong.state.approvalComments = []; expect(gradeHireRevision(wrong).passed).toBe(false); });
});
