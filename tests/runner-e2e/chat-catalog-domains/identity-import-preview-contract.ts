import { isDeepStrictEqual } from "node:util";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { pollUntil } from "../api.js";
import type { CompanyPortabilityPreviewResult } from "../../../packages/shared/src/types/company-portability.js";
import type { Entity } from "./internal-support.js";
interface ImportAgent extends Entity { lifecycleState?: string; lifecycleVersion?: number; lifecycleHolds?: unknown[]; lifecycleError?: unknown }
export interface ImportConfiguration extends Record<string, unknown> { id: string; companyId: string; status: string; adapterType: string; adapterConfig: Record<string, unknown>; runtimeConfig: Record<string, unknown> }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function configuration(value: unknown): value is ImportConfiguration {
  return record(value) && typeof value.id === "string" && !!value.id && typeof value.companyId === "string" && !!value.companyId
    && typeof value.status === "string" && typeof value.adapterType === "string" && record(value.adapterConfig) && record(value.runtimeConfig);
}
/** Compare the entire public configuration, including status/timestamps. JSON
 * objects have no property order; array order, types, missing keys and values do. */
export function sameImportConfiguration(before: unknown, after: unknown): boolean {
  return configuration(before) && configuration(after) && isDeepStrictEqual(before, after);
}
/** Wait only for the already requested setup. Never resume, reconfigure, test,
 * run or waive a pause. The first baseline is captured after genuine readiness. */
export async function captureReadyImportBaseline(ctx: ChatCatalogContext, created: Entity) {
  if (ctx.scenario.id !== "companies.import-preview" || ctx.input.execution.id !== "chat-features.runner-opencode.local.companies.import-preview"
    || !created.id || created.name !== "Morgan" || created.companyId !== ctx.input.fixtures.company.id) throw new Error("Import baseline requires its exact existing company agent");
  const deadlineAt = ctx.observationDeadlineAt;
  const remaining = () => { const now = Date.now(); if (!Number.isFinite(deadlineAt) || deadlineAt! <= now) throw new Error("Original import observation budget exhausted or missing"); return Math.min(15_000, deadlineAt! - now); };
  const read = async <T>(route: string) => { const value = await ctx.input.api.get<T>(route, { timeout: remaining() }); remaining(); return value; };
  remaining();
  const ready = await pollUntil({ label: "Existing import-conflict agent completes its original setup", deadlineAt: deadlineAt!, intervalMs: 500, retryOnError: () => false,
    load: () => read<ImportAgent>(`/api/agents/${created.id}`),
    accept: agent => agent.id === created.id && agent.companyId === created.companyId && agent.name === created.name && agent.lifecycleState === "ready" && agent.status === "idle"
      && Number.isSafeInteger(agent.lifecycleVersion) && agent.lifecycleVersion! >= 0 && Array.isArray(agent.lifecycleHolds) && agent.lifecycleHolds.length === 0 && !agent.lifecycleError,
    reject: agent => agent.id !== created.id || agent.companyId !== created.companyId || agent.name !== created.name || agent.lifecycleError || !Number.isSafeInteger(agent.lifecycleVersion) || !Array.isArray(agent.lifecycleHolds) || (agent.lifecycleHolds?.length ?? 0) > 0
      || ["error", "terminated", "pending_approval"].includes(agent.lifecycleState ?? "") ? "Existing agent setup identity/hold/readiness failed" : undefined });
  const saved = await read<ImportConfiguration>(`/api/agents/${created.id}/configuration`);
  const current = await read<ImportAgent>(`/api/agents/${created.id}`);
  if (!configuration(saved) || saved.id !== created.id || saved.companyId !== created.companyId || saved.name !== created.name || saved.status !== "idle"
    || current.id !== ready.id || current.companyId !== ready.companyId || current.name !== ready.name || current.lifecycleState !== "ready" || current.status !== "idle"
    || current.lifecycleVersion !== ready.lifecycleVersion || !Array.isArray(current.lifecycleHolds) || current.lifecycleHolds.length || current.lifecycleError
    || saved.updatedAt !== current.updatedAt) throw new Error("Existing import baseline did not retain the same settled public agent/configuration");
  return { existing: current, existingConfiguration: structuredClone(saved) };
}
export function consequentialImportChoice(input: { reply: string; existingId: string; existingName: string; companyId: string; preview: CompanyPortabilityPreviewResult }): boolean {
  const { reply, preview } = input;
  if (!input.existingId || !input.existingName || !input.companyId || preview.targetCompanyId !== input.companyId || preview.errors.length
    || preview.plan.agentPlans.length !== 1 || !preview.plan.agentPlans.some(row => row.existingAgentId === input.existingId && row.action !== "update")) return false;
  const name = input.existingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentioned = new RegExp(`\\b${name}\\b`, "i");
  const conflict = /\b(?:conflicts?|collision|collid(?:e|es|ed|ing)|same name)\b|\balready\s+(?:has|have|exists)\b/i;
  const actualConflict = reply.split(/\n\s*\n/).some(part => mentioned.test(part) && conflict.test(part));
  const question = reply.split(/\n\s*\n/).some(paragraph => [...paragraph.matchAll(/[^\n?]+\?/g)].some(match => {
    // A preceding Morgan collision does not authorize a question about Riley or
    // a project. Bind explicit action objects before allowing import anaphora.
    const sentence = match[0].split(/(?<=[.!])\s+/).at(-1)!.replace(/[*_`]/g, "");
    if (!/\b(?:rename|skip)\b/i.test(sentence) || !/\b(?:choose|want|prefer|should|which|would|existing|this company)\b/i.test(sentence)) return false;
    const objects = [...sentence.matchAll(/\b(?:rename|skip)(?:\s*\/\s*(?:rename|skip)|\s+or\s+(?:rename|skip))?\s+(?:for\s+)?(?:(?:the|an?|this|that)\s+)?(?:incoming\s+)?(?:(?:agent|employee)\s+)?([A-Za-z][A-Za-z0-9_-]*)/gi)]
      .map(row => row[1]!.toLowerCase()).filter(word => !["in", "for", "with", "from", "into", "or", "and"].includes(word));
    const allowed = new Set([input.existingName.toLowerCase(), "it", "them", "agent", "employee", "package", "import"]);
    if (objects.some(object => !allowed.has(object))) return false;
    return mentioned.test(sentence) || /\b(?:incoming\s+(?:agent|employee)|package)\b/i.test(sentence)
      || /\bimport(?:ing)?\b/i.test(sentence) && /\b(?:this|existing|current)\s+company\b/i.test(sentence)
      || mentioned.test(paragraph) && conflict.test(paragraph)
      || objects.length > 0 && objects.every(object => ["it", "them"].includes(object)) && actualConflict;
  }));
  const falseImported = /\b(?:I|we)(?:(?:['’]ve|\s+have)\s+|\s+)(?:already\s+)?(?:imported|replaced|overwrote)\b(?!\s+(?:nothing|none|no\b))|\b(?:the\s+)?package\s+(?:was|is|has\s+been)\s+(?:already\s+)?(?:imported|replaced|overwritten)\b|\b(?:import|replacement)\s+(?:is\s+)?(?:done|completed)\b/i.test(reply);
  return actualConflict && question && !falseImported;
}
