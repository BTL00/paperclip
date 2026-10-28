import { randomUUID } from "node:crypto";
import { chmod, lstat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { HarnessDriver, HarnessDriverDescriptor, HarnessSession, HarnessSessionRecoveryOptions, OpenHarnessSessionInput, PersistedHarnessSession } from "../../contracts/harness-driver.js";
import { HarnessCapabilityUnavailableError, HarnessReconciliationError, HarnessStaleTurnError } from "../../contracts/harness-driver.js";
import type { NativeRuntimeContextSnapshot } from "../../contracts/runtime-context.js";
import type { NativeUserMessage } from "../../contracts/types.js";
import { CURSOR_CLOUD_DEFAULT_TIMEOUT_MS } from "../../contracts/cursor-cloud.js";
import { PRP_BLOCK_TOOL_NAME, PRP_COMPLETION_TOOL_NAME } from "../../contracts/completion-result.js";
import type { PrpEvent } from "../../protocol/replay-contract.js";
import { startRunnerToolBridge, type RunnerToolBridge, type RunnerToolCall } from "../runner-tool-bridge.js";
import { semanticCanonicalJson } from "../semantic-tool-receipt.js";
import { CursorCloudClient, CursorCloudClientError, isCursorCloudRunActive, type CursorCloudModelRef, type CursorCloudRun, type CursorCloudSseEvent } from "./cloud-client.js";
import { parseNativeCursorCloudConfig, parseCursorCloudBinding, type NativeCursorCloudConfig, type CursorCloudBinding } from "./config.js";
import { CursorCloudCheckpointStore, cursorCloudDigest, type CursorCloudCheckpoint } from "./checkpoint.js";
import { cursorCloudInlineInstructions } from "./inline-assets.js";
import { stageCursorCloudArtifact } from "./artifact-delivery.js";
import { releaseCursorCloudStaleSocket } from "./stale-socket.js";

export const CURSOR_CLOUD_DRIVER_KIND = "cursor_cloud_api" as const;
export const CURSOR_CLOUD_DRIVER_VERSION = "cursor-cloud-v1" as const;
type CloudClient = Pick<CursorCloudClient, "createAgent" | "createRun" | "getAgent" | "getRun" | "cancelRun" | "streamRun" | "getUsage" | "listArtifacts" | "downloadArtifact">;

export interface CursorCloudDriverOptions {
  model: string;
  modelParams?: CursorCloudModelRef["params"];
  config: NativeCursorCloudConfig;
  binding: CursorCloudBinding;
  runtimeDirectory: string;
  artifactRoot?: string;
  relay: { url: string; token: string; socketPath: string; expiresAt: number };
  instructions: string;
  runtimeContext?: NativeRuntimeContextSnapshot | null;
  dynamicTools?: readonly Readonly<Record<string, unknown>>[];
  dynamicToolHandler(call: { tool: string; callId: string; threadId: string; turnId: string; arguments: unknown }): Promise<unknown>;
  environment?: NodeJS.ProcessEnv;
  client?: CloudClient;
  runnerInstanceId?: string;
  cancelTimeoutMs?: number;
  reconnectDelayMs?: number;
}

class EventQueue {
  #events: PrpEvent[] = [];
  #waiter: ((result: IteratorResult<PrpEvent>) => void) | null = null;
  #closed = false;
  push(event: PrpEvent): void {
    if (this.#closed) return;
    if (this.#waiter) { const waiter = this.#waiter; this.#waiter = null; waiter({ value: event, done: false }); return; }
    if (this.#events.length >= 2_048) throw new Error("Cursor Cloud event consumer exceeded its bounded queue");
    this.#events.push(event);
  }
  close(): void { this.#closed = true; this.#waiter?.({ value: undefined, done: true }); this.#waiter = null; }
  async *stream(): AsyncGenerator<PrpEvent> {
    while (true) {
      if (this.#events.length) { yield this.#events.shift()!; continue; }
      if (this.#closed) return;
      const result = await new Promise<IteratorResult<PrpEvent>>(resolveValue => { this.#waiter = resolveValue; });
      if (result.done) return;
      yield result.value;
    }
  }
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function active(cp: CursorCloudCheckpoint): boolean { return cp.phase === "creating" || cp.phase === "running" || cp.phase === "stopping"; }
function boundedPositive(value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > 120_000) throw new Error("Cursor Cloud lifecycle timeout exceeds its bound");
  return result;
}
async function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let cancelled!: () => void;
  const cancellation = new Promise<never>((_resolve, reject) => { cancelled = () => reject(new Error("Cursor Cloud lifecycle deadline expired")); signal.addEventListener("abort", cancelled, { once: true }); });
  try { return await Promise.race([operation, cancellation]); }
  finally { signal.removeEventListener("abort", cancelled); }
}

export function cursorCloudDriverDescriptor(): HarnessDriverDescriptor {
  return { kind: CURSOR_CLOUD_DRIVER_KIND, displayName: "Cursor Cloud (experimental)", version: CURSOR_CLOUD_DRIVER_VERSION, protocolVersion: "http+sse/v1",
    runtimeContextCapabilities: { instructions: "native", skills: "native", mcp: "native" },
    capabilities: { resume: true, typedEvents: true, steering: false, queuedFollowUp: false, interruption: true, structuredResult: true, read: true, reconciliation: true, usage: false, dynamicTools: true, toolRefreshOnResume: true, runtimeRequestResolution: false, runtimeRequestHandoff: false, goals: false, threadLineage: false,
      unsupported: ["native_permissions", "native_questions", "native_plan_decisions", "preprompt_model_acknowledgment", "preprompt_instruction_acknowledgment", "per_run_dollar_limit", "production_usage_accounting", "persistent_agent_directory", "binary_skill_assets", "steering", "goals", "threadLineage"] } };
}

export class CursorCloudDriver implements HarnessDriver {
  readonly #options: CursorCloudDriverOptions;
  constructor(options: CursorCloudDriverOptions) {
    const model = options.model.trim();
    if (!model || model.length > 512 || /[\x00-\x1f\x7f]/.test(model)) throw new Error("Cursor Cloud requires an explicit model ID");
    const relay = new URL(options.relay.url);
    if (relay.protocol !== "https:" || relay.username || relay.password || relay.search || relay.hash) throw new Error("Cursor Cloud semantic relay requires a public credential-free HTTPS URL");
    if (!options.relay.token || /[\r\n\0]/.test(options.relay.token)) throw new Error("Cursor Cloud semantic relay token is required");
    if (!Number.isSafeInteger(options.relay.expiresAt) || options.relay.expiresAt <= 0) throw new Error("Cursor Cloud semantic relay expiry is required");
    if (!isAbsolute(options.runtimeDirectory) || !isAbsolute(options.relay.socketPath)) throw new Error("Cursor Cloud relay socket and runtime directory must be absolute controller bindings");
    this.#options = { ...options, model, config: parseNativeCursorCloudConfig(options.config), binding: parseCursorCloudBinding(options.binding) };
  }
  async descriptor(): Promise<HarnessDriverDescriptor> {
    return cursorCloudDriverDescriptor();
  }
  async openSession(input: OpenHarnessSessionInput): Promise<HarnessSession> { return this.#open(input, false); }
  async recoverSession(snapshot: PersistedHarnessSession, options?: HarnessSessionRecoveryOptions) {
    if (snapshot.driverKind !== CURSOR_CLOUD_DRIVER_KIND) return { recovered: false, reason: "Cursor Cloud recovery driver mismatch" };
    const session = await this.#open({ runId: snapshot.runId ?? "", normalizedSessionId: snapshot.normalizedSessionId ?? snapshot.driverSessionId, workingDirectory: snapshot.workingDirectory ?? this.#options.runtimeDirectory, signal: options?.signal }, true, snapshot.driverSessionId);
    return { recovered: true, session };
  }
  async #open(input: OpenHarnessSessionInput, recovering: boolean, sessionId = input.normalizedSessionId): Promise<CursorCloudSession> {
    input.signal?.throwIfAborted();
    if (!input.runId || input.normalizedSessionId !== this.#options.binding.normalizedSessionId) throw new Error("Cursor Cloud session binding mismatch");
    const instructions = await cursorCloudInlineInstructions(this.#options.instructions, this.#options.runtimeContext);
    input.signal?.throwIfAborted();
    const store = new CursorCloudCheckpointStore(this.#options.runtimeDirectory, sessionId);
    await store.acquire();
    let opened: CursorCloudSession | null = null;
    try {
      const existing = await store.read();
      if (recovering !== Boolean(existing)) throw new Error(recovering ? "Cursor Cloud checkpoint is missing; refusing a replacement remote create" : "Cursor Cloud checkpoint already exists; resume it explicitly");
      const bindingDigest = cursorCloudDigest(semanticCanonicalJson(this.#options.binding));
      const configDigest = cursorCloudDigest(semanticCanonicalJson(this.#options.config));
      const modelDigest = cursorCloudDigest(semanticCanonicalJson({ id: this.#options.model, params: this.#options.modelParams ?? [] }));
      const instructionsDigest = cursorCloudDigest(instructions);
      if (existing && (existing.driverSessionId !== sessionId || existing.normalizedSessionId !== input.normalizedSessionId || existing.bindingDigest !== bindingDigest || existing.configDigest !== configDigest || existing.modelDigest !== modelDigest || (active(existing) && (existing.instructionsDigest !== instructionsDigest || existing.ownerRunId !== input.runId)))) throw new Error("Cursor Cloud recovery identity/configuration/instructions changed");
      const checkpoint: CursorCloudCheckpoint = existing ?? { schema: "paperclip.cursor-cloud.checkpoint.v1", driverSessionId: sessionId, normalizedSessionId: input.normalizedSessionId, bindingDigest, configDigest, modelDigest, instructionsDigest, instructionsRevisionPending: false, ownerRunId: input.runId, agentId: null, runId: null, turnId: null, phase: "idle", pendingOperation: null, idempotencyKey: null, requestedAgentId: null, requestDigest: null, lastEventId: null, lastEventFingerprints: [], sourceSequence: 0, terminalStatus: null, deadlineAt: null, acceptedCompletion: null };
      if (checkpoint.instructionsDigest !== instructionsDigest) { checkpoint.instructionsDigest = instructionsDigest; checkpoint.instructionsRevisionPending = true; }
      checkpoint.ownerRunId = input.runId;
      await store.write(checkpoint);
      opened = new CursorCloudSession(this.#options, input, instructions, checkpoint, store);
      await opened.initialize();
      input.signal?.throwIfAborted();
      opened.startRecovery();
      return opened;
    } catch (error) {
      if (opened) await opened.detachControllerForRestart().catch(() => store.release());
      else await store.release();
      throw error;
    }
  }
}

class CursorCloudSession implements HarnessSession {
  readonly #options: CursorCloudDriverOptions;
  readonly #input: OpenHarnessSessionInput;
  readonly #instructions: string;
  readonly #cp: CursorCloudCheckpoint;
  readonly #store: CursorCloudCheckpointStore;
  readonly #client: CloudClient;
  readonly #events = new EventQueue();
  readonly #transcript: PrpEvent[] = [];
  readonly #cancelTimeoutMs: number;
  #bridge: RunnerToolBridge | null = null;
  #closed = false;
  #stopping = false;
  #streamAbort: AbortController | null = null;
  #launch: Promise<void> | null = null;
  #work: Promise<void> | null = null;
  #stop: Promise<void> | null = null;
  #turnDeadline: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CursorCloudDriverOptions, input: OpenHarnessSessionInput, instructions: string, checkpoint: CursorCloudCheckpoint, store: CursorCloudCheckpointStore) {
    this.#options = options; this.#input = input; this.#instructions = instructions; this.#cp = checkpoint; this.#store = store;
    this.#client = options.client ?? new CursorCloudClient({ apiKey: options.environment?.CURSOR_API_KEY ?? "" });
    this.#cancelTimeoutMs = boundedPositive(options.cancelTimeoutMs, 20_000);
  }
  async initialize(): Promise<void> {
    const socketDirectory = await lstat(dirname(this.#options.relay.socketPath));
    if (!socketDirectory.isDirectory() || socketDirectory.isSymbolicLink() || (socketDirectory.mode & 0o077) !== 0 || (process.getuid && socketDirectory.uid !== process.getuid())) throw new Error("Cursor Cloud relay socket directory must be owned and private (0700)");
    await releaseCursorCloudStaleSocket(this.#options.relay.socketPath, this.#store.recoveredDeadOwner);
    const tools = [...(this.#options.dynamicTools ?? []).filter(tool => tool.name !== PRP_COMPLETION_TOOL_NAME && tool.name !== PRP_BLOCK_TOOL_NAME && tool.name !== "list_cursor_cloud_artifacts").map(tool => tool.name === "register_deliverable"
      ? { ...tool, description: `${tool.description ?? "Register an inspectable file result."} Cursor Cloud: create the file in the provider artifacts directory, discover its exact path with list_cursor_cloud_artifacts, then use contentRef cursor-artifact:<exact listed relative artifact path>. Supply the actual filename, byteSize and lowercase SHA-256; these are independently verified before registration. Cloud filesystem paths and host paths are not accepted.` }
      : tool), { name: "list_cursor_cloud_artifacts", description: "List files exposed by the current Cursor Cloud Agent artifact API. Use the exact returned relative path in register_deliverable contentRef cursor-artifact:<path>. This read-only provider helper does not register a deliverable.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }];
    this.#bridge = await startRunnerToolBridge({ socketPath: this.#options.relay.socketPath, secret: this.#options.relay.token, tools, preserveToolNames: true, timeoutMs: null,
      sessionScope: () => this.#closed || this.#stopping || !active(this.#cp) ? null : this.#cp.turnId,
      handler: call => this.#dispatch(call) });
    const socket = await lstat(this.#options.relay.socketPath);
    if (!socket.isSocket() || socket.isSymbolicLink() || (process.getuid && socket.uid !== process.getuid())) throw new Error("Cursor Cloud bound relay socket ownership is unsafe");
    await chmod(this.#options.relay.socketPath, 0o600);
    const secured = await lstat(this.#options.relay.socketPath);
    if (!secured.isSocket() || secured.isSymbolicLink() || secured.ino !== socket.ino || secured.dev !== socket.dev || (secured.mode & 0o777) !== 0o600 || (process.getuid && secured.uid !== process.getuid())) throw new Error("Cursor Cloud bound relay socket changed while securing it");
  }
  startRecovery(): void { if (active(this.#cp)) this.#work = this.#recoverActive().catch(error => this.#unresolved(error)); }
  ids() { return { driverSessionId: this.#cp.driverSessionId, providerSessionId: this.#cp.agentId, displayId: this.#cp.agentId ?? this.#cp.driverSessionId }; }
  events(): AsyncIterable<PrpEvent> { return this.#events.stream(); }
  turnControlCapabilities() { return { steering: false, queuedFollowUp: false }; }
  async attachRun(input: { runId: string }): Promise<void> {
    if (active(this.#cp) || this.#closed) throw new Error("Cursor Cloud cannot replace an active run binding");
    this.#cp.ownerRunId = input.runId; await this.#store.write(this.#cp);
  }
  async startTurn(input: { message: NativeUserMessage; requestedCollaborationMode?: "default" | "plan" }): Promise<{ turnId: string; effectiveCollaborationMode: "default" }> {
    if (input.requestedCollaborationMode === "plan") throw new HarnessCapabilityUnavailableError("plan", "native Cloud plan decisions are unsupported");
    if (this.#closed || active(this.#cp)) throw new Error("Cursor Cloud session is closed or has unresolved remote work");
    if (this.#options.relay.expiresAt <= Date.now()) throw new Error("Cursor Cloud semantic relay capability expired; only recovery cleanup is permitted");
    if (!input.message.text.trim() || Buffer.byteLength(input.message.text) > 1_048_576) throw new Error("Cursor Cloud turn text is empty or exceeds its bound");
    const turnId = `turn-${randomUUID()}`;
    const first = this.#cp.agentId === null;
    const prompt = first || this.#cp.instructionsRevisionPending ? `${this.#instructions}\n\nPaperclip task:\n${input.message.text}` : input.message.text;
    const request = { prompt: { text: prompt }, model: { id: this.#options.model, ...(this.#options.modelParams ? { params: this.#options.modelParams } : {}) }, mode: "agent" as const,
      mcpServers: [{ name: "paperclip", type: "http" as const, url: this.#options.relay.url, headers: { Authorization: `Bearer ${this.#options.relay.token}` } }] };
    this.#cp.turnId = turnId; this.#cp.runId = null; this.#cp.phase = "creating"; this.#cp.pendingOperation = first ? "create_agent" : "create_run";
    this.#cp.requestedAgentId = first ? `bc-${randomUUID()}` : null; this.#cp.idempotencyKey = `paperclip-${randomUUID()}`;
    this.#cp.requestDigest = cursorCloudDigest(semanticCanonicalJson(request)); this.#cp.lastEventId = null; this.#cp.lastEventFingerprints = []; this.#cp.terminalStatus = null; this.#cp.acceptedCompletion = null;
    this.#cp.deadlineAt = Date.now() + (this.#options.config.timeoutMs ?? CURSOR_CLOUD_DEFAULT_TIMEOUT_MS);
    this.#stopping = false; this.#stop = null;
    await this.#store.write(this.#cp);
    this.#emit("turn.started", { provider: "cursor_cloud", submittedModel: this.#options.model, effectiveModelAcknowledged: false, instructionsAcknowledged: false });
    this.#publishRemoteIdentity();
    this.#armDeadline(); this.#streamAbort = new AbortController();
    this.#launch = (async () => {
      const options = { signal: this.#streamAbort!.signal, idempotencyKey: this.#cp.idempotencyKey! };
      const { schema: _schema, timeoutMs: _timeoutMs, ...cloudConfiguration } = this.#options.config;
      const response = first
        ? await this.#client.createAgent({ ...cloudConfiguration, ...request, agentId: this.#cp.requestedAgentId! }, options)
        : await this.#client.createRun(this.#cp.agentId!, request, options);
      this.#cp.agentId = response.run.agentId; this.#cp.runId = response.run.id; this.#cp.pendingOperation = null; this.#cp.instructionsRevisionPending = false;
      if (!this.#stopping) this.#cp.phase = "running";
      await this.#store.write(this.#cp);
      this.#publishRemoteIdentity();
    })();
    this.#work = this.#launch.then(async () => { if (!this.#stopping) await this.#observe(); }, error => this.#unresolved(error, true)).catch(error => this.#unresolved(error));
    return { turnId, effectiveCollaborationMode: "default" };
  }
  async interrupt(input: { turnId?: string; signal?: AbortSignal } = {}): Promise<void> {
    if (input.turnId && input.turnId !== this.#cp.turnId) throw new HarnessStaleTurnError(input.turnId);
    if (!active(this.#cp)) return;
    this.#stop ??= this.#interrupt(input.signal).finally(() => { this.#stop = null; });
    return this.#stop;
  }
  async #interrupt(signal?: AbortSignal): Promise<void> {
    this.#stopping = true; this.#cp.phase = "stopping";
    await this.#store.write(this.#cp); this.#streamAbort?.abort();
    const abort = new AbortController();
    const cancelled = () => abort.abort();
    signal?.addEventListener("abort", cancelled, { once: true }); if (signal?.aborted) abort.abort();
    const timer = setTimeout(() => abort.abort(), this.#cancelTimeoutMs);
    try {
      if (this.#launch) await withAbort(this.#launch.catch(() => {}), abort.signal);
      await this.#resolvePending(abort.signal);
      if (!this.#cp.agentId || !this.#cp.runId) throw new HarnessReconciliationError("Cursor Cloud pending create has no confirmed run");
      let run = await this.#client.getRun(this.#cp.agentId, this.#cp.runId, { signal: abort.signal });
      if (isCursorCloudRunActive(run.status)) {
        try { await this.#client.cancelRun(run.agentId, run.id, { signal: abort.signal }); }
        catch (error) { if (!(error instanceof CursorCloudClientError && error.providerCode === "run_not_cancellable")) throw error; }
        do {
          run = await this.#client.getRun(run.agentId, run.id, { signal: abort.signal });
          if (!isCursorCloudRunActive(run.status)) break;
          await delay(100, undefined, { signal: abort.signal });
        } while (!abort.signal.aborted);
      }
      if (isCursorCloudRunActive(run.status)) throw new Error("Remote work remains active");
      await this.#settle(run, true);
    } catch { throw new HarnessReconciliationError("Cursor Cloud Stop did not confirm remote terminal state; the run remains fenced"); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", cancelled); }
  }
  async #resolvePending(signal?: AbortSignal): Promise<void> {
    if (this.#cp.pendingOperation === "create_agent") {
      const agent = await this.#client.getAgent(this.#cp.requestedAgentId!, { signal });
      if (!agent.latestRunId) throw new HarnessReconciliationError("Cursor Cloud pending create has no observable run");
      this.#cp.agentId = agent.id; this.#cp.runId = agent.latestRunId; this.#cp.pendingOperation = null; this.#cp.instructionsRevisionPending = false; await this.#store.write(this.#cp);
    } else if (this.#cp.pendingOperation === "create_run") {
      throw new HarnessReconciliationError("Cursor Cloud follow-up outcome is unknown; refusing duplicate create or unbound cancellation");
    }
  }
  async #recoverActive(): Promise<void> {
    await this.#resolvePending();
    if (!this.#cp.agentId || !this.#cp.runId) throw new HarnessReconciliationError("Cursor Cloud recovery is missing remote identity");
    this.#emit("turn.started", { recovered: true, submittedModel: this.#options.model, effectiveModelAcknowledged: false, instructionsAcknowledged: false });
    this.#publishRemoteIdentity();
    const run = await this.#client.getRun(this.#cp.agentId, this.#cp.runId);
    if (!isCursorCloudRunActive(run.status)) { await this.#settle(run, this.#cp.phase === "stopping"); return; }
    if (this.#cp.phase === "stopping" || this.#cp.deadlineAt === null || this.#cp.deadlineAt <= Date.now()) { await this.interrupt(); return; }
    this.#armDeadline(); await this.#observe();
  }
  async #observe(): Promise<void> {
    for (let attempt = 0; attempt < 4 && !this.#stopping && !this.#closed; attempt += 1) {
      this.#streamAbort = new AbortController();
      try {
        for await (const event of this.#client.streamRun(this.#cp.agentId!, this.#cp.runId!, { signal: this.#streamAbort.signal, ...(this.#cp.lastEventId ? { lastEventId: this.#cp.lastEventId } : {}) })) {
          if (this.#stopping || this.#closed || !active(this.#cp)) return;
          await this.#consume(event);
          if (event.event === "result" || event.event === "done") break;
        }
      } catch (error) {
        if (this.#stopping || this.#closed) return;
        if (error instanceof CursorCloudClientError && error.status === 410) this.#emit("harness.diagnostic", { code: "cursor_cloud_stream_expired", message: "Cursor Cloud stream retention expired; reconciling saved run state." });
        else if (attempt === 3) throw error;
      }
      if (this.#stopping || this.#closed) return;
      const run = await this.#client.getRun(this.#cp.agentId!, this.#cp.runId!);
      if (!isCursorCloudRunActive(run.status)) { await this.#settle(run); return; }
      if (attempt === 3) throw new HarnessReconciliationError("Cursor Cloud stream ended while remote work remains active");
      await delay(boundedPositive(this.#options.reconnectDelayMs, Math.min(250 * 2 ** attempt, 2_000)));
    }
  }
  async #consume(event: CursorCloudSseEvent): Promise<void> {
    const fingerprint = cursorCloudDigest(semanticCanonicalJson(event));
    if (event.id && event.id === this.#cp.lastEventId && this.#cp.lastEventFingerprints.includes(fingerprint)) return;
    const data = record(event.data);
    if (event.event === "status" || event.event === "result") {
      if (data.runId !== this.#cp.runId || !["CREATING", "RUNNING", "WAITING_FOR_BACKGROUND_WORK", "FINISHED", "ERROR", "CANCELLED", "EXPIRED"].includes(String(data.status))) throw new Error("Cursor Cloud stream lifecycle event has an invalid run identity/status");
    }
    if (event.event === "assistant" && typeof data.text === "string") this.#emit("item.delta", { kind: "agentMessage", text: this.#redact(data.text) }, "assistant");
    else if (event.event === "thinking" && typeof data.text === "string") this.#emit("item.delta", { kind: "reasoning", text: this.#redact(data.text) }, "reasoning");
    else if (event.event === "tool_call") {
      if (typeof data.callId !== "string" || !data.callId || data.callId.length > 512 || typeof data.name !== "string" || data.name.length > 512 || !["running", "completed", "error"].includes(String(data.status))) throw new Error("Cursor Cloud tool event omitted identity or status");
      this.#emit(data.status === "running" ? "item.started" : "item.completed", { kind: "tool", item: { id: data.callId, type: "mcpToolCall", name: data.name, status: data.status, ...(data.args === undefined ? {} : { arguments: this.#redactJson(data.args) }), ...(data.result === undefined ? {} : { result: this.#redactJson(data.result) }), ...(data.truncated ? { truncated: data.truncated } : {}) } }, data.callId);
    } else if (event.event === "error") this.#emit("harness.diagnostic", { code: "cursor_cloud_stream_error", message: "Cursor Cloud stream reported an error; checking the saved run." });
    if (event.id) {
      if (event.id !== this.#cp.lastEventId) this.#cp.lastEventFingerprints = [];
      if (this.#cp.lastEventFingerprints.length >= 32) throw new Error("Cursor Cloud event cursor has too many variants");
      this.#cp.lastEventId = event.id; this.#cp.lastEventFingerprints.push(fingerprint);
    }
    await this.#store.write(this.#cp);
  }
  async #settle(run: CursorCloudRun, interrupted = false): Promise<void> {
    if (!isCursorCloudRunActive(run.status) && active(this.#cp)) {
      const turnId = this.#cp.turnId!;
      this.#cp.phase = "terminal"; this.#cp.terminalStatus = run.status; this.#cp.pendingOperation = null; this.#cp.deadlineAt = null; this.#clearDeadline();
      await this.#store.write(this.#cp);
      if (run.result) this.#emit("item.completed", { kind: "agentMessage", text: this.#redact(run.result), channel: "final" }, "final", turnId);
      this.#emit(interrupted || run.status === "CANCELLED" ? "turn.interrupted" : run.status === "FINISHED" ? "turn.completed" : "turn.failed", { providerStatus: run.status, remoteTerminalConfirmed: true, semanticCompletionAccepted: this.#cp.acceptedCompletion !== null, ...(run.status === "ERROR" || run.status === "EXPIRED" ? { error: { code: `cursor_cloud_${run.status.toLowerCase()}`, message: "Cursor Cloud run ended without successful provider completion." } } : {}) }, undefined, turnId);
    }
  }
  async #dispatch(call: RunnerToolCall): Promise<unknown> {
    const turnId = this.#cp.turnId;
    if (this.#closed || this.#stopping || !turnId || !active(this.#cp) || this.#cp.acceptedCompletion || call.signal.aborted) throw new Error("Cursor Cloud tool call has no current run authority");
    if (call.tool === "list_cursor_cloud_artifacts") {
      if (!this.#cp.agentId) throw new Error("Cursor Cloud Agent artifact identity is not confirmed");
      const listed = await this.#client.listArtifacts(this.#cp.agentId, { signal: call.signal });
      if (listed.items.length > 256) throw new Error("Cursor Cloud artifact catalog exceeds its 256-file bound");
      const result = { items: listed.items.map(item => ({ path: item.path, sizeBytes: item.sizeBytes })) };
      if (Buffer.byteLength(JSON.stringify(result)) > 65_536) throw new Error("Cursor Cloud artifact catalog exceeds its byte bound");
      if (this.#closed || this.#stopping || call.signal.aborted || this.#cp.turnId !== turnId || !active(this.#cp)) throw new Error("Cursor Cloud artifact list arrived after run authority ended");
      return result;
    }
    const callId = `${turnId}:${call.callId}`;
    let args = call.arguments;
    let normalized: (() => void) | undefined;
    if (call.tool === "register_deliverable") {
      if (!this.#options.artifactRoot || !this.#cp.agentId) throw new Error("Cursor Cloud artifact registration is not bound to an admitted run/root");
      args = await stageCursorCloudArtifact({ arguments: args, agentId: this.#cp.agentId, runtimeDirectory: this.#options.runtimeDirectory, artifactRoot: this.#options.artifactRoot, client: this.#client, signal: call.signal });
      normalized = call.captureNormalizedInput?.(args);
    }
    if (this.#stopping || this.#closed || call.signal.aborted || this.#cp.turnId !== turnId) throw new Error("Cursor Cloud run stopped before tool forwarding");
    const response = this.#options.dynamicToolHandler({ tool: call.tool, callId, threadId: this.#cp.driverSessionId, turnId, arguments: args });
    normalized?.();
    const result = await response;
    if (this.#closed || this.#stopping || this.#cp.turnId !== turnId || !active(this.#cp) || call.signal.aborted) throw new Error("Cursor Cloud tool result arrived after its run authority ended");
    if ((call.tool === PRP_COMPLETION_TOOL_NAME || call.tool === PRP_BLOCK_TOOL_NAME) && record(result).success === true) {
      this.#cp.acceptedCompletion = { callIdDigest: cursorCloudDigest(callId), inputDigest: cursorCloudDigest(semanticCanonicalJson(call.arguments)), resultDigest: cursorCloudDigest(semanticCanonicalJson(result)), turnId };
      await this.#store.write(this.#cp);
    }
    return result;
  }
  #armDeadline(): void {
    this.#clearDeadline();
    this.#turnDeadline = setTimeout(() => { void this.interrupt().catch(error => this.#unresolved(error)); }, Math.max(0, (this.#cp.deadlineAt ?? 0) - Date.now()));
    this.#turnDeadline.unref?.();
  }
  #clearDeadline(): void { if (this.#turnDeadline) clearTimeout(this.#turnDeadline); this.#turnDeadline = null; }
  #publishRemoteIdentity(): void {
    const agentId = this.#cp.agentId ?? this.#cp.requestedAgentId;
    if (!agentId) return;
    this.#emit("harness.diagnostic", { code: "cursor_cloud_remote_identity", message: JSON.stringify({ schema: "paperclip.cursor-cloud.remote-identity.v1", provider: "cursor_cloud", agentId, runId: this.#cp.runId, ownerRunId: this.#cp.ownerRunId, normalizedSessionId: this.#cp.normalizedSessionId, phase: this.#cp.phase }) });
  }
  async #unresolved(error: unknown, directMutationFailure = false): Promise<void> {
    if (this.#closed) return;
    if (directMutationFailure && !this.#stopping && this.#cp.phase === "creating" && error instanceof CursorCloudClientError
      && error.status !== undefined && [400, 401, 403, 404, 422].includes(error.status)) {
      this.#cp.phase = "idle"; this.#cp.pendingOperation = null; this.#cp.requestedAgentId = null; this.#cp.terminalStatus = "REJECTED"; this.#clearDeadline();
      await this.#store.write(this.#cp);
      this.#emit("turn.failed", { error: { code: error.providerCode ?? "cursor_cloud_launch_rejected", message: "Cursor Cloud rejected the run before accepting provider work. Check the configured account, repository access and explicit model." }, remoteWorkAccepted: false });
      return;
    }
    this.#emit("harness.diagnostic", { code: "cursor_cloud_remote_state_unknown", message: "Cursor Cloud work could not be reconciled. Saved identity is retained; no replacement work was created. Stop or reconnect to reconcile it." });
  }
  #redact(text: string): string {
    return this.#redactUnbounded(text).slice(0, 65_536);
  }
  #redactUnbounded(text: string): string {
    for (const secret of [this.#options.environment?.CURSOR_API_KEY, this.#options.relay.token]) if (secret) text = text.replaceAll(secret, "[redacted]");
    return text;
  }
  #redactJson(value: unknown): unknown {
    const text = this.#redactUnbounded(JSON.stringify(value));
    return Buffer.byteLength(text) > 65_536 ? { omitted: true, reason: "payload_limit" } : JSON.parse(text);
  }
  #emit(eventType: PrpEvent["eventType"], payload: Record<string, unknown>, itemId?: string, turnId = this.#cp.turnId ?? undefined): void {
    if (this.#closed) return;
    const seq = ++this.#cp.sourceSequence;
    const event: PrpEvent = { schema: "paperclip.prp.event.v1", schemaVersion: 1, sourceEventId: `cursor-cloud:${this.#cp.ownerRunId}:${seq}`, sourceSeq: seq, sourceInstanceId: this.#options.runnerInstanceId ?? "cursor-cloud-sidecar", sourceKind: "runner", runId: this.#cp.ownerRunId, normalizedSessionId: this.#cp.normalizedSessionId, ...(turnId ? { turnId } : {}), ...(itemId ? { itemId } : {}), eventType, priority: 1, emittedAt: new Date().toISOString(), payload };
    this.#transcript.push(event); if (this.#transcript.length > 1_024) this.#transcript.shift(); this.#events.push(event);
  }
  async read(): Promise<Record<string, unknown>> { return { provider: "cursor_cloud", agentId: this.#cp.agentId, runId: this.#cp.runId, turnId: this.#cp.turnId, phase: this.#cp.phase, providerStatus: this.#cp.terminalStatus, submittedModel: this.#options.model, effectiveModelAcknowledged: false, instructionsDigest: this.#cp.instructionsDigest, instructionsAcknowledged: false, semanticCompletionReceipt: this.#cp.acceptedCompletion }; }
  async reconcile(): Promise<Record<string, unknown>> {
    await this.#resolvePending();
    if (this.#cp.agentId && this.#cp.runId) { const run = await this.#client.getRun(this.#cp.agentId, this.#cp.runId); if (!isCursorCloudRunActive(run.status)) await this.#settle(run); }
    return this.read();
  }
  async usage(): Promise<Record<string, unknown> | null> { return this.#cp.agentId ? { ...(await this.#client.getUsage(this.#cp.agentId, this.#cp.runId ? { runId: this.#cp.runId } : {})), cost: null, costUnavailable: true } : null; }
  async transcript() { return { schema: "paperclip-runner/harness-transcript/v1" as const, complete: this.#transcript.length < 1_024, eventCount: this.#transcript.length, events: structuredClone(this.#transcript), omissionReason: this.#transcript.length >= 1_024 ? "bounded_history" : null }; }
  async snapshot(): Promise<PersistedHarnessSession> { await this.#store.write(this.#cp); return { driverKind: CURSOR_CLOUD_DRIVER_KIND, driverSessionId: this.#cp.driverSessionId, providerSessionId: this.#cp.agentId, workingDirectory: this.#input.workingDirectory, runId: this.#cp.ownerRunId, normalizedSessionId: this.#cp.normalizedSessionId, activeTurnId: active(this.#cp) ? this.#cp.turnId : null, lastSourceSequence: this.#cp.sourceSequence }; }
  async detachControllerForRestart(): Promise<void> { this.#closed = true; this.#streamAbort?.abort(); this.#clearDeadline(); await this.#bridge?.close(); this.#events.close(); await this.#store.write(this.#cp); await this.#store.release(); }
  async close(_input: { reason: string; force?: boolean }): Promise<void> {
    if (this.#closed) return;
    let failure: unknown;
    try { if (active(this.#cp)) await this.interrupt(); } catch (error) { failure = error; }
    this.#closed = true; this.#streamAbort?.abort(); this.#clearDeadline();
    await this.#bridge?.close(); this.#events.close(); await this.#store.write(this.#cp); await this.#store.release();
    if (failure) throw failure;
  }
}
