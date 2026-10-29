# Preserved chat catalog source

This branch consolidates reviewed eval changes for all **244** frozen scenarios:
242 lazy catalog entries and the two existing standalone chat flows. It preserves
source implementations, controls and evidence contracts. It does not establish
that all scenarios are ready to run or that this composed head has passed a live
campaign. The machine-readable inventory is `chat-catalog-preservation.json`.

The production baseline remains `39e811c9c5226979fce42e052a27cfb28301018a`.
No production, workflow, lockfile or SDK source change is included. The real
new-company, formal-hire and routine-history definitions retain prerequisites
18103, 18105 and 18033 respectively. Those focused fixes are excluded here; their
candidate outcomes remain separate from frozen-baseline qualification.

Composition preserves the per-scenario descriptor union, both independent SDK
privacy and new-company security sections, the final formal-hire clock module,
and the stronger shared Notes provider used by status cards and routine history.
The accepted original-deadline and multipart controls are included, as is the
new-company successor's original phase deadline and remaining-time wizard clamp.
Frozen queries, contexts, outcomes, turn/human counts and overall caps are retained.

Readiness is separate from importability. Declared unsupported fresh contexts,
public capability/profile gaps and external resource/authorization requirements
remain explicit. The preserved plugin configure/disable fixture still has a known
secret-ref schema mismatch: it sends an object where its public string schema
requires a secret UUID. Disable's returned final reached that setup request and
received HTTP 400. Configure's returned final stopped earlier while waiting for
the initial chat response; its later UI/configuration leg was not exercised, so
the schema mismatch there is a source finding. Both spent raw failures remain
unchanged and are not rerun by this consolidation. Other measured failures retain
their actual interpretation.

Every historical result remains attached to its original source revision, full
fingerprint, provider/model/build/database evidence, ordinal, usage, cost, privacy
and cleanup. The integrated source changes broad fingerprint closures; none of
the older qualified passes is transferred to this head. No attempt budget is reset,
and no live launch or publication authority comes from this source preservation.
