import { chatCatalogAllowedRunStatuses, gradeChatCatalogRuns } from "./chat-catalog-run-policy.js";
import { chatCatalogCaseFingerprint, normalizedChatCatalogExecution } from "./chat-catalog-fingerprint.js";
import { expect } from "@playwright/test";
import { pollUntil } from "./api.js";
import { collectChatRunEvidence, sendChatMessage } from "./chat-flow.js";
import { validateChatCatalogGrade, type ChatCatalogContext, type ChatCatalogGrade } from "./chat-catalog-contract.js";
import { findChatCatalogCase, loadChatCatalogImplementation } from "./chat-catalog-registry.js";
import { chatCatalogInventoryDigest } from "./chat-catalog-inventory.js";

/** The case owns product semantics; this flow owns the actual chat entry point and evidence lifecycle. */
export async function runChatCatalogFlow(context: ChatCatalogContext) {
  const { input, scenario } = context;
  const descriptor = findChatCatalogCase(scenario.id);
  if (!descriptor) throw new Error(`No executable chat scenario: ${scenario.id}`);
  const fingerprint = chatCatalogCaseFingerprint(descriptor, normalizedChatCatalogExecution(input.execution));
  const implementation = await loadChatCatalogImplementation(descriptor);
  const deadlineAt = Date.now() + implementation.attemptTimeoutMs - 30_000;
  let state: Record<string, unknown> | undefined;
  let observation: unknown;
  let grade: ChatCatalogGrade | undefined;
  let failed = false;
  async function conversation() {
    await context.refreshIssue();
    const issue = context.issue();
    const runs = await context.allRuns();
    const comments = issue ? await input.api.get<Array<{ id: string; body: string; authorAgentId?: string; createdByRunId?: string }>>(
      `/api/issues/${issue.id}/comments?order=asc`,
    ) : [];
    const renderedLinks = [];
    for (const comment of comments) {
      const reply = input.page.locator(`[id=${JSON.stringify(`comment-${comment.id}`)}]`);
      for (const href of await reply.locator("a[href]").evaluateAll(elements => elements.map(element => element.getAttribute("href"))))
        renderedLinks.push({ commentId: comment.id, href });
    }
    const evidence = { issue, runs, comments, renderedLinks };
    await input.evidence("chat-catalog-conversation.json", evidence);
    return evidence;
  }
  async function refresh() {
    const evidence = await conversation();
    observation = await implementation!.observe(context, state!);
    grade = validateChatCatalogGrade(implementation!.grade(observation));
    const human = evidence.comments.filter(comment => !comment.authorAgentId);
    const checks = [...grade.checks,
      { id: "catalog-complete-conditions", passed: !implementation!.coverageGaps?.length,
        detail: implementation!.coverageGaps?.length ? `Missing conditions: ${implementation!.coverageGaps.join(", ")}` : "No known catalog condition is omitted." },
      { id: "catalog-original-human-query", passed: (implementation!.queryOutcome === "rejected" ? human.length === 0 : human[0]?.body.trim() === scenario.query.trim()
        && human.length === (implementation!.expectedHumanMessageCount ?? 1)),
        detail: "The first persisted human message is the unchanged catalog request and all human turns were declared." },
      ...gradeChatCatalogRuns({ implementation: implementation!, companyId: input.fixtures.company.id,
        leadId: input.fixtures.agent.id, source: evidence.issue, runs: evidence.runs }).checks,
    ];
    grade = { passed: checks.every(check => check.passed), checks };
    await input.evidence("chat-catalog-observation.json", { scenarioId: scenario.id, inventoryDigest: chatCatalogInventoryDigest,
      oracleVersion: implementation!.oracleVersion, observation, grade });
    return { grade, runs: evidence.runs, issue: evidence.issue };
  }
  try {
    await input.evidence("chat-catalog-definition.json", { scenarioId: scenario.id, ...fingerprint,
      suiteDefinitionHash: input.execution.suiteDefinitionHash, journeyKind: "agent-chat" });
    state = await implementation.setup(context);
    const company = `/api/companies/${input.fixtures.company.id}`;
    const agents = await input.api.get<Array<{ id: string }>>(`${company}/agents`);
    if (implementation.setupPolicy?.readiness !== "preserve-scenario") for (const agent of agents) await pollUntil({ label: `catalog agent readiness ${agent.id}`,
      deadlineAt: Math.min(deadlineAt, Date.now() + 45_000), intervalMs: 500,
      load: () => input.api.get<{ lifecycleState: string; status: string; lifecycleError?: string }>(`/api/agents/${agent.id}`),
      accept: value => value.lifecycleState === "ready" && ["idle", "active"].includes(value.status),
      reject: value => value.lifecycleError ? "Agent setup failed; diagnostic details withheld" : undefined,
    });
    const scopes = [{ scopeType: "company", scopeId: input.fixtures.company.id },
      ...agents.map(agent => ({ scopeType: "agent", scopeId: agent.id }))];
    if (implementation.setupPolicy?.funding !== "preserve-scenario") for (const scope of scopes) await input.api.post(`${company}/budgets/policies`, { ...scope, amount: 500,
      hardStopEnabled: true, isActive: true, unpricedUsagePolicy: "allow" });
    const funding = await input.api.get<{ policies: Array<{ scopeType: string; scopeId: string; amount: number; hardStopEnabled: boolean; isActive: boolean; unpricedUsagePolicy: string }> }>(`${company}/budgets/overview`);
    if (implementation.setupPolicy?.funding !== "preserve-scenario") expect(scopes.every(scope => funding.policies.some(policy => policy.scopeType === scope.scopeType && policy.scopeId === scope.scopeId
      && policy.amount === 500 && policy.hardStopEnabled && policy.isActive && policy.unpricedUsagePolicy === "allow")), "Public funding policy persisted").toBe(true);
    await input.evidence("chat-catalog-funding.json", { scopes, mode: implementation.setupPolicy?.funding ?? "standard",
      policies: funding.policies.filter(policy => scopes.some(scope => scope.scopeType === policy.scopeType && scope.scopeId === policy.scopeId)), setupProbeUsage: "unknown; production hello probes are outside heartbeat accounting" });
    await input.evidence("chat-catalog-setup.json", { scenario, state, inventoryDigest: chatCatalogInventoryDigest,
      oracleVersion: implementation.oracleVersion, expectedRunCount: implementation.expectedRunCount,
      minimumRunCount: implementation.minimumRunCount, turnTimeoutMs: implementation.turnTimeoutMs,
      attemptTimeoutMs: implementation.attemptTimeoutMs });
    if (implementation.verifySetup) {
      const setupGrade = validateChatCatalogGrade(await implementation.verifySetup(context, state));
      await input.evidence("chat-catalog-prepared-state.json", setupGrade);
      expect(setupGrade.passed && (implementation.setupPolicy?.invariantCheckIds ?? []).every(id => setupGrade.checks.some(check => check.id === id && check.passed)), "Independent scenario prerequisites").toBe(true);
    }
    await input.evidence("chat-catalog-query.json", { query: scenario.query, expectedOutcome: implementation.queryOutcome ?? "persisted", journeyKind: "agent-chat" });
    await sendChatMessage(input.page, scenario.query);
    if (implementation.queryOutcome === "rejected") {
      const rejection = validateChatCatalogGrade(await implementation.verifyQueryRejection!(context, state));
      await input.evidence("chat-catalog-query-rejection.json", rejection);
      expect(rejection.passed, "Real browser/API query rejection").toBe(true);
    }
    if (implementation.act) await implementation.act(context, state);
    let settledAt: number | undefined;
    let passedAt: number | undefined;
    await pollUntil({ label: scenario.id, deadlineAt, intervalMs: 1_000, load: refresh,
      accept: result => {
        if (!result.grade.passed) { passedAt = undefined; return false; }
        passedAt ??= Date.now();
        return Date.now() - passedAt >= 5_000;
      },
      reject: result => {
        if (result.runs.length > implementation.expectedRunCount) return "Scenario exceeded its declared run bound";
        if (result.runs.some(run => ["failed", "cancelled", "timed_out"].includes(run.status) && !chatCatalogAllowedRunStatuses(implementation).includes(run.status))) return "Observed provider run failed";
        if (result.runs.length && result.runs.every(run => !["queued", "running"].includes(run.status)) && result.issue?.conversationState === "waiting") settledAt ??= Date.now();
        else settledAt = undefined;
        return settledAt && Date.now() - settledAt >= 15_000
          ? `Settled scenario failed: ${result.grade.checks.filter(check => !check.passed).map(check => check.id).join(", ")}` : undefined;
      }, timeoutDetail: result => result?.grade.checks.filter(check => !check.passed).map(check => check.id).join(", "),
    });
    const originalIssueId = context.issue()?.id;
    await input.page.reload({ waitUntil: "domcontentloaded" });
    await expect(input.page.getByTestId("task-chat-composer-input")).toBeVisible();
    const persisted = await refresh();
    expect(context.issue()?.id, "Source chat survives browser reload").toBe(originalIssueId);
    expect(persisted.grade.passed, "Independent oracle survives browser reload").toBe(true);
    await implementation.verifyResult(context, state, observation);
    for (const check of persisted.grade.checks) input.check?.(check.id, check.passed, check.detail);
    await input.capture("chat-catalog-result", scenario.id, "chat-catalog-result.png");
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await conversation();
      if (state) await refresh();
      const runs = await context.allRuns();
      await input.evidence("chat-catalog-runs.json", await Promise.all(runs.map(run => collectChatRunEvidence(input.api, run))));
    } catch {
      await input.evidence("chat-catalog-evidence-error.json", { incomplete: true, scenarioId: scenario.id });
      if (!failed) throw new Error("Scenario evidence collection failed");
    } finally {
      try {
        if (state) await implementation.cleanup?.(context, state);
        await input.evidence("chat-catalog-cleanup.json", { scenarioId: scenario.id, caseCleanup: "complete", instanceCleanup: "owned by existing launcher" });
      } catch (error) {
        await input.evidence("chat-catalog-cleanup.json", { scenarioId: scenario.id, caseCleanup: "failed" });
        if (!failed) throw error;
      }
    }
  }
}
