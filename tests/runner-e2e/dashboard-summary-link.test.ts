import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { renderRunnerE2EDashboard } from "./dashboard.js";
import { regenerateRunnerDashboard } from "./dashboard-regenerate.js";
import { buildRunnerCampaign } from "./history.js";

const campaign = () => buildRunnerCampaign({ campaignId: "summary-link-fixture", generatedAt: "2026-10-27T00:00:00Z", expected: [], results: [] });
it("offers only the fixed relative summary link when a campaign summary is available", () => {
  const input = { title: "Campaign", generatedAt: "2026-10-27T00:00:00Z", expected: [], catalog: [], entries: [], campaign: campaign() };
  expect(renderRunnerE2EDashboard({ ...input, summaryAvailable: true })).toContain('<a href="summary.md">Campaign summary ↗</a>');
  expect(renderRunnerE2EDashboard(input)).not.toContain('href="summary.md"');
  expect(renderRunnerE2EDashboard({ ...input, campaign: undefined, summaryAvailable: true })).not.toContain('href="summary.md"');
});
it("regeneration derives link availability from the actual summary file without changing result identities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-summary-link-"));
  try {
    const before = campaign(); before.source.workflowRunUrl = "https://github.com/paperclipai/paperclip/actions/runs/123";
    await writeFile(path.join(root, "normalized-results.json"), JSON.stringify(before));
    await writeFile(path.join(root, "summary.md"), "# Historical partial fixture\n\nSix incomplete or blocked journeys.\n");
    await regenerateRunnerDashboard({ bundle: root, historyFile: null });
    const html = await readFile(path.join(root, "index.html"), "utf8");
    expect(html).toContain('href="summary.md"'); expect(html).toContain(before.source.workflowRunUrl);
    const after = JSON.parse(await readFile(path.join(root, "normalized-results.json"), "utf8"));
    expect(after.results).toEqual(before.results); expect(after.source).toEqual(before.source);
    expect(after.selected).toBe(before.selected);
    await rm(path.join(root, "summary.md"));
    await regenerateRunnerDashboard({ bundle: root, historyFile: null });
    expect(await readFile(path.join(root, "index.html"), "utf8")).not.toContain('href="summary.md"');
  } finally { await rm(root, { recursive: true, force: true }); }
});
