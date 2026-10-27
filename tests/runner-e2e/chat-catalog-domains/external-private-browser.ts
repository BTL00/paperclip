import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium, type Cookie } from "@playwright/test";
export interface PrivateBrowserReceipt { processIsolation: true; testRunnerAttached: false; tracingEnabled: false; videoEnabled: false; apiStepRecorder: false; credentialEntered?: boolean; connectionId?: string; challengeVisible?: boolean; passwordInput?: boolean; autocompleteOff?: boolean; humanSubmittedSecurely?: boolean; visibleReady?: boolean; storageClean?: boolean }
export async function privateBrowserEntry(input: { mode: "secure-key" | "canary"; baseURL: string; setupURL: string; providerURL: string; credential: string; cookies: Cookie[] }) {
  const directory = await mkdtemp(path.join(tmpdir(), "paperclip-private-browser-"));
  try {
    const request = path.join(directory, "request.json");
    const channel = process.env.PAPERCLIP_PLAYWRIGHT_CHANNEL;
    await writeFile(request, JSON.stringify({ ...input, executablePath: process.env.PAPERCLIP_RUNNER_E2E_CHROMIUM_EXECUTABLE ?? (channel ? undefined : chromium.executablePath()), channel }), { mode: 0o600 });
    const worker = fileURLToPath(new URL("./external-private-browser-worker.ts", import.meta.url));
    const loader = fileURLToPath(new URL("../../../server/node_modules/tsx/dist/loader.mjs", import.meta.url));
    let output: string;
    try {
      const result = await promisify(execFile)(process.execPath, ["--import", loader, worker, request], { timeout: 120_000, maxBuffer: 16_384,
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", DO_NOT_TRACK: "1", HOME: directory, TMPDIR: directory } }); output = result.stdout;
    } catch { throw new Error("Private browser entry failed; child output and credential-bearing request withheld"); }
    let receipt: PrivateBrowserReceipt; try { receipt = JSON.parse(output) as PrivateBrowserReceipt; } catch { throw new Error("Private browser returned invalid closed receipt"); }
    if (receipt.processIsolation !== true || receipt.testRunnerAttached !== false || receipt.tracingEnabled !== false || receipt.videoEnabled !== false || receipt.apiStepRecorder !== false
      || Object.keys(receipt).some(key => !["processIsolation", "testRunnerAttached", "tracingEnabled", "videoEnabled", "apiStepRecorder", "credentialEntered", "connectionId", "challengeVisible", "passwordInput", "autocompleteOff", "humanSubmittedSecurely", "visibleReady", "storageClean"].includes(key))) throw new Error("Private browser receipt exceeds its closed contract");
    return receipt;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
