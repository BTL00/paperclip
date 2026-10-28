export const SDK_DIAGNOSTIC_FILE: string;
export interface SdkDiagnosticSource { shared: string; sdk: string; helper: string }
export const SDK_DIAGNOSTIC_SOURCE: Readonly<SdkDiagnosticSource>;
export const SDK_DIAGNOSTIC_SYNTHETIC_SOURCES: Readonly<{ OPENROUTER_API_KEY: string; CODEX_AUTH_JSON: string }>;
export interface SdkDiagnosticChild { exitCode: number | null; spawnFailed: boolean; timedOut: boolean; outputLimitExceeded: boolean; outputBytes: number; stdoutSha256: string; stderrSha256: string; processGroupSettled: boolean }
export interface SdkDiagnosticScan { astContext: import("./sdk-build-ast-context.mjs").SdkAstContext; schema: string; files: Array<{ path: string; bytes: number; sha256: string; findings: string[] }>; certificates: Array<{ target: string; sources: string; outputs: string; markerSha256: string }>; originalCanaryAttribution: string }
export interface SdkDiagnosticReceipt { schema: string; diagnosticOnly: boolean; caseResult: boolean; scenarioAttempts: number; providerCalls: null; sourceRevision: string; sourceIdentity: SdkDiagnosticSource; lockSha256: string; status: string; failureCode: string | null; cleanupConfirmed: boolean; runtimeOutputUnchanged: boolean; build?: SdkDiagnosticChild; scan?: SdkDiagnosticScan; scanProcess?: SdkDiagnosticChild }
export function sdkDiagnosticEnvironment(root: string): Record<string,string>;
export function sdkDiagnosticTree(root: string): Promise<Array<{ path: string; bytes: Buffer }>>;
export interface SdkDiagnosticCopiedInputs { files: number; bytes: number; manifest: Array<{ path: string; bytes: number; sha256: string; gitBlobSha1: string; restoredLockOverlay: boolean }>; manifestSha256: string; lockAuthentication: string }
export interface SdkDiagnosticInputManifest { schema: string; frozenRevision: string; inputs: Record<string,string> }
export const SDK_DIAGNOSTIC_INPUTS_SHA256: string;
export function readSdkDiagnosticInputManifest(repository: string): Promise<SdkDiagnosticInputManifest>;
export function prepareSdkDiagnosticCopy(repository: string, owned: string, lockSha256?: string, frozenInputs?: SdkDiagnosticInputManifest): Promise<SdkDiagnosticCopiedInputs>;
export function verifySdkDiagnosticCopiedInputs(owned: string, copy: SdkDiagnosticCopiedInputs): Promise<void>;
export function runSdkDiagnosticChild(args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number; outputLimit?: number }): Promise<SdkDiagnosticChild>;
export function runSdkBuildDiagnostic(repositoryRoot: string, options?: { expected?: SdkDiagnosticSource; inputManifest?: SdkDiagnosticInputManifest; builder?: typeof runSdkDiagnosticChild; scanner?: typeof runSdkDiagnosticChild }): Promise<SdkDiagnosticReceipt>;
export function maybeSdkBuildDiagnostic<T = SdkDiagnosticReceipt>(repositoryRoot: string, env?: NodeJS.ProcessEnv, run?: (root: string) => Promise<T>): Promise<T | null>;
export function validateSdkDiagnosticScan(scan: unknown): void;
export function assertSdkDiagnosticInvocation(requested: boolean, args: readonly string[]): void;
