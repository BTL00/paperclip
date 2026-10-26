import { readFileSync } from "node:fs";
import type { ChatCatalogCase } from "./chat-catalog-contract.js";
import { chatCatalogScenarios } from "./chat-catalog-inventory.js";

export type ChatCatalogDescriptor = Omit<ChatCatalogCase, "setup" | "act" | "observe" | "grade" | "cleanup" | "verifyResult" | "verifySetup" | "verifyQueryRejection"> & {
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
  // The sole dynamic import boundary: only the selected descriptor's module executes.
  const module = await importer(new URL(descriptor.modulePath, import.meta.url).href);
  const implementations = module[descriptor.exportName];
  if (!Array.isArray(implementations)) throw new Error(`Missing domain export: ${descriptor.exportName}`);
  const selected = implementations.filter((row: ChatCatalogCase) => row.scenarioId === descriptor.scenarioId);
  if (selected.length !== 1) throw new Error(`Missing or duplicate runtime case: ${descriptor.scenarioId}`);
  const implementation = selected[0] as ChatCatalogCase;
  for (const key of ["sourceFiles", "oracleVersion", "expectedRunCount", "minimumRunCount", "expectedHumanMessageCount", "turnTimeoutMs", "attemptTimeoutMs", "coverageGaps", "journeyKind", "authentication", "setupPolicy", "runPolicy", "queryOutcome"] as const) {
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
