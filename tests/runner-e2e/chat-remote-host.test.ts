import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MatrixExecution } from "./types.js";
import { prepareChatRemoteHost, selectsRemoteChat } from "./chat-remote-host.js";
import { POSTGRES_AMD64_IMAGE, POSTGRES_AMD64_IMAGE_IDS, POSTGRES_VERSION } from "./docker-postgres.js";
import { CHAT_OPENCODE_MODEL } from "./chat-runtime-profile.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(lifecycle = "spot") {
  const root = await mkdtemp(path.join(os.tmpdir(), "remote-host-offline-")); roots.push(root);
  const execution = { id: "chat-features.runner-opencode.local.create-backlog", suite: { id: "chat-features" }, profile: { id: "runner-opencode", provider: "opencode", model: CHAT_OPENCODE_MODEL, adapterType: "paperclip_runner", credential: "OPENROUTER_API_KEY" }, environment: { id: "local" }, task: { automaticRetryPolicy: "single_attempt" } } as unknown as MatrixExecution;
  const env = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "paperclipai/paperclip", GITHUB_REF: "refs/heads/master", GITHUB_WORKFLOW_REF: "paperclipai/paperclip/.github/workflows/runner-full-stack-e2e.yml@refs/heads/master", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", PAPERCLIP_RUNNER_E2E_SOURCE_SHA: "a".repeat(40), OPENROUTER_API_KEY: "synthetic-private-canary" };
  const fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith("/api/token")) return new Response("synthetic-imds-token");
    if (u.endsWith("/instance-life-cycle")) return new Response(lifecycle);
    return Response.json({ instanceId: "i-1234567890abcdef0", imageId: "ami-1234567890abcdef0", region: "us-east-1", architecture: "x86_64", privateIp: "not-retained" });
  });
  const docker = vi.fn(async (args: string[]) => {
    if (args[0] === "context" && args[1] === "show") return "default";
    if (args[0] === "context") return JSON.stringify([{ Endpoints: { docker: { Host: "unix:///var/run/docker.sock" } } }]);
    if (args.includes("info")) return JSON.stringify({ id: "engine", os: "linux", operatingSystem: "Linux" });
    if (args.includes("pull")) return "downloaded";
    return JSON.stringify([{ Id: POSTGRES_AMD64_IMAGE_IDS[0], RepoDigests: [POSTGRES_AMD64_IMAGE], Os: "linux", Architecture: "amd64", Config: { Env: [`PG_VERSION=${POSTGRES_VERSION}`] } }]);
  });
  return { executions: [execution], env, repositoryRoot: root, outputDirectory: root, dependencies: { fetch: fetch as typeof globalThis.fetch, docker, platform: "linux", arch: "x64", sourceRevision: async () => "a".repeat(40) }, fetch, docker,
    receipt: async () => JSON.parse(await readFile(path.join(root, "chat-remote-host.json"), "utf8")) };
}
describe("remote-only chat host qualification without native/provider calls", () => {
  it("requires real Spot metadata before Docker and retains only closed source-bound host proof", async () => {
    const f = await fixture(); const policy = await prepareChatRemoteHost(f); const receipt = await f.receipt();
    expect(policy).toMatchObject({ databaseLane: "owned-docker-postgres", maxAutomaticRetries: 0, maxParallel: 2 });
    expect(receipt).toMatchObject({ status: "qualified-host-only", spotVerified: true, evaluationAdmitted: false, allocationSpotOnlyClaimed: false, sourceRevision: "a".repeat(40) });
    expect(JSON.stringify(receipt)).not.toMatch(/synthetic-private-canary|synthetic-imds-token|privateIp|not-retained/);
    expect(f.fetch.mock.calls.every(([url]) => String(url).startsWith("http://169.254.169.254/latest/"))).toBe(true);
    expect(f.fetch.mock.invocationCallOrder.at(-1)!).toBeLessThan(f.docker.mock.invocationCallOrder[0]!);
  });
  it("refuses On-Demand fallback before any Docker/native/provider/DB action", async () => {
    const f = await fixture("on-demand"); await expect(prepareChatRemoteHost(f)).rejects.toThrow("on-demand-or-unknown-host-refused");
    expect(f.docker).not.toHaveBeenCalled(); expect(await f.receipt()).toMatchObject({ lifecycle: "on-demand", status: "blocked", evaluationAdmitted: false });
  });
  it.each(["local", "branch-workflow", "wrong-source", "wrong-model", "automatic-retry", "foreign-repository"])("fails closed on %s before metadata or Docker", async kind => {
    const f = await fixture();
    if (kind === "local") f.dependencies.platform = "darwin";
    if (kind === "branch-workflow") f.env.GITHUB_WORKFLOW_REF = "untrusted@refs/heads/branch";
    if (kind === "wrong-source") f.env.PAPERCLIP_RUNNER_E2E_SOURCE_SHA = "b".repeat(40);
    if (kind === "wrong-model") f.executions[0]!.profile.model = "other";
    if (kind === "automatic-retry") f.executions[0]!.task.automaticRetryPolicy = undefined;
    if (kind === "foreign-repository") f.env.GITHUB_REPOSITORY = "foreign/repository";
    await expect(prepareChatRemoteHost(f)).rejects.toThrow("trusted-github-linux-source-required"); expect(f.fetch).not.toHaveBeenCalled(); expect(f.docker).not.toHaveBeenCalled();
  });
  it("does not silently accept an incompatible PostgreSQL image/platform", async () => {
    const f = await fixture(); const original = f.dependencies.docker;
    f.dependencies.docker = vi.fn(async args => args.includes("image") ? JSON.stringify([{ Id: "other", Os: "linux", Architecture: "arm64" }]) : original(args));
    await expect(prepareChatRemoteHost(f)).rejects.toThrow("owned-linux-amd64-postgres-image-unqualified"); expect((await f.receipt()).evaluationAdmitted).toBe(false);
  });
  it("does not change historical/other profiles or require IMDS for their discovery", async () => {
    const f = await fixture(); f.executions[0]!.profile.id = "runner-codex-subscription";
    expect(selectsRemoteChat(f.executions)).toBe(false); expect(await prepareChatRemoteHost(f)).toBeUndefined(); expect(f.fetch).not.toHaveBeenCalled(); expect(f.docker).not.toHaveBeenCalled();
  });
});
