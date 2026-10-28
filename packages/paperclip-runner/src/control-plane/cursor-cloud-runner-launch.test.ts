import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { createRunnerdNativeSessionBackend } from "../backends/codex-native-backend.js";
import type { NativeExecutionInputV5 } from "../contracts/native-execution.js";
import { canonicalNativeRuntimeContextDigest, NATIVE_RUNTIME_ASSET_SCHEMA, PAPERCLIP_EXECUTION_PROMPT, PAPERCLIP_EXECUTION_PROMPT_REVISION, nativeRuntimePromptDigest } from "../contracts/runtime-context.js";
import { executeNativeSession } from "../native-session-runtime.js";
import type { PrpEvent, PrpStructuredRunResult } from "../protocol/replay-contract.js";
import type { DurablePrpControlPlane } from "./durable-prp-control-plane.js";
import { createRunnerdCodexTransport, defaultCapabilityRunnerdBinary } from "../live/runnerd-codex-transport.js";

function buildPrivateCursorCloudProxy(proxyPath: string): void {
  const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
  const builderUrl = new URL("../../scripts/build-verified-provider-entrypoints.mjs", import.meta.url).href;
  execFileSync(process.execPath, ["--input-type=module", "-e", [
    "import { writeFile } from 'node:fs/promises';",
    `const { bundleVerifiedProviderEntrypoints } = await import(${JSON.stringify(builderUrl)});`,
    "const item = (await bundleVerifiedProviderEntrypoints({ write: false })).find(value => value.entrypoint.name === 'cursor-cloud-app-server-proxy');",
    `await writeFile(${JSON.stringify(proxyPath)}, item.verifiedResult.outputFiles[0].contents, { mode: 0o600 });`,
  ].join("\n")], { cwd: packageRoot, timeout: 20_000, stdio: "pipe" });
}

it("opens and closes the real Cloud facade without a provider prompt", async () => {
  const root = await mkdtemp("/tmp/cc-runner-launch-");
  const runtime = join(root, "cloud");
  const configPath = join(runtime, "config.json");
  const socketPath = join(root, "mcp.sock");
  const fetchLog = join(root, "unexpected-fetches.jsonl");
  const proxyPath = join(root, "cloud-proxy.cjs");
  buildPrivateCursorCloudProxy(proxyPath);
  const builtProxy = await readFile(proxyPath);
  const firstLine = builtProxy.indexOf(10) + 1;
  const guard = Buffer.from(`globalThis.fetch = async () => { require("node:fs").appendFileSync(${JSON.stringify(fetchLog)}, "unexpected fetch\\n", { mode: 0o600 }); throw new Error("Cloud launch preflight forbids provider requests"); };\n`);
  await writeFile(proxyPath, Buffer.concat([builtProxy.subarray(0, firstLine), guard, builtProxy.subarray(firstLine)]), { mode: 0o600 });
  await mkdir(runtime, { mode: 0o700 });
  const normalizedSessionId = "cloud-launch-session";
  const cursorCloud = { schema: "paperclip.cursor-cloud.config.v1" as const, repos: [{ url: "https://github.com/example/repo" }] };
  await writeFile(configPath, JSON.stringify({ ...cursorCloud, binding: { companyId: "company", agentId: "agent", issueId: "issue", normalizedSessionId } }), { mode: 0o600 });
  const bundle = createRunnerdCodexTransport({
    provider: "cursor_cloud", cursorCloud,
    stateDirectory: join(root, "runner-session"),
    runnerBinary: defaultCapabilityRunnerdBinary(),
    cursorCloudProxyPath: proxyPath,
    cursorCloudProxySha256: `sha256:${createHash("sha256").update(await readFile(proxyPath)).digest("hex")}`,
    lifecyclePolicy: { mode: "per_turn" },
    prpIdentity: { runnerInstanceId: "runner-cloud-launch", environmentLeaseId: "lease-cloud-launch",
      runId: "00000000-0000-4000-8000-000000000761", normalizedSessionId, turnId: "turn-cloud-launch", itemId: "item-cloud-launch" },
    environment: {
      PATH: process.env.PATH,
      CURSOR_API_KEY: "synthetic-cloud-launch-key",
      PAPERCLIP_CURSOR_CLOUD_CONFIG_PATH: configPath,
      PAPERCLIP_CURSOR_CLOUD_ARTIFACT_ROOT: join(runtime, "artifacts"),
      PAPERCLIP_CURSOR_CLOUD_RELAY_SOCKET_PATH: socketPath,
      PAPERCLIP_CURSOR_CLOUD_RELAY_TOKEN: "synthetic-cloud-relay-token",
      PAPERCLIP_CURSOR_CLOUD_RELAY_URL: "https://relay.example.test/mcp/native-runs/00000000-0000-4000-8000-000000000761",
      PAPERCLIP_CURSOR_CLOUD_RELAY_EXPIRES_AT: String(Date.now() + 60_000),
    },
  });
  try {
    await expect(bundle.transport.request("thread/start", { cwd: root, model: "explicit-model", baseInstructions: "Do only the assigned task.", dynamicTools: [] }))
      .resolves.toMatchObject({ thread: { id: normalizedSessionId } });
    expect((await stat(socketPath)).isSocket()).toBe(true);
    const checkpointName = (await readdir(runtime)).find(name => /^checkpoint-[a-f0-9]{64}\.json$/u.test(name));
    expect(checkpointName).toBeDefined();
    const checkpoint = JSON.parse(await readFile(join(runtime, checkpointName!), "utf8"));
    expect(checkpoint).toMatchObject({ phase: "idle", agentId: null, runId: null, pendingOperation: null });
    await bundle.transport.close();
    expect(bundle.evidence().runnerExited).toBe(true);
    await expect(stat(socketPath)).rejects.toHaveProperty("code", "ENOENT");
    await expect(stat(fetchLog)).rejects.toHaveProperty("code", "ENOENT");
  } finally {
    await bundle.transport.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("preserves native Cloud tool identity and redacted output through the real Rust facade", async () => {
  const root = await mkdtemp("/tmp/cc-tool-facade-");
  const runtime = join(root, "cloud");
  const configPath = join(runtime, "config.json");
  const socketPath = join(root, "mcp.sock");
  const proxyPath = join(root, "cloud-proxy.cjs");
  const fetchLog = join(root, "controlled-fetches.jsonl");
  buildPrivateCursorCloudProxy(proxyPath);
  const runId = "run-22222222-2222-4222-8222-222222222222";
  const fixture = Buffer.from(`;(() => {
    const assert = require('node:assert/strict'), fs = require('node:fs');
    let agentId = '', status = 'RUNNING';
    const now = '2026-10-28T00:00:00Z', runId = ${JSON.stringify(runId)};
    const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    const run = () => ({ id: runId, agentId, status, createdAt: now, updatedAt: now });
    globalThis.fetch = async (input, init = {}) => {
      const target = new URL(String(input)); assert.equal(target.origin, 'https://api.cursor.com');
      const path = target.pathname, method = init.method ?? 'GET';
      fs.appendFileSync(${JSON.stringify(fetchLog)}, JSON.stringify({ method, path }) + '\\n', { mode: 0o600 });
      if (path === '/v1/agents' && method === 'POST') {
        agentId = JSON.parse(String(init.body)).agentId;
        return json({ agent: { id: agentId, status: 'ACTIVE', env: { type: 'cloud' }, url: 'https://cursor.com/agents/' + agentId, createdAt: now, updatedAt: now, latestRunId: runId }, run: run() });
      }
      assert.equal(path.startsWith('/v1/agents/' + agentId + '/runs/' + runId), true);
      if (path.endsWith('/stream') && method === 'GET') return new Response(new ReadableStream({ start(controller) {
        const args = { toolCallId: 'synthetic-private-argument' };
        const result = { error: { message: 'Discovery failed synthetic-cloud-launch-key synthetic-cloud-relay-token' } };
        for (const [index, state] of ['running', 'error'].entries()) controller.enqueue(new TextEncoder().encode('id: ' + (index + 1) + '\\nevent: tool_call\\ndata: ' + JSON.stringify({ callId: 'cloud-native-tool', name: 'get_mcp_tools', status: state, args, result }) + '\\n\\n'));
        init.signal?.addEventListener('abort', () => { try { controller.close(); } catch {} }, { once: true });
      } }), { headers: { 'content-type': 'text/event-stream' } });
      if (path.endsWith('/cancel') && method === 'POST') { status = 'CANCELLED'; return json({ id: runId }); }
      if (path.endsWith('/' + runId) && method === 'GET') return json(run());
      throw new Error('Unexpected controlled Cloud request');
    };
  })();\n`);
  const builtProxy = await readFile(proxyPath);
  const firstLine = builtProxy.indexOf(10) + 1;
  await writeFile(proxyPath, Buffer.concat([builtProxy.subarray(0, firstLine), fixture, builtProxy.subarray(firstLine)]), { mode: 0o600 });
  await mkdir(runtime, { mode: 0o700 });
  const normalizedSessionId = "cloud-tool-facade-session";
  const cursorCloud = { schema: "paperclip.cursor-cloud.config.v1" as const, repos: [{ url: "https://github.com/example/repo" }] };
  await writeFile(configPath, JSON.stringify({ ...cursorCloud, binding: { companyId: "company", agentId: "agent", issueId: "issue", normalizedSessionId } }), { mode: 0o600 });
  let authority: DurablePrpControlPlane | undefined;
  const bundle = createRunnerdCodexTransport({
    provider: "cursor_cloud", cursorCloud, stateDirectory: join(root, "runner-session"),
    runnerBinary: defaultCapabilityRunnerdBinary(), cursorCloudProxyPath: proxyPath,
    cursorCloudProxySha256: `sha256:${createHash("sha256").update(await readFile(proxyPath)).digest("hex")}`,
    lifecyclePolicy: { mode: "per_turn" },
    prpIdentity: { runnerInstanceId: "runner-cloud-tool", environmentLeaseId: "lease-cloud-tool",
      runId: "00000000-0000-4000-8000-000000000762", normalizedSessionId, turnId: "turn-cloud-tool", itemId: "item-cloud-tool" },
    environment: {
      PATH: process.env.PATH, CURSOR_API_KEY: "synthetic-cloud-launch-key",
      PAPERCLIP_CURSOR_CLOUD_CONFIG_PATH: configPath, PAPERCLIP_CURSOR_CLOUD_ARTIFACT_ROOT: join(runtime, "artifacts"),
      PAPERCLIP_CURSOR_CLOUD_RELAY_SOCKET_PATH: socketPath, PAPERCLIP_CURSOR_CLOUD_RELAY_TOKEN: "synthetic-cloud-relay-token",
      PAPERCLIP_CURSOR_CLOUD_RELAY_URL: "https://relay.example.test/mcp", PAPERCLIP_CURSOR_CLOUD_RELAY_EXPIRES_AT: String(Date.now() + 60_000),
    },
    controlPlaneRegistration: async core => { authority = core; await core.start(); return { release: () => undefined }; },
  });
  const tools = (): Array<Record<string, unknown>> => authority!.store.state.committedEvents.filter(event => event.eventType.startsWith("tool.execution.")).map(event => ({
    eventType: event.eventType, ...((event.envelope.payload as Record<string, unknown>).payload as Record<string, unknown>),
  }));
  try {
    const opened = await bundle.transport.request("thread/start", { cwd: root, model: "explicit-model", baseInstructions: "Use the assigned tools.", dynamicTools: [] });
    await bundle.transport.request("turn/start", { threadId: (opened.thread as { id: string }).id, input: [{ type: "text", text: "Use the tool." }] });
    await vi.waitFor(() => expect(tools()).toHaveLength(2), { timeout: 10_000 });
    expect(tools()).toMatchObject([
      { eventType: "tool.execution.started", executionId: "cloud-native-tool", transport: "builtin", name: "get_mcp_tools", status: "running", output: expect.stringContaining("Discovery failed [redacted] [redacted]") },
      { eventType: "tool.execution.completed", executionId: "cloud-native-tool", transport: "builtin", name: "get_mcp_tools", status: "failed", output: expect.stringContaining("Discovery failed [redacted] [redacted]") },
    ]);
    for (const tool of tools()) {
      expect(JSON.parse(String(tool.output))).toEqual({ error: { message: "Discovery failed [redacted] [redacted]" } });
      expect(tool).not.toHaveProperty("arguments");
      expect(JSON.stringify(tool)).not.toContain("synthetic-private-argument");
    }
    await bundle.transport.close();
    expect(bundle.evidence().runnerExited).toBe(true);
    await expect(stat(socketPath)).rejects.toHaveProperty("code", "ENOENT");
    const calls = (await readFile(fetchLog, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(call => call.path === "/v1/agents" && call.method === "POST")).toHaveLength(1);
    expect(calls.filter(call => call.path.endsWith("/cancel") && call.method === "POST")).toHaveLength(1);
  } finally {
    await bundle.transport.close().catch(() => undefined);
    await authority?.stop();
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

async function cloudQuestionHandoff(terminalDelayMs: number, governed: boolean) {
  const root = await mkdtemp("/tmp/cc-question-");
  const runtime = join(root, "cloud");
  const configPath = join(runtime, "config.json");
  const socketPath = join(root, "mcp.sock");
  const proxyPath = join(root, "cloud-proxy.cjs");
  const fetchLog = join(root, "controlled-fetches.jsonl");
  buildPrivateCursorCloudProxy(proxyPath);
  const runId = "run-22222222-2222-4222-8222-222222222222";
  const fixture = Buffer.from(`;(() => {
    const assert = require('node:assert/strict'), fs = require('node:fs');
    let agentId = '', status = 'RUNNING';
    const now = '2026-10-28T00:00:00Z', runId = ${JSON.stringify(runId)};
    const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    const run = () => ({ id: runId, agentId, status, createdAt: now, updatedAt: now });
    globalThis.fetch = async (input, init = {}) => {
      const target = new URL(String(input)); assert.equal(target.origin, 'https://api.cursor.com');
      const path = target.pathname, method = init.method ?? 'GET';
      fs.appendFileSync(${JSON.stringify(fetchLog)}, JSON.stringify({ method, path }) + '\\n', { mode: 0o600 });
      if (path === '/v1/agents' && method === 'POST') {
        agentId = JSON.parse(String(init.body)).agentId;
        return json({ agent: { id: agentId, status: 'ACTIVE', env: { type: 'cloud' }, url: 'https://cursor.com/agents/' + agentId, createdAt: now, updatedAt: now, latestRunId: runId }, run: run() });
      }
      assert.equal(path.startsWith('/v1/agents/' + agentId + '/runs/' + runId), true);
      if (path.endsWith('/stream') && method === 'GET') return new Response(new ReadableStream({ start(controller) {
        init.signal?.addEventListener('abort', () => { try { controller.close(); } catch {} }, { once: true });
      } }), { headers: { 'content-type': 'text/event-stream' } });
      if (path.endsWith('/cancel') && method === 'POST') { await new Promise(resolve => setTimeout(resolve, ${terminalDelayMs})); status = 'FINISHED'; return json({ id: runId }); }
      if (path.endsWith('/' + runId) && method === 'GET') return json(run());
      throw new Error('Unexpected controlled Cloud request');
    };
  })();\n`);
  const builtProxy = await readFile(proxyPath);
  const firstLine = builtProxy.indexOf(10) + 1;
  await writeFile(proxyPath, Buffer.concat([builtProxy.subarray(0, firstLine), fixture, builtProxy.subarray(firstLine)]), { mode: 0o600 });
  await mkdir(runtime, { mode: 0o700 });
  const normalizedSessionId = "cloud-question-session";
  const cursorCloud = { schema: "paperclip.cursor-cloud.config.v1" as const, repos: [{ url: "https://github.com/example/repo" }] };
  await writeFile(configPath, JSON.stringify({ ...cursorCloud, binding: { companyId: "company", agentId: "agent", issueId: "issue", normalizedSessionId } }), { mode: 0o600 });
  let authority: DurablePrpControlPlane | undefined;
  const bundle = createRunnerdCodexTransport({
    provider: "cursor_cloud", cursorCloud, stateDirectory: join(root, "runner-session"),
    runnerBinary: defaultCapabilityRunnerdBinary(), cursorCloudProxyPath: proxyPath,
    cursorCloudProxySha256: `sha256:${createHash("sha256").update(await readFile(proxyPath)).digest("hex")}`,
    lifecyclePolicy: { mode: "per_turn" },
    prpIdentity: { runnerInstanceId: "runner-cloud-question", environmentLeaseId: "lease-cloud-question",
      runId: "00000000-0000-4000-8000-000000000763", normalizedSessionId, turnId: "turn-cloud-question", itemId: "item-cloud-question" },
    environment: {
      PATH: process.env.PATH, CURSOR_API_KEY: "synthetic-cloud-launch-key",
      PAPERCLIP_CURSOR_CLOUD_CONFIG_PATH: configPath, PAPERCLIP_CURSOR_CLOUD_ARTIFACT_ROOT: join(runtime, "artifacts"),
      PAPERCLIP_CURSOR_CLOUD_RELAY_SOCKET_PATH: socketPath, PAPERCLIP_CURSOR_CLOUD_RELAY_TOKEN: "synthetic-cloud-relay-token",
      PAPERCLIP_CURSOR_CLOUD_RELAY_URL: "https://relay.example.test/mcp", PAPERCLIP_CURSOR_CLOUD_RELAY_EXPIRES_AT: String(Date.now() + 60_000),
    },
    controlPlaneRegistration: async core => { authority = core; await core.start(); return { release: () => undefined }; },
  });
  const questionApplied = vi.fn(async () => ({ success: true, contentItems: [{ type: "inputText", text: JSON.stringify({ status: "applied", questionId: "question-controlled" }) }] }));
  bundle.transport.setServerRequestHandler(questionApplied);
  const mcp = (body: Record<string, unknown>, sessionId?: string): Promise<{ sessionId?: string; value: any }> => new Promise((accept, reject) => {
    const req = request({ socketPath, path: "/mcp", method: "POST", headers: { Authorization: "Bearer synthetic-cloud-relay-token", "content-type": "application/json", ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) } }, response => {
      let text = "";
      response.on("data", chunk => { text += chunk; });
      response.on("end", () => accept({ sessionId: response.headers["mcp-session-id"] as string | undefined, value: JSON.parse(text) }));
    });
    req.on("error", reject);
    req.end(JSON.stringify({ jsonrpc: "2.0", ...body }));
  });
  try {
    if (governed) {
      await writeFile(join(root, "AGENTS.md"), "Keep assigned instructions.");
      const digest = "0".repeat(64);
      const context = {
        prompt: { revision: PAPERCLIP_EXECUTION_PROMPT_REVISION, text: PAPERCLIP_EXECUTION_PROMPT, digest: nativeRuntimePromptDigest() },
        instructions: { entryPath: "AGENTS.md", bundle: { schema: NATIVE_RUNTIME_ASSET_SCHEMA, digest, manifestDigest: digest, rootPath: root, fileCount: 1, totalBytes: 27 } },
        skills: [], mcp: { assignmentSetId: "none", digest, bindingId: null },
      };
      const input: NativeExecutionInputV5 = {
        schema: "paperclip.native-execution-input.v5", executionMode: "default", planningContext: null,
        binding: { companyId: "company", agentId: "agent", issueId: "issue", runId: "00000000-0000-4000-8000-000000000763", executionWorkspaceId: "workspace" },
        task: { identifier: "CLOUD-QUESTION", title: "Ask the assigned question", description: null, prompt: "Ask before proceeding.", workMode: "standard" },
        workspace: { cwd: root, repoUrl: null, repoRef: null, branchName: null },
        session: { normalizedSessionId, driverKind: "cursor_cloud_api", protocolVersion: 1, lifecyclePolicy: { mode: "per_turn", idleTimeoutMs: null } },
        provider: { kind: "cursor_cloud", model: "explicit-model", cursorCloud },
        runtimeContext: { ...context, aggregateDigest: canonicalNativeRuntimeContextDigest(context) },
        completionContract: { id: "contract", sha256: digest, schemaVersion: "paperclip.completion-contract.v1", contract: { revision: "1", objective: "Ask before proceeding.", criteria: [{ id: "question", requirement: "Request the response." }] } },
        interactionResponses: [], credentialBindings: [],
      };
      const yielded: PrpStructuredRunResult = {
        schema: "paperclip.run_result.v1", reportedWorkDisposition: "yielded", summary: "Waiting for the requested response.",
        completionClaim: { contractRevision: "1", objectiveSatisfied: false, criteria: [{ criterionId: "question", status: "unknown", evidenceRefs: ["interaction:pending"] }], remainingWork: [{ description: "Resume after the response.", blocksCompletion: true }] },
        evidence: [{ ref: "interaction:pending" }], verification: [], attentionRequests: [], artifacts: [{ kind: "issue_thread_interaction", ref: "interaction:pending" }],
        continuation: { kind: "response_wake", summary: "Resume from the answer.", idempotencyKey: "interaction-response:pending" },
      };
      const backend = createRunnerdNativeSessionBackend(input, { runnerInstanceId: "runner-cloud-question", transportFactory: () => bundle.transport,
        dynamicTools: [{ name: "request_human_input", description: "Ask the user a required question.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }],
        dynamicToolHandler: questionApplied,
      });
      const history: PrpEvent[] = [];
      const completeRun = vi.fn(async () => undefined);
      const execution = executeNativeSession({ input, backend, runnerInstanceId: "runner-cloud-question", controlPlaneInstanceId: "control-cloud-question", timeoutMs: 120_000,
        controlPlane: {
          async openRun() {}, async checkpointSession() {}, completeRun,
          async appendEvent(event) { history.push(event); return { cursor: history.length, highestContiguousSourceSeq: event.sourceSeq, disposition: "committed" }; },
          async replayEvents(replay) { return { events: history.filter(event => event.sourceInstanceId === replay.sourceInstanceId && event.sourceSeq > replay.afterSourceSeq), highestContiguousSourceSeq: 0 }; },
        },
        resolveGovernedWait: ({ event }) => event.eventType === "item.completed" && event.payload.kind === "dynamicToolCall" ? yielded : null,
      });
      void execution.catch(() => undefined);
      await Promise.race([execution, vi.waitFor(() => expect(authority?.store.state.commands.some(command => command.type === "turn.start" && command.status === "completed")).toBe(true), { timeout: 10_000 })]);
      const initialized = await mcp({ id: 0, method: "initialize" });
      const response = await mcp({ id: 1, method: "tools/call", params: { name: "request_human_input", arguments: {} } }, initialized.sessionId);
      expect(response.value.result.isError).not.toBe(true);
      await expect(execution).resolves.toMatchObject({ result: yielded });
      expect(completeRun).toHaveBeenCalledOnce();
      expect(history.some(event => event.eventType === "turn.interrupted")).toBe(true);
    } else {
    const opened = await bundle.transport.request("thread/start", { cwd: root, model: "explicit-model", baseInstructions: "Ask the assigned question.", dynamicTools: [{ name: "request_human_input", description: "Ask the user a required question.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }] });
    const threadId = (opened.thread as { id: string }).id;
    const started = await bundle.transport.request("turn/start", { threadId, input: [{ type: "text", text: "Ask before proceeding." }] });
    const initialized = await mcp({ id: 0, method: "initialize" });
    const response = await mcp({ id: 1, method: "tools/call", params: { name: "request_human_input", arguments: {} } }, initialized.sessionId);
    expect(response.value.result.isError).not.toBe(true);
    expect(JSON.stringify(response.value)).toContain("question-controlled");
    expect(questionApplied).toHaveBeenCalledOnce();
    await bundle.transport.request("turn/interrupt", { threadId, turnId: (started.turn as { id: string }).id });
    await vi.waitFor(() => expect(authority!.store.state.committedEvents.some(event => event.eventType === "turn.interrupted")).toBe(true), { timeout: 5_000 });
    expect(authority!.store.state.commands.some(command => command.type === "turn.stop")).toBe(false);
    expect(authority!.store.state.committedEvents.filter(event => ["turn.interrupted", "turn.completed", "turn.failed"].includes(event.eventType))).toHaveLength(1);
    expect(authority!.store.state.commands.filter(command => command.type === "semantic_tool.result")).toHaveLength(1);
    }
    await bundle.transport.close();
    expect(bundle.evidence().runnerExited).toBe(true);
    await expect(stat(socketPath)).rejects.toHaveProperty("code", "ENOENT");
    const calls = (await readFile(fetchLog, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(call => call.path === "/v1/agents" && call.method === "POST")).toHaveLength(1);
    expect(calls.filter(call => call.path.endsWith("/cancel") && call.method === "POST")).toHaveLength(1);
  } finally {
    await bundle.transport.close().catch(() => undefined);
    await authority?.stop();
    await rm(root, { recursive: true, force: true });
  }
}

it.each([0, 18_000])("delivers an applied Cloud question and courtesy-interrupt terminal without Stop (%ims)", async terminalDelayMs => {
  await cloudQuestionHandoff(terminalDelayMs, false);
}, 40_000);

it.each([0, 18_000])("settles a governed Cloud question after its allowed cancellation latency (%ims)", async terminalDelayMs => {
  await cloudQuestionHandoff(terminalDelayMs, true);
}, 45_000);
