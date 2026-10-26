import { observation, checks } from "./internal-support.js";
import { projectsCases } from "./internal-projects.js";
import { tasksCases } from "./internal-tasks.js";
import { goalsCases } from "./internal-goals.js";
import { documents_artifactsCases } from "./internal-documents-artifacts.js";
import { activityCases } from "./internal-activity.js";
import { inboxSearchCases } from "./internal-inbox-search.js";
import { agentFeedbackCases } from "./internal-agent-feedback.js";
import { decisionSearchCases } from "./internal-decision-search.js";
import { designSearchCases } from "./internal-design-search.js";
import { inboxTriageCases } from "./internal-inbox-triage.js";

export const internalChatCatalogCases = [
  ...projectsCases,
  ...tasksCases,
  ...goalsCases,
  ...documents_artifactsCases,
  ...activityCases,
  ...inboxSearchCases,
  ...inboxTriageCases,
  ...designSearchCases,
  ...decisionSearchCases,
  ...agentFeedbackCases,
];
export function gradeInternal(value: unknown) {
  const o = observation(value);
  const definition = o && internalChatCatalogCases.find(row => row.scenarioId === o.scenarioId);
  if (definition) return definition.grade(value);
  const c = checks(); c.add("implemented-scenario", false, "Missing observation or unimplemented scenario cannot pass."); return c.result();
}
