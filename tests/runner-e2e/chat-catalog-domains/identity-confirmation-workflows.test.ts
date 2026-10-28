import { describe, expect, it } from "vitest";
import { confirmationWorkflowIdentityCases, gradeConfirmationWorkflow } from "./identity-confirmation-workflows.js";
import type { IdentityObservation, Interaction } from "./identity-support.js";
function valid(id: string): IdentityObservation {
  const task = { id: "draft", companyId: "acorn", title: "Acorn launch checklist n42", description: "Draft checklist for later", status: "backlog" };
  const original: Interaction = { id: "request", kind: "request_confirmation", status: "pending", payload: { prompt: "Create the named checklist?" } };
  const o: IdentityObservation = { scenarioId: id, origin: "http://fixture.test", companyId: "acorn", leadId: "ceo", company: { id: "acorn" }, companies: [], agents: [], interactions: [],
    tasks: [task], projects: [], goals: [], comments: [], documents: [], revisions: [], activity: [], links: ["/ACO/issues/draft"], runs: [], reply: "Created the linked draft.", humanQueries: [], state: { original } };
  if (id === "questions-and-approvals.accept-one-proposal") {
    Object.assign(o.state, { firstTask: { ...task }, taskTitle: task.title, canonicalCommentId: "human-first", afterReloadTaskId: "draft", afterRepeatResolvedCommentId: "human-first" });
    o.interactions = [{ ...original, status: "accepted", resolvedByAgentId: "ceo", result: { outcome: "accepted", commentId: "human-first" } }];
    o.humanQueries = ["Yes, go ahead with that.", "Yes, go ahead with that."];
    o.activity = [{ id: "decision", action: "issue.thread_interaction_accepted", agentId: "ceo", details: { interactionId: "request", source: "conversation_reply", responseCommentId: "human-first" } },
      { id: "created", action: "issue.created", entityId: "draft", agentId: "ceo" }];
  } else {
    original.kind = "ask_user_questions"; original.payload = { questionSet: { questions: [{ id: "product", prompt: "Product name?", answerMode: "text", required: true }] } };
    o.interactions = [{ ...original, status: "answered", resolvedByUserId: "alex", result: { answers: [{ questionId: "product", otherText: "Acorn", optionIds: [] }] } }];
    Object.assign(o.state, { humanId: "alex", worker: { id: "morgan" }, submitStatuses: [409, 200], actualSubmitRequests: 2, noTaskBeforeAnswers: true, bothTabsResolved: true });
    o.activity = [{ id: "answer", action: "issue.thread_interaction_answered", actorType: "user", details: { interactionId: "request" } },
      { id: "document", action: "issue.document_created", entityId: "draft", agentId: "morgan" }];
    o.documents = [{ id: "introduction", body: "Acorn helps small teams write clear product introductions.", latestRevisionId: "revision" }];
    o.revisions = [{ id: "revision", documentId: "introduction", createdByRunId: "write", createdByAgentId: "morgan" }];
    o.runs = [{ id: "query", companyId: "acorn", agentId: "ceo", status: "succeeded" },
      { id: "continue", companyId: "acorn", agentId: "ceo", status: "succeeded", contextSnapshot: { interactionId: "request" } },
      { id: "write", companyId: "acorn", agentId: "morgan", status: "succeeded" }];
  }
  return o;
}
describe("conversational proposal and simultaneous human answer oracles", () => {
  for (const definition of confirmationWorkflowIdentityCases) it(`${definition.scenarioId}: valid, wrong binding and missing evidence`, () => {
    const o = valid(definition.scenarioId); expect(definition.grade(o), JSON.stringify(definition.grade(o).checks)).toMatchObject({ passed: true });
    const wrong = structuredClone(o);
    if (definition.scenarioId.endsWith("accept-one-proposal")) wrong.interactions[0]!.result!.commentId = "repeated-later-comment";
    else wrong.state.submitStatuses = [200, 200];
    expect(definition.grade(wrong).passed).toBe(false); expect(definition.grade(undefined).passed).toBe(false);
  });
  it("a settled non-backlog execution task is not rescued by longer observation", () => {
    for (const status of ["todo", "in_progress", "done"]) {
      const o = valid("questions-and-approvals.accept-one-proposal"); o.tasks[0]!.status = status;
      expect(gradeConfirmationWorkflow(o).passed).toBe(false);
    }
  });
  it("accepting the proposal twice cannot produce two durable tasks", () => {
    const o = valid("questions-and-approvals.accept-one-proposal"); o.tasks.push({ ...o.tasks[0]!, id: "duplicate" }); expect(gradeConfirmationWorkflow(o).passed).toBe(false);
  });
  it("a task created before the protected answer cannot be credited despite a correct final artifact", () => {
    const o = valid("questions-and-approvals.duplicate-answer"); o.state.noTaskBeforeAnswers = false;
    expect(gradeConfirmationWorkflow(o).passed).toBe(false);
  });
  it("a duplicated answer continuation is rejected even with identical final output", () => {
    const o = valid("questions-and-approvals.duplicate-answer"); o.runs.push({ ...o.runs[1]!, id: "extra-resume" }); expect(gradeConfirmationWorkflow(o).passed).toBe(false);
  });
  it("an empty task or unattributed document is not an artifact result", () => {
    const o = valid("questions-and-approvals.duplicate-answer"); o.documents = []; expect(gradeConfirmationWorkflow(o).passed).toBe(false);
    const wrong = valid("questions-and-approvals.duplicate-answer"); wrong.revisions[0]!.createdByRunId = "unrelated-run"; expect(gradeConfirmationWorkflow(wrong).passed).toBe(false);
  });
  it("rejects a real revision attributed to another agent or another document", () => {
    const o = valid("questions-and-approvals.duplicate-answer"); o.revisions[0]!.createdByAgentId = "unrelated-agent"; expect(gradeConfirmationWorkflow(o).passed).toBe(false);
    const wrong = valid("questions-and-approvals.duplicate-answer"); wrong.revisions[0]!.documentId = "unrelated-document"; expect(gradeConfirmationWorkflow(wrong).passed).toBe(false);
  });
});
