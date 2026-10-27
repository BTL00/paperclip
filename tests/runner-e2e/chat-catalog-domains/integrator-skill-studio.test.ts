import { describe, expect, it } from "vitest";
import { gradeIntegratorSkillStudio, studioPageInput } from "./integrator-skill-studio.js";
function valid() {
  const skill = { id: "skill", companyId: "company", currentVersionId: "revision", markdown: "Inspect visible form labels", editable: true };
  const output = "The email input trial-email has no visible associated label. This accessibility check fails on the sample; add a label linked to its id.";
  const run = { id: "test", companyId: "company", skillId: "skill", agentId: "morgan", skillVersionId: "revision", skillVersion: { id: "revision", fileInventory: [{ path: "SKILL.md", content: skill.markdown }] },
    inputId: "input", inputSnapshot: studioPageInput, status: "succeeded", issueId: "harness", harnessIssue: { id: "harness", status: "done" }, harnessContent: { available: true },
    outputBody: output, outputSnapshot: output, outputDocumentKey: "output", documents: [{ key: "output", body: output }], interactions: [] };
  return { scenarioId: "skills.studio-test", origin: "https://fixture.test", companyId: "company", leadId: "ceo", state: { skill: structuredClone(skill), input: { id: "input" }, worker: { id: "morgan" } },
    tasks: [], projects: [], goals: [], comments: [], documents: [], revisions: [], humanQueries: [], activity: [], links: [],
    runs: [{ id: "native", agentId: "morgan", runtimeMode: "native", status: "succeeded", contextSnapshot: { issueId: "harness" } }], skill, studioRuns: [run],
    reply: "Started one Studio test on the saved sample and selected accessibility revision. You can inspect the result there; this does not qualify other pages." };
}
describe("one real inspectable Studio test", () => {
  it("accepts genuine sample failure findings under a successful execution", () => {
    expect(gradeIntegratorSkillStudio(valid()).passed).toBe(true);
    expect(gradeIntegratorSkillStudio(undefined).passed).toBe(false);
    const o = valid(); o.studioRuns[0]!.outputBody = "";
    expect(gradeIntegratorSkillStudio(o).passed).toBe(false);
  });
  it("rejects substituted input/revision, duplicate tests, wrong native attribution and unrelated work", () => {
    const wrongInput = valid(); wrongInput.studioRuns[0]!.inputSnapshot = "Another page";
    expect(gradeIntegratorSkillStudio(wrongInput).passed).toBe(false);
    const wrongVersion = valid(); wrongVersion.studioRuns[0]!.skillVersionId = "newer";
    expect(gradeIntegratorSkillStudio(wrongVersion).passed).toBe(false);
    const duplicate = valid(); duplicate.studioRuns.push({ ...duplicate.studioRuns[0]!, id: "extra" });
    expect(gradeIntegratorSkillStudio(duplicate).passed).toBe(false);
    const other = valid(); other.runs[0]!.contextSnapshot.issueId = "other";
    expect(gradeIntegratorSkillStudio(other).passed).toBe(false);
    expect(gradeIntegratorSkillStudio({ ...valid(), tasks: [{ id: "unrelated" }] }).passed).toBe(false);
  });
  it("accepts substantive paraphrase and rejects false sample or universal success", () => {
    const o = valid();
    const paraphrase = "The email field is unlabeled; it fails the visible-label requirement. Associate a visible label with trial-email.";
    o.studioRuns[0]!.outputBody = paraphrase; o.studioRuns[0]!.outputSnapshot = paraphrase; o.studioRuns[0]!.documents[0]!.body = paraphrase;
    expect(gradeIntegratorSkillStudio(o).passed).toBe(true);
    const falsePage = valid(); const wrong = "The email input trial-email has a visible label; no accessibility failures.";
    falsePage.studioRuns[0]!.outputBody = wrong; falsePage.studioRuns[0]!.outputSnapshot = wrong; falsePage.studioRuns[0]!.documents[0]!.body = wrong;
    expect(gradeIntegratorSkillStudio(falsePage).passed).toBe(false);
    expect(gradeIntegratorSkillStudio({ ...o, reply: "Every production agent is qualified and all pages are verified." }).passed).toBe(false);
    const failed = valid(); failed.studioRuns[0]!.status = "failed";
    expect(gradeIntegratorSkillStudio({ ...failed, reply: "The test passed." }).passed).toBe(false);
  });
});
