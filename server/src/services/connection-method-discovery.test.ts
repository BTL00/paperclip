import { describe, it, expect } from "vitest";
import { getConnectableAppDefinition } from "@paperclipai/shared";
import {
  credentialSourceSelectionInstruction,
  connectionMethodDiscoveryMetadata,
  connectionSetupAdviceInstruction,
} from "./connection-method-discovery.js";
import {
  vercelConnectIntegrationStatus,
  vercelConnectSetupAvailability,
} from "./vercel-connect.js";
const notion = getConnectableAppDefinition("notion")!.methods.find(
  (m) => m.key === "mcp-oauth",
)!;
describe("reviewed connection setup discovery", () => {
  it("preserves the actual Notion method and unavailable prerequisite missing from the captured search flow", () => {
    const availability = vercelConnectSetupAvailability(
      vercelConnectIntegrationStatus({}),
    );
    const result = {
      key: notion.key,
      auth: notion.auth,
      ...connectionMethodDiscoveryMetadata(
        notion,
        "notion",
        "ACORN",
        availability,
      ),
    };
    expect(result).toMatchObject({
      key: "mcp-oauth",
      auth: "oauth",
      whenToUse: "Use the provider-hosted connection for the quickest setup.",
      setupPath: "/ACORN/apps/connect?source=notion&method=mcp-oauth",
      credentialSources: [
        {
          source: "vercel_connect",
          available: false,
          reason:
            "Vercel Connect setup is disabled on this Paperclip instance.",
        },
      ],
    });
    expect(connectionSetupAdviceInstruction).not.toContain(
      "user already asked to connect",
    );
  });
  it("directs advice to comparison before setup and retains explicit setup's real connection_request path", () => {
    expect(connectionSetupAdviceInstruction).toContain(
      "For setup advice or comparison, explain",
    );
    expect(connectionSetupAdviceInstruction).toContain(
      "If the user explicitly requests setup or selects a method, call connection_request",
    );
    expect(connectionSetupAdviceInstruction).toContain(
      "Search alone does not authorize",
    );
  });
  it("explains the unsupported task-bound source selection without widening access or silently starting OAuth", () => {
    expect(credentialSourceSelectionInstruction).toContain("Task-bound credential-source selection is not supported");
    expect(credentialSourceSelectionInstruction).toContain("do not send a standalone setup link");
    expect(credentialSourceSelectionInstruction).toContain("Do not silently substitute ordinary OAuth");
    expect(credentialSourceSelectionInstruction).toContain("only if the user instead selects ordinary setup");
    const metadata = connectionMethodDiscoveryMetadata(notion, "notion", "ACORN", {
      available: true, reason: null,
    });
    expect(metadata.credentialSources?.[0]).toMatchObject({ available: true, reason: null });
    expect(metadata.credentialSources?.[0]).not.toHaveProperty("setupPath");
    expect(connectionSetupAdviceInstruction).toContain(credentialSourceSelectionInstruction);
  });
  it("does not advertise a reviewed source for an unrelated service", () => {
    expect(connectionMethodDiscoveryMetadata(notion, "unrelated", "ACORN", {
      available: true, reason: null,
    })).not.toHaveProperty("credentialSources");
  });
  it("uses the board catalog's actual disabled, missing-credential and available states without exporting credentials", () => {
    for (const [env, available, reason] of [
      [{}, false, /disabled/],
      [{ PAPERCLIP_VERCEL_CONNECT_ENABLED: "true" }, false, /workload OIDC/],
      [
        {
          PAPERCLIP_VERCEL_CONNECT_ENABLED: "true",
          PAPERCLIP_VERCEL_CONNECT_ACCESS_TOKEN: "private-test-value",
        },
        true,
        null,
      ],
    ] as const) {
      const status = vercelConnectSetupAvailability(
        vercelConnectIntegrationStatus(env),
      );
      expect(status.available).toBe(available);
      if (reason) expect(status.reason).toMatch(reason);
      else expect(status.reason).toBeNull();
      expect(
        JSON.stringify(
          connectionMethodDiscoveryMetadata(notion, "notion", "ACORN", status),
        ),
      ).not.toContain("private-test-value");
    }
  });
  it("never fabricates a credential source for an unreviewed method, nor copies arbitrary configuration", () => {
    const method = {
      ...notion,
      credentialSources: undefined,
      defaults: { serverUrl: "https://example.test/?secret=private-value" },
      guidanceMd: "private-value",
      credentialFields: [{ key: "private-value" }],
    } as unknown as typeof notion;
    const result = connectionMethodDiscoveryMetadata(
      method,
      "notion",
      "ACORN",
      { available: false, reason: "disabled" },
    );
    expect(result).not.toHaveProperty("credentialSources");
    expect(JSON.stringify(result)).not.toContain("private-value");
  });
  it("binds paths to the active company and retains reviewed service/method identity", () => {
    const a = connectionMethodDiscoveryMetadata(notion, "notion", "ACORN", {
      available: true,
      reason: null,
    });
    const b = connectionMethodDiscoveryMetadata(notion, "notion", "OTHER", {
      available: true,
      reason: null,
    });
    expect(a.setupPath).toMatch(/^\/ACORN\//);
    expect(b.setupPath).toMatch(/^\/OTHER\//);
    expect(
      new URL(a.setupPath!, "http://test.invalid").searchParams.get("method"),
    ).toBe(notion.key);
  });
});
