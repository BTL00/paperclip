import { describe, it, expect } from "vitest";
import {
  gradeTeamConditions,
  truthfulTeamPartial,
} from "./external-team-conditional.js";
import type { ExternalObservation } from "./external-support.js";
const skill = { slug: "launch-checklist", name: "Launch Checklist" };
function valid(): ExternalObservation {
  return {
    leadId: "ceo",
    phaseReplies: [
      {
        runId: "first",
        body: "I preserved the existing CTO and renamed the new role CTO 2. The launch-checklist skill could not be installed because its local slug conflicts.",
      },
      {
        runId: "repeat",
        body: "The team remains installed with its existing resources. The launch-checklist skill remains blocked by the local conflict.",
      },
    ],
    activity: [
      {
        action: "company.team_catalog_installed",
        actorType: "agent",
        agentId: "ceo",
        runId: "first",
        details: {
          catalogId: "team",
          warningCount: 1,
          skillPreparationCount: 1,
        },
      },
    ],
    state: {
      initialRunId: "first",
      team: { id: "team" },
      blockedSkill: skill,
      renamePlan: { plannedName: "CTO 2" },
      actualPreviewCollision: true,
      actualSkillCollision409: true,
      firstConditional: {
        existingAgentPreserved: true,
        existingLocalSkillPreserved: true,
        requiredCatalogStillMissing: true,
        localSkillStillOccupiesSlug: true,
      },
      finalConditional: {
        existingAgentPreserved: true,
        existingLocalSkillPreserved: true,
        requiredCatalogStillMissing: true,
        localSkillStillOccupiesSlug: true,
      },
    },
  } as unknown as ExternalObservation;
}
describe("real team post-import conditional controls", () => {
  it("accepts actual independent partial state in both phases", () =>
    expect(gradeTeamConditions(valid()).passed).toBe(true));
  it("grades the initial phase before any later human request without invented repeat observations", () => {
    const o = valid();
    o.phaseReplies = o.phaseReplies.slice(0, 1);
    delete o.state.finalConditional;
    expect(gradeTeamConditions(o, "initial").passed).toBe(true);
    expect(gradeTeamConditions(o).passed).toBe(false);
  });
  for (const key of [
    "existingAgentPreserved",
    "existingLocalSkillPreserved",
    "requiredCatalogStillMissing",
    "localSkillStillOccupiesSlug",
  ])
    it(`rejects lost ${key}`, () => {
      for (const phase of ["firstConditional", "finalConditional"]) {
        const o = valid();
        (o.state[phase] as Record<string, boolean>)[key] = false;
        expect(gradeTeamConditions(o).passed).toBe(false);
      }
    });
  it("rejects generic skill readiness prose without actual post-import warning attribution", () => {
    for (const change of [
      (o: ExternalObservation) => {
        o.activity = [];
      },
      (o: ExternalObservation) => {
        o.activity[0]!.details!.warningCount = 0;
      },
      (o: ExternalObservation) => {
        (o.activity[0] as unknown as { runId: string }).runId = "repeat";
      },
      (o: ExternalObservation) => {
        o.activity[0]!.actorType = "user";
      },
      (o: ExternalObservation) => {
        o.state.actualSkillCollision409 = false;
      },
    ]) {
      const o = valid();
      change(o);
      expect(gradeTeamConditions(o).passed).toBe(false);
    }
  });
  it("a truthful later reply cannot rescue false complete initial installation", () => {
    const o = valid();
    o.phaseReplies[0]!.body =
      "Renamed the CTO to CTO 2. The launch-checklist skill had a conflict, but all required skills are installed and fully ready.";
    expect(gradeTeamConditions(o).passed).toBe(false);
  });
  it("accepts natural incomplete reports and rejects contradictory complete claims", () => {
    for (const text of [
      "The launch-checklist skill could not be installed due to the local name conflict. The team is not fully ready.",
      "Launch Checklist remains blocked; the agents and project were installed successfully.",
    ])
      expect(truthfulTeamPartial(text, skill)).toBe(true);
    for (const text of [
      "The team is installed.",
      "launch-checklist failed. All required skills are installed.",
      "Launch Checklist is blocked, but there are no warnings.",
    ])
      expect(truthfulTeamPartial(text, skill)).toBe(false);
  });
});
