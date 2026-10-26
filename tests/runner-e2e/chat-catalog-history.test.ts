import { expect, it } from "vitest";
import { chatCatalogHumanHistoryMatches, validChatCatalogHumanCounts } from "./chat-catalog-contract.js";
it("binds the canonical request after genuine setup history and retains native setup run identities", () => {
  const input = { implementation: { setupHumanMessageCount: 1, expectedHumanMessageCount: 2 },
    human: [{ id: "setup", body: "Remember this detail" }, { id: "query", body: "Use the detail" }],
    runIds: ["setup-run", "query-run"], boundary: { humanCommentIds: ["setup"], runIds: ["setup-run"] }, renderedQuery: "Use the detail" };
  expect(chatCatalogHumanHistoryMatches(input)).toBe(true);
  expect(chatCatalogHumanHistoryMatches({ ...input, human: [...input.human].reverse() })).toBe(false);
  expect(chatCatalogHumanHistoryMatches({ ...input, runIds: ["query-run"] })).toBe(false);
  expect(chatCatalogHumanHistoryMatches({ ...input, boundary: { ...input.boundary, humanCommentIds: ["injected"] } })).toBe(false);
  expect(chatCatalogHumanHistoryMatches({ ...input, human: [...input.human, { id: "hidden", body: "Please finish" }] })).toBe(false);
});
it("preserves zero-setup semantics and refuses impossible setup/total declarations", () => {
  expect(chatCatalogHumanHistoryMatches({ implementation: {}, human: [{ id: "query", body: "Original query" }], runIds: ["run"], boundary: { humanCommentIds: [], runIds: [] }, renderedQuery: "Original query" })).toBe(true);
  expect(validChatCatalogHumanCounts({ setupHumanMessageCount: 1, expectedHumanMessageCount: 1 })).toBe(false);
  expect(validChatCatalogHumanCounts({ setupHumanMessageCount: -1 })).toBe(false);
  expect(validChatCatalogHumanCounts({ setupHumanMessageCount: 0.5 })).toBe(false);
  expect(validChatCatalogHumanCounts({ setupHumanMessageCount: 0, expectedHumanMessageCount: 0, queryOutcome: "rejected" })).toBe(true);
});
