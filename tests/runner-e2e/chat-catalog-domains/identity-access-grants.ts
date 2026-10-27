import { expect } from "@playwright/test";
import type { ChatCatalogCase, ChatCatalogContext } from "../chat-catalog-contract.js";
import { createAuthenticatedPerson, enrollAuthenticatedPerson } from "./identity-auth.js";
import { checks, entity } from "./internal-support.js";
import { identityDefinition, identityObservation, observeIdentity, readAgentResource } from "./identity-support.js";

interface Grant { permissionKey: string; scope?: unknown }
interface AgentAccess { access?: { membership?: { id: string; principalType: string; principalId: string } | null; grants?: Grant[] } }
interface Member { id: string; principalId: string; status: string; membershipRole: string; grants: Grant[] }
type Person = Awaited<ReturnType<typeof createAuthenticatedPerson>>;
const people = new WeakMap<ChatCatalogContext, Person>();
export function gradeAccessGrant(value: unknown) {
  const c = checks(); const o = identityObservation(value); c.add("complete-explicit-grant-evidence", !!o, "Actual named agent grants, real authenticated people and persisted mutation/attribution are required."); if (!o) return c.result();
  c.add("assumed-agent-authority-established", o.state.publicGrantStatus === 200 && o.state.agentPermissionStatus === 200 && o.state.grantPrincipalId === o.leadId
    && Array.isArray(o.state.effectiveGrants) && (o.state.effectiveGrants as Grant[]).some(grant => grant.permissionKey === o.state.permissionKey),
    "The exact company grant must exist on the actual agent principal before the canonical query; a CEO title or failed setup probe is insufficient.");
  if (o.scenarioId === "access.invite-teammate") {
    const invitations = o.state.invitations as Array<{ id: string; companyId: string; state: string; humanRole: string }> | undefined;
    c.add("actual-scoped-pending-invitation", invitations?.length === 1 && invitations[0]?.companyId === o.companyId && invitations[0].state === "pending"
      && typeof invitations[0].humanRole === "string" && o.reply.includes("alex@example.test") && o.links.some(link => /\/invite\/[^/]+$/.test(new URL(link, o.origin).pathname))
      && o.activity.some(row => row.action === "invite.created" && row.entityId === invitations[0]?.id && row.actorType === "agent" && row.actorId === o.leadId),
      "A real agent-attributed scoped invitation and actual join link exist without falsely reporting membership.");
    c.add("invitation-human-boundary-verified", o.state.notMemberBeforeAcceptance === true && o.state.realAlexJoinedOnce === true && o.state.reusedLinkDifferentIdentityDenied === true,
      "The real named prospective human joins only by supported acceptance, and a used link cannot admit another identity.");
  } else if (o.scenarioId === "access.manage-membership") {
    const before = o.state.alexBefore as Member | undefined; const after = o.state.alexAfter as Member | undefined;
    c.add("exact-company-permission-removed", !!before && !!after && before.id === after.id && before.principalId === after.principalId
      && before.grants.some(grant => grant.permissionKey === "projects:manage") && !after.grants.some(grant => grant.permissionKey === "projects:manage")
      && before.status === after.status && before.membershipRole === after.membershipRole && o.state.otherCompanyMembershipUnchanged === true && o.state.instanceMembershipUnchanged === true,
      "Only Alex's actual company project-management grant changes; membership and other company/instance authority remain intact.");
    c.add("actual-agent-decision-attribution", o.activity.some(row => row.action === "company_member.permissions_updated" && row.entityId === before?.id
      && row.actorType === "agent" && row.actorId === o.leadId), "The saved permission change belongs to the actual permitted agent, not an impersonated board user.");
  } else c.add("known-grant-case", false, "No permission oracle exists for this case.");
  return c.result();
}
const sources = ["chat-catalog-domains/identity-access-grants.ts", "chat-catalog-domains/identity-auth.ts", "chat-catalog-domains/identity-support.ts", "chat-catalog-domains/internal-support.ts", "chat-scenarios/access.yaml",
  "../../maps/agent-access-map/access.md", "../../server/src/routes/access.ts", "../../server/src/routes/agents.ts", "../../packages/shared/src/validators/agent.ts"];
export const accessGrantIdentityCases: readonly ChatCatalogCase[] = ["access.invite-teammate", "access.manage-membership"].map(scenarioId => identityDefinition(scenarioId, async ctx => {
  const permissionKey = scenarioId.endsWith("invite-teammate") ? "users:invite" : "users:manage_permissions";
  const root = `/api/companies/${ctx.input.fixtures.company.id}`;
  const browser = ctx.input.page.context().browser(); if (!browser || !ctx.input.privateSecrets) throw new Error("Real authenticated access fixtures are required");
  const alex = await createAuthenticatedPerson({ api: ctx.input.api, browser, secrets: ctx.input.privateSecrets, name: "Alex", email: "alex@example.test" }); people.set(ctx, alex);
  try {
    if (scenarioId.endsWith("manage-membership")) await enrollAuthenticatedPerson(ctx.input.api, ctx.input.fixtures.company.id, alex, ctx.input.privateSecrets, "operator");
    const detail = await ctx.input.api.get<AgentAccess>(`/api/agents/${ctx.input.fixtures.agent.id}`);
    const membership = detail.access?.membership;
    if (!membership || membership.principalType !== "agent" || membership.principalId !== ctx.input.fixtures.agent.id) throw new Error("Setup blocker: public agent detail exposes no real company agent membership");
    const grants = detail.access?.grants ?? [];
    // This is the typed, documented public permission route with the real
    // publicly discoverable membership ID. No arbitrary agent config field,
    // private route, role inference or direct grant-table write substitutes.
    const attempt = await ctx.input.page.context().request.patch(`${ctx.input.api.baseURL}${root}/members/${membership.id}/permissions`, {
      data: { grants: [...grants.filter(grant => grant.permissionKey !== permissionKey), { permissionKey }] }, headers: { Origin: ctx.input.api.baseURL } });
    const after = await ctx.input.api.get<AgentAccess>(`/api/agents/${ctx.input.fixtures.agent.id}`);
    const probe = await readAgentResource(ctx, `${root}/${scenarioId.endsWith("invite-teammate") ? "invites" : "members"}`);
    const state = { permissionKey, publicGrantStatus: attempt.status(), grantPrincipalId: membership.principalId, effectiveGrants: after.access?.grants ?? [], agentPermissionStatus: probe.status };
    await ctx.input.evidence("identity-explicit-agent-grant-prerequisite.json", { ...state, originalQuery: ctx.scenario.query, originalQuerySent: false,
      setupBlocked: attempt.status() !== 200 || probe.status !== 200, unsupportedSurface: "Public member mutations reject non-human principals before writing; agent permissions schema only synchronizes tasks:assign." });
    if (attempt.status() !== 200 || probe.status !== 200) throw new Error(`Setup blocker: supported public grant path did not establish ${permissionKey} on the actual agent principal (grant HTTP ${attempt.status()}, agent read HTTP ${probe.status}); this is not an expected refusal pass`);
    return { ...state, alexId: alex.id };
  } catch (error) { await alex.dispose(); people.delete(ctx); throw error; }
}, gradeAccessGrant, {
  sourceFiles: sources, authentication: "human-session",
  coverageGaps: ["The current public grant-management route rejects agent membership principals. Required users:* agent authority cannot be established through the supported API; actual intended mutation and human acceptance/reuse callbacks remain unqualified until this setup capability is available."],
  async observe(ctx, state) {
    if (scenarioId.endsWith("invite-teammate")) state.invitations = (await ctx.input.api.get<{ invites: unknown[] }>(`/api/companies/${ctx.input.fixtures.company.id}/invites`)).invites;
    else state.alexAfter = (await ctx.input.api.get<{ members: Member[] }>(`/api/companies/${ctx.input.fixtures.company.id}/members`)).members.find(member => member.principalId === state.alexId);
    return observeIdentity(ctx, state);
  },
  async verifyResult(ctx, state) { if (state.agentPermissionStatus !== 200) throw new Error("Required real agent authority was not established"); await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible(); },
  async cleanup(ctx) { await people.get(ctx)?.dispose(); people.delete(ctx); },
}));
