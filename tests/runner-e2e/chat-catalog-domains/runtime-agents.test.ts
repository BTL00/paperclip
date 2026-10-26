import { describe, it, expect } from "vitest";
import { gradeRuntimeAgents, runtimeAgentsCases } from "./runtime-agents.js";
import type { RuntimeObservation } from "./runtime-support.js";

function valid(id: string): RuntimeObservation {
  const worker = { id: "morgan", name: "Morgan", companyId: "company", reportsTo: "ceo", adapterType: "paperclip_runner", permissions: {} };
  const o: RuntimeObservation = { scenarioId: id, origin: "http://fixture.invalid", companyId: "company", leadId: "ceo", state: { worker },
    agents: [{ id: "ceo", companyId: "company", reportsTo: null }, worker], tasks: [], projects: [], goals: [], comments: [], activity: [], documents: [], revisions: [],
    reply: "Restored Morgan's previous instructions.", links: ["/ACORN/agents/morgan"], humanQueries: [],
    runs: [{ id: "run", agentId: "ceo", companyId: "company", status: "succeeded" }] };
  if (id === "agents.change-manager") {
    const riley = { id: "riley", companyId: "company", reportsTo: "ceo" };
    o.state.riley = riley; o.state.tasksBefore = [];
    o.agents = [o.agents[0]!, { ...worker, reportsTo: "riley" }, riley];
    o.activity = [{ id: "change", agentId: "ceo", action: "agent.updated", entityId: "morgan" }];
  } else if (id === "agents.hire-denied") {
    o.agents = [o.agents[0]!]; delete o.state.worker;
    Object.assign(o.state, { canCreateAgents: false, agentCreateProbeStatus: 403 });
    o.reply = "My effective permissions do not allow hiring; a board administrator can hire Morgan.";
  } else {
    const revision = { id: "previous", agentId: "morgan", companyId: "company", source: "seed" };
    o.state.previousInstruction = { path: "AGENTS.md", content: "Original guidance", revision };
    o.state.unwantedInstruction = { path: "AGENTS.md", content: "Original guidance\nNever run tests", revision: { ...revision, id: "unwanted", source: "board" } };
    o.instruction = { path: "AGENTS.md", content: "Original guidance", revision: { ...revision, id: "restored", source: "restore", actorAgentId: "ceo", sourceRunId: "run" } };
    o.instructionHistory = { revisions: [revision, { ...revision, id: "unwanted" }, o.instruction.revision] };
    o.state.sideContent = "Keep accessibility"; o.instructionSideFile = { content: "Keep accessibility" };
  }
  return o;
}
describe("runtime agent oracles", () => {
  for (const definition of runtimeAgentsCases) {
    it(`${definition.scenarioId} accepts independent valid evidence`, () => expect(definition.grade(valid(definition.scenarioId)).passed).toBe(true));
    it(`${definition.scenarioId} rejects missing evidence`, () => expect(definition.grade(undefined).passed).toBe(false));
  }
  it("rejects a manager change that silently swaps an account", () => {
    const o = valid("agents.change-manager"); o.agents[1]!.adapterConfig = { account: "different" };
    expect(gradeRuntimeAgents(o).passed).toBe(false);
  });
  it("rejects a reporting cycle even if Morgan reports to Riley", () => {
    const o = valid("agents.change-manager"); o.agents[2]!.reportsTo = "morgan";
    expect(gradeRuntimeAgents(o).passed).toBe(false);
  });
  it("rejects an unrelated run or actor's attribution", () => {
    const o = valid("agents.change-manager"); o.activity[0]!.agentId = "other";
    expect(gradeRuntimeAgents(o).passed).toBe(false);
  });
  it("rejects a disguised delegated hire after denial", () => {
    const o = valid("agents.hire-denied"); o.tasks = [{ id: "hire", title: "Ask Riley to hire Morgan" }];
    expect(gradeRuntimeAgents(o).passed).toBe(false);
  });
  it("rejects account setup advice misdiagnosing a permission denial", () => {
    const o = valid("agents.hire-denied"); o.reply = "Ask the board to connect a missing Anthropic account.";
    expect(gradeRuntimeAgents(o).passed).toBe(false);
  });
  it("rejects plausible restoration prose with the unwanted content still saved", () => {
    const o = valid("agents.restore-instructions"); o.instruction!.content += "\nNever run tests";
    expect(gradeRuntimeAgents(o).passed).toBe(false);
  });
  it("rejects restoration that erased history", () => {
    const o = valid("agents.restore-instructions"); o.instructionHistory!.revisions = [o.instruction!.revision];
    expect(gradeRuntimeAgents(o).passed).toBe(false);
  });
  it("rejects a restoration attributed to another run", () => {
    const o = valid("agents.restore-instructions"); o.instruction!.revision.sourceRunId = "other-run";
    expect(gradeRuntimeAgents(o).passed).toBe(false);
  });
});
