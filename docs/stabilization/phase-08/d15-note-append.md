# D15 — Retain overlapping note additions

This intermediate `Refs #1363` repair addresses lost saved notes when two authorized users add to the same step. Its declared scope is note append, ordinary authenticated persistence, existing API/store consumers and saved History readback. The separate Cancel/Complete race, reverse consumers and remaining whole-issue acceptance stay required under #1363; `08-M09-02a/b` remain unchecked.

## Failed unchanged-app baseline

Source `44f580e9a4f6f0bfb3655a80ae0a9888b80c65a9` has the integrated #1475 application. Candidate `275e46f6ae4f0543a90e95000f68103b250eb3c3bee5fba604f5b682651223b9` freezes 4,584 inputs. Production-mode owned session `4548d591-b147-48dd-9b51-8d8b79c28ef2` runs at `http://127.0.0.1:38481`, using native Chromium 152.0.7977.82 on Arch Linux and a disposable synthetic provider. `TMPDIR=/home/waffleflops/.cache/t2t-d15-tmp` supplies a short temporary path. Launch, doctor and disposal observations identify the exact owned project and ports.

Two distinct fresh ledgered legacy cohorts keep original history unchanged. Normal Operate and Configure sessions warm with valid-shaped requests to a UUID proved absent before writes. A seed-restricted holder locks the exact Orientation step for notes, or exact active parent for lifecycle, without changing data or schema. Each case records two ordinary UPDATE backends waiting directly/transitively on that exact PID/backend-start identity and full unchanged committed parent/progress. Holder rollback/absence and all three child exits pass before readback or cleanup. No winner or request ordering is assumed.

- **Notes FAIL:** both ordinary addNote requests return 200. Their responses respectively contain original+A and original+B, but saved state contains only the original and B. A is missing. The surviving addition has the Configure actor’s ID and a current timestamp. Other full A/B packet/progress rows, untouched target fields and selected Training fields remain unchanged. Ordinary supported completion then native View History → Orientation notes → reload displays exactly the saved failure. This is API creation followed by native readback, not a native note-editor claim.
- **Lifecycle FAIL, remaining repair:** Cancel and Complete both return 200. Final status is cancelled with both `completed_at` (`2026-10-02`, a schema DATE) and `cancelled_at` (`2026-10-02T03:06:21.799+00:00`). Native History/reload displays the actual contradictory saved dates. The intended result remains one successful transition, one explicit rejected state/conflict and only the matching terminal timestamp. This note-only PR does not supersede that failure.

The original note driver raised `KeyError('actors')` during postprocessing after both requests and partial readback: public fixture metadata does not contain private actors. Its script, failure and raw responses remain. Corrected read-only analysis uses each already captured response’s authoritative `actorId`, captures the remaining comparisons and repeats no mutation. Lifecycle uses the corrected driver. Both product failures remain failures; the metadata error earns no successful proof.

Cleanup restores every original A/B packet/progress field including timestamps and the selected Training fields (Training timestamps are not captured). Both temporary Persons are absent, seed/grant ledgers empty and all 4,584 frozen inputs unchanged. Final doctor and exact owned container/volume/network/private-worker absence pass. No existing local or remote provider is accessed.

## Repair and acceptance status

The integrated application patch replaces client-side read/array replacement with the narrow consumed `OnboardingNoteAppendPort`. The existing resource policy runs first; one ordinary authenticated database RPC appends to the current locked array and supplies the saved ID/notes. The API/store adopt that authoritative result. Successful audit remains after persistence; failures produce no success audit. Caller-supplied author/time or a replacement notes array are not admitted. Existing step actions, empty/whitespace text and supported terminal/inactive edits are retained.

The new additive `20261002000100_atomic_onboarding_note_append.sql` migration and its actual focused/fresh/populated-upgrade proof are still being completed in an exclusive worktree. Matching final ordinary API/native proof, complete independent expanded acceptance, CodeRabbit and exact-head full CI remain gates. The already completed service-worker checks pass seven focused suites / 103 tests, types 0/0 and scoped formatting/lint; they do not establish the SQL or live concurrency boundary.

The [packet recipe](../../../.agents/skills/verify-trooptotask/features/onboarding-packets.md#ordinary-note-and-lifecycle-overlaps) distinguishes the baseline UPDATE observer from the final exact note RPC observer. Separate SQL proof must cover post-wait capability/Person scope, failure rollback and retained saved fields. One ordinary request makes one RPC transaction. A separately observed two-appends-in-one-explicit-transaction/reconciliation deadlock remains a direct-caller limitation; final SQL evidence must preserve the failed scenario and establish the actual one-RPC application boundary without changing foreign keys or weakening constraints.

## Durable observations

| Archive                                                | SHA-256                                                            | Payloads / members | Expanded bytes |
| ------------------------------------------------------ | ------------------------------------------------------------------ | -----------------: | -------------: |
| [Failed overlap baseline](d15-overlap-baseline.tar.gz) | `59c415516082440e3234888dc4cda2caad0f407e1e71375800abdf66af1ab393` |          427 / 428 |      1,997,500 |

The archive is added only after owned cleanup. Every raw payload is retained byte-for-byte without redactions; text credential-pattern scanning passes. Its inventory excludes itself. Fresh bounded regular-file extraction using `data_filter`, a 2,500-member/32-MiB aggregate ceiling and every expanded hash passes. Packaging integrity is distinct from behavioral/independent acceptance, which remains pending for this deliverable. Final extraction instructions will cover all of this deliverable’s archives together after final/SQL proof is packaged.

## Release boundary and issue remainder

This deliverable contains a new migration and stops before merge for Robert’s manual application of its reviewed final bytes. His earlier #1470 confirmation does not cover this file. CI uses only disposable local providers and performs no remote migration. The new function must exist before its application consumer is released; earlier application instances still replace note arrays and must be drained before claiming safe overlapping appends. External production deployment settings are uninspected, and no remote function/ledger readback is claimed.

After the operator gate and accepted merge, continue #1363 with the observed lifecycle repair, Add Person/Calendar/Training reverse-consumer observations, remaining valid packet operations/access boundaries, general response ordering and integrated removal/whole-issue acceptance. Do not advance another issue or credit note proof toward the unresolved lifecycle failure.
