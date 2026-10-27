import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, chmodSync, realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createPrivateDiagnosticStream, diagnosticSecrets, PRIVATE_DIAGNOSTICS_ENV, readPrivateDiagnosticSecrets, stagePrivateDiagnostics, trackedPrivateSecrets } from "./private-diagnostics.js";
import { buildPaperclipServerEnvironment } from "./harness-env.js";
const roots: string[] = []; afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function registry() { const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "diagnostic-control-"))); roots.push(root); mkdirSync(path.join(root, "selected-private-inputs"), { mode: 0o700 }); return { root, file: stagePrivateDiagnostics(root, ["selected-case"], []) }; }
describe("private diagnostic output boundary", () => {
  it("redacts secret and escaped variants across chunks, multiline PEM and UTF-8 without losing ordinary failure detail", () => {
    const password = 'synthetic-credential-<&"-12345678';
    const pem = "-----BEGIN PRIVATE KEY-----\nU1lOVEhFVElDLVByaXZhdGUtS2V5LUxpbmUx\nU1lOVEhFVElDLVByaXZhdGUtS2V5LUxpbmUy\n-----END PRIVATE KEY-----"; const short = "Ax4\nBy5\nCz6";
    const outputs: string[] = []; const stream = createPrivateDiagnosticStream(() => [password, pem, short], value => outputs.push(value));
    const input = `HTTP503: π provider unavailable ${password}\n${pem}\n${short}\nJSON ${JSON.stringify(password)}\nHTML ${password.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")}\nURI ${encodeURIComponent(password)}\n`;
    const bytes = Buffer.from(input); for (let i = 0; i < bytes.length; i += 3) stream.write(bytes.subarray(i, i + 3)); stream.end();
    const safe = outputs.join(""); for (const value of diagnosticSecrets([password, pem, short])) expect(safe).not.toContain(value);
    expect(safe).toContain("HTTP503: π provider unavailable"); expect(stream.redactedSecret()).toBe(true); expect(stream.failed()).toBe(false);
  });
  it("synchronously registers a generated cookie before first output and rereads at final flush", () => {
    const { root, file } = registry(); const secrets = trackedPrivateSecrets([], "selected-case", { [PRIVATE_DIAGNOSTICS_ENV]: file, PAPERCLIP_RUNNER_E2E_TEMP_ROOT: root });
    expect(buildPaperclipServerEnvironment({ [PRIVATE_DIAGNOSTICS_ENV]: file })[PRIVATE_DIAGNOSTICS_ENV]).toBeUndefined();
    const outputs: string[] = []; const stream = createPrivateDiagnosticStream(() => readPrivateDiagnosticSecrets(file, root), value => outputs.push(value));
    const cookie = "generated-session-canary-982726351"; secrets.push(cookie);
    expect(readPrivateDiagnosticSecrets(file, root)).toContain(cookie);
    stream.write(Buffer.from(`session ${cookie.slice(0, 9)}`)); stream.write(Buffer.from(cookie.slice(9))); stream.end();
    expect(outputs.join("")).not.toContain(cookie); expect(outputs.join("")).toContain("[REDACTED]");
    expect(readFileSync(file, "utf8")).toContain(cookie); rmSync(path.dirname(file), { recursive: true }); expect(() => readFileSync(file)).toThrow();
  });
  it("fails closed for case mismatch, unsafe permissions, missing registry, oversized lines and late writes", () => {
    const { root, file } = registry();
    expect(() => trackedPrivateSecrets([], "different-case", { [PRIVATE_DIAGNOSTICS_ENV]: file, PAPERCLIP_RUNNER_E2E_TEMP_ROOT: root })).toThrow(/mismatch/);
    chmodSync(file, 0o644); expect(() => readPrivateDiagnosticSecrets(file, root)).toThrow(/permissions/); chmodSync(file, 0o600);
    const outputs: string[] = []; const stream = createPrivateDiagnosticStream(() => { throw new Error("private lookup failed"); }, value => outputs.push(value), 64);
    stream.write(Buffer.from("sensitive\n")); stream.write(Buffer.alloc(100, "x")); stream.end(); stream.write(Buffer.from("late private bytes\n"));
    expect(stream.failed()).toBe(true); expect(outputs.join("")).not.toContain("sensitive"); expect(outputs.join("")).not.toContain("late private bytes"); expect(outputs.join("")).toContain("size bound exceeded");
  });
});
