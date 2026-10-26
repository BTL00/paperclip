import { expect } from "@playwright/test";
import type { ChatCatalogCase, ChatCatalogContext } from "../chat-catalog-contract.js";
import { observeInternal, type Entity, type InternalObservation } from "./internal-support.js";

export interface IdentityObservation extends InternalObservation {
  companies: Entity[]; company: Entity; agents: Entity[]; interactions: Interaction[];
}
export interface Interaction extends Entity {
  kind: string; status: string; payload: { prompt?: string; toolAction?: { connectionId?: string; actionRequestId?: string }; questionSet?: { submitLabel?: string; questions: Array<{ id: string; prompt: string; answerMode: string; required?: boolean }> } };
  result?: { answers?: Array<{ questionId: string; otherText?: string; optionIds?: string[] }> };
  resolvedByUserId?: string; resolvedByAgentId?: string; sourceRunId?: string;
}
export async function openStandingChat(ctx: ChatCatalogContext) {
  await ctx.input.api.post(`/api/companies/${ctx.input.fixtures.company.id}/chats/${ctx.input.fixtures.agent.id}`);
  await ctx.refreshIssue();
  if (!ctx.issue()) throw new Error("Public standing-chat creation did not persist");
  return ctx.issue()!;
}
export async function observeIdentity(ctx: ChatCatalogContext, state: Record<string, unknown>): Promise<IdentityObservation> {
  const internal = await observeInternal(ctx, state);
  const root = `/api/companies/${ctx.input.fixtures.company.id}`;
  const [companies, company, agents, interactions] = await Promise.all([
    ctx.input.api.get<Entity[]>("/api/companies"), ctx.input.api.get<Entity>(root),
    ctx.input.api.get<Entity[]>(`${root}/agents`),
    ctx.issue() ? ctx.input.api.get<Interaction[]>(`/api/issues/${ctx.issue()!.id}/interactions`) : Promise.resolve([]),
  ]);
  return { ...internal, companies, company, agents, interactions };
}
export function identityObservation(value: unknown): IdentityObservation | undefined {
  const o = value as IdentityObservation | undefined;
  return o && typeof o.companyId === "string" && typeof o.leadId === "string" && !!o.state && !!o.company
    && [o.tasks, o.projects, o.goals, o.activity, o.documents, o.links, o.runs, o.companies, o.agents, o.interactions].every(Array.isArray) ? o : undefined;
}
export function identityDefinition(scenarioId: string, setup: ChatCatalogCase["setup"], grade: ChatCatalogCase["grade"], extra: Partial<ChatCatalogCase> = {}): ChatCatalogCase {
  return { scenarioId, setup, grade, observe: observeIdentity, oracleVersion: "paperclip.chat-catalog.identity.v1",
    sourceFiles: ["chat-catalog-domains/identity-support.ts", "chat-catalog-domains/internal-support.ts", `chat-catalog-domains/identity-${scenarioId.split(".")[0]}.ts`, `chat-scenarios/${scenarioId.split(".")[0]}.yaml`],
    expectedRunCount: 1, turnTimeoutMs: 120_000, attemptTimeoutMs: 300_000,
    async verifyResult(ctx) { await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible(); }, ...extra };
}
export async function waitForReply(ctx: ChatCatalogContext) {
  const { pollUntil } = await import("../api.js");
  await pollUntil({ label: "initial identity response", deadlineAt: Date.now() + 150_000, intervalMs: 500,
    load: async () => { await ctx.refreshIssue(); return { issue: ctx.issue(), runs: await ctx.allRuns() }; },
    accept: ({ issue, runs }) => issue?.conversationState === "waiting" && runs.length === 1 && runs.every(run => run.status === "succeeded"),
    reject: ({ runs }) => runs.some(run => ["failed", "cancelled", "timed_out"].includes(run.status)) ? "Initial response failed" : undefined });
}
export async function identityWorker(ctx: ChatCatalogContext, name = "Morgan") {
  const { api, execution, fixtures, workspacePath, nonce } = ctx.input;
  const base = execution.profile.buildAgent({ environmentId: fixtures.environment.id, environmentFixtureId: execution.environment.id,
    workspacePath, secretRefs: fixtures.secretRefs, executionId: nonce });
  const payload = { ...base, name, role: "engineer", title: "Website engineer", reportsTo: fixtures.agent.id,
    runtimeConfig: { ...(base.runtimeConfig as Record<string, unknown>), heartbeat: { enabled: false, maxConcurrentRuns: 1 } } };
  const { codexSubscriptionAgentConfig } = await import("../codex-subscription-fixture.js");
  return api.post<Entity>(`/api/companies/${fixtures.company.id}/agents`, execution.profile.credential === "CODEX_AUTH_JSON"
    ? codexSubscriptionAgentConfig(payload, process.env, fixtures.company.id) : payload);
}
/** Real agent bearer, public route and HTTP status. Never pass bearer into
 * Playwright requests, case state, screenshots, model context or evidence. */
export async function probeAgentPermission(ctx: ChatCatalogContext, path: string, method: string, body?: unknown) {
  const id = ctx.input.fixtures.agent.id;
  const key = await ctx.input.api.postSensitive<{ id: string; token: string }>(`/api/agents/${id}/keys`, { name: `chat-eval-probe-${ctx.input.nonce}` });
  try {
    const target = new URL(path, ctx.input.api.baseURL);
    if (target.origin !== ctx.input.api.baseURL || !target.pathname.startsWith("/api/")) throw new Error("Agent permission probe escaped fixture API");
    const response = await fetch(target, { method, redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${key.token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    await response.body?.cancel(); return response.status;
  } finally { await ctx.input.api.delete(`/api/agents/${id}/keys/${key.id}`); }
}
export async function readAgentResource(ctx: ChatCatalogContext, path: string): Promise<{ status: number; data?: unknown }> {
  const id = ctx.input.fixtures.agent.id;
  const key = await ctx.input.api.postSensitive<{ id: string; token: string }>(`/api/agents/${id}/keys`, { name: `chat-eval-read-${ctx.input.nonce}` });
  try {
    const target = new URL(path, ctx.input.api.baseURL);
    if (target.origin !== ctx.input.api.baseURL || !target.pathname.startsWith("/api/")) throw new Error("Agent read escaped fixture API");
    const response = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${key.token}` } });
    if (!response.ok) { await response.body?.cancel(); return { status: response.status }; }
    return { status: response.status, data: await response.json() };
  } finally { await ctx.input.api.delete(`/api/agents/${id}/keys/${key.id}`); }
}
export async function followRenderedLink(ctx: ChatCatalogContext, href: string) {
  const link = ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(href)}]`).first();
  await expect(link).toBeVisible(); await link.click();
}
