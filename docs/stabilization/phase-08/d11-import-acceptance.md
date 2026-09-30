# D11 import prerequisite acceptance

**Initial accepted source:** `d14afe8ee2075448fe5010e32fc0a57d299d62c8` against integrated
main `b84e17fa8eb698767e57d2b20d296b5f90b2f1db`. Acceptance also covers the
accompanying EVIDENCE/TODO updates and all **97 artifacts**: **54 baseline** and
**43 final** files in [the import evidence directory](d11-import-browser/).
The complete reviewed delta contains seven source/test/recipe/work-record inputs
plus those artifacts. No actionable finding remains; the wording now correctly
bounds ten history lookups, each of which may paginate.

**Review-fix acceptance:** This receipt also accepts source
`27f8679ee89db43f3b54b35677d5b98426e8ce80` against
`16db81b6c3a5f9b96311fe5faef3f2550f62678d`: four source/test/recipe inputs,
the accompanying EVIDENCE correction and all **19 review-fix artifacts** in
[the replay directory](d11-import-browser/review-fix/). Together the three
evidence directories contain **116 artifacts**. The intervening normalization
of `scoped.csv` and `wide-501.csv` changes only CRLF to LF; parsed records are
identical. No actionable finding remains in the reviewed fix.

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
the same Organization after loading. The review fix below closes the earlier
outer-workspace pending interval. Real Supabase query construction with a finite fake
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

The hosted finding exposed an interval before a replacement workspace loads.
The review fix invalidates imports at outer pending without setting completion
loading; actual target `startLoading()` and `load()` also advance the generation.
Read-only review caught a loading regression in the first fix, reproduced by
the implementing agent. The corrected real-layout tests cover response/body
delivery before replacement resolution and same-Organization unchanged-snapshot
recovery: stale imports reject, no second chunk is sent, saved rows remain exact,
children return and loading is false. This and A→B→A are deferred component/store
proof, not native timing observations.

The implementing agent's affected native replay binds `27f8679e` to digest
`ed6efbd224367fd8751017d7135e1d0a502c50f33ff08294c9980356c1e6ef00`,
origin `http://127.0.0.1:36455` and session
`ab956f8f-ae90-4306-9cee-e1f92fcc950c` in its
[launch](d11-import-browser/review-fix/launch.json) and
[final doctor](d11-import-browser/review-fix/final-doctor.json) receipts. The real
first 500 dates persist while their response is held. After Escape and the visible
switch to B, the [recorded network inventory](d11-import-browser/review-fix/completion-network.txt)
covers both pages and records one completion POST to A, with no second or B POST.
Independent artifact comparison confirms A's held/released rows match exactly,
its original row remains exact, and the 500 new rows match the first 500
dates/methods/validators/notes in the unchanged
[dated CSV](d11-import-browser/final/dated-501.csv). The last date/note is absent,
all IDs and Person/task/date keys are unique, and B's before/after rows match.
The [B screenshot](d11-import-browser/review-fix/b-released.png) and snapshots
retain only its own Foreign Person/task and no record/import controls. A's
[return/reload](d11-import-browser/review-fix/a-return-reloaded.txt) retains the
current seed completion and Able50%; older imported dates do not replace it.
Control summaries and snapshot excerpts faithfully retain their local raw
observations, and reviewed artifacts expose no credentials. Doctor, seed cleanup
and owned-session cleanup receipts pass. No replay toast or native outer-promise
interval is claimed. The unchanged server retry proof above remains applicable;
retry was not repeated in this replay.

The supplied review-fix logs report four files / 17 focused tests and zero type
errors/warnings. Full CI passed at `16db81b6` with 596 files / 5,218 tests; CI and
completed hosted review for the updated candidate remain pending merge gates.
This agent reviewed source and artifacts; it did not independently execute these
tests or native flows. No shared hydrator, SQL or other feature changed.

**Issue limit:** This accepts the bounded import prerequisite only. #1359 still
requires completion operations, history/readiness/report/read-model ownership,
consumer migration, obsolete-path removal and integrated acceptance. No issue
closure, SQL/schema/RLS change, migration, deployment or performance timing is
accepted here.
