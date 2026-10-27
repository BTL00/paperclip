import { withRestoreConcurrency } from "./internal-restore-concurrency.js";
import { projectMarkdownToText, resolveProjectionRange, createDocumentAnchorSelector } from "../../../packages/shared/src/document-anchors.js";
import type { ChatCatalogCase } from "../chat-catalog-contract.js";
import { privateDownloadCases } from "./internal-private-download.js";
import { project, task, goal, putDocument, entity, observation, checks, hasLink, sameTask, type Entity } from "./internal-support.js";
import { makeDefinition, retryDefinition, fixtureWorker } from "./internal-definition.js";
import { selectDocumentSource } from "./internal-document-context.js";
import type { IssueDocument } from "../../../packages/shared/src/types/issue.js";

export function grade_documents_artifacts(value: unknown) {
  const c = checks(); const o = observation(value);
  c.add("complete-independent-observation", !!o, "Missing API, document, audit or rendered-link evidence cannot pass.");
  if (!o) return c.result();
  const before = o.state.task ? entity(o.state, "task") : undefined;
  const current = before && o.tasks.find(row => row.id === before.id);
  const savedProject = o.state.project ? entity(o.state, "project") : undefined;
  const projectNow = savedProject && o.projects.find(row => row.id === savedProject.id);
  const authored = (action: string, id: string) => o.activity.some(row => row.action === action && row.entityId === id && row.agentId === o.leadId);
  const linkedTask = () => !!current && hasLink(o, "issues", current);
  switch (o.scenarioId) {
    case "documents-artifacts.write-plan": {
      const plans = o.documents.filter(row => row.key === "plan"); const plan = plans[0];
      c.add("saved-implementation-plan", plans.length === 1 && !!plan && !!plan.latestRevisionId && meaningfulOrchidPlan(plan.body ?? ""), "A durable plan reflects the website's actual prerequisite brief and verification, rather than merely chat prose.");
      c.add("versioned-author", !!plan && o.revisions.some(row => row.id === plan.latestRevisionId && row.body === plan.body && row.createdByAgentId === o.leadId
        && o.runs.some(run => run.id === row.createdByRunId)), "The current document revision is attributed to this real agent run.");
      c.add("plan-audit", !!before && authored("issue.document_created", before.id), "The API audit records the CEO creating the plan after the request.");
      c.add("task-context-and-link", !!before && sameTask(before, current) && linkedTask(), "Saving a plan preserves the task and makes the saved plan reachable through its task.");
      break;
    }
    case "documents-artifacts.resolve-feedback": {
      const target = entity(o.state, "pricingThread"); const sibling = entity(o.state, "siblingThread");
      const annotation = o.annotations?.find(row => row.id === target.id); const unrelated = o.annotations?.find(row => row.id === sibling.id);
      const plan = o.documents.find(row => row.key === "plan");
      c.add("substantive-pricing-fix", !!plan && /\$19/.test(plan.body ?? "") && /\b(?:monthly|month)\b/i.test(plan.body ?? "")
        && /\bteam\b/i.test(plan.body ?? "") && /\b(?:total|entire|whole|per team|for the team)\b/i.test(plan.body ?? "")
        && !/\b(?:per|each)\s+(?:user|person|seat)\b/i.test(plan.body ?? "") && (plan.body ?? "").includes(String(o.state.supportText)),
        "The actual current document unambiguously preserves $19 monthly total for the team and unrelated support content.");
      c.add("correct-thread-resolved", annotation?.status === "resolved" && annotation.resolvedByAgentId === o.leadId
        && unrelated?.status === "open" && annotation.documentId === plan?.id && annotation.originalRevisionId === o.state.originalRevisionId,
        "Only the anchored pricing annotation is resolved by the CEO, preserving its original document and revision relationship.");
      const edited = o.activity.find(row => row.action === "issue.document_updated" && row.agentId === o.leadId);
      const resolved = o.activity.find(row => row.action === "issue.document_annotation_thread_resolved" && row.agentId === o.leadId && row.details?.threadId === target.id);
      c.add("edit-before-resolution", !!edited && !!resolved && Date.parse(edited.createdAt ?? "") <= Date.parse(resolved.createdAt ?? "")
        && !!plan && o.revisions.some(row => row.id === plan.latestRevisionId && row.createdByAgentId === o.leadId && row.body === plan.body),
        "Saved revision and independent audit events establish the substantive edit before resolution.");
      c.add("task-and-document-access", !!before && sameTask(before, current) && linkedTask(), "Chat links the changed document's task without modifying task execution.");
      break;
    }
    case "documents-artifacts.restore-document": {
      const plan = o.documents.find(row => row.key === "plan"); const revisions = o.state.originalRevisions as Entity[];
      const previous = revisions?.[1];
      c.add("restored-exact-previous-bytes", !!previous && !!plan && plan.body === previous.body && plan.latestRevisionId !== previous.id
        && plan.latestRevisionId !== revisions[2]?.id, "Restoration creates a new current revision with the exact second revision's contents.");
      c.add("retained-history", Array.isArray(revisions) && revisions.length === 3 && o.revisions.length === 4
        && revisions.every(original => o.revisions.some(row => row.id === original.id && row.body === original.body)), "All three historical revisions remain unmodified alongside the restoration.");
      c.add("restore-path-attribution", !!before && o.activity.some(row => row.action === "issue.document_restored" && row.entityId === before.id
        && row.agentId === o.leadId && row.details?.restoredFromRevisionId === previous?.id), "An independently observed restore audit identifies the exact source revision.");
      c.add("no-execution-rewind", !!before && sameTask(before, current) && /\b(?:revision|version)\b/i.test(o.reply), "Chat identifies a document revision and leaves task execution unchanged.");
      break;
    }
    default: c.add("implemented-scenario", false, "No independent oracle is implemented for this scenario.");
  }
  return c.result();
}

const define = (id: string, setup: ChatCatalogCase["setup"]) => makeDefinition(id, setup, grade_documents_artifacts);
export const documents_artifactsCases: readonly ChatCatalogCase[] = [
  ...privateDownloadCases,
  resolveFeedback(),
  define("documents-artifacts.write-plan", async ctx => {
    const p = await project(ctx); const requirement = "Orchid";
    const t = await task(ctx, "Website task", p.id, { assigneeAgentId: ctx.input.fixtures.agent.id,
      description: `Build a single-page website for ${requirement}, with accessible signup and responsive layout. Verify keyboard navigation and mobile presentation.` });
    return { project: p, task: t, requirement };
  }),
  withRestoreConcurrency(define("documents-artifacts.restore-document", async ctx => {
    const p = await project(ctx); const t = await task(ctx, "Website task", p.id, { description: "The website task's plan has three saved revisions. The previous version before the last edit is the desired content." });
    const revisions: Entity[] = [];
    for (const body of [`# Plan\nBuild a responsive website for ${ctx.input.nonce}.`, `# Plan\nBuild accessible signup for ${ctx.input.nonce}.\nVerify keyboard operation.`, `# Plan\nReplace signup with an unrelated pricing experiment for ${ctx.input.nonce}.`]) {
      const saved = await putDocument(ctx, t.id, body, revisions.at(-1)?.id ?? null);
      revisions.push({ id: saved.latestRevisionId!, body });
    }
    const document = await ctx.input.api.get<IssueDocument>(`/api/issues/${t.id}/documents/plan`);
    const selectedSource = await selectDocumentSource(ctx, { task: t, document });
    return { project: p, task: t, originalRevisions: revisions, selectedSource };
  })),

];

function resolveFeedback(): ChatCatalogCase {
  const base = define("documents-artifacts.resolve-feedback", async ctx => {
    const p = await project(ctx); const t = await task(ctx, "Website task", p.id);
    const pricing = "Pricing is $19 every month and $19 per user every month.";
    const supportText = `Support is provided by the launch team ${ctx.input.nonce}.`;
    const body = `${pricing}\n\n${supportText}`;
    const doc = await putDocument(ctx, t.id, body);
    const createAnnotation = (quote: string, feedback: string) => {
      const projection = projectMarkdownToText(body);
      const start = projection.text.indexOf(quote);
      const range = resolveProjectionRange(projection, start, start + quote.length);
      if (!range || range.text !== quote) throw new Error("Fixture annotation quote did not resolve through production text projection");
      return ctx.input.api.post<Entity>(`/api/issues/${t.id}/documents/plan/annotations`, {
        baseRevisionId: doc.latestRevisionId, baseRevisionNumber: doc.latestRevisionNumber,
        selector: createDocumentAnchorSelector(projection, range),
        body: feedback,
      });
    };
    const pricingThread = await createAnnotation(pricing, "Clarify that $19 is the monthly total for the team, not per person. Keep the amount and billing cadence.");
    const siblingThread = await createAnnotation(supportText, "Please add a support contact later; leave this unrelated comment open for now.");
    const selectedSource = await selectDocumentSource(ctx, { task: t,
      document: { id: doc.id, key: "plan", latestRevisionId: doc.latestRevisionId! }, annotationId: pricingThread.id });
    return { project: p, task: t, pricingThread, siblingThread, supportText, originalRevisionId: doc.latestRevisionId, selectedSource };
  });
  return { ...base, sourceFiles: [...base.sourceFiles, "../../packages/shared/src/document-anchors.ts"], async observe(ctx, state) {
    const o = await observeInternal(ctx, state);
    return { ...o, annotations: await ctx.input.api.get<Entity[]>(`/api/issues/${entity(state, "task").id}/documents/plan/annotations?status=all&includeComments=true`) };
  } };
}
import { observeInternal } from "./internal-support.js";

export function meaningfulOrchidPlan(body: string): boolean {
  return /\b(?:implement|build|develop)\b/i.test(body) && /\b(?:test|verify|verification|validation)\b/i.test(body)
    && /\bOrchid\b/i.test(body) && /\b(?:single|one)[- ]page\b/i.test(body)
    && /\b(?:signup|sign.up|registration)\b/i.test(body) && /\b(?:accessible|accessibility|labels?|semantic)\b/i.test(body)
    && /\b(?:responsive|breakpoints?)\b/i.test(body) && /\bkeyboard\b/i.test(body) && /\bmobile\b/i.test(body);
}
