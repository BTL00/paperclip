import { readFileSync } from "node:fs";
import type { ChatCatalogCase } from "./chat-catalog-contract.js";
import { chatCatalogScenarios } from "./chat-catalog-inventory.js";
import type { IdentityBoundaryCase } from "./chat-catalog-domains/identity-boundary-contract.js";

export type ChatCatalogDescriptor = Omit<ChatCatalogCase, "journeyKind" | "setup" | "act" | "observe" | "grade" | "cleanup" | "verifyResult" | "verifySetup" | "verifyQueryRejection"> & {
  journeyKind?: "agent-chat" | "browser-boundary";
  boundaryTarget?: "authenticated-harness" | "empty-installed-target";
  modulePath: string;
  exportName: string;
};
/** Pure discovery metadata. Importing the catalog never evaluates a domain module. */
export const chatCatalogCases: readonly ChatCatalogDescriptor[] = JSON.parse(
  readFileSync(new URL("./chat-catalog-descriptors.json", import.meta.url), "utf8"),
);
const known = new Set(chatCatalogScenarios.map(row => row.id));
export function findChatCatalogCase(scenarioId: string): ChatCatalogDescriptor | undefined {
  const matches = chatCatalogCases.filter(row => row.scenarioId === scenarioId);
  if (matches.length > 1) throw new Error(`Duplicate chat implementation: ${scenarioId}`);
  const descriptor = matches[0];
  if (!descriptor) return;
  if (!known.has(scenarioId) || !descriptor.oracleVersion || !descriptor.sourceFiles.length
    || !/^\.\/chat-catalog-domains\/[a-z0-9-]+\.js$/.test(descriptor.modulePath)
    || !descriptor.exportName || descriptor.expectedRunCount < 0 || descriptor.turnTimeoutMs <= 0 || descriptor.attemptTimeoutMs <= 0
    || (descriptor.minimumRunCount ?? descriptor.expectedRunCount) > descriptor.expectedRunCount)
    throw new Error(`Incomplete bounds/provenance for ${scenarioId}`);
  return descriptor;
}
export async function loadChatCatalogImplementation(
  descriptor: ChatCatalogDescriptor,
  importer: (specifier: string) => Promise<Record<string, unknown>> = specifier => import(specifier),
): Promise<ChatCatalogCase> {
  if (descriptor.journeyKind === "browser-boundary") throw new Error("Browser boundary cannot enter ordinary Agent Chat dispatch");
  // The sole dynamic import boundary: only the selected descriptor's module executes.
  const module = await importer(new URL(descriptor.modulePath, import.meta.url).href);
  const implementations = module[descriptor.exportName];
  if (!Array.isArray(implementations)) throw new Error(`Missing domain export: ${descriptor.exportName}`);
  const selected = implementations.filter((row: ChatCatalogCase) => row.scenarioId === descriptor.scenarioId);
  if (selected.length !== 1) throw new Error(`Missing or duplicate runtime case: ${descriptor.scenarioId}`);
  const implementation = selected[0] as ChatCatalogCase;
  for (const key of ["sourceFiles", "oracleVersion", "expectedRunCount", "minimumRunCount", "expectedHumanMessageCount", "turnTimeoutMs", "attemptTimeoutMs", "coverageGaps", "journeyKind", "authentication", "setupPolicy", "runPolicy", "queryOutcome", "queryBindings"] as const) {
    if (JSON.stringify(implementation[key]) !== JSON.stringify(descriptor[key])) throw new Error(`Runtime descriptor drift: ${descriptor.scenarioId}.${key}`);
  }
  if ((descriptor.setupPolicy?.funding === "preserve-scenario" || descriptor.setupPolicy?.readiness === "preserve-scenario")
    && (!descriptor.setupPolicy.invariantCheckIds.length || typeof implementation.verifySetup !== "function"))
    throw new Error("Scenario-specific setup policy requires independent prerequisite assertions");
  if (descriptor.queryOutcome === "rejected" && typeof implementation.verifyQueryRejection !== "function")
    throw new Error("Rejected chat query requires independent rejection evidence");
  if ([implementation.setup, implementation.observe, implementation.grade, implementation.verifyResult].some(value => typeof value !== "function"))
    throw new Error(`Incomplete executable case: ${descriptor.scenarioId}`);
  return implementation;
}

/** Separate typed dispatch: no company, agent, or ChatFlowInput is fabricated. */
export async function loadIdentityBoundaryImplementation(descriptor: ChatCatalogDescriptor,
  importer: (specifier: string) => Promise<Record<string, unknown>> = specifier => import(specifier)): Promise<IdentityBoundaryCase> {
  if (descriptor.journeyKind !== "browser-boundary" || !["access.sign-in", "onboarding.new-instance", "onboarding.choose-first-runtime", "onboarding.resume-wizard"].includes(descriptor.scenarioId))
    throw new Error("Only explicit catalog browser boundaries may bypass Agent Chat prerequisites");
  if (descriptor.expectedRunCount !== 0 || (descriptor.minimumRunCount ?? 0) !== 0 || descriptor.expectedHumanMessageCount !== 0)
    throw new Error("Pre-chat boundaries require zero agent admissions and zero persisted chat queries");
  const module = await importer(new URL(descriptor.modulePath, import.meta.url).href);
  const rows = module[descriptor.exportName];
  const selected = Array.isArray(rows) ? rows.filter(row => row.scenarioId === descriptor.scenarioId) : [];
  if (selected.length !== 1) throw new Error("Missing or duplicate browser boundary implementation");
  const implementation = selected[0] as IdentityBoundaryCase;
  for (const key of ["sourceFiles", "oracleVersion", "expectedRunCount", "minimumRunCount", "expectedHumanMessageCount", "turnTimeoutMs", "attemptTimeoutMs", "coverageGaps", "journeyKind", "boundaryTarget", "authentication", "setupPolicy", "runPolicy", "queryOutcome", "queryBindings"] as const) {
    if (JSON.stringify(implementation[key]) !== JSON.stringify(descriptor[key])) throw new Error(`Runtime boundary descriptor drift: ${descriptor.scenarioId}.${key}`);
  }
  if ([implementation.run, implementation.grade, implementation.cleanup].some(value => typeof value !== "function") || descriptor.queryBindings?.length
    || !["authenticated-harness", "empty-installed-target"].includes(String(descriptor.boundaryTarget)))
    throw new Error("Boundary requires executable outcome, independent grade and cleanup; query bindings are Agent Chat only");
  return implementation;
}
