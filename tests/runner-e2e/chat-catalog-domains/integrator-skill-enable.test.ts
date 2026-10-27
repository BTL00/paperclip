import { describe, expect, it } from "vitest";
import { SKILL_POLICY_ACTIONS } from "../../../packages/shared/src/validators/skill-policy.js";
import { gradeIntegratorSkillEnable, integratorSkillEnableCases, unsupportedUsePrerequisite } from "./integrator-skill-enable.js";
function valid() {
  const skill = { id: "skill", key: "company/accessibility-review", currentVersionId: "revision", markdown: "Check form labels" };
  return { scenarioId: "skills.enable-for-agent", origin: "https://fixture.test", companyId: "company", leadId: "ceo", state: { skill: structuredClone(skill), worker: { id: "morgan" }, futureTask: { id: "future" }, agentConfigurationStatus: 200, beforeActivityIds: ["setup-probe"], effectivePolicy: { revision: 1, rules: [] } },
    tasks: [], projects: [], goals: [], comments: [], documents: [], revisions: [], humanQueries: [], links: [],
    runs: [{ id: "source", agentId: "ceo", runtimeMode: "native", status: "succeeded", contextSnapshot: { issueId: "chat" } }, { id: "future-run", agentId: "morgan", runtimeMode: "native", status: "succeeded", contextSnapshot: { issueId: "future", skillVersions: { [skill.key]: "revision" } } }],
    skill, assignment: { supported: true, desiredSkills: [skill.key], desiredSkillEntries: [{ key: skill.key, versionId: "revision" }] }, effectivePolicy: { revision: 1, rules: [] },
    activity: [{ id: "actual-assignment", action: "agent.skills_synced", agentId: "ceo", entityId: "morgan", runId: "source" }],
    reply: "Assigned the existing skill from our company library to Morgan. Installation was already complete; usage remains subject to the existing policy." };
}
describe("effective-use prerequisite classification", () => {
  it("requires the complete real lifecycle-denial probe and actual retained assignment, never a single unsupported action", () => {
    const receipt = { useStatus: 400, decisions: SKILL_POLICY_ACTIONS.map(action => ({ action, allowed: false })), assignmentRetained: true };
    expect(unsupportedUsePrerequisite(receipt)).toBe(true);
    expect(unsupportedUsePrerequisite({ ...receipt, decisions: [] })).toBe(false);
    expect(unsupportedUsePrerequisite({ ...receipt, useStatus: 403 })).toBe(false);
    expect(unsupportedUsePrerequisite({ ...receipt, assignmentRetained: false })).toBe(false);
    expect(unsupportedUsePrerequisite({ ...receipt, decisions: receipt.decisions.map((row, index) => index ? row : { ...row, allowed: true }) })).toBe(false);
  });
});
describe("actual permitted skill assignment and future immutable delivery", () => {
  it("keeps unsupported grant/use-policy prerequisites partial, never an expected-refusal pass", () => {
    expect(integratorSkillEnableCases[0]!.coverageGaps).toHaveLength(2);
    expect(gradeIntegratorSkillEnable(valid()).passed).toBe(true);
    expect(gradeIntegratorSkillEnable({ ...valid(), state: { ...valid().state, agentConfigurationStatus: 403 } }).passed).toBe(false);
    expect(gradeIntegratorSkillEnable(undefined).passed).toBe(false);
  });
  it("rejects a different agent/version, setup-probe attribution and policy self-elevation", () => {
    const stale = valid(); stale.runs[1]!.contextSnapshot.skillVersions = { [stale.skill.key]: "old-version" };
    expect(gradeIntegratorSkillEnable(stale).passed).toBe(false);
    const wrong = valid(); wrong.runs[1]!.agentId = "someone-else"; expect(gradeIntegratorSkillEnable(wrong).passed).toBe(false);
    const probe = valid(); probe.activity[0]!.id = "setup-probe"; expect(gradeIntegratorSkillEnable(probe).passed).toBe(false);
    const changed = valid(); changed.effectivePolicy.revision = 2; expect(gradeIntegratorSkillEnable(changed).passed).toBe(false);
  });
  it("accepts substantive assignment language but rejects false refusal/global activation", () => {
    const o = valid();
    expect(gradeIntegratorSkillEnable({ ...o, reply: "Morgan is configured with the already installed accessibility skill. This assignment does not change usage permissions." }).passed).toBe(true);
    expect(gradeIntegratorSkillEnable({ ...o, reply: "Morgan is not enabled, even though the installed skill has a permissive policy." }).passed).toBe(false);
    expect(gradeIntegratorSkillEnable({ ...o, reply: "Assigned the installed skill to Morgan and all agents. I changed the policy." }).passed).toBe(false);
  });
});
