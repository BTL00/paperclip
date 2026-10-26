import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, mkdir, readFile, readdir, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";
import { installedReleaseLaunch } from "../installed-release.js";
import { pollUntil } from "../api.js";
import { checks } from "./internal-support.js";

export interface EmptyInstallationReceipt {
  journeyKind: "operator-before-chat"; query: "Help me set up Paperclip on this machine."; querySent: false;
  cliVersion: string; cliSha256: string; initialHomeEntries: number; companiesBeforeWizard: number;
  deploymentMode: string; configCreatedByOperatorCLI: boolean; selectedBind: "loopback";
  companyId: string; firstAgentId: string; firstAgentReady: boolean; chatComposerVisible: boolean;
  cleanup: "complete" | "failed";
}
/** A second, genuinely empty installation target. The harness controller is
 * neither its server nor its database. Only the sole campaign coordinator may
 * invoke this function. The wizard callback must use normal public UI controls;
 * independent API and browser readback below owns the acceptance receipt. */
export async function runEmptyInstallationBoundary(input: {
  browser: Browser; installedCli: string; expectedCliSha256: string; expectedCliVersion: string;
  /** Attempt-owned ignored/private result path; raw operator logs can contain bootstrap tokens. */
  privateLogPath: string;
  deadlineAt: number; evidence(name: string, value: unknown): Promise<void>;
  finishWizard(target: { origin: string; page: Page; deadlineAt: number }): Promise<{ companyId: string; firstAgentId: string }>;
}): Promise<EmptyInstallationReceipt> {
  const launch = installedReleaseLaunch(input.installedCli);
  const cliSha256 = createHash("sha256").update(await readFile(launch.cli)).digest("hex");
  if (cliSha256 !== input.expectedCliSha256 || launch.version !== input.expectedCliVersion) throw new Error("Empty installation candidate differs from its declared immutable CLI pin");
  const directory = await mkdtemp(path.join(tmpdir(), "paperclip-chat-onboarding-"));
  const home = path.join(directory, "instance"); await mkdir(home, { mode: 0o700 });
  const initialHomeEntries = (await readdir(home)).length;
  if (initialHomeEntries !== 0) throw new Error("Operator installation did not start from an empty isolated home");
  const config = path.join(home, "config.json"); const port = await unusedLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  if (!path.isAbsolute(input.privateLogPath) || path.relative(directory, input.privateLogPath).startsWith("..") === false) throw new Error("Operator logs require an external attempt-owned private result path");
  const log = await open(input.privateLogPath, "wx", 0o600);
  // Closed environment prevents the existing instance, DB, provider credentials
  // or eval qualification flags from becoming a prerequisite of this install.
  const environment: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER,
    TMPDIR: process.env.TMPDIR, SHELL: process.env.SHELL, LANG: process.env.LANG,
    PAPERCLIP_HOME: home, PAPERCLIP_CONFIG: config, PAPERCLIP_INSTANCE_ID: `onboarding-${randomUUID()}`,
    PORT: String(port), PAPERCLIP_OPEN_ON_LISTEN: "false", PAPERCLIP_DEPLOYMENT_MODE: "local_trusted",
    PAPERCLIP_BIND: "loopback", PAPERCLIP_BIND_HOST: "127.0.0.1", SERVE_UI: "true", DO_NOT_TRACK: "1" };
  const processHandle = spawn(process.execPath, [...launch.args, "--config", config], {
    cwd: launch.cwd, env: environment, detached: true, stdio: ["ignore", log.fd, log.fd],
  });
  let spawnFailed = false; processHandle.once("error", () => { spawnFailed = true; });
  const exited = new Promise<void>(resolve => processHandle.once("exit", () => resolve()));
  const context = await input.browser.newContext({ baseURL: origin }); const page = await context.newPage();
  let receipt: EmptyInstallationReceipt | undefined; let failed = false;
  async function get<T>(endpoint: string): Promise<T> {
    const response = await context.request.get(origin + endpoint, { timeout: 5_000 });
    if (!response.ok()) throw new Error(`Owned installation read returned HTTP ${response.status()}`);
    return response.json() as Promise<T>;
  }
  try {
    const health = await pollUntil({ label: "operator-created installation readiness", deadlineAt: Math.min(input.deadlineAt, Date.now() + 180_000), intervalMs: 1_000,
      load: () => get<{ status: string; deploymentMode: string }>("/api/health"),
      accept: result => result.status === "ok", reject: () => spawnFailed || processHandle.exitCode !== null ? "Public onboarding CLI exited before readiness" : undefined });
    const companies = await get<Array<{ id: string }>>("/api/companies");
    expect(companies).toHaveLength(0);
    const saved = JSON.parse(await readFile(config, "utf8")) as { server?: { port?: number; host?: string }; database?: unknown };
    expect(saved.server?.port).toBe(port); expect(saved.database).toBeTruthy();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "What is the name of your organization?", exact: true })).toBeVisible();
    await input.evidence("identity-empty-installation-before-company.json", { journeyKind: "operator-before-chat", querySent: false,
      initialHomeEntries, companiesBeforeWizard: companies.length, cliVersion: launch.version, cliSha256, healthReady: true, selectedBind: "loopback" });
    const chosen = await input.finishWizard({ origin, page, deadlineAt: input.deadlineAt });
    const company = await get<{ id: string; issuePrefix: string }>(`/api/companies/${chosen.companyId}`);
    const agent = await get<{ id: string; companyId: string; lifecycleState: string; status: string }>(`/api/agents/${chosen.firstAgentId}`);
    expect(company.id).toBe(chosen.companyId); expect(agent.companyId).toBe(company.id); expect(agent.lifecycleState).toBe("ready");
    expect(["idle", "active"]).toContain(agent.status);
    await page.goto(`/${company.issuePrefix}/chats/${agent.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("task-chat-composer-input")).toBeVisible();
    const runs = await get<unknown[]>(`/api/companies/${company.id}/heartbeat-runs?limit=100`);
    expect(runs).toHaveLength(0);
    receipt = { journeyKind: "operator-before-chat", query: "Help me set up Paperclip on this machine.", querySent: false,
      cliVersion: launch.version, cliSha256, initialHomeEntries, companiesBeforeWizard: companies.length,
      deploymentMode: health.deploymentMode, configCreatedByOperatorCLI: true, selectedBind: "loopback",
      companyId: company.id, firstAgentId: agent.id, firstAgentReady: true, chatComposerVisible: true, cleanup: "failed" };
    return receipt;
  } catch (error) { failed = true; throw error; }
  finally {
    await context.close();
    // This child owns its new process group; signals never target the harness
    // controller, an attached instance, or an unverified database process.
    if (processHandle.pid && processHandle.exitCode === null) {
      try { process.kill(-processHandle.pid, "SIGTERM"); } catch { /* Already exited. */ }
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([exited, new Promise<void>(resolve => { timer = setTimeout(resolve, 10_000); })]); clearTimeout(timer);
      if (processHandle.exitCode === null) { try { process.kill(-processHandle.pid, "SIGKILL"); } catch { /* Already exited. */ } await exited; }
    }
    await log.close(); await rm(directory, { recursive: true, force: true });
    if (receipt) { receipt.cleanup = "complete"; await input.evidence("identity-empty-installation-result.json", receipt); }
    else await input.evidence("identity-empty-installation-result.json", { journeyKind: "operator-before-chat", querySent: false, failed, cleanup: "complete" });
  }
}
export function gradeEmptyInstallation(value: unknown) {
  const c = checks(); const r = value as EmptyInstallationReceipt | undefined;
  c.add("operator-boundary-identity", !!r && r.journeyKind === "operator-before-chat" && r.querySent === false
    && r.query === "Help me set up Paperclip on this machine.", "The exact request is recorded before chat exists and is never credited to a nonexistent agent.");
  c.add("fresh-pinned-installation", !!r && /^[a-f0-9]{64}$/.test(r.cliSha256) && !!r.cliVersion && r.initialHomeEntries === 0 && r.companiesBeforeWizard === 0
    && r.configCreatedByOperatorCLI && r.selectedBind === "loopback", "The pinned public operator CLI creates a new configuration and starts a genuinely empty target.");
  c.add("actual-later-chat-readiness", !!r && !!r.companyId && !!r.firstAgentId && r.companyId !== r.firstAgentId
    && r.firstAgentReady && r.chatComposerVisible, "Full public wizard completion is independently checked as a distinct later company and ready first agent.");
  c.add("owned-installation-cleanup", r?.cleanup === "complete", "Only the owned target's process group, private home and database are removed; private attempt logs remain retained.");
  return c.result();
}
async function unusedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Loopback port allocation failed");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); return address.port;
}
