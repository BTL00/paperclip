import type { ConnectionMethodDef } from "@paperclipai/shared";

export const credentialSourceSelectionInstruction =
  "Explain reviewed credentialSources choices and their prerequisites. Task-bound credential-source selection is not supported by connection_request. If the user explicitly selects a credential source, explain this limitation and its current availability or unavailable reason; do not send a standalone setup link that loses the requesting agent's access scope. Do not silently substitute ordinary OAuth. Use the existing scoped connection_request flow only if the user instead selects ordinary setup.";

export const connectionSetupAdviceInstruction =
  "For setup advice or comparison, explain the offered methods and any unavailable prerequisites in user terms before starting setup. If the user explicitly requests setup or selects a method, call connection_request with the returned service identifier and follow its instruction, unless the user selected a credential source. Do not ask a generic confirmation or imitate the real setup card. Search alone does not authorize a connection. " + credentialSourceSelectionInstruction;

/** Pick only reviewed public metadata; no arbitrary defaults, credential fields,
 * headers, connector identifiers or provider content crosses this boundary. */
export function connectionMethodDiscoveryMetadata(
  method: ConnectionMethodDef,
  service: string,
  companyPrefix: string,
  vercelConnect: { available: boolean; reason: string | null },
) {
  const params = new URLSearchParams({ source: service, method: method.key });
  const setupPath = `/${encodeURIComponent(companyPrefix)}/apps/connect?${params}`;
  return {
    whenToUse: method.whenToUse,
    ...((method.purpose ?? "tool") === "tool" ? { setupPath } : {}),
    ...(method.credentialSources?.vercelConnect?.services.includes(service)
      ? {
          credentialSources: [
            {
              source: "vercel_connect" as const,
              label: "Vercel Connect",
              available: vercelConnect.available,
              reason: vercelConnect.reason,
            },
          ],
        }
      : {}),
  };
}
