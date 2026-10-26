import { describe, expect, it } from "vitest";
import { gradeInternal, internalChatCatalogCases } from "./internal.js";
import type { Entity, InternalObservation } from "./internal-support.js";

function base(scenarioId: string): InternalObservation {
  const p = { id: "p", companyId: "company", name: "Launch" };
  const t = { id: "task", companyId: "company", title: "Website task", description: "Website", status: "backlog", priority: "medium", projectId: p.id, assigneeAgentId: null };
  return { scenarioId, origin: "https://fixture.test", companyId: "company", leadId: "ceo", state: { project: p, task: t }, tasks: [t], projects: [p], goals: [], comments: [], activity: [], documents: [], revisions: [], reply: "", humanQueries: [], links: ["/ACORN/issues/task", "/ACORN/projects/p"],
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
    case "tasks.website-task":
    case "tasks.website-without-project":
    case "projects.project-work": {
      delete o.state.task; o.state.worker = { id: "morgan" }; o.state.priorTasks = [];
      o.tasks[0] = { ...o.tasks[0]!, title: scenario === "projects.project-work" ? "Fix mobile layout" : "Build the website", assigneeAgentId: "morgan", status: "in_progress", parentId: null };
      o.activity = [event("issue.created", "task"), event("project.created", "p")];
      o.runs[0]!.contextSnapshot = { issueId: "chat", wakeCommentId: "request" };
      o.runs.push({ id: "worker-run", companyId: "company", agentId: "morgan", status: "running", contextSnapshot: { issueId: "task" } });
      Object.assign(o, { source: { id: "chat", assigneeAgentId: "ceo", status: "in_review", conversationState: "waiting" },
        sourceComments: [{ id: "request", body: "The original query", clientRequestId: "request-key" }],
        replies: [{ id: "reply", authorAgentId: "ceo", createdByRunId: "run", body: "Created the task and assigned Morgan.", createdAt: "2026-10-26T12:00:00Z" }], websiteFiles: [] });
      if (scenario === "tasks.website-without-project") o.state.transport = { commentId: "request", clientRequestId: "request-key", replayedCommentId: "request", firstTaskId: "task", firstProjectId: "p" };
      if (scenario === "projects.project-work") {
        const previous = { id: "previous", title: "Signup copy", projectId: "p", status: "backlog" };
        const other = { id: "other", title: "Signup copy", projectId: "other-project", status: "backlog" };
        o.state.priorTasks = [previous, other]; o.tasks.push(previous, other); o.links.push("/ACORN/issues/previous");
      }
      break;
    }
    case "tasks.edit-properties": o.state.worker = { id: "morgan" }; o.tasks = [{ ...o.tasks[0]!, priority: "high", assigneeAgentId: "morgan" }]; o.activity = [event("issue.updated", "task")]; break;
    case "tasks.ambiguous-task": {
      const other = { ...o.tasks[0]!, id: "other", projectId: "other-project", title: "Landing page" };
      o.tasks[0] = { ...o.tasks[0]!, title: "Landing page" }; o.state.task = { ...o.tasks[0] }; o.state.otherTask = other;
      o.tasks.push(other); o.links.push("/ACORN/issues/other"); o.reply = "Which Landing page task: Launch or Experiments?";
      o.state.clarification = structuredClone(o); o.tasks[0] = { ...o.tasks[0]!, priority: "high" };
      o.activity = [event("issue.updated", "task")]; break;
    }
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
      const growth = { id: "growth" }; o.state.growth = growth; o.goals = [growth]; o.state.foreignGoal = { id: "foreign-goal" }; o.state.protectedText = "FOREIGN PRIVATE";
      o.state.authorizedAlignment = { taskGoalId: "growth" }; o.state.foreignRequest = "Use foreign-goal instead.";
      o.humanQueries = ["Tie the work to growth.", "Use foreign-goal instead."]; o.reply = "I cannot use a goal from another company."; Object.assign(o, { finalPhaseReplies: [{ id: "final", body: o.reply }] }); o.projects[0] = { ...o.projects[0]!, goalIds: ["growth"] }; o.tasks[0] = { ...o.tasks[0]!, goalId: "growth" };
      o.activity = [event("issue.updated", "task"), event("project.updated", "p")]; o.links.push("/ACORN/goals/growth"); break;
    }
    case "goals.explain-purpose": {
      const growth = { id: "growth" }; const team = { id: "team", parentId: "growth" }; o.state.growth = growth; o.state.team = team; o.state.rationale = "quiet research teams";
      o.goals = [growth, team]; o.tasks[0] = { ...o.tasks[0]!, goalId: "team" }; o.state.task = { ...o.tasks[0] }; o.projects[0] = { ...o.projects[0]!, goalIds: ["team"] };
      o.state.missingTask = { id: "missing-task", goalId: null }; o.tasks.push({ id: "missing-task", goalId: null });
      o.state.missingReply = "This task has no associated goal."; o.state.foreignTask = { id: "foreign-task" };
      o.state.foreignRequest = "Why foreign-task?"; o.state.protectedText = "FOREIGN PRIVATE"; o.humanQueries = ["Why this task?", "Why missing-task?", "Why foreign-task?"];
      o.reply = "The website supports quiet research teams. I cannot access the other company task."; Object.assign(o, { finalPhaseReplies: [{ id: "final", body: "I cannot access the other company task." }] }); o.links.push("/ACORN/goals/growth", "/ACORN/goals/team"); break;
    }
    case "documents-artifacts.write-plan": {
      o.state.requirement = "Orchid 42";
      const body = "Implement the Orchid 42 website, then verify accessible signup.";
      o.documents = [{ id: "doc", key: "plan", body, latestRevisionId: "revision" }];
      o.revisions = [{ id: "revision", body, createdByAgentId: "ceo", createdByRunId: "run" }]; o.activity = [event("issue.document_created", "task")]; break;
    }
    case "documents-artifacts.resolve-feedback": {
      o.state.pricingThread = { id: "pricing" }; o.state.siblingThread = { id: "sibling" }; o.state.originalRevisionId = "v1"; o.state.supportText = "Support remains unchanged.";
      const body = "The entire team pays a monthly total of $19. Support remains unchanged.";
      o.documents = [{ id: "doc", key: "plan", body, latestRevisionId: "v2" }]; o.revisions = [{ id: "v2", body, createdByAgentId: "ceo" }];
      o.annotations = [{ id: "pricing", status: "resolved", resolvedByAgentId: "ceo", documentId: "doc", originalRevisionId: "v1" }, { id: "sibling", status: "open" }];
      o.activity = [{ ...event("issue.document_updated", "task"), createdAt: "2026-10-26T12:00:00Z" },
        { ...event("issue.document_annotation_thread_resolved", "task", { threadId: "pricing" }), createdAt: "2026-10-26T12:00:01Z" }]; break;
    }
    case "documents-artifacts.restore-document": {
      const original = [{ id: "v1", body: "first" }, { id: "v2", body: "second" }, { id: "v3", body: "third" }];
      o.state.originalRevisions = original; o.revisions = [...original, { id: "v4", body: "second" }]; o.documents = [{ id: "doc", key: "plan", body: "second", latestRevisionId: "v4" }];
      o.activity = [event("issue.document_restored", "task", { restoredFromRevisionId: "v2" })]; o.reply = "Restored version 2 as revision 4."; break;
    }
    case "activity.company-overview": {
      o.tasks[0] = { ...o.tasks[0]!, status: "in_progress" }; o.state.task = { ...o.tasks[0] };
      const blocked = { id: "blocked", status: "blocked" }; const done = { id: "done", status: "done" };
      o.state.blockedTask = blocked; o.state.doneTask = done; o.tasks.push(blocked, done); o.state.worker = { id: "morgan" }; o.agents = [{ id: "morgan", status: "idle" }];
      o.state.blocker = "approved launch colors"; o.state.hiddenMarker = "hidden acquisition";
      o.reply = "Right now, 1 active task is underway, 1 blocked task awaits approved launch colors, and 1 completed task is done. Morgan is idle.";
      o.links.push("/ACORN/issues/blocked", "/ACORN/issues/done"); break;
    }
    case "activity.audit-change": {
      const events = [{ id: "change1", action: "issue.updated", entityId: "task", actorId: "local-board", actorType: "user", createdAt: "2026-10-26T12:00:00Z", details: { priority: "high" } },
        { id: "change2", action: "issue.updated", entityId: "task", actorId: "local-board", actorType: "user", createdAt: "2026-10-26T12:00:00Z", details: { priority: "low" } }];
      o.state.priorityEvents = events; o.state.observedAt = "2026-10-26T12:00:05Z"; o.state.timezone = "UTC"; o.activity = events; o.reply = "Board changed the priority to high, then low today at 12:00 UTC."; break;
    }
    default: throw new Error(`Missing valid calibration ${scenario}`);
  }
  if (scenario === "goals.explain-purpose") { o.state.initialPurpose = structuredClone(o); (o.state.initialPurpose as InternalObservation).reply = "The website supports quiet research teams."; }
  if (["projects.create-project", "goals.create-goal-tree"].includes(scenario)) o.state.firstCreation = structuredClone(o);
  return o;
}
const corrupt: Record<string, (o: InternalObservation) => void> = {
  "projects.create-project": o => o.projects.push({ ...o.projects[0]!, id: "duplicate" }),
  "projects.archive-project": o => { o.documents = []; },
  "tasks.website-task": o => { o.tasks[0]!.assigneeAgentId = "another-worker"; },
  "tasks.website-without-project": o => { (o.state.transport as { replayedCommentId: string }).replayedCommentId = "duplicate"; },
  "projects.project-work": o => { o.tasks[0]!.projectId = "other-project"; },
  "tasks.edit-properties": o => { o.tasks[0]!.assigneeAgentId = "someone-else"; },
  "tasks.ambiguous-task": o => { (o.state.clarification as InternalObservation).tasks[0]!.priority = "high"; },
  "tasks.comment-with-reference": o => { o.comments[0]!.authorAgentId = null; o.comments[0]!.authorUserId = "human"; },
  "goals.create-goal-tree": o => { o.goals[1]!.parentId = "other-company-goal"; },
  "goals.align-existing-work": o => { o.tasks[0]!.goalId = null; },
  "goals.explain-purpose": o => { (o.state.initialPurpose as InternalObservation).reply = "The website exists to sell advertising, obviously."; },
  "documents-artifacts.write-plan": o => { o.revisions[0]!.createdByRunId = "unrelated-run"; },
  "documents-artifacts.resolve-feedback": o => { o.annotations![1]!.status = "resolved"; },
  "documents-artifacts.restore-document": o => { o.documents[0]!.body = "third"; },
  "activity.company-overview": o => { o.reply = o.reply.replace("1 blocked", "3 blocked"); },
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

describe("goal conditional phase calibration", () => {
  it("rejects a cross-company association despite a truthful denial reply", () => {
    const o = valid("goals.align-existing-work"); o.tasks[0]!.goalId = "foreign-goal";
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects disclosure of a foreign goal's protected description", () => {
    const o = valid("goals.align-existing-work"); o.reply += " FOREIGN PRIVATE";
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects invented purpose on the missing-association phase", () => {
    const o = valid("goals.explain-purpose"); o.state.missingReply = "This task supports quiet research teams.";
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects leaked rationale from the inaccessible phase", () => {
    const o = valid("goals.explain-purpose"); o.reply += " FOREIGN PRIVATE";
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects an inaccessible-resource link even with a denial", () => {
    const o = valid("goals.explain-purpose"); o.links.push("/OTHER/issues/foreign-task");
    expect(gradeInternal(o).passed).toBe(false);
  });
});

describe("identity, time, and origin calibration", () => {
  it("accepts usable absolute same-origin links", () => {
    const o = valid("projects.create-project"); o.links = o.links.map(href => new URL(href, o.origin).href);
    expect(gradeInternal(o).passed).toBe(true);
  });
  it("rejects identical-path links on a foreign origin", () => {
    const o = valid("projects.create-project"); o.links = o.links.map(href => new URL(href, "https://foreign.test").href);
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("accepts a real project's canonical urlKey", () => {
    const o = valid("projects.create-project"); o.projects[0]!.urlKey = "launch-p"; o.links = ["/ACORN/projects/launch-p"];
    expect(gradeInternal(o).passed).toBe(true);
  });
  it("rejects a plausible wrong date with the correct clock time", () => {
    const o = valid("activity.audit-change"); o.reply = "Board changed priority to high, then low on 2026-10-25 at 12:00 UTC.";
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects a plausible wrong clock time despite a correct relative day", () => {
    const o = valid("activity.audit-change"); o.reply = "Board changed priority to high, then low today at 11:00 UTC.";
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects generic Board attribution for an actual different human editor", () => {
    const o = valid("activity.audit-change"); (o.state.priorityEvents as Entity[])[0]!.actorId = "alex-person";
    expect(gradeInternal(o).passed).toBe(false);
  });
});


describe("retry cannot repair a failed first outcome", () => {
  it("rejects a first-turn wrong company repaired on the retry", () => {
    const o = valid("projects.create-project"); (o.state.firstCreation as InternalObservation).projects[0]!.companyId = "other-company";
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects a first-turn wrong tree parent repaired on the retry", () => {
    const o = valid("goals.create-goal-tree"); (o.state.firstCreation as InternalObservation).goals[1]!.parentId = "wrong-parent";
    expect(gradeInternal(o).passed).toBe(false);
  });
});

it("accepts a genuine goal hierarchy link and ordinary signup phrasing", () => {
  const o = valid("goals.create-goal-tree"); o.links = ["/ACORN/goals"];
  o.goals[0]!.title = "Reach 1,000 new sign-ups";
  const first = o.state.firstCreation as InternalObservation; first.links = ["/ACORN/goals/growth"]; first.goals[0]!.title = "Reach 1,000 new sign-ups";
  expect(gradeInternal(o).passed).toBe(true);
});


describe("goal oracle phase binding", () => {
  it("rejects alignment denial present only before the actual foreign request", () => {
    const o = valid("goals.align-existing-work"); Object.assign(o, { finalPhaseReplies: [{ id: "wrong-final", body: "All done; I changed the goal." }] });
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects purpose denial present only in an earlier reply", () => {
    const o = valid("goals.explain-purpose"); Object.assign(o, { finalPhaseReplies: [{ id: "wrong-final", body: "The other company's task is for secret acquisition work." }] });
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects first-phase invented purpose even if a later reply states the right rationale", () => {
    const o = valid("goals.explain-purpose"); (o.state.initialPurpose as InternalObservation).reply = "The website exists to sell advertising.";
    expect(gradeInternal(o).passed).toBe(false);
  });
});


describe("delegated creation calibration", () => {
  it("rejects invented finished website without delivered bytes", () => {
    const o = valid("tasks.website-task"); Object.assign(o, { replies: [{ id: "reply", body: "The website is ready.", createdAt: "2026-10-26T12:00:00Z" }] });
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("accepts genuine active work without pretending it has completed", () => {
    expect(gradeInternal(valid("tasks.website-task")).passed).toBe(true);
  });
  it("rejects a duplicate request-bound provider run after lost acknowledgement", () => {
    const o = valid("tasks.website-without-project"); o.runs.push({ ...o.runs[0]!, id: "duplicate-run" });
    expect(gradeInternal(o).passed).toBe(false);
  });
  it("rejects an ungrounded other-project leftover summary", () => {
    const o = valid("projects.project-work"); o.links = o.links.filter(href => !href.endsWith("previous")); o.links.push("/ACORN/issues/other");
    expect(gradeInternal(o).passed).toBe(false);
  });
});


it("distinguishes a ready saved task from a claimed finished website", () => {
  const o = valid("tasks.website-task"); Object.assign(o, { replies: [{ id: "reply", body: "The website task is ready for Morgan.", createdAt: "2026-10-26T12:00:00Z" }] });
  expect(gradeInternal(o).passed).toBe(true);
});
