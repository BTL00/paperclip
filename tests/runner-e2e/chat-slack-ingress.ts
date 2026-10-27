import { pollUntil } from "./api.js";
import { validateChatCatalogGrade } from "./chat-catalog-contract.js";
import type { ChatConversation, ChatEndpoint, ChatIdentityLink, ExternalChannelBindingSummary } from "../../packages/shared/src/types/chat-channels.js";
import type { IssueComment } from "../../packages/shared/src/types/issue.js";
import type { ChatCatalogCase, ChatCatalogContext, ChatSlackIngressReceipt } from "./chat-catalog-contract.js";
import type { ChatRun } from "./chat-flow.js";
export const nativeSlackScenarioIds = ["chat-channels.reply-in-thread", "chat-channels.channel-file"] as const;
export function validSlackIngressDeclaration(c: Pick<ChatCatalogCase, "scenarioId" | "slackIngress" | "expectedRunCount" | "minimumRunCount" | "expectedHumanMessageCount" | "setupHumanMessageCount" | "queryBindings" | "queryAttachments" | "queryOutcome" | "companionSurface" | "runPolicy" | "turnTimeoutMs" | "attemptTimeoutMs"> & { journeyKind?: string }) {
  return (nativeSlackScenarioIds as readonly string[]).includes(c.scenarioId) && c.journeyKind === "native-slack-thread"
    && c.slackIngress?.kind === "native-slack-thread" && c.slackIngress.maximumProviderCalls === 20 && c.slackIngress.ingressTimeoutMs === 120000
    && Object.keys(c.slackIngress).sort().join(",") === "ingressTimeoutMs,kind,maximumProviderCalls"
    && c.turnTimeoutMs === 120000
    && (c.scenarioId === "chat-channels.channel-file" ? c.attemptTimeoutMs === 900000 && c.expectedRunCount === 6 && c.minimumRunCount === 2 && c.expectedHumanMessageCount === 2
      : c.attemptTimeoutMs === 600000 && c.expectedRunCount === 3 && c.minimumRunCount === 1 && c.expectedHumanMessageCount === 1) && (c.setupHumanMessageCount ?? 0) === 0
    && !c.queryBindings?.length && !c.queryAttachments?.length && !c.queryOutcome && !c.companionSurface && !c.runPolicy;
}
export function slackIngressReceiptMatches(input: { receipt: ChatSlackIngressReceipt; query: string; companyId: string; agentId: string;
  endpoint: ChatEndpoint; conversation: ChatConversation | undefined; binding: ExternalChannelBindingSummary; comment: IssueComment | undefined; links: ChatIdentityLink[] }) {
  const { receipt: r, endpoint: e, conversation: c, binding: b, comment } = input;
  return !!r && r.query === input.query && Number.isSafeInteger(r.providerCalls) && r.providerCalls >= 1 && r.providerCalls <= 20
    && /^T[A-Z0-9]+$/.test(r.provider.workspaceId) && /^[CG][A-Z0-9]+$/.test(r.provider.channelId) && /^[UW][A-Z0-9]+$/.test(r.provider.senderUserId)
    && /^\d+\.\d{6}$/.test(r.provider.threadId) && /^\d+\.\d{6}$/.test(r.provider.canonicalMessageId)
    && e.id === r.endpointId && e.companyId === input.companyId && e.assignedAgentId === input.agentId && e.provider === "slack" && e.providerAccountId === r.provider.workspaceId
    && !!c && c.id === r.conversationId && c.endpointId === e.id && c.companyId === input.companyId && c.issueId === r.issueId
    && c.externalThreadId === `slack:${r.provider.channelId}:${r.provider.threadId}` && c.externalConversationId === `slack:${r.provider.channelId}`
    && b.provider === "slack" && b.endpointId === e.id && b.conversationId === c.id && b.assignedAgentLocked === true
    && !!comment && comment.id === r.humanCommentId && comment.issueId === r.issueId && comment.companyId === input.companyId
    && comment.body === input.query && !comment.authorAgentId && comment.authorUserId === r.linkedPaperclipUserId && comment.metadata?.sourceChannel === "slack"
    && Array.isArray(comment.metadata.sections) && comment.metadata.sections.some(section => section.rows.some(row => row.type === "key_value" && row.label === "Provider ID" && row.value === r.provider.senderUserId))
    && input.links.some(link => link.companyId === input.companyId && link.endpointId === e.id && link.status === "linked" && link.paperclipUserId === r.linkedPaperclipUserId);
}
export function sameSlackThreadNewMessage(first: ChatSlackIngressReceipt, next: ChatSlackIngressReceipt) {
  return next.query === first.query && next.endpointId === first.endpointId && next.conversationId === first.conversationId && next.issueId === first.issueId
    && next.linkedPaperclipUserId === first.linkedPaperclipUserId && next.humanCommentId !== first.humanCommentId
    && next.provider.workspaceId === first.provider.workspaceId && next.provider.channelId === first.provider.channelId && next.provider.threadId === first.provider.threadId
    && next.provider.senderUserId === first.provider.senderUserId && next.provider.canonicalMessageId !== first.provider.canonicalMessageId;
}
/** Provider transport belongs to the selected domain; public product identity
 * and exact canonical persistence are independently checked here. */
export async function dispatchNativeSlackIngress(ctx: ChatCatalogContext, c: ChatCatalogCase, state: Record<string, unknown>, deadlineAt: number, phase: "canonical" | "unsupported-file" = "canonical") {
  if (!validSlackIngressDeclaration(c) || !c.dispatchSlackQuery || c.act || !ctx.selectSlackSource) throw new Error("Invalid actual native Slack ingress contract");
  const driver = phase === "canonical" ? c.dispatchSlackQuery : c.scenarioId === "chat-channels.channel-file" ? c.dispatchSlackUnsupportedFile : undefined;
  if (!driver) throw new Error("Undeclared Slack ingress phase");
  const remaining = Math.min(c.slackIngress!.ingressTimeoutMs, deadlineAt - Date.now());
  if (remaining <= 0) throw new Error("Slack setup exhausted the actual attempt deadline");
  const signal = AbortSignal.timeout(remaining); let listener: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => { listener = () => reject(new Error("Actual Slack ingress exceeded its declared deadline")); signal.addEventListener("abort", listener, { once: true }); });
  let receipt: ChatSlackIngressReceipt;
  try { receipt = await Promise.race([driver(ctx, state, { query: ctx.scenario.query, signal }), interrupted]); }
  finally { if (listener) signal.removeEventListener("abort", listener); }
  // Fail before interpreting identifiers as API routes.
  for (const id of [receipt?.endpointId, receipt?.conversationId, receipt?.issueId, receipt?.humanCommentId]) if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error("Invalid Slack product receipt identity");
  const api = ctx.input.api;
  const endpoint = await api.get<ChatEndpoint>(`/api/chat-endpoints/${receipt.endpointId}`);
  const conversations = await api.get<ChatConversation[]>(`/api/chat-endpoints/${receipt.endpointId}/conversations`);
  const binding = await api.get<ExternalChannelBindingSummary>(`/api/issues/${receipt.issueId}/chat-binding`);
  const comments = await api.get<IssueComment[]>(`/api/issues/${receipt.issueId}/comments?order=asc`);
  const links = await api.get<ChatIdentityLink[]>(`/api/chat-endpoints/${receipt.endpointId}/principals`);
  const matched = slackIngressReceiptMatches({ receipt, query: ctx.scenario.query, companyId: ctx.input.fixtures.company.id, agentId: ctx.input.fixtures.agent.id,
    endpoint, conversation: conversations.find(row => row.id === receipt.conversationId), binding, comment: comments.find(row => row.id === receipt.humanCommentId), links });
  const first = state.slackIngressReceipt as ChatSlackIngressReceipt | undefined;
  const sameThreadNewMessage = phase === "canonical" || !!first && sameSlackThreadNewMessage(first, receipt);
  await ctx.input.evidence(`chat-slack-ingress-${phase}-binding.json`, { matched, sameThreadNewMessage, phase, canonicalQuery: ctx.scenario.query, receipt, assignedAgentId: endpoint.assignedAgentId,
    linkedIdentityConfirmed: matched, privateProviderConfiguration: "withheld", providerSenderMapping: "independent case oracle required" });
  if (signal.aborted || !matched || !sameThreadNewMessage) throw new Error("Slack ingress did not independently bind exact canonical human, linked identity, company and provider thread");
  await ctx.selectSlackSource(receipt.issueId);
  return receipt;
}
export async function completeNativeSlackFileConditional(ctx: ChatCatalogContext, c: ChatCatalogCase, state: Record<string, unknown>, deadlineAt: number) {
  if (c.scenarioId !== "chat-channels.channel-file" || !c.verifySlackSupportedTransfer || !c.dispatchSlackUnsupportedFile) throw new Error("Missing actual Slack file conditional");
  const first = await pollUntil({ label: "real supported Slack transfer before unsupported upload", deadlineAt, intervalMs: 1000,
    load: async () => { const grade = validateChatCatalogGrade(await c.verifySlackSupportedTransfer!(ctx, state)); const runs = await ctx.allRuns(); return { grade, runs }; },
    accept: value => value.grade.passed && value.runs.length >= 1 && value.runs.length <= 3 && value.runs.every(run => run.runtimeMode === "native" && run.companyId === ctx.input.fixtures.company.id && run.status === "succeeded") && slackNativeRunCheck(ctx, value.runs).passed });
  state.slackSupportedTransferRunIds = first.runs.map(run => run.id);
  await ctx.input.evidence("chat-slack-supported-transfer-checkpoint.json", { grade: first.grade, runIds: state.slackSupportedTransferRunIds, beforeUnsupportedUpload: true });
  state.slackUnsupportedIngressReceipt = await dispatchNativeSlackIngress(ctx, c, state, deadlineAt, "unsupported-file");
}
export function slackNativeRunCheck(ctx: ChatCatalogContext, runs: ChatRun[], state?: Record<string, unknown>) {
  const source = ctx.issue();
  const sourceRuns = runs.filter(run => run.contextSnapshot?.issueId === source?.id);
  return { id: "catalog-real-slack-source-native", passed: !!source && source.companyId === ctx.input.fixtures.company.id && source.assigneeAgentId === ctx.input.fixtures.agent.id
    && sourceRuns.length >= 1 && sourceRuns.every(run => run.agentId === ctx.input.fixtures.agent.id && run.runtimeMode === "native" && run.status === "succeeded")
    && runs.every(run => typeof run.contextSnapshot?.issueId === "string")
    && (!state?.slackUnsupportedIngressReceipt || Array.isArray(state.slackSupportedTransferRunIds) && sourceRuns.some(run => !(state.slackSupportedTransferRunIds as unknown[]).includes(run.id))),
    detail: "The actual inbound source has a genuine assigned-agent native admission; fast responses cannot substitute. The independent case oracle binds every downstream task and automatic source follow-up to this provider exchange." };
}
