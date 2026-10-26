import { describe, expect, it } from "vitest";
import { gradeCliAuthorization } from "./identity-cli-authorization.js";
import type { IdentityObservation } from "./identity-support.js";
function valid(): IdentityObservation {
  return { scenarioId: "access.cli-authorization", origin: "http://fixture.test", companyId: "acorn", leadId: "ceo", company: { id: "acorn" }, companies: [], agents: [],
    interactions: [], tasks: [], projects: [], goals: [], comments: [], documents: [], revisions: [], activity: [], links: [], runs: [], humanQueries: [],
    reply: "Use paperclipai auth login and approve its request in your browser.", state: { humanId: "alex", agentApproveStatus: 401, reviewVisible: true, reviewCompanyVisible: true,
      requestedAccess: "board", requestedCompanyId: "acorn", approvedByUserId: "alex", cliUserId: "alex", cliSource: "board_key", cliHasCompany: true, cliExitCode: 0,
      logoutRevoked: true, localCredentialRemoved: true, revokedReadStatus: 401, agentBeforeId: "ceo", agentAfterId: "ceo", agentAfterStatus: 200 } };
}
describe("human CLI authorization oracle", () => {
  it("accepts complete real CLI/UI/independent revocation evidence", () => { expect(gradeCliAuthorization(valid()).passed).toBe(true); });
  it.each([{ cliSource: "agent" }, { approvedByUserId: "riley" }, { requestedCompanyId: "birch" }, { agentApproveStatus: 200 },
    { revokedReadStatus: 200 }, { localCredentialRemoved: false }, { agentAfterStatus: 401 }, { cliExitCode: 1 }])("rejects wrong identity, scope or revocation %j", change => {
    const observation = valid(); Object.assign(observation.state, change); expect(gradeCliAuthorization(observation).passed).toBe(false);
  });
  it("rejects missing evidence and prose-only success", () => { expect(gradeCliAuthorization(undefined).passed).toBe(false); expect(gradeCliAuthorization({ reply: "Connected as you." }).passed).toBe(false); });
});
