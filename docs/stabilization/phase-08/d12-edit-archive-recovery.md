# D12 Edit archive recovery

Issue #1360 / `08-M04-02r`, intermediate recovery from merged #1450 (`0d64d193`). This PR must retain an unsaved Edit draft after failed direct archive or failed approval submission and close only after acknowledged archive or accepted/already-pending approval. The draft must not be saved as a side effect of archive. This outcome was selected after the unchanged-app failure and before production edits; command ownership is blocked until the affected baseline passes.

## Baseline

Native worker 2 tested `4d74f0958cd8f9aa53e2e1fccb6a634fcffafea1`, application bytes unchanged from `0d64d193`, with preparation-only recipe/control changes. Digest `67cb295c6bc1a3a4898f893afc6851477ab96b3480719d0fcfc1b3f2860faf94`, origin `http://127.0.0.1:38027`, Chromium 152.0.7977.82 Arch Linux, Node 24.21.0/npm 11.19.0. Each actor used a separate owned synthetic context; the fixture and run notes bind Organization/Group/Person IDs.

- **Failed:** operate Edit → unsaved Duty Role → Archive: actual DELETE202, controlled approval POST503, useful error, unchanged active Person, observed zero pending requests; Edit closes and loses the draft. Reopening shows saved Medic. Restored retry201 and pending replay409 retain one request and the active Person.
- **Failed:** manager Edit → unsaved Duty Role → Archive: controlled DELETE503, useful error and unchanged Person; Edit closes and loses the draft. Restored retry200 archives the selected ID, reload removes it, and owner restore preserves its fields.
- **Passed:** manager detail direct archive503/retry200, exact parent-event artifact cascade, active-view reload and owner restore. Independent August archives, completed follow-up, Training/ICT IDs and unrelated A/B rows remain intact. Other readiness lanes are absent for this actor and their unavailable summaries earn no readiness credit.
- **Passed:** owner permanent deletion of helper-created archivedDuplicate: wrong-name disabled action, cancel/no effect, exact-name503/no effect, restored retry200 and exact-ID absence after reload. Operate valid-ID permanent request403 is separate authenticated HTTP/provider proof.
- **Passed:** owner Approvals503 retains the pending request and active Person; retry200 marks the same request approved and archives that Person, then visible Archives restore/reload preserves identity.
- **Unreachable:** ordinary operate-only Details navigates to403 because sensitive detail read requires configure. No permission bypass or live detail-approval claim. Affected lower-level approval handling and later permission-change work stay explicit.

Final doctor and owned cleanup passed at the same tested revision/digest. Helper cleanup retained exact original A3/B1 People; the approved request remained until disposable provider teardown. No remote or pre-existing local database was touched. Metadata-only documents prove no Storage bytes. Native id-based request observers report count0/ids[]; these are not payload-count proof.

One raw zero-pending-request file was accidentally overwritten by the native network list. The archive preserves that network list and labels the verbatim actual helper output from the tool transcript separately; it is not the original raw provider file or a fresh read. All other raw captures are preserved. The final run must use distinct filenames. An initial analysis failed on that overwritten shape; its corrected comparisons and original failure remain. Two independent UI draft-loss failures stay failed; successful captured comparisons do not turn the baseline into a passing refactor gate.

## Durable artifacts

| Run                           | Archive                                                                 | SHA-256                                                            | Payload                             |
| ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Native unchanged-app baseline | [native-baseline.tar.gz](d12-edit-archive-proof/native-baseline.tar.gz) | `9ab5f01f8e46aae2db020ef9702ca8ee9d8af0baf36bde3d04dafd5172683c0d` | 283 files, 1,664,500 expanded bytes |

Each archive contains `SHA256SUMS` for the exact expanded payload set, excluding the inventory itself. Verify the archive hash, extract to fresh ignored scratch space, check there are no missing or extra payload files and verify every expanded hash. Native screenshots were inspected and contain only synthetic UI; no redactions required. Root re-extraction/set/hash checks pass. Packaging after cleanup changes the publication fingerprint and supplies no fresh live credit.

## Candidate acceptance and remaining issue work

At preparation, focused native-control checks pass 7/7. Actual new Edit integration regressions fail 2 and pass 5 on unchanged production, matching native draft loss; complete raw logs and the test patch are retained in ignored scratch. Repair, final affected native proof, independent complete-diff/expanded-artifact acceptance, complete current-head CI and applicable completed CodeRabbit review remain required before merge. No migration is planned.

Every #1360 acceptance requirement remains unchanged. Lifecycle command/cascade and approved-effect ownership, all required callers/removals, Personnel’s retention/export source effects, detail/header/readiness/bootstrap, switching/shared-session response ordering and integrated issue acceptance remain open. D13 owns separate artifact APIs/files; D18 owns approval governance; D25 owns cron admission, cutoff dispatch and summary notification. Retention must use a bounded Personnel effect rather than per-Person manual commands. This recovery PR does not close #1360 or authorize another issue.
