/** Explicit one-cell diagnostic source; not part of the measured production baseline. */
export const CHAT_MCP_TIMING_DIAGNOSTIC_EXECUTION = "chat-features.runner-opencode.local.documents-artifacts.find-artifact";
export const CHAT_MCP_TIMING_DIAGNOSTIC_ENV = "PAPERCLIP_OPENCODE_MCP_TIMING";

export function applyChatMcpTimingDiagnostic(executionId: string, agent: Record<string, unknown>): boolean {
  if (executionId !== CHAT_MCP_TIMING_DIAGNOSTIC_EXECUTION) return false;
  const config = agent.adapterConfig as Record<string, unknown> | undefined;
  if (agent.adapterType !== "paperclip_runner" || config?.provider !== "opencode"
    || config.model !== "openrouter/deepseek/deepseek-v4.1-flash-1017") {
    throw new Error("MCP timing diagnostic requires its exact native provider and model");
  }
  agent.adapterConfig = { ...config, env: {
    ...(config.env as Record<string, unknown> | undefined), [CHAT_MCP_TIMING_DIAGNOSTIC_ENV]: "1",
  } };
  return true;
}
