import { IncomingMessage, ServerResponse } from "node:http";
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, symlink, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CANDIDATE_WEBHOOK, CANDIDATE_HEADER, installCandidateHealthWitness, closedServingWitness, exactCandidateSelection, retainCandidateStartup, validateCandidateServing, type ServingWitness } from "./candidate-serving-proof.js";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const expected = { attemptId: "synthetic-attempt", executionId: CANDIDATE_WEBHOOK, generationHash: hash("generation"), sourceRoot: "/synthetic/source", apiOrigin: "http://127.0.0.1:3100", manifestHash: hash("reviewed-pins") };
const observed = { pid: 1234, parentPid: 1233, started: "synthetic-process-start", processGroupId: 1233, kind: "node" };
const child: ServingWitness = { schema: "candidate.serving.v1", kind: "child", attemptHash: hash(expected.attemptId), executionHash: hash(expected.executionId), generationHash: expected.generationHash,
  sourceRootHash: hash(expected.sourceRoot), originHash: hash(expected.apiOrigin), manifestHash: expected.manifestHash, pid: observed.pid, parentPid: observed.parentPid, processStartHash: hash(observed.started), startedAt: 2000 };
const supervisor: ServingWitness = { ...child, kind: "supervisor", startedAt: 1000 };
const run = (c = child, s = supervisor, p: typeof observed | undefined = observed, header = hash("receipt")) => validateCandidateServing(c, s, expected, p, header, hash("receipt"), 3000);
describe("candidate webhook source admission", () => {
  it("accepts the current matched child, supervisor, listener and reviewed source", () => expect(() => run()).not.toThrow());
  for (const key of ["attemptHash", "executionHash", "generationHash", "sourceRootHash", "originHash", "manifestHash", "processStartHash"] as const) {
    it(`rejects foreign ${key}`, () => expect(() => run({ ...child, [key]: hash("foreign") })).toThrow());
  }
  it("rejects two consistently wrong manifests against the independent reviewed pin", () => expect(() => run({ ...child, manifestHash: hash("foreign") }, { ...supervisor, manifestHash: hash("foreign") })).toThrow());
  for (const [name, process] of [["missing process", undefined], ["reused PID", { ...observed, started: "later" }], ["foreign parent", { ...observed, parentPid: 999 }]] as const) {
    it(`rejects ${name}`, () => expect(() => validateCandidateServing(child, supervisor, expected, process, hash("receipt"), hash("receipt"), 3000)).toThrow());
  }
  it("rejects a different HTTP listener", () => expect(() => run(child, supervisor, observed, hash("foreign-header"))).toThrow());
  it("rejects future child startup", () => expect(() => run({ ...child, startedAt: 3001 })).toThrow());
  it("rejects startup before supervisor generation", () => expect(() => run(child, { ...supervisor, startedAt: 2001 })).toThrow());
  it("rejects a child substituted for the supervisor", () => expect(() => run(child, child)).toThrow());
  it("rejects replacement generation despite identical source", () => expect(() => run({ ...child, generationHash: hash("replacement") })).toThrow());
  for (const patch of [{ pid: 0 }, { pid: 1.5 }, { parentPid: -1 }, { startedAt: NaN }, { manifestHash: "not-a-hash" }, { credential: "synthetic_reusable_secret_123456789" }]) {
    it(`rejects nonclosed identity fields ${Object.keys(patch)[0]}`, () => expect(() => closedServingWitness({ ...child, ...patch })).toThrow());
  }
  it("never grants a mixed or foreign case selection", () => {
    expect(() => exactCandidateSelection([CANDIDATE_WEBHOOK])).not.toThrow();
    expect(() => exactCandidateSelection([CANDIDATE_WEBHOOK, "other"])).toThrow();
    expect(() => exactCandidateSelection(["other"])).toThrow();
  });
  it("retains only closed metadata when a private receipt contains arbitrary credential text", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "candidate-proof-synthetic-")));
    try {
      await mkdir(path.join(root, "control"), { mode: 0o700 });
      await writeFile(path.join(root, "control/candidate-serving-child.json"), JSON.stringify({ ...child, credential: "synthetic_secret_never_exported_12345678" }), { mode: 0o600 });
      const destination = path.join(root, "snapshots/safe.json");
      expect(await retainCandidateStartup({ temporaryRoot: root, destination })).toBe(false);
      expect(JSON.parse(await readFile(destination, "utf8"))).toEqual({ schema: "candidate.serving.retained.v1", status: "unqualified", childAvailable: false, supervisorAvailable: false });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  for (const changed of [false, true]) it(`binds retained startup custody to pre-setup verification (changed=${changed})`, async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "candidate-proof-synthetic-")));
    try {
      await mkdir(path.join(root, "control"), { mode: 0o700 }); await mkdir(path.join(root, "snapshots"), { mode: 0o700 });
      const c = JSON.stringify(child), p = JSON.stringify(supervisor);
      await writeFile(path.join(root, "control/candidate-serving-child.json"), c, { mode: 0o600 });
      await writeFile(path.join(root, "control/candidate-serving-supervisor.json"), p, { mode: 0o600 });
      await writeFile(path.join(root, "snapshots/candidate-serving-verified.json"), JSON.stringify({ schema: "candidate.serving.verified.v1", childReceiptSha256: hash(changed ? "foreign" : c), supervisorReceiptSha256: hash(p), sourceManifestSha256: expected.manifestHash }), { mode: 0o600 });
      const destination = path.join(root, "snapshots/startup.json"); expect(await retainCandidateStartup({ temporaryRoot: root, destination })).toBe(!changed);
      expect(JSON.parse(await readFile(destination, "utf8")).status).toBe(changed ? "unqualified" : "verified");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("never follows a receipt symlink", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "candidate-proof-synthetic-")));
    try {
      await mkdir(path.join(root, "control"), { mode: 0o700 }); const target = path.join(root, "target.json");
      await writeFile(target, JSON.stringify(child), { mode: 0o600 }); await symlink(target, path.join(root, "control/candidate-serving-child.json"));
      const destination = path.join(root, "snapshots/safe.json"); expect(await retainCandidateStartup({ temporaryRoot: root, destination })).toBe(false);
      expect(JSON.parse(await readFile(destination, "utf8")).childAvailable).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("adds only the closed health witness while preserving actual status, headers and body", () => {
    const restore = installCandidateHealthWitness(hash("receipt"));
    try {
      const req = new IncomingMessage(null as never); req.method = "GET"; req.url = "/api/health";
      const res = new ServerResponse(req); res.writeHead(503, { "x-existing": "retained" }); res.end("real-body");
      expect(res.statusCode).toBe(503); expect(res.getHeader(CANDIDATE_HEADER)).toBe(hash("receipt")); expect(res.getHeader("x-existing")).toBe("retained");
      const output = (res as unknown as { outputData: Array<{ data: string }> }).outputData.map(row => String(row.data)).join(""); expect(output).toContain("real-body");
      const other = new IncomingMessage(null as never); other.method = "POST"; other.url = "/api/health";
      const unselected = new ServerResponse(other); unselected.writeHead(200); expect(unselected.getHeader(CANDIDATE_HEADER)).toBeUndefined();
    } finally { restore(); }
  });
  it("places the actual gate before any fixture/session and forbids every replacement", async () => {
    const source = await readFile(path.join(import.meta.dirname, "runner.spec.ts"), "utf8");
    const gate = source.indexOf("const serving = await verifyCandidateServing");
    for (const call of ["await establishPublicMcpSession", "await setupLiveFixtures", "await setupFirstTaskFixtures", "await checkSetupHealthCredential"]) expect(gate).toBeLessThan(source.indexOf(call));
    const entry = await readFile(path.join(import.meta.dirname, "server-entry.ts"), "utf8");
    expect(entry.indexOf("await candidateSourceManifest")).toBeLessThan(entry.indexOf("const { PaperclipRunnerToolAuthority } = await import"));
    expect(entry.indexOf("await publishCandidateChild")).toBeLessThan(entry.indexOf('await import("../../cli/src/index.js")'));
    const server = await readFile(path.join(import.meta.dirname, "server.ts"), "utf8");
    expect(server.indexOf("candidateStarted || usesInstalledCli")).toBeLessThan(server.indexOf("const candidate = spawn("));
    expect(server.slice(server.indexOf("async function restartServer"), server.indexOf("async function restartServer") + 320)).toContain("Candidate serving replacement is forbidden");
    expect(server.indexOf("readdir(paperclipHome)")).toBeLessThan(server.indexOf("const databaseReservation = await prepareRunnerE2EServerConfig"));
  });
});
