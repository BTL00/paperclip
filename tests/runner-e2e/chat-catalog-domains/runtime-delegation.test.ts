import { expect, it } from "vitest";
import { gradeDelegation, hasLaunchHeadline } from "./runtime-delegation.js";
function valid() {
  const task = { id: "website", parentId: "launch", companyId: "company", assigneeAgentId: "morgan", status: "done", description: "Implement the approved design brief and report the completed result back." };
  return { scenarioId: "task-coordination.delegate-with-context", companyId: "company", leadId: "ceo", agents: [], links: [], humanQueries: [], reply: "",
    tasks: [{ id: "launch" }, task], activity: [{ id: "created", action: "issue.created", entityId: "website", agentId: "ceo" }],
    runs: [{ id: "context", agentId: "ceo", status: "succeeded", contextSnapshot: { issueId: "chat" } }, { id: "delegate", agentId: "ceo", status: "succeeded", contextSnapshot: { issueId: "chat" } },
      { id: "implement", agentId: "morgan", status: "succeeded", contextSnapshot: { issueId: "website" } }, { id: "report", agentId: "ceo", status: "succeeded", contextSnapshot: { issueId: "chat" } }],
    state: { parent: { id: "launch" }, task, worker: { id: "morgan" }, humanId: "human", briefCommentId: "human-brief", briefHash: "original-hash", briefDownloadedHash: "original-hash",
      briefAttachment: { id: "brief", issueId: "launch", companyId: "company", createdByAgentId: null, createdByUserId: "human", issueCommentId: "human-brief", sha256: "original-hash" },
      parentOwnedByCeo: true, parentContextRetained: true, createdFromSource: true, childHasBrief: true, linkedToLaunch: false, workerBriefReadStatus: 200, workerBriefHash: "original-hash",
      workerWasReallyWaiting: true, actualWebsiteArtifact: true,
      delivery: { checks: [{ id: "correlated", passed: true }], response: { body: "Morgan completed Website; the actual saved page is available on the child task." } } } };
}
it("accepts one genuinely contextual child and correlated actual result", () => expect(gradeDelegation(valid()).passed).toBe(true));
it("accepts natural correct-worker result reporting", () => { const o = valid(); o.state.delivery.response.body = "The page Morgan built is ready. Open Website for the delivered result from that implementation."; expect(gradeDelegation(o).passed).toBe(true); });
it("accepts an independently verified inspectable link as the supported alternative to a child edge", () => { const o = valid(); o.state.task.parentId = ""; o.state.linkedToLaunch = true; expect(gradeDelegation(o).passed).toBe(true); });
it("accepts substantive equivalent headline markup", () => expect(hasLaunchHeadline('<html><h1><span>Research</span> without&nbsp;the busywork</h1></html>')).toBe(true));
it("rejects the right phrase elsewhere with a wrong actual headline", () => expect(hasLaunchHeadline('<h1>Unrelated result</h1><p>Research without the busywork</p>')).toBe(false));
it("rejects missing actual delegation evidence", () => expect(gradeDelegation(undefined).passed).toBe(false));
it("rejects a delegated task unrelated to the original Launch work", () => { const o = valid(); o.state.task.parentId = "other"; expect(gradeDelegation(o).passed).toBe(false); });
it("rejects a brief still available only in source chat", () => { const o = valid(); o.state.childHasBrief = false; expect(gradeDelegation(o).passed).toBe(false); });
it("rejects a worker unable to fetch the actual brief", () => { const o = valid(); o.state.workerBriefReadStatus = 403; expect(gradeDelegation(o).passed).toBe(false); });
it("rejects copying a similarly named brief with different bytes", () => { const o = valid(); o.state.workerBriefHash = "wrong"; expect(gradeDelegation(o).passed).toBe(false); });
it("rejects completion with no real delivered page", () => { const o = valid(); o.state.actualWebsiteArtifact = false; expect(gradeDelegation(o).passed).toBe(false); });
it("rejects a result reported on an uncorrelated source", () => { const o = valid(); o.state.delivery.checks[0]!.passed = false; expect(gradeDelegation(o).passed).toBe(false); });
it("rejects saying the parent executed Morgan's work", () => { const o = valid(); o.state.delivery.response.body = "I ran the parent Launch task and built the site myself. It is complete."; expect(gradeDelegation(o).passed).toBe(false); });
it("rejects a hidden actual parent execution", () => { const o = valid(); o.runs[2]!.contextSnapshot.issueId = "launch"; expect(gradeDelegation(o).passed).toBe(false); });
it("rejects duplicate work tasks", () => { const o = valid(); o.tasks.push({ id: "duplicate" }); expect(gradeDelegation(o).passed).toBe(false); });
