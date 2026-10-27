import { describe, expect, it } from "vitest";
import { appTestExternalCases, appTestGuidance } from "./external-app-test.js";
function valid() { return { scenarioId: "app-permissions.test-as-agent", companyId: "company", leadId: "ceo", reply: "You can use the board Test control for Read launch page, choosing Morgan. This checks effective access and the provider response; it does not qualify the next runtime.", phaseReplies: [], connections: [], profiles: [], secrets: [], endpoints: [], interactions: [], activity: [], links: [], runs: [], humanQueries: [], state: { syntheticProvider: true, morganId: "morgan", agentTestStatus: 403, providerCallsBeforeBoard: 0, visibleTestAsMorgan: true, testRequestAgentId: "morgan", testRequestToolName: "launch_read", marker: "Synthetic page fact", testResult: { decision: "allowed", invocationId: "invocation", result: { content: [{ text: "Synthetic page fact" }] } }, providerReadCalls: 1, providerWriteCalls: 0, visibleResult: true, readEntryId: "read", writeEntryId: "write", effective: { agentId: "morgan", allowedTools: [{ id: "read" }] }, morganRuntimeRunCount: 0 } }; }
describe("actual board test-as-agent", () => {
  const definition = appTestExternalCases[0]!;
  it("accepts a visible actual Morgan read without claiming runtime admission", () => expect(definition.grade(valid()).passed).toBe(true));
  it("rejects wrong identity/action, missing provider execution, off-policy actions and false runtime equivalence", () => {
    for (const mutate of [
      (o: ReturnType<typeof valid>) => { o.state.agentTestStatus = 200; },
      (o: ReturnType<typeof valid>) => { o.state.testRequestAgentId = "ceo"; },
      (o: ReturnType<typeof valid>) => { o.state.testRequestToolName = "launch_update"; },
      (o: ReturnType<typeof valid>) => { o.state.providerReadCalls = 0; },
      (o: ReturnType<typeof valid>) => { o.state.testResult.result.content[0]!.text = "Another result"; },
      (o: ReturnType<typeof valid>) => { o.state.effective.allowedTools.push({ id: "write" }); },
      (o: ReturnType<typeof valid>) => { o.state.morganRuntimeRunCount = 1; },
      (o: ReturnType<typeof valid>) => { o.reply = "I've verified Morgan can read; the board test is done."; },
      (o: ReturnType<typeof valid>) => { o.reply = "Use the board control to test as CEO, and then Morgan can read."; },
    ]) { const o = valid(); mutate(o); expect(definition.grade(o).passed).toBe(false); }
  });
  it("gates human action against wrong-target guidance rather than rescuing it", () => {
    expect(appTestGuidance("Use the board test control as Morgan to read the sample page.")).toBe(true);
    expect(appTestGuidance("In the board test, Morgan is relevant, but test as CEO to read the sample page.")).toBe(false);
    expect(appTestGuidance("Use the board test for Morgan to run the write action instead of reading the sample page.")).toBe(false);
    expect(definition.grade(undefined).passed).toBe(false);
  });
});
