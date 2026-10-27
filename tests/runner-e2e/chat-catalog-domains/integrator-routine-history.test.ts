import { describe, expect, it } from "vitest";
import { gradeIntegratorRoutineHistory } from "./integrator-routine-history.js";
function valid() {
  const first = { id: "failed-task", identifier: "ACORN-1", title: "Morning Launch summary", status: "in_progress" };
  const second = { id: "completed-task", identifier: "ACORN-2", title: "Morning Launch summary", status: "done" };
  const failure = { id: "failed-native", companyId: "company", agentId: "morgan", runtimeMode: "native", status: "failed", startedAt: "2026-10-26T12:00:00Z", errorCode: "provider_error", error: "Unavailable model", contextSnapshot: { issueId: first.id }, runnerProfileJson: { nativeExecutionInput: { provider: { kind: "codex", model: "unavailable-test" } } } };
  return { scenarioId: "routines.read-history", origin: "https://fixture.test", companyId: "company", leadId: "ceo", state: { worker: { id: "morgan" }, failedIssueId: first.id, completedIssueId: second.id,
    failedInvocationId: "invocation-one", completedInvocationId: "invocation-two", failedRun: structuredClone(failure), failedModel: "unavailable-test", failedEvents: [{ eventType: "run.terminal" }], completedNativeRunId: "completed-native", weekStart: Date.parse("2026-10-26T00:00:00Z"), weekEnd: Date.parse("2026-11-02T00:00:00Z") },
    tasks: [first, second], projects: [], goals: [], comments: [], documents: [], revisions: [], humanQueries: [], activity: [], links: ["/ACORN/issues/ACORN-1", "/ACORN/issues/ACORN-2"],
    runs: [failure, { id: "completed-native", companyId: "company", agentId: "morgan", runtimeMode: "native", status: "succeeded", contextSnapshot: { issueId: second.id } }],
    routine: { id: "routine", title: "Morning Launch summary" }, executions: [{ id: "invocation-one", source: "manual", status: "issue_created", linkedIssueId: first.id, triggeredAt: "2026-10-26T12:00:00Z" }, { id: "invocation-two", source: "manual", status: "completed", linkedIssueId: second.id, triggeredAt: "2026-10-26T13:00:00Z" }],
    reply: "ACORN-1: its native execution failed; the routine invocation is still issue_created.\nACORN-2: the execution completed successfully.\nBoth are manual runs this week; there is no confirmed scheduled morning execution." };
}
describe("routine invocation and native failure distinction", () => {
  it("accepts distinct genuinely admitted failure and completed invocation, never absent evidence", () => {
    expect(gradeIntegratorRoutineHistory(valid()).passed).toBe(true);
    expect(gradeIntegratorRoutineHistory({ ...valid(), reply: "Two manual runs this week: ACORN-1 failed; ACORN-2 completed successfully." }).passed).toBe(true);
    expect(gradeIntegratorRoutineHistory(undefined).passed).toBe(false);
    const missing = valid(); missing.state.failedEvents = [];
    expect(gradeIntegratorRoutineHistory(missing).passed).toBe(false);
  });
  it("rejects preflight or cancellation substituted for an admitted native failure", () => {
    const cancelled = valid(); cancelled.runs[0]!.status = "cancelled";
    expect(gradeIntegratorRoutineHistory(cancelled).passed).toBe(false);
    const wrongModel = valid(); wrongModel.state.failedRun.runnerProfileJson.nativeExecutionInput.provider.model = "valid-model";
    expect(gradeIntegratorRoutineHistory(wrongModel).passed).toBe(false);
    const wrongTask = valid(); wrongTask.runs[1]!.contextSnapshot.issueId = "unrelated-task";
    expect(gradeIntegratorRoutineHistory(wrongTask).passed).toBe(false);
    const stale = valid(); stale.executions[0]!.triggeredAt = "2026-10-19T12:00:00Z";
    expect(gradeIntegratorRoutineHistory(stale).passed).toBe(false);
  });
  it("rejects last-success-only, false scheduled success and missing failure links", () => {
    const o = valid();
    expect(gradeIntegratorRoutineHistory({ ...o, reply: "ACORN-2 completed successfully; all runs succeeded this week. The saved schedule is proof." }).passed).toBe(false);
    expect(gradeIntegratorRoutineHistory({ ...o, reply: "ACORN-1 failed. ACORN-2 completed. Both scheduled morning summaries ran successfully." }).passed).toBe(false);
    expect(gradeIntegratorRoutineHistory({ ...o, links: ["/ACORN/issues/ACORN-2"] }).passed).toBe(false);
  });
});
