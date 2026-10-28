import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const SCHEMA = "paperclip.cursor-cloud.replay-fault.v1";
const MAX_FRAME_BYTES = 1_048_576;
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
type Cut = { agentIdSha256: string; runIdSha256: string; eventIdSha256: string; frameSha256: string; frameBytes: number; event: string };
export interface CursorCloudReplayFaultProof {
  schema: typeof SCHEMA;
  streamRequests: number;
  cutCount: number;
  cut: Cut | null;
  reconnect: { agentIdSha256: string; runIdSha256: string; lastEventIdSha256: string | null; cursorMatches: boolean; httpStatus: number; sseReady: boolean } | null;
}
export interface CursorCloudReplayFaultManifest {
  schema: "paperclip.cursor-cloud.replay-instrumentation.v1";
  treatmentId: string;
  originalProxySha256: string;
  instrumentedProxySha256: string;
}

export function createCursorCloudReplayFaultFetch(input: {
  fetch: typeof fetch;
  digest(value: string | Uint8Array): string;
  record(proof: CursorCloudReplayFaultProof): void;
}): typeof fetch {
  const proof: CursorCloudReplayFaultProof = { schema: "paperclip.cursor-cloud.replay-fault.v1", streamRequests: 0, cutCount: 0, cut: null, reconnect: null };
  let armed = false;
  const save = () => input.record(structuredClone(proof));
  const nativeRoute = /^\/v1\/agents\/(bc-[a-f0-9-]{36})\/runs\/(run-[a-f0-9-]{36})\/stream$/iu;
  const eligible = new Set(["assistant", "thinking", "tool_call"]);
  const limit = 1_048_576;
  function frameEnd(bytes: Uint8Array, ended: boolean): number | undefined {
    let line = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] !== 10 && bytes[i] !== 13) continue;
      if (!ended && bytes[i] === 13 && i + 1 === bytes.length) return;
      const size = bytes[i] === 13 && bytes[i + 1] === 10 ? 2 : 1;
      if (i === line) return i + size;
      line = i + size;
      i += size - 1;
    }
  }
  function identify(frame: Uint8Array): { id: string; event: string } | undefined {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(frame); } catch { return; }
    let id: string | undefined, event = "message";
    const data: string[] = [];
    for (const line of text.split(/\r\n|\r|\n/u)) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":"), key = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /u, "");
      if (key === "id" && !value.includes("\0")) id = value;
      if (key === "event") event = value;
      if (key === "data") data.push(value);
    }
    if (!id || id.length > 1_024 || !eligible.has(event) || !data.length) return;
    try { JSON.parse(data.join("\n")); } catch { return; }
    return { id, event };
  }
  return async (resource, init) => {
    let route: RegExpExecArray | null = null;
    try {
      const url = new URL(resource instanceof Request ? resource.url : String(resource));
      const method = init?.method ?? (resource instanceof Request ? resource.method : "GET");
      if (method.toUpperCase() === "GET" && url.origin === "https://api.cursor.com" && !url.search && !url.hash) route = nativeRoute.exec(url.pathname);
    } catch {  }
    if (!route) return input.fetch(resource, init);
    if (proof.streamRequests >= 32) throw new Error("Cursor replay fault exceeded its bounded stream request count");
    proof.streamRequests += 1;
    const reconnect = proof.cutCount === 1 && proof.reconnect === null;
    if (reconnect) {
      const header = new Headers(init?.headers ?? (resource instanceof Request ? resource.headers : undefined)).get("Last-Event-ID");
      proof.reconnect = { agentIdSha256: input.digest(route[1]!), runIdSha256: input.digest(route[2]!), lastEventIdSha256: header === null ? null : input.digest(header),
        cursorMatches: header !== null && input.digest(header) === proof.cut!.eventIdSha256, httpStatus: 0, sseReady: false };
    }
    save();
    const response = await input.fetch(resource, init);
    const sseReady = response.ok && Boolean(response.body) && Boolean(response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream"));
    if (reconnect) { proof.reconnect!.httpStatus = response.status; proof.reconnect!.sseReady = sseReady; save(); }
    if (armed || !sseReady || !response.body) return response;
    armed = true;
    const reader = response.body.getReader();
    let pending = new Uint8Array(0), ended = false, cutNextRead = false;
    const wrapped = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (cutNextRead) {
          proof.cutCount += 1;
          save();
          controller.error(new Error("Injected Cursor Cloud SSE disconnect"));
          void reader.cancel().catch(() => {});
          return;
        }
        while (true) {
          const end = frameEnd(pending, ended);
          if (end !== undefined) {
            if (end > limit) { controller.error(new Error("Cursor replay fault frame exceeded its bound")); void reader.cancel().catch(() => {}); return; }
            const frame = pending.slice(0, end); pending = pending.slice(end);
            const found = identify(frame);
            if (found) {
              proof.cut = { agentIdSha256: input.digest(route![1]!), runIdSha256: input.digest(route![2]!), eventIdSha256: input.digest(found.id), frameSha256: input.digest(frame), frameBytes: frame.length, event: found.event };
              cutNextRead = true;
            }
            controller.enqueue(frame);
            return;
          }
          if (ended) { if (pending.length) controller.enqueue(pending); controller.close(); return; }
          if (pending.length > limit) { controller.error(new Error("Cursor replay fault frame exceeded its bound")); void reader.cancel().catch(() => {}); return; }
          const next = await reader.read();
          if (next.done) { ended = true; continue; }
          const joined = new Uint8Array(pending.length + next.value.length); joined.set(pending); joined.set(next.value, pending.length); pending = joined;
        }
      },
      cancel: reason => reader.cancel(reason),
    }, { highWaterMark: 0 });
    return new Response(wrapped, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

function prelude(evidenceDirectory: string, treatmentId: string): string {
  return `;(() => {
  const fs = require("node:fs"), crypto = require("node:crypto"), path = require("node:path");
  const __name = (value, name) => Object.defineProperty(value, "name", { value: name, configurable: true });
  const directory = ${JSON.stringify(evidenceDirectory)};
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error("Cursor replay evidence directory must be owned and private");
  const target = path.join(directory, ${JSON.stringify(`replay-${treatmentId}-`)} + process.pid + ".json");
  globalThis.fetch = (${createCursorCloudReplayFaultFetch.toString()})({
    fetch: globalThis.fetch.bind(globalThis),
    digest: value => crypto.createHash("sha256").update(value).digest("hex"),
    record: proof => {
      const temporary = target + "." + crypto.randomUUID() + ".tmp";
      fs.writeFileSync(temporary, JSON.stringify(proof), { mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, target);
    }
  });
})();\n`;
}

export async function installCursorCloudReplayFault(input: { bundlePath: string; evidenceDirectory: string }) {
  if (!isAbsolute(input.bundlePath) || !isAbsolute(input.evidenceDirectory)) throw new Error("Cursor replay instrumentation requires absolute owned paths");
  await mkdir(input.evidenceDirectory, { recursive: true, mode: 0o700 });
  const directory = await lstat(input.evidenceDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0 || (process.getuid && directory.uid !== process.getuid())) throw new Error("Cursor replay evidence directory must be owned and private");
  const handle = await open(input.bundlePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let original: Buffer, mode: number;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 8_388_608 || (process.getuid && stat.uid !== process.getuid())) throw new Error("Cursor replay proxy must be an owned bounded regular file");
    original = await handle.readFile(); mode = stat.mode & 0o777;
  } finally { await handle.close(); }
  if (original.includes(Buffer.from("paperclip.cursor-cloud.replay-fault.v1"))) throw new Error("Cursor replay instrumentation is already installed");
  const treatmentId = randomUUID();
  const newline = original.indexOf(10), shebangEnd = original.subarray(0, 2).toString() === "#!" ? (newline < 0 ? original.length : newline + 1) : 0;
  const head = original.subarray(0, shebangEnd), separator = shebangEnd && newline < 0 ? Buffer.from("\n") : Buffer.alloc(0);
  const instrumented = Buffer.concat([head, separator, Buffer.from(prelude(input.evidenceDirectory, treatmentId)), original.subarray(shebangEnd)]);
  const manifest: CursorCloudReplayFaultManifest = { schema: "paperclip.cursor-cloud.replay-instrumentation.v1", treatmentId, originalProxySha256: sha256(original), instrumentedProxySha256: sha256(instrumented) };
  const replace = async (bytes: Buffer) => {
    const temporary = `${input.bundlePath}.${treatmentId}.tmp`;
    await writeFile(temporary, bytes, { flag: "wx", mode });
    await rename(temporary, input.bundlePath);
  };
  await writeFile(join(input.evidenceDirectory, `original-proxy-${treatmentId}.cjs`), original, { flag: "wx", mode: 0o600 });
  await writeFile(join(input.evidenceDirectory, `instrumentation-${treatmentId}.json`), JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
  await replace(instrumented);
  let restored = false;
  return { manifest, async restore() {
    if (restored) return;
    if (sha256(await readFile(input.bundlePath)) !== manifest.instrumentedProxySha256) throw new Error("Cursor replay proxy changed during acceptance; refusing to overwrite it");
    await replace(original); restored = true;
  } };
}

export async function withCursorCloudReplayFault<T>(input: { bundlePath: string; evidenceDirectory: string }, run: (manifest: CursorCloudReplayFaultManifest) => Promise<T>): Promise<T> {
  const treatment = await installCursorCloudReplayFault(input);
  try { return await run(treatment.manifest); } finally { await treatment.restore(); }
}

export async function readCursorCloudReplayFaultProofs(evidenceDirectory: string, manifest: CursorCloudReplayFaultManifest): Promise<unknown[]> {
  const names = (await readdir(evidenceDirectory)).filter(name => new RegExp(`^replay-${manifest.treatmentId}-[1-9][0-9]*\\.json$`, "u").test(name));
  if (names.length > 16) throw new Error("Cursor replay proof file count exceeded its bound");
  return Promise.all(names.map(async name => {
    const handle = await open(join(evidenceDirectory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > 16_384 || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error("Cursor replay proof file is unsafe"); return JSON.parse(await handle.readFile("utf8")) as unknown; }
    finally { await handle.close(); }
  }));
}

export function gradeCursorCloudReplayFault(proofs: readonly unknown[], expected: readonly { agentIdSha256: string; runIdSha256: string }[]) {
  const digest = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
  const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
  const valid = proofs.length > 0 && proofs.length <= 16 && expected.length > 0 && expected.length <= 16
    && expected.every(identity => digest(identity.agentIdSha256) && digest(identity.runIdSha256)) && proofs.every(value => {
    const proof = record(value), cut = record(proof.cut), resume = record(proof.reconnect);
    return exact(proof, ["schema", "streamRequests", "cutCount", "cut", "reconnect"]) && proof.schema === SCHEMA && proof.cutCount === 1
      && Number.isInteger(proof.streamRequests) && Number(proof.streamRequests) >= 2 && Number(proof.streamRequests) <= 32
      && exact(cut, ["agentIdSha256", "runIdSha256", "eventIdSha256", "frameSha256", "frameBytes", "event"])
      && [cut.agentIdSha256, cut.runIdSha256, cut.eventIdSha256, cut.frameSha256].every(digest)
      && Number.isInteger(cut.frameBytes) && Number(cut.frameBytes) > 0 && Number(cut.frameBytes) <= MAX_FRAME_BYTES && ["assistant", "thinking", "tool_call"].includes(String(cut.event))
      && exact(resume, ["agentIdSha256", "runIdSha256", "lastEventIdSha256", "cursorMatches", "httpStatus", "sseReady"])
      && resume.agentIdSha256 === cut.agentIdSha256 && resume.runIdSha256 === cut.runIdSha256 && resume.lastEventIdSha256 === cut.eventIdSha256
      && resume.cursorMatches === true && resume.sseReady === true && Number.isInteger(resume.httpStatus) && Number(resume.httpStatus) >= 200 && Number(resume.httpStatus) < 300
      && expected.some(identity => identity.agentIdSha256 === cut.agentIdSha256 && identity.runIdSha256 === cut.runIdSha256);
  }) && expected.every(identity => proofs.some(value => { const cut = record(record(value).cut); return identity.agentIdSha256 === cut.agentIdSha256 && identity.runIdSha256 === cut.runIdSha256; }));
  return { id: "cloud-live-sse-replay", passed: valid, detail: valid ? `Observed ${proofs.length} injected stream cut(s), same-run cursor reconnect and successful SSE response; workflow settlement is graded separately` : "Missing or inconsistent owned SSE cut/reconnect proof" };
}
