# D12 bulk archive and restore recovery

Intermediate #1360 from verified default `8da72739a9fc25a87d2a927317dbaf26f29cbf49` (#1447), whose complete accepted tree matches `c5aa3b88`. This small repair precedes moving the four lifecycle commands and their consumers into Personnel. No migration is planned; a new migration stops for Robert’s manual operation.

## Contract and scope

Robert selected bulk retries completing only still-active artifacts under each already-archived Person’s saved timestamp. Authorized completed replays acknowledge those People in `archivedIds`; the existing response shape, dedupe, missing-record errors and active operate-only approval flow remain. An already-archived operate-only requester must not repair artifacts or create another request. Scope/foreign refusals and both Personnel policy checks remain. New People in a later retry use that retry’s shared timestamp; saved parents retain the earlier event. Independently archived artifacts and completed follow-ups stay untouched.

Restore retains the parent timestamp until all matching artifacts finish, then clears it and emits its success audit. Controlled late-child and final-parent-write failures followed by retry must finish without stranded event-owned artifacts. This is sequential recovery, not transactional or concurrent archive/restore acceptance. Healthy bulk keeps one scoped candidate read and one batched cascade per event; mixed saved timestamps bind separately without per-Person scans.

## Verification selection

Extend the authoritative Personnel lifecycle recipe before the cutover. Native unchanged/final proof selects manager bulk archive of the dedicated populated Alpha Person plus duplicateBravo, actual network failure/retry/reload, same-ID ordinary batch replay, owner Settings restore and denied operate/empty/foreign requests. Preserve exact parent/artifact fields, nine-artifact independent/completed history and original A3/B1. Existing metadata-only document fixtures prove row lifecycle, not file-byte preservation/deletion. Broader approval, detail/modal/permanent-delete consumers are unchanged by this small repair and remain required for the later owner cutover.

Lower-level tests exercise the real commands with separately persisted/fresh-read rows and fixed T1/T2 expectations: later parent failure; late cascade failure; interrupted child restore; final parent-clear failure; archived replay authority; healthy batching and existing allowed/denied/approved effects. The final-parent-clear case protects the new ordering and is not claimed as an old failure.

## Current evidence

Unchanged production baseline `097787b83357d5aac5549ee9a49038666b20cbf6`, digest `c952d341fbe801ef9c8295626b84dc0c92345cebee72f86e250897eb3f56c19b`, ran in owned production worker2 at `http://127.0.0.1:36403`, session `23aa7277-ae05-4fd8-bb96-6605559e4bee`. Node24.21.0/npm11.19.0/Chromium152.0.7977.82. Native manager bulk failure/fresh selection/retry/reload and owner Archives failure/retry/reload pass their interaction requirements. All nine-artifact literal event/history requirements, Training/ICT, unrelated control and original A3/B1 persist as expected. Same-ID ordinary manager/scoped archived batch replay **fails the selected acknowledgement rule**: no successful IDs, already-archived errors. This is retained failed baseline, not a passing gate. It does not create unfinished artifacts; lower-level persistence faults below prove that separate boundary. Both doctors and owned cleanup pass.

Baseline provider analysis records73 exact row-set comparisons and24 literal artifact expectations. Automatic `updated_at` is explicitly recorded for only the changed counseling/document/open-follow-up rows; their meaningful fields and every other row remain exact. Native network state captures method/status but its ids-only payload parser reports count0/ids[]: that is not payload-count proof. Native selected2 and exact2-parent effects identify those UI targets; ordinary HTTP payloads remain separate. One unsupported `resource_id` rows filter failed before action and is retained alongside the corrected empty approval-request read. Documents remain metadata only.

Server baseline `490b24203ebb78dd21a1e6a488375c2c15adf28d` (root cherry-pick `d76e0e92`) has unchanged production and five failures/28passes. Final repair `4f0c557e7f5bbf2174bd5761008309cd69d54e73` (root `4649513e`, identical source/test bytes) passes six focused files/98tests, types0errors/0warnings, focused ESLint/format and governance713/no regression. It groups residual cascades by saved/new event and completes matching children before clearing the restored parent. Inert type declarations are `PUBLIC_SUPABASE_URL=http://127.0.0.1:9` and `PUBLIC_SUPABASE_ANON_KEY=verification-only-placeholder`. Initial wrong403 assertions, missing-env type diagnostics and repaired test-import governance failure remain archived with their corrections, earning no product-defect or gate credit. These checks use fake persisted providers, not live RLS/file/concurrency proof.

Final native production verification, independent acceptance, complete exact-candidate Depot CI/build and completed bot review remain pending. No migration or schema/provider boundary change.

## Durable proof

Each cleaned run/cohort is one archive; raw captures remain ignored. Inventory `SHA256SUMS` lists every payload's original relative name and expanded-byte hash. Fresh extraction verified the exact payload set and all hashes; synthetic-only captures were inspected and require no redaction. Existing proof is unchanged. Archive packaging after cleanup is outside the tested baseline revision and is not described as another live run.

| Archive                                                                 | SHA-256                                                            | Payloads / expanded bytes |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------- |
| [Native unchanged baseline](d12-lifecycle-proof/native-baseline.tar.gz) | `1c9f24d8a1cf98b3b997cbeac613d2535b2b07b353f035d0d20af240e57a3a31` | 187 /865457               |
| [Server failed baseline](d12-lifecycle-proof/server-baseline.tar.gz)    | `020b5f0de8893f5d7f31ed9ce6c8200871491b10ced848cdf721091372519d09` | 11 /22116                 |
| [Server repaired checks](d12-lifecycle-proof/server-repair.tar.gz)      | `2da8feea4fc97f355c582b7475551f04009e6edee506e2325dff346eeff4cc7c` | 16 /9660                  |

Verify the archive hash above, extract into a fresh ignored scratch directory and run `sha256sum -c SHA256SUMS` there. Also compare the complete expanded file list (excluding `SHA256SUMS`) with its inventory filenames; extra or missing payloads fail integrity. Read `run-notes.md`, actual actions/readbacks and literal expectations after extraction. Checksums establish integrity; independent acceptance separately evaluates behavior and selection.

## Whole-issue remainder

All single/bulk archive, restore, permanent removal and approved Personnel effect ownership, current delivery/UI/reverse callers and obsolete paths still remain. Detail/header/readiness/bootstrap, shared-tab/Organization ordering, exports and final integrated acceptance remain with #1360. Other owners/issues are excluded; this PR uses `Refs #1360` and does not close the issue or parent.
