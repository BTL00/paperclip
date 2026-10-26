import type { ChatCatalogCase } from "../chat-catalog-contract.js";
import { observeInternal, project, task, goal, putDocument, entity, observation, checks, hasLink, sameTask, verifyInternalResult, type InternalObservation } from "./internal-support.js";

export function gradeInternal(value: unknown) {
  const c = checks(); const o = observation(value);
  c.add("complete-independent-observation", !!o, "Missing API, document, audit or rendered-link evidence cannot pass.");
  if (!o) return c.result();
  const before = o.state.task ? entity(o.state, "task") : undefined;
  const current = before && o.tasks.find(row => row.id === before.id);
  const savedProject = o.state.project ? entity(o.state, "project") : undefined;
  const projectNow = savedProject && o.projects.find(row => row.id === savedProject.id);
  const authored = (action: string, id: string) => o.activity.some(row => row.action === action && row.entityId === id && row.agentId === o.leadId);
  const linkedTask = () => !!current && hasLink(o, "issues", current);
  switch (o.scenarioId) {
    case "projects.create-project": {
      const created = o.projects.filter(row => row.name === "Launch");
      c.add("one-company-project", created.length === 1 && created[0]?.companyId === o.companyId, "Exactly one Launch is saved in the active company.");
      c.add("agent-created-project", created.length === 1 && authored("project.created", created[0]!.id), "Creation is attributed to the acting CEO rather than fixture setup.");
      c.add("usable-project-link", created.length === 1 && hasLink(o, "projects", created[0]!), "Chat renders the exact saved project link.");
      c.add("retry-reuses-first-project", Array.isArray(o.state.firstIds) && o.state.firstIds.length === 1 && created[0]?.id === o.state.firstIds[0]
        && o.humanQueries.filter(query => query === o.state.retryQuery).length === 2, "The exact user retry preserves the first saved project rather than silently creating and replacing it.");
      c.add("no-invented-ready-work", o.tasks.length === 0 && !/\b(?:deployed|website is ready|repository is ready)\b/i.test(o.reply), "Creation does not invent execution, repository readiness or a deployment.");
      break;
    }
    case "projects.archive-project": {
      c.add("archived-not-deleted", !!projectNow && Number.isFinite(Date.parse(projectNow.archivedAt ?? "")), "Launch remains retrievable in the supported archived state.");
      c.add("history-retained", !!before && sameTask(before, current) && o.documents.some(row => row.body === o.state.originalBody)
        && o.activity.some(row => row.id === o.state.originalActivityId), "The original task, document bytes and creation audit survive archiving.");
      c.add("attributed-project-update", !!projectNow && authored("project.updated", projectNow.id), "The saved lifecycle change belongs to the acting agent.");
      c.add("historical-link", !!projectNow && hasLink(o, "projects", projectNow), "Chat supplies a reachable historical project.");
      break;
    }
    case "tasks.edit-properties": {
      const worker = entity(o.state, "worker");
      c.add("exact-priority-assignee", !!current && current.priority === "high" && current.assigneeAgentId === worker.id, "The intended landing-page task has one eligible owner and High priority.");
      c.add("no-unrequested-changes", !!before && sameTask(before, current, ["priority", "assigneeAgentId"]) && o.tasks.length === 1, "Task context and execution state remain intact; no workaround duplicate exists.");
      c.add("saved-attribution", !!current && authored("issue.updated", current.id), "A real CEO-attributed mutation changed the requested task.");
      c.add("task-link", linkedTask(), "The reply links to the edited task.");
      break;
    }
    case "tasks.comment-with-reference": {
      const design = entity(o.state, "design");
      const added = o.comments.filter(row => row.authorAgentId === o.leadId && row.createdByRunId && o.runs.some(run => run.id === row.createdByRunId));
      c.add("one-attributed-note", added.length === 1 && /\bfollow\b/i.test(added[0]?.body ?? "")
        && [design.id, design.identifier].filter(Boolean).some(id => (added[0]?.body ?? "").includes(id!))
        && /\[[^\]]+\]\([^)]*\/issues\//.test(added[0]?.body ?? ""), "One CEO-authored note retains a usable reference to the actual approved design task.");
      c.add("records-preserved", !!before && sameTask(before, current) && sameTask(design, o.tasks.find(row => row.id === design.id)) && o.tasks.length === 2,
        "The note neither changes either task nor creates another task.");
      c.add("task-link", linkedTask(), "The original conversation links back to the task containing the note.");
      break;
    }
    case "goals.create-goal-tree": {
      const companyGoals = o.goals.filter(row => row.level === "company" && /(?:1[,.]?000|thousand)\s+signups?/i.test(`${row.title} ${row.description ?? ""}`));
      const teamGoals = o.goals.filter(row => row.level === "team" && /\b(?:launch|launching)\b.*\bwebsite\b|\bwebsite\b.*\blaunch\b/i.test(`${row.title} ${row.description ?? ""}`));
      c.add("one-requested-tree", o.goals.length === 2 && companyGoals.length === 1 && teamGoals.length === 1
        && teamGoals[0]?.parentId === companyGoals[0]?.id && companyGoals[0]?.parentId == null
        && o.goals.every(row => row.companyId === o.companyId), "The two saved goals have exact levels, a valid parent and company scope.");
      c.add("attributed-goal-creation", o.goals.length === 2 && o.goals.every(row => authored("goal.created", row.id)), "Both requested goals were created by the CEO through the production path.");
      c.add("ownership-or-question", o.goals.every(row => row.ownerAgentId === o.leadId) || /\b(?:who|which)\b[^\n]*\b(?:own|owner|responsib)/i.test(o.reply), "Goal ownership is valid or its consequential missing input is explicit.");
      c.add("hierarchy-link", o.goals.length === 2 && o.goals.every(row => hasLink(o, "goals", row)), "The reply links both saved levels for inspection.");
      c.add("retry-reuses-first-tree", Array.isArray(o.state.firstIds) && o.state.firstIds.length === 2
        && o.goals.every(row => (o.state.firstIds as string[]).includes(row.id))
        && o.humanQueries.filter(query => query === o.state.retryQuery).length === 2, "An explicit unchanged request reuses the initial goal tree.");
      c.add("no-invented-progress", !/\b\d+\s*%\s*(?:complete|done|progress)|\balready\s+\d+\s+signups?/i.test(o.reply), "New goals do not claim fabricated progress metrics.");
      break;
    }
    case "goals.align-existing-work": {
      const growth = entity(o.state, "growth");
      c.add("saved-associations", !!current && current.goalId === growth.id && !!projectNow
        && (projectNow.goalId === growth.id || projectNow.goalIds?.includes(growth.id) === true), "The intended Launch and website task both reference the saved growth goal.");
      c.add("context-only", !!before && sameTask(before, current, ["goalId"]) && o.tasks.length === 1 && o.goals.length === 1,
        "Alignment does not alter priority, ownership, execution state or duplicate records.");
      c.add("attributed-alignment", !!current && authored("issue.updated", current.id) && !!projectNow && authored("project.updated", projectNow.id), "Both association writes are independently attributed.");
      c.add("linked-work-and-goal", linkedTask() && !!projectNow && hasLink(o, "projects", projectNow) && hasLink(o, "goals", growth), "Chat gives inspectable task, project and strategic goal references.");
      break;
    }
    case "goals.explain-purpose": {
      const growth = entity(o.state, "growth"); const team = entity(o.state, "team");
      c.add("actual-chain", current?.goalId === team.id && team.parentId === growth.id && !!projectNow
        && (projectNow.goalId === team.id || projectNow.goalIds?.includes(team.id) === true), "The observed task/project/team/company references form the fixture's real purpose chain.");
      c.add("grounded-rationale", o.reply.includes(String(o.state.rationale)) && /\bwebsite\b/i.test(o.reply)
        && [growth, team].every(row => hasLink(o, "goals", row)) && linkedTask(), "The explanation uses the unusual saved business rationale and links the actual hierarchy.");
      c.add("read-only-explanation", !!before && sameTask(before, current) && !o.activity.some(row => row.entityId !== o.state.sourceId && [before.id, growth.id, team.id, savedProject?.id].includes(row.entityId) && row.agentId === o.leadId && /(?:updated|created|deleted)$/.test(row.action ?? "")),
        "An explanation does not rewrite the work's strategic context.");
      break;
    }
    case "documents-artifacts.write-plan": {
      const plans = o.documents.filter(row => row.key === "plan"); const plan = plans[0];
      c.add("saved-implementation-plan", plans.length === 1 && !!plan && !!plan.latestRevisionId && /\b(?:implement|build|develop)\b/i.test(plan.body ?? "")
        && /\b(?:test|verify|validation)\b/i.test(plan.body ?? "") && (plan.body ?? "").includes(String(o.state.requirement)), "A durable plan reflects the website's actual prerequisite brief and verification, rather than merely chat prose.");
      c.add("versioned-author", !!plan && o.revisions.some(row => row.id === plan.latestRevisionId && row.body === plan.body && row.createdByAgentId === o.leadId
        && o.runs.some(run => run.id === row.createdByRunId)), "The current document revision is attributed to this real agent run.");
      c.add("plan-audit", !!before && authored("issue.document_created", before.id), "The API audit records the CEO creating the plan after the request.");
      c.add("task-context-and-link", !!before && sameTask(before, current) && linkedTask(), "Saving a plan preserves the task and makes the saved plan reachable through its task.");
      break;
    }
    case "documents-artifacts.restore-document": {
      const plan = o.documents.find(row => row.key === "plan"); const revisions = o.state.originalRevisions as Entity[];
      const previous = revisions?.[1];
      c.add("restored-exact-previous-bytes", !!previous && !!plan && plan.body === previous.body && plan.latestRevisionId !== previous.id
        && plan.latestRevisionId !== revisions[2]?.id, "Restoration creates a new current revision with the exact second revision's contents.");
      c.add("retained-history", Array.isArray(revisions) && revisions.length === 3 && o.revisions.length === 4
        && revisions.every(original => o.revisions.some(row => row.id === original.id && row.body === original.body)), "All three historical revisions remain unmodified alongside the restoration.");
      c.add("restore-path-attribution", !!before && o.activity.some(row => row.action === "issue.document_restored" && row.entityId === before.id
        && row.agentId === o.leadId && row.details?.restoredFromRevisionId === previous?.id), "An independently observed restore audit identifies the exact source revision.");
      c.add("no-execution-rewind", !!before && sameTask(before, current) && linkedTask() && /\b(?:revision|version)\b/i.test(o.reply), "Chat identifies a document revision and leaves task execution unchanged.");
      break;
    }
    case "activity.audit-change": {
      const priorityEvents = (o.state.priorityEvents as Entity[] | undefined) ?? [];
      c.add("real-two-change-history", priorityEvents.length === 2 && priorityEvents.every(event => o.activity.some(row => row.id === event.id)), "Both fixture priority changes remain visible on the exact task.");
      c.add("attribution-and-values", priorityEvents.length === 2 && priorityEvents.every(event => !!event.actorId && (o.reply.includes(event.actorId) || event.actorType === "user" && /\b(?:board|human|operator)\b/i.test(o.reply))
        && o.reply.toLowerCase().includes(String(event.details?.priority).toLowerCase())) && /\b(?:today|yesterday|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2})\b/.test(o.reply),
        "The answer identifies the recorded editors, priority changes and event times rather than guessing the assignee.");
      c.add("read-only-history", !!before && sameTask(before, current) && linkedTask() && !o.activity.some(row => row.entityId === before.id && row.agentId === o.leadId), "Reading task audit does not mutate the task or manufacture audit records.");
      break;
    }
    default: c.add("implemented-scenario", false, "No independent oracle is implemented for this scenario.");
  }
  return c.result();
}

const ownedSources = ["chat-catalog-domains/internal.ts", "chat-catalog-domains/internal-support.ts"] as const;
function define(scenarioId: string, setup: ChatCatalogCase["setup"]): ChatCatalogCase {
  const coverageGaps = scenarioId === "goals.align-existing-work" ? ["cross-company-goal-rejection"]
    : scenarioId === "goals.explain-purpose" ? ["missing-association", "inaccessible-goal-nondisclosure"]
    : scenarioId === "documents-artifacts.restore-document" ? ["concurrent-edit-conflict"]
    : scenarioId === "tasks.edit-properties" ? ["execution-ownership-denied"] : [];
  return { scenarioId, setup, coverageGaps, sourceFiles: [...ownedSources, `chat-scenarios/${scenarioId.split(".")[0]}.yaml`],
    oracleVersion: "paperclip.chat-catalog.internal.v1", expectedRunCount: 1, verifyResult: verifyInternalResult, turnTimeoutMs: 120_000, attemptTimeoutMs: 300_000, observe: observeInternal, grade: gradeInternal };
}

export const internalChatCatalogCases: readonly ChatCatalogCase[] = [
  retryDefinition("projects.create-project"),
  define("projects.archive-project", async ctx => {
    const p = await project(ctx, "Launch", { status: "completed" });
    const t = await task(ctx, "Website task", p.id, { status: "done" });
    const body = `# Delivered website\nHistorical receipt ${ctx.input.nonce}.`;
    await putDocument(ctx, t.id, body);
    const activity = await ctx.input.api.get<Entity[]>(`/api/issues/${t.id}/activity`);
    return { project: p, task: t, originalBody: body, originalActivityId: activity.find(row => row.action === "issue.created")?.id };
  }),
  define("tasks.edit-properties", async ctx => {
    const p = await project(ctx); const worker = await fixtureWorker(ctx);
    const t = await task(ctx, "Landing page", p.id, { description: "Build the Launch landing page; this work is saved for later." });
    return { project: p, worker, task: t };
  }),
  define("tasks.comment-with-reference", async ctx => {
    const p = await project(ctx); const design = await task(ctx, "Approved design", p.id, { status: "done", description: "Approved design: semantic HTML, clear contrast, one primary signup action." });
    const t = await task(ctx, "Landing page", p.id, { description: "Build the launch website." });
    return { project: p, design, task: t };
  }),
  retryDefinition("goals.create-goal-tree"),
  define("goals.align-existing-work", async ctx => {
    const growth = await goal(ctx, "Growth: reach 1,000 signups");
    const p = await project(ctx); const t = await task(ctx, "Website task", p.id);
    return { growth, project: p, task: t };
  }),
  define("goals.explain-purpose", async ctx => {
    const rationale = `quiet research teams ${ctx.input.nonce}`;
    const growth = await goal(ctx, "Growth: reach 1,000 signups", { description: `We need a thousand signups to support ${rationale}.` });
    const team = await goal(ctx, "Launch the website", { level: "team", parentId: growth.id });
    const p = await project(ctx, "Launch", { goalIds: [team.id] });
    const t = await task(ctx, "Website task", p.id, { goalId: team.id });
    return { growth, team, project: p, task: t, rationale };
  }),
  define("documents-artifacts.write-plan", async ctx => {
    const p = await project(ctx); const requirement = `Orchid ${ctx.input.nonce}`;
    const t = await task(ctx, "Website task", p.id, { assigneeAgentId: ctx.input.fixtures.agent.id,
      description: `Build a single-page website for ${requirement}, with accessible signup and responsive layout. Verify keyboard navigation and mobile presentation.` });
    return { project: p, task: t, requirement };
  }),
  define("documents-artifacts.restore-document", async ctx => {
    const p = await project(ctx); const t = await task(ctx, "Website task", p.id, { description: "The website task's plan has three saved revisions. The previous version before the last edit is the desired content." });
    const revisions: Entity[] = [];
    for (const body of [`# Plan\nBuild a responsive website for ${ctx.input.nonce}.`, `# Plan\nBuild accessible signup for ${ctx.input.nonce}.\nVerify keyboard operation.`, `# Plan\nReplace signup with an unrelated pricing experiment for ${ctx.input.nonce}.`]) {
      const saved = await putDocument(ctx, t.id, body, revisions.at(-1)?.id ?? null);
      revisions.push({ id: saved.latestRevisionId!, body });
    }
    return { project: p, task: t, originalRevisions: revisions };
  }),
  define("activity.audit-change", async ctx => {
    const p = await project(ctx); let t = await task(ctx, "Website task", p.id);
    await ctx.input.api.patch(`/api/issues/${t.id}`, { priority: "high" });
    t = await ctx.input.api.patch(`/api/issues/${t.id}`, { priority: "low" });
    const activity = await ctx.input.api.get<Entity[]>(`/api/issues/${t.id}/activity`);
    return { project: p, task: t, priorityEvents: activity.filter(row => row.action === "issue.updated" && row.details?.priority) };
  }),
];

import type { Entity } from "./internal-support.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { codexSubscriptionAgentConfig } from "../codex-subscription-fixture.js";
import { pollUntil } from "../api.js";
async function fixtureWorker(ctx: ChatCatalogContext) {
  const { execution, fixtures, workspacePath, nonce, api } = ctx.input;
  const base = execution.profile.buildAgent({ environmentId: fixtures.environment.id, environmentFixtureId: execution.environment.id,
    workspacePath, secretRefs: fixtures.secretRefs, executionId: nonce });
  const payload = { ...base, name: "Morgan", role: "engineer", title: "Frontend engineer", reportsTo: fixtures.agent.id,
    capabilities: "Builds accessible websites.", runtimeConfig: { ...(base.runtimeConfig as Record<string, unknown>), heartbeat: { enabled: false, maxConcurrentRuns: 1 } } };
  const worker = await api.post<Entity>(`/api/companies/${fixtures.company.id}/agents`, execution.profile.credential === "CODEX_AUTH_JSON"
    ? codexSubscriptionAgentConfig(payload, process.env, fixtures.company.id) : payload);
  await pollUntil({ label: "Morgan runtime readiness", deadlineAt: Date.now() + 45_000,
    load: () => api.get<{ lifecycleState: string; lifecycleError?: string }>(`/api/agents/${worker.id}`),
    accept: row => row.lifecycleState === "ready", reject: row => row.lifecycleError ? "Morgan runtime setup failed" : undefined });
  return worker;
}

function retryDefinition(scenarioId: string): ChatCatalogCase {
  const definition = define(scenarioId, async ctx => ({ retryQuery: ctx.scenario.query }));
  return { ...definition, expectedRunCount: 2, expectedHumanMessageCount: 2, attemptTimeoutMs: 420_000,
    async act(ctx, state) {
      const first = await pollUntil({ label: "Initial creation before explicit user retry", deadlineAt: Date.now() + 150_000,
        load: () => observeInternal(ctx, state),
        accept: o => {
          const rows = scenarioId === "projects.create-project" ? o.projects.filter(row => row.name === "Launch") : o.goals;
          return rows.length === (scenarioId === "projects.create-project" ? 1 : 2) && ctx.issue()?.conversationState === "waiting"
            && o.runs.length === 1 && o.runs.every(row => row.status === "succeeded");
        },
      });
      state.firstIds = (scenarioId === "projects.create-project" ? first.projects.filter(row => row.name === "Launch") : first.goals).map(row => row.id);
      await ctx.input.evidence("chat-catalog-before-explicit-retry.json", { firstIds: state.firstIds, observation: first });
      const { sendChatMessage } = await import("../chat-flow.js");
      await sendChatMessage(ctx.input.page, ctx.scenario.query);
    },
  };
}
