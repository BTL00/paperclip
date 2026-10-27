import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Cookie } from "@playwright/test";
import type { WizardReceipt, WizardHarness } from "./identity-wizard.js";
export const identityPrivateBrowserSources = ["chat-catalog-domains/identity-private-browser.ts", "chat-catalog-domains/identity-private-browser-worker.ts"];
export type PrivateIdentityOperation =
  | { kind: "sign-in"; origin: string; startPath: string; returnPath: string; email: string; password: string; cookies: Cookie[] }
  | { kind: "wizard"; origin: string; startPath: string; cookies: Cookie[]; credential: string; companyName: string; agentName: string; harness: WizardHarness; resume?: boolean; entry?: "empty" | "new-company"; deadlineAt: number }
  | { kind: "observability"; origin: string; startPath: string; cookies: Cookie[]; endpoint: string; credential: string }
  | { kind: "canary-failure"; origin: string; startPath: string; cookies: Cookie[]; credential: string };
export interface PrivateIdentityReceipt { processIsolation: true; testRunnerAttached: false; apiStepRecorder: false; tracingEnabled: false; videoEnabled: false; operation: PrivateIdentityOperation["kind"]; completed: true; failedApiCallObserved?: boolean; wizard?: WizardReceipt }
/** Request/state files are outside artifacts, mode0600, removed even on failure.
 * No private value enters Test APIs, argv, environment, stdout or error text. */
export async function privateIdentityBrowser(input: PrivateIdentityOperation, callbacks: { storageState?(file: string): Promise<void>; company?(id: string): void } = {}): Promise<PrivateIdentityReceipt> {
  const directory = await mkdtemp(path.join(tmpdir(), "paperclip-identity-private-"));
  try {
    const request = path.join(directory, "request.json"); const channel = process.env.PAPERCLIP_PLAYWRIGHT_CHANNEL;
    await writeFile(request, JSON.stringify({ ...input, executablePath: process.env.PAPERCLIP_RUNNER_E2E_CHROMIUM_EXECUTABLE ?? (channel ? undefined : chromium.executablePath()), channel }), { mode: 0o600 });
    const worker = fileURLToPath(new URL("./identity-private-browser-worker.ts", import.meta.url));
    const loader = fileURLToPath(new URL("../../../server/node_modules/tsx/dist/loader.mjs", import.meta.url));
    let output: string;
    try { output = (await promisify(execFile)(process.execPath, ["--import", loader, worker, request], { timeout: input.kind === "wizard" ? Math.max(1, Math.min(540_000, input.deadlineAt - Date.now())) : 120_000,
      maxBuffer: 32_768, env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", DO_NOT_TRACK: "1", HOME: directory, TMPDIR: directory } })).stdout; }
    catch { throw new Error("Private identity browser operation failed; child diagnostics withheld"); }
    let receipt: PrivateIdentityReceipt;
    try { receipt = JSON.parse(output) as PrivateIdentityReceipt; } catch { throw new Error("Invalid closed private identity receipt"); }
    if (receipt.operation !== input.kind || receipt.completed !== true || receipt.processIsolation !== true || receipt.testRunnerAttached !== false || receipt.apiStepRecorder !== false || receipt.tracingEnabled !== false || receipt.videoEnabled !== false
      || Object.keys(receipt).some(key => !["operation", "completed", "processIsolation", "testRunnerAttached", "apiStepRecorder", "tracingEnabled", "videoEnabled", "failedApiCallObserved", "wizard"].includes(key))) throw new Error("Invalid closed private identity receipt");
    if (input.kind === "sign-in") await callbacks.storageState?.(path.join(directory, "storage.json"));
    return receipt;
  } finally {
    try { const company = JSON.parse(await readFile(path.join(directory, "company.json"), "utf8")) as { id: string }; if (/^[a-f0-9-]{36}$/i.test(company.id)) callbacks.company?.(company.id); } catch { /* no company created */ }
    await rm(directory, { recursive: true, force: true });
  }
}
