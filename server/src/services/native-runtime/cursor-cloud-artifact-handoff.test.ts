import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readVerifiedWorkspaceFile, type NativeRunnerFileHandoffInput } from "./native-runner-file-handoff.js";

const { stageCursorCloudArtifact } = await import(new URL("../../../../packages/paperclip-runner/src/drivers/cursor-cloud/artifact-delivery.ts", import.meta.url).href);

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "cursor-cloud-handoff-"));
  roots.push(root);
  const artifactRoot = join(root, "artifacts");
  const body = Buffer.from("verified cloud artifact\n");
  const args = {
    contentRef: "cursor-artifact:artifacts/result.txt", filename: "result.txt",
    title: "Cloud result", contentType: "text/plain", byteSize: body.length,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
  const stage = () => stageCursorCloudArtifact({
    arguments: args, agentId: "owned-agent", runtimeDirectory: root, artifactRoot,
    client: {
      listArtifacts: async () => ({ items: [{ path: "artifacts/result.txt", sizeBytes: body.length, updatedAt: "2026-10-28" }] }),
      downloadArtifact: async () => body,
    },
    signal: new AbortController().signal,
  });
  const binding = {
    companyId: "company", issueId: "issue", runId: "run", agentId: "agent",
    workspaceRoot: artifactRoot, executionTargetKind: "local" as const,
  };
  return { artifactRoot, args, binding, body, stage };
}

describe("Cursor Cloud staged artifact to Core handoff", () => {
  it("lets Core independently verify fresh and repeated provider staging", async () => {
    const f = await fixture();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const staged = await f.stage();
      const verified = await readVerifiedWorkspaceFile(f.binding, staged as unknown as NativeRunnerFileHandoffInput);
      expect(verified).toEqual({ body: f.body, contentType: "text/plain", filename: "result.txt", sha256: f.args.sha256, title: "Cloud result" });
    }
  });

  it("keeps Core hash verification after provider staging", async () => {
    const f = await fixture();
    const staged = await f.stage();
    await writeFile(join(f.artifactRoot, f.args.sha256, "result.txt"), Buffer.alloc(f.body.length, 120));
    await expect(readVerifiedWorkspaceFile(f.binding, staged as unknown as NativeRunnerFileHandoffInput)).rejects.toThrow("paperclip_runner_file_handoff_hash_mismatch");
  });
});
