import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { semanticCanonicalJson } from "../semantic-tool-receipt.js";
import { archiveCursorCloudSessionCheckpoint, CursorCloudCheckpointStore, cursorCloudDigest, type CursorCloudCheckpoint } from "./checkpoint.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const binding = { companyId: "company", agentId: "agent", issueId: "issue", normalizedSessionId: "session" };

async function fixture(phase: "idle" | "terminal" = "terminal") {
  const root = await mkdtemp("/tmp/cc-archive-"); roots.push(root);
  const runtimeDirectory = join(root, "cursor-cloud");
  const store = new CursorCloudCheckpointStore(runtimeDirectory, "session");
  await store.acquire();
  const checkpoint: CursorCloudCheckpoint = { schema: "paperclip.cursor-cloud.checkpoint.v1", driverSessionId: "session", normalizedSessionId: "session",
    bindingDigest: cursorCloudDigest(semanticCanonicalJson(binding)), configDigest: "a".repeat(64), modelDigest: "b".repeat(64), instructionsDigest: "c".repeat(64),
    instructionsRevisionPending: false, ownerRunId: "owner", agentId: phase === "terminal" ? "bc-provider" : null,
    runId: phase === "terminal" ? "run-provider" : null, turnId: phase === "terminal" ? "turn-provider" : null,
    phase, pendingOperation: null, idempotencyKey: null, requestedAgentId: null, requestDigest: null, lastEventId: phase === "terminal" ? "opaque" : null, lastEventFingerprints: [],
    sourceSequence: phase === "terminal" ? 1 : 0, terminalStatus: phase === "terminal" ? "ERROR" : null, deadlineAt: null, pendingTerminalDelivery: null, acceptedCompletion: null };
  await store.write(checkpoint); await store.release();
  const input = { runtimeDirectory, driverSessionId: "session", ownerRunId: "owner", binding, socketPath: join(root, "mcp.sock"), archiveDirectory: join(root, "continuity-break", "cursor-cloud") };
  return { root, store, checkpoint, input };
}

describe("Cursor Cloud replacement checkpoint archive", () => {
  it.each(["idle", "terminal"] as const)("archives only the exact %s checkpoint and preserves launch and artifact state", async phase => {
    const f = await fixture(phase);
    for (const name of ["config.json", "relay-capability.json"]) await writeFile(join(f.input.runtimeDirectory, name), name, { mode: 0o600 });
    await mkdir(join(f.input.runtimeDirectory, "artifacts"), { mode: 0o700 });
    await writeFile(join(f.input.runtimeDirectory, "artifacts", "result.txt"), "retained");
    const bytes = await readFile(f.store.path, "utf8");
    await archiveCursorCloudSessionCheckpoint(f.input);
    expect(await readFile(join(f.input.archiveDirectory, f.store.path.split("/").at(-1)!), "utf8")).toBe(bytes);
    expect((await readdir(f.input.runtimeDirectory)).sort()).toEqual(["artifacts", "config.json", "relay-capability.json"]);
    for (const name of ["config.json", "relay-capability.json"]) expect(await readFile(join(f.input.runtimeDirectory, name), "utf8")).toBe(name);
    expect(await readFile(join(f.input.runtimeDirectory, "artifacts", "result.txt"), "utf8")).toBe("retained");
    const next = new CursorCloudCheckpointStore(f.input.runtimeDirectory, "session"); await next.acquire();
    try { expect(await next.read()).toBeNull(); } finally { await next.release(); }
  });

  it.each(["requestedAgentId", "idempotencyKey", "requestDigest", "acceptedCompletion"] as const)("does not archive pristine-looking idle state with retained %s evidence", async field => {
    const f = await fixture("idle");
    const checkpoint = { ...f.checkpoint, [field]: field === "acceptedCompletion"
      ? { turnId: "turn", callIdDigest: "a".repeat(64), inputDigest: "b".repeat(64), resultDigest: "c".repeat(64) } : "retained" };
    const bytes = JSON.stringify(checkpoint); await writeFile(f.store.path, bytes);
    await expect(archiveCursorCloudSessionCheckpoint(f.input)).rejects.toThrow("active, ambiguous or outside");
    expect(await readFile(f.store.path, "utf8")).toBe(bytes);
  });

  it.each(["outside", "inside", "dot-child"])("rejects an archive with %s containment", async mode => {
    const f = await fixture();
    const bytes = await readFile(f.store.path, "utf8");
    const archiveDirectory = mode === "outside" ? `${f.root}-other` : join(f.input.runtimeDirectory, mode === "inside" ? "archive" : "..archive");
    await expect(archiveCursorCloudSessionCheckpoint({ ...f.input, archiveDirectory })).rejects.toThrow("inside the admitted session root");
    expect(await readFile(f.store.path, "utf8")).toBe(bytes);
  });

  it("preserves both files when the archive destination already exists", async () => {
    const f = await fixture();
    await mkdir(f.input.archiveDirectory, { recursive: true, mode: 0o700 });
    const destination = join(f.input.archiveDirectory, f.store.path.split("/").at(-1)!);
    await writeFile(destination, "Existing archive", { mode: 0o600 });
    const bytes = await readFile(f.store.path, "utf8");
    await expect(archiveCursorCloudSessionCheckpoint(f.input)).rejects.toThrow("archive already exists");
    expect(await readFile(f.store.path, "utf8")).toBe(bytes);
    expect(await readFile(destination, "utf8")).toBe("Existing archive");
  });

  it("preserves an unknown socket path without archiving its checkpoint", async () => {
    const f = await fixture();
    await writeFile(f.input.socketPath, "Unknown owner", { mode: 0o600 });
    const bytes = await readFile(f.store.path, "utf8");
    await expect(archiveCursorCloudSessionCheckpoint(f.input)).rejects.toThrow("safe dead-owner recovery proof");
    expect(await readFile(f.store.path, "utf8")).toBe(bytes);
    expect(await readFile(f.input.socketPath, "utf8")).toBe("Unknown owner");
    await expect(readdir(f.input.archiveDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not grant replacement from a missing checkpoint", async () => {
    const f = await fixture(); await rm(f.store.path);
    await expect(archiveCursorCloudSessionCheckpoint(f.input)).rejects.toThrow("checkpoint is missing");
    await expect(readdir(f.input.archiveDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["creating", "running", "stopping", "pending-create", "terminal-debt", "deadline", "foreign-owner", "foreign-binding", "foreign-session", "nonpristine-idle", "corrupt", "live-owner", "symlink"])("retains the exact checkpoint on %s refusal", async mode => {
    const f = await fixture();
    const checkpoint = { ...f.checkpoint };
    if (["creating", "running", "stopping"].includes(mode)) checkpoint.phase = mode as CursorCloudCheckpoint["phase"];
    if (mode === "pending-create") checkpoint.pendingOperation = "create_run";
    if (mode === "terminal-debt") checkpoint.pendingTerminalDelivery = { schema: "paperclip.cursor-cloud.terminal-delivery.v1", threadId: "session", turnId: "turn-provider", providerRunId: "run-provider", receiptId: "11111111-1111-4111-8111-111111111111", status: "ERROR", interrupted: false, result: null };
    if (mode === "nonpristine-idle") Object.assign(checkpoint, { phase: "idle", agentId: null, runId: null, turnId: null, terminalStatus: null });
    if (mode === "deadline") checkpoint.deadlineAt = Date.now() + 60_000;
    if (mode === "foreign-owner") checkpoint.ownerRunId = "other-owner";
    if (mode === "foreign-binding") checkpoint.bindingDigest = "f".repeat(64);
    if (mode === "foreign-session") checkpoint.normalizedSessionId = "other-session";
    await writeFile(f.store.path, mode === "corrupt" ? "{" : JSON.stringify(checkpoint), { mode: 0o600 });
    let held: CursorCloudCheckpointStore | undefined;
    if (mode === "live-owner") { held = new CursorCloudCheckpointStore(f.input.runtimeDirectory, "session"); await held.acquire(); }
    if (mode === "symlink") { const moved = join(f.root, "retained.json"); await writeFile(moved, JSON.stringify(checkpoint)); await rm(f.store.path); await symlink(moved, f.store.path); }
    const bytes = await readFile(f.store.path, "utf8");
    try {
      await expect(archiveCursorCloudSessionCheckpoint(f.input)).rejects.toThrow();
      expect(await readFile(f.store.path, "utf8")).toBe(bytes);
      await expect(readdir(f.input.archiveDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await held?.release(); }
  });
});
