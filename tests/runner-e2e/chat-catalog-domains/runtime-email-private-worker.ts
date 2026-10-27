import { randomUUID, createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { test } from "@playwright/test";
import { agentmailApi } from "../../../server/src/services/agentmail-api.js";
import type { EmailEndpointSummary, EmailPublicationSummary } from "../../../packages/shared/src/types/email.js";
import type { EmailPrivateInput, EmailPrivateReceipt } from "./runtime-email-private.js";
async function main(): Promise<EmailPrivateReceipt> {
  let attached = false; try { test.info(); attached = true; } catch { /* standalone only */ } if (attached) throw new Error("Private email credential operations must not execute in Test");
  const filename = process.argv[2]!, info = await lstat(filename); if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077 || info.size > 65536) throw new Error("Invalid private email request file");
  const input = JSON.parse(await readFile(filename, "utf8")) as EmailPrivateInput, base = new URL(input.baseURL);
  if (!["recovery.unknown-email-outcome", "chat-channels.outbound-email", "chat-channels.reply-to-email"].includes(input.scenarioId) || !["setup", "inspect", "resolve"].includes(input.operation) || base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.origin !== input.baseURL || !input.dedicatedDisposableInbox || input.inboxId !== input.recipient || ![input.companyId, input.agentId].every(id => /^[a-f0-9-]{36}$/i.test(id))) throw new Error("Email operation requires the exact owned selected self-addressed fixture");
  let directProviderProbeCount = 0, publicSetupOperationCount = 0;
  const direct: typeof fetch = async (...args) => { directProviderProbeCount++; return fetch(...args); }, provider = agentmailApi(input.credential, direct);
  async function local<T>(pathname: string, body?: unknown) { const response = await fetch(base.origin + pathname, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body), headers: { Cookie: input.cookies.map(row => `${row.name}=${row.value}`).join("; "), Origin: base.origin, "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000), redirect: "error" }); if (!response.ok) { await response.body?.cancel(); throw new Error("Actual private email public operation rejected"); } return response.json() as Promise<T>; }
  const person = await local<{ user: { id: string } }>("/api/auth/get-session"), company = await local<{ id: string }>(`/api/companies/${input.companyId}`), agent = await local<{ id: string; companyId: string }>(`/api/agents/${input.agentId}`);
  if (!person.user?.id || company.id !== input.companyId || agent.companyId !== company.id) throw new Error("Email setup lacks actual fixture-person/company/agent scope");
  const [scope, inventory, inbox] = await Promise.all([provider.whoami(), provider.listInboxes(), provider.getInbox(input.inboxId)]);
  if (inbox.inbox_id !== input.inboxId || inventory.inboxes.length !== 1 || inventory.inboxes[0]?.inbox_id !== input.inboxId || scope.scope_type === "inbox" && scope.inbox_id !== input.inboxId) throw new Error("The selected declared disposable QA inbox is not the actual sole authorized inbox; no account or recipient may be guessed");
  const common = { processIsolation: true, testRunnerAttached: false, apiStepRecorder: false, operation: input.operation, companyId: input.companyId, agentId: input.agentId, actualSingleDedicatedInbox: true, personId: person.user.id } as const;
  if (input.operation === "setup") {
    const connection = await local<{ id: string; companyId: string }>(`/api/companies/${input.companyId}/email/connections`, { apiKey: input.credential, grantKind: "user", allAgents: false, agentIds: [input.agentId], idempotencyKey: randomUUID() }); publicSetupOperationCount++;
    if (connection.companyId !== input.companyId) throw new Error("Actual encrypted email credential connection scope mismatch");
    const endpoint = await local<EmailEndpointSummary>(`/api/companies/${input.companyId}/email/inboxes`, { assignedAgentId: input.agentId, credentialConnectionId: connection.id, inboxId: input.inboxId, receiveMode: "websocket", idempotencyKey: input.endpointId ?? randomUUID() }); publicSetupOperationCount++;
    const saved = (await local<EmailEndpointSummary[]>(`/api/companies/${input.companyId}/email/inboxes`)).find(row => row.id === endpoint.id);
    if (!saved || saved.companyId !== input.companyId || saved.address !== input.inboxId || saved.assignedAgentId !== input.agentId || saved.status !== "active") throw new Error("Actual email endpoint is not the authorized active self-addressed fixture");
    return { ...common, connectionId: connection.id, endpointId: saved.id, actualActiveEndpoint: true, publicSetupOperationCount, directProviderProbeCount };
  }
  if (!input.endpointId || !input.publicationId || !input.subject || !input.textSha256 || !input.after || !input.accepted || input.accepted.publicationId !== input.publicationId) throw new Error("Email inspection requires the exact actual original accepted send binding");
  const endpoint = (await local<EmailEndpointSummary[]>(`/api/companies/${input.companyId}/email/inboxes`)).find(row => row.id === input.endpointId);
  if (!endpoint || endpoint.address !== input.inboxId || endpoint.assignedAgentId !== input.agentId || endpoint.companyId !== input.companyId) throw new Error("Provider reconciliation is not bound to the actual original endpoint");
  const matchedSent: NonNullable<EmailPrivateReceipt["matchedSent"]> = []; const seen = new Set<string>(); let page: string | undefined, pages = 0;
  do {
    if (++pages > 3) throw new Error("Independent fixture duplicate check exceeds its finite dedicated inbox window");
    const listed = await provider.listMessages(input.inboxId, input.after, page);
    for (const row of listed.messages) {
      if (seen.has(row.message_id)) continue; seen.add(row.message_id);
      const message = await provider.getMessage(input.inboxId, row.message_id), pub = Object.entries(message.headers).find(([key]) => key.toLowerCase() === "x-paperclip-publication-id")?.[1];
      if (message.inbox_id !== input.inboxId || message.subject !== input.subject || createHash("sha256").update((message.text ?? "").replace(/\r\n/g, "\n").trim()).digest("hex") !== input.textSha256 || !message.labels.includes("sent") || !/^[a-f0-9-]{36}$/i.test(pub ?? "") || message.to.length !== 1 || (message.to[0]?.match(/(?:^|<)([^<>\s]+@[^<>\s]+)>?$/)?.[1]?.toLowerCase() !== input.recipient.toLowerCase())) continue;
      matchedSent.push({ messageId: message.message_id, threadId: message.thread_id, publicationId: pub!, contentMatches: true, accepted: true, recipientCopyObserved: message.labels.includes("received") });
    }
    page = listed.next_page_token;
  } while (page);
  const original = matchedSent.filter(row => row.messageId === input.accepted!.providerMessageId && row.threadId === input.accepted!.providerThreadId && row.publicationId === input.publicationId), originalMessageMatched = original.length === 1;
  if (!originalMessageMatched) throw new Error("The actual provider receipt does not independently match the original persisted send");
  if (input.operation === "inspect") return { ...common, publicSetupOperationCount, directProviderProbeCount, matchedSent, originalMessageMatched };
  let current = await local<EmailPublicationSummary>(`/api/companies/${input.companyId}/email/deliveries/${input.publicationId}`), resolution: EmailPrivateReceipt["resolution"] = "provider-reconciled";
  if (current.outcome === "uncertain") { current = await local<EmailPublicationSummary>(`/api/companies/${input.companyId}/email/deliveries/${input.publicationId}/resolve`, { outcome: "sent", providerMessageId: original[0]!.messageId }); publicSetupOperationCount++; resolution = "human-reconciled"; }
  if (!["sent", "delivered"].includes(current.outcome) || current.providerMessageId !== original[0]!.messageId) throw new Error("The actual public send has not reconciled to the verified original provider message");
  return { ...common, publicSetupOperationCount, directProviderProbeCount, matchedSent, originalMessageMatched, resolution, outcome: current.outcome as "sent" | "delivered" };
}
main().then(receipt => process.stdout.write(JSON.stringify(receipt))).catch(() => { process.stderr.write("Actual private email operation failed; credential/provider diagnostics withheld"); process.exitCode = 1; });
