import type { ChatCatalogCase } from "../chat-catalog-contract.js";
import { project, task, goal, putDocument, entity, observation, checks, hasLink, sameTask, type Entity } from "./internal-support.js";
import { makeDefinition, retryDefinition, fixtureWorker } from "./internal-definition.js";

export function grade_activity(value: unknown) {
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
    case "activity.company-overview": {
      const blocked = entity(o.state, "blockedTask"); const done = entity(o.state, "doneTask"); const worker = entity(o.state, "worker");
      const expected = [before, blocked, done].filter((row): row is Entity => !!row);
      c.add("actual-work-summary", expected.length === 3 && expected.every(row => sameTask(row, o.tasks.find(now => now.id === row.id)) && hasLink(o, "issues", row))
        && /\b(?:active|in.progress|underway)\b/i.test(o.reply) && /\bblocked\b/i.test(o.reply) && /\b(?:completed|done|finished)\b/i.test(o.reply),
        "The overview links the actual active, blocked and completed work without changing its state.");
      c.add("grounded-blocker", o.reply.includes(String(o.state.blocker)), "The summary describes the fixture's actual recorded blocker.");
      c.add("idle-is-not-broken", o.agents?.some(row => row.id === worker.id && row.status === "idle") === true
        && /\bMorgan\b[^.\n]*\b(?:idle|available|not currently working)\b/i.test(o.reply)
        && !/\bMorgan\b\s+(?:is|looks|appears)\s+(?:broken|failed|stuck)/i.test(o.reply),
        "The actual idle engineer is described as available, without claiming a runtime failure.");
      const asserted = [...o.reply.matchAll(/\b(\d+)\s+(active|blocked|completed|done)\s+(?:tasks?|items?)\b/gi)];
      c.add("scoped-counts", asserted.every(match => Number(match[1]) === 1) && !o.reply.includes(String(o.state.hiddenMarker)),
        "Any explicit state counts match the three visible tasks, and hidden-company work is absent.");
      c.add("observation-context", /\b(?:as of|right now|currently|at present)\b/i.test(o.reply), "The overview identifies its current observation context.");
      break;
    }
    case "activity.audit-change": {
      const priorityEvents = (o.state.priorityEvents as Entity[] | undefined) ?? [];
      c.add("real-two-change-history", priorityEvents.length === 2 && priorityEvents.every(event => o.activity.some(row => row.id === event.id)), "Both fixture priority changes remain visible on the exact task.");
      c.add("attribution-and-values", priorityEvents.length === 2 && priorityEvents.every(event => !!event.actorId
        && mentionsRecordedActor(o.reply, event.actorId)
        && o.reply.split(/[;\n]|\.(?:\s|$)/).some(part => new RegExp(`\\b${String(event.details?.priority)}\\b`, "i").test(part) && mentionsRecordedActor(part, event.actorId!))
        && o.reply.toLowerCase().includes(String(event.details?.priority).toLowerCase())),
        "Editor identity is the recorded actor ID or the canonical Local board label, never a generic operator inference.");
      c.add("recorded-event-times", priorityEvents.length === 2 && priorityEvents.every(event => mentionsRecordedTime(o.reply, event.createdAt,
        String(o.state.observedAt ?? ""), String(o.state.timezone ?? "UTC"), priorityEvents.map(row => row.createdAt))),
        "Reported calendar and clock times match the actual retained events in UTC or the browser's declared timezone.");
      c.add("read-only-history", !!before && sameTask(before, current) && linkedTask() && !o.activity.some(row => row.entityId === before.id && row.agentId === o.leadId), "Reading task audit does not mutate the task or manufacture audit records.");
      break;
    }
    default: c.add("implemented-scenario", false, "No independent oracle is implemented for this scenario.");
  }
  return c.result();
}

const define = (id: string, setup: ChatCatalogCase["setup"]) => makeDefinition(id, setup, grade_activity);
export const activityCases: readonly ChatCatalogCase[] = [
  companyOverview(),
  define("activity.audit-change", async ctx => {
    const p = await project(ctx); let t = await task(ctx, "Website task", p.id);
    await ctx.input.api.patch(`/api/issues/${t.id}`, { priority: "high" });
    t = await ctx.input.api.patch(`/api/issues/${t.id}`, { priority: "low" });
    const activity = await ctx.input.api.get<Entity[]>(`/api/issues/${t.id}/activity`);
    return { project: p, task: t, observedAt: new Date().toISOString(), timezone: await ctx.input.page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), priorityEvents: activity.filter(row => row.action === "issue.updated" && row.details?.priority) };
  }),
];

export function mentionsRecordedTime(reply: string, recordedAt: string | undefined, observedAt: string, timezone: string, allRecordedAt: Array<string | undefined> = []): boolean {
  const date = new Date(recordedAt ?? ""); const observed = new Date(observedAt);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(observed.getTime())) return false;
  const zones = [...new Set(["UTC", timezone])];
  try {
    const dates = zones.map(timeZone => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date));
    const times = zones.map(timeZone => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date));
    const explicitDates = [...reply.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(match => match[0]);
    const explicitTimes = [...reply.matchAll(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\b/gi)].map(match => {
      let hour = Number(match[1]); if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
      return `${String(hour).padStart(2, "0")}:${match[2]}`;
    });
    const allDates = allRecordedAt.length ? allRecordedAt.flatMap(value => zones.map(timeZone => new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(value ?? "")))) : dates;
    const allTimes = allRecordedAt.length ? allRecordedAt.flatMap(value => zones.map(timeZone => new Intl.DateTimeFormat("en-GB", {
      timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(value ?? "")))) : times;
    if (explicitTimes.length && (!explicitTimes.some(time => times.includes(time)) || explicitTimes.some(time => !allTimes.includes(time)))) return false;
    const namedDates = [...reply.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi)]
      .map(match => `${match[1]!.toLowerCase()} ${Number(match[2])}`);
    const named = (value: string | undefined) => zones.map(timeZone => new Intl.DateTimeFormat("en-US", { timeZone, month: "long", day: "numeric" }).format(new Date(value ?? "")).toLowerCase());
    if (namedDates.length && (!namedDates.some(day => named(recordedAt).includes(day))
      || namedDates.some(day => !(allRecordedAt.length ? allRecordedAt.flatMap(named) : named(recordedAt)).includes(day)))) return false;
    if (explicitDates.length) return explicitDates.some(day => dates.includes(day)) && explicitDates.every(day => allDates.includes(day));
    if (/\btoday\b/i.test(reply)) return zones.some((timeZone, index) => dates[index] === new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(observed));
    if (explicitTimes.length) return true;
    return zones.some(timeZone => {
      const month = new Intl.DateTimeFormat("en-US", { timeZone, month: "long" }).format(date);
      const day = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(date);
      return new RegExp(`\\b${month}\\s+${day}\\b`, "i").test(reply);
    });
  } catch { return false; }
}

function companyOverview(): ChatCatalogCase {
  const base = define("activity.company-overview", async ctx => {
    const p = await project(ctx); const worker = await fixtureWorker(ctx);
    const active = await task(ctx, "Website draft", p.id, { status: "in_progress" });
    const blocker = `approved launch colors ${ctx.input.nonce}`;
    const blockedTask = await task(ctx, "Accessibility review", p.id, { status: "blocked", description: `Waiting for ${blocker}.` });
    const doneTask = await task(ctx, "Launch brief delivered", p.id, { status: "done" });
    const hiddenCompany = await ctx.input.api.post<Entity>("/api/companies", { name: `Hidden company ${ctx.input.nonce}` });
    const hiddenMarker = `Hidden acquisition ${ctx.input.nonce}`;
    await ctx.input.api.post(`/api/companies/${hiddenCompany.id}/issues`, { title: hiddenMarker, status: "blocked" });
    return { project: p, task: active, blockedTask, doneTask, worker, blocker, hiddenCompany, hiddenMarker };
  });
  return { ...base, async observe(ctx, state) {
    const o = await observeInternal(ctx, state);
    return { ...o, agents: await ctx.input.api.get<Entity[]>(`/api/companies/${ctx.input.fixtures.company.id}/agents`) };
  }, async cleanup(ctx, state) { await ctx.input.api.delete(`/api/companies/${entity(state, "hiddenCompany").id}`, { allowNotFound: true }); } };
}
import { observeInternal } from "./internal-support.js";

function mentionsRecordedActor(reply: string, actorId: string): boolean {
  const identities = actorId === "local-board" ? [actorId, "Local board", "Board"] : [actorId];
  return identities.some(identity => {
    const name = identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${name}\\s+(?:changed|updated|set|made|raised|lowered|edited)\\b`, "i").test(reply)
      || new RegExp(`\\b(?:by|actor|editor)\\s*[:=]?\\s*(?:the\\s+)?${name}\\b`, "i").test(reply)
      || new RegExp(`\\|\\s*${name}\\s*\\|`, "i").test(reply)
      || new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*|\\*\\*)?${name}(?:\\*\\*)?\\s*:`, "i").test(reply);
  });
}
