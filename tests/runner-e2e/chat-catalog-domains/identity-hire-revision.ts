import { expect } from "@playwright/test";
import type { Approval, ApprovalComment } from "../../../packages/shared/src/types/approval.js";
import type { ChatCatalogCase } from "../chat-catalog-contract.js";
import { checks, entity } from "./internal-support.js";
import { identityDefinition, identityObservation, observeIdentity, openStandingChat, waitForReply } from "./identity-support.js";

export function gradeHireRevision(value: unknown) {
  const c = checks(); const o = identityObservation(value); c.add("complete-formal-revision", !!o, "Actual governance proposal, catalog choice, saved history and attributed resubmission are required."); if (!o) return c.result();
  const approval = o.state.currentApproval as Approval | undefined; const original = o.state.originalApproval as Approval | undefined;
  const adapter = approval?.payload.adapterConfig as { model?: string } | undefined;
  c.add("same-unapproved-governed-hire", !!approval && approval.id === original?.id && approval.companyId === o.companyId && approval.type === "hire_agent"
    && approval.requestedByAgentId === o.leadId && approval.status === "pending" && approval.decidedByUserId === null && approval.decidedAt === null,
    "Revision returns the same actual hiring proposal to pending board review; it is never promoted to approved or a ready employee.");
  c.add("actual-board-selected-cheaper-choice", typeof o.state.cheaperModel === "string" && adapter?.model === o.state.cheaperModel
    && (original?.payload.adapterConfig as { model?: string } | undefined)?.model !== adapter?.model
    && Array.isArray(o.state.eligibleModels) && o.state.eligibleModels.includes(adapter.model) && o.state.originalOtherFieldsPreserved === true,
    "The real public adapter catalog contains the explicit board-selected lower-cost alternative, and only that proposed configuration changes; no rate is invented.");
  const comments = o.state.approvalComments as ApprovalComment[] | undefined;
  c.add("inspectable-original-and-revised-history", !!comments?.some(comment => comment.id === o.state.originalHistoryCommentId && comment.authorUserId === o.state.humanId
    && comment.body.includes(String(o.state.originalModel)) && comment.body.includes(String(o.state.cheaperModel)))
    && comments.some(comment => comment.authorAgentId === o.leadId && comment.body.includes(String(o.state.cheaperModel)))
    && o.activity.some(row => row.action === "approval.revision_requested" && row.entityId === approval?.id && row.actorType === "user")
    && o.activity.filter(row => row.action === "approval.resubmitted" && row.entityId === approval?.id && row.actorType === "agent" && row.agentId === o.leadId).length === 1,
    "The retained public original/board-choice comment, agent revision note and actual revision/resubmission audit form inspectable history.");
  c.add("no-hire-or-approval-side-effect", o.agents.length === o.state.beforeAgentCount && !o.activity.some(row => row.action === "approval.approved" && row.entityId === approval?.id)
    && o.state.pendingProposalVisible === true && o.state.revisedModelVisible === true && /approval|review|pending|board/i.test(o.reply),
    "The actual proposal remains visibly pending with the revised model and no employee is instantiated or activated under the revision request.");
  return c.result();
}
export const hireRevisionIdentityCases: readonly ChatCatalogCase[] = [identityDefinition("questions-and-approvals.formal-hire-revision", async ctx => {
  const source = await openStandingChat(ctx); const { fixtures, execution, workspacePath, nonce } = ctx.input;
  const configuration = execution.profile.buildAgent({ environmentId: fixtures.environment.id, environmentFixtureId: execution.environment.id, workspacePath, secretRefs: fixtures.secretRefs, executionId: nonce });
  const config = configuration.adapterConfig as Record<string, unknown>; const cheaperModel = "gpt-6-luna";
  const originalModel = typeof config.model === "string" && config.model !== cheaperModel ? config.model : "gpt-6.1-sol";
  const models = await ctx.input.api.get<Array<{ id: string }>>(`/api/companies/${fixtures.company.id}/adapters/${configuration.adapterType}/models?provider=codex&environmentId=${fixtures.environment.id}`);
  if (![originalModel, cheaperModel].every(model => models.some(row => row.id === model))) throw new Error("Setup blocker: both the proposed and board-selected cheaper models must exist in the actual target adapter catalog");
  const session = await ctx.input.api.get<{ user: { id: string } }>("/api/auth/get-session");
  const originalApproval = await ctx.input.api.post<Approval>(`/api/companies/${fixtures.company.id}/approvals`, { type: "hire_agent", requestedByAgentId: fixtures.agent.id, issueIds: [source.id],
    payload: { ...configuration, name: `Launch researcher ${nonce}`, role: "researcher", reportsTo: fixtures.agent.id, adapterConfig: { ...config, model: originalModel } } });
  const history = await ctx.input.api.post<ApprovalComment>(`/api/approvals/${originalApproval.id}/comments`, { body: `Original proposed hire configuration: model ${originalModel}. Board-selected lower-cost alternative for this proposal: ${cheaperModel}. Preserve all other hiring scope, use this selected alternative and resubmit for board approval. This is a request for revision, not approval. No provider prices or savings estimate are asserted.` });
  const url = ctx.input.page.url(); await ctx.input.page.goto(`/${fixtures.company.issuePrefix}/approvals/${originalApproval.id}`, { waitUntil: "domcontentloaded" });
  await ctx.input.page.getByRole("button", { name: "Request revision", exact: true }).click();
  await expect.poll(async () => (await ctx.input.api.get<Approval>(`/api/approvals/${originalApproval.id}`)).status).toBe("revision_requested");
  await ctx.input.page.goto(url, { waitUntil: "domcontentloaded" });
  return { originalApproval, originalHistoryCommentId: history.id, originalModel, cheaperModel, humanId: session.user.id,
    eligibleModels: models.map(row => row.id), beforeAgentCount: (await ctx.input.api.get<unknown[]>(`/api/companies/${fixtures.company.id}/agents`)).length };
}, gradeHireRevision, {
  authentication: "human-session", sourceFiles: ["chat-catalog-domains/identity-hire-revision.ts", "chat-catalog-domains/identity-support.ts", "chat-catalog-domains/internal-support.ts", "chat-scenarios/questions-and-approvals.yaml"],
  async act(ctx, state) {
    await waitForReply(ctx); const id = entity(state, "originalApproval").id; const source = ctx.input.page.url();
    const links = await ctx.input.page.locator('[id^="comment-"] a[href]').evaluateAll(rows => rows.map(row => row.getAttribute("href")!));
    const link = links.find(href => new URL(href, ctx.input.api.baseURL).pathname.endsWith(`/approvals/${id}`));
    if (!link) throw new Error("Actual pending revised proposal review link is missing");
    await ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(link)}]`).first().click();
    await expect(ctx.input.page.getByText("pending", { exact: true }).first()).toBeVisible(); state.pendingProposalVisible = true;
    await ctx.input.page.getByRole("button", { name: "See full request", exact: true }).click();
    await expect(ctx.input.page.locator("pre")).toContainText(String(state.cheaperModel)); state.revisedModelVisible = true;
    await ctx.input.page.goto(source, { waitUntil: "domcontentloaded" });
  },
  async observe(ctx, state) {
    const id = entity(state, "originalApproval").id;
    const current = await ctx.input.api.get<Approval>(`/api/approvals/${id}`); state.currentApproval = current;
    state.approvalComments = await ctx.input.api.get<ApprovalComment[]>(`/api/approvals/${id}/comments`);
    const stripModel = (payload: Record<string, unknown>) => { const adapter = payload.adapterConfig as Record<string, unknown>; return { ...payload, adapterConfig: { ...adapter, model: undefined } }; };
    state.originalOtherFieldsPreserved = JSON.stringify(stripModel((state.originalApproval as Approval).payload)) === JSON.stringify(stripModel(current.payload));
    return observeIdentity(ctx, state);
  },
})];
