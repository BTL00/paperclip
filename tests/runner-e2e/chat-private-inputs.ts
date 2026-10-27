import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CREDENTIAL_NAMES, type CredentialName, type MatrixExecution } from "./types.js";
import type { ChatCatalogDescriptor } from "./chat-catalog-registry.js";

export const CHAT_PRIVATE_INPUTS_ENV = "PAPERCLIP_CHAT_PRIVATE_INPUTS";
const externalConfigEnv = "PAPERCLIP_CHAT_CATALOG_EXTERNAL_CONFIG";
export interface ChatExternalInputRequirement { provider: "notion" | "slack" | "agentmail" | "vault" | "github"; fields: readonly string[] }
export interface ChatPrivateInputs {
  readonly credentials: Readonly<Partial<Record<CredentialName, string>>>;
  read(name: string): string | undefined;
  configuration(name: "external-provider"): unknown;
}
interface PrivateEnvelope { version: 1; executionId: string; credentials: Partial<Record<CredentialName, string>>; references: Record<string, string>; external?: unknown }
function readPrivateJson(filename: string, ownedRoot?: string): unknown {
  const info = lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || info.size > 262144
    || (ownedRoot && !realpathSync(filename).startsWith(realpathSync(ownedRoot) + path.sep)))
    throw new Error("Selected-case inputs require a bounded private0600 owned file; contents withheld");
  try { return JSON.parse(readFileSync(filename, "utf8")); } catch { throw new Error("Selected-case private inputs are invalid; contents withheld"); }
}
export function chatPrivateInputRequirements(descriptor?: Pick<ChatCatalogDescriptor, "requiredCredentials" | "externalInput">) {
  const credentialNames = [...new Set(descriptor?.requiredCredentials ?? [])].sort();
  if (credentialNames.some(name => !CREDENTIAL_NAMES.includes(name))) throw new Error("Unknown selected-case credential name");
  const external = descriptor?.externalInput;
  if (external && (!["notion", "slack", "agentmail", "vault", "github"].includes(external.provider)
    || !external.fields.length || external.fields.some(field => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field)))) throw new Error("Invalid selected external configuration requirements");
  const requirements = { credentialNames, external: external ? { provider: external.provider, fields: [...external.fields].sort() } : null };
  return { ...requirements, digest: createHash("sha256").update(JSON.stringify(requirements)).digest("hex") };
}
export function stageChatPrivateInputs(input: { execution: MatrixExecution; descriptor?: Pick<ChatCatalogDescriptor, "requiredCredentials" | "externalInput">; privateDir: string; env: NodeJS.ProcessEnv; secrets: string[] }) {
  const requirements = chatPrivateInputRequirements(input.descriptor);
  const envelope: PrivateEnvelope = { version: 1, executionId: input.execution.id, credentials: {}, references: {} };
  for (const name of requirements.credentialNames) {
    const value = input.env[name]?.trim(); if (!value) throw new Error(`Missing selected-case credential ${name}`);
    envelope.credentials[name] = value; input.secrets.push(value);
  }
  if (requirements.external) {
    const ref = input.env[externalConfigEnv]; if (!ref) throw new Error("Missing selected-case private external configuration");
    const config = readPrivateJson(ref) as { schemaVersion?: number; providers?: Record<string, { disposable?: boolean; resourceIds?: string[]; credentialEnv?: string[]; prerequisites?: Record<string, string> }> };
    const binding = config.schemaVersion === 1 ? config.providers?.[requirements.external.provider] : undefined;
    if (!binding || binding.disposable !== true || !Array.isArray(binding.resourceIds) || !binding.resourceIds.length
      || !Array.isArray(binding.credentialEnv) || !binding.credentialEnv.length || !binding.prerequisites
      || requirements.external.fields.some(field => !binding.prerequisites?.[field])) throw new Error("Selected disposable external configuration lacks declared prerequisites; contents withheld");
    const selected = { disposable: true, resourceIds: binding.resourceIds, credentialEnv: binding.credentialEnv,
      prerequisites: Object.fromEntries(requirements.external.fields.map(field => [field, binding.prerequisites![field]])) };
    const names = [...binding.credentialEnv, ...requirements.external.fields.filter(field => field.endsWith("Env")).map(field => binding.prerequisites![field]!)];
    for (const name of new Set(names)) {
      if (!/^PAPERCLIP_CHAT_EVAL_[A-Z0-9_]+$/.test(name)) throw new Error("External credential reference is not a declared private environment name");
      const value = input.env[name]?.trim(); if (!value) throw new Error(`Missing selected external environment reference ${name}`);
      envelope.references[name] = value; input.secrets.push(value);
    }
    envelope.external = { schemaVersion: 1, providers: { [requirements.external.provider]: selected } };
  }
  const filename = path.join(input.privateDir, "chat-selected-inputs.json");
  writeFileSync(filename, JSON.stringify(envelope), { mode: 0o600, flag: "wx" });
  return { filename, requirements };
}
export function readChatPrivateInputs(executionId: string, secrets: string[], env: NodeJS.ProcessEnv = process.env): ChatPrivateInputs {
  const reference = env[CHAT_PRIVATE_INPUTS_ENV], root = env.PAPERCLIP_RUNNER_E2E_TEMP_ROOT;
  if (!reference) return { credentials: Object.freeze({}), read: () => undefined, configuration: () => undefined };
  if (!root) throw new Error("Selected private input ownership root is missing");
  const envelope = readPrivateJson(reference, root) as PrivateEnvelope;
  if (envelope.version !== 1 || envelope.executionId !== executionId || !envelope.credentials || !envelope.references)
    throw new Error("Private inputs belong to another execution; contents withheld");
  for (const value of [...Object.values(envelope.credentials), ...Object.values(envelope.references)]) {
    if (typeof value !== "string" || !value.trim()) throw new Error("Invalid private credential value; contents withheld");
    secrets.push(value);
  }
  return { credentials: Object.freeze(envelope.credentials), read: name => envelope.references[name] ?? envelope.credentials[name as CredentialName],
    configuration: name => name === "external-provider" ? envelope.external : undefined };
}
export function scrubChatPrivateEnvironment(env: NodeJS.ProcessEnv, executions: readonly MatrixExecution[], removeReference = false) {
  for (const key of Object.keys(env)) if (key.startsWith("PAPERCLIP_CHAT_EVAL_") || key === externalConfigEnv || removeReference && [CHAT_PRIVATE_INPUTS_ENV, "PAPERCLIP_CHAT_INSTALLED_PLAN", "PAPERCLIP_CHAT_OPERATOR_INSTALL_RECEIPT", "PAPERCLIP_CHAT_INSTALLED_SOURCE_CONFIG"].includes(key)) delete env[key];
  if (executions.length) {
    const profileNames = new Set(executions.flatMap(execution => [execution.profile.credential, execution.environment.credential].filter(Boolean)));
    for (const name of CREDENTIAL_NAMES) if (!profileNames.has(name)) delete env[name];
  }
  return env;
}
/** Public fingerprint projection contains reference names and field names only. */
export function chatPrivateInputNameIdentity(executionId: string, env: NodeJS.ProcessEnv = process.env) {
  const reference = env[CHAT_PRIVATE_INPUTS_ENV], root = env.PAPERCLIP_RUNNER_E2E_TEMP_ROOT;
  if (!reference) return null;
  if (!root) throw new Error("Selected private input ownership root is missing");
  const envelope = readPrivateJson(reference, root) as PrivateEnvelope;
  if (envelope.executionId !== executionId) throw new Error("Private input identity belongs to another execution");
  const external = envelope.external as { providers?: Record<string, { prerequisites?: Record<string, unknown> }> } | undefined;
  return { credentialNames: Object.keys(envelope.credentials).sort(), referenceNames: Object.keys(envelope.references).sort(),
    externalRequirements: Object.entries(external?.providers ?? {}).map(([provider, binding]) => ({ provider, fields: Object.keys(binding.prerequisites ?? {}).sort() })) };
}
