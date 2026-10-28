export interface SdkAstParser { parse(text: string, options: object): unknown }
export interface SdkShapeSpan { detector: number; start: number; end: number }
export interface SdkAstMatch extends SdkShapeSpan { nodeKinds: number[]; containsTypeNode: boolean; containsPropertySignature: boolean; containsLiteral: boolean; containsComment: boolean }
export interface SdkAstBinding { inputCount: number; inputManifestSha256: string | null; compilerPackageSha256: string | null; lockSha256: string | null; targetSha256: string | null; sharedOutputsSha256: string | null; sdkOutputsSha256: string | null; parserPackageSha256: string | null; parserEntrySha256: string | null }
export interface SdkAstContext { schema: string; observationalOnly: true; suppressedFindings: 0; binding: SdkAstBinding; comparison: "matched" | "unresolved"; unresolvedReason: string | null; parserVersion: string | null; parseErrorCount: number | null; matches: SdkAstMatch[] }
export const SDK_AST_BINDING: Readonly<SdkAstBinding>;
export const SDK_AST_TARGET: string;
export function validateSdkAstContext(value: unknown): void;
export function observeSdkAstSpans(text: string, compiler: SdkAstParser, ranges: { bounded: boolean; matches: SdkShapeSpan[] }): { unresolvedReason: string | null; parseErrorCount: number | null; matches: SdkAstMatch[] };
export function createSdkAstContext(root: string, certificates: Array<{target: string; outputs: string}>, shapeRanges: (text: string) => { bounded: boolean; matches: SdkShapeSpan[] }): Promise<SdkAstContext>;
export function loadSdkAstParser(repository: string): SdkAstParser;
