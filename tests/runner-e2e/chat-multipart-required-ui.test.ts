import { expect, it, vi } from "vitest";
vi.mock("@playwright/test", () => ({ expect: (target: { isDisabled?: () => boolean; isVisible?: () => boolean }) => ({
  toBeDisabled: async () => { if (!target.isDisabled?.()) throw new Error("Expected actual disabled Next"); },
  toBeVisible: async () => { if (!target.isVisible?.()) throw new Error("Expected current first question visible"); },
}) }));
import { questionIdentityCases } from "./chat-catalog-domains/identity-questions-and-approvals.js";
import type { ChatCatalogContext } from "./chat-catalog-contract.js";
function fixture(options: { nextEnabled?: boolean; wrongPrompt?: boolean; changedPayload?: boolean; prematurelyResolved?: boolean } = {}) {
  let page = 0, answered = false, reads = 0, submitted = false;
  const clicks: string[] = [], answers: Record<string, string> = {};
  const original = { id: "question", kind: "ask_user_questions", status: "pending", payload: { questionSet: { questions: [
    { id: "audience", prompt: "Who is the audience?", required: true }, { id: "tone", prompt: "What tone should we use?", required: true }, { id: "headline", prompt: "What is your custom headline?", required: true },
  ] } } };
  const form: any = { isVisible: () => true, getByText: (prompt: string) => ({ isVisible: () => !options.wrongPrompt && prompt === original.payload.questionSet.questions[page]?.prompt }),
    getByRole: (_role: string, { name }: { name: string | RegExp }) => ({
      isDisabled: () => !options.nextEnabled && !answered,
      isChecked: () => answers.audience === "Researchers",
      click: async () => { const label = String(name); clicks.push(label);
        if (label === "Next") { if (!answered) throw new Error("Disabled Next cannot be clicked"); page++; answered = !!answers[original.payload.questionSet.questions[page]?.id ?? ""]; }
        else if (label === "Back") { page--; answered = !!answers[original.payload.questionSet.questions[page]!.id]; }
        else if (label === "Researchers" || label === "Clear") { answers[original.payload.questionSet.questions[page]!.id] = label; answered = true; }
        else { if (page !== 2 || !answers.headline) throw new Error("Cannot submit incomplete questions"); submitted = true; }
      },
    }),
    getByTestId: () => ({ isVisible: async () => page === 2, locator: () => ({ first: () => ({ fill: async (value: string) => { answers.headline = value; } }) }) }),
  };
  const ctx = { issue: () => ({ id: "source", conversationState: "waiting" }), refreshIssue: async () => {}, allRuns: async () => [{ status: "succeeded" }],
    input: { fixtures: { company: { id: "company" } }, page: { locator: () => ({ click: async () => {} }), getByTestId: () => form }, api: { get: async (url: string) => {
      if (url.endsWith("interactions")) { reads++; return [{ ...original, status: options.prematurelyResolved ? "resolved" : "pending", payload: options.changedPayload && reads >= 2 ? { replaced: true } : original.payload }]; }
      return [];
    } } },
  } as unknown as ChatCatalogContext;
  return { ctx, state: { original, answer: "Acorn unchanged human answer" } as Record<string, unknown>, clicks, answers, submitted: () => submitted };
}
it("actual multipart act observes required blocking without clicking disabled Next, retains earlier choice and submits the exact supplied answer", async () => {
  const f = fixture(), c = questionIdentityCases.find(row => row.scenarioId === "questions-and-approvals.multi-part-question")!;
  await c.act!(f.ctx, f.state);
  expect(f.state.validationObserved).toBe(true); expect(f.state.retainedAudience).toBe(true); expect(f.state.unsubmittedPending).toBe(true);
  expect(f.clicks).toEqual(["Researchers", "Next", "Back", "Next", "Clear", "Next", "/^(Submit|Send) answers$/"]);
  expect(f.answers).toEqual({ audience: "Researchers", tone: "Clear", headline: "Acorn unchanged human answer" }); expect(f.submitted()).toBe(true);
});
it.each([{ nextEnabled: true }, { wrongPrompt: true }, { changedPayload: true }, { prematurelyResolved: true }])("rejects invalid current required-question proof %j before any answer", async options => {
  const f = fixture(options), c = questionIdentityCases.find(row => row.scenarioId === "questions-and-approvals.multi-part-question")!;
  await expect(c.act!(f.ctx, f.state)).rejects.toThrow(); expect(f.clicks).toEqual([]); expect(f.submitted()).toBe(false);
});
