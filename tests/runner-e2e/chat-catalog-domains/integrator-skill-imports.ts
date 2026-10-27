import type { CompanySkillDetail, CompanySkillListItem, CompanySkillVersion } from "../../../packages/shared/src/types/company-skill.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { checks, observation, project, type Entity, type InternalObservation } from "./internal-support.js";
import { groundedStatement, integratorDefinition, inspectResult, resultHref, observeInternal } from "./integrator-support.js";
import { preservesWebsiteChecklist } from "./integrator-skills.js";
import { sourceSkillMarkdown, mobileChecks, openVettedSkillSource, skillSourceRequests, closeVettedSkillSource, importReadOnlySkill, editableLocalNotes } from "./integrator-skill-source.js";
interface ImportObservation extends InternalObservation {
  skills: CompanySkillDetail[]; skillVersions: Record<string, CompanySkillVersion[]>;
  sourceRequests: ReturnType<typeof skillSourceRequests>;
}
const root = (ctx: ChatCatalogContext) => `/api/companies/${ctx.input.fixtures.company.id}/skills`;
async function observeImports(ctx: ChatCatalogContext, state: Record<string, unknown>): Promise<ImportObservation> {
  const base = await observeInternal(ctx, state); const api = ctx.input.api;
  const rows = await api.get<CompanySkillListItem[]>(root(ctx));
  const skills = await Promise.all(rows.map(row => api.get<CompanySkillDetail>(`${root(ctx)}/${row.id}`)));
  const skillVersions = Object.fromEntries(await Promise.all(rows.map(async row => [row.id, await api.get<CompanySkillVersion[]>(`${root(ctx)}/${row.id}/versions`)])));
  return { ...base, skills, skillVersions, sourceRequests: skillSourceRequests(ctx) };
}
function importObservation(value: unknown): ImportObservation | undefined {
  const o = value as ImportObservation;
  return observation(value) && Array.isArray(o.skills) && !!o.skillVersions && Array.isArray(o.sourceRequests) ? o : undefined;
}
export function preservesMobileChecks(markdown: string) {
  const lines = markdown.split(/\n+|(?<=[.!?])\s+/).filter(text => !/\b(?:skip|omit|ignore|do not|don't|optional)\b/i.test(text));
  return lines.some(text => /touch/i.test(text) && /44\s*(?:by|x|×)\s*44/i.test(text) && /at least|minimum|>=|≥/.test(text))
    && lines.some(text => /portrait/i.test(text) && /landscape/i.test(text))
    && lines.some(text => /mobile Safari/i.test(text) && /checkout/i.test(text));
}
function changedFork(o: ImportObservation) {
  const upstream = o.state.upstream as CompanySkillDetail | undefined;
  return o.skills.find(row => row.forkedFromSkillId === upstream?.id && row.editable && preservesMobileChecks(row.markdown)
    && o.activity.some(event => event.entityId === row.id && event.agentId === o.leadId && ["company.skill_forked", "company.skill_file_updated", "company.skill_created"].includes(event.action ?? "")));
}
export function gradeIntegratorSkillImports(value: unknown) {
  const c = checks(); const o = importObservation(value);
  c.add("actual-source-library-and-version-evidence", !!o, "Requires the real vetted source request log, public company library detail and revision history.");
  if (!o) return c.result();
  c.add("permitted-source-prerequisite", o.state.importAllowed === true && o.sourceRequests.length >= 1, "Effective skill policy permits ordinary import, and the owned synthetic source was genuinely read.");
  if (o.scenarioId === "skills.find-and-install") {
    const installed = o.skills.filter(row => row.sourceLocator === o.state.sourceURL); const skill = installed[0];
    c.add("one-intended-source-installation", installed.length === 1 && !!skill && skill.companyId === o.companyId && skill.sourceType === "url" && skill.markdown === sourceSkillMarkdown
      && !!skill.currentVersionId && o.skillVersions[skill.id]?.some(row => row.id === skill.currentVersionId && row.fileInventory.some(file => file.path === "SKILL.md" && file.content === sourceSkillMarkdown)), "One intended skill retains the genuine source URL and exact fetched original revision bytes.");
    c.add("agent-imported-approved-source", o.activity.some(event => event.action === "company.skills_imported" && event.agentId === o.leadId && event.details?.source === o.state.sourceURL
      && event.details?.importedCount === 1), "The responding agent imports the actual authorized source through the supported company route.");
    c.add("truthful-installation-and-usage", !!skill && o.reply.includes(skill.name) && skill.usedByAgents.length === 0
      && !/\b(?:board|human|admin(?:istrator)?)\b[^.!?\n]{0,40}\b(?:approval (?:is )?required|must approve|need(?:s)? to approve)\b/i.test(o.reply)
      && !/\b(?:enabled|assigned|activated)\b[^.!?\n]{0,30}\b(?:all|every)\s+agents?\b/i.test(o.reply), "The response identifies the saved skill without a fictional approval gate or global usage assignment.");
  } else if (o.scenarioId === "skills.fork-read-only") {
    const before = o.state.upstream as CompanySkillDetail | undefined; const original = o.skills.find(row => row.id === before?.id); const fork = changedFork(o);
    c.add("upstream-remains-read-only-and-identical", !!before && !!original && original.editable === false && original.sourceType === "url" && original.sourceLocator === before.sourceLocator
      && original.currentVersionId === before.currentVersionId && original.markdown === before.markdown
      && JSON.stringify(o.skillVersions[original.id]) === JSON.stringify(o.state.upstreamVersions), "The real protected upstream package and full revision history remain unchanged.");
    c.add("editable-provenance-preserving-mobile-fork", !!fork && !!before && fork.id !== before.id && fork.forkedFromSkillId === before.id && fork.forkedFromCompanyId === o.companyId
      && preservesWebsiteChecklist(fork.markdown) && preservesMobileChecks(fork.markdown)
      && o.skillVersions[fork.id]?.some(version => version.id === fork.currentVersionId && version.authorAgentId === o.leadId && version.fileInventory.some(file => file.path === "SKILL.md" && file.content === fork.markdown)), "A saved editable fork retains upstream provenance, the original substantive checklist and all actual mobile additions.");
    const localBefore = o.state.localFork as CompanySkillDetail | undefined; const localNow = o.skills.find(row => row.id === localBefore?.id);
    c.add("unrelated-local-notes-preserved", !!localBefore && !!localNow && localNow.markdown.includes("ORCHID customer escalation notes unchanged")
      && (localNow.id === fork?.id || localNow.currentVersionId === localBefore.currentVersionId && localNow.markdown === localBefore.markdown), "Existing local notes survive whether the agent edits the existing copy or selects a separate fork.");
    c.add("correct-copy-explained", !!fork && o.reply.includes(fork.name) && groundedStatement(o.reply, /\b(?:upstream|original|source)\b/i, /\b(?:unchanged|read.only|protected|not (?:changed|modified|edited))\b/i,
      /\b(?:edited|updated|modified|changed)\s+(?:the )?(?:upstream|original source)\b/i), "Chat distinguishes the editable copy for future use from the unmodified upstream.");
  } else c.add("owned-import-oracle", false, "No independent import/fork oracle exists for this scenario.");
  return c.result();
}
function define(id: "skills.find-and-install" | "skills.fork-read-only") {
  return integratorDefinition("skills", id, async ctx => {
    const source = await openVettedSkillSource(ctx);
    try {
      const decision = await ctx.input.api.post<{ allowed: boolean }>(`/api/companies/${ctx.input.fixtures.company.id}/skill-policy/evaluate`, { principal: { agentId: ctx.input.fixtures.agent.id }, action: "skills.import", resource: { sourceType: "external_package", sourceLocator: source.url } });
      if (!decision.allowed) throw new Error("Synthetic source fixture does not have the canonical permitted skill policy");
      const p = await project(ctx, "Launch", { description: `Our vetted accessibility review source is ${source.url}. It is a synthetic Markdown-only fixture. Our mobile review checklist is: ${mobileChecks.join(" ")}` });
      if (id === "skills.find-and-install") return { project: p, sourceURL: source.url, importAllowed: true };
      const upstream = await importReadOnlySkill(ctx, source.url); const localFork = await editableLocalNotes(ctx, upstream);
      return { project: p, sourceURL: source.url, importAllowed: true, upstream, localFork, upstreamVersions: await ctx.input.api.get<CompanySkillVersion[]>(`${root(ctx)}/${upstream.id}/versions`) };
    } catch (error) { await closeVettedSkillSource(ctx); throw error; }
  }, observeImports, gradeIntegratorSkillImports, async (ctx, _state, value) => {
    const o = importObservation(value); const skill = o && (id === "skills.find-and-install" ? o.skills.find(row => row.sourceLocator === o.state.sourceURL) : changedFork(o));
    if (!o || !skill) throw new Error("No actual saved skill copy for browser inspection");
    await inspectResult(ctx, `/${ctx.input.fixtures.company.issuePrefix}/skills/studio/${skill.id}`, skill.name, resultHref(o, skill.id, "studio"));
  }, { sourceFiles: ["chat-catalog-domains/integrator-skill-imports.ts", "chat-catalog-domains/integrator-skill-source.ts", "chat-catalog-domains/integrator-skills.ts", "chat-catalog-domains/integrator-support.ts", "chat-catalog-domains/internal-support.ts", "chat-scenarios/skills.yaml"],
    async cleanup(ctx) { await closeVettedSkillSource(ctx); } });
}
export const integratorSkillImportCases = [define("skills.find-and-install"), define("skills.fork-read-only")];
