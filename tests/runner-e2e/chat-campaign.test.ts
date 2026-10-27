import { expect, it } from "vitest";
import { campaignSummary, completeCampaignAttempt, freezeChatCampaign, reserveCampaignAttempt, validateFrozenCampaign, type CampaignAttempt, campaignProductIdentityEligible, type CampaignPublishedIdentity } from "./chat-campaign.js";
const root = new URL("../../", import.meta.url).pathname;
const base = "8373d7867963674ff960d2345d0d28086f799bc7";
function attempt(ordinal: 1 | 2, executionId: string): CampaignAttempt {
  return { productIdentity: { kind: "source-build", productionSourceRevision: base, snapshotSourceRevision: base, nativeBinarySha256: "a".repeat(64), workspaceBuildDigest: "b".repeat(64), receiptPaths: ["tests/runner-e2e/results/fixture/source-receipt.json"], coreCandidate: false }, ordinal, outcome: "running", executionId, startedAt: new Date().toISOString(), finishedAt: null,
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

it("gates source acceptance on actual baseline/build receipts, not merely test source revision", () => {
  const campaign = freezeChatCampaign(root, base), scenario = campaign.scenarios.find(s => s.id === "tasks.create-backlog")!;
  const valid = attempt(1, scenario.executionId!);
  expect(campaignProductIdentityEligible(scenario, valid, base)).toBe(true);
  expect(campaignProductIdentityEligible(scenario, { ...valid, productIdentity: undefined }, base)).toBe(false);
  for (const delta of [{ productionSourceRevision: "c".repeat(40) }, { nativeBinarySha256: "" }, { snapshotSourceRevision: "d".repeat(40) }, { coreCandidate: true }, { receiptPaths: [] }]) {
    const product = { ...valid.productIdentity!, ...delta } as CampaignAttempt["productIdentity"];
    expect(campaignProductIdentityEligible(scenario, { ...valid, productIdentity: product }, base)).toBe(false);
  }
});
it("admits declared published operator transitions but rejects wrong observed targets and arbitrary installed substitution", () => {
  const campaign = freezeChatCampaign(root, base), scenario = campaign.scenarios.find(s => s.id === "instance-operations.update-instance")!;
  const publication = (version: string, h: string): CampaignPublishedIdentity => ({ version, treeSha256: h.repeat(64), artifacts: ["paperclipai", "@paperclipai/server"].map(name => ({ package: name as "paperclipai" | "@paperclipai/server", version, integrity: "sha512-YWJj", entrySha256: h.repeat(64) })) });
  const source = publication("1.0.0", "a"), target = publication("1.0.1", "b");
  const valid: CampaignAttempt = { ...attempt(1, "installed"), productIdentity: { kind: "published-release", declaredLane: "published-global-npm", source, target, observed: target, receiptPaths: ["tests/runner-e2e/results/fixture/installed.json"], coreCandidate: false } };
  expect(campaignProductIdentityEligible(scenario, valid, base)).toBe(true);
  expect(campaignProductIdentityEligible(scenario, { ...valid, productIdentity: { ...valid.productIdentity as Extract<CampaignAttempt["productIdentity"], { kind: "published-release" }>, observed: source } }, base)).toBe(false);
  const unrelated = campaign.scenarios.find(s => s.id === "tasks.create-backlog")!;
  expect(campaignProductIdentityEligible(unrelated, valid, base)).toBe(false);
  expect(campaignProductIdentityEligible({ ...scenario, productPolicy: undefined }, valid, base)).toBe(false);
  expect(campaignProductIdentityEligible(scenario, { ...valid, corePrDependencies: ["unmerged-core"] }, base)).toBe(false);
  const boundary = campaign.scenarios.find(s => s.id === "onboarding.new-instance")!;
  const installed = { ...valid, productIdentity: { kind: "published-release" as const, declaredLane: "empty-installed-boundary" as const, source, observed: source, receiptPaths: ["tests/runner-e2e/results/fixture/published-boundary.json"], coreCandidate: false } };
  expect(campaignProductIdentityEligible(boundary, installed, base)).toBe(true);
  const sourceBuilt = { ...attempt(1, "boundary"), productIdentity: { kind: "source-built-installed" as const, productionSourceRevision: base, snapshotSourceRevision: base, nativeBinarySha256: "a".repeat(64), workspaceBuildDigest: "b".repeat(64), cliSha256: "c".repeat(64), serverSha256: "d".repeat(64), artifactTreeSha256: "e".repeat(64), receiptPaths: ["tests/runner-e2e/results/fixture/source-pack.json"], coreCandidate: false } };
  expect(campaignProductIdentityEligible(boundary, sourceBuilt, base)).toBe(true);
  expect(campaignProductIdentityEligible(scenario, sourceBuilt, base)).toBe(false);
});
it("does not complete or report a qualifying pass when its product identity is missing", () => {
  const campaign = freezeChatCampaign(root, base), scenario = campaign.scenarios.find(s => s.id === "tasks.create-backlog")!;
  const reserved = attempt(1, scenario.executionId!); reserved.productIdentity = undefined;
  reserveCampaignAttempt(scenario, reserved);
  scenario.qualifyingDefinitionDigest = "fixture"; scenario.qualifyingGraderDigest = "fixture";
  const completion = { outcome: "passed" as const, finishedAt: new Date().toISOString(), definitionDigest: "fixture", graderDigest: "fixture", evidencePaths: ["tests/runner-e2e/results/fixture/result.json"], cleanup: "passed" as const, usage: reserved.usage, classification: null, observedFailure: null, corePrDependencies: [] };
  expect(() => completeCampaignAttempt(scenario, completion)).toThrow("eligible product identity");
  Object.assign(reserved, completion);
  expect(campaignSummary(campaign)).toMatchObject({ initialPassed: 0, finalPassed: 0, productEvidence: { identityIneligibleMeasurements: 1, measurementsByIdentity: { unknown: 1 } } });
});
