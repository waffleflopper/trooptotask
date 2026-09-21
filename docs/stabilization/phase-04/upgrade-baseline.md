# Populated pre-retirement upgrade baseline

Phase 04 / [D01 #1309](https://github.com/waffleflopper/trooptotask/issues/1309), leaf **04-01c-01**. This supplies a persistent synthetic starting point for D02's future destructive upgrade. **No retirement migration or before/after-retirement pass is claimed.** Owner preflight/recovery and full-child acceptance remain 04-01c-02.

## Artifacts and behavior

- [upgrade-fixture.sql](upgrade-fixture.sql) inserts synthetic records once, in a transaction, into an empty, newly owned disposable replay. It refuses populated users/Organizations; no reset, trigger disabling, conflict suppression or cleanup SQL is used.
- [upgrade-snapshot.sql](upgrade-snapshot.sql) captures every field of every public-table row and `auth.users` under one consistent snapshot, including empty tables. It does not filter shared JSON or commercial-looking history. Run only against the synthetic project: its full-row output is unsuitable for publication from any real database.
- [upgrade-baseline.json](upgrade-baseline.json) is the actual populated capture. Stable identities, relationships, fields and complete JSON are reviewable, not just counts or digests. Generated/default timestamps are captured as observed; independent fresh loads need not be byte-identical. Within each upgrade run, every retained value must match that run's own before capture.
- [upgrade-baseline.test.sql](upgrade-baseline.test.sql) exercises the persisted fixture in a rolled-back transaction. Copy it into the disposable project's SQL test directory; it deliberately requires this fixture and is not installed in the ordinary unpopulated suite. It references retained objects only, so D02 can run it after retirement without retaining billing helpers.
- [upgrade-result.json](upgrade-result.json) records the actual replay, test, preservation, fault, canonical-check and cleanup results plus input/artifact hashes.

The fixture contains seven users; three Organizations including a suspended Organization; three Groups/Personnel; owner/admin/scoped-member/foreign-owner memberships; pending, blocked and accepted invitations with an approved Access Request/link and sent invitation outbox; a stored platform `billing` identity and user suspension. Calendar includes person and Group assignments, an out-of-scope slot and a manually edited duty-origin saved slot whose original run snapshot differs from its current assignee. Availability, status/type/rank records, a special day, independent signed rosters, completed export and audit are populated. All four commercial tables and all eight commercial Organization columns have representative values. Retention/storage bounds and commercial-looking shared user/audit/invitation-link JSON remain intact.

The 32 new assertions cover these persisted starting facts plus allowed and denied Organization/Group reads/writes, export authority, anonymous denial, suspension lookup and billing-role promotion denial. They protect the **same persisted identities across a future upgrade**, which the existing suites' transaction-local setup cannot do. Existing SQL suites still own comprehensive provisioning, invitation transitions, multi-Group/viewer permissions, concurrency, FK/slot semantics and sign-in validation; they are unchanged and run in full against the populated project. Existing application tests in `src/routes/admin/organizations/page.server.test.ts` and `[orgId]/page.server.test.ts` prove billing page denial. SQL `is_platform_admin()` includes active billing identities; this leaf does not invent broader SQL denial or change role behavior.

These checks use stable stored-data/authorization boundaries and explicit fixture outcomes. An internal implementation refactor preserving those outcomes should pass. A controlled transaction corrupting `clinic_role` makes the new suite fail its first assertion; rollback restores the entire baseline. This is a data-preservation oracle, not a structural/source snapshot test.

## Reproduce in a new isolated project

Read current lifecycle/configuration first. Follow the [replay setup](replay-baseline.md) with a **new** workspace/project and unused IPv4/IPv6 ports, pinned Postgres image, seed disabled with empty paths, minimal environment, and only audited migrations/tests/templates/package metadata copied. Never reuse/reset a stopped project, load the legacy seed, copy `.env`/remote linkage or connect to an existing local/remote stack.

This run substitutes `t3-phase04-01c-01` for `t3-phase04-01a-final`, ports 60620–60627/60629 for 60320–60327/60329, inspector 24683 for 24383, and `old + 4300` for `old + 4000`. Workspace: `/tmp/t3-phase04-01c-01/isolated`. The same 154 [input hashes](replay-inputs.sha256) cover 133 immutable migrations, 19 existing SQL suites and two templates. Verify exact migration ledger versions `20260413001158`–`20260920000100`. Supabase CLI 2.101.0 / PostgreSQL 17.6 (image 17.6.1.155) are pinned. Use Node 24.18.0 / npm 11.12.1; no install/lifecycle execution is needed inside the disposable project.

After startup, confirm the container belongs to this invocation's new allocation and its bound database port is 60622. From the repository root, run against **only that owned container**:

```bash
docker exec -i supabase_db_t3-phase04-01c-01 psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/stabilization/phase-04/upgrade-fixture.sql
docker exec -i supabase_db_t3-phase04-01c-01 psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/stabilization/phase-04/upgrade-snapshot.sql > /tmp/t3-phase04-01c-01/before.json
cp docs/stabilization/phase-04/upgrade-baseline.test.sql /tmp/t3-phase04-01c-01/isolated/supabase/tests/phase04_upgrade_baseline.sql
```

With the replay guide's minimal environment and npm 11.12.1 on PATH, execute `npm run db:test` **from `/tmp/t3-phase04-01c-01/isolated`**. This runs all 19 existing suites plus the fixture-specific suite. Any failure blocks acceptance; do not filter suites or change their assertions. Then capture again:

```bash
docker exec -i supabase_db_t3-phase04-01c-01 psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/stabilization/phase-04/upgrade-snapshot.sql > /tmp/t3-phase04-01c-01/after.json
```

Parse both JSON files and require complete equality, including every row, ID, field, timestamp and nested JSON value across all 69 relations. Confirm 27 relations are populated and all four commercial tables have a row; an empty replay is not this proof. Recheck ledger and original input hashes. The tracked JSON is a pretty-printed equivalent of the actual first capture, with no row or field normalization.

For D02, capture the populated baseline **before** applying the reviewed new forward migration in a newly allocated disposable project. Capture afterward and compare all retained relations/fields exactly; only the explicitly reviewed four commercial tables and eight Organization columns may be absent. Shared metadata, audit, role identities and invitation history are not removal targets. Run this same retained probe and every retained SQL suite through `npm run db:test` on the upgrade target, plus independent fresh replay and catalog/type generation under D02. Missing relations or unexpected differences block the destructive cutover. Do not substitute this D01 pre-retirement run for those future checks.

## Verification, cleanup and release boundary

Run the [canonical seven commands](../../architecture/DEFINITION_OF_DONE.md#required-commands), including production build, with offline synthetic provider settings. No application journey changes here; no browser suite is created or run. Validate touched Markdown/JSON explicitly and check links/whitespace. Raw startup logs stay outside Git because they may contain disposable credentials.

After the run, stop only the newly created project:

```bash
supabase stop --workdir /tmp/t3-phase04-01c-01/isolated --project-id t3-phase04-01c-01 --no-backup
```

Confirm zero owned containers/volumes/networks and unchanged pre-existing container identities/running states. Preserve command receipts, not database resources. [Execution evidence](../EVIDENCE.md#task-04-01c-01--populated-upgrade-baseline) records actual results and limitations.

R1–R7 are preserved through stored baseline and retained SQL/application tests; R8's active-schema retirement remains D02, with Duty Roster removal in its own later phases. No existing source, migration, test, data, runtime configuration or generated artifact is deleted or replaced here. Production cleanup remains PENDING OWNER EXECUTION. Repository CI is manual; Vercel publication/merge may deploy and external settings remain unknown. No automatic remote migration is configured. Owner deployment notice, backup/restore and application/schema compatibility prerequisites remain required before any later destructive release; this leaf performs no publication, merge, deployment or remote operation.
