import { expect, type Page } from "@playwright/test";
import { pollUntil, type RunnerApi } from "./api.js";
import { createTaskThroughUi } from "./user-actions.js";
import { collectRunEvents } from "./run-observations.js";
import { CursorCloudOwnedObserver, cursorCloudIdentityProof } from "./cursor-cloud-observer.js";
import { CURSOR_CLOUD_QUIET_WINDOW_MS, cursorCloudStopArtifactName } from "./cursor-cloud-cases.js";
import type { LiveFixtureValues } from "./live-fixtures.js";
import type { MatrixExecution } from "./types.js";

type Row = Record<string, any>;
export async function runCursorCloudStopFlow(input: {
  page: Page; api: RunnerApi; fixtures: LiveFixtureValues; execution: MatrixExecution; nonce: string;
  observer: CursorCloudOwnedObserver; deadlineAt: number;
  observe(issue: Row, runs: Row[]): void;
  capture(id: string, label: string, file: string): Promise<void>;
  evidence(name: string, value: unknown): Promise<void>;
}) {
  const { page, api, fixtures, execution, nonce, observer } = input;
  const created = await createTaskThroughUi({ page, issuePrefix: fixtures.company.issuePrefix!, agentName: fixtures.agent.name,
    title: execution.task.buildTitle(nonce), prompt: execution.task.buildPrompt(nonce), workMode: "standard", requireExplicitTitle: true });
  let issue: Row = {}, runs: Row[] = [];
  const load = async () => {
    issue = await api.get<Row>(`/api/issues/${created.issueId}`); runs = await observer.refresh(); input.observe(issue, runs);
    if (runs.length > 1) throw new Error("Cloud Stop dispatched an extra local run");
    return { issue, runs };
  };
  const active = await pollUntil({ label: "independently active Cloud command", deadlineAt: input.deadlineAt, intervalMs: 500, retryOnError: () => false,
    load: async () => {
      await load(); const local = runs[0], identity = local && observer.identities.get(local.id);
      if (!local || !identity?.runId) return undefined;
      if (local.runtimeMode !== "native") throw new Error("Cloud Stop requires the admitted native Runner");
      if (local.status !== "running") throw new Error("Cloud Stop boundary unexercised: local work ended before Stop");
      const events = await collectRunEvents<Row>((afterSeq, limit) => api.get(`/api/heartbeat-runs/${local.id}/events?afterSeq=${afterSeq}&limit=${limit}`));
      const started = events.map(row => row.payload?.prpEvent).find(event => event?.runId === local.id && event.eventType === "tool.execution.started");
      const remote = await observer.client.getRun(identity.agentId, identity.runId);
      return started && ["RUNNING", "WAITING_FOR_BACKGROUND_WORK"].includes(remote.status) ? { identity, remoteStatus: remote.status, localRunId: local.id, executionId: started.payload.executionId } : undefined;
    }, accept: Boolean });
  if (!active) throw new Error("Missing Cloud Stop boundary");
  const absent = async () => !(await observer.client.listArtifacts(active.identity.agentId)).items.some(item => item.path.split("/").at(-1) === cursorCloudStopArtifactName(nonce));
  expect(await absent(), "Delayed Cloud artifact must be absent before Stop").toBe(true);
  await input.evidence("cursor-cloud-stop-active.json", { identity: cursorCloudIdentityProof(active.identity), remoteStatus: active.remoteStatus, localRunId: active.localRunId, nativeToolStarted: true });
  await page.goto(`/${fixtures.company.issuePrefix}/issues/${issue.identifier ?? issue.id}`);
  await input.capture("cloud-before-stop", "Cloud run independently active before Stop", "cloud-before-stop.png");
  const stop = page.getByTestId("task-chat-composer-stop").last(); await expect(stop).toBeVisible();
  expect(["RUNNING", "WAITING_FOR_BACKGROUND_WORK"]).toContain((await observer.client.getRun(active.identity.agentId, active.identity.runId!)).status);
  await stop.click();
  await pollUntil({ label: "Cloud and Paperclip cancellation", deadlineAt: input.deadlineAt, intervalMs: 500, retryOnError: () => false,
    load: async () => { await load(); return { local: runs[0], remote: await observer.client.getRun(active.identity.agentId, active.identity.runId!) }; },
    accept: value => value.local?.status === "cancelled" && value.remote.status === "CANCELLED",
    reject: value => ["FINISHED", "ERROR", "EXPIRED"].includes(value.remote.status) ? "Cloud run ended without verified cancellation" : undefined });
  const receipt = runs[0]!.resultJson?.nativeCancellation;
  expect(receipt).toMatchObject({ schema: "paperclip.native-cancellation.v1", companyId: fixtures.company.id, issueId: issue.id, runId: active.localRunId, scope: "run", dispatched: true, dispatchState: "acknowledged", reasonCode: "cancellation_run_only" });
  const samples: Array<{ elapsedMs: number; providerCancelled: boolean; artifactAbsent: boolean; localCancelled: boolean }> = [];
  const quietStart = Date.now();
  do {
    await load(); const remote = await observer.client.getRun(active.identity.agentId, active.identity.runId!);
    const sample = { elapsedMs: Date.now() - quietStart, providerCancelled: remote.status === "CANCELLED", artifactAbsent: await absent(), localCancelled: runs.length === 1 && runs[0]?.status === "cancelled" && issue.status !== "done" };
    samples.push(sample); expect(sample.providerCancelled && sample.artifactAbsent && sample.localCancelled, "Cloud Stop must stay cancelled without a late artifact or automatic continuation").toBe(true);
    if (sample.elapsedMs >= CURSOR_CLOUD_QUIET_WINDOW_MS) break;
    await page.waitForTimeout(1_000);
  } while (Date.now() < input.deadlineAt);
  expect(samples.at(-1)!.elapsedMs).toBeGreaterThanOrEqual(CURSOR_CLOUD_QUIET_WINDOW_MS);
  await input.capture("cloud-stopped", "Cloud run stays cancelled after Stop", "cloud-stopped.png");
  await input.evidence("cursor-cloud-stop-settled.json", { identity: cursorCloudIdentityProof(active.identity), quietWindowMs: CURSOR_CLOUD_QUIET_WINDOW_MS, samples, acknowledgementMatches: true, observationScope: "Cloud run status and published artifact list during the bounded quiet window" });
  return { issue, runs, checks: [{ id: "cloud-active-run-stop", passed: true, detail: "UI Stop cancelled the independently active exact Cloud run; no delayed artifact or automatic local continuation appeared during the recorded quiet window" }] };
}
