# D11 final ownership acceptance

**Accepted source/artifact candidate:** `99146c8cd4b84783765510be512b4c077bc9dfdf`
against merged main `f536463e2e0a007599d6246bbf52634de903c082`, including the
accompanying final evidence and work-record changes. This independent agent
reviewed the complete D11 source/test delta, approved #1359 requirements,
direct/reverse consumers, removals and actual artifacts. No actionable finding
remains in that scope. This is source/artifact acceptance, not independent live
execution, independent application-test execution or model diversity.

The implementing agent supplied the native worker-2 proof. Its
[launch](d11-cutover-browser/final-owned/launch.json),
[initial doctor](d11-cutover-browser/final-owned/doctor-before.json) and
[final doctor](d11-cutover-browser/final-owned/doctor-final.json) bind runtime
`13cf380e358a0a74e5f2122ab17506aa37a011f7` to digest
`0404e53b80cf91b2203cfcaf2f1ec3f903502b7b2e1e97d57bed51d27047fc90`,
origin `http://127.0.0.1:37577`, session
`fcfaaa4f-7b54-4be5-bdce-5d44fe569273` and Chromium152.0.7977.82.
The reviewer confirmed `git diff 13cf380e -- src scripts .agents` is empty after
main integration at99146c8c. The native inputs therefore apply to this integrated
source. [Owned cleanup](d11-cutover-browser/final-owned/cleanup.json) passes.

The [comparison](d11-cutover-browser/final-owned/comparison.json) indexes **96
durable files**:93 selected captures and three derived records. Independent raw
comparison confirms90 byte-identical captures and three wide JSON captures with
identical parsed values; no capture has a material change. Only the large raw
wide-preview snapshot is omitted. Actual actor helper outputs and exact executed
request bindings are retained separately; they were transcribed after the calls,
not replayed. Reviewed text/JSON/CSV and screenshots expose no credentials.

## Source and consumer acceptance

Critical Tasks owns single create/update/prepared-delete and batch completion
operations, history/report/workspace queries, mapped Supabase/latest and test
read models, consumed portable contracts and status presentation. Page, API,
store/import, matrix/report/workbook, streamed Dashboard and reverse Personnel
readiness consumers use the public portable/web/server seams. HTTP admission,
JSON/UUID handling and production provider/auth composition remain in delivery.

The operations preserve dedicated permissions, tenant and Group scope, existing
record/archive guards, replacement Person/task validation, dates, stable IDs,
null clearing, protected identity/logging fields and successful-write audit/effect
semantics. Dated POST creation remains distinct from same-date batch upsert.
Request-local reference caching does not skip authorization. Canonical completion
recency/key/status rules replace parallel matrix/modal/detail rules; completion
date and logged/update time retain their different meanings. Historical report
calculation still considers every applicable dated record at its own as-of date.

History metadata lookup now bounds501 task IDs and retains archived definitions.
Report filters retain50-ID windows, at most four concurrent reads, complete dated
history and required-read failure behavior. Latest RPC and history/report paging
retain stable total order and all1000/1003 records. The owned fake maps the same
portable DTO and latest rules. Generic test context builders accept an explicit
read-model factory; the actual latest-model callers bind the public owned factory,
and an unbound port rejects rather than silently returning invented data. This
avoids provider-to-feature imports and reverse bootstrap cycles.

Replaced central completion-batch/history/report/read-model implementations,
the global fake, dead alternate summary/trend closure and the old Critical Tasks
badge export are removed without compatibility shims. All ten CT manifest file
declarations are removed: nine original legacy entries plus the later provider
test, now located under the owner. Training's public Dashboard consumer and the
neutral Shared workbook implementation remain integrated. D24/D25/D28 retain
broader Organization export, retention and provider infrastructure obligations.
No checker, scan, dependency exception or permission was weakened. SQL, RLS,
schema and required migration/security provenance are unchanged; this cutover
requires no remote migration.

## Artifact and behavior acceptance

The reviewer parsed all five actual downloaded workbooks, checked their hashes
against the comparison, compared provider rows by every value and inspected the
native snapshots and all three screenshots. These observations support the
following bounded acceptance:

| Behavior                        | Reconciled evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Save failure and recovery       | Failed Save retains its draft, records error-only feedback and leaves the original row exactly unchanged; retry adds one completion. A held existing edit keeps its ID and persists while feedback remains empty; release reports success and reload retains it. An unchanged-values save preserves identity/business values, without claiming identical timestamps.                                                                                                                                                                                   |
| Dates, clearing and history     | Warning → expired → restored warning produces Able100% →50% →100% on the same completion ID. Cleared notes persist as null. September14 Alpha remains latest despite a January1 import. Archiving the task presents both dated completions read-only and leaves every stored row value unchanged; restoration retains its definition.                                                                                                                                                                                                                  |
| Import and upsert               | The visible CSV selects three valid rows and disables one unknown-task row. Synthetic failed batch leaves exact rows unchanged; retry creates three. Same-date reimport updates the same three IDs, retains the older dated history and yields the exact five-row small fixture.                                                                                                                                                                                                                                                                       |
| Small matrix and reports        | Actual matrix has three People with the expected Current/Expiring Soon/Expired/Not Recorded/nonapplicable cells. Report arithmetic is3/5ready (60%), with one Person below70. The actual Alpha+68W compound report is2/2ready (100%). Report failure visibly retains prior data with an error; export failure captures no Blob before a successful actual download.                                                                                                                                                                                    |
| Dedicated lane and scope        | [Exact bindings](d11-cutover-browser/final-owned/input-bindings.json) connect actual [actors](d11-cutover-browser/final-owned/actors.json), valid known IDs/payloads, responses and readbacks. Viewer POST/PUT/corrected DELETE/batch return403. Scoped Baker POST/PUT/DELETE return403, Bravo report is an empty200, and allowed Able edit retains its ID. Empty scope shows no People and refuses writes. Foreign A access returns404; an A Person in B returns400. Training access alone returns403. All bound before/after row sets match exactly. |
| Reverse consumers and switching | Owner Personnel displays Able2/2/100%; Personnel-only shows Critical Tasks Unavailable. Held A summary release cannot replace B report/matrix or expose A names/write controls; returning to A restores its records. Dashboard finishes with no error/busy state; its Overview does not display the loaded CT KPI.                                                                                                                                                                                                                                     |
| Wide mapped reads and exports   | Visible import creates1002 rows with zero failures for501 registered People/two tasks. The1007 stored dated records equal503 Alpha +504 All-MOS by every value;1006 latest Person/task pairs exclude the older Able Alpha duplicate. Actual matrix has504 People and all501 seed All-MOS cells Current. A late-window Person visibly has100% readiness. Report UI, summary200 and actual workbook agree on504/506ready, rounded100%, all501 seed rows100% and Unassigned0%.                                                                            |
| Cleanup and preservation        | Registered seed cleanup leaves exactly the five small fixture records with every value unchanged from the pre-seed state. The original seeded completion remains exactly unchanged from the initial capture. Doctor and owned cleanup pass.                                                                                                                                                                                                                                                                                                            |

The workbook hashes are recorded in the comparison, including matrix-wide
`07f0dc0539a1ce99190a75e13e320b699a76f399875ba726c3625f562c90ce73` and
report-wide `3852497b2d6ee0b1ef402dfa785cfde6c007e14e9a7057027798d0b2723094ec`.
The wide denominator is independently specified:3 ready/5 applicable small
assignments plus501 ready/applicable seed All-MOS assignments gives504/506.
Seed Alpha records remain stored but are not applicable. Rounded100% does not
mean every assignment is ready; the two remaining gaps are preserved.

## Retained proof, limits and merge gates

The accepted preparation, [empty-scope](d11-empty-scope-acceptance.md),
[import](d11-import-acceptance.md) and [wide-read](d11-read-repair-acceptance.md)
receipts retain the unchanged affected baselines and prerequisite repairs.
Members permission refresh, archived-Person refusal and multi-chunk/ABA import
ceremonies reuse applicable accepted native evidence plus retained operation,
route and deferred-layout tests; they are not fresh native executions here.
Meaningful lower-level provider tests retain historical January100% → February0%
→ March100%, legal150150/151151-row capacity shapes, total-order regressions,
501-task metadata and wide Person/task URL limits. These are provider-transport
tests, not native huge-history/catalog or new SQL execution.

The initial viewer DELETE without a JSON body returned400 and earns no access
credit; corrected valid DELETE returns403. Its next row readback follows both
that call and scoped denials. The other-lane after-row equality uses the later
five-row readback after registered seed cleanup, not an immediate isolated read.
The foreign detail fetch's streamed shell returns200; actual navigation visibly
renders404 without Person data. Direct API/provider probes are separate from
visible UI interaction. Fresh switch evidence establishes visible read isolation;
it does not invent a separate B before/after provider comparison. No performance
timings, external deployment settings or remote execution are certified.

**Eleven real M08 foundation findings remain:** two private Web UI toast imports,
three chart-layout test imports and six private/undeclared App Shell orgContext
edges. They retain D26/D29 ownership, with D27 advisory context, in
[CURRENT_OWNERSHIP](../../architecture/CURRENT_OWNERSHIP.md) and
[DRIFT_LEDGER](../../architecture/DRIFT_LEDGER.md). This acceptance removes the
replaced CT implementations and their private/reverse consumers; it does not
declare M08 boundary-clean, activate those later cuts or hide debt through shared
root exports/reclassification.

Supplied results show the pre-final-order integration full suite passing600 files/
5243 tests. The reviewer read the integrated history/report/provider result:
three files/23 tests pass. Current local governance passes with862 retained
findings including the eleven above; type checking reports zero errors/warnings.
Local source review and complete formatting pass, without changing frozen runtime
inputs. These results do not substitute for **exact published-head full CI/build
and completed hosted review**, which remain pending merge gates. This receipt
accepts the final D11 source, coverage and work-record claims; only the authorized
green, review-clean closing merge completes #1359. No issue/phase closure or
deployment is certified by this receipt.
