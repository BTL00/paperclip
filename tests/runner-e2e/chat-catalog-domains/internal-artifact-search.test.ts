import { describe, expect, it } from "vitest";
import { buildHistoricalWebsiteImport, gradeArtifactSearch, historicalWebsitePreviewMatches } from "./internal-artifact-search.js";
import { parse } from "yaml";
import { companyPortabilityService } from "../../../server/src/services/company-portability.js";
function valid() {
  const target = { id: "final-task", companyId: "company", title: "Final launch website delivery", status: "done", completedAt: "2026-10-21T12:00:00.000Z" };
  const hidden = { id: "hidden-task", companyId: "company", title: "Restricted final website NIGHTJAR", status: "done" };
  const file = { id: "file", issueId: "final-task", assetId: "asset", issueCommentId: "delivery", sha256: "a".repeat(64), contentPath: "/api/attachments/file/content", createdAt: "2026-10-26T12:00:00.000Z" };
  return { scenarioId: "documents-artifacts.find-artifact", origin: "https://fixture.test", companyId: "company", leadId: "ceo", state: { task: structuredClone(target), privateTask: hidden, privateMarker: hidden.title, privateAttachment: { id: "hidden-file", assetId: "hidden-asset" }, finalAttachment: structuredClone(file), finalHash: file.sha256, deliveryAt: target.completedAt, weekStart: Date.parse("2026-10-19T00:00:00Z"), weekEnd: Date.parse("2026-10-26T00:00:00Z"), originalTasks: structuredClone([target, hidden]), distractors: [hidden] },
    tasks: [target, hidden], projects: [], goals: [], comments: [], activity: [{ id: "import", action: "company.imported", createdAt: "2026-10-26T12:00:01.000Z" }], documents: [], revisions: [], runs: [], humanQueries: [],
    reply: "This is the final approved website delivered last week; the import uploaded the preserved file again today.", links: ["/RUN/issues/final-task", "/api/attachments/file/content?download=1"],
    finalAttachment: file, currentSource: target, downloadedHash: file.sha256, deliveryComments: [{ id: "delivery", createdAt: target.completedAt, body: `Final approved website delivered, SHA256 ${file.sha256}.` }], searchStatus: 200, searchResults: [{ id: "final-task" }], privateFileStatus: 403 };
}
describe("migrated historical website artifact calibration", () => {
  it("accepts preserved original last-week delivery and actual later import", () => expect(gradeArtifactSearch(valid()).passed).toBe(true));
  it("builds real inline migration files with SHA-bound bytes and comment linkage", () => { const bundle = buildHistoricalWebsiteImport("2026-10-21T12:00:00.000Z", "ORCHID"); const yaml = parse(bundle.files[".paperclip.yaml"] as string); expect(yaml.schemaVersion).toBe(7); for (const row of bundle.receipts) { expect(bundle.files[`blobs/${row.sha256}`]).toMatchObject({ encoding: "base64" }); expect(yaml.tasks[row.slug].attachments[0]).toMatchObject({ sha256: row.sha256, commentIndex: 0 }); } expect(yaml.tasks["final-website"].completedAt).toBe("2026-10-21T12:00:00.000Z"); });
  it("passes the actual production portability parser with all original dates/comments/attachments and no database access", async () => {
    const bundle = buildHistoricalWebsiteImport("2026-10-21T12:00:00.000Z", "ORCHID");
    const noDatabase = new Proxy({}, { get(_target, key) { throw new Error(`Offline preview must not access database property ${String(key)}`); } }) as Parameters<typeof companyPortabilityService>[0];
    const service = companyPortabilityService(noDatabase);
    const request = { source: { type: "inline" as const, files: bundle.files }, include: { company: false, agents: false, projects: false, issues: true, skills: false }, target: { mode: "new_company" as const }, collisionStrategy: "rename" as const };
    const preview = await service.previewImport(request);
    expect(historicalWebsitePreviewMatches(preview, bundle)).toBe(true);
    const jsonRoot = { ...request, source: { ...request.source, files: { ...bundle.files, ".paperclip.yaml": JSON.stringify(parse(bundle.files[".paperclip.yaml"] as string)) } } };
    const lost = await service.previewImport(jsonRoot);
    expect(lost.manifest.issues).toHaveLength(4);
    expect(lost.manifest.issues.every(row => row.attachments?.length === 0 && row.completedAt == null)).toBe(true);
    expect(historicalWebsitePreviewMatches(lost, bundle)).toBe(false);
    const wrongDate = structuredClone(preview); wrongDate.manifest.issues.find(row => row.slug === "final-website")!.completedAt = "2026-10-27T12:00:00.000Z";
    expect(historicalWebsitePreviewMatches(wrongDate, bundle)).toBe(false);
    const wrongComment = structuredClone(preview); wrongComment.manifest.issues.find(row => row.slug === "final-website")!.attachments![0]!.commentIndex = 1;
    expect(historicalWebsitePreviewMatches(wrongComment, bundle)).toBe(false);
  });
  it("accepts an explicitly qualified link to older authorized history", () => { const o = valid(); const old = { id: "old-task", companyId: "company", title: "Earlier website final", status: "done" }; o.state.distractors.push(old); o.links.push("/RUN/issues/old-task"); o.reply += "\n[Earlier website final](/RUN/issues/old-task) is older history outside last week."; expect(gradeArtifactSearch(o).passed).toBe(true); });
  it("rejects treating today's import as last week's delivery", () => { const o = valid(); o.currentSource.completedAt = "2026-10-26T12:00:00.000Z"; expect(gradeArtifactSearch(o).passed).toBe(false); });
  it("rejects invented attachment-bound source history", () => { const o = valid(); o.deliveryComments[0]!.id = "wrong-comment"; expect(gradeArtifactSearch(o).passed).toBe(false); const noImport = valid(); noImport.activity = []; expect(gradeArtifactSearch(noImport).passed).toBe(false); });
  it("rejects private snippets or copied private file links", () => { const o = valid(); o.searchResults.push({ id: "hidden-task" }); expect(gradeArtifactSearch(o).passed).toBe(false); const leak = valid(); leak.links.push("/api/attachments/hidden-file/content"); expect(gradeArtifactSearch(leak).passed).toBe(false); });
  it("rejects foreign downloads, stale bytes and older final source substitution", () => { const o = valid(); o.links[1] = "https://foreign.test/api/attachments/file/content"; expect(gradeArtifactSearch(o).passed).toBe(false); const stale = valid(); stale.downloadedHash = "b".repeat(64); expect(gradeArtifactSearch(stale).passed).toBe(false); const older = valid(); older.state.deliveryAt = "2026-09-30T12:00:00.000Z"; older.currentSource.completedAt = older.state.deliveryAt; expect(gradeArtifactSearch(older).passed).toBe(false); });
});
