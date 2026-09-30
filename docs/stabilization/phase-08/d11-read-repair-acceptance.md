# D11 wide-read prerequisite acceptance

**Current accepted source:** `5def08c0a7864bf5d556ada8d73348021098d1c0` against
integrated Training main `284ddcd3c113117d9eab8b526c841a4fb21ae065`. This supersedes
`bbf64a6fd1b5d3472ee3febba4f16f93593e2b84` and the merge candidate in the
initial acceptance of `6a5ea6c42e88126bd052c09a2db00570631dc2a7` against
`b2dbae09fc059e1c94a936349ad9cf8adeb63f1f`; its unchanged evidence remains applicable.
Acceptance covers the complete read-repair source/test/helper/recipe delta,
EVIDENCE/TODO updates and **83 durable artifacts**: **21 failed baseline** files
under [baseline](d11-cutover-browser/baseline/), **24 initial repaired replay** files
under [read-repair](d11-cutover-browser/read-repair/), **13 integration** files
under [read-integration](d11-cutover-browser/read-integration/) and **10 review-fix**
files under [read-review-fix](d11-cutover-browser/read-review-fix/) and **15 ordering**
files under [read-history-order](d11-cutover-browser/read-history-order/). The accompanying
uncommitted proof and work-record updates were reviewed with frozen executable
inputs. No actionable finding remains in this bounded intermediate repair.

This independent agent reviewed source, tests, direct/reverse callers and actual
artifacts, including downloaded workbook parsing, full provider-row comparisons
and screenshots. It did not execute live flows or application tests and does not
claim model diversity. The implementing agent supplied the native worker-2 proof.
The initial [launch](d11-cutover-browser/read-repair/launch.json) and
[final doctor](d11-cutover-browser/read-repair/final-doctor.json) bind the source to
digest `f9c2c9ce1cd9ff2b8a8851dc4f65f8e3db13849a71cebed0a4bb0a136a11355f`,
origin `http://127.0.0.1:37539` and session
`62c49e55-436c-4b9a-b4d8-5cd4e19dbbe0`.

Report reads bound both Person and task UUID filters, deduplicate their inputs
and permit at most four concurrent windows. Each window retains provider
pagination and all historical dates; failed required reads reject the report.
The latest-completion RPC now uses stable Person/task ordering and the existing
pager. Empty filters still avoid provider access. Synthetic row readback uses
stable-ID pagination while retaining its allowlist, Organization binding and
field restrictions. No authorization, SQL, RLS or schema change was introduced.

The retained baseline proves wide report/summary/export failures and a busy
Dashboard with an Error500 title. The separate latest-result baseline retains
1,003 persisted rows while the old unfiltered helper returns 1,000; its actual
504-Person workbook falsely marks two saved All-MOS cells Not Recorded. These
failures remain recorded as failures. The private URI-too-long log is not claimed
as durable log evidence.

Independent artifact review establishes:

- The repaired unfiltered readback equals the complete **502 Alpha + 501 All-MOS**
  union by every row value: 1,003 unique IDs and Person/task pairs. Compacted JSON
  copies retain identical parsed raw values. Cleanup leaves exactly the original
  completion, with every value unchanged.
- The actual [matrix workbook](d11-cutover-browser/read-repair/matrix-after-import.xlsx)
  has 504 People and all 501 seeded All-MOS cells Current at September29. Stored
  nonapplicable Alpha completions remain excluded from assignment arithmetic.
  The named late-window Person is visibly Current with 100% readiness.
- Before import, the actual report has one ready assignment out of 506, rounded
  to 0%. After import, the [report workbook](d11-cutover-browser/read-repair/report-after-import.xlsx),
  UI and bound summary/export probes agree on **502/506 = 99%**, all 501 seed
  report rows at 100%, three People below70 out of504, and Alpha at50% with one
  Person needing it. The 1,002-row CSV and visible successful import agree.
- Dashboard finishes without an error or busy skeleton. Its current Overview
  does not render the loaded Critical Tasks summary; no visible KPI is accepted.
  Doctor and owned cleanup receipts pass; reviewed artifacts expose no credentials.

The supplied logs show the unchanged report source failing three meaningful
cases, then **two files / 16 tests passing**. Real Supabase query construction
protects 501-Person and 501-task filters against a finite URL budget, scoped/empty
population and required-history refusal. Public report and Dashboard-summary
tests independently preserve January100% → February0% → March100% for one-month
tasks; this is lower-level historical proof, not a native historical replay.
RPC tests cover 1,000/1,003 records, filters on every page, empty inputs and a
later-page failure without partial data. The implementing agent reports zero
type errors/warnings. Exact published-head full CI and completed hosted review
remain merge gates; this receipt does not certify future results or timing.

The Training integration at `b0819d818aad502f6f6e30f794d506792fb006fb`
preserves both work records and both helper families. Against merged Training,
the helper delta is the accepted pager alone. The workbook utility moved from
`$lib/export/workbook` to `$lib/utils/workbook` with identical implementation;
Critical Tasks consumers use the new location. No Training feature acceptance
is inferred from this review. The integration
[launch](d11-cutover-browser/read-integration/launch.json) and
[doctor](d11-cutover-browser/read-integration/final-doctor.json) bind digest
`d5fb167430862fda6c3442897aa2c8cca3d8ff2024dbd5b1afe74fdb76263886`, origin
`http://127.0.0.1:41669` and session `d6728063-462a-46e9-8e29-457965a85fd9`.
All 13 copied files match their raw originals. Workbook hashes match the
comparison receipt; independent parsing confirms 504 People, 501 seeded All-MOS
Current cells and report rows at100%, 502/506ready (99%) and three below70.
The raw provider read has 1,003 unique IDs/pairs, matching the visible
1,002-created import plus the original record. Reports/API and Dashboard loading
agree; no visible Critical Tasks Dashboard KPI is claimed.

Hosted review identified that bounded filters still permit unlimited returned
history. The two accumulation sites used array argument spread; initial supplied
regression logs reproduced both `RangeError` failures with 150,000 synthetic records. Source
`b68cc7ef` appends individual rows at both sites without a flattened copy, retaining
four-window concurrency, order, full history and required-read failure behavior.
The final fixture correction in `bbf64a6f` asserts the returned public monthly
percent instead of an unreturned count. Those initial fixtures repeated a
constrained Person/task/date combination; their historical capacity result was
not database-uniqueness or native proof. The legal fixtures described below now
supersede them. At that checkpoint, supplied logs showed **two files / 18 tests
passing** and zero type errors/warnings. Local CodeRabbit reviewed the
two source/test files at `b68cc7ef` with no findings; the subsequent fixture-only
correction was independently reviewed here.

The affected native [restart](d11-cutover-browser/read-review-fix/restart.json)
and [doctor](d11-cutover-browser/read-review-fix/final-doctor.json) bind the then-accepted
`bbf64a6f` source to digest `402e6b18a52e247fccf55b63f00f1fcab02f9fdbb6958907e2520a4cc287f76d`,
origin `http://127.0.0.1:38633` and session
`51bd1f07-aa5f-4c64-a421-7f92721423b3`. The first launch remains explicitly
inconclusive because its fixture changed during build; no drive is accepted for
that attempt. All ten final copies match their raw originals. The restarted
504-Person report screenshot, summary200 and actual downloaded workbook agree
on1/506ready (0% rounded), and Dashboard finishes without error/busy state. This
replay exercises changed report accumulation; it does not repeat the earlier
1,003-row latest/import proof, whose adapter/helper inputs remain unchanged.
Doctor and owned cleanup pass. Reviewed new artifacts expose no credentials.
Current-head full CI and completed hosted review remain pending merge gates.

The `71a4298d` CI candidate failed governance because the new owned read-model
test lacked a manifest owner. Its passing application suite/build did not make
that candidate green. `89e1a4e3` declares the existing test under Critical Tasks;
the checker, dependency rules and exceptions remain unchanged. Supplied local
governance and all61 ownership regression tests pass.

Runtime `8a002617` gives report-history pages unique-ID ordering and Person-history
pages descending completion dates followed by ascending unique IDs. Reports still
retain every dated record. Corrected ordering fixtures at `98f40ff1` use valid
UUIDs, matching task references and unique Organization/Person/task/date keys.
Real Supabase client/store tests change incidental provider page order, then apply
the requested ordering. Removing only ID ordering reproduces three behavioral
failures: 1,001 distinct history captures instead of1,003, and January0% instead
of100% in report and Dashboard summary. Restoring ordering passes18/18; the root
combined read/history/RPC run passes **three files / 23 tests**. These are synthetic
provider-transport regressions, not native tied-page or SQL execution. History's
wide task-metadata lookup remains part of the pending owned cutover; the history
ordering fixture reads task metadata from memory.

Final test-only source `5def08c0` replaces the earlier deep-history fixtures with
valid UUIDs, matching Person/task references and 1,001 distinct dates per pair.
One Person with150 tasks yields150,150 rows in three filter windows;151 People
with one task yield151,151 rows in four. The real Supabase client/store reads
Organization- and reference-filtered synthetic transport pages. Both sets have
January1 and March15 captures for every applicable pair: independently specified
January100% → February0% → March100% follows their one-month expiration, while the
older2020–2022 dates supply none of that readiness. Replacing only both row-append
loops with their former array spreads reproduces `RangeError` at each distinct
accumulation site (**two failed / 13 passed**). Restoring the loops passes15/15,
with zero type errors/warnings. No native150,000-row or SQL proof is claimed.

The [ordering launch](d11-cutover-browser/read-history-order/launch.json) and
[final doctor](d11-cutover-browser/read-history-order/doctor-final.json) bind runtime
`89e1a4e32200499f507c7304bfb91df757276c15` to digest
`c047de7b3f4bd8053d6c6023d1a7051016defc4633a81302f103c4efe4eb6376`, origin
`http://127.0.0.1:43881` and session `3e80b0e8-a402-4254-85e0-c59f4203a606`.
The subsequent ordering/capacity fixture corrections change tests only, so this
native runtime proof remains applicable to the current accepted source. The15
new durable files comprise14 selected captures plus a comparison;13 captures
match raw bytes and the formatted observations JSON retains all parsed values.
Independent workbook parsing and hash/byte checks confirm initial20% (1/5), then
population504 and1/506ready, rounded0%, with all501 registered seed report rows
at0%. Screenshot/UI and recorded summary200 agree. Able's reloaded UI retains
September14 and Demonstration, and the provider capture retains the original
completion ID and values; no separate before/after equality is inferred from
that single provider capture. Actual Dashboard root finishes without error/busy
state; no visible Critical Tasks KPI is claimed. The attempted `/dashboard`
suffix404 remains a driver error before corrected navigation. This replay does
not repeat the unchanged1,003-row latest/import proof. Doctors and owned cleanup
pass; reviewed new artifacts expose no credentials. Exact published-head full
CI and completed hosted review remain pending merge gates.

**Issue limit:** This accepts the wide-read baseline repair only, using
`Refs #1359`. Completion operations, history/readiness/report/provider ownership,
public caller migration, all nine remaining legacy entries and integrated D11
acceptance remain outstanding. No issue closure, Calendar implementation,
migration or deployment is accepted here.
