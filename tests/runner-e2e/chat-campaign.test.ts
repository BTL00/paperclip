import { expect, it } from "vitest";
import { campaignSummary, completeCampaignAttempt, freezeChatCampaign, reserveCampaignAttempt, validateFrozenCampaign, type CampaignAttempt } from "./chat-campaign.js";
const root = new URL("../../", import.meta.url).pathname;
const base = "8373d7867963674ff960d2345d0d28086f799bc7";
function attempt(ordinal: 1 | 2, executionId: string): CampaignAttempt {
  return { ordinal, outcome: "running", executionId, startedAt: new Date().toISOString(), finishedAt: null,
    sourceRevision: base, workingTreeDigest: "fixture", definitionDigest: "fixture", suiteDefinitionDigest: "fixture", graderDigest: "fixture",
    model: "fixture", profile: "fixture", environment: "local", automaticRetries: 0,
    correction: ordinal === 2 ? "Demonstrated fixture defect corrected" : null, classification: null, observedFailure: null,
    evidencePaths: [], usage: { costUsd: null, coverage: "unknown", tokens: null }, cleanup: "pending", corePrDependencies: [] };
}
it("freezes all intended requests and keeps unrun scenarios in the denominator", () => {
  const campaign = freezeChatCampaign(root, base);
  expect(campaign.scenarios).toHaveLength(244);
  expect(campaign.areas).toBe(35);
  expect(campaign.capabilities).toBe(191);
  expect(campaign.scenarios.every(scenario => scenario.query && scenario.context && scenario.expected_outcome)).toBe(true);
  expect(campaignSummary(campaign)).toMatchObject({ denominator: 244, unrun: 244, finalPassed: 0, requiredPasses: 196, mergeEligible: false });
});
it("preserves failures and enforces one correction cycle with no retries after passing", () => {
  const scenario = freezeChatCampaign(root, base).scenarios.find(scenario => scenario.id === "tasks.create-backlog")!;
  const first = attempt(1, scenario.executionId!);
  reserveCampaignAttempt(scenario, first);
  expect(() => reserveCampaignAttempt(scenario, attempt(2, scenario.executionId!))).toThrow("still running");
  first.outcome = "failed";
  expect(() => reserveCampaignAttempt(scenario, { ...attempt(2, scenario.executionId!), correction: null })).toThrow("recorded correction");
  const second = attempt(2, scenario.executionId!);
  reserveCampaignAttempt(scenario, second);
  second.outcome = "passed";
  expect(scenario.attempts[0]!.outcome).toBe("failed");
  expect(() => reserveCampaignAttempt(scenario, attempt(2, scenario.executionId!))).toThrow("budget exhausted");
  const fresh = freezeChatCampaign(root, base).scenarios.find(scenario => scenario.id === "tasks.create-backlog")!;
  const pass = attempt(1, fresh.executionId!);
  reserveCampaignAttempt(fresh, pass); pass.outcome = "passed";
  expect(() => reserveCampaignAttempt(fresh, attempt(2, fresh.executionId!))).toThrow("cannot be rerun");
});
it("excludes unmerged core-dependent and unclean results from the merge numerator", () => {
  const campaign = freezeChatCampaign(root, base);
  const scenario = campaign.scenarios.find(scenario => scenario.id === "tasks.create-backlog")!;
  scenario.qualifyingDefinitionDigest = "fixture"; scenario.qualifyingGraderDigest = "fixture";
  const result = attempt(1, scenario.executionId!); reserveCampaignAttempt(scenario, result);
  result.outcome = "passed";
  expect(campaignSummary(campaign).finalPassed).toBe(0);
  result.cleanup = "passed"; result.corePrDependencies = ["https://github.com/example/core/pull/1"];
  expect(campaignSummary(campaign).finalPassed).toBe(0);
  result.corePrDependencies = [];
  expect(campaignSummary(campaign).finalPassed).toBe(1);
  scenario.qualifyingDefinitionDigest = "new revision";
  expect(campaignSummary(campaign).finalPassed).toBe(0);
});

it("rejects missing evidence and definition drift before accepting a retained outcome", () => {
  const campaign = freezeChatCampaign(root, base);
  const scenario = campaign.scenarios.find(scenario => scenario.id === "tasks.create-backlog")!;
  scenario.qualifyingDefinitionDigest = "fixture"; scenario.qualifyingGraderDigest = "fixture";
  const reserved = attempt(1, scenario.executionId!); reserveCampaignAttempt(scenario, reserved);
  const completion = { outcome: "passed" as const, finishedAt: new Date().toISOString(), definitionDigest: "fixture", graderDigest: "fixture",
    evidencePaths: [] as string[], cleanup: "passed" as const, usage: reserved.usage, classification: null, observedFailure: null, corePrDependencies: [] };
  expect(() => completeCampaignAttempt(scenario, completion)).toThrow("requires evidence");
  expect(() => completeCampaignAttempt(scenario, { ...completion, definitionDigest: "changed" })).toThrow("changed during attempt");
  expect(() => completeCampaignAttempt(scenario, { ...completion, evidencePaths: ["tests/runner-e2e/results/../private.json"] })).toThrow("sanitized result paths");
  completeCampaignAttempt(scenario, { ...completion, evidencePaths: ["tests/runner-e2e/results/fixture/result.json"] });
  expect(campaignSummary(campaign).finalPassed).toBe(1);
  scenario.qualifyingDefinitionDigest = "new revision";
  expect(campaignSummary(campaign).finalPassed).toBe(0);
});

it("detects catalog tampering while permitting honest readiness and ownership updates", () => {
  const campaign = freezeChatCampaign(root, base);
  campaign.scenarios[0]!.owner = "another-worker";
  campaign.scenarios[0]!.blocker = "external prerequisite missing";
  expect(() => validateFrozenCampaign(campaign, root)).not.toThrow();
  campaign.scenarios[0]!.expected_outcome = "A weaker outcome";
  expect(() => validateFrozenCampaign(campaign, root)).toThrow("Frozen scenario content changed");
});

it("does not turn partial implementations or automatic retries into valid campaign attempts", () => {
  const scenario = freezeChatCampaign(root, base).scenarios.find(scenario => scenario.id === "tasks.create-backlog")!;
  scenario.readiness = "partial";
  expect(() => reserveCampaignAttempt(scenario, attempt(1, scenario.executionId!))).toThrow("no executable implementation");
  scenario.readiness = "implemented";
  const invalid = { ...attempt(1, scenario.executionId!), automaticRetries: 1 } as unknown as CampaignAttempt;
  expect(() => reserveCampaignAttempt(scenario, invalid)).toThrow("Invalid attempt reservation");
  expect(scenario.attempts).toHaveLength(0);
});
