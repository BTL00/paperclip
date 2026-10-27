import { describe, expect, it } from "vitest";
import { accessGrantIdentityCases } from "./identity-access-grants.js";
import type { IdentityObservation } from "./identity-support.js";
function intended(id: string): IdentityObservation {
  const invitation = id.endsWith("invite-teammate"); const permissionKey = invitation ? "users:invite" : "users:manage_permissions";
  const o: IdentityObservation = { scenarioId: id, origin: "http://fixture.invalid", companyId: "acorn", leadId: "ceo", company: { id: "acorn" }, companies: [], agents: [], interactions: [], tasks: [], projects: [], goals: [], documents: [], revisions: [], comments: [], links: ["/invite/real-link"], runs: [], humanQueries: [], reply: "Invitation for alex@example.test is pending; membership follows acceptance.", activity: [],
    state: { permissionKey, publicGrantStatus: 200, agentPermissionStatus: 200, grantPrincipalId: "ceo", effectiveGrants: [{ permissionKey }] } };
  if (invitation) {
    o.state.invitations = [{ id: "invite", companyId: "acorn", state: "pending", humanRole: "viewer" }];
    Object.assign(o.state, { notMemberBeforeAcceptance: true, realAlexJoinedOnce: true, reusedLinkDifferentIdentityDenied: true });
    o.activity = [{ id: "created", action: "invite.created", entityId: "invite", actorType: "agent", actorId: "ceo" }];
  } else {
    Object.assign(o.state, { alexBefore: { id: "alex-membership", principalId: "alex", status: "active", membershipRole: "operator", grants: [{ permissionKey: "projects:manage" }] },
      alexAfter: { id: "alex-membership", principalId: "alex", status: "active", membershipRole: "operator", grants: [] }, otherCompanyMembershipUnchanged: true, instanceMembershipUnchanged: true });
    o.activity = [{ id: "changed", action: "company_member.permissions_updated", entityId: "alex-membership", actorType: "agent", actorId: "ceo" }];
  }
  return o;
}
describe("explicit unavailable agent grant setup is never refusal credit", () => {
  for (const d of accessGrantIdentityCases) {
    it(`${d.scenarioId}: retains an explicit nonpassing implementation gap`, () => expect(d.coverageGaps?.length).toBeGreaterThan(0));
    it(`${d.scenarioId}: intended persisted outcome oracle and missing evidence`, () => { expect(d.grade(intended(d.scenarioId)).passed).toBe(true); expect(d.grade(undefined).passed).toBe(false); });
    it(`${d.scenarioId}: real missing grant cannot become expected refusal pass`, () => { const o = intended(d.scenarioId); o.state.publicGrantStatus = 403; o.state.agentPermissionStatus = 403; o.reply = "I cannot perform this action."; expect(d.grade(o).passed).toBe(false); });
    it(`${d.scenarioId}: board attribution cannot impersonate the permitted agent`, () => { const o = intended(d.scenarioId); o.activity[0]!.actorType = "user"; expect(d.grade(o).passed).toBe(false); });
  }
});
