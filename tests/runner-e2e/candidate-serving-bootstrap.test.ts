import { it, expect, vi } from "vitest";
import { establishPublicMcpSession } from "./public-mcp-flow.js";
import { candidateFirstHumanAdmission } from "./candidate-serving-proof.js";
import { createHash } from "node:crypto";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
it("uses the actual ordinary first-human bootstrap without creating company, agent or model work", async () => {
  const events: string[] = []; let signedIn = false, admin = false, signup = 0, cookies = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (url !== "http://127.0.0.1:3100/api/auth/sign-up/email" || init.method !== "POST") throw new Error("Unexpected bootstrap network action");
    signup++; events.push("signup"); return { ok: true, json: async () => ({ user: { id: "synthetic-human" } }), headers: { getSetCookie: () => ["synthetic_session=synthetic-private-cookie; Path=/"] } };
  });
  const api = { baseURL: "http://127.0.0.1:3100", setBrowserSession: () => { signedIn = true; },
    post: async (url: string) => { if (url !== "/api/bootstrap/claim" || !signedIn) throw new Error("Unexpected bootstrap authority"); admin = true; events.push("claim"); return { claimed: true }; },
    patch: async (url: string, data: { enablePublicMcp?: boolean }) => { if (!admin || url !== "/api/instance/settings/experimental" || data.enablePublicMcp !== true) throw new Error("Unexpected bootstrap setting"); events.push("existing-public-mcp-setting"); },
  };
  const page = { context: () => ({ addCookies: async () => { cookies++; } }) }, secrets: string[] = [];
  const witness = { schema: "candidate.serving.verified.v1", child: {} as never, supervisor: {} as never, childReceiptSha256: hash("child"), supervisorReceiptSha256: hash("supervisor"), sourceManifestSha256: hash("manifest") };
  try {
    const result = await candidateFirstHumanAdmission({ identity: async () => { events.push("identity"); return witness; },
      bootstrap: () => establishPublicMcpSession(api as never, page as never, secrets),
      authenticatedDirectory: async () => { if (!signedIn || !admin) throw new Error("Board access required"); events.push("authenticated-company-directory"); return { userId: "synthetic-human", companies: [] }; },
      release: async () => { events.push("release"); },
    });
    expect(events).toEqual(["identity", "signup", "claim", "existing-public-mcp-setting", "authenticated-company-directory", "identity", "release"]);
    expect(signup).toBe(1); expect(cookies).toBe(1); expect(secrets.length).toBe(2); expect(result.userId).toBe("synthetic-human");
  } finally { vi.unstubAllGlobals(); }
});
