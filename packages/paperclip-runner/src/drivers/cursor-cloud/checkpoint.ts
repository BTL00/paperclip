import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export const cursorCloudDigest = (value: string) => createHash("sha256").update(value).digest("hex");

export interface CursorCloudCheckpoint {
  schema: "paperclip.cursor-cloud.checkpoint.v1";
  driverSessionId: string;
  normalizedSessionId: string;
  bindingDigest: string;
  configDigest: string;
  modelDigest: string;
  instructionsDigest: string;
  instructionsRevisionPending: boolean;
  ownerRunId: string;
  agentId: string | null;
  runId: string | null;
  turnId: string | null;
  phase: "idle" | "creating" | "running" | "stopping" | "terminal";
  pendingOperation: "create_agent" | "create_run" | null;
  idempotencyKey: string | null;
  requestedAgentId: string | null;
  requestDigest: string | null;
  lastEventId: string | null;
  lastEventFingerprints: string[];
  sourceSequence: number;
  terminalStatus: string | null;
  deadlineAt: number | null;
  acceptedCompletion: { callIdDigest: string; inputDigest: string; resultDigest: string; turnId: string } | null;
}

export class CursorCloudCheckpointStore {
  readonly path: string;
  readonly #lockPath: string;
  readonly #root: string;
  #lockToken: string | null = null;
  recoveredDeadOwner = false;
  #writes: Promise<void> = Promise.resolve();

  constructor(root: string, sessionId: string) {
    if (!isAbsolute(root) || !sessionId || sessionId.length > 1_024) throw new Error("Cursor Cloud checkpoint requires a private absolute directory and session identity");
    this.#root = root;
    this.path = join(root, `checkpoint-${cursorCloudDigest(sessionId)}.json`);
    this.#lockPath = `${this.path}.lock`;
  }

  async acquire(): Promise<void> {
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    const root = await lstat(this.#root);
    if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o077) !== 0 || (process.getuid && root.uid !== process.getuid())) throw new Error("Cursor Cloud runtime directory must be owned and private (0700)");
    const token = randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(this.#lockPath, "wx", 0o600);
        try { await handle.writeFile(JSON.stringify({ pid: process.pid, token })); await handle.sync(); }
        finally { await handle.close(); }
        this.#lockToken = token;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt !== 0) throw new Error("Cursor Cloud session already has an owner");
        const before = await lstat(this.#lockPath);
        if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077) !== 0) throw new Error("Cursor Cloud checkpoint ownership is unsafe");
        let owner: { pid?: unknown };
        try { owner = JSON.parse(await readFile(this.#lockPath, "utf8")); }
        catch { throw new Error("Cursor Cloud checkpoint owner is unknown"); }
        if (!Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0) throw new Error("Cursor Cloud checkpoint owner is unknown");
        try { process.kill(Number(owner.pid), 0); throw new Error("Cursor Cloud session already has a live owner"); }
        catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause; }
        const current = await lstat(this.#lockPath);
        if (current.ino !== before.ino || current.dev !== before.dev) throw new Error("Cursor Cloud checkpoint owner changed");
        await unlink(this.#lockPath);
        this.recoveredDeadOwner = true;
      }
    }
  }

  async read(): Promise<CursorCloudCheckpoint | null> {
    let handle;
    try { handle = await open(this.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 65_536) throw new Error("Cursor Cloud checkpoint is unsafe or exceeds its bound");
      const value: unknown = JSON.parse(await handle.readFile("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Cursor Cloud checkpoint");
      const cp = value as CursorCloudCheckpoint;
      if (cp.deadlineAt === undefined) cp.deadlineAt = ["creating", "running", "stopping"].includes(cp.phase) ? 0 : null;
      if (cp.instructionsRevisionPending === undefined) cp.instructionsRevisionPending = false;
      const digestFields = [cp.bindingDigest, cp.configDigest, cp.modelDigest, cp.instructionsDigest];
      if (cp.schema !== "paperclip.cursor-cloud.checkpoint.v1" || !digestFields.every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v))
        || !["idle", "creating", "running", "stopping", "terminal"].includes(cp.phase)
        || !Number.isSafeInteger(cp.sourceSequence) || cp.sourceSequence < 0
        || typeof cp.instructionsRevisionPending !== "boolean"
        || (cp.deadlineAt !== null && (!Number.isSafeInteger(cp.deadlineAt) || cp.deadlineAt < 0))
        || !Array.isArray(cp.lastEventFingerprints) || cp.lastEventFingerprints.length > 32
        || !cp.lastEventFingerprints.every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v))
        || ![cp.driverSessionId, cp.normalizedSessionId, cp.ownerRunId].every(v => typeof v === "string" && v.length > 0 && v.length <= 1_024)
        || ![cp.agentId, cp.runId, cp.turnId, cp.idempotencyKey, cp.requestedAgentId, cp.requestDigest, cp.lastEventId, cp.terminalStatus].every(v => v === null || (typeof v === "string" && v.length <= 1_024))
        || ![null, "create_agent", "create_run"].includes(cp.pendingOperation)) throw new Error("Invalid Cursor Cloud checkpoint");
      return cp;
    } finally { await handle.close(); }
  }

  write(value: CursorCloudCheckpoint): Promise<void> {
    if (!this.#lockToken) return Promise.reject(new Error("Cursor Cloud checkpoint has no owner"));
    const bytes = JSON.stringify(value);
    if (Buffer.byteLength(bytes) > 65_536) return Promise.reject(new Error("Cursor Cloud checkpoint exceeds its bound"));
    const operation = this.#writes.then(async () => {
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); }
      finally { await handle.close(); }
      try {
        await rename(temporary, this.path);
        const directory = await open(this.#root, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
        try { await directory.sync(); } finally { await directory.close(); }
      } finally { await unlink(temporary).catch(() => {}); }
    });
    this.#writes = operation.catch(() => {});
    return operation;
  }

  async release(): Promise<void> {
    await this.#writes;
    if (!this.#lockToken) return;
    const current = JSON.parse(await readFile(this.#lockPath, "utf8"));
    if (current.token !== this.#lockToken || current.pid !== process.pid) throw new Error("Cursor Cloud checkpoint ownership changed");
    await unlink(this.#lockPath);
    this.#lockToken = null;
  }
}
