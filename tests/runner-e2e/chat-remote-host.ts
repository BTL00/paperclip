import { CHAT_SETUP_HEALTH_ID, CHAT_SETUP_HEALTH_SUITE } from "./chat-setup-health.js";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { reviewedChatProfile } from "./chat-runtime-profile.js";
import type { MatrixExecution } from "./types.js";
import { currentDockerEngine, dockerCommandDiagnostic, runDocker, POSTGRES_AMD64_IMAGE, POSTGRES_AMD64_IMAGE_IDS, POSTGRES_VERSION, type DockerRun } from "./docker-postgres.js";

const workflow = "paperclipai/paperclip/.github/workflows/runner-full-stack-e2e.yml@refs/heads/master";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
type Selection = Pick<MatrixExecution, "id" | "suite" | "profile" | "environment" | "task">;
type Environment = Record<string, string | undefined>;
export interface RemoteHostDependencies {
  fetch: typeof fetch; docker: DockerRun; platform: string; arch: string;
  sourceRevision: (root: string) => Promise<string>;
}
const defaults: RemoteHostDependencies = { fetch: globalThis.fetch, docker: runDocker, platform: process.platform, arch: process.arch,
  sourceRevision: async root => (await promisify(execFile)("git", ["rev-parse", "HEAD"], { cwd: root, timeout: 5000 })).stdout.trim() };
/** This new campaign lane is remote-only. Existing profiles/local defaults remain unchanged. */
export function selectsRemoteChat(executions: readonly Selection[]) {
  return executions.some(e => (e.suite.id === "chat-features" || e.id === CHAT_SETUP_HEALTH_ID) && e.profile.id === "runner-opencode");
}
/** No native runner, model, or database workload is started here. IMDS and image acquisition
 * run only after the actual trusted GitHub AWS host identity has been checked. */
export async function prepareChatRemoteHost(input: { executions: readonly Selection[]; env: Environment; repositoryRoot: string; outputDirectory: string; dependencies?: Partial<RemoteHostDependencies> }) {
  if (!selectsRemoteChat(input.executions)) return undefined;
  const deps = { ...defaults, ...input.dependencies }, env = input.env;
  const receipt: Record<string, unknown> = { schema: "paperclip.chat-remote-host/v1", status: "blocked", scope: "before-evaluation", evaluationAdmitted: false,
    allocationSpotOnlyClaimed: false, hostPolicy: "aws-fleet-spot-or-on-demand", databaseLane: "owned-docker-postgres", automaticRetries: 0, maximumParallel: 2,
    executionIds: input.executions.map(e => e.id) };
  const filename = path.join(input.outputDirectory, "chat-remote-host.json");
  await mkdir(input.outputDirectory, { recursive: true });
  const persist = () => writeFile(filename, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  let reason = "trusted-github-linux-source-required";
  try {
    if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "paperclipai/paperclip" || env.GITHUB_REF !== "refs/heads/master" || env.GITHUB_WORKFLOW_REF !== workflow
      || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "") || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? "") || deps.platform !== "linux" || deps.arch !== "x64") throw new Error(reason);
    if (input.executions.some(e => (e.suite.id !== "chat-features" && (e.suite.id !== CHAT_SETUP_HEALTH_SUITE || e.id !== CHAT_SETUP_HEALTH_ID)) || e.profile.id !== "runner-opencode" || !reviewedChatProfile(e.profile) || e.environment.id !== "local" || e.task.automaticRetryPolicy !== "single_attempt")) throw new Error(reason);
    const source = await deps.sourceRevision(input.repositoryRoot);
    if (!/^[a-f0-9]{40}$/.test(source) || env.PAPERCLIP_RUNNER_E2E_SOURCE_SHA !== source) throw new Error(reason);
    Object.assign(receipt, { workflowRef: workflow, workflowRunId: env.GITHUB_RUN_ID, workflowAttempt: Number(env.GITHUB_RUN_ATTEMPT), sourceRevision: source });
    reason = "aws-instance-identity-unavailable";
    const tokenResponse = await deps.fetch("http://169.254.169.254/latest/api/token", { method: "PUT", redirect: "error", headers: { "X-aws-ec2-metadata-token-ttl-seconds": "60" }, signal: AbortSignal.timeout(5000) });
    if (!tokenResponse.ok) throw new Error(reason);
    const token = await tokenResponse.text(); if (!token || token.length > 4096) throw new Error(reason);
    const metadata = async (url: string) => {
      const response = await deps.fetch(url, { redirect: "error", headers: { "X-aws-ec2-metadata-token": token }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(reason); const text = await response.text(); if (text.length > 8192) throw new Error(reason); return text;
    };
    const lifecycle = (await metadata("http://169.254.169.254/latest/meta-data/instance-life-cycle")).trim();
    const identity = JSON.parse(await metadata("http://169.254.169.254/latest/dynamic/instance-identity/document"));
    if (!/^i-[a-f0-9]{8,17}$/.test(identity.instanceId ?? "") || !/^ami-[a-f0-9]{8,17}$/.test(identity.imageId ?? "") || identity.region !== "us-east-1" || identity.architecture !== "x86_64") throw new Error(reason);
    Object.assign(receipt, { instanceId: identity.instanceId, imageId: identity.imageId, region: identity.region, architecture: identity.architecture, lifecycle });
    reason = "unknown-host-lifecycle-refused-before-evaluation";
    if (lifecycle !== "spot" && lifecycle !== "on-demand") throw new Error(reason);
    reason = "owned-linux-amd64-postgres-image-unqualified";
    receipt.qualificationStage = "docker-engine";
    const engine = await currentDockerEngine(deps.docker, env);
    receipt.qualificationStage = "postgres-image-pull";
    await deps.docker(["--context", engine.context, "pull", "--platform", "linux/amd64", POSTGRES_AMD64_IMAGE], 120000);
    receipt.qualificationStage = "postgres-image-inspect";
    const images = JSON.parse(await deps.docker(["--context", engine.context, "image", "inspect", POSTGRES_AMD64_IMAGE]));
    const image = images[0], pgVersion = (image?.Config?.Env ?? []).find((entry: string) => entry.startsWith("PG_VERSION="))?.slice(11);
    receipt.qualificationStage = "postgres-image-validate";
    const checks = { singleImage: images.length === 1, imageId: POSTGRES_AMD64_IMAGE_IDS.some(id => id === image?.Id), linux: image?.Os === "linux", amd64: image?.Architecture === "amd64", repositoryDigest: image?.RepoDigests?.includes(POSTGRES_AMD64_IMAGE) === true, postgresVersion: pgVersion === POSTGRES_VERSION };
    receipt.imageChecks = checks;
    receipt.observedImage = { imageId: /^sha256:[a-f0-9]{64}$/.test(image?.Id ?? "") ? image.Id : null,
      os: ["linux", "windows"].includes(image?.Os) ? image.Os : null, architecture: ["amd64", "arm64"].includes(image?.Architecture) ? image.Architecture : null,
      version: typeof pgVersion === "string" && /^[0-9][a-zA-Z0-9.+~-]{0,79}$/.test(pgVersion) ? pgVersion : null };
    if (Object.values(checks).some(value => !value)) throw new Error(reason);
    Object.assign(receipt, { status: "qualified-host-only", spotVerified: lifecycle === "spot", postgres: { image: POSTGRES_AMD64_IMAGE, imageId: image.Id, architecture: image.Architecture, version: pgVersion }, dockerEngineSha256: hash(engine.engineId) });
    await persist();
    return { receiptPath: filename, databaseLane: "owned-docker-postgres" as const, maxAutomaticRetries: 0, maxParallel: 2, postgresArtifact: "linux-amd64" as const, postgresImageId: image.Id as typeof POSTGRES_AMD64_IMAGE_IDS[number] };
  } catch (error) {
    if (receipt.qualificationStage) receipt.failureDiagnostic = dockerCommandDiagnostic(error);
    receipt.reason = reason; await persist();
    throw new Error(`Remote chat preflight blocked: ${reason}; inspect chat-remote-host.json. No evaluation admitted.`);
  }
}
