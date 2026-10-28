import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { stageCursorCloudArtifact } from "./artifact-delivery.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
describe("Cursor Cloud artifact registration boundary", () => {
  it("stages independently downloaded bytes and preserves the exact metadata for Core registration", async () => {
    const root = await mkdtemp("/tmp/cc-artifact-"); roots.push(root);
    const bytes = Buffer.from("downloaded provider result\n"); const sha256 = createHash("sha256").update(bytes).digest("hex");
    const client = { listArtifacts: vi.fn(async () => ({ items: [{ path: "artifacts/result.txt", sizeBytes: bytes.length, updatedAt: "2026-10-28" }] })), downloadArtifact: vi.fn(async () => bytes) };
    const args = { contentRef: "cursor-artifact:artifacts/result.txt", filename: "result.txt", byteSize: bytes.length, sha256, contentType: "text/plain" };
    const normalized = await stageCursorCloudArtifact({ arguments: args, agentId: "agent", runtimeDirectory: root, artifactRoot: join(root, "artifacts"), client, signal: new AbortController().signal });
    expect(normalized).toEqual({ ...args, contentRef: join(root, "artifacts", sha256, "result.txt") });
    expect(await readFile(normalized.contentRef as string)).toEqual(bytes);
    await expect(stageCursorCloudArtifact({ arguments: { ...args, sha256: "a".repeat(64) }, agentId: "agent", runtimeDirectory: root, artifactRoot: join(root, "artifacts"), client, signal: new AbortController().signal })).rejects.toThrow("do not match");
  });
  it("rejects host paths, traversal, unlisted paths, size mismatches and an unadmitted root", async () => {
    const root = await mkdtemp("/tmp/cc-artifact-"); roots.push(root);
    const client = { listArtifacts: vi.fn(async () => ({ items: [] })), downloadArtifact: vi.fn(async () => Buffer.from("not read")) };
    const input = { agentId: "agent", runtimeDirectory: root, artifactRoot: join(root, "artifacts"), client, signal: new AbortController().signal };
    for (const contentRef of ["/etc/passwd", "cursor-artifact:../outside", "cursor-artifact:artifacts/missing"]) {
      await expect(stageCursorCloudArtifact({ ...input, arguments: { contentRef, filename: "file", byteSize: 1, sha256: "a".repeat(64) } })).rejects.toThrow();
    }
    await expect(stageCursorCloudArtifact({ ...input, artifactRoot: root, arguments: { contentRef: "cursor-artifact:artifacts/file", filename: "file", byteSize: 1, sha256: "a".repeat(64) } })).rejects.toThrow("outside");
    expect(client.downloadArtifact).not.toHaveBeenCalled();
  });
});
