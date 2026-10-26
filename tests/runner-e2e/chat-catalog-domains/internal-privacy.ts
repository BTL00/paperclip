import { expect } from "@playwright/test";
import type { ChatCatalogCase, ChatCatalogContext } from "../chat-catalog-contract.js";
import { createAuthenticatedPerson, enrollAuthenticatedPerson } from "./identity-auth.js";
import { makeDefinition, fixtureWorker } from "./internal-definition.js";
import { project, task, entity, observation, checks, observeInternal, hasLink, type Entity, type InternalObservation } from "./internal-support.js";
import { pollUntil } from "../api.js";

type Person = Awaited<ReturnType<typeof createAuthenticatedPerson>>;
interface PrivateRecord extends Entity { visibility?: "private" | "open"; privacyOwnerUserId?: string | null; personalOwnerUserId?: string | null }
interface PrivacyObservation extends InternalObservation {
  protectedProject: PrivateRecord | null;
  observer: { projectStatus: number; taskStatus: number; projectsStatus: number; searchStatus: number; projectsBody: string; searchBody: string };
  leadStatus: number; unrelatedAgentStatus: number; unrelatedPublicStatus: number;
}
async function mainPerson(ctx: ChatCatalogContext) {
  const session = await ctx.input.api.get<{ user?: { id: string } }>("/api/auth/get-session");
  if (!session.user?.id) throw new Error("Privacy fixtures require the real signed-in responsible person");
  return session.user.id;
}
async function observerPerson(ctx: ChatCatalogContext) {
  const browser = ctx.input.page.context().browser();
  if (!browser || !ctx.input.privateSecrets) throw new Error("Independent authenticated observer requires a browser and attempt-private redaction sink");
  const observer = await createAuthenticatedPerson({ api: ctx.input.api, browser, secrets: ctx.input.privateSecrets, name: "Riley" });
  await enrollAuthenticatedPerson(ctx.input.api, ctx.input.fixtures.company.id, observer, ctx.input.privateSecrets, "viewer");
  return observer;
}
async function personRead(person: Person, path: string) {
  const response = await person.request(path);
  const body = response.ok ? await response.text() : "";
  await response.body?.cancel();
  return { status: response.status, body };
}
async function agentStatus(ctx: ChatCatalogContext, agentId: string, path: string) {
  const key = await ctx.input.api.postSensitive<{ id: string; token: string }>(`/api/agents/${agentId}/keys`, { name: `privacy-probe-${ctx.input.nonce}` });
  ctx.input.privateSecrets?.push(key.token);
  try {
    const url = new URL(path, ctx.input.api.baseURL);
    if (url.origin !== ctx.input.api.baseURL || !url.pathname.startsWith("/api/")) throw new Error("Privacy probe escaped its isolated API");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${key.token}` } });
    await response.body?.cancel(); return response.status;
  } finally { await ctx.input.api.delete(`/api/agents/${agentId}/keys/${key.id}`); }
}
function privacyObservation(value: unknown): PrivacyObservation | undefined {
  const o = observation(value) as PrivacyObservation | undefined;
  return o && !!o.observer && typeof o.leadStatus === "number" && typeof o.unrelatedAgentStatus === "number" ? o : undefined;
}
export function gradePrivateProject(value: unknown) {
  const c = checks(); const o = privacyObservation(value);
  c.add("complete-multi-principal-evidence", !!o, "A privacy result needs real signed-in observer, acting-agent and unrelated-agent API evidence.");
  if (!o) return c.result();
  const p = o.protectedProject; const probe = o.state.inheritanceTask ? entity(o.state, "inheritanceTask") : undefined;
  c.add("agent-created-owned-private-project", !!p && p.visibility === "private" && p.companyId === o.companyId
    && typeof o.state.ownerId === "string" && !!o.state.ownerId && p.privacyOwnerUserId === o.state.ownerId && o.projects.filter(row => /acquisition/i.test(row.name ?? "")).length === 1
    && o.activity.some(row => row.action === "project.created" && row.entityId === p.id && row.agentId === o.leadId),
    "One newly requested private project derives ownership from the authorized person and is actually created by the CEO.");
  c.add("acting-agent-retains-access", o.leadStatus === 200, "The acting CEO can independently read its saved private result under its own agent principal.");
  c.add("observer-cannot-discover-or-read", o.observer.projectsStatus === 200 && o.observer.searchStatus === 200 && [403, 404].includes(o.observer.projectStatus) && [403, 404].includes(o.observer.taskStatus)
    && !!p && !o.observer.projectsBody.includes(p.id) && !o.observer.searchBody.includes(p.id)
    && !!probe && !o.observer.searchBody.includes(probe.id) && !o.observer.searchBody.includes(String(o.state.privateMarker)),
    "The unrelated real company member cannot discover the project or its inherited private task through lists, search or copied resource IDs.");
  c.add("unrelated-agent-excluded", o.unrelatedPublicStatus === 200 && [403, 404].includes(o.unrelatedAgentStatus), "A separate agent without project membership cannot read the new private project.");
  c.add("inheritance-probe-owned-by-project", !!p && !!probe && probe.projectId === p.id && o.tasks.some(row => row.id === probe.id && row.projectId === p.id),
    "A separate labeled production-API probe verifies the new project's task access inheritance; it is not a preseeded project result.");
  c.add("authorized-project-link", !!p && hasLink(o, "projects", p), "The actual authorized person receives the exact saved project link in Chat.");
  return c.result();
}
function privateProject(): ChatCatalogCase {
  let observer: Person | undefined;
  const base = makeDefinition("projects.private-project", async ctx => {
    const ownerId = await mainPerson(ctx); observer = await observerPerson(ctx);
    const unrelated = await fixtureWorker(ctx); await ctx.input.api.patch(`/api/agents/${unrelated.id}`, { name: "Unrelated observer bot" });
    return { ownerId, observerId: observer.id, unrelatedAgent: unrelated, privateMarker: `Protected acquisition ${ctx.input.nonce}` };
  }, gradePrivateProject);
  return { ...base, authentication: "human-session", sourceFiles: [...base.sourceFiles, "chat-catalog-domains/internal-privacy.ts", "chat-catalog-domains/identity-auth.ts"],
    async act(ctx, state) {
      const first = await pollUntil({ label: "Agent-created private project", deadlineAt: Date.now() + 150_000,
        load: () => observeInternal(ctx, state), accept: o => o.projects.filter(row => /acquisition/i.test(row.name ?? "")).length === 1
          && o.runs.length === 1 && o.runs.every(row => row.status === "succeeded") && ctx.issue()?.conversationState === "waiting" });
      const p = first.projects.find(row => /acquisition/i.test(row.name ?? ""))!;
      state.project = p;
      state.inheritanceTask = await task(ctx, String(state.privateMarker), p.id, { description: "Independent private-project inheritance probe; not requested work or agent output." });
      await ctx.input.evidence("chat-catalog-private-project-inheritance-probe.json", { projectId: p.id, task: state.inheritanceTask,
        purpose: "Independently test access inheritance after the model-created project; setup did not create the requested project." });
    },
    async observe(ctx, state) {
      if (!observer) throw new Error("Authenticated privacy observer is unavailable");
      const o = await observeInternal(ctx, state); const p = state.project ? o.projects.find(row => row.id === entity(state, "project").id) as PrivateRecord | undefined : undefined;
      const inheritanceTask = state.inheritanceTask ? entity(state, "inheritanceTask") : undefined;
      const root = `/api/companies/${o.companyId}`;
      const [privateRead, taskRead, visibleProjects, search, leadStatus, unrelatedAgentStatus, unrelatedPublicStatus] = await Promise.all([
        p ? personRead(observer, `/api/projects/${p.id}`) : { status: 0, body: "" },
        inheritanceTask ? personRead(observer, `/api/issues/${inheritanceTask.id}`) : { status: 0, body: "" },
        personRead(observer, `${root}/projects?includeArchived=true`), personRead(observer, `${root}/search?q=${encodeURIComponent(String(state.privateMarker))}`),
        p ? agentStatus(ctx, o.leadId, `/api/projects/${p.id}`) : 0,
        p ? agentStatus(ctx, entity(state, "unrelatedAgent").id, `/api/projects/${p.id}`) : 0,
        agentStatus(ctx, entity(state, "unrelatedAgent").id, `${root}/projects`),
      ]);
      return { ...o, protectedProject: p ?? null, observer: { projectStatus: privateRead.status, taskStatus: taskRead.status,
        projectsStatus: visibleProjects.status, searchStatus: search.status, projectsBody: visibleProjects.body,
        searchBody: search.status === 200 ? JSON.stringify((JSON.parse(search.body) as { results: unknown[] }).results) : "" }, leadStatus, unrelatedAgentStatus, unrelatedPublicStatus } satisfies PrivacyObservation;
    },
    async verifyResult(ctx, state, value) {
      await base.verifyResult(ctx, state, value);
      if (!observer) throw new Error("Missing independent browser observer");
      const p = entity(state, "project"); const observerPage = await observer.context.newPage();
      try {
        await observerPage.goto(new URL(`/${ctx.input.fixtures.company.issuePrefix}/projects/${p.id}`, ctx.input.api.baseURL).href, { waitUntil: "domcontentloaded" });
        await expect(observerPage.getByRole("heading", { name: p.name!, exact: true })).toHaveCount(0);
        await expect(observerPage.getByText(/not found|not available|access denied|do not have access|couldn't load/i).first()).toBeVisible();
        await ctx.input.evidence("chat-catalog-private-project-observer-browser.json", { observerId: observer.id, projectId: p.id,
          denied: true, outcome: "The copied project link presents an access error, without the protected project heading." });
      } finally { await observerPage.close(); }
    },
    async cleanup() { await observer?.dispose(); observer = undefined; },
  };
}
export const projectPrivacyCases: readonly ChatCatalogCase[] = [privateProject()];
