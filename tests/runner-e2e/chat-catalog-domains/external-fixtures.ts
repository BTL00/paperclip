import { readFileSync, statSync } from "node:fs";

/** Private file contains only explicit disposable-resource allowlists and env
 * names. Credential values belong in the coordinator's child environment. */
export const EXTERNAL_CONFIG_ENV = "PAPERCLIP_CHAT_CATALOG_EXTERNAL_CONFIG";
export type ExternalProvider = "notion" | "slack" | "agentmail" | "vault";
export interface ProviderBinding {
  disposable: true;
  resourceIds: string[];
  credentialEnv: string[];
  prerequisites: Record<string, string>;
}
export interface ExternalFixtureConfig { schemaVersion: 1; providers: Partial<Record<ExternalProvider, ProviderBinding>> }
export const externalRequirements: Record<string, { provider: ExternalProvider; fields: readonly string[] }> = {
  "connection-setup.notion-connected": { provider: "notion", fields: ["workspaceId", "recentPageId", "olderPageId", "mcpUrl"] },
  "connection-setup.notion-missing": { provider: "notion", fields: ["workspaceId", "recentPageId", "oauthBrowserSession"] },
  "connection-setup.notion-wrong-account": { provider: "notion", fields: ["sharedWorkspaceId", "personalWorkspaceId", "personalPageId", "oauthBrowserSession"] },
  "connection-setup.notion-agent-unassigned": { provider: "notion", fields: ["workspaceId", "recentPageId", "mcpUrl"] },
  "connection-setup.notion-expired": { provider: "notion", fields: ["workspaceId", "recentPageId", "expiredAuthorizationEnv", "oauthBrowserSession"] },
  "connection-setup.return-from-login": { provider: "notion", fields: ["workspaceId", "recentPageId", "oauthBrowserSession", "registeredCallbackOrigin"] },
  "connection-setup.save-and-resume": { provider: "notion", fields: ["workspaceId", "recentPageId", "oauthBrowserSession"] },
  "connection-setup.channel-prerequisites": { provider: "slack", fields: ["workspaceId", "channelId", "senderUserId", "registeredWebhookOrigin"] },
  "chat-channels.connect-slack": { provider: "slack", fields: ["workspaceId", "channelId", "senderUserId", "registeredWebhookOrigin"] },
  "chat-channels.link-sender": { provider: "slack", fields: ["workspaceId", "privateChannelId", "senderUserId", "registeredWebhookOrigin"] },
  "chat-channels.reply-in-thread": { provider: "slack", fields: ["workspaceId", "channelId", "originalThreadId", "distractorThreadId", "senderUserId", "registeredWebhookOrigin"] },
  "chat-channels.channel-file": { provider: "slack", fields: ["workspaceId", "channelId", "originalThreadId", "briefFileId", "senderUserId", "registeredWebhookOrigin"] },
  "chat-channels.repair-endpoint": { provider: "slack", fields: ["workspaceId", "channelId", "senderUserId", "expiredAuthorizationEnv", "registeredWebhookOrigin"] },
  "chat-channels.outbound-email": { provider: "agentmail", fields: ["inboxId", "recipient", "draftArtifactId"] },
  "chat-channels.reply-to-email": { provider: "agentmail", fields: ["inboxId", "threadId", "latestMessageId", "earlierMessageId", "recipient"] },
  "secrets.vault-reference": { provider: "vault", fields: ["provider", "vaultId", "secretReference", "consumerId"] },
};
export interface PrerequisiteReceipt { scenarioId: string; provider?: ExternalProvider; configured: boolean; missing: string[] }
export function validateExternalConfig(value: unknown): ExternalFixtureConfig {
  const config = value as ExternalFixtureConfig;
  if (!config || config.schemaVersion !== 1 || !config.providers || typeof config.providers !== "object" || Array.isArray(config.providers)) throw new Error("Invalid external fixture configuration; contents withheld");
  for (const [provider, binding] of Object.entries(config.providers)) {
    if (!["notion", "slack", "agentmail", "vault"].includes(provider) || !binding || binding.disposable !== true
      || !Array.isArray(binding.resourceIds) || !binding.resourceIds.length || binding.resourceIds.some((id: unknown) => typeof id !== "string" || !id.trim())
      || !Array.isArray(binding.credentialEnv) || !binding.credentialEnv.length || binding.credentialEnv.some((name: unknown) => typeof name !== "string" || !/^PAPERCLIP_CHAT_EVAL_[A-Z0-9_]+$/.test(name))
      || !binding.prerequisites || typeof binding.prerequisites !== "object" || Array.isArray(binding.prerequisites)
      || Object.values(binding.prerequisites).some(value => typeof value !== "string" || !value.trim())) throw new Error("Invalid disposable provider binding; contents withheld");
  }
  return config;
}
export function readExternalConfig(env: NodeJS.ProcessEnv = process.env): ExternalFixtureConfig | undefined {
  const path = env[EXTERNAL_CONFIG_ENV]?.trim(); if (!path) return;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 65_536) throw new Error("Not a private bounded file");
    return validateExternalConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch { throw new Error("External fixture config is unavailable, invalid or not private (0600); contents withheld"); }
}
export function externalPrerequisiteReceipt(scenarioId: string, config: ExternalFixtureConfig | undefined, env: NodeJS.ProcessEnv = process.env): PrerequisiteReceipt {
  const requirement = externalRequirements[scenarioId]; if (!requirement) return { scenarioId, configured: true, missing: [] };
  const binding = config?.providers[requirement.provider];
  const missing = !binding ? ["authorized-disposable-provider-binding", ...requirement.fields] : [
    ...requirement.fields.filter(field => !binding.prerequisites[field]),
    ...binding.credentialEnv.filter(name => !env[name]?.trim()).map(name => `environment:${name}`),
    ...requirement.fields.filter(field => field.endsWith("Env") && binding.prerequisites[field] && !env[binding.prerequisites[field]!]?.trim()).map(field => `environment-reference:${field}`),
  ];
  return { scenarioId, provider: requirement.provider, configured: missing.length === 0, missing };
}
export function requireExternalPrerequisites(scenarioId: string, config = readExternalConfig()): ProviderBinding {
  const receipt = externalPrerequisiteReceipt(scenarioId, config);
  if (!receipt.configured) throw new Error(`Setup blocker ${scenarioId}: ${receipt.provider} requires ${receipt.missing.join(", ")}; provide private ${EXTERNAL_CONFIG_ENV} reference`);
  const provider = externalRequirements[scenarioId]?.provider;
  if (!provider) throw new Error("This scenario has no external-account prerequisite");
  return config!.providers[provider]!;
}
