import { expect } from "@playwright/test";
import { checks, entity, hasLink, project, task, verifyInternalResult } from "./internal-support.js";
import { identityDefinition, identityObservation, waitForReply, probeAgentPermission } from "./identity-support.js";

export function gradeNavigation(value: unknown) {
  const c = checks(); const o = identityObservation(value);
  c.add("complete-navigation-evidence", !!o, "Persisted records and observed browser navigation are required.");
  if (!o) return c.result();
  const p = entity(o.state, "project"); const t = entity(o.state, "task");
  c.add("scope-retained", o.projects.some(row => row.id === p.id && row.companyId === o.companyId)
    && o.tasks.some(row => row.id === t.id && row.projectId === p.id && row.status === "backlog"), "Navigation retains the real company project and open task.");
  c.add("navigation-is-read-only", !o.activity.some(row => row.agentId === o.leadId && [p.id, t.id].includes(row.entityId ?? "")), "The agent does not rewrite records to make the requested view appear correct.");
  if (o.scenarioId === "navigation-preferences.find-project-view") {
    c.add("actual-project-link", hasLink(o, "projects", p), "The rendered reply links the exact Launch project.");
    c.add("open-task-view", o.state.openTaskVisible === true && o.state.closedTaskVisible === false,
      "Following the project link shows the actual open task and excludes the completed task after selecting the supported open filter.");
    c.add("personal-preferences-not-agent-mutated", o.state.agentPreferenceReadStatus === 403 && o.state.preferencesBefore !== undefined
      && JSON.stringify(o.state.preferencesBefore) === JSON.stringify(o.state.preferencesAfterReply), "The actual agent cannot impersonate the person's preferences, and the response does not change saved order or browser favorites/recents.");
  } else if (o.scenarioId === "navigation-preferences.quick-search") {
    c.add("documented-palette-entry", /(?:command|cmd|ctrl|control|⌘).*k|quick\s+search|command\s+palette/i.test(o.reply), "The answer identifies the actual quick-search entry point.");
    c.add("browser-search-transition", o.state.paletteTaskVisible === true && o.state.searchTaskVisible === true
      && o.state.searchQuery === "Launch", "The human opens the palette, finds the fixture task, and carries its query into full search.");
  } else c.add("known-navigation-case", false, "No oracle exists for this navigation request.");
  return c.result();
}
async function fixture(ctx: Parameters<typeof project>[0]) {
  const p = await project(ctx); const t = await task(ctx, "Launch open website", p.id);
  const closed = await task(ctx, "Launch completed website", p.id, { status: "done" });
  return { project: p, task: t, closed, preferencesBefore: await preferenceSnapshot(ctx) };
}
export const navigationIdentityCases = [
  identityDefinition("navigation-preferences.find-project-view", fixture, gradeNavigation, {
    async act(ctx, state) {
      await waitForReply(ctx); state.preferencesAfterReply = await preferenceSnapshot(ctx);
      state.agentPreferenceReadStatus = await probeAgentPermission(ctx, "/api/sidebar-preferences/me", "GET");
      const o = await ctx.input.api.get<Array<{ id: string; body: string; authorAgentId?: string }>>(`/api/issues/${ctx.issue()!.id}/comments`);
      const hrefs = await ctx.input.page.locator(`[id^="comment-"] a[href]`).evaluateAll(elements => elements.map(el => el.getAttribute("href")!));
      const p = entity(state, "project");
      const href = hrefs.find(link => hasLink({ links: [link], origin: ctx.input.api.baseURL } as Parameters<typeof hasLink>[0], "projects", p));
      if (!href || !o.some(row => row.authorAgentId === ctx.input.fixtures.agent.id)) throw new Error("No actual project reply link");
      const source = ctx.input.page.url();
      await ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(href)}]`).first().click();
      await expect(ctx.input.page.getByRole("heading", { name: "Launch", exact: true }).first()).toBeVisible();
      await ctx.input.page.getByRole("button", { name: /^Filter/ }).first().click();
      for (const status of ["Backlog", "Todo", "In Progress", "In Review", "Blocked"]) {
        await ctx.input.page.getByRole("checkbox", { name: status, exact: true }).setChecked(true);
      }
      await ctx.input.page.keyboard.press("Escape");
      await expect(ctx.input.page.getByText(entity(state, "task").title!, { exact: true }).first()).toBeVisible();
      state.openTaskVisible = await ctx.input.page.getByText(entity(state, "task").title!, { exact: true }).first().isVisible();
      state.closedTaskVisible = await ctx.input.page.getByText(entity(state, "closed").title!, { exact: true }).first().isVisible();
      await ctx.input.evidence("identity-project-navigation.json", { projectId: p.id, openTaskId: entity(state, "task").id,
        openTaskVisible: state.openTaskVisible, closedTaskVisible: state.closedTaskVisible, url: ctx.input.page.url() });
      await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" });
    }, verifyResult: verifyInternalResult,
  }),
  identityDefinition("navigation-preferences.quick-search", fixture, gradeNavigation, {
    coverageGaps: ["filter-preservation", "authenticated-search-denial"],
    async act(ctx, state) {
      await waitForReply(ctx); const source = ctx.input.page.url();
      await ctx.input.page.keyboard.press("ControlOrMeta+k");
      await ctx.input.page.getByPlaceholder("Search tasks, agents, projects...").fill("Launch");
      await expect(ctx.input.page.getByRole("dialog").getByText(entity(state, "task").title!, { exact: true })).toBeVisible();
      state.paletteTaskVisible = true;
      await ctx.input.page.getByTestId("command-search-all").click();
      await expect(ctx.input.page.getByText(entity(state, "task").title!, { exact: true }).first()).toBeVisible();
      state.searchTaskVisible = true; state.searchQuery = new URL(ctx.input.page.url()).searchParams.get("q");
      await ctx.input.evidence("identity-quick-search.json", { taskId: entity(state, "task").id, query: state.searchQuery, url: ctx.input.page.url() });
      await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" });
    },
  }),
] as const;
async function preferenceSnapshot(ctx: Parameters<typeof project>[0]) {
  const order = await ctx.input.api.get(`/api/companies/${ctx.input.fixtures.company.id}/sidebar-preferences/me`);
  const browserPreferences = await ctx.input.page.evaluate(() => Object.fromEntries(Object.entries(localStorage)
    .filter(([key]) => /favorite|recent[-:.]?(?:tasks|projects)/i.test(key)).sort(([a], [b]) => a.localeCompare(b))));
  return { order, browserPreferences };
}
