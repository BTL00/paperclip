import type { ChatCatalogContext, ChatCatalogQueryBinding } from "./chat-catalog-contract.js";

const allowedCatalogTokens: Readonly<Record<string, readonly string[]>> = { "access.other-company": ["BIRCH-42"] };
export interface RenderedChatQuery {
  originalQuery: string; renderedQuery: string;
  bindings: Array<{ catalogToken: string; fixtureValue: string; resourceKind: "issue"; resourceId: string; companyId: string }>;
}
export function renderChatCatalogQuery(scenarioId: string, originalQuery: string, specs: readonly ChatCatalogQueryBinding[] = [], state: Record<string, unknown>): RenderedChatQuery {
  let renderedQuery = originalQuery; const bindings: RenderedChatQuery["bindings"] = [];
  for (const spec of specs) {
    if (!allowedCatalogTokens[scenarioId]?.includes(spec.catalogToken) || spec.resourceKind !== "issue" || spec.valueField !== "identifier"
      || bindings.some(row => row.catalogToken === spec.catalogToken) || originalQuery.split(spec.catalogToken).length !== 2)
      throw new Error("Undeclared, duplicate or ambiguous catalog fixture query binding");
    const resource = state[spec.stateKey] as { id?: unknown; companyId?: unknown; identifier?: unknown } | undefined;
    if (!resource || typeof resource.id !== "string" || !resource.id || typeof resource.companyId !== "string" || !resource.companyId
      || typeof resource.identifier !== "string" || !/^[A-Z]+-\d+$/.test(resource.identifier)) throw new Error("Query binding requires an independently readable public issue identity");
    renderedQuery = renderedQuery.replace(spec.catalogToken, resource.identifier);
    bindings.push({ catalogToken: spec.catalogToken, fixtureValue: resource.identifier, resourceKind: "issue", resourceId: resource.id, companyId: resource.companyId });
  }
  return { originalQuery, renderedQuery, bindings };
}
export async function resolveChatCatalogQuery(ctx: ChatCatalogContext, specs: readonly ChatCatalogQueryBinding[] | undefined, state: Record<string, unknown>) {
  const rendered = renderChatCatalogQuery(ctx.scenario.id, ctx.scenario.query, specs, state);
  for (const binding of rendered.bindings) {
    const saved = await ctx.input.api.get<{ id: string; companyId: string; identifier: string }>(`/api/issues/${binding.resourceId}`);
    if (saved.id !== binding.resourceId || saved.companyId !== binding.companyId || saved.identifier !== binding.fixtureValue)
      throw new Error("Query fixture binding differs from its persisted public resource");
  }
  return rendered;
}
