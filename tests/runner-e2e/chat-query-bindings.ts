import type { ChatCatalogContext, ChatCatalogQueryBinding } from "./chat-catalog-contract.js";

const allowedCatalogTokens: Readonly<Record<string, readonly string[]>> = {
  "access.other-company": ["BIRCH-42"], "projects.add-repository": ["acorn/site"],
  "projects.replace-repository": ["acorn/site-old", "acorn/site-new"],
  "workspaces.prepare-repository": ["acorn/site"], "workspaces.private-repository-no-access": ["acorn/site"],
};
const allowedResourceKinds: Readonly<Record<string, string>> = { "access.other-company": "issue",
  "projects.add-repository": "project-repository", "projects.replace-repository": "project-repository",
  "workspaces.prepare-repository": "project-repository", "workspaces.private-repository-no-access": "project-repository" };
export interface RenderedChatQuery {
  originalQuery: string; renderedQuery: string;
  bindings: Array<{ catalogToken: string; fixtureValue: string; resourceKind: "issue" | "project-repository"; resourceId: string | number; companyId: string; connectionId?: string }>;
}
export function renderChatCatalogQuery(scenarioId: string, originalQuery: string, specs: readonly ChatCatalogQueryBinding[] = [], state: Record<string, unknown>): RenderedChatQuery {
  let renderedQuery = originalQuery; const bindings: RenderedChatQuery["bindings"] = [];
  for (const spec of specs) {
    if (!allowedCatalogTokens[scenarioId]?.includes(spec.catalogToken) || spec.resourceKind !== allowedResourceKinds[scenarioId] || spec.valueField !== (spec.resourceKind === "issue" ? "identifier" : "fullName")
      || bindings.some(row => row.catalogToken === spec.catalogToken) || originalQuery.split(spec.catalogToken).length !== 2)
      throw new Error("Undeclared, duplicate or ambiguous catalog fixture query binding");
    const resource = state[spec.stateKey] as { id?: unknown; companyId?: unknown; identifier?: unknown; fullName?: unknown; connectionId?: unknown } | undefined;
    if (!resource || typeof resource.companyId !== "string" || !resource.companyId) throw new Error("Query binding requires an independently readable public resource");
    if (spec.resourceKind === "issue") {
      if (typeof resource.id !== "string" || !resource.id || typeof resource.identifier !== "string" || !/^[A-Z]+-\d+$/.test(resource.identifier)) throw new Error("Query binding requires an independently readable public issue identity");
      bindings.push({ catalogToken: spec.catalogToken, fixtureValue: resource.identifier, resourceKind: "issue", resourceId: resource.id, companyId: resource.companyId });
    } else {
      if (!Number.isSafeInteger(resource.id) || Number(resource.id) <= 0 || typeof resource.connectionId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(resource.connectionId)
        || typeof resource.fullName !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(resource.fullName)) throw new Error("Repository query binding requires a numeric provider identity and current connection");
      bindings.push({ catalogToken: spec.catalogToken, fixtureValue: resource.fullName, resourceKind: "project-repository", resourceId: resource.id as number, companyId: resource.companyId, connectionId: resource.connectionId });
    }
  }
  // Apply positions from the original query, so a real identity cannot be rewritten as a later alias.
  for (const binding of [...bindings].sort((a, b) => originalQuery.indexOf(b.catalogToken) - originalQuery.indexOf(a.catalogToken))) {
    const index = originalQuery.indexOf(binding.catalogToken);
    renderedQuery = renderedQuery.slice(0, index) + binding.fixtureValue + renderedQuery.slice(index + binding.catalogToken.length);
  }
  return { originalQuery, renderedQuery, bindings };
}
export async function resolveChatCatalogQuery(ctx: ChatCatalogContext, specs: readonly ChatCatalogQueryBinding[] | undefined, state: Record<string, unknown>) {
  const rendered = renderChatCatalogQuery(ctx.scenario.id, ctx.scenario.query, specs, state);
  for (const binding of rendered.bindings) {
    if (binding.resourceKind === "issue") {
      const saved = await ctx.input.api.get<{ id: string; companyId: string; identifier: string }>(`/api/issues/${binding.resourceId}`);
      if (saved.id !== binding.resourceId || saved.companyId !== binding.companyId || saved.identifier !== binding.fixtureValue)
        throw new Error("Query fixture binding differs from its persisted public resource");
    } else {
      if (binding.companyId !== ctx.input.fixtures.company.id) throw new Error("Repository binding belongs to another company");
      const discovery = await ctx.input.api.get<{ repositories: Array<{ id: string; fullName: string; connectionIds?: string[] }> }>(`/api/companies/${binding.companyId}/project-repositories`);
      const matches = discovery.repositories.filter(row => /^\d+$/.test(row.id) && Number(row.id) === binding.resourceId
        && row.fullName === binding.fixtureValue && row.connectionIds?.includes(binding.connectionId!));
      const connection = await ctx.input.api.get<{ id: string; companyId: string; status: string; enabled: boolean; config?: { sourceTemplateKey?: string } }>(`/api/tool-connections/${binding.connectionId}`);
      if (matches.length !== 1 || connection.id !== binding.connectionId || connection.companyId !== binding.companyId
        || connection.status !== "active" || !connection.enabled || connection.config?.sourceTemplateKey !== "github") throw new Error("Repository alias differs from active company-scoped provider discovery");
    }
  }
  return rendered;
}
