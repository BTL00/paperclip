import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { assertChatCatalogFingerprintLane, chatCatalogCaseFingerprint, fingerprintChatDependencyClosure } from "./chat-catalog-fingerprint.js";
import { findChatCatalogCase, loadChatCatalogImplementation, type ChatCatalogDescriptor } from "./chat-catalog-registry.js";
const directories: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "chat-fingerprint-")); directories.push(root);
  const write = (file: string, body: string) => writeFileSync(path.join(root, file), body);
  write("shared.ts", 'export { value } from "./transitive.js";');
  write("selected.ts", 'import { value } from "./shared.js"; export const result = value;');
  write("transitive.ts", "export const value = 1;");
  write("unselected.ts", 'throw new Error("Unselected module must never execute");');
  return { root, write, fingerprint: () => fingerprintChatDependencyClosure({ root, entries: ["selected.ts"], selected: { id: "selected", query: "Exact request" } }).digest };
}
it("invalidates shared, selected and transitive dependencies while ignoring an unloaded domain", () => {
  for (const target of ["shared.ts", "selected.ts", "transitive.ts"]) {
    const f = fixture(); const before = f.fingerprint();
    f.write("unselected.ts", "export const changed = true;"); expect(f.fingerprint()).toBe(before);
    f.write(target, "export const changed = true;"); expect(f.fingerprint()).not.toBe(before);
  }
});
it("conservatively binds unknown dynamic imports", () => {
  const f = fixture(); f.write("selected.ts", "export const load = (name: string) => import(name);");
  const before = f.fingerprint(); f.write("unselected.ts", "export const changed = true;");
  expect(f.fingerprint()).not.toBe(before);
});
it("executes only the selected domain and rejects metadata drift", async () => {
  const f = fixture();
  const descriptor: ChatCatalogDescriptor = { scenarioId: "selected", modulePath: "./chat-catalog-domains/selected.js", exportName: "cases",
    sourceFiles: ["selected.ts"], oracleVersion: "v1", expectedRunCount: 1, turnTimeoutMs: 100, attemptTimeoutMs: 1000 };
  f.write("selected.mjs", `globalThis.__selectedChatLoads = (globalThis.__selectedChatLoads ?? 0) + 1; export const cases = [{...${JSON.stringify(descriptor)}, setup(){}, observe(){}, grade(){}, verifyResult(){}}];`);
  f.write("unselected.mjs", 'throw new Error("Unselected domain executed");');
  const requested: string[] = [];
  const loaded = await loadChatCatalogImplementation(descriptor, async specifier => {
    requested.push(specifier);
    return import(pathToFileURL(path.join(f.root, "selected.mjs")).href);
  });
  expect(loaded.scenarioId).toBe("selected"); expect(requested).toHaveLength(1);
  expect(requested[0]).toContain("/chat-catalog-domains/selected.js");
  await expect(loadChatCatalogImplementation({ ...descriptor, expectedRunCount: 2 }, async () => ({ cases: [loaded] }))).rejects.toThrow("Runtime descriptor drift");
});

it("refuses formerly inactive launch targets and source drift falls back conservatively", () => {
  const lane = { suiteId: "chat-features", flow: "agent_chat", environment: "local" };
  expect(assertChatCatalogFingerprintLane(lane, {}, [])).toMatchObject({ installedLane: false });
  for (const changed of [{ ...lane, environment: "daytona" }, { ...lane, flow: "github_review_journey" }])
    expect(() => assertChatCatalogFingerprintLane(changed, {}, [])).toThrow();
  expect(() => assertChatCatalogFingerprintLane(lane, { PAPERCLIP_RUNNER_E2E_INSTALLED_CLI: "/candidate" }, [])).toThrow();
  expect(() => assertChatCatalogFingerprintLane(lane, {}, ["--target-config"])).toThrow();
  const f = fixture(); f.write("selected.ts", "export const load=(name:string)=>import(name);");
  const before = fingerprintChatDependencyClosure({ root: f.root, entries: ["selected.ts"], selected: lane,
    reviewedDynamicResolutions: { "selected.ts": { sourceSha256: "outdated", resolution: "reviewed-inactive", dependencies: [] } } });
  expect(before.unknownDynamicImports).toEqual(["selected.ts"]);
  f.write("unselected.ts", "export const changed=true;");
  expect(fingerprintChatDependencyClosure({ root: f.root, entries: ["selected.ts"], selected: lane }).digest).not.toBe(before.digest);
});

it("binds the real selected area and reviewed worker closure without importing unrelated domain areas", () => {
  const descriptor = findChatCatalogCase("projects.create-project")!;
  const result = chatCatalogCaseFingerprint(descriptor, { suiteId: "chat-features", flow: "agent_chat", environment: "local" });
  const files = result.sources.map(source => source.file);
  expect(files).toContain("tests/runner-e2e/chat-catalog-domains/internal-projects.ts");
  expect(files).toContain("tests/runner-e2e/chat-catalog-domains/internal-support.ts");
  expect(files).toContain("packages/adapter-utils/src/workspace-snapshot-thread-worker.ts");
  expect(files).not.toContain("tests/runner-e2e/chat-catalog-domains/internal-goals.ts");
  expect(files).toContain("tests/runner-e2e/chat-catalog-domains/identity-auth.ts");
  expect(result.unknownDynamicImports).toEqual([]);
});
it("fails closed when preserved prerequisites or a rejected query lack their independent verifier", async () => {
  const base: ChatCatalogDescriptor = { scenarioId: "selected", modulePath: "./chat-catalog-domains/selected.js", exportName: "cases",
    sourceFiles: ["selected.ts"], oracleVersion: "v1", expectedRunCount: 1, turnTimeoutMs: 100, attemptTimeoutMs: 1000 };
  const callbacks = { setup() {}, observe() {}, grade() {}, verifyResult() {} };
  const setup = { ...base, setupPolicy: { funding: "preserve-scenario" as const, invariantCheckIds: ["saved-budget"] } };
  await expect(loadChatCatalogImplementation(setup, async () => ({ cases: [{ ...setup, ...callbacks }] }))).rejects.toThrow("independent prerequisite assertions");
  const rejected = { ...base, queryOutcome: "rejected" as const };
  await expect(loadChatCatalogImplementation(rejected, async () => ({ cases: [{ ...rejected, ...callbacks }] }))).rejects.toThrow("independent rejection evidence");
});

it("replays the retained public name-only identity after raw selected inputs have been removed", () => {
  const descriptor = findChatCatalogCase("projects.create-project")!;
  const execution = { executionId: "offline-selected", suiteId: "chat-features", flow: "agent_chat", environment: "local" };
  const names = { credentialNames: ["OPENAI_API_KEY"], referenceNames: [], externalRequirements: [] };
  const before = chatCatalogCaseFingerprint(descriptor, execution, names).digest;
  vi.stubEnv("PAPERCLIP_CHAT_PRIVATE_INPUTS", "/removed/owned-secret-file.json");
  expect(chatCatalogCaseFingerprint(descriptor, execution, names).digest).toBe(before);
  expect(() => chatCatalogCaseFingerprint(descriptor, execution)).toThrow();
});
