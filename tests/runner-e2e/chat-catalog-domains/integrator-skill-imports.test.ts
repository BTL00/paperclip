import { describe, expect, it } from "vitest";
import { gradeIntegratorSkillImports, integratorSkillImportCases, preservesMobileChecks } from "./integrator-skill-imports.js";
import { sourceSkillMarkdown, mobileChecks } from "./integrator-skill-source.js";
function valid(id: string) {
  const url = "http://127.0.0.1:12345/accessibility-review/SKILL.md";
  const upstream = { id: "upstream", companyId: "company", name: "accessibility-review", sourceLocator: url, sourceType: "url", editable: false, markdown: sourceSkillMarkdown, currentVersionId: "original", usedByAgents: [] };
  const version = { id: "original", fileInventory: [{ path: "SKILL.md", content: sourceSkillMarkdown }] };
  const local = { ...upstream, id: "local", name: "Accessibility local notes", sourceType: "local_path", editable: true, forkedFromSkillId: "upstream", forkedFromCompanyId: "company", markdown: `${sourceSkillMarkdown}\nKeep ORCHID customer escalation notes unchanged.`, currentVersionId: "notes" };
  const fork = { ...local, markdown: `${local.markdown}\n${mobileChecks.join("\n")}`, currentVersionId: "edited" };
  const find = id === "skills.find-and-install";
  return { scenarioId: id, origin: "https://fixture.test", companyId: "company", leadId: "ceo", state: { sourceURL: url, importAllowed: true, upstream: structuredClone(upstream), localFork: structuredClone(local), upstreamVersions: [structuredClone(version)] },
    tasks: [], projects: [], goals: [], comments: [], documents: [], revisions: [], humanQueries: [], links: [], runs: [{ id: "run", agentId: "ceo", status: "succeeded" }],
    activity: find ? [{ id: "import", action: "company.skills_imported", agentId: "ceo", details: { source: url, importedCount: 1 } }] : [{ id: "edit", action: "company.skill_file_updated", agentId: "ceo", entityId: "local" }],
    sourceRequests: [{ method: "GET", path: "/accessibility-review/SKILL.md", at: 1, sha256: "digest" }],
    skills: find ? [upstream] : [upstream, fork], skillVersions: find ? { upstream: [version] } : { upstream: [version], local: [{ id: "edited", authorAgentId: "ceo", fileInventory: [{ path: "SKILL.md", content: fork.markdown }] }] },
    reply: find ? "Installed accessibility-review from the vetted source. Assignment is a separate step." : "Use Accessibility local notes for future assignments. The upstream original is unchanged and remains read-only." };
}
describe("owned vetted source and editable fork controls", () => {
  for (const definition of integratorSkillImportCases) it(`${definition.scenarioId}: saved source/version evidence and missing inputs`, () => {
    expect(gradeIntegratorSkillImports(valid(definition.scenarioId)).passed).toBe(true);
    expect(gradeIntegratorSkillImports(undefined).passed).toBe(false);
    expect(gradeIntegratorSkillImports({ ...valid(definition.scenarioId), sourceRequests: [] }).passed).toBe(false);
  });
  it("rejects a substituted source, fetch-without-install and fictional board approval", () => {
    const o = valid("skills.find-and-install");
    expect(gradeIntegratorSkillImports({ ...o, activity: [] }).passed).toBe(false);
    const replaced = structuredClone(o); replaced.skills[0]!.sourceLocator = "http://other.test/SKILL.md";
    expect(gradeIntegratorSkillImports(replaced).passed).toBe(false);
    expect(gradeIntegratorSkillImports({ ...o, reply: "Board approval is required to install accessibility-review." }).passed).toBe(false);
    const wrongBytes = structuredClone(o); wrongBytes.skills[0]!.markdown = "A suggested skill.";
    expect(gradeIntegratorSkillImports(wrongBytes).passed).toBe(false);
  });
  it("rejects upstream edits, lost unrelated local notes, missing substantive mobile checks and false in-place success", () => {
    const o = valid("skills.fork-read-only"); const upstreamChanged = structuredClone(o); upstreamChanged.skills[0]!.markdown += "Modified upstream";
    expect(gradeIntegratorSkillImports(upstreamChanged).passed).toBe(false);
    const lostNotes = structuredClone(o); lostNotes.skills[1]!.markdown = `${sourceSkillMarkdown}\n${mobileChecks.join("\n")}`;
    expect(gradeIntegratorSkillImports(lostNotes).passed).toBe(false);
    const wrongTouch = structuredClone(o); wrongTouch.skills[1]!.markdown = wrongTouch.skills[1]!.markdown.replace("44 by 44", "24 by 24");
    expect(gradeIntegratorSkillImports(wrongTouch).passed).toBe(false);
    expect(gradeIntegratorSkillImports({ ...o, reply: "I edited the upstream. Use Accessibility local notes; the original is unchanged." }).passed).toBe(false);
    expect(preservesMobileChecks("Check touch targets at least 44x44 pixels.\nCheck both portrait and landscape orientation.\nReview mobile Safari checkout.")).toBe(true);
    expect(preservesMobileChecks("Ignore touch targets at least 44x44 pixels.\nCheck both portrait and landscape orientation.\nReview mobile Safari checkout.")).toBe(false);
  });
});
