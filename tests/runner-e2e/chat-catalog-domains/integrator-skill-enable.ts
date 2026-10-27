import type { CompanySkillDetail } from "../../../packages/shared/src/types/company-skill.js";
import type { AgentSkillSnapshot } from "../../../packages/shared/src/types/adapter-skills.js";
import { SKILL_POLICY_ACTIONS } from "../../../packages/shared/src/validators/skill-policy.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import { checks, observation, project, task, type Entity, type InternalObservation } from "./internal-support.js";
import { fixtureWorker } from "./internal-definition.js";
import { probeAgentPermission, cleanupIdentityProbes } from "./identity-support.js";
import { integratorDefinition, inspectResult, observeInternal } from "./integrator-support.js";
interface EnableObservation extends InternalObservation { skill: CompanySkillDetail; assignment: AgentSkillSnapshot; effectivePolicy: unknown }
const root = (ctx: ChatCatalogContext) => `/api/companies/${ctx.input.fixtures.company.id}`;
async function observeEnable(ctx: ChatCatalogContext, state: Record<string, unknown>): Promise<EnableObservation> {
  const base = await observeInternal(ctx, state);
  return { ...base, skill: await ctx.input.api.get<CompanySkillDetail>(`${root(ctx)}/skills/${(state.skill as CompanySkillDetail).id}`),
    assignment: await ctx.input.api.get<AgentSkillSnapshot>(`/api/agents/${(state.worker as Entity).id}/skills`), effectivePolicy: await ctx.input.api.get(`${root(ctx)}/skill-policy`) };
}
function enableObservation(value: unknown): EnableObservation | undefined { const o = value as EnableObservation; return observation(value) && !!o.skill && Array.isArray(o.assignment?.desiredSkills) && !!o.effectivePolicy ? o : undefined; }
export function gradeIntegratorSkillEnable(value: unknown) {
  const c = checks(); const o = enableObservation(value); c.add("real-assignment-policy-and-future-admission", !!o, "Requires actual permitted assignment, unchanged installed revision/policy and a real subsequent native admission."); if (!o) return c.result();
  const original = o.state.skill as CompanySkillDetail; const worker = o.state.worker as Entity;
  c.add("actual-configuration-grant-prerequisite", o.state.agentConfigurationStatus === 200, "The actual CEO bearer successfully exercised a no-op public skill configuration probe; title/legacy hire authority is not a configuration grant.");
  c.add("saved-intended-morgan-assignment", o.assignment.supported && o.assignment.desiredSkills.includes(original.key)
    && o.assignment.desiredSkillEntries?.some(entry => entry.key === original.key && [null, original.currentVersionId].includes(entry.versionId)) === true
    && o.activity.some(event => event.action === "agent.skills_synced" && event.agentId === o.leadId && event.entityId === worker.id
      && Array.isArray(o.state.beforeActivityIds) && !o.state.beforeActivityIds.includes(event.id)
      && o.runs.some(run => run.id === (event as Entity & { runId?: string }).runId && run.agentId === o.leadId)),
  "The requested existing skill is durably assigned to the actual Morgan through the normal agent skill configuration path.");
  c.add("installation-and-policy-not-self-elevated", o.skill.id === original.id && o.skill.markdown === original.markdown && o.skill.currentVersionId === original.currentVersionId
    && JSON.stringify(o.effectivePolicy) === JSON.stringify(o.state.effectivePolicy)
    && !o.activity.some(event => event.agentId === o.leadId && /skill_policy\.|company\.skill_(?:created|file_updated|forked)/.test(event.action ?? "")),
  "Assignment preserves the already installed revision and effective policy rather than installing again or rewriting policy to gain authority.");
  const future = o.runs.find(run => run.agentId === worker.id && run.contextSnapshot?.issueId === (o.state.futureTask as Entity | undefined)?.id);
  c.add("future-execution-receives-intended-version", future?.runtimeMode === "native" && future.status === "succeeded"
    && (future.contextSnapshot?.skillVersions as Record<string, unknown> | undefined)?.[original.key] === original.currentVersionId,
  "A separately admitted actual Morgan task receives the selected immutable skill revision in its saved native skill selection snapshot.");
  c.add("truthful-assignment-not-global-policy", /Morgan/i.test(o.reply) && /\b(?:enabled|assigned|configured|added)\b/i.test(o.reply)
    && /\b(?:already installed|installed|company library|existing skill)\b/i.test(o.reply) && /\b(?:policy|permissions?|usage)\b/i.test(o.reply)
    && !/\b(?:not assigned|not enabled|not installed|all agents|every agent|changed (?:the )?policy|overrode (?:the )?policy)\b/i.test(o.reply),
  "Chat distinguishes the saved Morgan assignment from the preexisting installation and the separate usage-policy boundary.");
  return c.result();
}
export const integratorSkillEnableCases = [integratorDefinition("skills", "skills.enable-for-agent", async ctx => {
  try {
    const p = await project(ctx, "Launch"); const worker = await fixtureWorker(ctx);
    const created = await ctx.input.api.post<CompanySkillDetail>(`${root(ctx)}/skills`, { name: "Accessibility review", slug: "accessibility-review", markdown: "---\nname: accessibility-review\ndescription: Check synthetic HTML form labels.\n---\n\nFor supplied synthetic HTML, identify every form input without a visible label. Save concrete evidence in the task comment and finish the task. Do not browse other pages or claim global qualification." });
    const agentConfigurationStatus = await probeAgentPermission(ctx, `/api/agents/${worker.id}/skills/sync`, "POST", { mode: "add", desiredSkills: [] });
    let grantStatus: number | null = null;
    if (agentConfigurationStatus !== 200) {
      const access = await ctx.input.api.get<{ access?: { membership?: { id: string; principalType: string; principalId: string }; grants?: Array<{ permissionKey: string }> } }>(`/api/agents/${ctx.input.fixtures.agent.id}`);
      const member = access.access?.membership;
      if (member?.principalType === "agent" && member.principalId === ctx.input.fixtures.agent.id) {
        const response = await ctx.input.page.context().request.patch(`${root(ctx)}/members/${member.id}/permissions`, { data: { grants: [...access.access?.grants?.filter(grant => grant.permissionKey !== "agents:configure") ?? [], { permissionKey: "agents:configure" }] }, headers: { Origin: ctx.input.api.baseURL } }); grantStatus = response.status();
      }
    }
    const effectiveStatus = agentConfigurationStatus === 200 ? 200 : await probeAgentPermission(ctx, `/api/agents/${worker.id}/skills/sync`, "POST", { mode: "add", desiredSkills: [] });
    await ctx.input.evidence("chat-skill-configuration-prerequisite.json", { agentConfigurationStatus: effectiveStatus, publicGrantStatus: grantStatus, principalId: ctx.input.fixtures.agent.id,
      querySent: false, usagePolicyActionExists: (SKILL_POLICY_ACTIONS as readonly string[]).includes("skills.use"), unsupportedPrerequisite: effectiveStatus !== 200 });
    if (effectiveStatus !== 200) throw new Error(`Setup blocker: actual agent_config:update remained denied (HTTP ${effectiveStatus}); public agent membership grant attempt HTTP ${grantStatus ?? "unavailable"}. This is not an expected-refusal pass.`);
    return { project: p, worker: { id: worker.id }, skill: await ctx.input.api.get<CompanySkillDetail>(`${root(ctx)}/skills/${created.id}`), effectivePolicy: await ctx.input.api.get(`${root(ctx)}/skill-policy`), agentConfigurationStatus: effectiveStatus,
      beforeActivityIds: (await ctx.input.api.get<Entity[]>(`${root(ctx)}/activity?limit=1000`)).map(event => event.id) };
  } catch (error) { await cleanupIdentityProbes(ctx); throw error; }
}, observeEnable, gradeIntegratorSkillEnable, async (ctx, state) => {
  const skill = state.skill as CompanySkillDetail; await inspectResult(ctx, `/${ctx.input.fixtures.company.issuePrefix}/skills/studio/${skill.id}`, skill.name);
}, { sourceFiles: ["chat-catalog-domains/integrator-skill-enable.ts", "chat-catalog-domains/identity-support.ts", "chat-catalog-domains/internal-definition.ts", "chat-catalog-domains/internal-support.ts", "chat-catalog-domains/integrator-support.ts", "chat-scenarios/skills.yaml"],
  expectedRunCount: 2, attemptTimeoutMs: 540_000,
  coverageGaps: ["The supported membership permission route currently rejects agent principals, so agents:configure cannot be assumed from CEO/legacy hire authority. The actual no-op agent-bearer configuration probe must succeed before this scenario can run.", "The public skill-policy action contract has no skills.use/assignment restriction action; the required effective-use-denial branch remains unsupported until a real applicable policy surface is established. No install/edit restriction is relabeled as use denial."],
  async act(ctx, state) {
    const first = await pollUntil({ label: "actual Morgan assignment before future admission", deadlineAt: Date.now() + 180_000, intervalMs: 1000,
      load: () => observeEnable(ctx, state), accept: o => o.runs.length === 1 && o.runs[0]?.status === "succeeded" && ctx.issue()?.conversationState === "waiting" });
    const skill = state.skill as CompanySkillDetail;
    if (!first.assignment.desiredSkills.includes(skill.key)) throw new Error("Canonical request did not save the intended assignment; no fixture assignment will repair it");
    state.assignmentCheckpoint = { ...first, state: structuredClone(state) };
    state.futureTask = await task(ctx, "Verify assigned accessibility skill on synthetic HTML", (state.project as Entity).id, { status: "todo", assigneeAgentId: (state.worker as Entity).id,
      description: 'Use the assigned accessibility-review skill on this synthetic input only: <form><input id="sample-email" type="email"><button>Join</button></form>. Save the actual form-label finding in a comment and complete this task. Do not change assignments, policy or other work.' });
  }, async cleanup(ctx) { await cleanupIdentityProbes(ctx); },
})];
