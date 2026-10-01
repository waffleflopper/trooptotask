# D12 bulk archive and restore recovery

Intermediate #1360 from verified default `8da72739a9fc25a87d2a927317dbaf26f29cbf49` (#1447), whose complete accepted tree matches `c5aa3b88`. This small repair precedes moving the four lifecycle commands and their consumers into Personnel. No migration is planned; a new migration stops for Robert’s manual operation.

## Contract and scope

Robert selected bulk retries completing only still-active artifacts under each already-archived Person’s saved timestamp. Authorized completed replays acknowledge those People in `archivedIds`; the existing response shape, dedupe, missing-record errors and active operate-only approval flow remain. An already-archived operate-only requester must not repair artifacts or create another request. Scope/foreign refusals and both Personnel policy checks remain. New People in a later retry use that retry’s shared timestamp; saved parents retain the earlier event. Independently archived artifacts and completed follow-ups stay untouched.

Restore retains the parent timestamp until all matching artifacts finish, then clears it and emits its success audit. Controlled late-child and final-parent-write failures followed by retry must finish without stranded event-owned artifacts. This is sequential recovery, not transactional or concurrent archive/restore acceptance. Healthy bulk keeps one scoped candidate read and one batched cascade per event; mixed saved timestamps bind separately without per-Person scans.

## Verification selection

Extend the authoritative Personnel lifecycle recipe before the cutover. Native unchanged/final proof selects manager bulk archive of the dedicated populated Alpha Person plus duplicateAlpha, actual network failure/retry/reload, same-ID ordinary batch replay, owner Settings restore and denied operate/empty/foreign requests. Preserve exact parent/artifact fields, nine-artifact independent/completed history and original A3/B1. Existing metadata-only document fixtures prove row lifecycle, not file-byte preservation/deletion. Broader approval, detail/modal/permanent-delete consumers are unchanged by this small repair and remain required for the later owner cutover.

Lower-level tests exercise the real commands with separately persisted/fresh-read rows and fixed T1/T2 expectations: later parent failure; late cascade failure; interrupted child restore; final parent-clear failure; archived replay authority; healthy batching and existing allowed/denied/approved effects. Preserve actual failed baseline results before repair. The final-parent-clear case protects the new ordering and is not claimed as an old failure. Baseline/final evidence and current checks are pending.

## Whole-issue remainder

All single/bulk archive, restore, permanent removal and approved Personnel effect ownership, current delivery/UI/reverse callers and obsolete paths still remain. Detail/header/readiness/bootstrap, shared-tab/Organization ordering, exports and final integrated acceptance remain with #1360. Other owners/issues are excluded; this PR uses `Refs #1360` and does not close the issue or parent.
