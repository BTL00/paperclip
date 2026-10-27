import type { ChatFlowInput, ChatIssue, ChatRun } from "./chat-flow.js";
import type { CredentialName } from "./types.js";
import type { ChatExternalInputRequirement } from "./chat-private-inputs.js";
import type { ChatScenario } from "./chat-feature-cases.js";

export interface ChatCatalogCheck { id: string; passed: boolean; detail: string }
export interface ChatCatalogGrade { passed: boolean; checks: ChatCatalogCheck[] }
export interface ChatCatalogContext {
  input: ChatFlowInput;
  scenario: ChatScenario;
  issue(): ChatIssue | undefined;
  allRuns(): Promise<ChatRun[]>;
  refreshIssue(): Promise<void>;
  /** Available only to the two allowlisted native Slack ingress cases. */
  selectSlackSource?(issueId: string): Promise<void>;
}
export type ChatCatalogTerminalRunStatus = "succeeded" | "cancelled" | "failed" | "timed_out";
export type ChatCatalogRunPolicy =
  | { kind: "terminal-counts"; terminalStatusCounts: Partial<Record<ChatCatalogTerminalRunStatus, number>> }
  | { kind: "source-settled-with-active-work"; maximumActiveWorkerRuns: number };
export interface ChatCatalogSetupPolicy {
  funding?: "standard" | "preserve-scenario";
  readiness?: "all-ready" | "preserve-scenario";
  /** Required independent prerequisite checks when preserving a scenario-specific policy. */
  invariantCheckIds: readonly string[];
}
export type ChatCatalogQueryBinding = { catalogToken: string; stateKey: string } & (
  | { resourceKind: "issue"; valueField: "identifier" }
  | { resourceKind: "project-repository"; valueField: "fullName" }
);
export interface ChatCatalogQueryAttachment {
  /** A genuine UI upload receipt returned by setup; never arbitrary body text. */
  stateKey: string;
  filename: string;
}
export interface ChatCompanionSurface { kind: "scoped-external-assistant"; model: string; maximumModelTurns: 6; maximumToolCalls: 4; maximumOutputTokens: 2048 }
export interface ChatCompanionResult {
  query: string; reply: string; model: string; usage: { inputTokens: number; outputTokens: number };
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
  providerResponseIds: string[]; toolCalls: Array<{ name: string; arguments: unknown; result: unknown }>; links: string[];
}
export interface ChatSlackIngress { kind: "native-slack-thread"; maximumProviderCalls: 20; ingressTimeoutMs: 120000 }
export interface ChatSlackIngressReceipt {
  query: string; endpointId: string; conversationId: string; issueId: string; humanCommentId: string; linkedPaperclipUserId: string; providerCalls: number;
  provider: { workspaceId: string; channelId: string; threadId: string; canonicalMessageId: string; senderUserId: string };
}
/** One concrete scenario, with production API setup and a case-specific independent oracle. */
export interface ChatCatalogCase {
  scenarioId: string;
  /** Real browser locale context for the canonical person's schedule. */
  browserTimezone?: "America/Chicago";
  respondingAgent?: { kind: "case-primary-owner"; name: "Morgan"; role: "engineer"; canAssignTasks: true };
  requiredCredentials?: readonly CredentialName[];
  externalInput?: ChatExternalInputRequirement;
  installedSource?: "published-global-npm";
  journeyKind?: "agent-chat" | "scoped-external-assistant" | "native-slack-thread";
  slackIngress?: ChatSlackIngress;
  dispatchSlackQuery?(context: ChatCatalogContext, state: Record<string, unknown>, input: { query: string; signal: AbortSignal }): Promise<ChatSlackIngressReceipt>;
  companionSurface?: ChatCompanionSurface;
  runCompanionSurface?(context: ChatCatalogContext, state: Record<string, unknown>, input: { query: string; signal: AbortSignal }): Promise<ChatCompanionResult>;
  authentication?: "local-trusted" | "human-session";
  setupPolicy?: ChatCatalogSetupPolicy;
  runPolicy?: ChatCatalogRunPolicy;
  queryOutcome?: "persisted" | "rejected";
  /** Audited substitution of an incidental catalog fixture token, never other prose. */
  queryBindings?: readonly ChatCatalogQueryBinding[];
  queryAttachments?: readonly ChatCatalogQueryAttachment[];
  /** All case/grader helpers must be listed; the suite also fingerprints its complete source tree. */
  sourceFiles: readonly string[];
  oracleVersion: string;
  /** Known missing catalog conditions keep this executable diagnostic case from acceptance. */
  coverageGaps?: readonly string[];
  expectedRunCount: number;
  /** Persisted human comments; explicit followups must be declared before execution. */
  expectedHumanMessageCount?: number;
  /** Genuine persisted human setup turns before the canonical query; included in the total above. */
  setupHumanMessageCount?: number;
  minimumRunCount?: number;
  turnTimeoutMs: number;
  attemptTimeoutMs: number;
  verifySetup?(context: ChatCatalogContext, state: Record<string, unknown>): Promise<ChatCatalogGrade>;
  verifyQueryRejection?(context: ChatCatalogContext, state: Record<string, unknown>): Promise<ChatCatalogGrade>;
  setup(context: ChatCatalogContext): Promise<Record<string, unknown>>;
  /** Only explicit scenario user followups/approvals through visible production UI. */
  act?(context: ChatCatalogContext, state: Record<string, unknown>): Promise<void>;
  observe(context: ChatCatalogContext, state: Record<string, unknown>): Promise<unknown>;
  grade(observation: unknown): ChatCatalogGrade;
  /** Open the actual linked result through the browser and verify its identity. */
  verifyResult(context: ChatCatalogContext, state: Record<string, unknown>, observation: unknown): Promise<void>;
  cleanup?(context: ChatCatalogContext, state: Record<string, unknown>): Promise<void>;
}

export function validateChatCatalogGrade(grade: ChatCatalogGrade): ChatCatalogGrade {
  if (!grade || !Array.isArray(grade.checks) || grade.checks.length === 0
    || grade.checks.some(check => !check.id || typeof check.passed !== "boolean" || !check.detail)
    || new Set(grade.checks.map(check => check.id)).size !== grade.checks.length
    || grade.passed !== grade.checks.every(check => check.passed)) {
    throw new Error("Invalid chat catalog oracle result: checks must be nonempty, unique and agree with the verdict");
  }
  return grade;
}

export interface ChatCatalogSetupBoundary { humanCommentIds: string[]; runIds: string[] }
export function validChatCatalogHumanCounts(implementation: Pick<ChatCatalogCase, "setupHumanMessageCount" | "expectedHumanMessageCount" | "queryOutcome">): boolean {
  const setup = implementation.setupHumanMessageCount ?? 0, total = implementation.expectedHumanMessageCount ?? 1;
  return Number.isSafeInteger(setup) && setup >= 0 && Number.isSafeInteger(total)
    && total >= setup + (implementation.queryOutcome === "rejected" ? 0 : 1);
}
export function chatCatalogHumanHistoryMatches(input: {
  implementation: Pick<ChatCatalogCase, "setupHumanMessageCount" | "expectedHumanMessageCount" | "queryOutcome">;
  human: Array<{ id: string; body: string }>; runIds: string[];
  boundary: ChatCatalogSetupBoundary; renderedQuery: string;
}): boolean {
  const count = input.implementation.setupHumanMessageCount ?? 0;
  return validChatCatalogHumanCounts(input.implementation)
    && input.boundary.humanCommentIds.length === count
    && input.boundary.humanCommentIds.every((id, index) => input.human[index]?.id === id)
    && input.boundary.runIds.every(id => input.runIds.includes(id))
    && (input.implementation.queryOutcome === "rejected"
      ? input.human.length === count
      : input.human[count]?.body.trim() === input.renderedQuery.trim()
        && input.human.length === (input.implementation.expectedHumanMessageCount ?? 1));
}
