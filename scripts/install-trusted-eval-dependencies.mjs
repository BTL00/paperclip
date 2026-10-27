import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Call only after checking out the trusted workflow SHA, before AWS access.
 * Never consume a target-branch lockfile or run dependency lifecycle scripts.
 */
export function installTrustedEvalDependencies(store, run = args => spawnSync("pnpm", args, {
  encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
}), output = result => { process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? ""); }) {
  if (!path.isAbsolute(store)) throw new Error("Trusted dependency store must be an absolute job-local path");
  const frozen = ["install", "--frozen-lockfile", "--ignore-scripts", "--store-dir", store];
  const invoke = args => { const result = run(args); output(result); return result; };
  const first = invoke(frozen);
  if (first.status === 0) return;
  if (first.error || !/ERR_PNPM_(?:LOCKFILE_CONFIG_MISMATCH|OUTDATED_LOCKFILE)\b/.test(`${first.stdout ?? ""}\n${first.stderr ?? ""}`))
    throw new Error("Trusted dependency install failed without a stale-lockfile diagnosis");
  const resolved = invoke(["install", "--resolution-only", "--ignore-scripts", "--no-frozen-lockfile", "--store-dir", store]);
  if (resolved.status !== 0 || resolved.error) throw new Error("Trusted dependency lockfile resolution failed");
  const installed = invoke(frozen);
  if (installed.status !== 0 || installed.error) throw new Error("Trusted dependency frozen install failed after resolution");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { installTrustedEvalDependencies(process.argv[2] ?? ""); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
