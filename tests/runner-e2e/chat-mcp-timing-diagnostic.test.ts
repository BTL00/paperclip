import { expect, it } from "vitest";
import { applyChatMcpTimingDiagnostic, CHAT_MCP_TIMING_DIAGNOSTIC_EXECUTION, CHAT_MCP_TIMING_DIAGNOSTIC_ENV } from "./chat-mcp-timing-diagnostic.js";
const agent = () => ({ adapterType: "paperclip_runner", adapterConfig: {
  provider: "opencode", model: "openrouter/deepseek/deepseek-v4.1-flash-1017", timeoutSec: 0,
  env: { EXISTING: "preserved" },
} });
it("configures only the real selected lead through its explicit saved environment", () => {
  const value = agent();
  expect(applyChatMcpTimingDiagnostic(CHAT_MCP_TIMING_DIAGNOSTIC_EXECUTION, value)).toBe(true);
  expect(value.adapterConfig).toEqual({ provider: "opencode", model: "openrouter/deepseek/deepseek-v4.1-flash-1017", timeoutSec: 0,
    env: { EXISTING: "preserved", [CHAT_MCP_TIMING_DIAGNOSTIC_ENV]: "1" } });
});
it.each(["chat-features.runner-opencode.local.documents-artifacts.write-plan", "chat-features.runner-opencode.daytona.documents-artifacts.find-artifact", "chat-setup-health.runner-opencode.local.setup-only"])("leaves other executions unchanged: %s", id => {
  const value = agent(); const original = structuredClone(value);
  expect(applyChatMcpTimingDiagnostic(id, value)).toBe(false); expect(value).toEqual(original);
});
it.each(["provider", "model"])("rejects a mismatched selected %s", field => {
  const value = agent(); Object.assign(value.adapterConfig, { [field]: "wrong" });
  expect(() => applyChatMcpTimingDiagnostic(CHAT_MCP_TIMING_DIAGNOSTIC_EXECUTION, value)).toThrow("exact native provider and model");
});
