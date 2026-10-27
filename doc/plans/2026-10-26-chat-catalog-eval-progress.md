# Chat catalog eval campaign progress

Updated: 2026-10-26. This is the single progress record for [the saved goal](2026-10-26-chat-catalog-eval-goal.md). Exact frozen requests, ownership, readiness, attempt histories and provenance live in [the campaign manifest](../../tests/runner-e2e/chat-campaign-manifest.json). This record distinguishes authored code from live acceptance.

## Current state

- **244 scenarios / 35 areas / 191 capabilities**, frozen inventory digest `9dc9cf6a5426cf1b56bc30a3571851f233f9dd5e93a1292eaee414d33b52df77`. All original queries, contexts and expected outcomes remain unchanged. **196 passes required**; blocked, partial, unsupported and unrun remain in the denominator.
- **134 authored: 129 without declared coverage gaps, 5 partial, 110 unimplemented** at committed-source metadata checkpoint `ad0907afb9ca7b6d528d90616c3a12b52c94620c`. There are 132 concrete lazy descriptors plus two legacy task cases. All callbacks, bounds, policies, source dependencies and four browser boundaries were reconciled from this one Git archive; uncommitted or newer identity/integrator work is excluded. These are authoring counts, not acceptance.
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

Next: finish remaining shared/area authoring contracts before immutable freeze A, then run remaining initial attempts sequentially with retries zero. Accumulate one coherent correction set, freeze B, and review the exact eligible final retry set before execution. Alignment and purpose final retries stay deferred into B; goal-tree is exhausted and must not receive a third run. The coordinator pauses after this finite checkpoint for the external authoring slot and retains sole live/ledger ownership. No live test suites run concurrently with campaign instances. Preflight rechecks IPC capacity and exact source/binary/dependency identity; no arbitrary IPC cleanup, kernel tuning or live database changes.

Local tools/dependencies/private subscription auth file are present. Earlier absence described exported provider-key variables and `.env.runner-e2e.local`, not absence from credential sources. Exact standard `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` and `DAYTONA_API_KEY` names are present in the `~/.secrets` file. Source reference availability does not establish validity or a disposable target; immutable cloud image/resource scope remains unverified. External provider/configuration blockers remain explicit and never passing coverage; simulations cannot establish live provider acceptance. No private artifacts have been published.

Identity and domain probe helpers now retain one attempt-private credential lifetime with fresh reads and explicit revocation. Remaining external review: allow harmless secret-related artifacts only after actual private byte scanning, and compare secret version/identity semantics rather than JSON property order. Named ChatGPT setup is explicitly partial: real generic OAuth/MCP client consent is retained but cannot prove the named ChatGPT human setup path.

Core behavior fixes require separate focused PRs that remain unmerged; their dependent passes cannot count toward the eval threshold. Eval merge requires every scenario implemented/processed, at least 196 final eligible passes, latest-head checks/reviews and actual protected merge. Per-case fingerprints, global suite hash and production/source revisions remain distinct; stale passes cannot be carried across changed execution/grader dependencies.

Credential discovery: relevant source metadata is readable through the existing 1Password service account outside the sandbox. Notion, QA AgentMail, GitHub, Daytona and Anthropic references are available; no matching Slack reference was found. Credential validity, a disposable repository allowlist, designated mail recipient and pinned cloud image remain unverified. Automatic approval review rejected credentialed provider identity/resource discovery and metadata persistence; explicit approval for the narrow read-only AgentMail/GitHub endpoints is pending. No provider discovery request or metadata write occurred. Private item IDs and account metadata remain outside tracked documents.

## Historical authoring handoff at b33f3b8b64

| Owner | Without declared gaps | Partial | Authored |
| --- | ---: | ---: | ---: |
| Domains | 37 | 2 | 39 |
| Identity | 19 | 0 | 19 |
| Runtime | 23 | 1 | 24 |
| External | 8 | 2 | 10 |
| Integrator legacy | 2 | 0 | 2 |
| Coordinator privileged | 14 | 2 | 16 |

All 16 privileged IDs have executable paths. The health case submits the exact canonical body to the same owned backend only after genuine owned PostgreSQL shutdown and actual HTTP/doctor failure; route timing and early evidence survive ordinary admission failure. Cleanup restores the verified owned cluster before generic cleanup. No database fault was performed during authoring.

Backup restoration now includes a declared factual operator receipt and second, phase-attributed native restore-result report. Performance similarly supplies actual documented fixture measurements to a declared follow-up; generic no-measurement interpretation cannot pass. Feedback retains an actual board-cancelled, unfinished native worker with original comment/run/events, actual human CLI export, independent JSON/archive byte and scope checks, unchanged sharing, and a truthful local-location reply. It is labelled interrupted/cancelled work, never model failure or failed-native coverage. CLI returned commands execute their actual supported argv with an explicit source executable mapping and unresolved-identifier receipts; no JSON flags are silently added. Real state readback supplies independent identity checks.

The two privileged partials are `instance-operations.update-instance` and `instance-operations.provision-runtime`: `installed-source-activation-and-artifact-fingerprint-lane`. Ordinary chat currently rejects installed activation; this is a missing harness capability, not credential absence. Their area code requires an actual source installed target and private mode0600 `PAPERCLIP_CHAT_OPERATOR_INSTALL_RECEIPT` inside the owned attempt: exact CLI/server hashes, complete owned npm-prefix dependency-tree hash, source process PID/UID, source HTTP version and disposable ownership. Update additionally requires an exact supported published version/integrity and retains the concrete original-version reinstall option; it applies the public updater, restarts the actual source and independently reads its new version/readiness. Provision requires an explicitly named private OpenRouter environment reference, missing release-matched assets, the actual public provisioner and closure identity, then a separate genuinely running native Pi worker and exact saved file, followed by a phase-attributed result report. Its declared total is three native runs (initial controller, Pi worker, controller interpretation) and two human messages. Download alone never qualifies it.

Integrator owns the narrow allowlisted installed ordinary-chat selector/fingerprint/receipt lane. It must preserve source-mode guards and bind actual installed artifact closure rather than relabel a source pack as a published release. Coordinator resumes the operator cases after that capability; these partials cannot count for acceptance in the meantime. Runtime's fifth pre-chat `agent-chat.chat-disabled` boundary is allowlisted with real authenticated harness context and zero admissions; runtime still owns its case implementation.

Credential-free validation: 32 privileged controls across seven files passed; the later exact-argv change passed five CLI controls and E2E typecheck. Metadata was reconciled only from Git archive b33f3b8b64; dependency symlinks to the earlier immutable candidate were used for metadata imports only, never a live measurement. Newer committed/WIP area changes are pending the next checkpoint. No extra selected-case probe, reservation, live run, credentialed provider discovery or final retry occurred.

## Current finite integration checkpoint at ad0907afb9

| Owner | Without declared gaps | Partial | Authored |
| --- | ---: | ---: | ---: |
| Domains | 39 | 0 | 39 |
| Identity | 34 | 2 | 36 |
| Runtime | 23 | 1 | 24 |
| External | 15 | 2 | 17 |
| Integrator legacy | 2 | 0 | 2 |
| Coordinator privileged | 16 | 0 | 16 |

The archived source includes domain conditional closures, selected case credentials/private input staging (`9be9c65e85` / `5f8a3c8eec`), and the explicit installed operator lane (`8f67a700a4`). Update/provision no longer have that authoring gap: only these two ordinary-chat operator IDs admit an actual public-registry installation in an owned prefix, with publication pins, exact process/tree identity and supported transition checks. No installation or provider call has qualified that lane yet. Newer identity and integrator commits are pending the next immutable checkpoint.

All 244 scenario rows and their original canonical hashes remain unchanged. Three scenarios/four measurements still have no eligible pass. Four historical failed source measurements now append product identity only from their already-retained verified snapshot/native receipts; outcomes, diagnoses, usage, attempt ordinals and evidence are preserved. Any identity without adequate retained proof remains unknown and cannot qualify.

The approved eligibility policy distinguishes three product identities: ordinary source builds must match production source baseline `8373d7867963674ff960d2345d0d28086f799bc7` with exact snapshot/native/workspace artifact receipts; the two declared published operator cases retain independent public source/target release pins plus matching observed artifact identity; `onboarding.new-instance` may use a real published release or a separately labelled source-built installed artifact with its own CLI/server/tree proof. A source pack is never labelled published. Scenario-appropriate published-release passes may count toward the full 244 benchmark under their declared lane, and are never represented as proof of the source-baseline server. Missing identity, wrong baseline/lane, mismatched observed transition and any unmerged core candidate are ineligible. Ledger completion and summary enforce this distinction and report measurement counts by product identity.

Validation used the exact Git archive and its reconciled descriptors: all 132 runtime exports (including four browser boundaries) matched metadata; discovery listed 134 cells; 22 catalog/campaign/boundary/private-input/fingerprint controls passed. Four installed-child controls passed with the narrowly required process-inspection permission. Their first default-sandbox run failed closed because `ps` inspection was denied; that is retained harness-environment evidence, not a product or scenario measurement. No matching owned timer fixture remained afterward. The new ledger identity gates and a real private-envelope deletion/name-only fingerprint replay passed ten focused controls; E2E typecheck passed.

Plugin installation fingerprints two generated child artifacts. CLI and plugin SDK outputs were narrowly rebuilt inside the immutable archive using the existing committed build configurations and dependencies from the earlier immutable candidate. Lock identity matches, and production source/config/lock paths have zero diff from the baseline. Artifact hashes/build provenance are retained privately in `results/chat-catalog-campaign/metadata-ad0907afb9.json`; this is metadata validation only. Final freeze A must rebuild or adopt audited bytes with the actual execution snapshot receipt, never mutable-worktree `dist`.

Selected private credential inputs retain name-only identity for fingerprint replay after raw file cleanup; secret values never become fingerprint data or tracked metadata. Actual value validity and provider/disposable scope are still unverified. The separate narrow AgentMail/GitHub authenticated read-only discovery approval remains pending; no such request ran during this checkpoint. Native model calls in an authored eval are distinct from that discovery gate. Synthetic imported budget cost-events are fixture context, not incurred usage; campaign billing must use actual native run receipts and keep subscription dollars unpriced where appropriate.

No live launch, selected-case probe, reservation, final retry, production edit or core PR occurred. Goal-tree remains exhausted; alignment and purpose final retries remain for coherent freeze B only. Freeze A still processes all remaining initial attempts first, and only then accumulates one correction set and one reviewed final retry set on B. Coordinator pauses for the runtime authoring wave while retaining sole execution/ledger ownership.

## Pending authoring handoffs

These committed area handoffs await the coordinator's next immutable reconciliation. They do not replace the archived `ad0907afb9` checkpoint of 134 executions or establish live acceptance. The fixed denominator remains 244; the production source baseline remains `8373d7867963674ff960d2345d0d28086f799bc7`. Live history is unchanged: three scenarios, four measurements, zero eligible passes.

| Pending owner handoff | Authored | Without declared gaps | Partial | Still absent |
| --- | ---: | ---: | ---: | ---: |
| Domains, including two legacy cases | 41 | 41 | 0 | 4 |
| Identity | 44 | 41 | 3 | 0 |
| Runtime | 36 | 36 | 0 | 24 |
| Integrator | 22 | 19 | 3 | 5 |
| External | 25 | 22 | 3 | 27 |
| Coordinator privileged | 16 | 16 | 0 | 0 |
| Total pending reconciliation | 184 | 175 | 9 | 60 |

Integrator's latest finite area handoff is `37b72e28e3` (genuine SDK-managed routine), following `2d53c3952f` / `6cc0012da0` (actual Morgan primary execution and review handoff) and `fe05c54c11` / `edbf426db3` (partial skill enablement). Its five absent IDs are `cases.update-case-facts`, `cases.case-history`, `cases.close-case`, `routines.webhook-trigger`, and `skills.review-update`. Card explanation still lacks the actual responding-principal inaccessible-source phase; card refresh still lacks an actual persisted failed-generation phase retaining prior output. Skill enablement has concrete intended assignment/future-version callbacks but requires an observed public configuration grant and an applicable effective-denial branch; rejection of the nonexistent `skills.use` action alone is not proof that every denial context is unsupported. Partial authoring and unsupported prerequisite receipts never count as passing outcomes or complete inventory processing.

Shared privacy changes `b72f0f7cbb`, `4e73b7bb70`, `69b2e2b1a2`, and `d1fa9efdaf` protect diagnostic streaming, generated secret registration, reporter archives, authenticated API cookies, and sensitive PATCH calls. Worker registrations synchronously update an owned atomic mode0600 registry outside retained evidence; the launcher redacts before console/log emission and deletes that registry unconditionally. Diagnostic sink cleanup runs after independent observations: actual product response/work-product bytes remain available to leak oracles, while leaking opaque HTML/blob reports are omitted with explicit failure metadata and the original failed diagnosis retained. Actual offline Playwright canaries used synthetic values only, with no provider calls or canonical attempts. Closed source/hash/count receipts are retained under ignored `tests/runner-e2e/results/chat-catalog-campaign/privacy/`: `external-original-closed.json`, `shared-diagnostic-boundary.json`, `identity-private-browser-closed.json`, and `authenticated-api-transport-closed.json`. Raw canary reports are not published. Identity's finite child and exact state-file installation proof scanned 17 sinks without findings; the authenticated API canary scanned nine sinks without findings. Shared fingerprints change with these inputs; older passes cannot silently carry forward.

`7154ba9e85` adds only the approved numeric GitHub alias/discovery bindings for the two workspace repository scenarios and removes the erroneous requirement for an already-qualified managed Anthropic profile. Source credential-name availability still does not establish validity or target authorization. Narrow authenticated AgentMail/GitHub resource discovery remains pending explicit approval after automatic review rejected it; no credentialed discovery calls or metadata persistence occurred. No production fix, core PR, live launch, reservation, or final retry was added by these authoring handoffs. The coordinator retains sole ledger/execution ownership and resumes sole progress-document ownership after this bounded update.
