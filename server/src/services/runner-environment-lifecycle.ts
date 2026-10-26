import { resolvePaperclipRunnerIdleTimeoutMs } from "@paperclipai/adapter-utils";
import type { Environment } from "@paperclipai/shared";

/** Resolve runner retention before acquiring a sandbox, not after it is ephemeral.
 * This is a run-scoped view; never persist it over a shared environment's config.
 * The driver still verifies provider support and chooses the actual lease policy.
 */
export function resolveRunnerEnvironmentForRun<T extends Pick<Environment, "driver" | "config">>(
  environment: T,
  adapterType: string,
  adapterConfig: Record<string, unknown> = {},
  admittedLifecycleMode?: "warm" | "per_turn",
): T {
  if (adapterType !== "paperclip_runner" || !["sandbox", "plugin"].includes(environment.driver)) return environment;
  const config = environment.config ?? {};
  const lifecycleMode = admittedLifecycleMode ?? (config.runnerLifecycleMode === "warm" || config.runnerLifecycleMode === "per_turn"
    ? config.runnerLifecycleMode
    : adapterConfig.lifecycleMode);
  // Capability admission below chooses warm retention; recovery preserves its admitted policy.
  if (environment.driver === "plugin") return { ...environment, config: { ...config,
    runnerLifecycleMode: lifecycleMode === "per_turn" ? "per_turn" : "warm",
    runnerIdleTimeoutMs: resolvePaperclipRunnerIdleTimeoutMs(config.runnerIdleTimeoutMs ?? adapterConfig.idleTimeoutMs),
  } };
  if (lifecycleMode !== "warm") return environment;
  return {
    ...environment,
    config: {
      ...config,
      reuseLease: true,
    },
  };
}
