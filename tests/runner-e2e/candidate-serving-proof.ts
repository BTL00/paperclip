import { ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readProcessTable, type ProcessObservation } from "./process-tree.js";

export const CANDIDATE_WEBHOOK = "chat-features.runner-opencode.local.routines.webhook-trigger";
export const CANDIDATE_GENERATION = "PAPERCLIP_E2E_CANDIDATE_SERVING_GENERATION";
export const CANDIDATE_HEADER = "x-paperclip-e2e-serving-proof";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function fail(): never { throw new Error("Candidate serving prerequisite is unqualified"); }
export const candidateServingSelected = (ids: readonly string[]) => ids.includes(CANDIDATE_WEBHOOK);
export function exactCandidateSelection(ids: readonly string[]) { if (ids.length !== 1 || ids[0] !== CANDIDATE_WEBHOOK) fail(); }
const filename = (root: string, kind: string) => path.join(root, "control", `candidate-serving-${kind}.json`);
interface Binding { attemptId: string; executionId: string; generation: string; sourceRoot: string; apiOrigin: string }
export interface ServingWitness {
  schema: "candidate.serving.v1"; kind: "child" | "supervisor"; attemptHash: string; executionHash: string; generationHash: string;
  sourceRootHash: string; originHash: string; manifestHash: string; pid: number; parentPid: number; startedAt: number; processStartHash: string;
}
const fields = ["schema", "kind", "attemptHash", "executionHash", "generationHash", "sourceRootHash", "originHash", "manifestHash", "pid", "parentPid", "startedAt", "processStartHash"].sort();
export function closedServingWitness(value: unknown): ServingWitness {
  const p = value as ServingWitness;
  if (!p || JSON.stringify(Object.keys(p).sort()) !== JSON.stringify(fields) || p.schema !== "candidate.serving.v1"
    || !["child", "supervisor"].includes(p.kind) || ![p.attemptHash, p.executionHash, p.generationHash, p.sourceRootHash, p.originHash, p.manifestHash, p.processStartHash].every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v))
    || !Number.isSafeInteger(p.pid) || p.pid <= 1 || !Number.isSafeInteger(p.parentPid) || p.parentPid <= 1 || !Number.isSafeInteger(p.startedAt) || p.startedAt <= 0) fail();
  return p;
}
async function privateRoot(root: string) {
  const s = await lstat(root); if (!s.isDirectory() || s.isSymbolicLink() || await realpath(root) !== root || s.uid !== process.getuid?.() || s.mode & 0o077) fail();
  const directory = path.join(root, "control"); await mkdir(directory, { recursive: true, mode: 0o700 });
  const d = await lstat(directory); if (!d.isDirectory() || d.isSymbolicLink() || await realpath(directory) !== directory || d.uid !== s.uid || d.mode & 0o077) fail();
}
async function readWitness(root: string, kind: "child" | "supervisor") {
  await privateRoot(root); const file = filename(root, kind), s = await lstat(file);
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== process.getuid?.() || s.mode & 0o077 || s.size > 4096) fail();
  const bytes = await readFile(file);
  try { return { value: closedServingWitness(JSON.parse(bytes.toString("utf8"))), digest: hash(bytes) }; } catch { fail(); }
}
async function writeWitness(root: string, p: ServingWitness) {
  await privateRoot(root); closedServingWitness(p); const file = filename(root, p.kind), tmp = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(tmp, JSON.stringify(p), { mode: 0o600, flag: "wx" }); await rename(tmp, file); } finally { await rm(tmp, { force: true }); }
  return hash(await readFile(file));
}
export async function candidateSourceManifest(root: string, resolve: (specifier: string) => string) {
  if (await realpath(root) !== root) fail();
  const bytes = await readFile(path.join(import.meta.dirname, "candidate-serving-pins.json"));
  const pins = JSON.parse(bytes.toString("utf8")) as { files: Record<string, string>; runtimeFiles: Record<string, string>; resolutions: Record<string, string> };
  for (const [relative, expected] of Object.entries(pins.files)) {
    const file = path.join(root, relative); if (await realpath(file) !== file || hash(await readFile(file)) !== expected) fail();
  }
  for (const [relative, expected] of Object.entries(pins.runtimeFiles)) { if (hash(await readFile(path.join(root, relative))) !== expected) fail(); }
  for (const [specifier, relative] of Object.entries(pins.resolutions)) {
    const file = fileURLToPath(resolve(specifier)); if (file !== path.join(root, relative) || await realpath(file) !== file) fail();
    const shadow = file.replace(/\.ts$/, ".js");
    if (shadow !== file) { try { await lstat(shadow); fail(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  }
  return hash(bytes);
}
function witness(binding: Binding, manifestHash: string, kind: ServingWitness["kind"], process: { pid: number; parentPid: number; started: string }, startedAt: number): ServingWitness {
  if (!binding.attemptId || binding.executionId !== CANDIDATE_WEBHOOK || !/^[a-f0-9-]{36}$/i.test(binding.generation) || new URL(binding.apiOrigin).hostname !== "127.0.0.1") fail();
  return { schema: "candidate.serving.v1", kind, attemptHash: hash(binding.attemptId), executionHash: hash(binding.executionId), generationHash: hash(binding.generation),
    sourceRootHash: hash(binding.sourceRoot), originHash: hash(binding.apiOrigin), manifestHash, pid: process.pid, parentPid: process.parentPid, startedAt, processStartHash: hash(process.started) };
}
export async function publishCandidateSupervisor(input: Binding & { temporaryRoot: string; pid: number; spawnedAt: number; resolve(specifier: string): string }) {
  const manifest = await candidateSourceManifest(input.sourceRoot, input.resolve), table = await readProcessTable(), p = table?.find(p => p.pid === input.pid);
  if (!p || p.parentPid !== process.pid) fail();
  await writeWitness(input.temporaryRoot, witness(input, manifest, "supervisor", p, input.spawnedAt));
}
export async function publishCandidateChild(input: Binding & { temporaryRoot: string; resolve(specifier: string): string }) {
  const manifest = await candidateSourceManifest(input.sourceRoot, input.resolve), table = await readProcessTable(), p = table?.find(p => p.pid === process.pid);
  if (!p || p.parentPid !== process.ppid || process.env.NODE_OPTIONS) fail();
  return writeWitness(input.temporaryRoot, witness(input, manifest, "child", p, Date.now()));
}
export function validateCandidateServing(child: ServingWitness, supervisor: ServingWitness, expected: Omit<Binding, "generation"> & { generationHash: string; manifestHash: string }, observed: ProcessObservation | undefined, header: string | undefined, childDigest: string, now = Date.now()) {
  closedServingWitness(child); closedServingWitness(supervisor);
  const same = ["attemptHash", "executionHash", "generationHash", "sourceRootHash", "originHash", "manifestHash", "pid", "parentPid", "processStartHash"] as const;
  if (child.kind !== "child" || supervisor.kind !== "supervisor" || same.some(k => child[k] !== supervisor[k])
    || child.attemptHash !== hash(expected.attemptId) || child.executionHash !== hash(expected.executionId) || child.generationHash !== expected.generationHash
    || child.sourceRootHash !== hash(expected.sourceRoot) || child.originHash !== hash(expected.apiOrigin) || child.manifestHash !== expected.manifestHash
    || !observed || observed.pid !== child.pid || observed.parentPid !== child.parentPid || hash(observed.started) !== child.processStartHash
    || supervisor.startedAt > child.startedAt || child.startedAt > now || header !== childDigest) fail();
}
export async function verifyCandidateServing(input: Omit<Binding, "generation"> & { temporaryRoot: string; resolve(specifier: string): string; health(): Promise<{ ok: boolean; header?: string; companies: unknown }> }) {
  const child = await readWitness(input.temporaryRoot, "child"), supervisor = await readWitness(input.temporaryRoot, "supervisor");
  const manifestHash = await candidateSourceManifest(input.sourceRoot, input.resolve), health = await input.health(), table = await readProcessTable();
  if (!health.ok || !Array.isArray(health.companies) || health.companies.length !== 0) fail();
  const expected = { ...input, generationHash: supervisor.value.generationHash, manifestHash };
  if (child.value.generationHash !== supervisor.value.generationHash) fail();
  validateCandidateServing(child.value, supervisor.value, expected, table?.find(p => p.pid === child.value.pid), health.header, child.digest);
  if ((await readWitness(input.temporaryRoot, "child")).digest !== child.digest || (await readWitness(input.temporaryRoot, "supervisor")).digest !== supervisor.digest) fail();
  await writeFile(filename(input.temporaryRoot, "released"), JSON.stringify({ schema: "candidate.serving.released.v1", childReceiptSha256: child.digest }), { mode: 0o600, flag: "wx" });
  return { schema: "candidate.serving.verified.v1", child: child.value, supervisor: supervisor.value, childReceiptSha256: child.digest, supervisorReceiptSha256: supervisor.digest, sourceManifestSha256: manifestHash };
}
export async function retainCandidateStartup(input: { temporaryRoot: string; destination: string }) {
  const records: Record<string, unknown> = { schema: "candidate.serving.retained.v1", status: "unqualified" };
  for (const kind of ["child", "supervisor"] as const) { try { const p = await readWitness(input.temporaryRoot, kind); records[kind] = p.value; records[`${kind}ReceiptSha256`] = p.digest; } catch { records[`${kind}Available`] = false; } }
  try {
    const verified = JSON.parse(await readFile(path.join(path.dirname(input.destination), "candidate-serving-verified.json"), "utf8"));
    if (verified.schema === "candidate.serving.verified.v1" && records.child && records.supervisor
      && verified.childReceiptSha256 === records.childReceiptSha256 && verified.supervisorReceiptSha256 === records.supervisorReceiptSha256
      && verified.sourceManifestSha256 === (records.child as ServingWitness).manifestHash
      && verified.sourceManifestSha256 === (records.supervisor as ServingWitness).manifestHash) records.status = "verified";
  } catch {}
  await mkdir(path.dirname(input.destination), { recursive: true, mode: 0o700 });
  await writeFile(input.destination, JSON.stringify(records), { mode: 0o600, flag: "wx" });
  return records.status === "verified";
}

export async function assertCandidateReleased(root: string, digest: string) {
  const file = filename(root, "released"), s = await lstat(file);
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== process.getuid?.() || s.mode & 0o077 || s.size > 256) fail();
  let p: { schema?: unknown; childReceiptSha256?: unknown };
  try { p = JSON.parse(await readFile(file, "utf8")); } catch { fail(); }
  if (JSON.stringify(Object.keys(p).sort()) !== JSON.stringify(["childReceiptSha256", "schema"]) || p.schema !== "candidate.serving.released.v1" || p.childReceiptSha256 !== digest) fail();
}

export function installCandidateHealthWitness(digest: string) {
  if (!/^[a-f0-9]{64}$/.test(digest)) fail();
  const original = ServerResponse.prototype.writeHead;
  ServerResponse.prototype.writeHead = function (this: ServerResponse, ...args: Parameters<typeof original>) {
    if (this.req.method === "GET" && this.req.url === "/api/health") this.setHeader(CANDIDATE_HEADER, digest);
    return Reflect.apply(original, this, args);
  } as typeof original;
  return () => { ServerResponse.prototype.writeHead = original; };
}
