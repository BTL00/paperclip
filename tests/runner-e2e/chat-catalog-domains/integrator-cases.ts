import type { cases } from "../../../packages/db/src/schema/cases.js";
import type { ChatCatalogCase, ChatCatalogContext } from "../chat-catalog-contract.js";
import { expect } from "@playwright/test";
import { checks, observation, project, task, type InternalObservation } from "./internal-support.js";
import { groundedStatement, integratorDefinition, inspectResult, resultHref, observeInternal } from "./integrator-support.js";
type CaseRecord = typeof cases.$inferSelect;
interface CasesObservation extends InternalObservation { cases: CaseRecord[]; casesEnabled: boolean; casesReadStatus: number }
const root = (ctx: ChatCatalogContext) => `/api/companies/${ctx.input.fixtures.company.id}`;
async function observeCases(ctx: ChatCatalogContext, state: Record<string, unknown>): Promise<CasesObservation> {
  const base = await observeInternal(ctx, state);
  const settings = await ctx.input.api.get<{ enableCases: boolean }>("/api/instance/settings/experimental");
  const response = await ctx.input.page.request.get(`${root(ctx)}/cases?limit=200`);
  return { ...base, casesEnabled: settings.enableCases, casesReadStatus: response.status(), cases: response.ok() ? await response.json() : [] };
}
function caseObservation(value: unknown): CasesObservation | undefined {
  const o = value as CasesObservation;
  return observation(value) && Array.isArray(o.cases) && typeof o.casesEnabled === "boolean" && typeof o.casesReadStatus === "number" ? o : undefined;
}
export function gradeIntegratorCases(value: unknown) {
  const c = checks(); const o = caseObservation(value);
  c.add("public-case-and-task-evidence", !!o, "Requires public case response/status, actual experiment state, task and audit evidence.");
  if (!o) return c.result();
  if (o.scenarioId === "cases.cases-disabled") {
    c.add("disabled-route-remains-disabled", !o.casesEnabled && o.casesReadStatus === 404, "Cases remains disabled and its normal route still returns the genuine feature gate.");
    c.add("no-silent-case-or-task-creation", !o.activity.some(event => event.agentId === o.leadId && /^(?:case\.|issue\.created)/.test(event.action ?? "")) && o.tasks.length === 0, "No case or task is created before the person makes the consequential choice.");
    c.add("truthful-availability-and-choice", groundedStatement(o.reply, /\bCases?\b/i, /\b(?:disabled|unavailable|not enabled|isn't enabled|not available|isn't available)\b/i,
      /\b(?:created|opened|enabled)\s+(?:a |the |your )?(?:customer |new )?case\b|\b(?:Cases is enabled|Cases are enabled)\b/i)
      && /\b(?:enable|settings|ordinary task|regular task|normal task)\b/i.test(o.reply)
      && /\b(?:would you|do you|want|choose|prefer|can (?:enable|create)|could (?:enable|create))\b/i.test(o.reply), "Chat explains the unavailable feature and offers the person a supported enablement/task choice without claiming it already happened.");
  } else if (o.scenarioId === "cases.browse-cases") {
    const expected = o.state.openCases as CaseRecord[] | undefined; const excluded = o.state.excludedCases as CaseRecord[] | undefined;
    c.add("original-filter-fixtures", Array.isArray(expected) && Array.isArray(excluded), "Original case identities/statuses/project scope are required.");
    if (!Array.isArray(expected) || !Array.isArray(excluded)) return c.result();
    c.add("real-project-and-case-status", o.casesEnabled && o.casesReadStatus === 200 && expected.length === 2
      && expected.every(before => o.cases.some(now => now.id === before.id && now.status === before.status && now.projectId === before.projectId))
      && o.tasks.some(row => row.id === (o.state.finishedTask as { id: string } | undefined)?.id && row.status === "done"), "Two actual open Launch cases remain open even when related task work is done.");
    c.add("exact-filtered-case-results", expected.every(row => !!caseHref(o, row)) && excluded.every(row => !caseHref(o, row)
      && !o.reply.includes(row.title) && !o.reply.includes(row.identifier)), "Rendered results include the real open Launch cases and exclude the closed case and other project's open case.");
    c.add("read-does-not-mutate-cases-or-columns", !o.activity.some(event => event.agentId === o.leadId && /^case\./.test(event.action ?? ""))
      && !/\b(?:changed|saved|updated|reordered)\b[^.!?\n]{0,45}\b(?:columns?|board layout)\b/i.test(o.reply), "Browsing does not mutate case records or claim browser-only presentation changes.");
  } else c.add("owned-case-oracle", false, "No independent oracle exists for this case scenario.");
  return c.result();
}
function caseHref(o: InternalObservation, row: Pick<CaseRecord, "id" | "identifier">) { return resultHref(o, row.id, "cases") ?? resultHref(o, row.identifier, "cases"); }
async function verifyCases(ctx: ChatCatalogContext, _state: Record<string, unknown>, value: unknown) {
  const o = caseObservation(value); if (!o) throw new Error("Missing case UI observation");
  if (!o.casesEnabled) { await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible(); return; }
  for (const row of o.state.openCases as CaseRecord[]) {
    const href = caseHref(o, row); if (!href) throw new Error("No actual open case link");
    const pathname = new URL(href, o.origin).pathname;
    await inspectResult(ctx, pathname, row.title, href);
  }
}
const previousExperiments = new WeakMap<ChatCatalogContext, boolean>();
function define(id: string, enabled: boolean, setup: ChatCatalogCase["setup"]): ChatCatalogCase {
  return integratorDefinition("cases", id, async ctx => {
    const previous = await ctx.input.api.get<{ enableCases: boolean }>("/api/instance/settings/experimental");
    previousExperiments.set(ctx, previous.enableCases);
    try { await ctx.input.api.patch("/api/instance/settings/experimental", { enableCases: enabled }); return await setup(ctx); }
    catch (error) { await ctx.input.api.patch("/api/instance/settings/experimental", { enableCases: previous.enableCases }); previousExperiments.delete(ctx); throw error; }
  }, observeCases, gradeIntegratorCases, verifyCases, { async cleanup(ctx) {
    const previous = previousExperiments.get(ctx); if (previous !== undefined) { await ctx.input.api.patch("/api/instance/settings/experimental", { enableCases: previous }); previousExperiments.delete(ctx); }
  } });
}
export const integratorCasesCases: readonly ChatCatalogCase[] = [
  define("cases.cases-disabled", false, async () => ({})),
  define("cases.browse-cases", true, async ctx => {
    const launch = await project(ctx, "Launch"); const other = await project(ctx, "Research");
    const create = (title: string, projectId: string, status: string) => ctx.input.api.post<CaseRecord>(`${root(ctx)}/cases`, { caseType: "customer", title, projectId, status });
    const open = await create("Mobile checkout failure", launch.id, "in_progress"); const second = await create("Keyboard focus loss", launch.id, "in_review");
    const closed = await create("Resolved image clipping", launch.id, "done"); const elsewhere = await create("Research signup failure", other.id, "in_progress");
    const finishedTask = await task(ctx, "Initial customer diagnosis", launch.id, { status: "done" });
    await ctx.input.api.post(`/api/cases/${open.id}/links`, { issueId: finishedTask.id, role: "work" });
    return { project: launch, openCases: [open, second], excludedCases: [closed, elsewhere], finishedTask };
  }),
];
