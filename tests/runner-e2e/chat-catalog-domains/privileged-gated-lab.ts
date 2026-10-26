import { expect } from "@playwright/test";
import { checks } from "./internal-support.js";
import { privilegedDefinition, privilegedObservation, settlePrivilegedChat } from "./privileged-support.js";
import { startOwnedProductionUi } from "./privileged-production-ui.js";

export function gradeGatedLab(value: unknown) {
  const c = checks(), o = privilegedObservation(value);
  c.add("production-route-observation", !!o, "A real production build must deny the historical developer route."); if (!o) return c.result();
  c.add("clear-development-only-boundary", /dev(?:elopment)?[- ]only|local.{0,30}(?:checkout|development)|owned checkout/i.test(o.reply)
    && /task-chat-lab|TaskChatLab/i.test(o.reply) && /pnpm dev|dev\/task-chat-lab|checkout/i.test(o.reply)
    && !/not\s+(?:a\s+)?(?:dev|development)[- ]only/i.test(o.reply)
    && !/\b(?:I(?:'ve| have)? (?:opened|enabled)|it is enabled|the lab is available)\b[^.\n]{0,35}(?:in|on) production/i.test(o.reply),
    "The actual reply identifies the development-only limitation and the appropriate checkout path without claiming the old route is a production feature.");
  c.add("actual-production-build-gate", typeof o.state.productionBuildSha256 === "string" && o.state.productionBuildSha256.length === 64
    && o.state.productionHeaderMatched === true && o.state.labAbsent === true && o.state.notFoundVisible === true,
    "A fresh source-built production bundle serves the browser; it displays the real not-found state instead of the disabled lab.");
  c.add("historical-link-not-redirected", o.state.historicalPath === o.state.finalProductionPath && o.state.unrelatedTaskAbsent === true,
    "The historical route remains explicit and does not silently open unrelated production work.");
  return c.result();
}
const gated = privilegedDefinition("developer-labs.gated-lab", "privileged-gated-lab", {
  async setup() { return {}; },
  async act(ctx, state) {
    await settlePrivilegedChat(ctx);
    const target = await startOwnedProductionUi(ctx), page = ctx.input.page, source = page.url();
    try {
      const historicalPath = `/${ctx.input.fixtures.company.issuePrefix}/dev/task-chat-lab`;
      const response = await page.goto(target.origin + historicalPath, { waitUntil: "domcontentloaded" });
      state.productionHeaderMatched = response?.headers()["x-eval-production-ui-build"] === target.buildSha256;
      await expect(page.getByRole("heading", { name: /not found|page.*exist|couldn.*find/i }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Task Chat Lab", exact: true })).toHaveCount(0);
      state.productionBuildSha256 = target.buildSha256; state.notFoundVisible = true; state.labAbsent = true;
      state.productionSourceRevision = target.sourceRevision;
      state.historicalPath = historicalPath; state.finalProductionPath = new URL(page.url()).pathname;
      state.unrelatedTaskAbsent = await page.getByTestId("task-chat-composer-input").count() === 0;
      await ctx.input.evidence("chat-catalog-production-lab-gate.json", { ...state, files: target.files, proof: "production build; no second database or provider" });
      await ctx.input.capture("production-lab-gate", "Real production build excludes developer lab", "production-lab-gate.png");
    } finally { try { await page.goto(source, { waitUntil: "domcontentloaded" }); } finally { await target.stop(); } }
  }, grade: gradeGatedLab,
  async verifyResult(ctx) { await expect(ctx.input.page.getByTestId("task-chat-composer-input")).toBeVisible(); },
});
gated.attemptTimeoutMs = 600_000;
gated.sourceFiles = [...gated.sourceFiles, "chat-catalog-domains/privileged-production-ui.ts", "../../ui/vite.config.ts", "../../ui/src/App.tsx", "../../ui/src/pages/NotFound.tsx"];
export const privilegedGatedLabCases = [gated];
