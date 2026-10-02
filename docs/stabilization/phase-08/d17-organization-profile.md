# D17 Organization profile and General settings

This intermediate #1365 deliverable starts from merged #1488, `7d82b9691a342de887890b8bba3d3a8252115df3`. It completes Organization profile/URL ownership and repairs General settings target lifetime. Policy settings, their reverse consumers, exports/jobs, mixed settings-shell ownership and Units retirement remain open; `08-M02-02b` and `c3` are not complete. This deliverable has no migration.

## Scope and retained behavior

Organization owns profile writes, portable URL rules, route identity, fresh request admission, membership/profile summaries, and General types/model/view/state through its existing portable/Web/Server seams. Delivery retains form parsing, action failures and canonical redirects. All replaced global profile/URL/admission paths and their six manifest assignments are removed without compatibility aliases.

Ordinary caller-RLS profile writes require a returned canonical ID and the submitted value, including null for URL reset, before success/audit/redirect. A zero-row, foreign-row, stale-value or failed provider response is a failure. Name normalization and cap100, URL validation and cap48, uppercase UUID compatibility, canonical308 suffix/query preservation and same-target303 redirects remain supported.

General is keyed by canonical Organization ID. Each workspace owns its editor, confirmations, busy state and form action; disposed callbacks and a reset disposed during its pending DOM update cannot submit or apply results. No generic lifecycle framework is introduced. Dashboard and deferred Shell consume the same owned, ordered complete membership projection, retaining their distinct empty-list and thrown-error behavior. Their existing pagination remains; no first-paint request or measured performance improvement is claimed.

## Baseline and verification status

The earlier profile baseline at `eb7c02f4472626c590a1530877c33e1c862c6faf` exercised ordinary profile/URL persistence, cancellation, canonical URLs, Dashboard/switcher consumers and denied requests. It failed carried General confirmation/editor state and the held-response target change. The fresh merged-base run at `7d82b9691a342de887890b8bba3d3a8252115df3` independently reproduced the name-confirmation and real POST200 held-response failures; B’s captured settings row stayed unchanged. Both runs restored their nine captured Organization fields and completed owned cleanup. Slug/delayed-failure cases were not rerun in the latter baseline.

Pre-repair SDK and mounted General checks recorded 14 failures/6 passes. The implementation worker’s final focused checks passed 10 suites/112 tests and types with zero errors/warnings. Root removed the six stale manifest assignments; governance passed at479 unresolved with no regression against the merged base. The worker’s full-suite attempt failed on those then-stale assignments and shared `/tmp` inode exhaustion and supplies no full-suite acceptance. Later commands direct temporary files and the Node compile cache to this task’s ignored runtime directory on the larger filesystem; no shared caches, databases or other worker services were modified.

Final native proof, artifact acceptance, complete-candidate CodeRabbit scope and exact-head CI remain pending. Final evidence will preserve the tested source revision and candidate digest, separate native actions from ordinary authenticated request and privileged fixture readback, and publish each cleaned run as its own inventoried archive. A checksum establishes packaging integrity, not behavioral acceptance.

## Release and remainder

No SQL, remote database operation, migration or new deployment prerequisite is introduced here. The already merged upload-registration release obligations remain in the [destruction receipt](d17-organization-destruction.md#upload-completion-repair). Owner reports of manual migration application are not hosted application/drain readback.

General profile ownership does not complete policy settings, policy-backed Personnel/Calendar/Dashboard projections, document caps, raw export/maintenance consumers or mixed settings-shell sources/model/UI. Units retirement still requires effective-catalog and actual-caller classification plus whole-issue integrated acceptance. D18 remains blocked on complete D17 acceptance.
