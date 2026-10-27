import { describe, expect, it } from "vitest";
import { loadChatCatalogImplementation, type ChatCatalogDescriptor } from "./chat-catalog-registry.js";
import { sameSlackThreadNewMessage, slackIngressReceiptMatches, validSlackIngressDeclaration, slackNativeRunCheck } from "./chat-slack-ingress.js";
import type { ChatCatalogContext, ChatSlackIngressReceipt } from "./chat-catalog-contract.js";
import type { ChatConversation, ChatEndpoint, ChatIdentityLink, ExternalChannelBindingSummary } from "../../packages/shared/src/types/chat-channels.js";
import type { IssueComment } from "../../packages/shared/src/types/issue.js";
const query = "What happened in this thread?";
const metadata = { scenarioId: "chat-channels.reply-in-thread", journeyKind: "native-slack-thread", slackIngress: { kind: "native-slack-thread" as const, maximumProviderCalls: 20 as const, ingressTimeoutMs: 120000 as const }, expectedRunCount: 3, minimumRunCount: 1, expectedHumanMessageCount: 1, turnTimeoutMs: 120000, attemptTimeoutMs: 600000 };
function input() {
  const receipt: ChatSlackIngressReceipt = { query, endpointId: "endpoint", conversationId: "conversation", issueId: "issue", humanCommentId: "comment", linkedPaperclipUserId: "person", providerCalls: 2, provider: { workspaceId: "T123", channelId: "C123", threadId: "1234567890.123456", canonicalMessageId: "1234567891.123456", senderUserId: "U123" } };
  return { receipt, query, companyId: "company", agentId: "agent", endpoint: { id: "endpoint", companyId: "company", assignedAgentId: "agent", provider: "slack", providerAccountId: "T123" } as ChatEndpoint,
    conversation: { id: "conversation", companyId: "company", endpointId: "endpoint", issueId: "issue", externalConversationId: "slack:C123", externalThreadId: "slack:C123:1234567890.123456" } as ChatConversation,
    binding: { endpointId: "endpoint", conversationId: "conversation", provider: "slack", assignedAgentLocked: true } as ExternalChannelBindingSummary,
    comment: { id: "comment", companyId: "company", issueId: "issue", authorAgentId: null, authorUserId: "person", body: query, metadata: { version: 1, sourceChannel: "slack", sections: [{ title: "Slack sender", rows: [{ type: "key_value", label: "Provider ID", value: "U123" }] }] } } as IssueComment,
    links: [{ companyId: "company", endpointId: "endpoint", paperclipUserId: "person", status: "linked" }] as ChatIdentityLink[] };
}
describe("only real declared Slack canonical ingress", () => {
  it("rejects undeclared surfaces, unbounded lifecycle and hidden extra humans", () => {
    expect(validSlackIngressDeclaration(metadata)).toBe(true);
    expect(validSlackIngressDeclaration({ ...metadata, scenarioId: "tasks.create-backlog" })).toBe(false);
    expect(validSlackIngressDeclaration({ ...metadata, journeyKind: "agent-chat" })).toBe(false);
    expect(validSlackIngressDeclaration({ ...metadata, minimumRunCount: 0 })).toBe(false);
    expect(validSlackIngressDeclaration({ ...metadata, expectedHumanMessageCount: 2 })).toBe(false);
    expect(validSlackIngressDeclaration({ ...metadata, queryBindings: [{ catalogToken: "token", stateKey: "issue", resourceKind: "issue", valueField: "identifier" }] })).toBe(false);
  });
  it("cross-checks actual exact canonical comment, linked human, endpoint, company and provider thread DTOs", () => {
    expect(slackIngressReceiptMatches(input())).toBe(true);
    for (const mutate of [
      (v: ReturnType<typeof input>) => { v.comment.body += " Try harder"; },
      (v: ReturnType<typeof input>) => { v.comment.authorAgentId = "agent"; },
      (v: ReturnType<typeof input>) => { v.receipt.provider.senderUserId = "U999"; },
      (v: ReturnType<typeof input>) => { v.links[0]!.status = "revoked"; },
      (v: ReturnType<typeof input>) => { v.conversation.externalThreadId = "slack:C123:9999999999.123456"; },
      (v: ReturnType<typeof input>) => { v.conversation.externalConversationId = "C123"; },
      (v: ReturnType<typeof input>) => { v.endpoint.companyId = "foreign"; },
      (v: ReturnType<typeof input>) => { v.binding.conversationId = "another"; },
      (v: ReturnType<typeof input>) => { v.receipt.providerCalls = 21; },
    ]) { const value = input(); mutate(value); expect(slackIngressReceiptMatches(value)).toBe(false); }
  });
  it("requires the selected actual provider driver and rejects hidden scripted followups", async () => {
    const descriptor: ChatCatalogDescriptor = { ...metadata, journeyKind: "native-slack-thread", modulePath: "./chat-catalog-domains/external-slack.js", exportName: "slackCases", sourceFiles: ["chat-slack-ingress.ts"], oracleVersion: "controls", turnTimeoutMs: 120000, attemptTimeoutMs: 600000 };
    const implementation = { ...descriptor, setup: async () => ({}), observe: async () => ({}), grade: () => ({ passed: false, checks: [{ id: "unobserved", passed: false, detail: "Not an observed outcome" }] }), verifyResult: async () => {} };
    await expect(loadChatCatalogImplementation(descriptor, async () => ({ slackCases: [implementation] }))).rejects.toThrow("actual Slack ingress");
    const actual = { ...implementation, dispatchSlackQuery: async () => input().receipt };
    await expect(loadChatCatalogImplementation(descriptor, async () => ({ slackCases: [actual] }))).resolves.toBe(actual);
    await expect(loadChatCatalogImplementation(descriptor, async () => ({ slackCases: [{ ...actual, act: async () => {} }] }))).rejects.toThrow("actual Slack ingress");
    const fileDescriptor: ChatCatalogDescriptor = { ...descriptor, scenarioId: "chat-channels.channel-file", expectedRunCount: 6, minimumRunCount: 2, expectedHumanMessageCount: 2, attemptTimeoutMs: 900000 };
    const file = { ...actual, ...fileDescriptor };
    await expect(loadChatCatalogImplementation(fileDescriptor, async () => ({ slackCases: [file] }))).rejects.toThrow("supported and unsupported transfer phases");
    const completeFile = { ...file, verifySlackSupportedTransfer: async () => ({ passed: true, checks: [{ id: "actual-transfer", passed: true, detail: "Independent phase-specific byte/egress evidence" }] }), dispatchSlackUnsupportedFile: async () => input().receipt };
    await expect(loadChatCatalogImplementation(fileDescriptor, async () => ({ slackCases: [completeFile] }))).resolves.toBe(completeFile);

  });
  it("requires a separate same-thread canonical upload and declared two-phase bounds for the file conditional", () => {
    const file = { ...metadata, scenarioId: "chat-channels.channel-file", expectedRunCount: 6, minimumRunCount: 2, expectedHumanMessageCount: 2, attemptTimeoutMs: 900000 };
    expect(validSlackIngressDeclaration(file)).toBe(true);
    expect(validSlackIngressDeclaration({ ...file, expectedHumanMessageCount: 1 })).toBe(false);
    expect(validSlackIngressDeclaration({ ...metadata, scenarioId: "chat-channels.channel-file" })).toBe(false);
    const first = input().receipt, next = structuredClone(first); next.humanCommentId = "second-comment"; next.provider.canonicalMessageId = "1234567892.123456";
    expect(sameSlackThreadNewMessage(first, next)).toBe(true);
    expect(sameSlackThreadNewMessage(first, first)).toBe(false);
    expect(sameSlackThreadNewMessage(first, { ...next, query: "Use a different hidden instruction" })).toBe(false);
    expect(sameSlackThreadNewMessage(first, { ...next, provider: { ...next.provider, threadId: "9999999999.123456" } })).toBe(false);
  });
  it("cannot qualify a fast response, wrong agent or unrelated native run as the source execution", () => {
    const ctx = { issue: () => ({ id: "issue", companyId: "company", assigneeAgentId: "agent" }), input: { fixtures: { company: { id: "company" }, agent: { id: "agent" } } } } as unknown as ChatCatalogContext;
    const run = { id: "run", companyId: "company", agentId: "agent", runtimeMode: "native", status: "succeeded", contextSnapshot: { issueId: "issue" } };
    expect(slackNativeRunCheck(ctx, [run]).passed).toBe(true);
    expect(slackNativeRunCheck(ctx, [run], { slackUnsupportedIngressReceipt: {}, slackSupportedTransferRunIds: [run.id] }).passed).toBe(false);
    expect(slackNativeRunCheck(ctx, [run, { ...run, id: "second-native" }], { slackUnsupportedIngressReceipt: {}, slackSupportedTransferRunIds: [run.id] }).passed).toBe(true);
    expect(slackNativeRunCheck(ctx, []).passed).toBe(false);
    expect(slackNativeRunCheck(ctx, [{ ...run, agentId: "other" }]).passed).toBe(false);
    expect(slackNativeRunCheck(ctx, [{ ...run, contextSnapshot: { issueId: "other" } }]).passed).toBe(false);
  });
});
