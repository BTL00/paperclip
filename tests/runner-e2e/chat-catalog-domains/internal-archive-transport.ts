import { createServer, request as httpRequest } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { listenOnFetchAllowedPort } from "../../e2e/fetch-allowed-port.js";
export interface ArchiveTransportReceipt { requestId: string; sequence: number; taskId: string; phase: "initial" | "retry"; requestSha256: string; runId?: string; explicitUserId?: string; forwarded: boolean; status?: number; completedAt: string }
export interface ArchiveFaultTransport { origin: string; backendOrigin: string; arm(input: { companyId: string; agentId: string; personId: string; taskIds: string[] }): void; receipts(): ArchiveTransportReceipt[]; releaseForExplicitRetry(): void; close(): Promise<void> }
/** Started by the single-case launcher BEFORE server bootstrap; the actual server API origin must point here. */
export async function startArchiveFaultProxy(backendOrigin: string): Promise<ArchiveFaultTransport> {
  const upstream = new URL(backendOrigin); if (upstream.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(upstream.hostname) || upstream.pathname !== "/") throw new Error("Archive proxy requires the actual owned local HTTP backend origin");
  const receipts: ArchiveTransportReceipt[] = []; let binding: { companyId: string; agentId: string; personId: string; taskIds: string[] } | undefined; let released = false; let failedTaskId: string | undefined;
  let serial = Promise.resolve(); const successes = new Set<string>();
  const server = createServer(async (req, res) => {
    const match = req.method === "POST" ? /^\/api\/issues\/([^/?]+)\/inbox-archive(?:\?.*)?$/.exec(req.url ?? "") : null;
    const taskId = match?.[1];
    if (!taskId || !binding?.taskIds.includes(taskId)) {
      const outgoing = httpRequest(new URL(req.url ?? "/", upstream), { method: req.method, headers: { ...req.headers, host: upstream.host } }, incoming => { res.writeHead(incoming.statusCode!, incoming.headers); incoming.pipe(res); }); outgoing.on("error", () => req.socket.destroy()); req.pipe(outgoing); return;
    }
    const chunks: Buffer[] = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 65536) { req.socket.destroy(); return; } chunks.push(chunk); } const bytes = Buffer.concat(chunks);
    // Queue unchanged requests; do not split a batch or manufacture a response. A third distinct item is dropped only after two real successful responses.
    const prior = serial; let finish!: () => void; serial = new Promise<void>(resolve => { finish = resolve; }); await prior;
    try {
      let explicitUserId: string | undefined; try { const value = JSON.parse(bytes.toString()); if (typeof value.userId === "string") explicitUserId = value.userId; } catch { /* Forward validation errors unchanged. */ }
      const receipt: ArchiveTransportReceipt = { requestId: randomUUID(), sequence: receipts.length + 1, taskId, phase: released ? "retry" : "initial", requestSha256: createHash("sha256").update(bytes).digest("hex"), runId: typeof req.headers["x-paperclip-run-id"] === "string" ? req.headers["x-paperclip-run-id"] : undefined, explicitUserId, forwarded: false, completedAt: "" };
      if (!released && (failedTaskId === taskId || !successes.has(taskId) && successes.size === 2)) { failedTaskId = taskId; receipt.completedAt = new Date().toISOString(); receipts.push(receipt); req.socket.destroy(); return; }
      receipt.forwarded = true;
      await new Promise<void>(resolve => {
        const outgoing = httpRequest(new URL(req.url!, upstream), { method: req.method, headers: { ...req.headers, host: upstream.host } }, incoming => {
          receipt.status = incoming.statusCode; res.writeHead(incoming.statusCode!, incoming.headers); incoming.pipe(res);
          incoming.on("end", () => { receipt.completedAt = new Date().toISOString(); receipts.push(receipt); if (incoming.statusCode! >= 200 && incoming.statusCode! < 300) successes.add(taskId); resolve(); });
          incoming.on("error", () => { req.socket.destroy(); resolve(); });
        }); outgoing.on("error", () => { req.socket.destroy(); resolve(); }); outgoing.end(bytes);
      });
    } finally { finish(); }
  });
  const port = await listenOnFetchAllowedPort(server);
  return { origin: `http://127.0.0.1:${port}`, backendOrigin: upstream.origin,
    arm(input) { if (binding || new Set(input.taskIds).size !== 3) throw new Error("Transport fault must be armed once for exactly three actual task IDs"); binding = structuredClone(input); },
    receipts: () => structuredClone(receipts), releaseForExplicitRetry() { if (!failedTaskId || successes.size !== 2) throw new Error("Cannot release fault before the actual two-success/one-drop boundary"); released = true; },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
