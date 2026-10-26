import { describe, expect, it } from "vitest";
import { gradeInternal, internalChatCatalogCases } from "./internal.js";
import type { Entity, InternalObservation } from "./internal-support.js";

function base(scenarioId: string): InternalObservation {
  const p = { id: "p", companyId: "company", name: "Launch" };
  const t = { id: "task", companyId: "company", title: "Website task", description: "Website", status: "backlog", priority: "medium", projectId: p.id, assigneeAgentId: null };
  return { scenarioId, companyId: "company", leadId: "ceo", state: { project: p, task: t }, tasks: [t], projects: [p], goals: [], comments: [], activity: [], documents: [], revisions: [], reply: "", humanQueries: [], links: ["/ACORN/issues/task", "/ACORN/projects/p"],
    runs: [{ id: "run", companyId: "company", agentId: "ceo", status: "succeeded" }] };
}
function event(action: string, entityId: string, details?: Record<string, unknown>): Entity {
  return { id: `${action}-${entityId}`, action, entityId, agentId: "ceo", details };
}
function valid(scenario: string): InternalObservation {
  const o = base(scenario);
  switch (scenario) {
    case "projects.create-project": o.state = { firstIds: ["p"], retryQuery: "query" }; o.humanQueries = ["query", "query"]; o.tasks = []; o.activity = [event("project.created", "p")]; break;
    case "projects.archive-project": {
      o.projects[0] = { ...o.projects[0]!, archivedAt: "2026-10-26T12:00:00Z" }; o.state.originalBody = "Delivered"; o.state.originalActivityId = "original";
      o.documents = [{ id: "doc", body: "Delivered" }]; o.activity = [{ id: "original", action: "issue.created", entityId: "task" }, event("project.updated", "p")]; break;
    }
    case "tasks.edit-properties": o.state.worker = { id: "morgan" }; o.tasks = [{ ...o.tasks[0]!, priority: "high", assigneeAgentId: "morgan" }]; o.activity = [event("issue.updated", "task")]; break;
    case "tasks.comment-with-reference": {
      const design = { id: "design", title: "Approved design", status: "done" }; o.state.design = design; o.tasks.push(design);
      o.comments = [{ id: "comment", authorAgentId: "ceo", createdByRunId: "run", body: "Follow the [approved design](/ACORN/issues/design)." }]; break;
    }
    case "goals.create-goal-tree": {
      o.state = { firstIds: ["growth", "team"], retryQuery: "query" }; o.humanQueries = ["query", "query"]; o.tasks = []; o.projects = [];
      o.goals = [{ id: "growth", companyId: "company", title: "Reach a thousand signups", level: "company", parentId: null, ownerAgentId: "ceo" },
        { id: "team", companyId: "company", title: "Launch the website", level: "team", parentId: "growth", ownerAgentId: "ceo" }];
      o.activity = o.goals.map(row => event("goal.created", row.id)); o.links = ["/ACORN/goals/growth", "/ACORN/goals/team"]; break;
    }
    case "goals.align-existing-work": {
      const growth = { id: "growth" }; o.state.growth = growth; o.goals = [growth]; o.projects[0] = { ...o.projects[0]!, goalIds: ["growth"] }; o.tasks[0] = { ...o.tasks[0]!, goalId: "growth" };
      o.activity = [event("issue.updated", "task"), event("project.updated", "p")]; o.links.push("/ACORN/goals/growth"); break;
    }
    case "goals.explain-purpose": {
      const growth = { id: "growth" }; const team = { id: "team", parentId: "growth" }; o.state.growth = growth; o.state.team = team; o.state.rationale = "quiet research teams";
      o.goals = [growth, team]; o.tasks[0] = { ...o.tasks[0]!, goalId: "team" }; o.state.task = { ...o.tasks[0] }; o.projects[0] = { ...o.projects[0]!, goalIds: ["team"] };
      o.reply = "The website supports quiet research teams."; o.links.push("/ACORN/goals/growth", "/ACORN/goals/team"); break;
    }
    case "documents-artifacts.write-plan": {
      o.state.requirement = "Orchid 42";
      const body = "Implement the Orchid 42 website, then verify accessible signup.";
      o.documents = [{ id: "doc", key: "plan", body, latestRevisionId: "revision" }];
      o.revisions = [{ id: "revision", body, createdByAgentId: "ceo", createdByRunId: "run" }]; o.activity = [event("issue.document_created", "task")]; break;
    }
    case "documents-artifacts.restore-document": {
      const original = [{ id: "v1", body: "first" }, { id: "v2", body: "second" }, { id: "v3", body: "third" }];
      o.state.originalRevisions = original; o.revisions = [...original, { id: "v4", body: "second" }]; o.documents = [{ id: "doc", key: "plan", body: "second", latestRevisionId: "v4" }];
      o.activity = [event("issue.document_restored", "task", { restoredFromRevisionId: "v2" })]; o.reply = "Restored version 2 as revision 4."; break;
    }
    case "activity.audit-change": {
      const events = [{ id: "change1", action: "issue.updated", entityId: "task", actorId: "local-board", actorType: "user", details: { priority: "high" } },
        { id: "change2", action: "issue.updated", entityId: "task", actorId: "local-board", actorType: "user", details: { priority: "low" } }];
      o.state.priorityEvents = events; o.activity = events; o.reply = "Board changed the priority to high, then low today."; break;
    }
    default: throw new Error(`Missing valid calibration ${scenario}`);
  }
  return o;
}
const corrupt: Record<string, (o: InternalObservation) => void> = {
  "projects.create-project": o => o.projects.push({ ...o.projects[0]!, id: "duplicate" }),
  "projects.archive-project": o => { o.documents = []; },
  "tasks.edit-properties": o => { o.tasks[0]!.assigneeAgentId = "someone-else"; },
  "tasks.comment-with-reference": o => { o.comments[0]!.authorAgentId = null; o.comments[0]!.authorUserId = "human"; },
  "goals.create-goal-tree": o => { o.goals[1]!.parentId = "other-company-goal"; },
  "goals.align-existing-work": o => { o.tasks[0]!.goalId = null; },
  "goals.explain-purpose": o => { o.reply = "The website exists to sell advertising, obviously."; },
  "documents-artifacts.write-plan": o => { o.revisions[0]!.createdByRunId = "unrelated-run"; },
  "documents-artifacts.restore-document": o => { o.documents[0]!.body = "third"; },
  "activity.audit-change": o => { o.reply = "Morgan, the current assignee, probably changed it today."; },
};
describe("internal chat scenario independent oracles", () => {
  for (const definition of internalChatCatalogCases) {
    it(`${definition.scenarioId}: valid result and plausible wrong outcome`, () => {
      const good = valid(definition.scenarioId);
      expect(gradeInternal(good), JSON.stringify(gradeInternal(good).checks)).toMatchObject({ passed: true });
      const wrong = structuredClone(good); corrupt[definition.scenarioId]!(wrong);
      expect(gradeInternal(wrong).passed).toBe(false);
      expect(gradeInternal(undefined).passed).toBe(false);
      const noLinks = structuredClone(good); noLinks.links = [];
      expect(gradeInternal(noLinks).passed).toBe(false);
    });
  }
  it("never treats an unimplemented scenario as passing", () => expect(gradeInternal(base("inbox-search.archive-done")).passed).toBe(false));
});
