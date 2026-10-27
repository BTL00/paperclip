import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accessibilityUpdatePins as pins, gradeIntegratorSkillUpdate } from "./integrator-skill-update.js";
// Unmodified MIT-licensed source bytes, with LICENSE.md in the same fixture
// directory. Product setup still fetches the actual GitHub commit snapshots.
import { createHash } from "node:crypto";
const bytes = { old: readFileSync(new URL("../fixtures/accessibility-source/0.4.SKILL.md", import.meta.url), "utf8"), next: readFileSync(new URL("../fixtures/accessibility-source/0.5.SKILL.md", import.meta.url), "utf8") };
function valid(old: string, next: string) {
  const upstream = { id: "up", companyId: "company", name: "accessibility", editable: false, sourceRef: pins.oldCommit, currentVersionId: "old", markdown: old };
  const local = { id: "fork", editable: true, forkedFromSkillId: "up", currentVersionId: "local", markdown: `${old}\nORCHID customer notes` };
  const versions = [{ id: "old", fileInventory: [{ path: "SKILL.md", content: old }] }]; const localVersions = [{ id: "local" }];
  const base = { scenarioId: "skills.review-update", origin: "https://fixture.test", companyId: "company", leadId: "ceo", state: { upstream: structuredClone(upstream), localFork: structuredClone(local), localVersions: structuredClone(localVersions) }, upstream, localFork: local, upstreamVersions: versions, forkVersions: localVersions,
    source: { id: "source", lastScanCommit: pins.oldCommit, trackingRef: pins.newCommit, automaticUpdates: false }, updateStatus: { supported: true, hasUpdate: true, currentRef: pins.oldCommit, latestRef: pins.newCommit },
    tasks: [], projects: [], goals: [], documents: [], revisions: [], comments: [], humanQueries: [], links: [], runs: [], activity: [],
    reply: "The currently installed version is 0.4. The new revision adds continuous accessibility regression tests and splits long forms into smaller steps; it also discourages crowded interface patterns. I have not applied it." };
  return { ...base, upstream: { ...upstream, sourceRef: pins.newCommit, currentVersionId: "new", markdown: next }, source: { ...base.source, lastScanCommit: pins.newCommit },
    upstreamVersions: [...versions, { id: "new", fileInventory: [{ path: "SKILL.md", content: next }] }], activity: [{ agentId: "ceo", action: "company.skill_source_refreshed", entityId: "source" }], state: { ...base.state, reviewCheckpoint: structuredClone(base) },
    reply: `${base.reply}\nI updated the accessibility skill to the reviewed source version. The local copy is unchanged.` };
}
describe("genuine immutable public skill update qualification", () => {
  it("retains two independently qualified distinct public hashes without credential prerequisites", () => {
    expect(pins.oldCommit).not.toBe(pins.newCommit); expect(pins.oldSha256).not.toBe(pins.newSha256);
    expect(pins.repositoryURL).toBe("https://github.com/KreerC/ACCESSIBILITY.md");
  });
  it("accepts substantive review, normal saved version update and preserved fork using actual source bytes", () => {
    expect(createHash("sha256").update(bytes.old).digest("hex")).toBe(pins.oldSha256); expect(createHash("sha256").update(bytes.next).digest("hex")).toBe(pins.newSha256);
    expect(gradeIntegratorSkillUpdate(valid(bytes.old, bytes.next)).passed).toBe(true); expect(gradeIntegratorSkillUpdate(undefined).passed).toBe(false);
    const natural = valid(bytes.old, bytes.next); natural.reply = `${natural.state.reviewCheckpoint.reply}\nThe accessibility skill is now on revision 0.5; our local fork is preserved.`; expect(gradeIntegratorSkillUpdate(natural).passed).toBe(true);
  });
  it("rejects premature apply, listing-only review, stale installation and overwritten local work", () => {
    const early = valid(bytes.old, bytes.next); early.state.reviewCheckpoint.upstream.currentVersionId = "new"; expect(gradeIntegratorSkillUpdate(early).passed).toBe(false);
    const listing = valid(bytes.old, bytes.next); listing.state.reviewCheckpoint.reply = "Current installed 0.4. Latest 0.5 is available."; expect(gradeIntegratorSkillUpdate(listing).passed).toBe(false);
    const stale = valid(bytes.old, bytes.next); stale.upstream.markdown = bytes.old; expect(gradeIntegratorSkillUpdate(stale).passed).toBe(false);
    const overwritten = valid(bytes.old, bytes.next); overwritten.localFork.markdown = bytes.next; expect(gradeIntegratorSkillUpdate(overwritten).passed).toBe(false);
    const lying = valid(bytes.old, bytes.next); lying.reply = `${lying.state.reviewCheckpoint.reply}\nI haven't updated the accessibility skill, only fetched its source.`; expect(gradeIntegratorSkillUpdate(lying).passed).toBe(false);
  });
});
