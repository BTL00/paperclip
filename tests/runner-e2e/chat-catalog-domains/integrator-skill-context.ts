import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import type { IssueDocument } from "../../../packages/shared/src/types/issue.js";
/** Factual user-visible selection/antecedent on the actual conversation. This
 * never supplies an expected answer, an API recipe or an additional prompt. */
export async function saveSkillConversationContext(ctx: ChatCatalogContext, input: { projectId?: string; description: string; document?: { key: string; title: string; body: string } }) {
  await ctx.input.api.post(`/api/companies/${ctx.input.fixtures.company.id}/chats/${ctx.input.fixtures.agent.id}`);
  await ctx.refreshIssue(); const source = ctx.issue();
  if (!source) throw new Error("Skill selection requires the actual standing conversation");
  await ctx.input.api.patch(`/api/issues/${source.id}`, { ...(input.projectId ? { projectId: input.projectId } : {}), description: input.description });
  if (input.document) {
    const { key, title, body } = input.document;
    const endpoint = `/api/issues/${source.id}/documents/${encodeURIComponent(key)}`;
    await ctx.input.api.putSensitive(endpoint, { title, body, format: "markdown", baseRevisionId: null });
    const saved = await ctx.input.api.get<IssueDocument>(endpoint);
    if (saved.issueId !== source.id || saved.body !== body) throw new Error("Skill input document did not persist on the canonical conversation");
  }
  return source;
}
