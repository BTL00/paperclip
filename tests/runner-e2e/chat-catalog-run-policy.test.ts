import { expect, it } from "vitest";
import { gradeChatCatalogRuns } from "./chat-catalog-run-policy.js";
import type { ChatRun } from "./chat-flow.js";
const succeeded: ChatRun = { id: "source-run", companyId: "company", agentId: "ceo", status: "succeeded", runtimeMode: "native", contextSnapshot: { issueId: "source" } };
const worker: ChatRun = { id: "worker-run", companyId: "company", agentId: "worker", status: "running", runtimeMode: "native", contextSnapshot: { issueId: "task" } };
const scope = { companyId: "company", leadId: "ceo", source: { id: "source", companyId: "company", title: "Chat", status: "in_review", conversationState: "waiting" } };
it("requires successful native work by default and exact declared cancellation counts", () => {
  expect(gradeChatCatalogRuns({ ...scope, implementation: { expectedRunCount: 1 }, runs: [succeeded] }).passed).toBe(true);
  const cancelled = { ...succeeded, status: "cancelled" };
  expect(gradeChatCatalogRuns({ ...scope, implementation: { expectedRunCount: 1 }, runs: [cancelled] }).passed).toBe(false);
  const implementation = { expectedRunCount: 1, runPolicy: { kind: "terminal-counts" as const, terminalStatusCounts: { cancelled: 1 } } };
  expect(gradeChatCatalogRuns({ ...scope, implementation, runs: [cancelled] }).passed).toBe(true);
  expect(gradeChatCatalogRuns({ ...scope, implementation, runs: [succeeded] }).passed).toBe(false);
});
it("admits declared separate active work while rejecting active CEO, wrong scope, unbound and excess work", () => {
  const implementation = { expectedRunCount: 2, runPolicy: { kind: "source-settled-with-active-work" as const, maximumActiveWorkerRuns: 1 } };
  expect(gradeChatCatalogRuns({ ...scope, implementation, runs: [succeeded, worker] }).passed).toBe(true);
  for (const bad of [{ ...succeeded, status: "running" }, { ...worker, companyId: "other" }, { ...worker, contextSnapshot: {} }, { ...worker, agentId: "ceo" }])
    expect(gradeChatCatalogRuns({ ...scope, implementation, runs: [succeeded, bad] }).passed).toBe(false);
  expect(gradeChatCatalogRuns({ ...scope, implementation, runs: [succeeded, worker, { ...worker, id: "extra" }] }).passed).toBe(false);
});
