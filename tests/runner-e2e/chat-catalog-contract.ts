import type { ChatFlowInput, ChatIssue, ChatRun } from "./chat-flow.js";
import type { ChatScenario } from "./chat-feature-cases.js";

export interface ChatCatalogCheck { id: string; passed: boolean; detail: string }
export interface ChatCatalogGrade { passed: boolean; checks: ChatCatalogCheck[] }
export interface ChatCatalogContext {
  input: ChatFlowInput;
  scenario: ChatScenario;
  issue(): ChatIssue | undefined;
  allRuns(): Promise<ChatRun[]>;
  refreshIssue(): Promise<void>;
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
/** One concrete scenario, with production API setup and a case-specific independent oracle. */
export interface ChatCatalogCase {
  scenarioId: string;
  journeyKind?: "agent-chat";
  authentication?: "local-trusted" | "human-session";
  setupPolicy?: ChatCatalogSetupPolicy;
  runPolicy?: ChatCatalogRunPolicy;
  queryOutcome?: "persisted" | "rejected";
  /** All case/grader helpers must be listed; the suite also fingerprints its complete source tree. */
  sourceFiles: readonly string[];
  oracleVersion: string;
  /** Known missing catalog conditions keep this executable diagnostic case from acceptance. */
  coverageGaps?: readonly string[];
  expectedRunCount: number;
  /** Persisted human comments; explicit followups must be declared before execution. */
  expectedHumanMessageCount?: number;
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
