# D11 empty-Group prerequisite acceptance

**Accepted candidate:** `a4effa235d69391faff596e9afbcf6ade643cc2d`, the complete
[#1424](https://github.com/waffleflopper/trooptotask/pull/1424) repair diff against
integrated main `79bbd77a8b6581d9dcf90765963fc3592981fe0a`. The independent review
agent accepted the source, tests, caller coverage, documentation, helper changes
and all **63** committed artifacts in
[the baseline/final/helper/integrated evidence](d11-empty-scope-browser/).
No actionable finding remained after the recorded wording corrections. This was
read-only source/artifact review, not independent live execution or model
diversity. The implementing agent supplied the owned native runs.

The bounded shared M15 Access repair preserves explicit `groups: []` through
member editing, storage and trusted projection. Mapped scoped-store reads return
null/empty/count-zero before provider access. Organization scope and positive
Alpha access remain distinct. The unnecessary provider-test import of Access's
`ScopeSet` was removed without changing either empty-scope input or any assertion;
no new private cross-owner import remained in the reviewed additions.

Artifact acceptance checked:

- The actual [downloaded workbook](d11-empty-scope-browser/final/empty-report.xlsx):
  `Critical Tasks Report` has five rows, zero readiness/applicable People, no
  Person/risk/action rows, and zero below-threshold/expiring counts.
- [Bound Critical Tasks requests](d11-empty-scope-browser/final/ict-denials.json):
  valid create returns 403; batch returns row errors with zero writes; summary is
  empty. Exact [before](d11-empty-scope-browser/final/ict-before.json) and
  [after](d11-empty-scope-browser/final/ict-after.json) completion rows match,
  including IDs, values and timestamps.
- [Calendar requests](d11-empty-scope-browser/final/calendar-denials.json):
  range contains no availability/assignments while retaining the allowed
  Organization special day; single/batch writes return 403. Exact
  [before](d11-empty-scope-browser/final/calendar-before.json) and
  [after](d11-empty-scope-browser/final/calendar-after.json) availability rows
  match. This does not claim provider before/after comparison of assignments.
- Member screenshots/storage show the same membership retaining Selected groups
  with no checks after save/reload, then positive Alpha and explicit Organization
  access. Clearing a redundant capability override is documented rather than
  described as byte-identical restoration. Empty matrix/report screenshots,
  helper arrival and integrated-main replay support their stated observations.
  Actor arrival alone remains `not-assessed`.
- All 63 committed files matched their ignored raw counterparts. Selected
  screenshots contain synthetic data; the reviewed artifacts disclosed no
  credentials. Final doctor/cleanup receipts support the recorded cleanup.
  The D09 helper integration remained intact.

**Accepted test-only follow-up:**
`280c2b5cf52febc32f6b8cd31ef6360782b49198` checks archive persistence through the
existing raw test store, asserts an archive timestamp and the Leader note's exact
matching timestamp, and separately requires the empty-scoped Person read to
remain null. This preserves Organization governance archival authority without
widening read access. The additional guard reviewed as an uncommitted delta
`if (!ctx.rawStore) throw new Error('Expected raw provider store from the in-memory test context');`
is also accepted: it checks the required test dependency and narrows its optional
type before readback. The factory supplies that store; no assertion or runtime
application behavior changes.

The implementing agent reports 595 files / 5,202 tests and production build
passing at `280c2b5c`, with typecheck finding the optional raw store. After the
guard, local typecheck reports zero errors/warnings and the focused 55 tests pass.
This review did not execute those checks, assign a future commit, or certify a
future CI result. Current-head CI and completed clean review remain merge gates.
Native evidence remains applicable because the follow-ups change tests/prose
only.

**Issue limit:** This accepts the empty-Group prerequisite only. D11 #1359's
completion operations, history/readiness/report/read-model ownership, consumer
migration, obsolete-path removal and integrated product acceptance remain
pending. No whole-issue closure, SQL migration or remote deployment is accepted.
