import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseDocument } from "yaml";

export const CHAT_CAMPAIGN_MANIFEST = "tests/runner-e2e/chat-campaign-manifest.json";
export type CampaignOutcome = "passed" | "failed" | "blocked";
export interface CampaignAttempt {
  ordinal: 1 | 2;
  outcome: CampaignOutcome | "running";
  executionId: string;
  startedAt: string;
  finishedAt: string | null;
  sourceRevision: string;
  workingTreeDigest: string;
  definitionDigest: string;
  suiteDefinitionDigest: string;
  graderDigest: string;
  model: string;
  profile: string;
  environment: string;
  automaticRetries: 0;
  correction: string | null;
  classification: string | null;
  observedFailure: string | null;
  evidencePaths: string[];
  usage: { costUsd: number | null; coverage: string; tokens: number | null };
  cleanup: "pending" | "passed" | "failed" | "not_started";
  corePrDependencies: string[];
}
export interface CampaignScenario {
  id: string; feature: string; sourceFile: string; sourceSha256: string;
  capabilities: string[]; context: string; query: string; expected_outcome: string;
  scenarioSha256: string;
  qualifyingDefinitionDigest: string | null;
  qualifyingGraderDigest: string | null;
  owner: string;
  readiness: "unimplemented" | "partial" | "implemented" | "blocked";
  executionId: string | null;
  blocker: string | null;
  attempts: CampaignAttempt[];
}
export interface ChatCampaign {
  version: 1; campaignId: string; frozenAt: string; baselineRevision: string;
  inventoryDigest: string; defaultsSha256: string;
  denominator: number; areas: number; capabilities: number;
  requiredPasses: number;
  corePrs: string[]; evalPr: string | null;
  scenarios: CampaignScenario[];
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function freezeChatCampaign(root: string, baselineRevision: string): ChatCampaign {
  const directory = path.join(root, "tests/runner-e2e/chat-scenarios");
  const scenarios: CampaignScenario[] = [];
  const files = readdirSync(directory).filter(name => name.endsWith(".yaml") && name !== "defaults.yaml").sort();
  for (const file of files) {
    const text = readFileSync(path.join(directory, file), "utf8");
    const document = parseDocument(text, { uniqueKeys: true });
    if (document.errors.length) throw new Error(`Invalid catalog ${file}`);
    const value = document.toJS();
    for (const scenario of value.scenarios) {
      const canonical = { id: scenario.id, capabilities: scenario.capabilities, context: scenario.context, query: scenario.query, expected_outcome: scenario.expected_outcome };
      if (scenarios.some(entry => entry.id === scenario.id)) throw new Error(`Duplicate scenario ${scenario.id}`);
      const legacy = ["tasks.create-backlog", "tasks.delegate-announcement"].includes(scenario.id);
      scenarios.push({ ...canonical, feature: value.feature, sourceFile: `tests/runner-e2e/chat-scenarios/${file}`,
        sourceSha256: digest(text), scenarioSha256: digest(JSON.stringify(canonical)),
        qualifyingDefinitionDigest: null, qualifyingGraderDigest: null,
        owner: legacy ? "eval_integrator" : "unassigned", readiness: legacy ? "implemented" : "unimplemented",
        executionId: legacy ? `chat-features.runner-codex-subscription.local.${scenario.id.slice(6)}` : null,
        blocker: null, attempts: [] });
    }
  }
  scenarios.sort((a, b) => a.id.localeCompare(b.id));
  const capabilities = new Set(scenarios.flatMap(scenario => scenario.capabilities)).size;
  if (scenarios.length !== 244 || files.length !== 35 || capabilities !== 191) throw new Error("Frozen denominator changed; reconcile explicitly");
  const defaultsSha256 = digest(readFileSync(path.join(directory, "defaults.yaml"), "utf8"));
  return { version: 1, campaignId: "chat-catalog-2026-10-26", frozenAt: new Date().toISOString(), baselineRevision,
    inventoryDigest: digest(JSON.stringify({ defaultsSha256, scenarios: scenarios.map(({ id, scenarioSha256, sourceSha256 }) => ({ id, scenarioSha256, sourceSha256 })) })),
    defaultsSha256, denominator: scenarios.length, areas: files.length, capabilities, requiredPasses: Math.ceil(scenarios.length * 0.8), corePrs: [], evalPr: null, scenarios };
}
export function validateFrozenCampaign(campaign: ChatCampaign, root: string): void {
  const fresh = freezeChatCampaign(root, campaign.baselineRevision);
  if (campaign.version !== 1 || campaign.denominator !== 244 || campaign.areas !== 35 || campaign.capabilities !== 191
    || campaign.requiredPasses !== 196 || campaign.scenarios.length !== 244 || campaign.defaultsSha256 !== fresh.defaultsSha256
    || campaign.inventoryDigest !== fresh.inventoryDigest) throw new Error("Frozen campaign inventory metadata changed");
  for (let index = 0; index < campaign.scenarios.length; index++) {
    const actual = campaign.scenarios[index]!; const expected = fresh.scenarios[index]!;
    for (const field of ["id", "feature", "sourceFile", "sourceSha256", "scenarioSha256", "capabilities", "context", "query", "expected_outcome"] as const) {
      if (JSON.stringify(actual[field]) !== JSON.stringify(expected[field])) throw new Error(`Frozen scenario content changed: ${expected.id}`);
    }
    if (actual.attempts.length > 2 || actual.attempts.some((attempt, attemptIndex) => attempt.ordinal !== attemptIndex + 1 || attempt.automaticRetries !== 0)) throw new Error(`Invalid attempt history: ${actual.id}`);
  }
}
export function reserveCampaignAttempt(scenario: CampaignScenario, attempt: CampaignAttempt): void {
  if (scenario.readiness !== "implemented" || !scenario.executionId) throw new Error("Scenario has no executable implementation");
  if (scenario.attempts.some(entry => entry.outcome === "running")) throw new Error("Previous attempt still running");
  if (scenario.attempts.length >= 2 || attempt.ordinal !== scenario.attempts.length + 1) throw new Error("Attempt budget exhausted or incorrect ordinal");
  if (scenario.attempts[0]?.outcome === "passed") throw new Error("Passing scenario cannot be rerun");
  if (attempt.ordinal === 2 && !attempt.correction?.trim()) throw new Error("Fix cycle requires a recorded correction");
  if (attempt.automaticRetries !== 0 || attempt.executionId !== scenario.executionId || attempt.outcome !== "running") throw new Error("Invalid attempt reservation");
  if ([attempt.sourceRevision, attempt.workingTreeDigest, attempt.definitionDigest, attempt.suiteDefinitionDigest, attempt.graderDigest, attempt.model, attempt.profile, attempt.environment].some(value => !value.trim())) throw new Error("Missing attempt provenance");
  scenario.attempts.push(attempt);
}
export function completeCampaignAttempt(scenario: CampaignScenario, completion: {
  outcome: CampaignOutcome; finishedAt: string; definitionDigest: string; graderDigest: string;
  evidencePaths: string[]; cleanup: CampaignAttempt["cleanup"]; usage: CampaignAttempt["usage"];
  classification: string | null; observedFailure: string | null; corePrDependencies: string[];
}): void {
  const attempt = scenario.attempts.at(-1);
  if (!attempt || attempt.outcome !== "running") throw new Error("No running reserved attempt");
  if (completion.definitionDigest !== attempt.definitionDigest || completion.graderDigest !== attempt.graderDigest) throw new Error("Definition or grader changed during attempt");
  if (completion.evidencePaths.some(value => !value.startsWith("tests/runner-e2e/results/") || value.split("/").includes(".."))) throw new Error("Evidence must use retained sanitized result paths");
  if (completion.outcome === "passed" && (!completion.evidencePaths.length || completion.cleanup !== "passed")) throw new Error("Pass requires evidence and successful cleanup");
  if (Date.parse(completion.finishedAt) < Date.parse(attempt.startedAt) || !Number.isFinite(Date.parse(completion.finishedAt))) throw new Error("Invalid completion timing");
  Object.assign(attempt, completion);
}
export function campaignSummary(campaign: ChatCampaign) {
  const initialPassed = campaign.scenarios.filter(scenario => { const first = scenario.attempts[0]; return first?.outcome === "passed" && first.cleanup === "passed" && first.corePrDependencies.length === 0; }).length;
  const passed = campaign.scenarios.filter(scenario => { const final = scenario.attempts.at(-1); return final?.outcome === "passed" && final.corePrDependencies.length === 0 && final.cleanup === "passed" && final.definitionDigest === scenario.qualifyingDefinitionDigest && final.graderDigest === scenario.qualifyingGraderDigest; }).length;
  const attempted = campaign.scenarios.filter(scenario => scenario.attempts.length).length;
  const implemented = campaign.scenarios.filter(scenario => scenario.readiness === "implemented").length;
  return { denominator: campaign.denominator, implemented, attempted, unrun: campaign.denominator - attempted,
    initialPassed, finalPassed: passed, firstAttemptRate: initialPassed / campaign.denominator,
    finalRate: passed / campaign.denominator, requiredPasses: campaign.requiredPasses,
    mergeEligible: implemented === campaign.denominator && attempted === campaign.denominator && passed >= campaign.requiredPasses && !campaign.scenarios.some(scenario => scenario.attempts.some(attempt => attempt.outcome === "running")) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, baseline] = process.argv.slice(2);
  if (command === "freeze" && baseline) {
    writeFileSync(CHAT_CAMPAIGN_MANIFEST, `${JSON.stringify(freezeChatCampaign(process.cwd(), baseline), null, 2)}\n`, { flag: "wx" });
  } else if (command !== "summary") throw new Error("Usage: chat-campaign.ts freeze <baseline> | summary");
  const campaign = JSON.parse(readFileSync(CHAT_CAMPAIGN_MANIFEST, "utf8")) as ChatCampaign;
  validateFrozenCampaign(campaign, process.cwd());
  process.stdout.write(`${JSON.stringify({ inventoryDigest: campaign.inventoryDigest, ...campaignSummary(campaign) }, null, 2)}\n`);
}
