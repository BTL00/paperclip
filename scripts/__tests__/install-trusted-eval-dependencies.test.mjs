import { test } from "node:test";
import assert from "node:assert/strict";
import { installTrustedEvalDependencies } from "../install-trusted-eval-dependencies.mjs";
const store = "/owned/job/report-store";
function fixture(results) {
  const calls = [], output = []; let index = 0;
  return { calls, output, install: () => installTrustedEvalDependencies(store, args => { calls.push(args); return results[index++] ?? { status: 0 }; }, result => output.push(result)) };
}
test("a current trusted lockfile installs once, without resolution or lifecycle scripts", () => {
  const f = fixture([{ status: 0 }]); f.install();
  assert.deepEqual(f.output.filter(row => row.stderr?.startsWith("::warning")), []);
  assert.deepEqual(f.calls, [["install", "--frozen-lockfile", "--ignore-scripts", "--store-dir", store]]);
});
for (const code of ["ERR_PNPM_LOCKFILE_CONFIG_MISMATCH", "ERR_PNPM_OUTDATED_LOCKFILE"]) test(`${code} resolves the trusted tree then verifies a frozen install`, () => {
  const f = fixture([{ status: 1, stderr: code }, { status: 0 }, { status: 0 }]); f.install();
  assert.deepEqual(f.calls[1], ["install", "--resolution-only", "--ignore-scripts", "--no-frozen-lockfile", "--store-dir", store]);
  assert.deepEqual(f.calls[2], f.calls[0]);
  assert.equal(f.output.filter(row => row.stderr?.startsWith("::warning")).length, 1);
  assert.ok(f.calls.every(args => args.includes("--ignore-scripts") && args.at(-1) === store));
});
test("network errors and missing pnpm fail without re-resolution", () => {
  for (const result of [{ status: 1, stderr: "ERR_PNPM_FETCH_503" }, { status: null, error: new Error("ENOENT") }]) {
    const f = fixture([result]); assert.throws(f.install, /without a stale-lockfile/); assert.equal(f.calls.length, 1); assert.equal(f.output.filter(row => row.stderr?.startsWith("::warning")).length, 0);
  }
});
test("failed resolution and repeated frozen failures remain failures", () => {
  for (const results of [[{ status: 1, stderr: "ERR_PNPM_LOCKFILE_CONFIG_MISMATCH" }, { status: 1 }], [{ status: 1, stderr: "ERR_PNPM_OUTDATED_LOCKFILE" }, { status: 0 }, { status: 1 }]]) {
    const f = fixture(results); assert.throws(f.install); assert.equal(f.calls.length, results.length);
  }
});
test("refuses a relative dependency store before invoking pnpm", () => {
  assert.throws(() => installTrustedEvalDependencies("relative", () => { throw new Error("must not invoke"); }), /absolute/);
});
