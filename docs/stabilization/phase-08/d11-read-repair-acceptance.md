# D11 wide-read prerequisite acceptance

**Accepted source:** `6a5ea6c42e88126bd052c09a2db00570631dc2a7` against merged
import-repair main `b2dbae09fc059e1c94a936349ad9cf8adeb63f1f`. Acceptance covers
the complete read-repair delta: five application/helper/test inputs, the recipe,
EVIDENCE/TODO updates and **45 durable artifacts**: **21 failed baseline** files
under [baseline](d11-cutover-browser/baseline/) and **24 repaired replay** files
under [read-repair](d11-cutover-browser/read-repair/). The accompanying uncommitted
proof and work-record updates were reviewed with the frozen source. No actionable
finding remains in this bounded intermediate repair.

This independent agent reviewed source, tests, direct/reverse callers and actual
artifacts, including downloaded workbook parsing, full provider-row comparisons
and screenshots. It did not execute live flows or application tests and does not
claim model diversity. The implementing agent supplied the native worker-2 proof.
Its [launch](d11-cutover-browser/read-repair/launch.json) and
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

**Issue limit:** This accepts the wide-read baseline repair only, using
`Refs #1359`. Completion operations, history/readiness/report/provider ownership,
public caller migration, all nine remaining legacy entries and integrated D11
acceptance remain outstanding. No issue closure, Calendar implementation,
migration or deployment is accepted here.
