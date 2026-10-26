import path from "node:path";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolveDefaultAgentWorkspaceDir } from "../../../server/src/home-paths.js";
import { prepareChatBrief } from "../chat-stories.js";
import { pollUntil } from "../api.js";
import { runtimeWorker } from "./runtime-support.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import type { Entity } from "./internal-support.js";
export async function busyRuntimeWorker(ctx: ChatCatalogContext) {
  if (ctx.input.execution.environment.id !== "local") throw new Error("Owned file-gate fixture requires a real local environment");
  const root = process.env.PAPERCLIP_RUNNER_E2E_TEMP_ROOT; if (!root) throw new Error("Busy fixture requires its isolated attempt root");
  const worker = await runtimeWorker(ctx); const candidate = path.resolve(resolveDefaultAgentWorkspaceDir(worker.id));
  const isolated = await realpath(root);
  if (!candidate.startsWith(`${isolated}${path.sep}`)) throw new Error("Busy fixture escaped its isolated company home");
  await mkdir(candidate, { recursive: true });
  const home = await realpath(candidate);
  if (!home.startsWith(`${isolated}${path.sep}`)) throw new Error("Busy fixture resolved outside its isolated company home");
  const gate = await prepareChatBrief(home, `runtime-${ctx.input.nonce}`, 300_000);
  const company = `/api/companies/${ctx.input.fixtures.company.id}`;
  for (const scope of [{ scopeType: "company", scopeId: ctx.input.fixtures.company.id }, { scopeType: "agent", scopeId: worker.id }])
    await ctx.input.api.post(`${company}/budgets/policies`, { ...scope, amount: 500, hardStopEnabled: true, isActive: true, unpricedUsagePolicy: "allow" });
  const task = await ctx.input.api.post<Entity>(`${company}/issues`, { title: "Website task", status: "todo", assigneeAgentId: worker.id,
    description: `The website brief is being supplied by the human. Run node ${JSON.stringify(gate.scriptPath)} once and wait for its real output. Do not invent a brief, replace the script, or mark work complete before it returns. Once the brief arrives, save it as a task document and finish normally.` });
  const running = await pollUntil({ label: "Real Morgan process waiting for its human brief", deadlineAt: Date.now() + 150_000,
    load: async () => ({ runs: await ctx.allRuns(), waiting: await readFile(gate.ready, "utf8").catch(() => "") }),
    accept: value => value.waiting === "waiting" && value.runs.length === 1 && value.runs[0]?.agentId === worker.id && value.runs[0].status === "running",
    reject: value => value.runs.some(run => ["failed", "cancelled", "timed_out", "succeeded"].includes(run.status)) ? "Busy fixture ended before its required active boundary" : undefined });
  return { worker, task, gate, workerRunId: running.runs[0]!.id, workerWasReallyWaiting: true };
}
export async function releaseRuntimeWorker(state: Record<string, unknown>) {
  const gate = state.gate as { gate?: string } | undefined;
  if (gate?.gate) await writeFile(gate.gate, "The human ended this disposable fixture. Preserve any saved work and finish normally.", "utf8");
}
