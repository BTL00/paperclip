import type { ChatCatalogCase, ChatCatalogGrade } from "./chat-catalog-contract.js";
import type { ChatIssue, ChatRun } from "./chat-flow.js";
export function chatCatalogAllowedRunStatuses(implementation: Pick<ChatCatalogCase, "runPolicy">): string[] {
  const policy = implementation.runPolicy;
  return policy?.kind === "terminal-counts" ? Object.keys(policy.terminalStatusCounts)
    : policy?.kind === "source-settled-with-active-work" ? ["queued", "running", "succeeded"] : ["succeeded"];
}
export function gradeChatCatalogRuns(input: {
  implementation: Pick<ChatCatalogCase, "expectedRunCount" | "minimumRunCount" | "runPolicy">;
  companyId: string; leadId: string; source?: ChatIssue; runs: ChatRun[];
}): ChatCatalogGrade {
  const { implementation: c, runs, source } = input;
  const checks = [
    { id: "catalog-bounded-native-runs", passed: runs.length >= (c.minimumRunCount ?? c.expectedRunCount) && runs.length <= c.expectedRunCount
      && runs.every(run => run.companyId === input.companyId && run.runtimeMode === "native" && chatCatalogAllowedRunStatuses(c).includes(run.status)),
      detail: "Observed provider runs satisfy declared count, company, native runtime and allowed outcome bounds." },
  ];
  if (c.runPolicy?.kind === "terminal-counts") {
    checks.push({ id: "catalog-exact-run-outcomes", passed: Object.entries(c.runPolicy.terminalStatusCounts).every(([status, count]) => runs.filter(run => run.status === status).length === count),
      detail: "The independently observed ledger matches every declared successful/cancelled/failed terminal outcome count." });
  } else if (c.runPolicy?.kind === "source-settled-with-active-work") {
    const taskId = (run: ChatRun) => (run as ChatRun & { nativeIssueId?: string }).nativeIssueId ?? run.contextSnapshot?.issueId;
    const sourceRuns = runs.filter(run => taskId(run) === source?.id);
    const workers = runs.filter(run => taskId(run) !== source?.id);
    checks.push({ id: "catalog-settled-source-separate-work", passed: !!source && source.companyId === input.companyId
      && source.conversationState === "waiting" && sourceRuns.length > 0 && sourceRuns.every(run => run.agentId === input.leadId && run.status === "succeeded")
      && workers.every(run => typeof taskId(run) === "string" && run.agentId !== input.leadId)
      && workers.filter(run => ["queued", "running"].includes(run.status)).length <= c.runPolicy.maximumActiveWorkerRuns,
      detail: "The CEO source is settled; unfinished worker runs are separately task-bound and bounded. The case oracle must additionally bind their exact task and assignee." });
  }
  return { passed: checks.every(check => check.passed), checks };
}
