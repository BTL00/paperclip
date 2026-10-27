import { describe, expect, it } from "vitest";
import { teamInstallExternalCases } from "./external-team-install.js";
function valid() {
  const team = { id: "team", contentHash: "hash", agentSlugs: ["cto", "coder"], counts: { agents: 2, projects: 1, routines: 1 } };
  const agent = (id: string) => ({ id, companyId: "company", urlKey: id, metadata: { paperclip: { catalogTeam: { catalogId: "team", originHash: "hash" } } } });
  const before = { agents: [], projects: [], routines: [], installed: [] };
  const after = { agents: [agent("cto"), agent("coder")], projects: [{ id: "project", companyId: "company", urlKey: "website" }], routines: [{ id: "routine", companyId: "company" }], installed: [{ catalogId: "team", agentCount: 2, outOfDate: false }] };
  return { scenarioId: "teams.install-team", origin: "http://fixture.invalid", companyId: "company", leadId: "ceo", phaseReplies: [{ runId: "initial", body: "Installed the team." }, { runId: "repeat", body: "The existing team is already installed; I kept its same resources." }],
    connections: [], profiles: [], secrets: [], endpoints: [], interactions: [], tasks: [], projects: after.projects, goals: [], comments: [], documents: [], revisions: [], humanQueries: [], reply: "Installed the team; it already exists.",
    links: ["/ACORN/agents/cto", "/ACORN/agents/coder", "/ACORN/projects/website"], runs: [{ id: "initial", status: "succeeded" }, { id: "repeat", status: "succeeded" }],
    activity: [{ id: "install", action: "company.team_catalog_installed", actorType: "agent", agentId: "ceo" }],
    state: { team, before, first: structuredClone(after), after, companyPrefix: "ACORN", previewAccepted: true, previewErrorCount: 0, actorCanCreateAgents: true, existingAccountReady: true, originalHumanQuery: "Install that website team in this company.", repeatHumanQuery: "Install that website team in this company.", initialRunId: "initial" } };
}
describe("real catalog installer oracle", () => {
  const definition = teamInstallExternalCases[0]!;
  it("accepts attributed installation and actual repeat reconciliation", () => { expect(definition.grade(valid()).passed).toBe(true); });
  it("rejects plausible duplicate installations, wrong provenance, human prepopulation and substituted repeat transcript", () => {
    for (const change of [
      (o: ReturnType<typeof valid>) => { o.state.after.agents.push({ ...o.state.after.agents[0]!, id: "copy" }); },
      (o: ReturnType<typeof valid>) => { o.state.after.agents[0]!.metadata.paperclip.catalogTeam.originHash = "other-package"; },
      (o: ReturnType<typeof valid>) => { o.activity[0]!.actorType = "user"; },
      (o: ReturnType<typeof valid>) => { o.phaseReplies[1]!.runId = "initial"; },
      (o: ReturnType<typeof valid>) => { o.links[2] = "https://other.invalid/ACORN/projects/project"; },
      (o: ReturnType<typeof valid>) => { o.links[2] = "/OTHER/projects/project"; },
      (o: ReturnType<typeof valid>) => { o.links[2] = "/ACORN/projects"; },
    ]) { const o = valid(); change(o); expect(definition.grade(o).passed).toBe(false); }
  });
  it("missing evidence or a successful-sounding reply alone cannot pass", () => { expect(definition.grade(undefined).passed).toBe(false); expect(definition.grade({ reply: "Installed everything." }).passed).toBe(false); });
});
