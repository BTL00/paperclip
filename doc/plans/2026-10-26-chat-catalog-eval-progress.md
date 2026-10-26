# Chat catalog eval campaign progress

Updated: 2026-10-26. This is the single progress record for [the saved goal](2026-10-26-chat-catalog-eval-goal.md). Exact frozen requests, ownership, readiness, attempt histories and provenance live in [the campaign manifest](../../tests/runner-e2e/chat-campaign-manifest.json). This record distinguishes authored code from live acceptance.

## Current state

- **244 scenarios / 35 areas / 191 capabilities**, frozen inventory digest `9dc9cf6a5426cf1b56bc30a3571851f233f9dd5e93a1292eaee414d33b52df77`. All original queries, contexts and expected outcomes remain unchanged. **196 passes required**; blocked, partial, unsupported and unrun remain in the denominator.
- **67 authored: 57 complete, 10 partial, 177 unimplemented** at committed-source metadata checkpoint `9920727210c7193ca1baf58a260a48ac6dd32a82`. Newer authored changes wait for the next finite checkpoint. There are 65 concrete lazy descriptors plus two legacy task cases. Counts come from actual exports, bounds, source files and executable callbacks, not registration-only stubs. Paused inventory owners now have explicit saved readiness-policy evidence in `b53c596bc2`.
- **Three scenarios attempted; four actual measurements; zero first-attempt passes and zero final passes (0/244 for both rates).** Goal-tree is exhausted after two failures. Alignment and purpose each retain one failed initial attempt and one allowed correction/rerun remaining.
- **No live launcher, browser, database or provider process is running.** Manager held the two final retries before reservation, so remaining shared authoring contracts cannot stale a pass after its final allowed attempt. No unchanged rerun, extra nudge, deadline extension, automatic retry or relabeled canonical health probe was used.
- Production baseline `8373d7867963674ff960d2345d0d28086f799bc7`; branch `codex/chat-catalog-evals`. PR #17794 merged via `2ee36a4`. No eval/core PR has been created. No merge is eligible.

## Measured evidence — all failures retained

All results below use local native Codex subscription profile `runner-codex-subscription`, model `gpt-5.6-sol`, max parallelism one and zero automatic retries. Retained paths are under ignored `tests/runner-e2e/results/`. The launcher numbers each fresh invocation `attempt-1`; the ledger separately preserves governed campaign ordinals.

| Scenario / campaign ordinal | Source | Retained campaign | Outcome and supported cause | Cleanup / accounted tokens |
| --- | --- | --- | --- | --- |
| `goals.create-goal-tree` / 1 | `10d0ce63610` | `local-2026-10-26T22-19-23-608Z` | Eval harness failed before canonical query: Playwright could not resolve the selected `.js` URL to `.ts`; report parsing also rejected the dotted canonical ID. Machine class `candidate_failure` unchanged. | passed / no heartbeat runs |
| `goals.create-goal-tree` / 2, final allowed | `e652b0de6e` | `local-2026-10-26T22-26-37-076Z` | One native run created the requested tree, but final reply had no hierarchy link and left company ownership unset without a question. The unchanged first-phase gate prevented the explicit retry phase. Rendered href arrays and visual screenshot review confirm no alternate result card. Completed-behavior failure; no third attempt. | passed / 44,131 |
| `goals.align-existing-work` / 1 | `e652b0de6e` | `local-2026-10-26T22-31-32-695Z` | Two native runs correctly saved associations and rejected the foreign goal. Manager/domain review found the old three-links oracle exceeded this scenario’s YAML while underchecking its strategic-context explanation. **Eval oracle defect** supersedes the initial model-behavior attribution; raw failure and diagnosis history remain. | passed / 135,401 |
| `goals.explain-purpose` / 1 | `e652b0de6e` | `local-2026-10-26T22-35-40-720Z` | Initial fixture exposed both intended and later-conditional website tasks. Native tool-result event 208 contains both; the reply conflated them. **Eval fixture contamination**; no product/model blame. Missing/inaccessible phases were never sent. | passed / 25,256 |

Each case directory contains `result.json` and independent `snapshots/chat-catalog-{definition,observation,conversation,runs}.json` where reached. Exact definition/grader/global suite hashes, source SHA, evidence paths, timing and usage are retained per attempt. Subscription dollars remain **unpriced**, not zero; production setup hello probes remain outside heartbeat accounting. Accounted tokens across completed work runs total 204,788.

The initial report-parser error was repaired only for presentation at `results/chat-catalog-campaign/initial-postprocessed/index.html`; its sidecar retains original source and report error. This postprocessing made zero provider calls and remains the original failed measurement.

## Frozen snapshots and corrections

- First immutable source snapshot `10d0ce63610dd85ae338b0cc4d9addcba2cd8f80`: all 12,160 tracked files verified against Git blobs. Dependencies/build outputs were copied with APFS clones, 5,191 symlinks audited, one absolute workspace link rebound, and generated shims rebound. No dependency links reached the mutable checkout.
- Eighteen required workspace packages were rebuilt without incremental reuse. Full snapshot E2E typecheck passed. Native runner was rebuilt offline/locked from source; Rust sources match the declared production baseline. Binary SHA-256 `9d8af6b85b836a03092ade2273be6f29f5c2f6ec67ee891d83ee9693ba39d3b4`; build/toolchain/workspace-output receipts are in `results/chat-catalog-campaign/snapshot-10d0ce63610.json`.
- Correction `4c9de65edd` fixed actual source-module dispatch and bounded dotted report IDs; two regressions passed in an actual Playwright worker without fixtures/providers. Capability `e652b0de6e` added genuine pre-query history boundaries, default zero. Corrected immutable snapshot `e652b0de6eff21473a6d9b4915846c9851f292fa` verified 12,182 tracked files, full E2E typecheck, 32 focused controls and both Playwright regressions. Required production/workspace/native sources remained identical, so pinned build bytes were reused with provenance.
- Goals correction `ad031f1c59` is reviewed/frozen: alignment removes invented link obligations and checks phase-specific context explanation; purpose creates missing-association fixtures only after the initial canonical phase, uses semantic rationale rather than nonce repetition, and rejects negated/wrong-phase grounding. Domain reports 66 controls and scoped typecheck passing. **Calibration is not a rerun or passing live result.**
- Attachment capability `1c84384d41` allows exactly one declared production upload receipt for the two relevant cases, with unchanged canonical query prefix, exact formatter suffix, same-source/human/comment identity, independent bytes/SHA checks and allowlisted evidence. The two production composer source hashes are bound as selected fingerprint data only; their UI dependency graphs are not imported. Twenty-five focused shared controls and E2E typecheck passed.
- Finite repository alias binding now validates declared receipts with current company-scoped provider discovery and active connections; the domain adaptation is included in this checkpoint. It binds only catalog aliases to independently discovered numeric repository identities and active same-company GitHub connections. Its focused controls and scoped typecheck pass; final goal retries remain held until the remaining authoring contracts settle. Attachment helpers are frozen.

## Ownership and next work

The finite assignments cover the full denominator; future-wave assignments remain real work, not reduced scope.

| Owner | Scenarios | Areas |
| --- | ---: | --- |
| `eval_domains` | 45 | tasks, projects, goals, documents-artifacts, inbox-search, activity (two legacy task implementations retain integrator ownership) |
| `eval_integrator` | 27 | cases, status-cards, routines, skills |
| `eval_identity` | 44 | access, navigation-preferences, onboarding, questions-and-approvals, companies, budgets-costs |
| `eval_runtime` | 60 | agents, agent-chat, runs-adapters, execution-environments, recovery, steering, task-coordination, workspaces |
| `eval_external` | 52 | connection-setup, app-permissions, chat-channels, assistant-connections, gateways-profiles, plugins, teams, secrets |
| `eval_campaign` | 16 | instance-operations, cli-operations, developer-labs; also sole live coordinator and ledger/report owner |

Next: author the 16 privileged cases against actual owned operator targets with explicit developer/presentation scope, then consume the two remaining goal retries only after shared dependencies settle. Do not rerun exhausted goal-tree. No live test suites run concurrently with campaign instances. Preflight rechecks IPC capacity and exact source/binary/dependency identity; no arbitrary IPC cleanup, kernel tuning or live database changes.

Local tools/dependencies/private subscription auth file are present; provider-key variables, `.env.runner-e2e.local`, Daytona credentials and immutable image were absent at inspection. Presence does not establish validity. External provider/configuration blockers remain explicit and never passing coverage; simulations cannot establish live provider acceptance. No private artifacts have been published.

Next-wave review items: bound identity probe credentials privately across repeated fresh reads and revoke at owned cleanup, rather than create/revoke on every observation; allow harmless secret-related artifacts only after actual private byte scanning, and compare secret version/identity semantics rather than JSON property order. These are implementation corrections, not excuses to weaken outcomes.

Core behavior fixes require separate focused PRs that remain unmerged; their dependent passes cannot count toward the eval threshold. Eval merge requires every scenario implemented/processed, at least 196 final eligible passes, latest-head checks/reviews and actual protected merge. Per-case fingerprints, global suite hash and production/source revisions remain distinct; stale passes cannot be carried across changed execution/grader dependencies.

Credential discovery: relevant source metadata is readable through the existing 1Password service account outside the sandbox. Notion, QA AgentMail, GitHub, Daytona and Anthropic references are available; no matching Slack reference was found. Credential validity, a disposable repository allowlist, designated mail recipient and pinned cloud image remain unverified. Automatic approval review rejected credentialed provider identity/resource discovery and metadata persistence; explicit approval for the narrow read-only AgentMail/GitHub endpoints is pending. No provider discovery request or metadata write occurred. Private item IDs and account metadata remain outside tracked documents.
