import { internalChatCatalogCases } from "./chat-catalog-domains/internal.js";
import type { ChatCatalogCase } from "./chat-catalog-contract.js";
import { chatCatalogScenarios } from "./chat-catalog-inventory.js";

// Import domain arrays here only after they supply executable setup/action/oracle.
export const chatCatalogCases: readonly ChatCatalogCase[] = [...internalChatCatalogCases];
const known = new Set(chatCatalogScenarios.map(row => row.id));
const registered = new Map<string, ChatCatalogCase>();
for (const implementation of chatCatalogCases) {
  if (!known.has(implementation.scenarioId) || registered.has(implementation.scenarioId))
    throw new Error(`Unknown or duplicate chat implementation: ${implementation.scenarioId}`);
  if (typeof implementation.verifyResult !== "function" || !implementation.oracleVersion || !implementation.sourceFiles.length
    || implementation.expectedRunCount < 1 || implementation.turnTimeoutMs <= 0 || implementation.attemptTimeoutMs <= 0
    || (implementation.minimumRunCount ?? implementation.expectedRunCount) > implementation.expectedRunCount)
    throw new Error(`Incomplete bounds/provenance for ${implementation.scenarioId}`);
  registered.set(implementation.scenarioId, implementation);
}
export function findChatCatalogCase(scenarioId: string): ChatCatalogCase | undefined { return registered.get(scenarioId); }
