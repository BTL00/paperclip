import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
export const SDK_AST_BINDING = Object.freeze({
  inputCount: 501,
  inputManifestSha256: "19a20f8e78cd0d07fcb56390b5ac2cb8945e73b8659f4a98beeca83f6976373b",
  compilerPackageSha256: "3722b30210616a13a3213ded11575ba6b2dbab10c32a5ef67afca8513e27017e",
  lockSha256: "c7f23021335b60da0cff1dd4c75cf8b948333ef3165d7d1703eb79a589edb798",
  targetSha256: "a64534104941694cdc5c66a3c99f08b2a6de325768d1c47044193a18db9e41ae",
  sharedOutputsSha256: "b3f2c23d77d986eec5ff63d3f642fd55d0884426dd87fc14432a96f3ee3f9674",
  parserPackageSha256: "6d6a65b879cd7cd249a4367c0b57cce00e78c728de45056ac2a5ca1d1f528d1a",
  parserEntrySha256: "6969920ae0610df927b6b3e675d1309372c268e36d391652af8e3e0183cbe8f8",
  sdkOutputsSha256: "2dbee883799e3cef21744a9f45ec5ae1fa3b6bec6d1257ca240fe5612a12fe71",
});
export const SDK_AST_TARGET = "packages/shared/dist/validators/agent.d.ts";
const hash = value => createHash("sha256").update(value).digest("hex");
const reasons = ["identity_mismatch", "metadata_unavailable", "parse_error", "shape_span_bound", "no_shape_match", "ast_bound", "parser_unavailable"];
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const hex = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function validateSdkAstContext(value) {
  if (!exact(value, ["schema", "observationalOnly", "suppressedFindings", "binding", "comparison", "unresolvedReason", "parserVersion", "parseErrorCount", "matches"]) || value.schema !== "paperclip.sdk-build-ast-context/v1" || value.observationalOnly !== true || value.suppressedFindings !== 0 || !exact(value.binding, Object.keys(SDK_AST_BINDING)) || !integer(value.binding.inputCount, 4096) || Object.entries(value.binding).some(([key, entry]) => key !== "inputCount" && entry !== null && !hex(entry)) || !["matched", "unresolved"].includes(value.comparison) || !(value.unresolvedReason === null || reasons.includes(value.unresolvedReason)) || !(value.parserVersion === null || /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value.parserVersion)) || !(value.parseErrorCount === null || integer(value.parseErrorCount, 100000)) || !Array.isArray(value.matches) || value.matches.length > 32) throw new Error("ast_metadata_invalid");
  if (value.comparison === "matched" && (Object.entries(SDK_AST_BINDING).some(([key, entry]) => value.binding[key] !== entry) || value.unresolvedReason !== null || value.parseErrorCount !== 0 || value.parserVersion !== "7.29.8" || value.matches.length === 0)) throw new Error("ast_metadata_invalid");
  if (value.comparison === "unresolved" && (!reasons.includes(value.unresolvedReason) || value.matches.length !== 0)) throw new Error("ast_metadata_invalid");
  for (const row of value.matches) {
    if (!exact(row, ["detector", "start", "end", "nodeKinds", "containsTypeNode", "containsPropertySignature", "containsLiteral", "containsComment"]) || !integer(row.detector, 3) || !integer(row.start, 8 * 1024 * 1024) || !integer(row.end, 8 * 1024 * 1024) || row.start >= row.end || !Array.isArray(row.nodeKinds) || row.nodeKinds.length > 32 || !row.nodeKinds.length || row.nodeKinds.some(kind => !integer(kind, 8) || kind === 0) || new Set(row.nodeKinds).size !== row.nodeKinds.length || [row.containsTypeNode, row.containsPropertySignature, row.containsLiteral, row.containsComment].some(entry => typeof entry !== "boolean")) throw new Error("ast_metadata_invalid");
  }
}
export function loadSdkAstParser(repository) {
  const base = path.join(repository, "node_modules/.pnpm/@babel+parser@7.29.8/node_modules/@babel/parser");
  return createRequire(path.join(base, "package.json"))("./lib/index.js");
}
export function observeSdkAstSpans(text, parser, ranges) {
  if (Buffer.byteLength(text) > 8 * 1024 * 1024 || !ranges.bounded || !Array.isArray(ranges.matches) || ranges.matches.length > 32 || ranges.matches.some(span => !exact(span, ["detector", "start", "end"]) || !integer(span.detector, 3) || !integer(span.start, text.length) || !integer(span.end, text.length) || span.start >= span.end)) return { unresolvedReason: "shape_span_bound", parseErrorCount: null, matches: [] };
  let source;
  try { source = parser.parse(text, { sourceType: "module", plugins: [["typescript", { dts: true }]], errorRecovery: true }); }
  catch { return { unresolvedReason: "parse_error", parseErrorCount: 1, matches: [] }; }
  const errors = source.errors?.length ?? 0;
  if (errors) return { unresolvedReason: "parse_error", parseErrorCount: Math.min(errors, 100000), matches: [] };
  if (!ranges.matches.length) return { unresolvedReason: "no_shape_match", parseErrorCount: 0, matches: [] };
  let nodes = 0, bounded = true;
  const rows = ranges.matches.map(span => ({ detector: span.detector, start: span.start, end: span.end, nodeKinds: new Set(), containsTypeNode: false, containsPropertySignature: false, containsLiteral: false, containsComment: false }));
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const child of node) if (bounded) visit(child); return; }
    if (typeof node.type !== "string" || !Number.isSafeInteger(node.start) || !Number.isSafeInteger(node.end)) return;
    if (++nodes > 100000) { bounded = false; return; }
    const typeNode = node.type.startsWith("TS"), property = node.type === "TSPropertySignature", literal = /Literal$/.test(node.type), comment = node.type === "CommentBlock" || node.type === "CommentLine";
    const category = comment ? 7 : property ? 3 : literal ? node.type === "StringLiteral" ? 5 : 6 : typeNode ? 2 : node.type === "Identifier" ? 4 : ["File", "Program"].includes(node.type) ? 1 : 8;
    for (const row of rows) if (node.start < row.end && node.end > row.start) {
      row.nodeKinds.add(category);
      row.containsTypeNode ||= typeNode;
      row.containsPropertySignature ||= property;
      row.containsLiteral ||= literal;
      row.containsComment ||= comment;
    }
    for (const [key, value] of Object.entries(node)) if (bounded && !["loc", "extra", "errors", "tokens", "leadingComments", "trailingComments", "innerComments"].includes(key)) visit(value);
  }
  visit(source);
  if (!bounded || rows.some(row => !row.nodeKinds.size)) return { unresolvedReason: "ast_bound", parseErrorCount: 0, matches: [] };
  return { unresolvedReason: null, parseErrorCount: 0, matches: rows.map(row => ({ ...row, nodeKinds: [...row.nodeKinds].sort((a, b) => a - b) })) };
}
export async function createSdkAstContext(root, certificates, shapeRanges) {
  const binding = Object.fromEntries(Object.keys(SDK_AST_BINDING).map(key => [key, key === "inputCount" ? 0 : null]));
  const result = { schema: "paperclip.sdk-build-ast-context/v1", observationalOnly: true, suppressedFindings: 0, binding, comparison: "unresolved", unresolvedReason: "metadata_unavailable", parserVersion: null, parseErrorCount: null, matches: [] };
  try {
    const manifestBytes = await readFile(new URL("./sdk-build-diagnostic-inputs.json", import.meta.url));
    if (hash(manifestBytes) !== "e8866882871633da469cba69d6c73c3ac56e9386cd2a842e8b10d7cbf5f19777") return result;
    const inputs = JSON.parse(manifestBytes).inputs, actual = [];
    for (const [relative, gitBlobSha1] of Object.entries(inputs)) {
      const file = path.join(root, relative), st = await lstat(file);
      if (!st.isFile() || st.isSymbolicLink() || st.size > 8 * 1024 * 1024) return result;
      const bytes = await readFile(file);
      actual.push({ path: relative, bytes: bytes.length, sha256: hash(bytes), gitBlobSha1, restoredLockOverlay: relative === "pnpm-lock.yaml" });
    }
    actual.sort((a, b) => a.path.localeCompare(b.path));
    binding.inputCount = actual.length;
    binding.inputManifestSha256 = hash(JSON.stringify(actual));
    binding.compilerPackageSha256 = hash(await readFile(path.join(root, "node_modules/typescript/package.json")));
    binding.lockSha256 = hash(await readFile(path.join(root, "pnpm-lock.yaml")));
    const target = path.join(root, SDK_AST_TARGET), st = await lstat(target);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 8 * 1024 * 1024) return result;
    const bytes = await readFile(target); binding.targetSha256 = hash(bytes);
    binding.sharedOutputsSha256 = certificates.find(row => row.target === "packages/shared/dist")?.outputs ?? null;
    binding.sdkOutputsSha256 = certificates.find(row => row.target === "packages/plugins/sdk/dist")?.outputs ?? null;
    const parserBase = path.join(import.meta.dirname, "../../node_modules/.pnpm/@babel+parser@7.29.8/node_modules/@babel/parser");
    binding.parserPackageSha256 = hash(await readFile(path.join(parserBase, "package.json")));
    binding.parserEntrySha256 = hash(await readFile(path.join(parserBase, "lib/index.js")));
    if (Object.entries(SDK_AST_BINDING).some(([key, value]) => binding[key] !== value)) { result.unresolvedReason = "identity_mismatch"; return result; }
    result.unresolvedReason = "parser_unavailable";
    const parserPackage = JSON.parse(await readFile(path.join(parserBase, "package.json"), "utf8"));
    if (parserPackage.version !== "7.29.8") return result;
    result.parserVersion = parserPackage.version;
    Object.assign(result, observeSdkAstSpans(bytes.toString("utf8"), loadSdkAstParser(path.resolve(import.meta.dirname, "../..")), shapeRanges(bytes.toString("utf8"))));
    if (result.unresolvedReason === null) result.comparison = "matched";
    validateSdkAstContext(result);
    return result;
  } catch { result.comparison = "unresolved"; result.unresolvedReason = "metadata_unavailable"; result.matches = []; return result; }
}
