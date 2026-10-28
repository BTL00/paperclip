import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findSecretLeakMatch, normalizedSecrets, diagnosticSecretShapeRanges } from "./redaction.js";
import { createSdkAstContext } from "./sdk-build-ast-context.mjs";
import { sdkDiagnosticTree, SDK_DIAGNOSTIC_SYNTHETIC_SOURCES } from "./sdk-build-diagnostic.mjs";
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const hex = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export async function scanSdkDiagnosticOutputs(root: string) {
  const files: Array<{ path: string; bytes: number; sha256: string; findings: string[] }> = [];
  const certificates: Array<{ target: string; sources: string; outputs: string; markerSha256: string }> = [];
  const sensitive = normalizedSecrets([SDK_DIAGNOSTIC_SYNTHETIC_SOURCES.OPENROUTER_API_KEY, JSON.stringify({ tokens: JSON.parse(SDK_DIAGNOSTIC_SYNTHETIC_SOURCES.CODEX_AUTH_JSON).tokens })]);
  const nonsecret = normalizedSecrets([JSON.stringify({ metadata: { kind: "identity" } })]);
  for (const target of ["packages/shared/dist", "packages/plugins/sdk/dist"]) {
    const rows: Array<{ path: string; bytes: Buffer }> = await sdkDiagnosticTree(path.join(root,target));
    const marker = rows.find(row => row.path === ".paperclip-build-complete");
    if (!marker || !rows.some(row => row.path === "index.js")) throw new Error("sdk_diagnostic_certificate_missing");
    const certificate = JSON.parse(marker.bytes.toString("utf8"));
    const output = createHash("sha256");
    for (const row of rows.filter(row => row !== marker)) { output.update(JSON.stringify([row.path,row.bytes.length])); output.update(row.bytes); }
    if (!hex(certificate.sources) || !hex(certificate.outputs) || output.digest("hex") !== certificate.outputs) throw new Error("sdk_diagnostic_certificate_invalid");
    certificates.push({ target, sources: certificate.sources, outputs: certificate.outputs, markerSha256: hash(marker.bytes) });
    for (const row of rows) {
      if (!/^[A-Za-z0-9._/-]{1,240}$/.test(row.path) || row.path.split("/").some(part => part === "..")) throw new Error("sdk_diagnostic_path_invalid");
      const findings: string[] = [];
      if (findSecretLeakMatch(row.bytes,[])) findings.push("generic-key-shape");
      if (findSecretLeakMatch(row.bytes,sensitive,{includeShapes:false})) findings.push("synthetic-credential-exact-match");
      if (findSecretLeakMatch(row.bytes,nonsecret,{includeShapes:false})) findings.push("synthetic-nonsecret-json-exact-match");
      files.push({ path: `${target}/${row.path}`, bytes: row.bytes.length, sha256: hash(row.bytes), findings });
    }
  }
  const astContext = await createSdkAstContext(root, certificates, diagnosticSecretShapeRanges);
  return { schema: "paperclip.sdk-build-diagnostic-scan/v2", certificates, files, astContext, originalCanaryAttribution: "unavailable-original-registry-not-inferred" };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root,output] = process.argv.slice(2);
  if (!root || !output || path.dirname(output) !== root) throw new Error("sdk_diagnostic_output_invalid");
  const receipt = await scanSdkDiagnosticOutputs(root);
  await writeFile(output, JSON.stringify(receipt,null,2)+"\n", {flag:"wx",mode:0o600});
}
