import { describe, expect, it } from "vitest";
import type { SubscriptionAccountReport, SubscriptionCostReport, SubscriptionUsage } from "../../../packages/shared/src/subscriptions.js";
import type { IdentityObservation } from "./identity-support.js";
import { subscriptionIdentityCases } from "./identity-subscriptions.js";
const usage: SubscriptionUsage = { inputTokens: 10, cachedInputTokens: 0, outputTokens: 1, costCents: "0", eventCount: 1, estimatedEventCount: 0, unpricedEventCount: 0 };
function account(id: string): SubscriptionAccountReport { return { id, provider: "openai", name: id, ownerUserId: "person", ownerName: "Actual owner", shared: false, identityVerified: false, detectedPlan: null, observedAt: null, lastCheckedAt: null, refreshStatus: null, canEdit: true,
  price: { revision: 1, plan: "User recorded plan", amountCents: "2000", monthlyCents: "2000", currency: "USD", cadence: "month", status: "active", source: "user", sourceUrl: null, effectiveAt: "2026-10-01T00:00:00Z" }, usage, agents: [] }; }
function report(accounts: SubscriptionAccountReport[]): SubscriptionCostReport { return { accounts, canRefresh: true, asOf: "2026-10-26T00:00:00Z", monthlyTotals: [{ currency: "USD", amountCents: String(accounts.length * 2000), estimatedCount: 0 }], activeCount: accounts.length, unknownPriceCount: 0, unidentifiedAccountCount: 0, api: usage, subscription: usage, unknown: usage, unattributedSubscription: usage }; }
function valid(): IdentityObservation { const pair = [account("source"), account("target")]; return { scenarioId: "budgets-costs.subscription-fees", origin: "http://fixture.invalid", companyId: "company", leadId: "ceo", company: { id: "company" }, companies: [], agents: [], tasks: [], projects: [], goals: [], comments: [], documents: [], revisions: [], interactions: [], humanQueries: [], runs: [],
  reply: "Open the subscription view to verify account ownership and the same paid seat. You can link duplicate records there. Tokens and recorded API usage do not establish the subscription fee.", links: ["/ACO/activity/costs"],
  activity: [{ id: "price", action: "subscription.price_updated", entityId: "source", details: { revision: 1 } }, { id: "link", action: "subscription.linked", entityId: "source", actorType: "user", actorId: "person", details: { targetId: "target" } }],
  state: { personId: "person", duplicateAccounts: pair, beforeReport: report(pair), afterReport: report([pair[1]!]), sameAccountProvenanceVerified: true, provenanceOrigin: "genuine-owned-provider-history", agentReadStatus: 403, agentLinkStatus: 403, noPreHumanMutation: true, humanLinkStatus: 200, ownershipVisible: true, linkDisclosureVisible: true, priceHistoryBefore: [{ id: "price", entityId: "source", details: { revision: 1 } }], archivedPriceHistoryVerified: true } }; }
describe("subscription duplicate contract is explicitly partial", () => {
  const d = subscriptionIdentityCases[0]!;
  it("full intended evidence calibrates; missing evidence fails", () => { const o = valid(); expect(d.grade(o), JSON.stringify(d.grade(o))).toMatchObject({ passed: true }); expect(d.grade(undefined).passed).toBe(false); expect(d.coverageGaps?.length).toBeGreaterThan(0); });
  it("two owned same-provider records do not prove ONE account", () => { const o = valid(); o.state.sameAccountProvenanceVerified = false; expect(d.grade(o).passed).toBe(false); });
  it("fabricated provenance is rejected", () => { const o = valid(); o.state.provenanceOrigin = "generated-fingerprint"; expect(d.grade(o).passed).toBe(false); });
  it("wrong actual owner fails even after successful human link", () => { const o = valid(); (o.state.duplicateAccounts as SubscriptionAccountReport[])[1]!.ownerUserId = "another-person"; expect(d.grade(o).passed).toBe(false); });
  it("deleting historical receipts cannot masquerade as deduplication", () => { const o = valid(); o.activity = o.activity.filter(row => row.id !== "price"); expect(d.grade(o).passed).toBe(false); });
  it("current target price alone cannot establish archived price preservation", () => { const o = valid(); o.state.archivedPriceHistoryVerified = false; expect(d.grade(o).passed).toBe(false); });
  it("ordinary agent merge or false fee calculation fails", () => { const o = valid(); o.state.agentLinkStatus = 200; o.reply += " I have merged them."; expect(d.grade(o).passed).toBe(false); });
});
