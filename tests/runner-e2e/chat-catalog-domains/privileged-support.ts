import type { ChatCatalogCase, ChatCatalogContext } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import { observeInternal, observation, type InternalObservation } from "./internal-support.js";

/** These cases exercise only the launcher-owned instance or a rendered developer fixture. */
export function privilegedDefinition(scenarioId: string, module: string, extra: Pick<ChatCatalogCase, "setup" | "grade" | "act" | "verifyResult">): ChatCatalogCase {
  return { scenarioId, oracleVersion: "paperclip.chat-catalog.privileged.v1", coverageGaps: [],
    authentication: "human-session", expectedRunCount: 1, turnTimeoutMs: 120_000, attemptTimeoutMs: 420_000,
    sourceFiles: ["chat-catalog-domains/privileged-support.ts", `chat-catalog-domains/${module}.ts`, `chat-scenarios/${scenarioId.split(".")[0]}.yaml`],
    observe: observeInternal, ...extra };
}
export async function settlePrivilegedChat(ctx: ChatCatalogContext): Promise<InternalObservation> {
  return pollUntil({ label: "Canonical privileged guidance settled", deadlineAt: Date.now() + 150_000,
    load: () => observeInternal(ctx, {}),
    accept: o => o.runs.length === 1 && o.runs[0]?.status === "succeeded" && !!o.reply && ctx.issue()?.conversationState === "waiting",
    reject: o => o.runs.some(run => ["failed", "timed_out", "cancelled"].includes(run.status)) ? "Canonical guidance run failed" : undefined });
}
export const privilegedObservation = observation;
