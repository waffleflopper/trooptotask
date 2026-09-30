# D11 wide-read prerequisite acceptance

**Current accepted source:** `bbf64a6fd1b5d3472ee3febba4f16f93593e2b84` against
integrated Training main `284ddcd3c113117d9eab8b526c841a4fb21ae065`. This supersedes the merge candidate in the
initial acceptance of `6a5ea6c42e88126bd052c09a2db00570631dc2a7` against
`b2dbae09fc059e1c94a936349ad9cf8adeb63f1f`; its unchanged evidence remains applicable.
Acceptance covers the complete read-repair source/test/helper/recipe delta,
EVIDENCE/TODO updates and **68 durable artifacts**: **21 failed baseline** files
under [baseline](d11-cutover-browser/baseline/), **24 initial repaired replay** files
under [read-repair](d11-cutover-browser/read-repair/), **13 integration** files
under [read-integration](d11-cutover-browser/read-integration/) and **10 review-fix**
files under [read-review-fix](d11-cutover-browser/read-review-fix/). The accompanying
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
history. The two accumulation sites used array argument spread; supplied
regression logs reproduce both `RangeError` failures with 150,000 records. Source
`b68cc7ef` appends individual rows at both sites without a flattened copy, retaining
four-window concurrency, order, full history and required-read failure behavior.
The final fixture correction in `bbf64a6f` asserts the returned public monthly
percent instead of an unreturned count. Two public Dashboard-summary cases
exercise the remainder and full-window accumulation paths with one and151 People.
Expected January/March percentages are independently100% and1%, respectively,
with February0%. These are lower-level capacity and historical tests, not native
150,000-row or database-uniqueness proof. Final supplied logs show **two files /
18 tests passing** and zero type errors/warnings. Local CodeRabbit reviewed the
two source/test files at `b68cc7ef` with no findings; the subsequent fixture-only
correction was independently reviewed here.

The affected native [restart](d11-cutover-browser/read-review-fix/restart.json)
and [doctor](d11-cutover-browser/read-review-fix/final-doctor.json) bind current
source to digest `402e6b18a52e247fccf55b63f00f1fcab02f9fdbb6958907e2520a4cc287f76d`,
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

**Issue limit:** This accepts the wide-read baseline repair only, using
`Refs #1359`. Completion operations, history/readiness/report/provider ownership,
public caller migration, all nine remaining legacy entries and integrated D11
acceptance remain outstanding. No issue closure, Calendar implementation,
migration or deployment is accepted here.
