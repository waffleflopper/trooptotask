# D12 owned scheduled Personnel retention

This intermediate #1360 deliverable repairs the recorded 1,001-parent HTTP 414 failures and moves scheduled parent deletion into Personnel's consumed Server operation. Scheduled Maintenance keeps cron admission, Organization retention settings, cutoff, family dispatch/order and count-only administrator summaries. Separate artifact-family APIs and retention remain with D13/D25; #1360's acceptance is unchanged and remains open.

## Result and consumers

`createSupabasePersonnelRetentionSource` discovers all explicitly scoped expired parents, reads complete document/counseling manifests in cohorts of 100 parent IDs, then calls one atomic eligibility-rechecking RPC. The integer count comes from PostgreSQL rather than a capped returned-row page. It completes every bounded confirmation read before removing files, removes only confirmed-deleted parents' prepared paths, and awaits both buckets before returning or reporting failure. The old central parent-manifest/deletion path is removed; main and legacy cron consume the same handler and owned operation.

Live verification found the legacy URL redirected to sign-in before its handler. Identity now admits exactly both supported cron paths to their existing secret check, without opening nested paths. Missing/wrong credentials reject before effects. No caller, table policy or authenticated mutation is made generally public.

## Original proof and applicability

The [verification preparation](d12-retention-baseline.md) and all prior archives remain unchanged. Normal native/API behavior and its provider failures remain applicable; the actual oversized manifest and DELETE failures are superseded by the new repaired success cases. The [atomic migration](d12-retention-migration.md) merged in #1457 at `263262b3`, tree-identical to exact accepted `60b4771b`. Full CI/build and database contracts pass (619 files/5,513 tests; fresh 49 SQL/regression files/1,238 assertions; staged 15 contracts/217 assertions). Independent database acceptance and full CLI CodeRabbit pass. Robert merged it while hosted review was pending; no completed hosted approval is claimed. Remote application remains his morning obligation.

The first final app/native and 14-case provider runs tested `2bbefed928394ed8a2bfb2d7d5af2f17891a9514`, digest `d8403d3267f92efae8edc722739241fbd09e4f57a78586e886f60e4fefaacaa7`, on owned production-mode workers 1/2. They prove normal actual cron deletion, Archives reload and actual count-only notification; exact 1,001 parent counts; complete dense manifests and both real final-page PDF removals; preserved A/B controls and Evaluation facts; zero-effect replay and failure handling. The first native run honestly records the legacy admission failure. The later `c3a4dcf3` fix changes only exact-route admission and its regression test; the Personnel operation, SQL, fixtures and retained flows remain unchanged. Its fresh follow-up supplies the affected real main/legacy admission and legacy deletion proof.

Temporary `/tmp` inode exhaustion interrupted one follow-up browser session. A first long private TMPDIR retry failed browser initialization; shortening the private directory recovered it. Socket path length is an inference from that recovery, not a retained browser-stderr diagnosis. Both attempted runs and owned cleanup remain distinct. No shared temporary directory, existing database or production data was deleted.

## Behavioral evidence and limits

The provider reader independently recomputed 14 actual cases: 252 full A/B table comparisons, 84 original survivor comparisons, eight Evaluation null-reference/monotonic-update checks, 282 downloaded pre-file hashes, 214 retained literal file outcomes and 68 absent outcomes. The 1,001 case uses one real POST carrying 1,001 IDs and returns exactly 1,001 parents (central total 1,003 including two earlier artifacts); targeted GETs contain at most 100 IDs and are at most 4,096 bytes. Both dense manifests actually fetch offset 1,000 and remove each highest-ID real PDF marker. Controlled partial/zero cases forward reduced actual RPC candidate IDs; they do not establish a live restore race. Invalid-UUID RPC rejection does not replace the migration's historical FK/commit proof. Provider notifications use a captured port; native root cron proves actual persisted notifications separately.

Manifest failures precede parent deletion. Confirmation/Storage failures can occur after durable cascade; either bucket failure still awaits the other bucket and produces no success summary. Earlier independent artifact families may already have completed before a parent failure. There is no transactional discovery/restore guarantee, transactional Storage, durable deletion-file outbox or recoverable orphan-file manifest; retry after such a post-delete failure is not claimed to recover those files. Privileged synthetic PDFs/metadata establish real file persistence/removal, not native upload permissions. Archived detail and runtime latency are not measured by this slice.

## Packaged evidence

All runs finished final doctor or recorded failed doctor and owned cleanup before packaging. The migration/main integration changed only CI/prose/proof packaging; runtime, SQL, controls and driving instructions remain byte-identical to tested `c3a4dcf3` where applicable. This is not a new live run. Seven per-run archives preserve 1,484 payloads, including failed attempts; old proof is unchanged. Fresh extraction verifies exact file sets and every expanded hash. Native screenshots were visually inspected.

| Run                                                                             | Archive SHA-256                                                    | Payloads / expanded bytes |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------- |
| [native-final](d12-retention-ownership-proof/native-final.tar.gz)               | `603b32d5d2934fb07320e975fda783e6ba5b458d43db6520bd4634a1bbd14323` | 620 / 3,321,042           |
| [provider-final](d12-retention-ownership-proof/provider-final.tar.gz)           | `102b728c91a94fb6fb4a569f747756fe492afbb4298c44ad23feca780100a4d9` | 122 / 15,580,589          |
| [owner-checks](d12-retention-ownership-proof/owner-checks.tar.gz)               | `2b7ca94d44333f564cfc8287688fc64f5fecdc79dbd9e947af152e34caaf6107` | 23 / 75,369               |
| [alias-interrupted](d12-retention-ownership-proof/alias-interrupted.tar.gz)     | `01fe1cb5697ee460bd11fa89e98ef59af205ddbcce272a31f79a1ac95047785a` | 249 / 170,805             |
| [alias-launch-failed](d12-retention-ownership-proof/alias-launch-failed.tar.gz) | `fea6d3889c8a71d2701ca39a39512feb7b51a1172c397b82679d0e7273663065` | 10 / 2,050                |
| [alias-final](d12-retention-ownership-proof/alias-final.tar.gz)                 | `da0962c489025a1fba64adc6f9b511ab05bae6ff0b5e62a6e659113149dbc173` | 457 / 1,424,514           |
| [alias-checks](d12-retention-ownership-proof/alias-checks.tar.gz)               | `a7e7f6b7657804fc06d7299258f8ebdb8c50aaf5457333d53d8e689e20a70d3e` | 3 / 576                   |

Each archive contains `ARTIFACT_SHA256SUMS` with original relative filenames and expanded-byte hashes, excluding only that inventory. Extract each into its own fresh ignored directory, run `sha256sum --check ARTIFACT_SHA256SUMS` there, and compare the full expanded payload file set with the inventory. The archive hash protects that inventory; hashes do not establish behavior. No redactions were needed. The Bearer scan flagged four original public synthetic/incorrect-secret test literals in the tested patch; their committed test-fixture provenance was verified and original bytes preserved. No real credential/token or signed URL was found.

The implementation worker retains its initial governance failure and correction; 46 focused tests pass. The admission follow-up passes four suites/55 tests. Complete exact-head CI/build still belongs to the PR record. Independent source/provider acceptance is artifact review rather than independent live execution or model diversity.

## Review and release

Independent source/provider acceptance passes; final expanded/native acceptance, packaging hashes, complete changed-file count, exact-head full CI/build and completed applicable bot review belong to the final PR record. This uses `Refs #1360`. Merge/read/detail/bootstrap/export, wider Web/selection/switching, artifact APIs and whole-issue consumer/removal acceptance remain separately accounted for; already integrated merge/backfill must not be refactored again because older metadata says it is open.

Robert authorizes migration/application PR merges after green exact-head CI and completed reviews without actionable feedback, and will apply `supabase/migrations/20261001000100_personnel_archive_retention.sql` remotely in the morning. The agent performs no remote database action. If this app deploys before application, Personnel retention reports a missing-function error before new parent deletion; earlier artifact families may already have completed. CI does not migrate the provider; external production Vercel publication settings remain unknown.
