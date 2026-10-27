import { createServer } from "node:http";
import { createHash } from "node:crypto";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import type { CompanySkill, CompanySkillDetail, CompanySkillImportResult } from "../../../packages/shared/src/types/company-skill.js";
import { websiteChecklist } from "./integrator-skills.js";
export const sourceSkillMarkdown = `---\nname: accessibility-review\ndescription: Review a synthetic website for accessibility and report evidence.\n---\n\n# Website accessibility review\n\n${websiteChecklist.map(item => `- ${item}`).join("\n")}\n\nFor each check, record the page and observed evidence; report failures without claiming every page was tested.\n`;
export const mobileChecks = ["Check touch targets are at least 44 by 44 pixels.", "Repeat the review in both portrait and landscape orientation.", "Verify the checkout interaction on mobile Safari."];
const sources = new WeakMap<ChatCatalogContext, Awaited<ReturnType<typeof openSource>>>();
async function openSource() {
  const requests: Array<{ method: string; path: string; at: number; sha256: string }> = [];
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/accessibility-review/SKILL.md" || requests.length >= 100) { response.writeHead(404).end(); return; }
    requests.push({ method: request.method, path: request.url, at: Date.now(), sha256: createHash("sha256").update(sourceSkillMarkdown).digest("hex") });
    response.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" }); response.end(sourceSkillMarkdown);
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Owned skill source did not bind loopback");
  return { url: `http://127.0.0.1:${address.port}/accessibility-review/SKILL.md`, requests,
    async close() { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}
export async function openVettedSkillSource(ctx: ChatCatalogContext) {
  if (sources.has(ctx)) throw new Error("Only one owned synthetic skill source is allowed per attempt");
  const source = await openSource(); sources.set(ctx, source); return source;
}
export function skillSourceRequests(ctx: ChatCatalogContext) { return sources.get(ctx)?.requests.map(row => ({ ...row })) ?? []; }
export async function closeVettedSkillSource(ctx: ChatCatalogContext) { const source = sources.get(ctx); if (source) { await source.close(); sources.delete(ctx); } }
export async function importReadOnlySkill(ctx: ChatCatalogContext, source: string): Promise<CompanySkillDetail> {
  const root = `/api/companies/${ctx.input.fixtures.company.id}/skills`;
  const imported = await ctx.input.api.post<CompanySkillImportResult>(`${root}/import`, { source });
  if (imported.imported.length !== 1) throw new Error("Owned source import must produce exactly one real company skill");
  const skill = await ctx.input.api.get<CompanySkillDetail>(`${root}/${imported.imported[0]!.id}`);
  if (skill.sourceType !== "url" || skill.sourceLocator !== source || skill.editable || skill.markdown !== sourceSkillMarkdown) throw new Error("Public import did not establish the actual read-only upstream skill");
  return skill;
}
export async function editableLocalNotes(ctx: ChatCatalogContext, upstream: CompanySkillDetail) {
  const root = `/api/companies/${ctx.input.fixtures.company.id}/skills`;
  const result = await ctx.input.api.post<{ skill: CompanySkill }>(`${root}/${upstream.id}/fork`, { name: "Accessibility local notes", slug: "accessibility-local-notes" });
  await ctx.input.api.patch(`${root}/${result.skill.id}/files`, { path: "SKILL.md", content: `${result.skill.markdown}\n\n## Local review notes\nKeep ORCHID customer escalation notes unchanged.\n`, expectedVersionId: result.skill.currentVersionId });
  return ctx.input.api.get<CompanySkillDetail>(`${root}/${result.skill.id}`);
}
