import { createServer } from "node:http";
import { expect, it } from "vitest";
import { listenOnFetchAllowedPort } from "../../e2e/fetch-allowed-port.js";
import { startArchiveFaultProxy } from "./internal-archive-transport.js";
it("forwards actual request bytes/responses, drops third before upstream admission and releases only for retry", async () => {
  const admitted: Array<{ path: string; body: string; actor?: string }> = [];
  // Credential-free transport unit backend; this is not a Product E2E run or fake eval outcome.
  const backend = createServer(async (req, res) => { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk); admitted.push({ path: req.url!, body: Buffer.concat(chunks).toString(), actor: req.headers.authorization }); res.writeHead(200, { "content-type": "application/json", "x-original-response": "preserved" }); res.end(JSON.stringify({ realBackendReceipt: admitted.length })); });
  const port = await listenOnFetchAllowedPort(backend); const proxy = await startArchiveFaultProxy(`http://127.0.0.1:${port}`);
  try {
    proxy.arm({ companyId: "company", agentId: "ceo", personId: "person", taskIds: ["one", "two", "three"] });
    expect(() => proxy.releaseForExplicitRetry()).toThrow();
    const send = (id: string) => fetch(`${proxy.origin}/api/issues/${id}/inbox-archive`, { method: "POST", headers: { authorization: "Bearer unit-only", "content-type": "application/json", "x-paperclip-run-id": "source" }, body: '{ "userId": "person" }', signal: AbortSignal.timeout(5000) });
    const first = await send("one"); expect(first.headers.get("x-original-response")).toBe("preserved"); expect(await first.json()).toEqual({ realBackendReceipt: 1 });
    expect(await (await send("two")).json()).toEqual({ realBackendReceipt: 2 });
    await expect(send("three")).rejects.toThrow(); await expect(send("three")).rejects.toThrow();
    expect(admitted).toHaveLength(2); expect(admitted[0]).toEqual({ path: "/api/issues/one/inbox-archive", body: '{ "userId": "person" }', actor: "Bearer unit-only" });
    expect(proxy.receipts().map(row => [row.taskId, row.forwarded, row.phase])).toEqual([["one", true, "initial"], ["two", true, "initial"], ["three", false, "initial"], ["three", false, "initial"]]);
    proxy.releaseForExplicitRetry(); expect(await (await send("three")).json()).toEqual({ realBackendReceipt: 3 });
    expect(proxy.receipts().at(-1)).toMatchObject({ taskId: "three", phase: "retry", forwarded: true, status: 200, explicitUserId: "person", runId: "source" });
    const ordinary = await fetch(`${proxy.origin}/api/health`); expect(ordinary.status).toBe(200); await ordinary.arrayBuffer(); expect(admitted.at(-1)?.path).toBe("/api/health");
  } finally { await proxy.close(); backend.closeAllConnections(); await new Promise<void>(resolve => backend.close(() => resolve())); }
});
