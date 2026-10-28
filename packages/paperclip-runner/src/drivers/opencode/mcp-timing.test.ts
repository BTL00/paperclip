import { expect, it, vi } from "vitest";
import { createOpenCodeMcpTiming, OPENCODE_MCP_TIMING_ENV, OPENCODE_MCP_TIMING_LIMIT } from "./mcp-timing.js";

it.each([undefined, "", "0", "true"])("is off unless the explicit value is 1: %s", value => {
  const sink = vi.fn(); const timing = createOpenCodeMcpTiming({ [OPENCODE_MCP_TIMING_ENV]: value }, sink);
  timing("http_received", { rpcId: 2 }); expect(sink).not.toHaveBeenCalled();
});
it("retains exact bounded correlations and numeric provider times without private fields", () => {
  const lines: string[] = []; const timing = createOpenCodeMcpTiming({ [OPENCODE_MCP_TIMING_ENV]: "1" }, line => lines.push(line));
  const secret = "synthetic-private-token@example.invalid";
  timing("controller_request", { rpcId: "2", controllerRequestId: "opencode-7", method: "item/tool/call", arguments: secret, headers: secret, url: secret });
  timing("provider_part", { executionId: "prt_generated123", providerStartMs: 1700000000000, providerEndMs: 1700000030000 });
  timing("http_write", { rpcId: 2, responseRpcId: 99, responseKind: "result", responseBytes: 123, status: "success" });
  timing("http_received", { rpcId: secret, controllerRequestId: secret, method: secret, status: secret });
  const rows = lines.map(line => JSON.parse(line));
  expect(rows[0]).toMatchObject({ rpcId: 2, controllerRequestId: "opencode-7", method: "item/tool/call", sequence: 1 });
  expect(rows[1]).toMatchObject({ providerStartMs: 1700000000000, providerEndMs: 1700000030000, executionIdHash: expect.stringMatching(/^[a-f0-9]{24}$/) });
  expect(rows[2]).toMatchObject({ rpcId: 2, responseRpcId: 99, responseKind: "result", responseBytes: 123 });
  expect(rows[3]).not.toHaveProperty("rpcId"); expect(rows[3]).not.toHaveProperty("method");
  expect(new Set(rows.map(row => row.observerId)).size).toBe(1);
  expect(lines.join("\n")).not.toContain(secret); expect(lines.join("\n")).not.toContain("prt_generated123");
  expect(rows.map(row => row.elapsedMs)).toEqual([...rows.map(row => row.elapsedMs)].sort((a, b) => a - b));
});
it("bounds volume and rejects arbitrary event labels and invalid numbers", () => {
  const sink = vi.fn(); const timing = createOpenCodeMcpTiming({ [OPENCODE_MCP_TIMING_ENV]: "1" }, sink);
  timing("private injected event", { rpcId: 1 }); expect(sink).not.toHaveBeenCalled();
  for (let i = 0; i < OPENCODE_MCP_TIMING_LIMIT + 10; i++) timing("http_write", { rpcId: -1, responseBytes: Infinity, providerEndMs: "private" });
  expect(sink).toHaveBeenCalledTimes(OPENCODE_MCP_TIMING_LIMIT);
  expect(JSON.parse(sink.mock.calls[0]![0])).not.toHaveProperty("responseBytes");
});
it("contains diagnostic sink failure", () => {
  const timing = createOpenCodeMcpTiming({ [OPENCODE_MCP_TIMING_ENV]: "1" }, () => { throw new Error("synthetic sink failed"); });
  expect(() => timing("http_received", { rpcId: 2 })).not.toThrow();
});
