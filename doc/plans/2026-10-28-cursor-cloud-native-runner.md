# Cursor Cloud on native Paperclip Runner — 2026-10-28

Owner: the lead integration agent in this task; delegated owners cover the Cloud
API client and this research/acceptance record. The lead owns integration,
qualification, review, and the final handoff.

Source baseline: `25f1070fbdabd96b26cdf199e624a77905f3ca37`.
Branch: `codex/cursor-cloud-native-runner`.
Target: a reviewable PR with experimental, local-first native Runner support.
Merge, package publication, production rollout, and automatic conversion of
existing agents are separate actions, not completed or implied by this record.

Current delivery: [draft Runner core PR #18068](https://github.com/paperclipai/paperclip/pull/18068),
with product activation being prepared as a dependent PR. The serving local
candidate is `3050fa41a933`; neither PR is merged. Saved real-account setup has
passed, but useful task completion, registered output, continuation, live replay,
and active Stop have not passed. The latest Sonnet control has exposed a concrete
staging-to-Core path mismatch; fix and independently reproduce that boundary
before another paid artifact attempt. Preserve the earlier Mini failures.

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
on 2026-10-28. Task acceptance remains unqualified. Record binding identifiers only;
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
  authority, then returns the result. Do not add a parallel PRP command. This is
  an implementation choice, not evidence that the bridge has run successfully.
  The lead is integrating the relay so hosted Cursor can reach only the admitted run's tools.
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
**documented**, **source-observed**, **unverified**, and eventual
**product-qualified**. No authenticated observation or passing product cell is
claimed here.

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
this campaign; `Unsupported` means no product promise. Every implementation and
product qualification column starts unverified. A planned mapping is not a
support claim. Cloud v1 means the documented API as researched above; SDK means
the exact inspected 1.0.28 package.

| Capability/field | Exact harness/version/mode | Native evidence | Transport/wrapper | Runner mapping | Durable product/UI | Qualification | Loss/reason/next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth/key identity | Cloud v1 | Documented | HTTP auth | Planned admission | Saved binding/Test | Unverified | Required; check real account |
| Entitlement/repository access | Cloud v1 | Unverified for account | API errors | Planned actionable failure | Reopen/reconnect | Unverified | Required setup |
| Protocol/version discovery | Cloud v1 beta | Documented; mutable | Pin client contract | Planned compatibility | Diagnostic identity | Unverified | Required; retain candidate revision |
| Model catalog/parameters | Cloud v1 | Documented | HTTP discovery | Preserve explicit input | Saved model/params | Unverified | Required; no fallback |
| Exact model acknowledgment | Cloud v1 / SDK | Source-observed absent/echo | No receipt | Submitted identity only | Experimental limit | Unverified | Authorized exception |
| Default/Auto routing | Cloud v1 | Documented | Provider routing | Preserve caller choice | No fixed-model claim | Unverified | Outside acceptance model |
| Agent/Plan modes | Cloud v1 | Documented | Request mode | Explicit supported modes | Saved selection | Unverified | Agent required; Plan decision unsupported |
| Reasoning/context params | Cloud v1 | Documented catalog shape | Per-model values | Preserve values | Selected configuration | Unverified | Outside required cells |
| Exact instructions on create | Cloud v1 | No digest receipt | Prompt content | Bind submitted content | Experimental limit | Unverified | Required under exception |
| Instructions on continuation | Cloud v1 | No digest receipt | New run prompt | Refresh admitted content | Saved current instructions | Unverified | Required follow-up |
| Assigned skills | Cloud v1 | Repo skills documented | Remote availability unknown | No inferred delivery | No qualified claim | Unverified | Inspect actual delivery |
| MCP discovery/execution | Cloud v1 | Documented | HTTP/VM stdio | Planned semantic relay | Authorized tool receipts | Unverified | Required real tool result |
| MCP refresh/reconnect | Cloud v1 / SDK | Configuration behavior documented | Re-supply on resume | Rebind scoped tools | Current authorization | Unverified | Required; revoke old access |
| Runtime secrets | Cloud v1 | envVars beta may be ignored and cannot accompany client Agent ID | Auth key and scoped MCP headers only | Reject other selected process variables | Configure hosted secrets in Cursor | Unverified | Required key/header delivery proof; hosted envVars unsupported |
| Host callback tools | SDK 1.0.28 Cloud | Source-observed local only | No Cloud callbacks | Use relay | No callback claim | Unverified | Unsupported route |
| Assistant text/boundaries | Cloud v1 | Documented | SSE | Planned ordered events | Task transcript | Unverified | Required normal task |
| Thinking visibility | Cloud v1 | Documented event | SSE | Existing visibility policy | Policy-controlled rendering | Unverified | Outside required cells |
| Tool identity/arguments/results | Cloud v1 | Documented; truncation possible | SSE | Preserve identity/loss markers | Activity and receipts | Unverified | Required; no invented payload |
| Tool errors/partial deltas | Cloud v1 | Rich updates documented | Schema/version-dependent | Preserve supported fields | Diagnostic events | Unverified | Verify actual shapes |
| Shell output/background work | Cloud v1 / SDK | Mixed documented/source evidence | Rich stream/status | Preserve active wait | Remain running | Unverified | Required status regression |
| Native permission approval | Cloud v1 | No API callback | Native tools auto-run | No interception | Explicit limitation | Unverified | Unsupported |
| Native question | Cloud v1 | No response contract found | No API callback | None | No supported claim | Unverified | Unsupported |
| Native plan decision | Cloud v1 | No response contract found | No API callback | None | No supported claim | Unverified | Unsupported |
| Semantic tool authorization | Paperclip native | Existing controller contract | Planned relay | Normal semantic dispatcher | Durable audit/effects | Unverified | Required positive/negative cases |
| Semantic questions/approval/plans | Paperclip native | Separate existing contracts | Relay feasibility pending | No native equivalence | Existing interaction surfaces | Unverified | Do not infer from MCP discovery |
| Todos/plans/revisions | Cloud v1 | Rich events not qualified | Provider translation | No invented capability | Existing generic surface only | Unverified | Outside required cells |
| Active steering/queue | Cloud v1; SDK absent | Documented API | HTTP delivery receipt | Preserve accepted/queued distinction | Current message delivery | Unverified | Outside required cells |
| Ordinary follow-up | Cloud v1 | Documented | Existing agent/new run | Stable session identity | Same task continuation | Unverified | Required |
| Interruption/replacement | Cloud v1 | Cancel/new-run primitives | Provider-owned sequencing | Ownership fence | Stop then continue | Unverified | No implicit simultaneous turn |
| Load/resume/history | Cloud v1 | Durable agent/runs documented | API identity lookup | Reattach existing work | Persisted IDs | Unverified | Required recovery boundary |
| Fork/compaction | Cloud v1 | Not qualified | No promised route | None promised | None promised | Unverified | Outside/unknown |
| SSE replay | Cloud v1 | Documented IDs/retention | Last-Event-ID | Ordered deduplication | No duplicate effects/replies | Unverified | Required disconnect case |
| Expired replay | Cloud v1 | Documented 410 | Terminal lookup | Reconcile bounded failure | Honest incomplete history | Unverified | Required deterministic case |
| Subagents/children | Cloud v1 | Custom agents documented | Rich identities not qualified | No attachment promise | No invented parent/child UI | Unverified | Outside required cells |
| File edits/diffs | Cloud v1 | Tools/git documented | Provider stream/git snapshot | Activity only until proven | Independent result check | Unverified | Do not trust agent summary |
| Images/inbound media | Cloud v1 | Images documented | Prompt attachment | Bound existing input | No broader media claim | Unverified | Outside required cells |
| Artifacts | Cloud v1 | Documented listing/download | Relative path/signed URL | Planned safe retrieval | Inspectable result | Unverified | Required byte verification |
| Usage/cache/subagent totals | Cloud v1 / SDK | Documented | Client usage API available | Production facade not wired | Usage/cost unknown | Unverified | Production accounting unsupported |
| Settled dollar cost | Current SDK docs | Documented eventual fields | API/schema divergence | Unknown until receipt | No fabricated zero | Unverified | Outside fixed-dollar guarantee |
| Per-run dollar ceiling | Cloud v1 | No enforcement contract | No admitted native cap | Existing budget gates only | Explicit limitation | Unverified | Unsupported |
| Idle/heartbeat/retry behavior | Cloud v1 | Partial documentation | Stream/recovery policy | Bounded activity | Quiet idle state | Unverified | No idle polling loop claim |
| Cancel/terminal status | Cloud v1 | Documented | Cancel + status lookup | Stop settlement | Durable cancellation | Unverified | Required active-work case |
| Late callbacks/effects | Paperclip native | Existing authority contract | Relay lifecycle | Fence stopped generation | No late task mutation | Unverified | Required negative case |
| Native process/VM cleanup | Cloud v1 | Hosted lifecycle opaque | Archive/delete available | No host-PID proof | State exact cleanup evidence | Unverified | No physical cleanup claim |
| Local relay/stream cleanup | New integration | Planned owned resources | Close/expiry | Bounded shutdown | No lingering local work | Unverified | Required |
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
| C1 Setup | Fresh configure; save/reopen/Test/reconnect | Correct saved runtime/model/binding; useful credential failure; real account test; no launch merely on read | Original 2264a82646 lifecycle failure retained; c011eb97cf fresh agent reached ready and dispatched; a1e6d247ba saved UI Test passed again after controller restart with real key/catalog/model and expected warning | Passed | Keep ordinary local restart operational |
| C2 Task delivery | Ordinary task using real semantic tools | Provider activity; exact submitted content; authorized tool result; durable task finish accepted by controller; independently checked output; cleanup | Campaigns 1–3 failed before Cloud prompt; campaign 4 reached hosted work and 16 Core calls but internal REST used the callback origin and the six-minute deadline cancelled it; campaign 5 runs on repaired candidate 8e4c587102 | Failed; retry active | Check independent task/artifact acceptance; retain all original grades |
| C3 Continuation | Follow-up on existing task/session | Same Cloud agent, distinct Cloud run; current instructions/tool grants; visible reply and durable result without duplicate work | Not frozen; none | Unattempted | Lead: verify resume identity |
| C4 Stop | Stop while provider work is actually pending | Cancel exact run; observe provider terminal state; close local resources; later relay calls/replays cannot mutate task; bounded observation recorded | Not frozen; none | Unattempted | Lead: live Stop plus deterministic race proof |
| C5 Replay | Disconnect/reconnect and retention expiry | Resume cursor; stable order; no duplicate effect/reply; expired stream reconciles through known run without a new paid prompt | Not frozen; none | Unattempted | Lead/client owner: deterministic then live disconnect |
| C6 Artifact | Download provider-produced result | Listed relative artifact; safe retrieval; independently verified bytes; usable Paperclip result access after settlement; cleanup recorded | Not frozen; none | Unattempted | Lead: ordinary user result path |

Current total: **1 passed, 1 failed, 4 unattempted, 0 setup-blocked of 6 required**.
A user-approved 30-day key now authenticates to the real Cloud model catalog and
is bound privately in the paused local fixture. The user approved the callback
tunnel and access to the new private README-only fixture repository. Both are
configured, and a fresh authenticated repository preflight confirms access.
The saved product Test passed after reopening across a controller restart. An
initial Test failure was traced to test-drive intentionally discarding ambient
PAPERCLIP_* routing variables; saving auth.publicBaseUrl in its isolated instance
configuration supplied the callback origin. This was setup repair, with no
production-code change or provider prompt. Task delivery has three retained
pre-prompt failures and one failed hosted attempt. Its exact owned Agent and Run
were independently absent (HTTP 404) after cancellation/deletion; the original
cleanup-uncertainty grade remains retained. Campaign 5 is active with exact owned
identity persisted privately for recovery. The other four downstream gates remain
unattempted. Hosted billing is unknown; no zero-cost claim is made.
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
| Native driver/semantic relay | Driver-owned controlled suite: 26/26 passed 2026-10-28; runner TypeScript check passed; no live-provider claim | Lead | Integrate full checks and execute the six live cells |
| Credentials/model/budget | Real key privately bound; catalog/repository access and hosted execution observed; scoped tunnel approved; cost unknown | Lead | Preserve explicit model and owned cleanup for each paid attempt |
| Candidate/evidence | Three pre-prompt failures and four hosted artifact attempts retained; draft Core PR open; no merge or publication | Lead | Repair the observed stage-to-Core boundary, then repeat the ordinary artifact cell |

The saved product Test and reconnect succeeded with real account/catalog access.
The next gate remains the ordinary artifact cell after the observed handoff
repair. Each paid task must be small, have a known output,
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
