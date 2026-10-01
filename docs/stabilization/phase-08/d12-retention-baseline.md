# D12 scheduled Personnel retention verification preparation

This intermediate #1360 deliverable adds meaningful failure baseline tests and maintained owned controls for real files, cron admission and large Personnel retention. It preserves an actual failing large-batch baseline. It changes no application operation, permission, provider schema or SQL. Personnel retention ownership and repair remain pending; this is verification preparation, not an accepted refactor or completed issue.

The [Personnel lifecycle recipe](../../../.agents/skills/verify-trooptotask/features/personnel-records-lifecycle.md) remains the authoritative journey description. #1360's complete acceptance and outstanding merge/read/detail/bootstrap/export, separate artifact APIs, wider Web/switching and whole-issue consumer/removal obligations are unchanged. Existing [manual lifecycle proof](d12-manual-lifecycle-ownership.md) and all older archives retain their original tested revisions and bytes.

## Candidate and scope

Base `570e51a489564902bca7c6474aa955772ef1c4db` is merged #1454, tree-identical to its accepted exact head. Frozen preparation/native/provider revision `11b34eaac4bf51381da336a7ef5f67afb5caa1af`; candidate digest `5f53072a38a38ed47d4e796224c299bf3a201e2fd3a18524c24ff329646bf893`; copied source digest `6e4fd2e7a88486a68129353041876b86579f4f8c9a1e32c342367a3b77b6adf5`.

Two disposable production-mode verify:app sessions have independent project IDs/ports and disabled legacy seed loading. Worker1 used http://127.0.0.1:42005, project `t2t-verify-e41cd16216e1474ca7e79092`; worker2 used http://127.0.0.1:33189, project `t2t-verify-670246d97ce049389944bd9d`. Both replay the unchanged 158-migration chain through `20260930000100_rating_scheme_evaluator_integrity.sql`. Public allocation, exact commands, exits, environments and tool versions are packaged below. Node24.21.0/npm11.19.0, Chromium152.0.7977.82, Supabase2.101.0, Docker29.7.2 and PostgreSQL17.6 were recorded. npm differs from pinned11.12.1; existing install warnings remain preserved. No existing local or remote database was used.

The new helper records every synthetic row ID and object manifest before any write, including interrupted setup, and keeps cleanup narrowly within those recorded IDs/paths. Actual PDF uploads use privileged synthetic setup, separate from native document upload and ordinary-member RLS. Existing metadata-only lifecycle fixtures remain untouched. A fresh worker-only cron credential is generated privately; the control uses only the doctor-validated owned origin, rejects redirects and prints no credential. File inspection confirms exact filenames/absence or downloaded byte size/SHA-256 and propagates inspection errors.

The retained in-memory baseline is **25 passing tests**, including meaningful cutoff, isolation, cascade and fault outcomes. The root preparation check is **31 passing retention/worker-safety tests**. This lower-level proof does not establish real PostgreSQL or Storage behavior.

## Actual baseline observations

Worker1 drove the orgOwner's visible Settings Archives and notification inbox with native controls. Direct cron/provider checks are separately identified.

| Boundary                  | Expected and observed outcome                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing/wrong cron secret | Actual401; ten captured table collections and all20 objects unchanged.                                                                                                                                                |
| Normal admitted cron      | Actual200; two expired A parents and two earlier expired artifact rows removed, correct separate family counts/four total.                                                                                            |
| Real cascade/files        | Active and recent child metadata removed with their parents, notes/open and completed follow-ups cascade; ten objects absent and ten retained exact hashes across both buckets, including unrelated/foreign controls. |
| Evaluation history        | Four local evaluator references clear; every other projected field remains exact except legitimate monotonic updated_at.                                                                                              |
| Tenant/control retention  | Retained A and foreign B row values and file hashes stay exact.                                                                                                                                                       |
| Visible readback          | Reloaded Archives omits both expired parents and keeps recent; native inbox shows the actual count-only summary; three current owner/admin notification rows confirmed.                                               |
| Retry                     | Actual200zero; all11 captured table/file collections including notifications remain literally unchanged.                                                                                                              |
| Final cleanup             | All60 root-recorded objects absent, original A3/B1 literal fields restored, native Archives has no seed; final doctor and owned cleanup PASS.                                                                         |

Worker2 independently executed the unchanged application use case against real Supabase DataStore/Storage, owned note/Calendar bindings and narrow controlled port faults. **Nine scenarios pass**: forwarded real subset deletion, zero parent deletion, each manifest fault, discovery/delete/confirmation failure, one-bucket Storage failure and strict cutoff/Organization isolation. Fixed-time equality and expired foreign rows are retained. Confirmation failure after durable cascade leaves parent files and sends no summary; one-bucket failure removes the other bucket's files and sends no summary. These are observed limitations, not whole-job atomicity or durable retry guarantees. The notification port is captured here; worker1 establishes actual cron delivery and visible inbox. Ten per-scenario cleanups preserve original A/B rows; all200 recorded objects independently confirmed absent. Final doctor and owned cleanup PASS.

**Large baseline FAIL remains blocking:** With1,001 expired parents, worker1's actual cron returns500. Both worker2 pre-cascade manifest GETs return414 at39,221/39,222 URL bytes. All1,001 expired parents remain; earlier independent document/counseling families have already removed two rows/files, and no new summary is sent. One parallel original manifest response is completion-labelled after the other rejected; it is not a post-delete confirmation request.

A separate fresh worker1 seed directly probes the existing SDK parent DELETE shape. It also returns414 at39,155 URL bytes; independently paginated1,001 parents remain exact. The returned-row/count cap was never reached or measured. The first one-run direct probe stopped on its own pagination-envelope guard before mutation; its source and explicitly labelled transcript excerpt are preserved separately. The original guard output was not redirected, so the excerpt is not a raw recreated capture.

The repair must remove oversized URL filters while preserving Organization/cutoff selection, complete pre-cascade manifests, actual parent counts and atomic parent-batch FK rollback. Do not replace this with partially committed parent cohorts. A narrow owned SQL operation is a candidate design, not implemented behavior; any resulting migration requires separate isolated replay/upgrade/security proof and Robert's manual remote application before authorized merge.

## Packaged observations

Both live sessions completed final doctor and owned cleanup **before** adding archives. At that checkpoint, Definition of Done and verification/stabilization instructions were reread; fetched default remained the base above. Archive addition changes the checkout fingerprint without changing the tested application/controls or earning a fresh live run. Credential/token/signed-URL pattern inspection found no exposed values; no redaction was required. No old proof was rewritten or deleted.

| Run                                                                   | Archive SHA-256                                                    | Payload files / expanded bytes |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------ |
| [native-api-baseline](d12-retention-proof/native-api-baseline.tar.gz) | `0855321d64d29696ab63e6cd922ccf644ac32bcc84ffbd83d61706515aa421af` | 294 / 2,321,066                |
| [provider-baseline](d12-retention-proof/provider-baseline.tar.gz)     | `94e1ed8871aeb44b3482d252ad7708c2195706996e6f5fd30edd2ef603a435f9` | 73 / 3,566,802                 |
| [unit-baseline](d12-retention-proof/unit-baseline.tar.gz)             | `963aa37f0efef1509d5ae089caaa266f19051994a55df798396873491e25ff9e` | 10 / 19,421                    |
| [preparation-checks](d12-retention-proof/preparation-checks.tar.gz)   | `6bbd00b0fe79da78495ca18a16f117780685f0e3eef20bfcf67f7e9633edb2c3` | 2 / 1,008                      |

Each archive contains `ARTIFACT_SHA256SUMS` with every payload's original relative filename and SHA-256 of expanded bytes, excluding only that inventory. Root freshly extracted all four archives and verified all379 payload files, exact file sets and every hash. Extract each archive into its own fresh ignored directory using `tar -xzf ARCHIVE -C DIRECTORY`, run `sha256sum --check ARTIFACT_SHA256SUMS` there, and compare the recursively expanded regular-file set excluding only the inventory with its filenames. The archive hash protects the inventory itself. Checksums establish packaging integrity, not behavioral acceptance.

## Acceptance, limits and release

Independent expanded-observation/source acceptance and complete candidate CodeRabbit/Depot results remain pending at this receipt's preparation checkpoint. They must assess the **verification-only outcome**, preserved failure and unchanged #1360 remainder. Completed review of worker2 raw proof is separate from independent live execution/model diversity. Full final-candidate DoD/build and completed applicable bot review without actionable feedback are merge gates; final exact-head outcomes belong in the PR record.

No fresh archived-detail or native file-upload journey, foreign legacy mixed-FK combined provider deletion, concurrency/restore-race, file-removal outbox/durable post-cascade retry, successful1,001-parent cleanup or measured returned-count cap is claimed. Earlier accepted Evaluation integrity SQL/upgrade evidence remains applicable to unchanged constraints but does not establish these unrun combined paths. No SQL inputs changed here; database checks are inapplicable to this preparation PR.

This PR uses `Refs #1360` and leaves it open. After merge, continue its blocking large-retention repair and complete Personnel ownership/callers/removals. CI performs no remote database operation or deployment; external Vercel settings remain unknown and may deploy on publication/merge. This slice changes only verification tooling/tests/prose, with no application or destructive schema release.
