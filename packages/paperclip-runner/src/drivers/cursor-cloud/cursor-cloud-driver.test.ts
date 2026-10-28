import { afterEach, describe, expect, it, vi } from "vitest";
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { join } from "node:path";
import type { HarnessSession } from "../../contracts/harness-driver.js";
import type { PrpEvent } from "../../protocol/replay-contract.js";
import type { CursorCloudCreateInput, CursorCloudFollowupInput, CursorCloudRun, CursorCloudSseEvent } from "./cloud-client.js";
import { CursorCloudClientError } from "./cloud-client.js";
import { CursorCloudDriver, cursorCloudDriverDescriptor, type CursorCloudDriverOptions, type CursorCloudSessionHandle } from "./cursor-cloud-driver.js";

const roots: string[] = [];
const sessions: HarnessSession[] = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.close({ reason: "test_cleanup" }).catch(() => {});
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const runId = "run-11111111-1111-4111-8111-111111111111";
function deferred<T = void>() { let resolve!: (value: T | PromiseLike<T>) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise, resolve }; }

class Peer {
  request: CursorCloudCreateInput | CursorCloudFollowupInput | null = null;
  native: CursorCloudRun | null = null;
  created = deferred();
  release = deferred();
  failCreate = false;
  replay = false;
  cursor: string | undefined;
  createAgent = vi.fn(async (input: CursorCloudCreateInput) => {
    this.request = input;
    this.native = { id: runId, agentId: input.agentId!, status: "RUNNING", createdAt: "2026-10-28T00:00:00Z", updatedAt: "2026-10-28T00:00:00Z" };
    this.created.resolve();
    if (this.failCreate) throw new Error("lost response");
    return { agent: { id: input.agentId!, status: "ACTIVE" as const, env: { type: "cloud" as const }, url: "https://cursor.com/agents/example", createdAt: this.native.createdAt, updatedAt: this.native.updatedAt, latestRunId: runId }, run: { ...this.native } };
  });
  createRun = vi.fn(async (_id: string, input: CursorCloudFollowupInput) => {
    this.request = input; this.release = deferred(); this.native!.status = "RUNNING";
    return { run: { ...this.native! } };
  });
  getAgent = vi.fn(async (id: string) => ({ id, status: "ACTIVE" as const, env: { type: "cloud" as const }, url: "https://cursor.com/agents/example", createdAt: "2026-10-28T00:00:00Z", updatedAt: "2026-10-28T00:00:00Z", latestRunId: runId }));
  getRun = vi.fn(async () => ({ ...this.native! }));
  cancelRun = vi.fn(async () => { this.native!.status = "CANCELLED"; this.release.resolve(); return { id: runId }; });
  getUsage = vi.fn(async () => ({ totalUsage: { inputTokens: 3, outputTokens: 2, cacheWriteTokens: 0, cacheReadTokens: 0, totalTokens: 5 }, runs: [] }));
  listArtifacts = vi.fn(async () => ({ items: [] }));
  downloadArtifact = vi.fn(async () => Buffer.alloc(0));
  async *streamRun(_agent: string, _run: string, options: { signal?: AbortSignal; lastEventId?: string } = {}): AsyncGenerator<CursorCloudSseEvent> {
    this.cursor = options.lastEventId;
    if (!this.replay) { yield { id: "opaque-1", event: "assistant", data: { text: "Working." } }; this.replay = true; }
    else yield { id: "opaque-1", event: "assistant", data: { text: "Working." } };
    await Promise.race([this.release.promise, new Promise<void>(accept => options.signal?.addEventListener("abort", () => accept(), { once: true }))]);
    if (options.signal?.aborted) return;
    yield { id: "opaque-2", event: "result", data: { runId, status: this.native!.status } };
  }
}

async function fixture(peer = new Peer(), extra: Partial<CursorCloudDriverOptions> = {}) {
  const root = await mkdtemp("/tmp/cc-"); roots.push(root);
  const handler = vi.fn(async () => ({ success: true, contentItems: [{ type: "inputText", text: "accepted" }] }));
  const options: CursorCloudDriverOptions = { model: "explicit-model", config: { schema: "paperclip.cursor-cloud.config.v1", repos: [{ url: "https://github.com/example/repo", startingRef: "main" }] },
    binding: { companyId: "company", agentId: "agent", issueId: "issue", normalizedSessionId: "session" }, runtimeDirectory: root,
    relay: { url: "https://relay.example.test/mcp", token: "private-relay-token", socketPath: join(root, "mcp.sock"), expiresAt: Date.now() + 600_000 }, instructions: "Follow these exact instructions.",
    dynamicTools: [{ name: "write_note", inputSchema: { type: "object", required: ["note"], properties: { note: { type: "string" } }, additionalProperties: false } }], dynamicToolHandler: handler,
    environment: { CURSOR_API_KEY: "private-cursor-key" }, client: peer, reconnectDelayMs: 1, cancelTimeoutMs: 300, ...extra };
  const driver = new CursorCloudDriver(options);
  const session = await driver.openSession({ runId: "paperclip-run", normalizedSessionId: "session", workingDirectory: root }); sessions.push(session);
  const events: PrpEvent[] = [];
  const pump = (async () => { for await (const event of session.events()) events.push(event); })();
  return { root, peer, handler, options, driver, session, events, pump };
}

async function waitFor(check: () => boolean) { await vi.waitFor(() => expect(check()).toBe(true), { timeout: 2_000, interval: 5 }); }

async function acknowledgeTerminal(session: CursorCloudSessionHandle) {
  const pending = (await session.read?.())?.pendingTerminalDelivery as { turnId: string; receiptId: string };
  await session.acknowledgeTerminalDelivery(pending);
}

async function rpc(path: string, body: unknown, token = "private-relay-token", session?: string): Promise<{ status: number; value: any; session?: string }> {
  return new Promise((accept, reject) => {
    const req = request({ socketPath: path, path: "/mcp", method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", ...(session ? { "Mcp-Session-Id": session } : {}) } }, response => {
      let text = ""; response.setEncoding("utf8"); response.on("data", chunk => { text += chunk; });
      response.on("end", () => accept({ status: response.statusCode!, value: text ? JSON.parse(text) : null, session: response.headers["mcp-session-id"] as string | undefined }));
    });
    req.on("error", reject); req.end(JSON.stringify({ jsonrpc: "2.0", ...body as object }));
  });
}

describe("Cursor Cloud native driver", () => {
  it("refuses expired relay authority before remote work while retaining idle recovery for cleanup", async () => {
    const f = await fixture();
    const snapshot = await f.session.snapshot(); await f.session.detachControllerForRestart!(); await f.pump;
    const restored = (await new CursorCloudDriver({ ...f.options, relay: { ...f.options.relay, expiresAt: Date.now() - 1 } }).recoverSession(snapshot)).session!;
    sessions.push(restored);
    await expect(restored.startTurn({ message: { role: "user", text: "Must not launch" } })).rejects.toThrow("relay capability expired");
    expect(f.peer.createAgent).not.toHaveBeenCalled(); expect(f.peer.createRun).not.toHaveBeenCalled();
    await restored.close({ reason: "expired_cleanup" });
  });

  it("lists exact current Agent artifact paths through its bounded provider-owned read-only helper", async () => {
    const f = await fixture();
    f.peer.listArtifacts.mockResolvedValue({ items: [{ path: "artifacts/evidence.txt", sizeBytes: 12, updatedAt: "2026-10-28T00:00:00Z" }] } as any);
    await f.session.startTurn({ message: { role: "user", text: "Find the artifact" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    const initialized = await rpc(f.options.relay.socketPath, { id: 0, method: "initialize" });
    const result = await rpc(f.options.relay.socketPath, { id: 1, method: "tools/call", params: { name: "list_cursor_cloud_artifacts", arguments: {} } }, undefined, initialized.session);
    expect(JSON.parse(result.value.result.content[0].text)).toEqual({ items: [{ path: "artifacts/evidence.txt", sizeBytes: 12 }] });
    expect(f.peer.listArtifacts).toHaveBeenCalledWith(f.peer.native!.agentId, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(f.handler).not.toHaveBeenCalled();
  });

  it("binds revised idle instructions once on same-Agent followup and rejects revised active recovery", async () => {
    const f = await fixture();
    await f.session.startTurn({ message: { role: "user", text: "Original task" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    f.peer.native!.status = "FINISHED"; f.peer.release.resolve();
    await waitFor(() => f.events.some(event => event.eventType === "turn.completed"));
    const snapshot = await f.session.snapshot(); await f.session.detachControllerForRestart!(); await f.pump;
    const revised = { ...f.options, instructions: "Updated assigned instructions and skill bundle." };
    const restored = (await new CursorCloudDriver(revised).recoverSession(snapshot)).session!; sessions.push(restored);
    await acknowledgeTerminal(restored);
    await restored.startTurn({ message: { role: "user", text: "Follow up" } });
    await waitFor(() => f.peer.createRun.mock.calls.length === 1);
    expect(f.peer.request?.prompt.text).toBe("Updated assigned instructions and skill bundle.\n\nPaperclip task:\nFollow up");
    expect(f.peer.createAgent).toHaveBeenCalledTimes(1);
    const activeSnapshot = await restored.snapshot(); await restored.detachControllerForRestart!();
    await expect(new CursorCloudDriver(f.options).recoverSession(activeSnapshot)).rejects.toThrow("instructions changed");
    const final = (await new CursorCloudDriver(revised).recoverSession(activeSnapshot)).session!; sessions.push(final);
    await final.interrupt!();
    await acknowledgeTerminal(final);
    await final.startTurn({ message: { role: "user", text: "One more task" } });
    await waitFor(() => f.peer.createRun.mock.calls.length === 2);
    expect(f.peer.request?.prompt.text).toBe("One more task");
  });

  it("opens without paid work, sends exact model/instructions and current private MCP headers only on turn", async () => {
    const f = await fixture();
    expect(cursorCloudDriverDescriptor().capabilities).toMatchObject({ usage: false, unsupported: expect.arrayContaining(["production_usage_accounting"]) });
    expect(f.peer.createAgent).not.toHaveBeenCalled();
    expect((await f.session.read?.())?.effectiveModelAcknowledged).toBe(false);
    await f.session.startTurn({ message: { role: "user", text: "Task one" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    expect(f.peer.request).toMatchObject({ model: { id: "explicit-model" }, prompt: { text: "Follow these exact instructions.\n\nPaperclip task:\nTask one" }, mcpServers: [{ url: "https://relay.example.test/mcp", headers: { Authorization: "Bearer private-relay-token" } }] });
    expect(f.peer.request).not.toHaveProperty("schema");
    const identity = f.events.filter(event => event.payload.code === "cursor_cloud_remote_identity").map(event => JSON.parse(String(event.payload.message))).find(value => value.runId !== null);
    expect(identity).toEqual({ schema: "paperclip.cursor-cloud.remote-identity.v1", provider: "cursor_cloud", agentId: f.peer.native!.agentId, runId, ownerRunId: "paperclip-run", normalizedSessionId: "session", phase: "running" });
    const checkpoint = await readFile(join(f.root, (await readdir(f.root)).find(name => name.endsWith(".json"))!), "utf8");
    expect(checkpoint).not.toContain("private-relay-token"); expect(checkpoint).not.toContain("private-cursor-key"); expect(checkpoint).not.toContain("Task one");
    f.peer.native!.status = "FINISHED"; f.peer.release.resolve();
    await waitFor(() => f.events.some(event => event.eventType === "turn.completed"));
    expect(f.events.some(event => event.eventType === "run.result.proposed")).toBe(false);
    await acknowledgeTerminal(f.session);
    await f.session.startTurn({ message: { role: "user", text: "Task two" } });
    await waitFor(() => f.peer.createRun.mock.calls.length === 1);
    expect(f.peer.request?.prompt.text).toBe("Task two"); expect(f.peer.createAgent).toHaveBeenCalledTimes(1);
  });

  it("delivers the full admitted semantic response through the real Unix MCP bridge, rejects unknown/late calls", async () => {
    const f = await fixture();
    await f.session.startTurn({ message: { role: "user", text: "Use a tool" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    const path = f.options.relay.socketPath;
    expect((await rpc(path, { id: "bad", method: "tools/list" }, "wrong")).status).toBe(401);
    const initialized = await rpc(path, { id: 1, method: "initialize" });
    const response = await rpc(path, { id: "call-1", method: "tools/call", params: { name: "write_note", arguments: { note: "first" } } }, undefined, initialized.session);
    expect(response.value.result.content[0].text).toContain('"success":true');
    expect(f.handler).toHaveBeenCalledWith(expect.objectContaining({ tool: "write_note", arguments: { note: "first" }, turnId: expect.stringMatching(/^turn-/) }));
    await rpc(path, { id: "missing", method: "tools/call", params: { name: "not_admitted", arguments: {} } }, undefined, initialized.session);
    expect(f.handler).toHaveBeenCalledTimes(1);
    await f.session.interrupt!();
    expect(f.peer.cancelRun).toHaveBeenCalledTimes(1);
    expect(f.peer.getRun.mock.calls.length).toBeGreaterThanOrEqual(2);
    const late = await rpc(path, { id: "late", method: "tools/call", params: { name: "write_note", arguments: { note: "late" } } }, undefined, initialized.session);
    expect(late.status).toBe(403); expect(f.handler).toHaveBeenCalledTimes(1);
    expect((await f.session.read?.())?.providerStatus).toBe("CANCELLED");
  });

  it("retains only an accepted semantic receipt and waits for actual provider termination", async () => {
    const f = await fixture();
    await f.session.startTurn({ message: { role: "user", text: "Finish semantically" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    const initialized = await rpc(f.options.relay.socketPath, { id: 0, method: "initialize" });
    const args = { reportedWorkDisposition: "done", summary: "Completed.", evidence: [], verification: [], completionClaim: { contractRevision: "1", objectiveSatisfied: true, criteria: [], remainingWork: [] } };
    f.handler.mockResolvedValueOnce({ success: false, contentItems: [{ type: "inputText", text: "rejected" }] });
    await rpc(f.options.relay.socketPath, { id: "rejected", method: "tools/call", params: { name: "paperclip_finish", arguments: args } }, undefined, initialized.session);
    expect((await f.session.read?.())?.semanticCompletionReceipt).toBeNull();
    await rpc(f.options.relay.socketPath, { id: "accepted", method: "tools/call", params: { name: "paperclip_finish", arguments: args } }, undefined, initialized.session);
    expect((await f.session.read?.())?.semanticCompletionReceipt).toMatchObject({ inputDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(f.events.some(event => event.eventType === "turn.completed" || event.eventType === "run.result.proposed")).toBe(false);
    f.peer.native!.status = "FINISHED"; f.peer.release.resolve();
    await waitFor(() => f.events.some(event => event.eventType === "turn.completed"));
  });

  it("resumes the saved opaque stream cursor without duplicating a replayed text frame", async () => {
    const f = await fixture();
    await f.session.startTurn({ message: { role: "user", text: "Reconnect" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    const snapshot = await f.session.snapshot(); await f.session.detachControllerForRestart!(); await f.pump;
    f.peer.cursor = undefined;
    const restored = (await new CursorCloudDriver(f.options).recoverSession(snapshot)).session!; sessions.push(restored);
    const replay: PrpEvent[] = []; void (async () => { for await (const event of restored.events()) replay.push(event); })();
    await waitFor(() => f.peer.cursor === "opaque-1");
    f.peer.native!.status = "FINISHED"; f.peer.release.resolve();
    await waitFor(() => replay.some(event => event.eventType === "turn.completed"));
    expect(replay.some(event => event.eventType === "item.delta")).toBe(false);
    expect(f.peer.createAgent).toHaveBeenCalledTimes(1);
  });

  it("namespaces repeated RPC id zero by initialized MCP session and rejects an old session after a new turn", async () => {
    const f = await fixture(); const path = f.options.relay.socketPath;
    await f.session.startTurn({ message: { role: "user", text: "First turn" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    const first = await rpc(path, { id: 0, method: "initialize" });
    const second = await rpc(path, { id: 0, method: "initialize" });
    const call = { id: 0, method: "tools/call", params: { name: "write_note", arguments: { note: "same wire ID" } } };
    await rpc(path, call, undefined, first.session); await rpc(path, call, undefined, second.session);
    expect(f.handler).toHaveBeenCalledTimes(2);
    expect(f.handler.mock.calls[0]![0].callId).not.toBe(f.handler.mock.calls[1]![0].callId);
    f.peer.native!.status = "FINISHED"; f.peer.release.resolve();
    await waitFor(() => f.events.some(event => event.eventType === "turn.completed"));
    await acknowledgeTerminal(f.session);
    await f.session.startTurn({ message: { role: "user", text: "Next turn" } });
    const third = await rpc(path, { id: 0, method: "initialize" });
    expect((await rpc(path, call, undefined, first.session)).status).toBe(404);
    await rpc(path, call, undefined, third.session); expect(f.handler).toHaveBeenCalledTimes(3);
  });

  it("recovers an ambiguous create by saved agent identity, without another create or caller model acknowledgment", async () => {
    const peer = new Peer(); peer.failCreate = true;
    const f = await fixture(peer);
    await f.session.startTurn({ message: { role: "user", text: "Ambiguous create" } }); await peer.created.promise;
    await waitFor(() => f.events.some(event => event.payload.code === "cursor_cloud_remote_state_unknown"));
    const snapshot = await f.session.snapshot();
    await f.session.detachControllerForRestart!(); await f.pump;
    const result = await new CursorCloudDriver(f.options).recoverSession(snapshot);
    expect(result.recovered).toBe(true); const restored = result.session!; sessions.push(restored);
    await waitFor(() => peer.getAgent.mock.calls.length > 0);
    expect(peer.createAgent).toHaveBeenCalledTimes(1);
    expect((await restored.read?.())?.effectiveModelAcknowledged).toBe(false);
    await restored.interrupt!();
    const restoredSnapshot = await restored.snapshot(); await restored.close({ reason: "done" });
    await expect(new CursorCloudDriver({ ...f.options, model: "different-model" }).recoverSession(restoredSnapshot)).rejects.toThrow("changed");
  });

  it.each([401, 403, 404, 422])("retains a saved ambiguous create identity when reconciliation returns HTTP %s", async status => {
    const peer = new Peer(); peer.failCreate = true;
    const f = await fixture(peer);
    await f.session.startTurn({ message: { role: "user", text: "Accepted remotely but response lost" } }); await peer.created.promise;
    await waitFor(() => f.events.some(event => event.payload.code === "cursor_cloud_remote_state_unknown"));
    const snapshot = await f.session.snapshot(); await f.session.detachControllerForRestart!(); await f.pump;
    const checkpointPath = join(f.root, (await readdir(f.root)).find(name => name.endsWith(".json"))!);
    const before = JSON.parse(await readFile(checkpointPath, "utf8"));
    const getAgent = peer.getAgent.getMockImplementation()!;
    peer.getAgent.mockRejectedValue(new CursorCloudClientError("http_error", { status }));
    const restored = (await new CursorCloudDriver(f.options).recoverSession(snapshot)).session!; sessions.push(restored);
    const events: PrpEvent[] = []; void (async () => { for await (const event of restored.events()) events.push(event); })();
    await waitFor(() => events.some(event => event.payload.code === "cursor_cloud_remote_state_unknown"));
    await restored.snapshot();
    const after = JSON.parse(await readFile(checkpointPath, "utf8"));
    expect(after).toMatchObject({ phase: "creating", pendingOperation: "create_agent", requestedAgentId: before.requestedAgentId, idempotencyKey: before.idempotencyKey, requestDigest: before.requestDigest });
    expect(after.requestedAgentId).toMatch(/^bc-/);
    await expect(restored.startTurn({ message: { role: "user", text: "Must not replace uncertain work" } })).rejects.toThrow("unresolved remote work");
    expect(peer.createAgent).toHaveBeenCalledTimes(1); expect(peer.createRun).not.toHaveBeenCalled();
    peer.getAgent.mockImplementation(getAgent); await restored.interrupt!();
  });

  it("allows a definitive direct mutation rejection to settle without pretending work was accepted", async () => {
    const peer = new Peer();
    peer.createAgent.mockRejectedValue(new CursorCloudClientError("http_error", { status: 422 }));
    const f = await fixture(peer);
    await f.session.startTurn({ message: { role: "user", text: "Invalid native request" } });
    await waitFor(() => f.events.some(event => event.eventType === "turn.failed"));
    expect(await f.session.read?.()).toMatchObject({ phase: "idle", providerStatus: "REJECTED" });
    expect(f.events.some(event => event.eventType === "turn.failed" && event.payload.remoteWorkAccepted === false)).toBe(true);
  });

  it("retains unconfirmed Stop as fenced active work, never emits a terminal on cancel acknowledgment alone", async () => {
    const peer = new Peer(); peer.cancelRun = vi.fn(async () => ({ id: runId }));
    const f = await fixture(peer, { cancelTimeoutMs: 120 });
    await f.session.startTurn({ message: { role: "user", text: "Keep running" } }); await peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    await expect(f.session.interrupt!()).rejects.toThrow("did not confirm");
    expect(f.events.some(event => event.eventType === "turn.interrupted" || event.eventType === "turn.completed")).toBe(false);
    expect((await f.session.read?.())?.phase).toBe("stopping");
    await expect(f.session.startTurn({ message: { role: "user", text: "New work" } })).rejects.toThrow("unresolved");
    peer.native!.status = "CANCELLED";
  });

  it("releases a private stale Unix socket only after its real child owner was killed", async () => {
    const f = await fixture(); const snapshot = await f.session.snapshot(); await f.session.close({ reason: "initial_idle" }); await f.pump;
    const { client: _client, dynamicToolHandler: _handler, ...childOptions } = f.options;
    const script = `import {CursorCloudDriver} from ${JSON.stringify(new URL("./cursor-cloud-driver.ts", import.meta.url).href)}; process.umask(0o022); const driver=new CursorCloudDriver({...JSON.parse(process.argv[1]),dynamicToolHandler:async()=>{throw new Error('Unexpected tool call')}}); await driver.recoverSession(JSON.parse(process.argv[2])); process.stdout.write('ready\\n');`;
    const child = spawn(process.execPath, ["--import", new URL("../../../node_modules/tsx/dist/loader.mjs", import.meta.url).pathname, "--input-type=module", "-e", script, JSON.stringify(childOptions), JSON.stringify(snapshot)], { stdio: ["ignore", "pipe", "pipe"] });
    let errors = ""; child.stderr!.on("data", chunk => { errors += chunk; });
    try {
      await Promise.race([once(child.stdout!, "data"), once(child, "exit").then(() => { throw new Error(`Controlled driver child exited before readiness: ${errors}`); })]);
      expect((await lstat(f.options.relay.socketPath)).mode & 0o777).toBe(0o600);
      const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
    }
    finally { child.kill("SIGKILL"); }
    const restored = (await new CursorCloudDriver(f.options).recoverSession(snapshot)).session!; sessions.push(restored);
    expect((await restored.read?.())?.phase).toBe("idle"); expect(f.peer.createAgent).not.toHaveBeenCalled();
  });

  it("refuses a live checkpoint owner and never removes an unknown file at the socket path", async () => {
    const f = await fixture(); const snapshot = await f.session.snapshot();
    await expect(new CursorCloudDriver(f.options).recoverSession(snapshot)).rejects.toThrow("live owner");
    await f.session.close({ reason: "idle" }); await f.pump;
    await writeFile(f.options.relay.socketPath, "unowned file", { mode: 0o600 });
    await expect(new CursorCloudDriver(f.options).recoverSession(snapshot)).rejects.toThrow("without safe dead-owner");
    expect(await readFile(f.options.relay.socketPath, "utf8")).toBe("unowned file");
  });

  it("retains the exact terminal delivery across restart until its receipt is acknowledged", async () => {
    const f = await fixture();
    const started = await f.session.startTurn({ message: { role: "user", text: "Retain the final result" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    f.peer.native!.result = "Recovered final private-cursor-key private-relay-token";
    f.peer.native!.status = "FINISHED"; f.peer.release.resolve();
    await waitFor(() => f.events.some(event => event.eventType === "turn.completed"));
    const checkpointPath = join(f.root, (await readdir(f.root)).find(name => name.endsWith(".json"))!);
    expect(JSON.parse(await readFile(checkpointPath, "utf8")).sourceSequence).toBe(f.events.find(event => event.eventType === "turn.completed")!.sourceSeq);
    const pending = (await f.session.read?.())?.pendingTerminalDelivery as Record<string, unknown>;
    expect(pending).toMatchObject({ schema: "paperclip.cursor-cloud.terminal-delivery.v1", threadId: "session", turnId: started.turnId, providerRunId: runId, status: "FINISHED", interrupted: false, result: "Recovered final [redacted] [redacted]", receiptId: expect.any(String) });
    const snapshot = await f.session.snapshot(); await f.session.detachControllerForRestart!(); await f.pump;
    const restored = (await new CursorCloudDriver(f.options).recoverSession(snapshot)).session!; sessions.push(restored);
    expect((await restored.read?.())?.pendingTerminalDelivery).toEqual(pending);
    await expect(restored.startTurn({ message: { role: "user", text: "Must not replace the pending receipt" } })).rejects.toThrow("terminal delivery");
    await expect(restored.acknowledgeTerminalDelivery({ turnId: started.turnId, receiptId: "wrong" })).rejects.toThrow("receipt");
    expect((await restored.read?.())?.pendingTerminalDelivery).toEqual(pending);
    await restored.acknowledgeTerminalDelivery({ turnId: started.turnId, receiptId: pending.receiptId as string });
    expect((await restored.read?.())?.pendingTerminalDelivery).toBeNull();
    const acknowledged = await restored.snapshot(); await restored.detachControllerForRestart!();
    const final = (await new CursorCloudDriver(f.options).recoverSession(acknowledged)).session!; sessions.push(final);
    expect((await final.read?.())?.pendingTerminalDelivery).toBeNull();
    expect(f.peer.createAgent).toHaveBeenCalledTimes(1); expect(f.peer.createRun).not.toHaveBeenCalled();
  });

  it.each(["agent", "run"])("retries a transient recovery %s read without replacing work or extending its deadline", async read => {
    const peer = new Peer(); peer.failCreate = read === "agent";
    const f = await fixture(peer);
    await f.session.startTurn({ message: { role: "user", text: "Recover the existing work" } }); await peer.created.promise;
    await waitFor(() => f.events.some(event => read === "agent" ? event.payload.code === "cursor_cloud_remote_state_unknown" : event.eventType === "item.delta"));
    const snapshot = await f.session.snapshot(); await f.session.detachControllerForRestart!(); await f.pump;
    const checkpointPath = join(f.root, (await readdir(f.root)).find(name => name.endsWith(".json"))!);
    const deadlineAt = JSON.parse(await readFile(checkpointPath, "utf8")).deadlineAt;
    const error = new CursorCloudClientError("http_error", { status: 503 });
    if (read === "agent") peer.getAgent.mockRejectedValueOnce(error);
    else peer.getRun.mockRejectedValueOnce(error);
    const stream = vi.spyOn(peer, "streamRun");
    const restored = (await new CursorCloudDriver(f.options).recoverSession(snapshot)).session!; sessions.push(restored);
    await waitFor(() => stream.mock.calls.length > 0);
    expect(peer.createAgent).toHaveBeenCalledTimes(1); expect(peer.createRun).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(checkpointPath, "utf8")).deadlineAt).toBe(deadlineAt);
    await restored.interrupt!();
  });

  it("enforces the saved deadline while the first recovery read remains pending", async () => {
    const f = await fixture();
    await f.session.startTurn({ message: { role: "user", text: "Recover with a slow read" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    const snapshot = await f.session.snapshot(); await f.session.detachControllerForRestart!(); await f.pump;
    const checkpointPath = join(f.root, (await readdir(f.root)).find(name => name.endsWith(".json"))!);
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    checkpoint.deadlineAt = Date.now() + 100; await writeFile(checkpointPath, JSON.stringify(checkpoint), { mode: 0o600 });
    const blocked = deferred<CursorCloudRun>();
    const getRun = f.peer.getRun.getMockImplementation()!;
    f.peer.getRun.mockImplementationOnce(() => blocked.promise);
    const restored = (await new CursorCloudDriver(f.options).recoverSession(snapshot)).session!; sessions.push(restored);
    try {
      await waitFor(() => f.peer.cancelRun.mock.calls.length === 1);
      expect(f.peer.createAgent).toHaveBeenCalledTimes(1); expect(f.peer.createRun).not.toHaveBeenCalled();
      await vi.waitFor(async () => expect((await restored.read?.())?.phase).toBe("terminal"));
    } finally { blocked.resolve(await getRun()); }
  });

  it("treats an expired persisted active deadline as cleanup-only instead of buying another full turn", async () => {
    const f = await fixture();
    await f.session.startTurn({ message: { role: "user", text: "Expire during outage" } }); await f.peer.created.promise;
    await waitFor(() => f.events.some(event => event.eventType === "item.delta"));
    const snapshot = await f.session.snapshot(); await f.session.detachControllerForRestart!(); await f.pump;
    const path = join(f.root, (await readdir(f.root)).find(name => name.endsWith(".json"))!);
    const checkpoint = JSON.parse(await readFile(path, "utf8")); expect(checkpoint.deadlineAt).toBeGreaterThan(Date.now());
    checkpoint.deadlineAt = Date.now() - 1; await writeFile(path, JSON.stringify(checkpoint), { mode: 0o600 });
    const restored = (await new CursorCloudDriver(f.options).recoverSession(snapshot)).session!; sessions.push(restored);
    await waitFor(() => f.peer.cancelRun.mock.calls.length === 1);
    await waitFor(() => f.peer.native!.status === "CANCELLED");
    expect(f.peer.createAgent).toHaveBeenCalledTimes(1); expect(f.peer.createRun).not.toHaveBeenCalled();
    await vi.waitFor(async () => expect((await restored.read?.())?.phase).toBe("terminal"));
  });
});
