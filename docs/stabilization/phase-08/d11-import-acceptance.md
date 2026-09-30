# D11 import prerequisite acceptance

**Accepted source:** `d14afe8ee2075448fe5010e32fc0a57d299d62c8` against integrated
main `b84e17fa8eb698767e57d2b20d296b5f90b2f1db`. Acceptance also covers the
accompanying EVIDENCE/TODO updates and all **97 artifacts**: **54 baseline** and
**43 final** files in [the import evidence directory](d11-import-browser/).
The complete reviewed delta contains seven source/test/recipe/work-record inputs
plus those artifacts. No actionable finding remains; the wording now correctly
bounds ten history lookups, each of which may paginate.

This independent agent performed read-only source, test, caller and artifact
review, including actual workbook parsing and screenshot inspection. It did not
execute live flows or application tests, and does not claim model diversity.
The implementing agent supplied the owned worker-2 native observations. Final
proof binds source above to digest
`0eafd5f7eea80ef1a9c67c8201625daae88087c454711a3d4c4079a22ca24f4b`,
origin `http://127.0.0.1:43957` and session
`95623559-c3a8-4586-8aab-2055f7657f1a` in the
[launch](d11-import-browser/final/launch.json) and
[final doctor](d11-import-browser/final/final-doctor.json) receipts.

The repair bounds both resolved Person/task reference filters, authorizes matched
People before lookup fanout and finishes all required history reads before any
mutation. Same-date upserts, the 500-row limit, partial writes and audit behavior
remain. The owner-local client generation rejects old imports before merging or
continuing after workspace replacement; it captures the original Organization.
Six deferred response/body cases protect switching, returning to A and replacing
the same Organization. Real Supabase query construction with a finite fake
transport budget protects 500 distinct People and 500 tasks, mixing new rows and
same-ID updates. Required-history failure proves zero writes/success audit. No
shared-store abstraction or new private cross-owner import was added.

Artifact review establishes:

- [Wide import](d11-import-browser/final/wide-failure-requests.json): the real
  first 500 succeed; a synthetic second-chunk 503 retains the review/error state.
  [Retry](d11-import-browser/final/wide-result.txt) visibly updates 500 and creates
  one with zero failed. Exact provider comparison retains all 500 IDs and submitted
  dates/methods/validators/notes, adds exactly one ID, and has no duplicate
  Person/task/date key. Reload agrees. Helper cleanup preserves the original
  completion exactly while removing its registered seed completions.
- [Held import](d11-import-browser/final/switch-network.txt): after the real
  500-row response persists, B remains view-only with its own Person/task and no
  subsequent completion POST. B's provider rows match exactly before/after.
  Returning to A and retrying retains all 500 IDs, adds the last dated row and
  reloads correctly. Already issued A writes persist; this is not transaction
  rollback. A→B→A and same-Organization replacement remain lower-level proof.
- [Scoped CSV](d11-import-browser/final/scoped-preview.txt) admits Able and
  excludes Baker/unassigned; one row persists and reloads. Viewer has no write
  controls; empty scope has no People. Bound valid batch probes return viewer403
  or zero-write row errors, including separately tested foreign Person/task
  references. All 503 existing A rows match exactly before/after denials.
- Applicable unchanged baseline evidence retains permission narrowing,
  read-only archived history and exact denial readbacks. Parsed report workbooks
  show compound Alpha100% and empty0%; the matrix workbook contains only
  Unassigned with Not Recorded/Expired cells. Snapshot excerpts and summarized
  control JSON faithfully retain their raw observations; screenshots show
  synthetic data and reviewed artifacts expose no credentials.

The implementing agent reports focused 4 files / 23 tests, zero type diagnostics,
format/governance checks and local CodeRabbit with zero findings. Doctor/cleanup
receipts pass. Exact published-candidate full CI and completed hosted review
remain merge gates; this receipt does not certify future results.

**Issue limit:** This accepts the bounded import prerequisite only. #1359 still
requires completion operations, history/readiness/report/read-model ownership,
consumer migration, obsolete-path removal and integrated acceptance. No issue
closure, SQL/schema/RLS change, migration, deployment or performance timing is
accepted here.
