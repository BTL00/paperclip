import { describe, expect, it } from "vitest";
import { gradeEditOwnership } from "./internal-edit-ownership.js";
import { grade_tasks } from "./internal-tasks.js";
import type { InternalObservation, Entity } from "./internal-support.js";
function valid() {
  const initial = { id: "task", companyId: "company", title: "Landing page", status: "backlog", priority: "medium", assigneeAgentId: null };
  const first: InternalObservation = { scenarioId: "tasks.edit-properties", origin: "https://fixture.test", companyId: "company", leadId: "ceo", state: { task: initial, worker: { id: "morgan" } }, tasks: [{ ...initial, priority: "high", assigneeAgentId: "morgan" }], projects: [], goals: [], comments: [], activity: [{ id: "first-edit", entityId: "task", action: "issue.updated", agentId: "ceo", details: { priority: "high" } }], documents: [], revisions: [], links: ["/RUN/issues/task"], humanQueries: [], reply: "Saved High priority and Morgan assignment.", runs: [{ id: "first", companyId: "company", agentId: "ceo", status: "succeeded" }] };
  const held = { ...initial, assigneeAgentId: "riley", status: "in_progress", executionRunId: "riley-run", checkoutRunId: "riley-run" };
  return { ...structuredClone(first), state: { ...first.state, firstEdit: first, riley: { id: "riley" }, heldTask: structuredClone(held), heldRun: { id: "riley-run" }, gateCalls: [{ authorized: true }] }, tasks: [held], currentTask: held,
    phaseReply: "Riley holds the running execution checkout. I cannot change priority or reassign to Morgan until that ownership is released.",
    runs: [...first.runs, { id: "riley-run", companyId: "company", agentId: "riley", status: "running" }, { id: "second", companyId: "company", agentId: "ceo", status: "succeeded" }] };
}
const grade = (o: unknown) => gradeEditOwnership(o, grade_tasks);
describe("property edit execution-boundary conditional calibration", () => {
  it("accepts actual primary success and truthful later denial of both changes", () => expect(grade(valid()).passed).toBe(true));
  it("accepts an independently saved priority with denied reassignment", () => { const o = valid(); o.currentTask.priority = "high"; o.phaseReply = "Priority is now high. Riley holds the running checkout; I cannot assign Morgan until that execution ends."; o.activity.push({ id: "final-edit", entityId: "task", action: "issue.updated", agentId: "ceo", details: { priority: "high" }, runId: "second" } as Entity); expect(grade(o).passed).toBe(true); });
  it("rejects a false saved priority or assignment claim", () => { const o = valid(); o.phaseReply = "Priority is now high. Riley has a running checkout; I cannot verify it, but I assigned Morgan."; expect(grade(o).passed).toBe(false); });
  it("rejects repairing a wrong initial edit in the later phase", () => { const o = valid(); o.state.firstEdit.tasks[0]!.assigneeAgentId = "other"; expect(grade(o).passed).toBe(false); });
  it("rejects stealing the real checkout or admitting Morgan concurrently", () => { const o = valid(); o.currentTask.executionRunId = "other"; expect(grade(o).passed).toBe(false); const extra = valid(); extra.runs.push({ id: "morgan-run", companyId: "company", agentId: "morgan", status: "running" }); expect(grade(extra).passed).toBe(false); });
  it("does not credit a prior phase's priority audit as the conditional save", () => { const o = valid(); o.currentTask.priority = "high"; o.phaseReply = "Priority is now high. Riley holds the running checkout; I cannot assign Morgan until it ends."; expect(grade(o).passed).toBe(false); });
  it("rejects a wrong-phase-only explanation", () => { const o = valid(); o.reply += o.phaseReply; o.phaseReply = "Done."; expect(grade(o).passed).toBe(false); });
});
