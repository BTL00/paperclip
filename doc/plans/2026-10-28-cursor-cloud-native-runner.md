# Cursor Cloud on native Paperclip Runner — 2026-10-28

Owner: the lead integration agent in this task; delegated owners cover the Cloud
API client and this research/acceptance record. The lead owns integration,
qualification, review, and the final handoff.

Original source baseline: `25f1070fbdabd96b26cdf199e624a77905f3ca37`.
Serving implementation branch: `codex/cursor-cloud-native-runner`.
Target: a reviewable PR with experimental, local-first native Runner support.
Merge, package publication, production rollout, and automatic conversion of
existing agents are separate actions, not completed or implied by this record.

Current delivery: [draft Runner core PR #18068](https://github.com/paperclipai/paperclip/pull/18068)
and dependent [draft product PR #18069](https://github.com/paperclipai/paperclip/pull/18069).
Neither PR is merged. Core code `9c54295c5060` has 57 clean check runs and
Product code `146376c108f8` has 52 successful check runs. Both have a successful
legacy Snyk status, fresh exact-head Greptile 5/5 and no open review threads.
Those are code gates, not complete live acceptance.

The saved local trial passed fresh save/reload and real key/catalog Test on
served source `ed4ef4796586`. Its manager was cleared through the ordinary UI,
the cleared value persisted, and the agent is idle. The private local app and
scoped callback listener remain running for test drive. Candidate
`b18b743cd45d` retains its earlier ordinary Sonnet task and exact artifact pass.
Continuation, replay and active Stop remain unqualified.

The terminal accounting and bounded cancellation repairs passed controlled
integration checks. Later local infrastructure blocks and native create failures
did not exercise a successful repaired live turn. Product attempts 7 and 9 each
received HTTP 500 before an accepted Run. Minimal no-MCP creates also returned
500 with Sonnet under both Bearer and Basic authentication, and with the
catalog-supported `gpt-5.4-mini` alternative. Both auth schemes independently
returned HTTP 200 for the same hashed user/key identity. Proposed Agent lookups
returned 404; no accepted Run identity was returned. Auth scheme and a
Sonnet-only explanation do not explain these observations. The underlying
account, repository, provisioning or service cause is unknown. No further
creates are planned. Keep both PRs draft; no release-readiness claim is made.
All original failed and partial grades remain retained.

## Release outcome and authority

An operator selects Cursor Cloud in native Runner, saves an API-key binding and
explicit model, assigns an ordinary task, sees real provider activity, and gets
an independently verified result through Paperclip. Cursor executes in its hosted
environment; the first Paperclip controller/Runner acceptance environment is the
local development stack. Local-first does not mean that Cursor's model or tools
execute on the operator's computer.

The user authorized implementation and a reviewable PR. On 2026-10-28 the user
also approved the experimental exception below and selected local-first delivery.
This adds a native integration for a harness already available through the legacy
direct adapter. Preserve that adapter, historical records, and saved runtime
selection. Do not migrate existing agents as a side effect.

**Authorized experimental exception:** the Cloud interface does not acknowledge
the effective model or instruction digest before starting the first prompt.
Proceed with explicit submitted model selection, recorded exact instruction
content/digest, visible experimental treatment, and honest evidence labels.
Do not describe a submitted value or an SDK echo as a native acknowledgment.
This exception does not relax company authorization, semantic-tool policy,
credential isolation, Stop fencing, result acceptance, or existing budget gates.

Native Cursor permission requests, native questions, native plan decisions, and
fixed per-run dollar enforcement are unsupported in this release. Paperclip
semantic tools remain a distinct contract. Cursor-native tools are not governed
by a Paperclip per-command approval callback.

Authentication uses an explicitly bound Cursor user/service-account API key.
Authenticated catalog, repository access and real hosted execution were observed
on 2026-10-28. Task and artifact acceptance passed on the candidate recorded below.
Record binding identifiers only;
never put key values in this plan or evidence. Select the acceptance model from
the real account's catalog and record it before a paid attempt. It is a test
choice, not a product allowlist. No paid calls were made by the research owner.
The user explicitly delegated disposable repository/model selection and approved
the test spend on 2026-10-28. The initial operational reservation was $10 for the
small acceptance cells. The user subsequently delegated proportionate test
spending. Actual spend remains unknown; do not infer it from prompt count or
call the reservation a provider-enforced limit. Each campaign permits one
attempt per cell and no automatic paid retries. This is a planning limit, not a native
Cloud dollar cap: provider cost remains unknown until a billing receipt is
available. Diagnose the first divergence before another paid attempt.

## Architecture and compatibility boundaries

- Provider-owned code owns HTTP v1 requests, SSE decoding/replay, native identity,
  status mapping, model parameters, provider errors, and cancellation.
- Native Runner owns normalized events and the semantic transport. The selected
  design is a Node sidecar behind the existing Rust Codex-style facade, following
  the OpenCode pattern. A public MCP relay forwards to the sidecar-owned Unix
  HTTP bridge, which emits `item/tool/call` through Rust and existing PRP to Core
  authority, then returns the result. Do not add a parallel PRP command. Controlled transport checks and real tools in the recorded C2 candidate
  exercised this bridge. The remaining live cells retain separate gates.
  A cloud VM cannot call the local controller's loopback address. Choose and
  record the relay's authentication, reachability, expiry, and cleanup contract
  before a live run. Do not substitute SDK in-process custom tools: those are
  local-agent functionality.
- The controller remains authoritative for company/run/session identity,
  authorization, audit, revisions, budgets, task completion, and durable effects.
  A replayed or late remote call must pass current source-run authority.
- New provider-neutral shared fields require a concrete consumer and an absent/
  disabled-provider behavior. Keep Cursor payloads and SDK types in provider code.
- Persist the durable Cloud agent ID separately from each Cloud run ID and the
  local Paperclip run/session identity. Recovery must observe the existing run
  before creating paid work. Refresh scoped MCP credentials on continuation.
- Stop must cancel the owned Cloud run, verify provider terminal state, close
  local stream/relay resources, and fence later effects. A local socket close or
  terminal Paperclip row alone does not prove remote work stopped.
- Preserve legacy direct invocations, transcripts, cancellation, and finalization.
  A direct run starts no runnerd process or PRP connection. Visiting/saving an
  existing agent does not change its runtime.
- The first supported controller platform is the actual local host used for
  acceptance; record OS/architecture and installed runtime identity when tested.
  SSH, Daytona, self-hosted Cursor workers, all-platform claims, and fleet rollout
  are outside this campaign. Source execution alone does not prove packaging.

## Research dossier

Research date: 2026-10-28. Public documentation is mutable; the inspected shipped
SDK is exactly `@cursor/sdk@1.0.28`. Evidence labels below distinguish
**documented**, **source-observed**, **unverified**, and **product-qualified**.
The dossier describes the inspected provider contract. Authenticated observations
and exact product results are recorded separately in the ledger below.

Official references:

- [Cloud API reference](https://cursor.com/docs/cloud-agent/api/endpoints) and
  [OpenAPI schema](https://cursor.com/docs-static/cloud-agents-openapi.yaml).
- [API authentication and rate limits](https://cursor.com/docs/api).
- [TypeScript SDK](https://cursor.com/docs/sdk/typescript).
- [Cloud environment setup](https://cursor.com/docs/cloud-agent/setup),
  [capabilities](https://cursor.com/docs/cloud-agent/capabilities), and
  [secrets/network](https://cursor.com/docs/cloud-agent/security-network).
- [Local CLI ACP](https://cursor.com/docs/cli/acp), a separate interface.

The Cloud API is v1 public beta: durable agents contain per-prompt runs. Creation
starts work immediately. Follow-ups, steering, SSE, cancellation, artifacts, and
usage have first-class APIs. Replay is run-scoped and retention-bounded. Agent
git state spans runs, so it cannot independently attribute a change to one turn.
The downloaded OpenAPI SHA-256 is
`dd3b836c4e95ad68892274280e53c348619cdd2051988793d2a85e8213d9a489`.
Current prose and schema differ on agent `IDLE` and some newer fields; preserve
unknowns and verify actual responses rather than assuming agreement.

Installed SDK findings, reproducible by inspecting its distributed
`dist/esm/options.d.ts`, `cloud-api-client.d.ts`, and `642.js`:

1. The Cloud run constructor assigns its model from a caller argument. `send()`
   passes the chosen input; a fresh get/list does not. `run.model` and
   `result.model` therefore do not establish provider model admission.
2. Cloud model validation checks catalog membership/aliases and tolerates some
   discovery failures. It is not native model acknowledgment.
3. The status mapper handles `CREATING`/`RUNNING`, `FINISHED`, and `CANCELLED`;
   every other value maps to error. It does not recognize the documented active
   `WAITING_FOR_BACKGROUND_WORK` state. Unmodified reuse is unsafe.
4. This Cloud SDK chunk has no steering implementation. A provider-owned HTTP
   client or a deliberately qualified SDK upgrade must cover the chosen API.
5. Host callback `customTools` are local only; per-send Cloud use is rejected.
   Tool restrictions are also local only. Cloud MCP means a reachable remote
   server or a server process inside the VM.
6. The inspected public Agent/Run API responses have neither an effective-model
   field nor an instruction-digest receipt. There is no pre-prompt admit phase
   or native human-decision response endpoint in that schema.

The SDK chunk SHA-256 is
`67a4eacc8435774d52a1d0f0a2d608c00b7f4f62ffa9cb46fe0b71523304a7bf`.
No workstation path is needed to understand or reproduce these findings: inspect
the published package version and named distribution files.

## Capability inventory

`Required` means part of this release; `Outside` means discovered but not part of
this campaign; `Unsupported` means no product promise. Controlled checks establish
their tested boundary; authenticated observation and product qualification are
distinct evidence levels. Exact candidate identities and failed attempts are
in the ledger. Cloud v1 means the documented API as researched above; SDK means
the exact inspected 1.0.28 package.

| Capability/field | Exact harness/version/mode | Native evidence | Transport/wrapper | Runner mapping | Durable product/UI | Qualification | Loss/reason/next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth/key identity | Cloud v1 | Authenticated catalog and hosted work observed | Bound Bearer auth | Native admission implemented | Saved secret reference/Test | C1 passed | Required; no credential value in evidence |
| Entitlement/repository access | Cloud v1 | Private fixture access and hosted clone observed | Typed API errors | Actionable admission failure | Reopen/reconnect | C1/C2 passed | Required setup |
| Protocol/version discovery | Cloud v1 beta | Documented; mutable | Strict v1 client and SSE decoder | Versioned driver/launch profile | Diagnostic identity | Controlled checks and live traffic | Retain exact candidate; no provider version negotiation claim |
| Model catalog/parameters | Cloud v1 | Authenticated catalog observed | HTTP discovery and explicit submitted values | No model fallback | Saved model/params | C1 passed; explicit Sonnet submitted live | Qualification model is not an allowlist or effective-model acknowledgment |
| Exact model acknowledgment | Cloud v1 / SDK | Source-observed absent/echo | No receipt | Submitted identity only | Visible experimental limit | Unsupported | Authorized exception |
| Default/Auto routing | Cloud v1 | Documented | Provider routing | Preserve caller choice | No fixed-model claim | Unverified | Outside acceptance model |
| Agent/Plan modes | Cloud v1 | Agent request observed | Always explicit Agent mode | Plan rejected | Agent-only Cloud configuration | Agent observed in C2 | Native Plan decisions unsupported |
| Reasoning/context params | Cloud v1 | Documented catalog shape | Per-model values | Preserve values | Selected configuration | Unverified | Outside required cells |
| Exact instructions on create | Cloud v1 | No digest receipt | Full inline text and submitted digest | Content bound to checkpoint | Experimental limit | Controlled serialization; C2 behavior observed | Native acknowledgment unavailable |
| Instructions on continuation | Cloud v1 | No digest receipt | Current full revision or fixed per-turn control guidance | Active digest changes fenced | Saved current instructions | Controlled revised/unchanged-turn checks | Required C3 remains unqualified |
| Assigned skills | Cloud v1 | Bounded text assets inline | Virtual read-only file bundle | No local path/mount assumption | Submitted instruction bundle | Controlled asset checks | Binary assets, scripts by local path and persistent directory unsupported |
| MCP discovery/execution | Cloud v1 | Authenticated SDK discovery and real tools observed | Scoped HTTPS relay to private Unix bridge | Normal Rust/PRP semantic transport | Authorized Core receipts | C2 passed; real question observed in C3 | Required real tool result |
| MCP refresh/reconnect | Cloud v1 / SDK | Run-scoped inline configuration | Re-supply on every turn | Fresh expiring tool capability | Current source-run authority | Controlled follow-up/revocation checks | Required live C3 remains unqualified |
| Runtime secrets | Cloud v1 | Key and scoped callback auth observed live | Bound auth key and scoped MCP headers only | Reject other selected process variables | Hosted shell secrets configured in Cursor | C1/C2 passed; controlled rejection checks | Hosted envVars unsupported |
| Host callback tools | SDK 1.0.28 Cloud | Source-observed local only | No Cloud callbacks | Use relay | No callback claim | Unverified | Unsupported route |
| Assistant text/boundaries | Cloud v1 | Real SSE and durable PRP rows observed | Typed SSE | Ordered canonical events | Task transcript | C2 passed | Required normal task |
| Thinking visibility | Cloud v1 | Documented event | SSE | Existing visibility policy | Policy-controlled rendering | Unverified | Outside required cells |
| Tool identity/arguments/results | Cloud v1 | Real tool names, statuses and bounded results observed | SSE with stable call identity | Builtin facade; Core raw-argument policy retained | Activity and semantic receipts | C2 passed; controlled projection checks | Native truncation/redaction is not lossless raw capture |
| Tool errors/partial deltas | Cloud v1 | Running frames and argument updates observed | Bounded typed projection | Consistent repeated starts accepted | Native activity and error status | Controlled projection/Stop observer checks | No broader lossless-delta promise |
| Shell output/background work | Cloud v1 / SDK | Native command traffic observed | Active/background status handling | Preserve active wait | Running until terminal proof | Controlled status checks | C4 must observe actual pending command |
| Native permission approval | Cloud v1 | No API callback | Native tools auto-run | No interception | Explicit limitation | Unverified | Unsupported |
| Native question | Cloud v1 | No response contract found | No API callback | None | No supported claim | Unverified | Unsupported |
| Native plan decision | Cloud v1 | No response contract found | No API callback | None | No supported claim | Unverified | Unsupported |
| Semantic tool authorization | Paperclip native | Existing controller contract | Run/session/company/agent/epoch-bound relay | Normal semantic dispatcher | Durable audit/effects | C2 accepted effects; controlled negative/expiry checks | No parallel authorization path |
| Semantic questions/approval/plans | Paperclip native | Separate existing contracts | Normal semantic relay | Structured question delivered | Real browser answer persisted | Question and answer observed in C3 | Complete continuation still unqualified; no native equivalence or broader decision claim |
| Todos/plans/revisions | Cloud v1 | Rich events not qualified | Provider translation | No invented capability | Existing generic surface only | Unverified | Outside required cells |
| Active steering/queue | Cloud v1; SDK absent | Provider API documented | Not exposed by this driver | Descriptor explicitly disables both | No active steering/queue promise | Unsupported in this release | Ordinary follow-up is separate |
| Ordinary follow-up | Cloud v1 | Documented | Existing Agent/new Run | Stable session identity and refreshed callback | Same task continuation | Controlled same-Agent and governed-yield tests | Required C3 awaits live confirmation of the bounded timing repair |
| Interruption/replacement | Cloud v1 | Cancel/new-run primitives | Provider-owned sequencing | Ownership fence | Stop then continue | Unverified | No implicit simultaneous turn |
| Load/resume/history | Cloud v1 | Durable Agent/Run API observed | Exact owned identity lookup | Saved deadline and cursor; durable terminal acknowledgment | Persisted separate Agent/Run IDs | Controlled native crash/recovery checks | Ambiguous follow-up identity remains fenced |
| Fork/compaction | Cloud v1 | Not qualified | No promised route | None promised | None promised | Unverified | Outside/unknown |
| SSE replay | Cloud v1 | Real event IDs and exact cursor reconnect observed | Last-Event-ID | Ordered source-sequence deduplication | Durable event/effect identity | Controlled checks; partial live C5 transport proof | Full C5 requires normal two-turn settlement |
| Expired replay | Cloud v1 | Documented 410 | Exact owned terminal lookup | No new paid prompt; bounded reconciliation | Incomplete history remains explicit | Controlled expired-stream check | No live retention-expiry claim |
| Subagents/children | Cloud v1 | Custom agents documented | Rich identities not qualified | No attachment promise | No invented parent/child UI | Unverified | Outside required cells |
| File edits/diffs | Cloud v1 | Tools/git documented | Provider stream/git snapshot | Activity only until proven | Independent result check | Unverified | Do not trust agent summary |
| Images/inbound media | Cloud v1 | Images documented | Prompt attachment | Bound existing input | No broader media claim | Unverified | Outside required cells |
| Artifacts | Cloud v1 | Native listing and signed download observed | Exact-host HTTPS and bounded bytes | Verified private staging and relative Core reference | Registered/downloadable result | C6 passed; exact 24 bytes/SHA/MIME | Core containment, symlink and hash guards retained |
| Usage/cache/subagent totals | Cloud v1 / SDK | Authenticated token response observed diagnostically | Client usage API available | Quantitative production facade not wired | Usage/cost unknown | Production accounting unsupported | Confirmed terminal closure settles explicitly unpriced; receipt/budget controls pass |
| Settled dollar cost | Current SDK docs | Documented eventual fields | API/schema divergence | Unknown until receipt | No fabricated zero | Unverified | Outside fixed-dollar guarantee |
| Per-run dollar ceiling | Cloud v1 | No enforcement contract | No admitted native cap | Existing budget gates only | Explicit limitation | Unverified | Unsupported |
| Idle/heartbeat/retry behavior | Cloud v1 | Partial documentation | Stream/recovery policy | Bounded activity | Quiet idle state | Unverified | No idle polling loop claim |
| Cancel/terminal status | Cloud v1 | Cancellation and terminal API reads observed | Exact Run cancel plus lookup | Unconfirmed termination stays fenced | Durable cancellation | Cleanup observed; native Stop/recovery controls pass | Required active-work C4 unrun |
| Late callbacks/effects | Paperclip native | Existing authority contract | Expiry/revocation and current actor authority | Fence stopped generation | Stale mutation rejected | Controlled relay/authority checks | C4 still requires bounded live observation |
| Native process/VM cleanup | Cloud v1 | Hosted lifecycle opaque | Delete plus independent exact Agent/Run 404 | No host-PID proof | Exact API absence recorded | Observed after retained campaigns | No physical remote VM cleanup claim |
| Local relay/stream cleanup | New integration | Exact owned process exit observed | Socket close/expiry | Bounded shutdown and receipt acknowledgment | No lingering owned local work | Packaged/native controls and live cleanup | Required C4 still unrun |
| Config/command discovery | Cloud v1 | Limited API inventory | Provider-specific | No arbitrary CLI promise | Normal configuration | Unverified | Outside required cells |

## Finite acceptance ledger

These six cells are the release's ordinary-user denominator. Each live attempt
must name the exact application/Runner commit, dirty state, client/profile
identity, local OS/architecture, provider API contract, credential binding,
model/params/mode, fixture/grader revision, run IDs, cost/reservation, and cleanup.
Keep original failures and new attempts together. A later patch requires an
evidence-impact decision before carrying a prior pass forward.

| Gate | Local-first cell | Required independent observation | Candidate/attempts | Verdict | Next action/owner |
| --- | --- | --- | --- | --- | --- |
| C1 Setup | Fresh configure; save/reopen/Test/reconnect | Correct saved runtime/model/binding; useful credential failure; real account test; no launch merely on read | Latest served `ed4ef4796586`: save/reload retained native Runner, Cloud, explicit Sonnet and secret binding; real Test passed key/catalog access without a prompt, with only the authorized effective-model acknowledgment warning. Ordinary UI cleared the paused manager; readback is null and the agent is idle. Earlier failures remain retained | Passed on latest local trial | Keep the private app and scoped callback available; configuration Test does not prove native create succeeds |
| C2 Task delivery | Ordinary task using real semantic tools | Provider activity; exact submitted content; authorized tool result; durable task finish accepted by controller; independently checked output; cleanup | `cursor-cloud-local-20261028-artifact-sonnet-2`, source `b18b743cd45d`, explicit `claude-sonnet-4-5`, all 8 matchers passed; result SHA-256 `eea3414ff54c7de99f4fc533cd4d88d415bc501dc56e95aa73a8c8f7fe09f270`; original failed campaigns retained below | Passed on recorded candidate | Assess pending recovery changes before carrying this pass forward |
| C3 Continuation | Follow-up on existing task/session | Same Cloud agent, distinct Cloud run; current instructions/tool grants; visible reply and durable result without duplicate work | Four earlier failed live campaigns retain their original grades. Attempts 5/6/8 stopped at local infrastructure before native admission. Attempts 7/9 on `ed4ef4796586` each returned create HTTP 500 with no accepted Run; minimal no-MCP auth/model controls also returned 500. Controlled accounting and cancellation repairs pass | Unqualified; native create boundary blocked | Resolve the native create failure before another bounded live qualification; no automatic retry |
| C4 Stop | Stop while provider work is actually pending | Cancel exact run; observe provider terminal state; close local resources; later relay calls/replays cannot mutate task; bounded observation recorded | No accepted latest native Run reached the actual pending-work boundary; controlled Stop/race checks remain separate proof | Unqualified; live cell unattempted | Requires a working native create and a real active-command Stop |
| C5 Replay | Disconnect/reconnect and retention expiry | Resume cursor; stable order; no duplicate effect/reply; expired stream reconciles through known run without a new paid prompt | Earlier failed C3 campaigns retain one real cut and cursor reconnect with ordered unique events. Attempts 7/9 failed create before SSE or a cut, so they add no replay acceptance | Partial transport proof; unqualified | Requires normal two-turn completion on a candidate whose native create succeeds |
| C6 Artifact | Download provider-produced result | Listed relative artifact; safe retrieval; independently verified bytes; usable Paperclip result access after settlement; cleanup recorded | Same Sonnet-2 result as C2; one registered/downloaded artifact, exact 24-byte fixture and MIME verified; SHA-256 `475af2a29ebe3347d92d24efaa58ee6e50a96c1e25297a4410ea12407aa5c1d9`; exact owned Agent and Run each returned 404 after cleanup | Passed on recorded candidate | Keep the original artifact bytes/receipt and repeat if the output path changes |

Current total: **3 passed on recorded candidates and 3 unqualified of 6
required**. C1 passed on the latest saved trial; C2/C6 retain their original
candidate identities. C4 has no live attempt. This is not a qualified release.
A user-approved 30-day key now authenticates to the real Cloud model catalog and
is bound privately in the ready local trial. The user approved the callback
tunnel and access to the new private README-only fixture repository. Both are
configured, and a fresh authenticated repository preflight confirms access.
The saved product Test passed after reopening across a controller restart. An
initial Test failure was traced to test-drive intentionally discarding ambient
PAPERCLIP_* routing variables; saving auth.publicBaseUrl in its isolated instance
configuration supplied the callback origin. This was setup repair, with no
production-code change or provider prompt. Task delivery retains its earlier
pre-prompt and hosted failures alongside the passing Sonnet artifact attempt.
The first four continuation attempts retain their original failed grades and
exact owned Agent/Run absence after cleanup or later reconciliation. The fourth
keeps its original cleanup-failure grade. Later blocks and create failures are
recorded separately below. The direct controls and latest cleanup report no
remaining active owned native work. No accepted Run ID existed for the create
500 controls, so no Run lookup or Run-404 evidence was invented.
The original cleanup-uncertainty grades remain retained. Hosted billing is
unknown; no zero-cost claim is made.
No source, simulation, protocol test, or screenshot qualifies a live cell.

Required supporting verification, reported separately from those six cells:

- Credential-free client/driver checks cover status mapping, SSE chunking and
  duplicates, transient errors, unavailable features, cancellation races, unknown
  usage, replay expiry, and malformed provider data. They must exercise the
  selected implementation rather than mirror its internals.
- Semantic relay checks prove source-run/company binding, denied operations,
  credential expiry/revocation, tool-result delivery, and no late mutation.
- Focused regressions preserve legacy Cursor Cloud and another existing native
  provider, with absent/disabled integration behavior.
- Exercise the clean installed package/runtime resolution used by the local
  release. Record actual installed artifacts and dependencies. A source checkout
  or startup probe alone is insufficient.
- Before PR-ready handoff run `pnpm -r typecheck`, `pnpm test:run`, and
  `pnpm build`; report any unrun checks precisely. Run relevant token/map/catalog
  checks if those owned surfaces change. Follow the repository PR template and
  resolve applicable review feedback.

## Resumable state and next gate

| Item | Verified state | Owner | Exact next action |
| --- | --- | --- | --- |
| Research | Official docs and SDK 1.0.28 inspected; no live calls | Research owner | Keep findings tied to pinned client/candidate |
| Experimental exception | User-approved 2026-10-28 | Lead | Preserve honest admission/cost limits in product and PR |
| API client | Implemented by client owner; supporting controlled wire proof reported separately | Client owner | Preserve exact pinned contract and run live acceptance |
| Native driver/semantic relay | Controlled suites, packaging and current code CI/review passed; recorded C2 real tools passed | Lead | Preserve exact source/ownership fences while native create is blocked |
| Credentials/model/budget | Real key privately bound; catalog/repository access and hosted execution observed; scoped tunnel approved; cost unknown | Lead | Preserve explicit model and owned cleanup for each paid attempt |
| Candidate/evidence | Core `9c54295c5060` and Product code `146376c108f8` have green CI/review; source `ed4ef4796586` passed package and saved-trial checks. Original failures, local infrastructure blocks and native create 500 controls remain retained. Both PRs stay draft | Lead | Native create must succeed before C3/C5/C4 qualification; no merge, publication or rollout |

The saved product Test and reconnect succeeded with real account/catalog access.
The remaining boundary is native create HTTP 500, followed by continuation/replay
and active Stop. Successful auth/catalog checks do not establish create
entitlement or explain the failure. No further create diagnostics are planned
in this handoff. Once the native create boundary becomes available, run one
bounded native control, then exact-candidate C3 with full C5, then active C4.
The release criteria remain unchanged.
Each paid task must be small, have a known output,
retain run/evidence identity, and have cleanup already wired. Diagnose the first
divergence before another paid attempt. Record active jobs and cleanup obligations
here before interruption; there are no active provider jobs recorded by the
research owner.

The driver-owned supporting check used the real sidecar stdio, Cloud HTTP/SSE
client with a controlled peer, private Unix MCP bridge, and exact accepted Core
tool result. It covers fresh creation, same-Agent follow-up, a revised idle
instruction bundle delivered once, unchanged follow-up without repeated bundle,
strict active recovery identity, replay cursor deduplication, initialized MCP
session isolation, ambiguous initial-create recovery without another prompt,
Stop cancellation plus native terminal lookup, killed-owner stale-socket
recovery through the actual initialized driver under umask 022, persisted
absolute deadline cleanup, expired relay rejection before
mutation, provider-owned artifact discovery, verified artifact bytes, and
reconciliation HTTP 401/403/404/422 preserving uncertain initial-create identity.
The final local command ran the four driver/asset/artifact/proxy test files with
default Vitest deadlines; all 26 passed in 4.18 seconds. The proxy fixture uses
explicit bounded five-second readiness waits. Earlier attempts had four
default-five-second test timeouts and one default-one-second readiness timeout
during host contention; they remain failed supporting attempts, and no
production or repository-wide test timeout was increased. Client token usage
retrieval exists, but the production facade does not deliver those receipts, so
its descriptor marks production usage accounting unsupported and the UI must
retain unknown usage/cost. A follow-up whose HTTP response loses the native Run
identity remains deliberately fenced: it is not retried or cancelled by guessing
an Agent's unrelated latest Run. This limitation needs explicit live evidence or
an improved provider identity contract before stronger recovery claims.

## Local milestone evidence — 2026-10-28

Entries below retain earlier state and pending decisions at each milestone.
The current release decision is the finite acceptance ledger above.

### Final local handoff and unresolved native create — 2026-10-28

All later campaigns and direct controls below pin served source
`ed4ef4796586723c47ba39cc4e0620dc489e4123`. Product code
`146376c108f82c4130cabd112d6566a5f44b453a` has identical production, Runner and
README bytes. Its only other differences are four test-only chat brief fixture
files. Those files do not change the Cloud live definition or runtime inputs.
A deterministic partial-write regression first failed, then atomic publication
at every brief writer passed. Full credential-free support passed 4,725 tests
with two skipped, plus 137 Node checks. E2E typecheck passed. Full recursive
typecheck passed at merged code `e1aeeaa2e4`; the later fixture-only change was
covered by the E2E typecheck. Current Core and Product code CI/review passed;
this final documentation update still needs its own latest-head gates.

The separate older full repository test run was stopped at its exact owned
coordinator after about 2 hours 35 minutes, with exit 130 and known failures.
It remains partial and not green. The host had exhausted its System V semaphore
capacity. That fact does not establish the cause of every earlier test failure.
No unaffected local suite was rerun for this documentation update.

| Later campaign | First measured boundary | Native work and retained grade |
| --- | --- | --- |
| Sonnet-5 | Local package-manager resolution | No fixture/native job admitted; no canonical live result. Retain the local tooling block |
| Sonnet-6 | Sandboxed tsx IPC listener denied | No fixture/native job admitted; no canonical live result. Retain the local tooling block |
| Sonnet-7 | One native create POST returned HTTP 500; exact proposed Agent GET returned 404 | No accepted Run, question, SSE stream or cut. Original candidate-failure result retained; cleanup passed after ordinary Board intervention |
| Sonnet-8 | Embedded PostgreSQL initdb exited 1 while host semaphore capacity was 87,381/87,381 across 5,140 sets | Zero native requests. Keep the original failed/cleanup-failure grade despite later local retirement; the exact failing syscall stderr was not retained |
| Sonnet-9 | One native create POST returned HTTP 500 after host recovery; exact proposed Agent GET returned 404 | No accepted Run, question, SSE stream or cut. Original candidate-failure result retained; cleanup passed after ordinary Board intervention |

Canonical result SHA-256 values remain:

- Sonnet-7: `d39a52de698ed89289d78ac598edaa645c03cba2b99aac3517feaf817d8e3671`.
- Sonnet-8: `847c7d6732b70a20b31c47ee6d23b0032e2c02399050769e12ae82d63cf63907`.
- Sonnet-9: `bc8b717e6c24645301354edb63b364c57a0e129604d627e2d96d6cc87a8bf723`.

The 500 campaigns do not test the repaired terminal accounting or cancellation
composition. Their capture remains pending without a matching committed
terminal. Vendor usage and dollar cost remain unknown, not measured zero.
Each create was issued once. No automatic paid mutation retry occurred.

Three minimal native controls omitted MCP. Bearer and Basic auth each returned
HTTP 200 from `/v1/me` for the same hashed user and key metadata. Sonnet minimal
create returned HTTP 500 under both schemes. A catalog-supported
`gpt-5.4-mini` Bearer control also returned 500, with a generic provider message
and no provider error code. Its create response arrived in about 7.23 seconds;
the exact proposed Agent lookup returned 404 in about 0.25 seconds. Request
metadata matched except for fresh ownership identity and selected model.
All three direct controls had one create POST, no cancel or DELETE, no
mutation retry, no accepted Run identity and no remaining active owned work.
No Run lookup was fabricated when the provider supplied no Run identity.

These controls show that the failure persists without Paperclip MCP, across
both successful authentication schemes, and across Sonnet and the selected
Mini model. They do not identify an account, repository, entitlement,
provisioning or service root cause. Read-only account UI inspection showed a
connected GitHub account and no visible blocking notice; it supplied neither a
confirmed cause nor a campaign billing receipt. No account setting or payment
was changed. No additional native creates are planned.

| Diagnostic evidence | SHA-256 |
| --- | --- |
| Same-identity auth/create comparison | `75fb7a722f9593c464dba4dd19b8299c644c0cd88d1a9eb8558edde1451a1bd1` |
| Minimal Sonnet Bearer control | `da538d42435d2fdbaa8609c0e081996f321df536245942feae369f9e3ca9e599` |
| Minimal Sonnet Basic control | `0f58432420baae4017ed34b686e80a6414ba58a0f47ea1c873205513c6d2fcee` |
| Minimal Mini Bearer control | `546a36f418f15eb403e31876f3b920d31eb80529af35d05a027dabb512c11a59` |
| Sonnet/Mini comparison | `5223faf425827ab4cefdd1a7cca739f35ba84538b73ed4eb6db36491ba8d0453` |

Final ordinary UI verification retained the explicit native Cloud/Sonnet and
private secret binding across save/reload, then passed the real no-prompt
key/catalog Test. The only warning was the user-approved lack of independent
effective-model acknowledgment. Clearing the paused manager through the UI
persisted `reportsTo: null`; the trial is idle and server health/recovery are
ready. Temporary plaintext credential material was removed after the encrypted
secret and real Test were validated; the valid 30-day binding remains available.
The private local app and separate callback listener remain running for the
user's test drive. No callback exposure of the board or general API was added:
public root and API probes returned 404, unauthenticated callback POST returned
401, and callback GET returned 405 with `Allow: POST`.

The final sanitized trial-state receipt has SHA-256
`a66701bc674e43bc0150b233c7ae962d32437f19823b0c21df82aec82e40f5a6`.
The private screenshot shown to the user has SHA-256
`e38c7e65561e333b1b9237c92fbdca6ce6c919bdcf9512c7936342189434b93e`.
Neither a ready configuration Test nor this screenshot qualifies C3/C5/C4.

The latest private Runner archive and compiled-consumer proofs passed on the
recorded macOS arm64 host with Node 26.4.0. The tarball has 1,696 entries,
14,031,063 bytes and no bundled `node_modules` or symlinks. Extracted stdio/Unix
MCP checks exercised a synthetic accepted tool result, terminal retention and
ACK, clean exit and socket removal. The separate compiled consumer loaded 175
modules inside its extracted closure and made zero parent or child provider
requests; no turn was submitted. These prove the tested private package
closure, not ordinary public installation or live Cloud acceptance.

| Current package/runtime artifact | SHA-256 |
| --- | --- |
| Private Runner archive | `eb7fbb3d65752de71bbc29f411e5d2c62904184134fdfe3a3b8791cb30901d7c` |
| Local daemon | `519ca52449ec584311107460f155d6b951272001447e15e9a4ac1790989463cc` |
| Cloud CJS proxy | `15e1c48df44e4e3bc48eb8814430cf2e37c800c4c4c8c00915bee8a8b8fe8c23` |
| Cloud ESM proxy | `1a1c92e3985f2af42baff74a6f30e08075709980289f1c1b595fd902acf16eeb` |
| Full compiled transport | `be516371bbd21d7f3a0b4d16713166b43e02b22bf67d67823bedd3ce52dc9590` |
| Compiled 175-module closure | `d65d92fe16a8486e7468b60a4ffa75b504b1eb6fa2ca2d56d31ab9151e1133f5` |
| Observed 26-file Node dynamic closure | `ce8e6d8d7e9845600a853d7d675810268c29126b6deaafdcc1337a4213c05c48` |

Node is still an operator-supplied observed host runtime, not a newly bundled
or pinned release distribution. The archive proof report has SHA-256
`a1aecad1bbf8054aa86006251d8ac606a4f2eed33b0265bdee225bc13dbbe20a`;
the compiled-consumer report has SHA-256
`89f8fa290e840439707df57311cfdd5cd4a89fddb323de6f1b9afa3160d3017e`.
Earlier archive identities below remain historical. Source, package, CI and
controlled proof do not replace the three unqualified live gates. No merge,
public package publication or production rollout was performed.

### Earlier controlled repair evidence

The controlled reproduction separated transport delivery from the governed-wait
deadline. Actual Rust/private Node proxy cases delivered the applied question
response and canonical interrupted terminal with both immediate and 18-second
cancellation, without a Stop command. The same real backend under
`executeNativeSession` passed immediate cancellation but failed the 18-second
case at `governed_wait_provider_terminal_unproven`. Cloud permits 20 seconds
for cancellation; the generic governed drain allowed 15 seconds.

Core repair `9c54295c5060` adds a trusted, optional terminal-drain bound to the
existing cancellation result. The Cloud backend supplies 30 seconds from its
20-second cancellation budget plus handoff margin. Other providers retain the
15-second default. The runtime validates the bound, preserves the existing
operation cap and consumption-owner abort, and still requires the matching
canonical terminal. The same real governed case now passes at both delays.
Fourteen negative, default, operation-cap and recovery controls, 326 affected
unit cases and eight bundle/Grok checks passed. Missing, foreign and explicitly
unconfirmed terminal evidence still fails. No accounting or budget fence changed.
Copilot advances to immutable v73 because shared identity inputs changed; v72
bytes and decoding are preserved. Grok v8 bytes are unchanged. This asserts no
new Copilot or Grok live qualification. Fresh Core review and CI are required.

Old Product head `3115d0bf2c` also failed its Copilot v71 source attestation and
the two already-repaired Cloud launch fixtures. One browser test copied whole
page text instead of YAML. Its unchanged isolated case passed, then its complete
six-case browser file passed on the aligned Product source. The original CI
failure remains retained and its cause is unclassified; new-head CI is still
required. No speculative UI or browser-test edit was made.

The fourth continuation campaign used clean source `de3c7d6b6c27`, with the
same explicit Sonnet selection, omitted parameters, fixture repository/ref,
allow-unpriced opt-in, deadlines and zero automatic retries. Full build passed
and its build stamp matched the source. All source and test files matched
Product `cacb45fd5bfd`; only this qualification document differed. The Runner
package source and exact CJS/daemon bytes were unchanged from the previous
packaged proof.

The exact question tool was applied. An interrupt command was issued, followed
by a Stop command issued about 15 seconds later. Those command timestamps do
not establish completion times or a fast interrupt acknowledgment. The exact
native stop receipt records `providerExitConfirmed: true`, `remoteStopped: true`
and status `FINISHED`.
The matching Node checkpoint retained its interrupted terminal-delivery batch.
No canonical turn terminal reached Core before the governed-wait drain failed.
The checkpoint's later last-write time is not asserted to be terminal creation
time. The 15-second drain and 20-second Cloud cancellation bounds require a
controlled composition check; the live timing alone does not prove its cause.
This is a candidate terminal-handoff divergence; it is not evidence of a
provider provisioning failure. No eligible replay frame was cut, no answer or
second run completed, and C4 remained on hold. Missing canonical evidence
correctly leaves accounting pending; do not weaken that boundary.

The ordinary result remains FAIL/cleanup_failure, SHA-256
`2965928841f50408cc07eb705c9a785680acf2a106735a37ab9a9f1a4f3536f7`.
Its original cleanup could not confirm deletion. Later independent exact owned
Agent/Run lookups both returned 404. That reconciliation does not replace the
original grade. The wrapper restored the exact original CJS and released the
callback port and source/dist freeze. No further paid work is active.

Before that attempt, the accounting repair passed ten focused tests, including
nine scenarios through the actual PostgreSQL receipt, ledger and budget path.
Matching completed and interrupted terminals settle as complete and explicitly
unpriced, with no fabricated counters or zero dollar cost. Allow-unpriced
permits the next reservation only after ledger settlement; block still blocks.
Missing, foreign and explicitly unconfirmed terminals, capture failures and
replaced recorders retain pending debt. Saved canonical evidence also restores
collection closure on recovery. Generic receipt, ledger and budget code is
unchanged. Full recursive typecheck passed at Product `cacb45fd5bfd`.

The third continuation campaign on `69edecfd84ae` saved and independently
verified explicit allow-unpriced policies before dispatch. It discovered the
correct MCP server, created the exact structured question and received the
browser answer. The committed matching `turn.interrupted` carried
`error: null` and `status: interrupted`; native cancellation was confirmed and
the exact owned Node process had exited. Nevertheless, Core emitted incomplete
Cursor accounting because numeric usage was absent. The run remained pending
with no accounting receipt, and the normal budget gate paused the company.
The original ordinary result is FAIL/candidate_failure, SHA-256
`0326c611f99557fbcd0fb6dcda6bacdbcda6f4fe8079189abef2f0cd748d9596`.
Cleanup passed; independent final Agent/Run reads returned 404, the exact
shipping CJS was restored and the callback port was released. One real cut and
cursor reconnect occurred, but no second run completed, so C3/C5 remain
unqualified and C4 is unattempted.

This is an accounting-producer defect. A confirmed matching committed terminal
must close collection as explicitly unpriced when Cursor supplies no numeric
usage. Missing or mismatched terminals, explicitly unconfirmed provider
termination and capture failures must remain pending. Receipt, ledger and
budget enforcement retain their existing contracts. Prove these boundaries
through the actual accounting path before another paid campaign; do not mutate
the failed measured company to bypass its pending incident.

The second continuation campaign on `9683ba4678ee` found the run-bound catalog,
created the required structured question and received the real browser answer.
Its next run could not enqueue because the fixture company and agent policies
blocked unpriced usage. A budget incident paused the company after the first
unknown-cost turn; retrying the response could not bypass that policy. The
original result remains FAIL/candidate_failure, SHA-256
`1dfdd92bef4e69dd09bfde0eb7294f219d5a8bfd8e9803b4e747c2e33791aa93`.
Cleanup passed and exact owned Agent/Run each returned 404. The original CJS was
restored. C5 again exercised a real cut/reconnect, but no second turn completed.

This is a qualification-policy mismatch, not a reason to change production
budget enforcement. The bounded fixtures now require explicit
`PAPERCLIP_CURSOR_CLOUD_ALLOW_UNPRICED_QUALIFICATION=1`, upsert only their owned
company and agent monthly billed-cent policies, and verify both saved policies
before dispatch. Each remains active with a 1,000-cent known-cost hard stop;
unknown pricing is explicitly allowed under the user's test-spending approval.
It is not a provider dollar cap. Cost reporting remains unknown. Missing opt-in,
failed readback and changed guards block setup. The red controls, 71 passing
fixture/registration cases, 19 strengthened budget controls and full E2E
typecheck are retained. No production default changed. The separate saved local
trial received the same explicit policy through the public API and verified
readback; its actual vendor cost remains unknown.

Only fixture policy/evidence changed after `9683ba4678ee`; the model prompt,
provider CJS and native daemon are unchanged. Retain all prior grades at their
original definition hashes and run a fresh company/Agent campaign. Do not
unpause the failed measured company or relabel its result.

The first live continuation/replay campaign failed its required question on
`62fb0252e931`. Cursor queried unrelated inherited account MCP namespaces, both
requiring authentication, and never selected the injected `paperclip` server.
It then ended with objective unsatisfied and no structured question. The
ordinary fixture retained its failed grade and cleanup passed; exact Agent/Run
reads returned 404. No second run or Stop attempt occurred. One real SSE cut
reconnected to the same owned run using the exact cursor, with ordered unique
retained events, but this does not pass the complete C3/C5 contract. Original
CJS bytes were restored after finalization.

Code and retained C2 traffic identify a product guidance gap. The request names
the injected server, but model-facing instructions did not identify it. C2
found it by a broad tool search; C3 selected similarly named account servers.
Neither unrelated name comes from the repository, and the current semantic
question tool remains available. [Cursor's SDK documentation](https://cursor.com/docs/sdk/typescript)
confirms that Cloud also loads account/team MCP servers; local setting-source
filters do not apply. The repair now binds one provider server-name constant,
directs discovery to that server on every turn, distinguishes semantic questions
from native callbacks, and explains controller-managed authentication without
VM REST credentials. Two serialized-request regressions first failed; all 46
Cloud cases then passed. This is a supported correction hypothesis, not a claim
that model causality has been proved. Keep the outcome oracle unchanged and use
a fresh campaign because active checkpoints reject instruction-digest changes.

Core CI also exposed a real Copilot source-attestation mismatch after shared
bridge/contract changes. The immutable identity advanced to v72 while preserving
the original v71 bytes and decoder. Eighty-six identity/compatibility controls
passed. This refresh does not assert a new Copilot live qualification. The final
Core source has a green full build, 436 selected TypeScript cases, 33 native
backend integrations and eight bundle/profile checks; fresh remote gates for
that source remain pending. Earlier Copilot CI and local failures stay retained.

A further recovery race was reproduced during review: the native run could
finish between two startup reads, causing Rust to reject the valid terminal
batch against an older active-turn cache. The repair validates active state and
terminal delivery from one snapshot and updates the cache only after validation.
The proxy likewise returns one captured state view after the queued checkpoint
commit. Both native and proxy red controls reproduced the mismatch; all 33
native integrations and 46 Cloud/facade cases then passed. A paused-write test
also proves thread/read cannot return the random terminal receipt before it is
durable: the response stays blocked while disk remains running, then returns
the exact receipt found in the committed checkpoint. Preserve these controls
and the earlier review grades; a new review is still required for this repair.

The saved local test-drive was restarted on `abb79acfb016` and returned healthy.
The ordinary UI retained the explicit Sonnet model and organization-secret
reference, passed the account/catalog Test with its expected experimental
warning, and completed Finish setup. Independent API state confirms
`paperclip_runner`, provider `cursor_cloud`, model `claude-sonnet-4-5`,
`secret_ref`, lifecycle `ready` and idle status. Setup sent no provider prompt.
The callback-only tunnel again returned 404 for root/API and 401 for an
unauthenticated native-run request. This validates C1's saved setup on the
repaired application; the later Stop receipt repair changes no setup behavior.

Final inspection found one related Stop receipt gap: shutdown could close Node
before Rust consumed its retained terminal batch, blocking a later same-Agent
turn. Retained Node/Rust red controls reproduced it. The repair retains the
batch through the shutdown receipt, persists and acknowledges it before process
exit, avoids double settlement, and retries a matching receipt on attachment.
All 33 native backend integrations and 46 controlled Cloud/proxy/facade cases
passed, as did Node typecheck and unchanged Grok v8 identity. The complete
repaired candidate must be rebuilt before the remaining live cells.

Both recovery findings now have retained red/green controls. Recovery arms the
saved absolute deadline before any read, retries only transient read failures
under that obligation, and aborts pending reads during Stop. Terminal delivery
is persisted privately before publication. Rust imports and deduplicates that
delivery into its durable outbox, saves the receipt, then acknowledges the Node
checkpoint. New work cannot supersede unacknowledged terminal delivery. The
actual Rust regression reproduced the lost-turn failure and then passed crash
before final delivery and partial final delivery with lost acknowledgment. All
32 native backend integrations and 362 selected TypeScript cases passed. Node
typecheck and the existing Grok v8 immutable identity passed; no Grok identity
refresh or new Grok live qualification is asserted.

The selected CI launch fixture now builds a private proxy, because that lane
does not contain a shared dist bundle. Its missing-dist failure and two passing
real-facade controls are retained. The product test roots also preserve short
Darwin socket paths while using the platform temporary directory elsewhere.
Stop qualification now observes the exact native delayed command, joins its
identity to an unfinished Core execution, and checks again immediately before
UI Stop. Retained native traffic showed argument-free running frames followed
by running argument updates for the same call. The observer accepts consistent
updates and rejects completion, changed ownership, stream loss and expiry.
Its original failures and 73 passing focused controls remain recorded.

Evidence impact: the recovery repair changes terminal settlement and the Rust
artifact identity. Rebuild and qualify final settlement through the remaining
two-turn continuation cell. It does not change provider artifact discovery,
download, staging, Core file verification or registration, so retain C6's exact
Sonnet-2 artifact evidence. C2 keeps its original candidate identity; do not
relabel that result as a new run. The Stop prompt and observer changed, so only
the new fixture can establish C4. No live replay or Stop pass exists yet.

`cursor-cloud-local-20261028-artifact-sonnet-2` passed on source `b18b743cd45d`.
The same explicit Sonnet model, omitted parameters, repository/ref, fixture and
deadlines were used after the path repair. All eight ordinary matchers passed:
continuity, exact final marker, task done, run succeeded, native/local execution,
exact registered artifact bytes and MIME, and cleanup. Independent saved state
contains one accepted result with objective satisfied and one registered,
downloadable 24-byte artifact. Its SHA-256 is
`475af2a29ebe3347d92d24efaa58ee6e50a96c1e25297a4410ea12407aa5c1d9`.
The exact owned Cloud Agent and Run each returned 404 after cleanup. The
canonical result SHA-256 is
`eea3414ff54c7de99f4fc533cd4d88d415bc501dc56e95aa73a8c8f7fe09f270`.
This passes C2/C6 for this candidate; vendor cost remains unknown.

The production stager now returns a path relative to the admitted artifact root
for both fresh and repeated staging. The provider's 33 focused controls passed.
The product regression first reproduced the exact rejection through the actual
Core file reader, then passed normal/repeated handoff and post-staging hash
tamper rejection. A static test import initially failed the server TypeScript
root boundary and emitted eight unwanted source-side files. Only those
untracked emitted files were removed; the established dynamic test import fixed
the compile boundary. Full builds then passed in both the serving checkout and
the independent Product PR checkout. The latter also passed full workspace
typecheck, 1,085 focused tests across 18 files, 46 E2E support tests, token gates
and map gates. These do not replace the unresolved full test gate.

The repaired CJS proxy is
`dbb219296765add55e7568c4494885f64b9ca5cd7a09128247929995a5e20aa6`.
Its 1,696-entry private tarball (14,012,533 bytes) has SHA-256
`b25e463011ab6cab7c2b2d9dd53c1b91422025441ab68a66ed0a03880731e551`.
The controlled extracted-package protocol and shutdown proof passed. A first
parity check used the wrong working directory, changing esbuild's source labels;
the unchanged check from the canonical package build directory matched both
shipped bundles exactly. No runtime bytes changed during the live attempt.

Core review at this stage scored 3/5 and identified two recovery defects:
terminal checkpoint persistence can precede durable delivery of terminal events,
and recovery reads can fail before the saved absolute deadline is armed. The
Core owner is repairing both with regressions. Continuation/replay and Stop are
held until the repaired candidate is built and its evidence impact is recorded.
Diagnose any new divergence before another paid attempt.

Campaign 5 (`8e4c587102`, explicit `gpt-5.4-mini`) created the exact expected
24-byte file, but native artifact download metadata was rejected before Core
registration. A separate small native diagnostic observed the actual signed
download host, `agent-stores.s3.us-east-1.amazonaws.com`, and independently
verified six expected bytes. The client now accepts that exact host, retaining
the existing HTTPS and bounded-download restrictions. The original red host
regression and failed product grade remain retained. Both owned native Agent
and Run were independently absent after cleanup.

Campaign 6 (`3050fa41a933`, same Mini model) independently downloaded and verified
the expected native file. Cursor made no semantic task calls and ended with
Paperclip requiring review. The ordinary 600-second fixture deadline graded
the attempt FAIL; its cleanup matcher passed and exact owned native Agent/Run
lookups returned 404. File creation/download alone does not pass C2 or C6.

One explicit model control uses the same runtime, fixture, repository and
deadlines with catalog model `claude-sonnet-4-5`, omitting model parameters.
Official MCP SDK discovery observed 56 tools through the exact owned callback,
including completion, artifact discovery and registration, without invoking a
task tool. Sonnet called the semantic tools and supplied correct file metadata.
The downloaded and staged 24 bytes match the fixture, but Core rejected the
absolute staged reference with `paperclip_runner_file_handoff_path_denied`.
The provider stager must return a reference relative to its admitted artifact
root; Core's existing containment, symlink and hash checks remain authoritative.
This is an observed integration defect. Preserve the original campaign result
and run a real stage-to-Core regression before a new hosted attempt.

The current clean private Runner tarball has 1,696 entries, 14,012,523 bytes,
and SHA-256 `bd7b95a988f2ebebdc4fe2e52f19638d4cfb825d3538b89405c1f861e46818e3`.
Its CJS proxy is `fd6ab6b82b66e5b9bd1a60f70ddca34b7fb44d24c21827c77376931afa52640d`;
its daemon is `ba78c864a2a688e53d82e26a2c048ad1ab803c4715c1b847324e84a074deffec`.
After installing only the declared selected dependency closure in an extracted
consumer, the actual compiled transport, Rust daemon and guarded Node proxy
opened and closed successfully: 175 loaded modules remained inside that
consumer, no vendor request occurred, exit was zero and the owned socket was
removed. A sandboxed listener attempt failed with EPERM; the unchanged check
passed with local-listener permission. This is package-boundary proof, not a
public Paperclip install or a passing live task. Rebuild identity after the
pending stager repair before carrying it forward.

The Core PR uses fixed fetched master `d30c8f42b842` and independent dependencies.
Its full workspace build, 357 focused TypeScript cases, 129 Rust integration
cases and eight bundle/profile checks passed. Its CJS matches the serving
candidate; its independently compiled daemon has different bytes, so binary
equivalence is not claimed. The full repository test gate remains unresolved:
a frozen two-file control passed all 981 native executor cases and the original
chat authority case, but found 21 other chat failures (2,581 passed overall).
Diagnostics and baseline classification are in progress; the failed grade stays
in the record.

Campaign 3 (`cb5cc2493a`) reached private PRP admission, then failed session open
because the outer Runner launch allowlist omitted six private Cloud config/relay
bindings. Its original failure is retained. The corrected regression reproduced
the exact error through transport, sanitized spawn, Rust and the built Node
proxy, then opened/closed that entire chain without any provider request. Four
spawn-boundary controls and the full launch check passed. Reserved configured
environment prefixes remain blocked.

Current master `7f10cc058568` was integrated before the first hosted prompt,
preserving its Stop, recovery, human-input and E2E evidence changes. Only an
additive documentation conflict required resolution. Its declared editor
dependencies were installed with pinned pnpm 9; the resolved dependency lock
was retained privately and the tracked lockfile restored per contribution rules.

Campaign 4 (`5de3610003`) reached real Cloud work and delivered 16 semantic calls
and results to Core. Native discovery emitted some `Invalid arguments` results,
but subsequent dispatch succeeded; those errors do not establish an MCP outage.
The concrete remaining failure was internal `call_api` traffic sent to the
callback-only origin, repeatedly returning 404. The six-minute provider deadline
cancelled the run. The later cleanup readback confirmed its exact owned Agent
and Run absent; this reconciliation does not replace the original failed grade.
No useful artifact or accepted finish was obtained.

Two observed defects are repaired on candidate `8e4c587102`: Core authority now
uses the actual selected private listener for internal HTTP calls, and the
provider facade preserves native tool names, actual status and bounded/redacted
result output. Native calls use the builtin facade without inventing MCP/process
transport or widening raw argument logging. Six Core routing controls and real
Rust/PRP tool projection checks passed. The official MCP SDK also completed exact
discovery and tool calls through the callback route, relay and Unix bridge.
Returning GET 405 instead of 404 removed unsupported-stream error notifications;
this was protocol noise, not a demonstrated cause of the failed task. Cleanup
now independently verifies remote absence and retains authorization failures.
The combined 18 MCP/observer checks and E2E typecheck passed.

The required full build passed on `8e4c587102`. Earlier full test runs that spanned
source changes remain incomplete and are not green qualification. Two failures
in such a run passed individually in fresh processes on this frozen candidate;
cache versus test-order effects remain unresolved pending full-file controls.
One existing Rust receipt-limit check failed under the concurrent target and
passed unchanged in isolation; its exact cause is not asserted. All 31 native
backend checks passed. Keep these original failures in the verification record.

Candidate `2264a82646dda33e159bf1b95c528f4e383b987c` froze the Runner and
product integration in two local commits. The first `task-artifact` campaign,
`cursor-cloud-local-20261028-artifact-1`, found a setup divergence before any
provider prompt: `assertHarnessTestPassed` rejected the successful Cloud
account-catalog receipt because the experimental result has warning status.
The normal saved Test reported its correct informational checks, but lifecycle
verification kept the fresh agent paused, so ordinary task dispatch never
started. The original attempt is retained and was stopped for diagnosis rather
than allowed to consume its task deadline. No Cloud Agent/Run ownership notice
existed at diagnosis. Teardown later observed one local queued run, but no
Cloud checkpoint/create intent existed anywhere in the retained private runtime
tree. Interrupting the waiting browser worker retained its original failed grade
and unconfirmed-cleanup result; its server and database exited. This is not a
passing remote-cleanup observation. C1's connection proof remains valid, but
usable fresh-agent admission is not yet qualified.

The lifecycle regression first failed both listed/unlisted model cases (28 other
cases passed). The fix recognizes the informational Cloud account-ready receipt
for the native Runner adapter while preserving the experimental warning and
all authentication/failure guards. All 30 focused cases then passed. This does
not turn the recommended model catalog into an allowlist or claim a prompt
response. Evidence impact: the Runner/runtime package bytes are unchanged;
repeat fresh-agent setup and the artifact cell against the new application
candidate, retaining the original setup failure.

The second campaign, `cursor-cloud-local-20261028-artifact-2`, used candidate
`c011eb97cf10124b679a0c07779137db5750f320`. Fresh-agent lifecycle reached ready
and ordinary task dispatch reached native Runner. Its first divergence was
local PRP admission: `run.prepare` timed out, with zero control-plane connections
and repeated WebSocket 404/500 responses. Startup had advertised the public
callback-only origin to the local Runner. The narrow proxy correctly refused
that unrelated route. No Cloud checkpoint/create intent or remote ownership
notice existed, and no owned Runner/sidecar process remained after teardown.
The original failed result and cleanup-uncertainty grade remain retained; no
provider prompt or vendor cost is asserted from a local running row. Correct
the server's private PRP listener origin while retaining its public callback
origin, then rerun the same bounded artifact cell.

The startup fix now supplies the actual private HTTP listener host and selected
port to PRP registration. Public auth/runtime URLs retain their existing meaning;
remote transports retain their separate advertised endpoints. Twenty-six focused
runtime-origin, HTTP and PRP tests passed, and server typecheck passed. The next
artifact attempt must verify this boundary through the full product.

A test-only replay injector is ready for C5. Its 28 controlled tests exercise the
actual Driver/Client, one SSE cut after a complete native event, exact saved
Last-Event-ID, ordered withheld-frame recovery and deduplication. It preserves
and restores exact proxy bundle bytes and records only owned identity/cursor
digests. This is supporting proof only. A future live treatment must record both
bundle hashes, require the normal product result and grade real reconnect proof;
it adds no provider prompt to the selected continuation cell.

The local restart also reproduced a test-drive bootstrap bug: it used the public
callback-only `server.apiUrl` and stopped after a 404. Bootstrap API and browser
now derive their local origin from the actual started listener. Both IPv4/IPv6
regressions first failed; all 38 CLI tests and CLI typecheck then passed. The
same saved local instance remains the user-facing test environment. Repository
comment-policy cleanup changed no logic; in-memory CJS/ESM proxy bundles remained
byte-identical and the existing Grok identity check still passed. Rebuild and
record the final Rust artifact identity before carrying package proof forward.

The isolated development instance completed the ordinary Cursor Cloud setup path
through Save & exit, roster, agent overview, and Harness / Runtime reload. The
saved agent retained native Runner, repository, explicit model placeholder, and
organization-secret reference. It stayed paused with no provider session or run.
Missing-model and missing-key checks were visible. Test then reported the missing
public callback, before any provider prompt. These are local configuration
controls, not a successful authenticated Cloud setup or task.

That walkthrough exposed two defects now covered by regressions: shared
normalization injected `codexPermissionMode` after valid Cloud conversion, causing
HTTP 422 on save; the generic runtime form also exposed unsupported Thinking
effort. The fixed route regression executes PATCH, GET, resave and actual provider
parsing. Explicit incompatible user configuration remains rejected. Existing
Codex, Claude, Grok, Dot and Pi cases retain their behavior.

Supporting verification on the current source includes:

- 275 Runner tests across provider, native backend/launch/contracts and the
  existing semantic bridge; this includes the 26 driver-owned cases above and
  12 real loopback Cloud-client cases.
- Eleven executor cases cover actual Cloud admission, selected transport and
  credentials, owned artifact root, relay revocation and unknown accounting.
  Three runtime-helper cases exercise private files and a real Unix HTTP peer;
  three relay cases cover authentication, scope, expiry and revocation.
- Three explicit Product E2E cells are discoverable: task/artifact, same-Agent
  question follow-up and active-run UI Stop. Their 86 supporting cases and
  complete E2E TypeScript check passed. Missing configuration blocks before
  credentials or provider work. The suite refuses public history publication.
- Rust provider lifecycle and shutdown tests passed, including a regression that
  first reproduced process reuse and then proved a fresh sidecar with the same
  durable thread. Per-turn product execution does not retain a warm daemon.
- The Grok immutable profile advanced to v8 because its bound shared Runner
  configuration source changed. The historical v7 identity is preserved and
  remains decodable; this is an identity refresh, not new live qualification.
- `pnpm -r typecheck` and `pnpm build` passed. The first build stopped at the stale
  Grok identity; the next exposed invalid new test fixture types. Both failures
  were corrected. An earlier full test run was interrupted; the final
  `pnpm test:run` run is pending and cannot yet be claimed green.
- Token gates, map structural checks, and generated protocol checks passed.

The clean private Runner candidate tarball contained 1,696 entries and no
`node_modules` or symlinks. Its extracted proxy completed real stdio and Unix MCP
framing, exact synthetic tool input/result, controlled HTTP/SSE terminal lookup,
confirmed shutdown, socket cleanup and exit zero. Both proxy bundles matched
source and referenced only Node builtins. This proves that candidate's runtime
closure, not an ordinary public Paperclip installation or live Cursor work.

| Candidate artifact | SHA-256 |
| --- | --- |
| Private Runner tarball (14,012,694 bytes) | `7d06c80239725b36241db7fb96a6127efc757ae367b0f20843641a0544b9ed3d` |
| Packaged local daemon | `4492f56745b93392b89e016d2907478ebabcf1025099f79222d66a38dfc8f083` |
| Cloud CJS proxy | `2ccfd84f1acd7e2d15b85b1b772e46a6497b1febbe80c0fb85d6b4f59e909687` |
| Cloud ESM proxy | `a582f2b9c1075cfc2185b7d9351072dd06c6d4ae1744f7110873945a10053429` |

The observed controller platform was macOS 26.5.2 build 25F84, arm64, with Node
26.4.0. Node remains an operator-supplied runtime. Its observed 26-file dynamic
library closure digest was
`ce8e6d8d7e9845600a853d7d675810268c29126b6deaafdcc1337a4213c05c48`;
it is not a newly bundled or pinned Node distribution. Retest artifact identity
after a build input changes. No merge, public package install, publication, or
deployment has been performed.

The tarball proof was refreshed after the README's hosted-secret guidance changed.
README.md was the only changed extracted entry; all runtime artifact and Node
closure hashes remained identical. The full controlled packaged round trip and
shutdown proof passed again. The earlier tarball digest
`38bc7632101bdc890591dd58dfb9c75a0956a0c5f1db64c55d963af86c01a1ba`
is retained as historical evidence, not the current candidate archive.

Rollback means disabling fresh experimental admission or selecting the existing
legacy runtime for future work. Do not rewrite persisted run selection or erase
history. Existing native runs still need their cancellation, reconciliation, and
finalization paths. No merge, publication, deployment, or live completion claim
has been made by this plan.
