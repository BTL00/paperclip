import { describe, expect, it, vi } from "vitest";
import { answerContinuationCompleted, confirmationWorkflowIdentityCases, gradeConfirmationWorkflow, waitForAnswerContinuation } from "./identity-confirmation-workflows.js";
import * as api from "../api.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
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
    o.interactions = [{ ...original, status: "answered", resolvedByUserId: "alex", resolvedAt: "2026-10-28T10:00:02Z", result: { answers: [{ questionId: "product", otherText: "Acorn", optionIds: [] }] } }];
    Object.assign(o.state, { humanId: "alex", sourceIssueId: "source", sourceConversationState: "waiting", canonicalCommentId: "canonical", worker: { id: "morgan" }, submitStatuses: [409, 200], actualSubmitRequests: 2, noTaskBeforeAnswers: true, bothTabsResolved: true });
    o.activity = [{ id: "answer", action: "issue.thread_interaction_answered", actorType: "user", details: { interactionId: "request" } },
      { id: "delivery", action: "issue.question_response_delivered", entityId: "source", actorType: "system", actorId: "question-response-delivery", details: { interactionId: "request", targetRunId: "continue", deliveryStatus: "fallback_queued" } },
      { id: "document", action: "issue.document_created", entityId: "draft", agentId: "morgan", details: { documentId: "introduction", key: "introduction" } }];
    o.documents = [{ id: "introduction", key: "introduction", issueId: "draft", body: "Acorn helps small teams write clear product introductions.", latestRevisionId: "revision" }];
    o.revisions = [{ id: "revision", documentId: "introduction", createdByRunId: "write", createdByAgentId: "morgan" }];
    o.tasks[0]!.status = "done";
    o.runs = [{ id: "query", companyId: "acorn", agentId: "ceo", status: "succeeded", startedAt: "2026-10-28T10:00:00Z", contextSnapshot: { issueId: "source", commentId: "canonical" } },
      { id: "continue", companyId: "acorn", agentId: "ceo", status: "succeeded", startedAt: "2026-10-28T10:00:03Z", contextSnapshot: { interactionId: "request", issueId: "source" } },
      { id: "write", companyId: "acorn", agentId: "morgan", status: "succeeded", startedAt: "2026-10-28T10:00:04Z" }];
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

describe("answer continuation and ordinary deliverable custody", () => {
  it("retains one mandatory plan beside one actual introduction without hiding duplicate deliverables", () => {
    const o = valid("questions-and-approvals.duplicate-answer");
    o.documents.push({ id: "plan", key: "plan", issueId: "draft", body: "Draft an introduction", latestRevisionId: "plan-revision" });
    o.revisions.push({ id: "plan-revision", documentId: "plan", createdByRunId: "query", createdByAgentId: "ceo" });
    expect(gradeConfirmationWorkflow(o).passed).toBe(true);
    o.documents.push({ ...o.documents[0]!, id: "duplicate", key: "second-introduction" });
    expect(gradeConfirmationWorkflow(o).passed).toBe(false);
  });
  it.each(["foreign-task", "wrong-key", "unfinished", "wrong-company", "unstarted", "unattributed-plan"])("rejects %s output evidence", kind => {
    const o = valid("questions-and-approvals.duplicate-answer");
    if (kind === "foreign-task") o.documents[0]!.issueId = "foreign";
    if (kind === "wrong-key") o.activity.find(row => row.id === "document")!.details!.key = "other";
    if (kind === "unfinished") o.runs[2]!.status = "running";
    if (kind === "wrong-company") o.runs[2]!.companyId = "foreign";
    if (kind === "unstarted") o.runs[2]!.startedAt = null;
    if (kind === "unattributed-plan") o.documents.push({ id: "plan", key: "plan", issueId: "draft", latestRevisionId: "missing" });
    expect(gradeConfirmationWorkflow(o).passed).toBe(false);
  });
  it.each(["null-target", "wrong-target", "queued", "unstarted", "before-answer", "foreign-company", "foreign-issue", "unrelated-canonical", "missing-canonical", "missing-resolution", "running-source"])("does not infer consumption from %s", kind => {
    const o = valid("questions-and-approvals.duplicate-answer");
    const delivery = o.activity.find(row => row.id === "delivery")!;
    if (kind === "null-target") delivery.details!.targetRunId = null;
    if (kind === "wrong-target") delivery.details!.targetRunId = "unrelated";
    if (kind === "queued") o.runs[1]!.status = "queued";
    if (kind === "unstarted") o.runs[1]!.startedAt = null;
    if (kind === "before-answer") o.runs[1]!.startedAt = "2026-10-28T10:00:01Z";
    if (kind === "foreign-company") o.runs[1]!.companyId = "foreign";
    if (kind === "foreign-issue") o.runs[1]!.contextSnapshot!.issueId = "foreign";
    if (kind === "unrelated-canonical") o.runs[0]!.contextSnapshot!.commentId = "other";
    if (kind === "missing-canonical") delete o.state.canonicalCommentId;
    if (kind === "missing-resolution") delete o.interactions[0]!.resolvedAt;
    if (kind === "running-source") o.state.sourceConversationState = "active";
    expect(answerContinuationCompleted(o)).toBe(false);
    expect(gradeConfirmationWorkflow(o).passed).toBe(false);
  });
  it("uses the original setup-inclusive clock and refuses expired or late results", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(200_000);
    const poll = vi.spyOn(api, "pollUntil").mockImplementation(async options => {
      expect(options.deadlineAt).toBe(570_000);
      expect(options.accept(valid("questions-and-approvals.duplicate-answer"))).toBe(true);
      clock.mockReturnValue(570_000);
      expect(options.accept(valid("questions-and-approvals.duplicate-answer"))).toBe(false);
      return undefined as never;
    });
    const ctx = { observationDeadlineAt: 570_000 } as ChatCatalogContext;
    try {
      await waitForAnswerContinuation(ctx, {});
      expect(poll).toHaveBeenCalledTimes(1);
      await expect(waitForAnswerContinuation(ctx, {})).rejects.toThrow("exhausted");
      expect(poll).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); poll.mockRestore(); }
  });
});
