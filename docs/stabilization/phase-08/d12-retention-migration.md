# D12 atomic Personnel retention database boundary

This intermediate #1360 migration prepares the database boundary for the verified 1,001-parent URL-limit defect. It adds `public.delete_expired_personnel(uuid, uuid[], timestamptz)`, callable only by `service_role`, with candidate IDs sent in a JSON request body and an integer actual parent count. It changes no existing row, table, constraint, policy or application caller during migration.

The [failed retention baseline](d12-retention-baseline.md) remains applicable to the unchanged application. This migration alone does not fix its oversized child-manifest GETs or switch its parent DELETE. The separately continuing Personnel-owned operation will bind the RPC and bounded complete manifests/confirmation reads, move all maintenance consumers and remove the replaced parent path. #1360's full acceptance and merge/read/detail/bootstrap/export, wider Web/switching, separate artifact APIs and whole-issue consumer/removal obligations remain open and unchanged.

## Behavior and safety

One SQL DELETE rechecks explicit Organization, supplied candidate IDs and non-null `archived_at < cutoff`. Empty or duplicate IDs produce actual row counts; active, recent, exact-cutoff, foreign and unselected parents are retained. Required null arguments reject. Invoker security and an empty search path retain the service role's existing database authority; PUBLIC, anonymous and authenticated execution is revoked. There is no per-parent loop or partially committed parent cohort.

Existing cascades and Evaluation constraints apply. Valid local evaluator links clear under their retained SET NULL rules. Historical foreign or mixed references can reject deletion; the entire selected parent batch and its cascading effects must roll back, including a freely deletable peer. Deferred checks are assessed at actual transaction commit, separately from a function call returning inside an open SQL test transaction. This adds no transactional Storage or discovery/restore concurrency guarantee.

## Candidate and verification

Base: merged #1456 `d75045002702015183074d0ff73e04dd6e991dfa`, tree-identical to accepted `0afe15e3`, with full 619-file/5,513-test CI/build and completed approved clean CodeRabbit. Original native/provider baseline revision/digest and all four archives remain unchanged.

SQL worker's corrected source is `89f5d936dc5c7f0e9c0538582f66f6a511fa9454`. The first fresh run failed before the new assertions because its synthetic document fixture omitted required size/MIME metadata; its raw failure and owned cleanup remain preserved. The migration bytes were unchanged by the fixture correction. Eight database isolation/cleanup tests and focused provider-script lint/diff checks pass.

The corrected fresh run passes all 159 migrations, the full isolated `npm run db:test`, existing migration regressions/provider probes and the new actual PostgREST RPC probe. It returns exactly 1,001 deleted parents and preserves the independently expected controls, rows and Evaluation effects. Ordinary/anonymous and null calls reject. The separate populated predecessor upgrade is still running at this publication-preparation checkpoint; fresh/staged durable proof, complete independent acceptance, CodeRabbit and exact-candidate Depot results remain pending. No database acceptance or ready-to-merge claim until those gates finish.

The staged chain legitimately loads the existing pre-evaluator historical fixtures before applying the evaluator and new RPC migrations. The new SQL contract must retain all thirteen original rows across upgrade, compare every saved parent/child/Evaluation field after mixed legacy rejection and force deferred checks only inside a rollback-catching test subtransaction. The actual PostgREST probe separately awaits rejected commit and verifies literal rollback. No constraints are bypassed to create legacy data in a final schema.

Disposable project/port allocations, disabled legacy seed loading, migration ranges, versions, commands, exits, failed attempts and final cleanup will be packaged here after the complete owned run finishes. No existing local or remote database is accessed. Raw artifacts remain ignored until owned cleanup; new proof will be per-run archives with fresh expanded file-set/hash verification and independent observation review.

## Robert's manual operation and continuation

When exact-candidate checks/review and database acceptance are complete, apply only [the new migration](../../../supabase/migrations/20261001000100_personnel_archive_retention.sql) through the usual remote migration process, then merge this migration PR. It only creates the service-only function/grants and requests the provider schema-cache reload; it does not delete or archive any saved Person during application. Report that it is applied so the application consumer can safely merge afterward. The agent performs no remote database operation.

This PR uses `Refs #1360`. Application repair and verification continue while Robert applies/merges the migration; no other issue is activated. The application PR must wait for confirmed application and verified migration integration. CI does not deploy or migrate the remote provider; external Vercel publication/merge settings remain unknown. The existing application remains compatible with this additive function-only migration.
