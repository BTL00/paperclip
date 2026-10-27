import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium, type Cookie } from "@playwright/test";
import type { GrokRoutinePrivateInput } from "./external-grok-private-contract.js";
import type { SlackIdentityPrivateInput } from "./external-slack-identity-contract.js";
export interface PrivateBrowserReceipt { processIsolation: true; testRunnerAttached: false; tracingEnabled: false; videoEnabled: false; apiStepRecorder: false; credentialEntered?: boolean; connectionId?: string; challengeVisible?: boolean; passwordInput?: boolean; autocompleteOff?: boolean; humanSubmittedSecurely?: boolean; visibleReady?: boolean; storageClean?: boolean; newTokenId?: string; tokenUiVisible?: boolean; newWorkedBeforeRevocation?: boolean; oldWorkedUntilRevocation?: boolean; oldRevoked?: boolean; newWorksAfter?: boolean; oldStatusAfter?: number; otherWorksAfter?: boolean; secretId?:string; secretUiVisible?:boolean; bindingId?:string; routineConfigured?:boolean; routineUiVisible?:boolean; identityConfirmed?:boolean; identityUiVisible?:boolean; principalId?:string; paperclipUserId?:string }
export async function privateBrowserEntry(input: { mode: "secure-key" | "canary" | "gateway-token-rotation" | "company-secret-create" | "personal-secret-create" | "grok-routine-configure" | "slack-identity-confirm"; slackIdentity?:SlackIdentityPrivateInput; grok?:GrokRoutinePrivateInput; companyId?:string; personal?:{definitionId:string;userId:string}; gateway?: { id: string; oldTokenId: string; otherToken: string; endpointPath: string; readName: string }; baseURL: string; setupURL: string; providerURL: string; credential: string; cookies: Cookie[] }, onToken?: (token: { id: string; token: string }) => void) {
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
      || Object.keys(receipt).some(key => !["processIsolation", "testRunnerAttached", "tracingEnabled", "videoEnabled", "apiStepRecorder", "credentialEntered", "connectionId", "challengeVisible", "passwordInput", "autocompleteOff", "humanSubmittedSecurely", "visibleReady", "storageClean", "newTokenId", "tokenUiVisible", "newWorkedBeforeRevocation", "oldWorkedUntilRevocation", "oldRevoked", "newWorksAfter", "oldStatusAfter", "otherWorksAfter", "secretId", "secretUiVisible", "bindingId", "routineConfigured", "routineUiVisible", "identityConfirmed", "identityUiVisible", "principalId", "paperclipUserId"].includes(key))) throw new Error("Private browser receipt exceeds its closed contract");
    if (input.mode === "slack-identity-confirm" && (receipt.identityConfirmed !== true || receipt.identityUiVisible !== true || receipt.principalId !== input.slackIdentity?.principalId || receipt.paperclipUserId !== input.slackIdentity?.userId)) throw new Error("Invalid closed Slack identity confirmation receipt");
    if (input.mode === "grok-routine-configure" && (receipt.bindingId !== input.grok?.bindingId || receipt.routineConfigured !== true || receipt.routineUiVisible !== true || receipt.visibleReady !== undefined)) throw new Error("Invalid closed Grok routine configuration receipt");
    if (input.mode === "gateway-token-rotation") {
      if (!onToken) throw new Error("Gateway rotation requires its private credential sink");
      const token = JSON.parse(await readFile(path.join(directory, "token.json"), "utf8")) as { id: string; token: string };
      if (!/^[a-f0-9-]{36}$/i.test(token.id) || token.id !== receipt.newTokenId || typeof token.token !== "string" || token.token.length > 8192 || !token.token) throw new Error("Invalid private gateway credential handoff");
      onToken(token);
    }
    return receipt;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
