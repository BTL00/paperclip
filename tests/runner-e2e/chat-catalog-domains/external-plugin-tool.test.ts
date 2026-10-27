import { describe, expect, it } from "vitest";
import { gradePluginTool, previewToolManifest } from "./external-plugin-tool.js";

function valid() {
  return {
    scenarioId: "plugins.use-plugin-tool", companyId: "company", leadId: "ceo", reply: "The website artifact is missing, so I cannot produce a new preview.",
    phaseReplies: [{ runId: "first", body: "Open the website preview." }, { runId: "second", body: "The website artifact is missing, so I cannot produce a new preview." }],
    runs: [{ id: "first", status: "succeeded" }, { id: "second", status: "succeeded" }],
    connections: [], profiles: [], secrets: [], endpoints: [], interactions: [], activity: [], links: [], humanQueries: [],
    state: { pluginReady: true, toolVisibleToAgent: true, artifactExistsBefore: true, artifactSha256: "actual-sha", projectId: "project", initialRunId: "first", initialPreviewLinkMatched: true, initialPreviewVisible: true, artifactRemovedBeforeRepeat: true,
      receipts: [{ runId: "first", companyId: "company", agentId: "ceo", projectId: "project", failed: false, sha256: "actual-sha" }, { runId: "second", companyId: "company", agentId: "ceo", projectId: "project", failed: true }],
    },
  };
}

describe("real admitted website preview contribution", () => {
  it("validates a supported page/tool package with no external credential requirement", () => {
    const manifest = previewToolManifest("paperclip.eval-preview-owned");
    expect(manifest.entrypoints.ui).toBe("./dist/ui");
    expect(manifest.ui?.slots?.[0]?.routePath).toMatch(/^preview-/);
    expect(manifest.tools?.[0]?.name).toBe("preview");
    expect(manifest.instanceConfigSchema).toBeUndefined();
    expect(manifest.jobs).toBeUndefined();
  });
  it("accepts the actual successful view and separately observed missing-artifact phase", () => expect(gradePluginTool(valid()).passed).toBe(true));
  it("rejects installed-only, wrong scope/phase/artifact and cached success evidence", () => {
    for (const mutate of [
      (o: ReturnType<typeof valid>) => { o.state.toolVisibleToAgent = false; },
      (o: ReturnType<typeof valid>) => { o.state.initialPreviewVisible = false; },
      (o: ReturnType<typeof valid>) => { o.state.receipts[0]!.companyId = "another-company"; },
      (o: ReturnType<typeof valid>) => { o.state.receipts[0]!.projectId = "another-project"; },
      (o: ReturnType<typeof valid>) => { o.state.receipts[0]!.sha256 = "stale-artifact"; },
      (o: ReturnType<typeof valid>) => { o.state.receipts[1]!.runId = "first"; },
      (o: ReturnType<typeof valid>) => { o.state.receipts[1]!.failed = false; },
      (o: ReturnType<typeof valid>) => { o.phaseReplies[1]!.body = "The website is now ready despite a missing optional icon."; },
      (o: ReturnType<typeof valid>) => { o.phaseReplies[1]!.body = "Here is the website preview."; },
      (o: ReturnType<typeof valid>) => { o.runs[1]!.status = "failed"; },
    ]) { const o = valid(); mutate(o); expect(gradePluginTool(o).passed).toBe(false); }
    expect(gradePluginTool(undefined).passed).toBe(false);
    expect(gradePluginTool({ reply: "Preview ready." }).passed).toBe(false);
  });
});
