import { createHash, randomUUID } from "node:crypto";

export const OPENCODE_MCP_TIMING_ENV = "PAPERCLIP_OPENCODE_MCP_TIMING";
export const OPENCODE_MCP_TIMING_LIMIT = 256;
const phases = new Set(["http_received", "bridge_enqueue", "bridge_result", "http_write", "http_finish", "http_close", "driver_dispatch", "driver_result", "controller_request", "controller_response", "provider_part"]);
const methods = new Set(["initialize", "ping", "tools/list", "tools/call", "notifications/initialized", "notifications/cancelled", "item/tool/call"]);
const statuses = new Set(["success", "error", "closed"]);
export type OpenCodeMcpTiming = (phase: string, fields?: Record<string, unknown>) => void;
const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

export function createOpenCodeMcpTiming(environment: NodeJS.ProcessEnv | undefined, sink: (line: string) => void): OpenCodeMcpTiming {
  if (environment?.[OPENCODE_MCP_TIMING_ENV] !== "1") return () => {};
  const observerId = randomUUID();
  const startedAt = performance.now();
  let count = 0;
  return (phase, fields = {}) => {
    if (!phases.has(phase) || count >= OPENCODE_MCP_TIMING_LIMIT) return;
    count += 1;
    try {
      const rawId = fields.rpcId;
      const rpcId = integer(rawId) ?? (typeof rawId === "string" && /^\d{1,12}$/.test(rawId) ? Number(rawId) : undefined);
      const rawResponseId = fields.responseRpcId;
      const responseRpcId = integer(rawResponseId) ?? (typeof rawResponseId === "string" && /^\d{1,12}$/.test(rawResponseId) ? Number(rawResponseId) : undefined);
      const controllerRequestId = typeof fields.controllerRequestId === "string" && /^opencode-\d{1,12}$/.test(fields.controllerRequestId) ? fields.controllerRequestId : undefined;
      const executionIdHash = typeof fields.executionId === "string" && /^prt_[A-Za-z0-9]{1,100}$/.test(fields.executionId)
        ? createHash("sha256").update(fields.executionId).digest("hex").slice(0, 24) : undefined;
      sink(JSON.stringify({ code: "opencode_mcp_timing", observerId, sequence: count, phase,
        atMs: Date.now(), elapsedMs: Math.max(0, performance.now() - startedAt),
        rpcId, responseRpcId, controllerRequestId, executionIdHash,
        responseKind: fields.responseKind === "result" || fields.responseKind === "error" ? fields.responseKind : undefined,
        method: typeof fields.method === "string" && methods.has(fields.method) ? fields.method : undefined,
        status: typeof fields.status === "string" && statuses.has(fields.status) ? fields.status : undefined,
        receivedAtMs: integer(fields.receivedAtMs), bodyReadMs: typeof fields.bodyReadMs === "number" && Number.isFinite(fields.bodyReadMs) && fields.bodyReadMs >= 0 ? fields.bodyReadMs : undefined,
        responseBytes: integer(fields.responseBytes), providerStartMs: integer(fields.providerStartMs), providerEndMs: integer(fields.providerEndMs),
      }));
    } catch {}
  };
}
