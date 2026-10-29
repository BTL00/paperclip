import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Agent } from "../../../packages/shared/src/types/agent.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import type { Request, Response, NextFunction } from "express";
import { updateAgentPermissionsSchema } from "../../../packages/shared/src/validators/agent.js";
import { validate } from "../../../server/src/middleware/validate.js";
import * as team from "./external-team-install.js";
beforeEach(() => vi.stubGlobal("fetch", () => { throw new Error("No network permitted in pure permission controls"); }));
afterEach(() => vi.unstubAllGlobals());
it("actual installer setup sends a valid public permission payload before downstream setup", async () => {
  const stop = new Error("Controlled boundary after validated permission payload");
  const actor = { id: "ceo", companyId: "company", role: "ceo", lifecycleState: "ready", permissions: { canCreateAgents: false, canAssignTasks: true } };
  let writes = 0;
  const ctx = { input: { fixtures: { company: { id: "company" }, agent: { id: "ceo" } }, api: {
    get: async (path: string) => path === "/api/teams/catalog" ? [{ id: "package", slug: "product-engineering", compatibility: "compatible" }] : actor,
    patch: async (path: string, body: unknown) => {
      if (path === "/api/agents/ceo/permissions") {
        const req = { body } as Request;
        validate(updateAgentPermissionsSchema)(req, {} as Response, (() => { writes++; }) as NextFunction);
        expect(req.body).toEqual({ canCreateAgents: true, canAssignTasks: true });
        return { ...actor, permissions: req.body };
      }
      throw stop;
    },
  } } } as unknown as ChatCatalogContext;
  await expect(team.teamInstallExternalCases[0]!.setup(ctx)).rejects.toBe(stop);
  expect(writes).toBe(1);
});

it.each([true, false, undefined])("preserves the stored assignment flag %s without changing other permissions", stored => {
  const actor: Pick<Agent, "id" | "companyId" | "role" | "permissions"> = { id: "ceo", companyId: "company", role: "ceo", permissions: { canCreateAgents: false, canCreateSkills: false, ...(stored === undefined ? {} : { canAssignTasks: stored }), trustPreset: "standard" } };
  const before = structuredClone(actor);
  const payload = team.teamInstallerPermissionPayload(actor, "company", "ceo");
  expect(updateAgentPermissionsSchema.parse(payload)).toEqual({ canCreateAgents: true, canAssignTasks: stored ?? false });
  expect(actor).toEqual(before);
  expect(Object.keys(payload).sort()).toEqual(["canAssignTasks", "canCreateAgents"]);
});
it.each(["foreign-company", "wrong-actor", "not-ceo", "string-flag", "null-flag", "undefined-present"])("rejects %s permission state", kind => {
  const actor: Pick<Agent, "id" | "companyId" | "role" | "permissions"> = { id: "ceo", companyId: "company", role: "ceo", permissions: { canCreateAgents: false, canAssignTasks: true } };
  if (kind === "foreign-company") actor.companyId = "foreign";
  if (kind === "wrong-actor") actor.id = "other";
  if (kind === "not-ceo") actor.role = "engineer";
  if (kind === "string-flag") Object.assign(actor.permissions, { canAssignTasks: "true" });
  if (kind === "null-flag") Object.assign(actor.permissions, { canAssignTasks: null });
  if (kind === "undefined-present") Object.assign(actor.permissions, { canAssignTasks: undefined });
  expect(() => team.teamInstallerPermissionPayload(actor, "company", "ceo")).toThrow();
});
it("the current public schema still rejects the original incomplete payload", () => {
  const result = updateAgentPermissionsSchema.safeParse({ canCreateAgents: true });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues.some(x => x.path.join(".") === "canAssignTasks")).toBe(true);
});
it("actual setup rejects a changed assignment flag on independent readback", async () => {
  const before = { id: "ceo", companyId: "company", role: "ceo", lifecycleState: "ready", permissions: { canCreateAgents: false, canAssignTasks: false } };
  let reads = 0;
  const ctx = { input: { fixtures: { company: { id: "company" }, agent: { id: "ceo" } }, api: {
    get: async (path: string) => path === "/api/teams/catalog" ? [{ id: "package", slug: "product-engineering", compatibility: "compatible" }]
      : ++reads === 1 ? before : { ...before, permissions: { canCreateAgents: true, canAssignTasks: true } },
    patch: async () => ({}),
  } } } as unknown as ChatCatalogContext;
  await expect(team.teamInstallExternalCases[0]!.setup(ctx)).rejects.toThrow("lacks a ready account or creation authority");
  expect(reads).toBe(2);
});

it.each([true, false, undefined])("actual setup preserves %s through the public schema and complete readback", async stored => {
  const stop = new Error("Controlled selected runtime boundary after permission proof");
  const before = { id: "ceo", companyId: "company", role: "ceo", lifecycleState: "ready", permissions: { canCreateAgents: false, canCreateSkills: false, trustPreset: "standard", ...(stored === undefined ? {} : { canAssignTasks: stored }) } };
  const after = { ...before, permissions: { ...before.permissions, canCreateAgents: true, canAssignTasks: stored ?? false } };
  let reads = 0; const evidence = vi.fn(async () => {}), payloads: unknown[] = [];
  const ctx = { input: { fixtures: { company: { id: "company" }, agent: { id: "ceo" } }, evidence,
    get execution() { throw stop; }, api: {
      get: async (path: string) => path === "/api/teams/catalog" ? [{ id: "package", slug: "product-engineering", compatibility: "compatible" }] : ++reads === 1 ? before : after,
      patch: async (path: string, body: unknown) => { if (path.endsWith("/permissions")) { const req = { body } as Request; let validated = false;
        validate(updateAgentPermissionsSchema)(req, {} as Response, (() => { validated = true; }) as NextFunction); expect(validated).toBe(true); payloads.push(req.body); }
        return {}; },
    } } } as unknown as ChatCatalogContext;
  await expect(team.teamInstallExternalCases[0]!.setup(ctx)).rejects.toBe(stop);
  expect(reads).toBe(2); expect(payloads).toEqual([{ canCreateAgents: true, canAssignTasks: stored ?? false }]);
  expect(evidence).toHaveBeenCalledWith("chat-team-install-permission-setup.json", expect.objectContaining({ preservedAssignmentFlag: stored ?? false, allOtherNormalizedStoredPermissionsUnchanged: true, effectiveAssignmentRetainedByUnchangedCeoRole: true }));
});
it("actual setup rejects unrelated permission mutation before runtime selection", async () => {
  const stop = new Error("Unexpected downstream runtime boundary");
  const before = { id: "ceo", companyId: "company", role: "ceo", lifecycleState: "ready", permissions: { canCreateAgents: false, canAssignTasks: false, canCreateSkills: false } };
  let reads = 0;
  const ctx = { input: { fixtures: { company: { id: "company" }, agent: { id: "ceo" } }, evidence: async () => {},
    get execution() { throw stop; }, api: {
      get: async (path: string) => path === "/api/teams/catalog" ? [{ id: "package", slug: "product-engineering", compatibility: "compatible" }]
        : ++reads === 1 ? before : { ...before, permissions: { canCreateAgents: true, canAssignTasks: false, canCreateSkills: true } }, patch: async () => ({}),
    } } } as unknown as ChatCatalogContext;
  await expect(team.teamInstallExternalCases[0]!.setup(ctx)).rejects.toThrow("lacks a ready account or creation authority"); expect(reads).toBe(2);
});
it.each(["other-flag", "extra-grant", "missing-data", "array-order", "foreign-company", "wrong-principal"])("complete normalized readback rejects %s", kind => {
  const before: Pick<Agent, "id" | "companyId" | "role" | "permissions"> = { id: "ceo", companyId: "company", role: "ceo", permissions: { canCreateAgents: false, canCreateSkills: false, custom: { order: ["a", "b"] } } };
  const after: Pick<Agent, "id" | "companyId" | "role" | "permissions"> = { ...before, permissions: { ...structuredClone(before.permissions), canCreateAgents: true, canAssignTasks: false } };
  expect(team.teamInstallerPermissionsRetained(before, after, "company", "ceo")).toBe(true);
  if (kind === "other-flag") after.permissions.canCreateSkills = true;
  if (kind === "extra-grant") Object.assign(after.permissions, { canManageTools: true });
  if (kind === "missing-data") delete after.permissions.custom;
  if (kind === "array-order") after.permissions.custom = { order: ["b", "a"] };
  if (kind === "foreign-company") after.companyId = "foreign";
  if (kind === "wrong-principal") after.id = "other";
  expect(team.teamInstallerPermissionsRetained(before, after, "company", "ceo")).toBe(false);
});
