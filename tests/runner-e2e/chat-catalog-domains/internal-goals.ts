import type { ChatCatalogCase } from "../chat-catalog-contract.js";
import { project, task, goal, putDocument, entity, observation, checks, hasLink, sameTask, type Entity, type InternalObservation } from "./internal-support.js";
import { makeDefinition, retryDefinition, fixtureWorker } from "./internal-definition.js";

export function grade_goals(value: unknown) {
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
    case "goals.create-goal-tree": {
      const companyGoals = o.goals.filter(row => row.level === "company" && /(?:1[,.]?000|1\s?k|thousand)\s+(?:(?:new|user|total|product)\s+){0,2}sign[- ]?ups?/i.test(`${row.title} ${row.description ?? ""}`));
      const teamGoals = o.goals.filter(row => row.level === "team" && /\b(?:launch|launching)\b.*\bwebsite\b|\bwebsite\b.*\blaunch\b/i.test(`${row.title} ${row.description ?? ""}`));
      c.add("one-requested-tree", o.goals.length === 2 && companyGoals.length === 1 && teamGoals.length === 1
        && teamGoals[0]?.parentId === companyGoals[0]?.id && companyGoals[0]?.parentId == null
        && o.goals.every(row => row.companyId === o.companyId), "The two saved goals have exact levels, a valid parent and company scope.");
      c.add("attributed-goal-creation", o.goals.length === 2 && o.goals.every(row => authored("goal.created", row.id)), "Both requested goals were created by the CEO through the production path.");
      c.add("ownership-or-question", o.goals.every(row => row.ownerAgentId === o.leadId) || /\b(?:who|which)\b[^\n]*\b(?:own|owner|responsib)/i.test(o.reply), "Goal ownership is valid or its consequential missing input is explicit.");
      c.add("hierarchy-link", o.goals.length === 2 && hasHierarchyLink(o), "The reply links the saved hierarchy; its real tree exposes both levels.");
      c.add("retry-reuses-first-tree", initialGoalTreeCreation(observation(o.state.firstCreation)) && Array.isArray(o.state.firstIds) && o.state.firstIds.length === 2
        && o.goals.every(row => (o.state.firstIds as string[]).includes(row.id))
        && o.humanQueries.filter(query => query === o.state.retryQuery).length === 2, "An explicit unchanged request reuses the initial goal tree.");
      c.add("no-invented-progress", !/\b\d+\s*%\s*(?:complete|done|progress)|\balready\s+\d+\s+signups?/i.test(o.reply), "New goals do not claim fabricated progress metrics.");
      break;
    }
    case "goals.align-existing-work": {
      const growth = entity(o.state, "growth");
      c.add("saved-associations", !!current && current.goalId === growth.id && !!projectNow
        && (projectNow.goalId === growth.id || projectNow.goalIds?.includes(growth.id) === true), "The intended Launch and website task both reference the saved growth goal.");
      c.add("cross-company-request-denied", !!o.state.authorizedAlignment
        && typeof o.state.foreignRequest === "string" && o.humanQueries.includes(o.state.foreignRequest)
        && /\b(?:cannot|can't|unable|not authorized|not accessible|different company|another company|cross-company|switch compan)\b/i.test(o.reply)
        && !o.reply.includes(String(o.state.protectedText))
        && !o.tasks.some(row => row.goalId === entity(o.state, "foreignGoal").id)
        && !o.projects.some(row => row.goalId === entity(o.state, "foreignGoal").id || row.goalIds?.includes(entity(o.state, "foreignGoal").id)),
        "The explicit foreign-goal request is denied with no foreign contents or cross-company association.");
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
      const missing = entity(o.state, "missingTask");
      c.add("missing-association-is-explicit", !!o.tasks.find(row => row.id === missing.id && row.goalId == null)
        && typeof o.state.missingReply === "string"
        && /(?:no|missing|not|unlinked|hasn't|doesn't|without)[^.!?]*?(?:goal|strateg|purpose|associat)|cannot[^.!?]*?determine/i.test(o.state.missingReply)
        && !(o.state.missingReply as string).includes(String(o.state.rationale)),
        "The unaligned-task phase describes the actual missing relationship instead of importing the first task's rationale.");
      c.add("inaccessible-rationale-not-leaked", typeof o.state.foreignRequest === "string" && o.humanQueries.includes(o.state.foreignRequest)
        && /\b(?:cannot|can't|unable|not authorized|not accessible|different company|another company|cross-company)\b/i.test(o.reply)
        && !o.reply.includes(String(o.state.protectedText)) && !o.links.some(link => link.includes(entity(o.state, "foreignTask").id)),
        "A separate inaccessible task/goal produces a scoped limitation without the foreign rationale or resource links.");
      c.add("read-only-explanation", !!before && sameTask(before, current) && !o.activity.some(row => row.entityId !== o.state.sourceId && [before.id, growth.id, team.id, savedProject?.id].includes(row.entityId) && row.agentId === o.leadId && /(?:updated|created|deleted)$/.test(row.action ?? "")),
        "An explanation does not rewrite the work's strategic context.");
      break;
    }
    default: c.add("implemented-scenario", false, "No independent oracle is implemented for this scenario.");
  }
  return c.result();
}

const define = (id: string, setup: ChatCatalogCase["setup"]) => makeDefinition(id, setup, grade_goals);
export const goalsCases: readonly ChatCatalogCase[] = [
  createGoalTree(),
  crossCompanyAlignment(),
  purposeVariants(),

];

/** The requested cross-company condition is a real second human request, with no imported foreign content. */
function crossCompanyAlignment(): ChatCatalogCase {
  const base = define("goals.align-existing-work", async ctx => {
    const growth = await goal(ctx, "Growth: reach 1,000 signups");
    const p = await project(ctx); const t = await task(ctx, "Website task", p.id);
    const foreignCompany = await ctx.input.api.post<Entity>("/api/companies", { name: `Other company ${ctx.input.nonce}` });
    const protectedText = `Protected foreign strategy ${ctx.input.nonce}`;
    const foreignGoal = await ctx.input.api.post<Entity>(`/api/companies/${foreignCompany.id}/goals`, {
      title: "Other company growth", description: protectedText, level: "company",
    });
    return { growth, project: p, task: t, foreignCompany, foreignGoal, protectedText,
      foreignRequest: `Use the growth goal ${foreignGoal.id} from our other company instead.` };
  });
  return { ...base, coverageGaps: [], expectedRunCount: 2, expectedHumanMessageCount: 2, attemptTimeoutMs: 420_000,
    async act(ctx, state) {
      const first = await pollUntil({ label: "Initial authorized goal alignment", deadlineAt: Date.now() + 150_000,
        load: () => observeInternal(ctx, state),
        accept: o => {
          const g = entity(state, "growth"); const p = o.projects.find(row => row.id === entity(state, "project").id);
          return o.tasks.find(row => row.id === entity(state, "task").id)?.goalId === g.id
            && (p?.goalId === g.id || p?.goalIds?.includes(g.id) === true)
            && o.runs.length === 1 && o.runs.every(row => row.status === "succeeded") && ctx.issue()?.conversationState === "waiting";
        },
      });
      state.authorizedAlignment = { taskGoalId: first.tasks.find(row => row.id === entity(state, "task").id)?.goalId,
        projectGoalIds: first.projects.find(row => row.id === entity(state, "project").id)?.goalIds };
      await ctx.input.evidence("chat-catalog-before-cross-company-request.json", { authorizedAlignment: state.authorizedAlignment });
      const { sendChatMessage } = await import("../chat-flow.js");
      await sendChatMessage(ctx.input.page, String(state.foreignRequest));
    },
    async cleanup(ctx, state) { await ctx.input.api.delete(`/api/companies/${entity(state, "foreignCompany").id}`, { allowNotFound: true }); },
  };
}

import { observeInternal } from "./internal-support.js";
import { pollUntil } from "../api.js";

function purposeVariants(): ChatCatalogCase {
  const base = define("goals.explain-purpose", async ctx => {
    const rationale = `quiet research teams ${ctx.input.nonce}`;
    const growth = await goal(ctx, "Growth: reach 1,000 signups", { description: `We need a thousand signups to support ${rationale}.` });
    const team = await goal(ctx, "Launch the website", { level: "team", parentId: growth.id });
    const p = await project(ctx, "Launch", { goalIds: [team.id] });
    const t = await task(ctx, "Website task", p.id, { goalId: team.id });
    const missingProject = await project(ctx, "Exploration");
    const missingTask = await task(ctx, "Unaligned website work", missingProject.id);
    const foreignCompany = await ctx.input.api.post<Entity>("/api/companies", { name: `Inaccessible company ${ctx.input.nonce}` });
    const protectedText = `Protected purpose ${ctx.input.nonce}`;
    const foreignGoal = await ctx.input.api.post<Entity>(`/api/companies/${foreignCompany.id}/goals`, {
      title: "Private strategic rationale", description: protectedText, level: "company",
    });
    const foreignTask = await ctx.input.api.post<Entity>(`/api/companies/${foreignCompany.id}/issues`, {
      title: "Inaccessible website work", goalId: foreignGoal.id, status: "backlog",
    });
    return { growth, team, project: p, task: t, rationale, missingTask, missingProject, foreignTask, foreignCompany, protectedText,
      missingRequest: `Why are we doing Unaligned website work (${missingTask.identifier ?? missingTask.id})?`,
      foreignRequest: `Why are we doing the website task ${foreignTask.identifier ?? foreignTask.id} in our other company?` };
  });
  return { ...base, coverageGaps: [], expectedRunCount: 3, expectedHumanMessageCount: 3, attemptTimeoutMs: 600_000,
    async act(ctx, state) {
      const first = await waitForPurposePhase(ctx, state, 1);
      state.initialPurpose = { reply: first.reply, taskGoalId: first.tasks.find(row => row.id === entity(state, "task").id)?.goalId };
      const previous = await sourceReplies(ctx);
      const { sendChatMessage } = await import("../chat-flow.js");
      await sendChatMessage(ctx.input.page, String(state.missingRequest));
      await waitForPurposePhase(ctx, state, 2);
      const missing = (await sourceReplies(ctx)).filter(row => !previous.some(before => before.id === row.id));
      state.missingReply = missing.map(row => row.body ?? "").join("\n");
      await ctx.input.evidence("chat-catalog-purpose-conditional-phases.json", { initialPurpose: state.initialPurpose, missingReplies: missing });
      await sendChatMessage(ctx.input.page, String(state.foreignRequest));
    },
    async cleanup(ctx, state) { await ctx.input.api.delete(`/api/companies/${entity(state, "foreignCompany").id}`, { allowNotFound: true }); },
  };
}
async function waitForPurposePhase(ctx: ChatCatalogContext, state: Record<string, unknown>, count: number) {
  return pollUntil({ label: `Purpose explanation phase ${count}`, deadlineAt: Date.now() + 150_000,
    load: () => observeInternal(ctx, state), accept: o => o.runs.length === count && o.runs.every(row => row.status === "succeeded")
      && ctx.issue()?.conversationState === "waiting" });
}
async function sourceReplies(ctx: ChatCatalogContext) {
  const source = ctx.issue(); if (!source) throw new Error("Purpose phase lost its source conversation");
  const comments = await ctx.input.api.get<Entity[]>(`/api/issues/${source.id}/comments?order=asc`);
  const runs = await ctx.allRuns();
  return comments.filter(row => row.authorAgentId === ctx.input.fixtures.agent.id && runs.some(run => run.id === row.createdByRunId));
}
import type { ChatCatalogContext } from "../chat-catalog-contract.js";

function initialGoalTreeCreation(o: InternalObservation | undefined): boolean {
  if (!o || o.goals.length !== 2 || o.goals.some(row => row.companyId !== o.companyId) || !hasHierarchyLink(o)) return false;
  const root = o.goals.find(row => row.level === "company" && /(?:1[,.]?000|1\s?k|thousand)\s+(?:(?:new|user|total|product)\s+){0,2}sign[- ]?ups?/i.test(`${row.title} ${row.description ?? ""}`));
  const team = o.goals.find(row => row.level === "team" && /\b(?:launch|launching)\b.*\bwebsite\b|\bwebsite\b.*\blaunch\b/i.test(`${row.title} ${row.description ?? ""}`));
  return !!root && !!team && root.parentId == null && team.parentId === root.id
    && o.goals.every(goal => o.activity.some(row => row.action === "goal.created" && row.entityId === goal.id && row.agentId === o.leadId))
    && (o.goals.every(row => row.ownerAgentId === o.leadId) || /\b(?:who|which)\b[^\n]*\b(?:own|owner|responsib)/i.test(o.reply))
    && !/\b\d+\s*%\s*(?:complete|done|progress)|\balready\s+\d+\s+signups?/i.test(o.reply);
}

function hasHierarchyLink(o: InternalObservation): boolean {
  const root = o.goals.find(row => row.level === "company");
  return !!root && (hasLink(o, "goals", root) || o.links.some(href => {
    try { const url = new URL(href, o.origin); return url.origin === new URL(o.origin).origin && /\/goals\/?$/.test(url.pathname); }
    catch { return false; }
  }));
}
function createGoalTree(): ChatCatalogCase {
  const base = retryDefinition("goals.create-goal-tree", grade_goals, initialGoalTreeCreation);
  return { ...base, async setup(ctx) {
    await ctx.input.api.patch(`/api/companies/${ctx.input.fixtures.company.id}`, { description: "Our mission is to grow product adoption and help new teams sign up." });
    return base.setup(ctx);
  }, async verifyResult(ctx, _state, value) {
    const o = observation(value); if (!o || !hasHierarchyLink(o)) throw new Error("No saved goal hierarchy result is accessible");
    const root = o.goals.find(row => row.level === "company")!; const child = o.goals.find(row => row.parentId === root.id)!;
    const sourceUrl = ctx.input.page.url();
    const href = o.links.find(link => {
      try { const url = new URL(link, o.origin); return url.origin === new URL(o.origin).origin
        && (hasLink({ ...o, links: [link] }, "goals", root) || /\/goals\/?$/.test(url.pathname)); } catch { return false; }
    })!;
    await ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(href)}]`).first().click();
    if (/\/goals\/?$/.test(new URL(href, o.origin).pathname)) {
      const rootLink = ctx.input.page.locator(`a[href*=${JSON.stringify(`/goals/${root.id}`)}]`).first();
      await expect(rootLink).toBeVisible(); await rootLink.click();
    }
    await expect(ctx.input.page.getByRole("heading", { name: root.title!, exact: true }).first()).toBeVisible();
    const childLink = ctx.input.page.locator(`a[href*=${JSON.stringify(`/goals/${child.id}`)}]`).first();
    await expect(childLink).toBeVisible(); await childLink.click();
    await expect(ctx.input.page.getByRole("heading", { name: child.title!, exact: true }).first()).toBeVisible();
    await ctx.input.evidence("chat-catalog-goal-hierarchy-opened.json", { rootId: root.id, childId: child.id, childUrl: ctx.input.page.url() });
    await ctx.input.page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
    await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible();
  } };
}
import { expect } from "@playwright/test";
