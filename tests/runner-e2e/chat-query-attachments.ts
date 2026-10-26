import { createHash } from "node:crypto";
import type { ChatCatalogContext, ChatCatalogQueryAttachment } from "./chat-catalog-contract.js";

export interface ChatQueryAttachmentReceipt {
  id: string; companyId: string; issueId: string; issueCommentId: string | null;
  originalFilename: string | null; contentPath: string; byteSize: number; sha256: string;
  createdByAgentId: string | null; createdByUserId: string | null; originatingRunId?: string | null;
}
export interface ChatQueryHumanComment {
  id: string; body: string; authorAgentId?: string | null; authorUserId?: string | null;
  issueId?: string; companyId?: string; createdByRunId?: string | null;
}
const permitted = new Set(["steering.preserve-draft", "tasks.attachment-brief"]);
function receiptProjection(row: ChatQueryAttachmentReceipt): ChatQueryAttachmentReceipt {
  return { id: row.id, companyId: row.companyId, issueId: row.issueId, issueCommentId: row.issueCommentId,
    originalFilename: row.originalFilename, contentPath: row.contentPath, byteSize: row.byteSize, sha256: row.sha256,
    createdByAgentId: row.createdByAgentId, createdByUserId: row.createdByUserId, originatingRunId: row.originatingRunId };
}
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** Exact IssueChatThread submittedBody formatter; no alternate markdown or body rewriting. */
export function chatQueryWithAttachments(query: string, receipts: readonly ChatQueryAttachmentReceipt[]): string {
  if (receipts.length > 1) throw new Error("Only one declared production attachment is supported");
  return [query.trim(), ...receipts.map(item => `[${item.originalFilename!.replace(/[[\]]/g, "\\$&")}](${item.contentPath})`)].filter(Boolean).join("\n\n");
}
export function attachmentReceiptMatches(input: {
  expected: ChatQueryAttachmentReceipt; saved: ChatQueryAttachmentReceipt; bytes: Uint8Array;
  companyId: string; issueId: string; comment?: ChatQueryHumanComment;
}): boolean {
  const { expected, saved, bytes, companyId, issueId, comment } = input;
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(saved.id)
    && saved.id === expected.id && saved.companyId === companyId && saved.issueId === issueId
    && saved.originalFilename === expected.originalFilename && !!saved.originalFilename
    && saved.contentPath === `/api/attachments/${saved.id}/content` && saved.contentPath === expected.contentPath
    && typeof saved.createdByUserId === "string" && !!saved.createdByUserId && saved.createdByUserId === expected.createdByUserId
    && saved.createdByAgentId == null && saved.originatingRunId == null
    && /^[a-f0-9]{64}$/.test(saved.sha256) && saved.sha256 === expected.sha256
    && digest(bytes) === saved.sha256 && saved.byteSize === bytes.byteLength && saved.byteSize === expected.byteSize
    && (comment ? saved.issueCommentId === comment.id && comment.authorUserId === saved.createdByUserId
      && comment.authorAgentId == null && comment.createdByRunId == null && comment.issueId === issueId && comment.companyId === companyId
      : saved.issueCommentId == null);
}
export async function resolveChatQueryAttachments(ctx: ChatCatalogContext, specs: readonly ChatCatalogQueryAttachment[] = [], state: Record<string, unknown>) {
  if (!specs.length) return [];
  if (!permitted.has(ctx.scenario.id) || specs.length !== 1 || new Set(specs.map(row => row.stateKey)).size !== specs.length) throw new Error("Undeclared or duplicate catalog query attachment");
  await ctx.refreshIssue(); const issue = ctx.issue(); if (!issue) throw new Error("UI upload has no persisted source issue");
  const saved = await ctx.input.api.get<ChatQueryAttachmentReceipt[]>(`/api/issues/${issue.id}/attachments`);
  const receipts: ChatQueryAttachmentReceipt[] = [];
  for (const spec of specs) {
    const expected = state[spec.stateKey] as ChatQueryAttachmentReceipt | undefined;
    const matches = saved.filter(row => row.id === expected?.id);
    if (!expected || matches.length !== 1 || expected.originalFilename !== spec.filename || !spec.filename.trim() || /[\r\n\0]/.test(spec.filename)
      || receipts.some(row => row.id === expected.id)) throw new Error("Declared attachment differs from the persisted UI upload");
    const receipt = matches[0]!; const bytes = await ctx.input.api.getAttachmentContent(receipt.id);
    if (!attachmentReceiptMatches({ expected, saved: receipt, bytes, companyId: ctx.input.fixtures.company.id, issueId: issue.id })) throw new Error("Attachment source, content hash or human upload attribution does not match");
    receipts.push(receiptProjection(receipt));
  }
  return receipts;
}
export async function verifyChatQueryAttachments(ctx: ChatCatalogContext, receipts: readonly ChatQueryAttachmentReceipt[], comment: ChatQueryHumanComment) {
  const issue = ctx.issue(); if (!issue) return false;
  const saved = await ctx.input.api.get<ChatQueryAttachmentReceipt[]>(`/api/issues/${issue.id}/attachments`);
  for (const expected of receipts) {
    const matches = saved.filter(row => row.id === expected.id); if (matches.length !== 1) return false;
    const receipt = matches[0]!; const bytes = await ctx.input.api.getAttachmentContent(receipt.id);
    if (!attachmentReceiptMatches({ expected, saved: receipt, bytes, companyId: ctx.input.fixtures.company.id, issueId: issue.id, comment })) return false;
  }
  return true;
}
