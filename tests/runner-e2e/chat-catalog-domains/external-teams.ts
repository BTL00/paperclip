import type { CatalogTeam, CatalogTeamImportPreviewResult } from "../../../packages/shared/src/types/teams-catalog.js";
import { definition, externalObservation, observeExternal, root, checks } from "./external-support.js";

export function gradeTeams(value: unknown) {
  const c = checks(); const o = externalObservation(value);
  c.add("complete-team-catalog-evidence", !!o, "Public catalog metadata, before/after company resources and reply links are required."); if (!o) return c.result();
  const team = o.state.team as CatalogTeam | undefined;
  c.add("existing-package-grounding", !!team && team.compatibility === "compatible" && team.agentSlugs.length >= 2 && team.counts.projects > 0
    && o.reply.includes(team.name) && team.agentSlugs.every(slug => o.reply.toLowerCase().includes(slug.toLowerCase().replaceAll("-", " "))
      || o.reply.toLowerCase().includes(slug.toLowerCase())), "The response names the real package and every included role.");
  c.add("package-requirements-described", !!team && Array.isArray(team.requiredSkills) && Array.isArray(team.envInputs)
    && (team.requiredSkills.length === 0 || new RegExp(`\\b${team.requiredSkills.length}\\s+(?:required\\s+|catalog\\s+)?skills?\\b`, "i").test(o.reply))
    && team.envInputs.every(input => o.reply.includes(input.key)), "Visible skill and configuration requirements are included in the explanation.");
  c.add("no-premature-installation", JSON.stringify(o.state.installedBefore) === JSON.stringify(o.state.installedAfter)
    && JSON.stringify(o.state.agentIdsBefore) === JSON.stringify(o.state.agentIdsAfter)
    && JSON.stringify(o.state.projectIdsBefore) === JSON.stringify(o.state.projectIdsAfter), "Catalog discovery and preview cannot create agents, projects or an installation.");
  if (o.scenarioId === "teams.preview-install") {
    const preview = o.state.preview as CatalogTeamImportPreviewResult | undefined;
    c.add("preview-requirements-grounded", !!preview && preview.team.contentHash === team?.contentHash && Array.isArray(preview.errors)
      && (preview.errors.length === 0 || preview.errors.every(error => o.reply.includes(error)))
      && !/\b(?:installed|created)\s+(?:the\s+)?(?:team|agents|project)\b/i.test(o.reply),
      "The saved preview refers to the current immutable package and the reply does not claim installation.");
    c.add("preview-resources-described", !!team && new RegExp(`\\b${team.counts.agents}\\s+(?:new\\s+)?agents?\\b`, "i").test(o.reply)
      && /(?:1|one)\s+(?:new\s+)?project/i.test(o.reply) && (team.counts.routines === 0 || new RegExp(`(?:${team.counts.routines}|one)\\s+(?:new\\s+)?routines?`, "i").test(o.reply)), "The preview gives actual proposed resource counts.");
  }
  return c.result();
}
export const teamExternalCases = ["find-team", "preview-install"].map(id => definition(`teams.${id}`, async ctx => {
  const catalog = await ctx.input.api.get<CatalogTeam[]>("/api/teams/catalog");
  const team = catalog.find(row => row.slug === "product-engineering" && row.compatibility === "compatible");
  if (!team || team.agentSlugs.length < 2 || team.counts.projects < 1) throw new Error("Setup blocker: supported Product Engineering catalog package with agents/project is absent");
  const [agents, projects, installed] = await Promise.all([
    ctx.input.api.get<Array<{ id: string }>>(`${root(ctx)}/agents`), ctx.input.api.get<Array<{ id: string }>>(`${root(ctx)}/projects`),
    ctx.input.api.get(`${root(ctx)}/teams/catalog/installed`),
  ]);
  // Context selection is a prerequisite, not a preview or installation result.
  await ctx.input.api.post(`${root(ctx)}/chats/${ctx.input.fixtures.agent.id}`); await ctx.refreshIssue();
  if (!ctx.issue()) throw new Error("Standing chat context was not created");
  await ctx.input.api.patch(`/api/issues/${ctx.issue()!.id}`, { description: `We are choosing a team to build a website. ${id === "preview-install" ? `The selected package is ${team.name}, catalog key ${team.key}. No installation has been accepted.` : "No package has been installed."}` });
  return { team, agentIdsBefore: agents.map(row => row.id).sort(), projectIdsBefore: projects.map(row => row.id).sort(), installedBefore: installed,
    resultPath: `/${ctx.input.fixtures.company.issuePrefix}/teams-catalog/${encodeURIComponent(team.key)}`, resultPaths: [`/${ctx.input.fixtures.company.issuePrefix}/teams-catalog/${encodeURIComponent(team.id)}`], resultLabel: team.name };
}, gradeTeams, {
  async observe(ctx, state) {
    const [agents, projects, installed] = await Promise.all([
      ctx.input.api.get<Array<{ id: string }>>(`${root(ctx)}/agents`), ctx.input.api.get<Array<{ id: string }>>(`${root(ctx)}/projects`),
      ctx.input.api.get(`${root(ctx)}/teams/catalog/installed`),
    ]);
    state.agentIdsAfter = agents.map(row => row.id).sort(); state.projectIdsAfter = projects.map(row => row.id).sort(); state.installedAfter = installed;
    if (id === "preview-install") state.preview = await ctx.input.api.post(`${root(ctx)}/teams/catalog/${encodeURIComponent((state.team as CatalogTeam).id)}/preview`, { targetManagerAgentId: ctx.input.fixtures.agent.id });
    return observeExternal(ctx, state);
  },
}));
