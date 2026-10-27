import { describe, expect, it } from "vitest";
import { customerBugFacts, preservesCustomerBugFacts, gradeIntegratorCaseCreation } from "./integrator-case-create.js";
function valid() {
  const brief = { id: "brief", issueId: "primary", companyId: "company", key: "brief", body: Object.values(customerBugFacts).join("\n") };
  const workflow = { id: "workflow", issueId: "primary", companyId: "company", key: "workflow", body: "Morgan investigates, saves findings, then hands this same primary task to its next owner for review." };
  const revision = (doc: typeof brief) => ({ id: `${doc.id}-revision`, documentId: doc.id, issueId: "primary", key: doc.key, body: doc.body, createdByAgentId: "ceo", createdByRunId: "source-run", createdAt: "2026-10-26T12:00:00Z" });
  return { scenarioId: "cases.create-case", origin: "https://fixture.test", companyId: "company", leadId: "ceo", state: { project: { id: "project" }, task: { id: "source-brief" }, worker: { id: "morgan" } },
    tasks: [{ id: "source-brief", title: "Customer bug brief" }, { id: "primary", companyId: "company", title: "Customer checkout bug", assigneeAgentId: "morgan" }], projects: [], goals: [], comments: [], documents: [], revisions: [], humanQueries: [], activity: [], reply: "Created the case and started Morgan's investigation on its primary task.", links: ["/ACORN/cases/case", "/ACORN/issues/primary"],
    cases: [{ id: "case", companyId: "company", projectId: "project", workIssueId: "primary", fields: structuredClone(customerBugFacts) }],
    handoffs: { case: [{ id: "kickoff", caseId: "case", version: 1, issueId: "primary", toAgentId: "morgan", actorId: "ceo", sourceRunId: "source-run", state: "delivered" }] }, taskDocuments: { primary: [workflow, brief] },
    documentVersions: { "primary:workflow": [revision(workflow)], "primary:brief": [revision(brief)] },
    runs: [{ id: "source-run", agentId: "ceo", status: "succeeded" }, { id: "investigation", agentId: "morgan", status: "running", contextSnapshot: { issueId: "primary" }, startedAt: "2026-10-26T12:01:00Z" }] };
}
describe("real case kickoff independent controls", () => {
  it("requires the real primary task, first Morgan dispatch and original saved documents", () => {
    expect(gradeIntegratorCaseCreation(valid()).passed).toBe(true);
    expect(gradeIntegratorCaseCreation(undefined).passed).toBe(false);
    const passive = valid(); passive.cases[0]!.workIssueId = "";
    expect(gradeIntegratorCaseCreation(passive).passed).toBe(false);
    const late = valid(); late.documentVersions["primary:brief"][0]!.createdAt = "2026-10-26T12:02:00Z";
    expect(gradeIntegratorCaseCreation(late).passed).toBe(false);
    const otherOwner = valid(); otherOwner.taskDocuments.primary[1]!.issueId = "source-brief";
    expect(gradeIntegratorCaseCreation(otherOwner).passed).toBe(false);
    const wrongWorker = valid(); wrongWorker.handoffs.case[0]!.toAgentId = "riley";
    expect(gradeIntegratorCaseCreation(wrongWorker).passed).toBe(false);
    const repaired = valid(); repaired.documentVersions["primary:brief"][0]!.body = "Investigate a bug.";
    expect(gradeIntegratorCaseCreation(repaired).passed).toBe(false);
    expect(gradeIntegratorCaseCreation({ ...valid(), links: ["/ACORN/cases/case"] }).passed).toBe(false);
  });
  it("accepts changed wording of factual fields but rejects swapped expected/observed behavior", () => {
    const paraphrase = { customer: "Acorn Test Shop", issue: "Checkout stops responding", browser: "Safari 18 on iPhone 15", steps: ["Add the trial item", "Fill the test address", "Press Pay"], expectedBehavior: "An order confirmation should be shown", observedBehavior: "Without confirmation; customer is not charged" };
    expect(preservesCustomerBugFacts(paraphrase)).toBe(true);
    expect(preservesCustomerBugFacts({ ...paraphrase, expectedBehavior: "No order confirmation appears" })).toBe(false);
    expect(preservesCustomerBugFacts({ ...paraphrase, browser: "Chrome on Android" })).toBe(false);
    expect(preservesCustomerBugFacts({ ...paraphrase, observedBehavior: "Order confirmation appears and customer is charged" })).toBe(false);
  });
});
