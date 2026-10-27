import { readFile } from "node:fs/promises";
import { chromium, test, type Cookie } from "@playwright/test";
interface Request { mode: "secure-key" | "canary"; baseURL: string; setupURL: string; providerURL: string; credential: string; cookies: Cookie[]; executablePath?: string; channel?: string }
/** Separate Node process: no Playwright Test worker, API-step listener or artifact
 * recorder exists. This module never enables tracing, video or screenshots. */
async function main() {
  let attached = false; try { test.info(); attached = true; } catch { /* expected outside Test */ }
  if (attached) throw new Error("Private browser worker cannot run inside Playwright Test");
  const input = JSON.parse(await readFile(process.argv[2]!, "utf8")) as Request;
  if (!input.credential || input.credential.length > 8192 || !["secure-key", "canary"].includes(input.mode)) throw new Error("Invalid private browser request");
  const base = new URL(input.baseURL);
  if (base.hostname !== "127.0.0.1" || base.protocol !== "http:" || new URL(input.setupURL).origin !== base.origin) throw new Error("Private browser target is outside the disposable loopback instance");
  const browser = await chromium.launch({ headless: true, ...(input.executablePath ? { executablePath: input.executablePath } : {}), ...(input.channel ? { channel: input.channel } : {}) });
  try {
    const context = await browser.newContext({ baseURL: base.origin });
    await context.addCookies(input.cookies); const page = await context.newPage(); page.setDefaultTimeout(30_000);
    if (input.mode === "canary") {
      await page.setContent('<input type="password" aria-label="App key" autocomplete="off">');
      const field = page.getByLabel("App key"); await field.fill(input.credential);
      if (await field.inputValue() !== input.credential) throw new Error("Canary entry failed");
      return { processIsolation: true, testRunnerAttached: false, credentialEntered: true, tracingEnabled: false, videoEnabled: false, apiStepRecorder: false };
    }
    await page.goto(input.setupURL, { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: "MCP server URL", exact: true }).fill(input.providerURL); await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Check link", exact: true }).click();
    const key = page.getByLabel("App key", { exact: true }); await key.waitFor({ state: "visible" });
    const passwordInput = await key.getAttribute("type") === "password", autocompleteOff = await key.getAttribute("autocomplete") === "off";
    await key.fill(input.credential);
    const created = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/tools/apps/connect") && response.request().method() === "POST" && response.status() === 201);
    await page.getByRole("button", { name: "Check link", exact: true }).click();
    const connectionId = (await (await created).json() as { connectionId: string }).connectionId;
    if (!/^[a-f0-9-]{36}$/i.test(connectionId)) throw new Error("Secure setup did not return a bounded connection identity");
    await page.getByRole("heading", { name: /is ready\./i }).waitFor({ state: "visible" });
    const storageClean = await page.evaluate(secret => !JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), location.href]).includes(secret), input.credential);
    await page.getByRole("button", { name: "View connection", exact: true }).click(); await key.waitFor({ state: "detached" });
    return { processIsolation: true, testRunnerAttached: false, tracingEnabled: false, videoEnabled: false, apiStepRecorder: false, connectionId, challengeVisible: true, passwordInput, autocompleteOff, humanSubmittedSecurely: true, visibleReady: true, storageClean };
  } finally { await browser.close(); }
}
main().then(receipt => process.stdout.write(JSON.stringify(receipt))).catch(() => { process.stderr.write("Private browser operation failed; diagnostics withheld"); process.exitCode = 1; });
