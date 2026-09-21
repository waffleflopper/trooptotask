# Billing schema preflight and recovery plan

Phase 04 / [D02 #1310](https://github.com/waffleflopper/trooptotask/issues/1310), final owner plan **04-02b**. [D01 #1309](https://github.com/waffleflopper/trooptotask/issues/1309) supplied the unchanged pre-retirement catalog and read-only SQL assertions; D02 supplies the [atomic forward migration](../../../supabase/migrations/20260921000100_retire_commercial_schema.sql), complete test/consumer cutover and verified target artifacts. Production catalog, record disposition, backup restore, deployed callers and provider shutdown are **UNVERIFIED / PENDING OWNER EXECUTION**. Local preflight success does not authorize deletion or certify production readiness.

## Exact proposed destruction

D02 delivers these changes atomically with all affected consumers, tests and generated target artifacts. This inventory describes the exact proposed owner operation; local synthetic execution is recorded in [retirement evidence](../EVIDENCE.md#task-04-02a--atomic-retirement-and-verified-target). Use explicit identities and PostgreSQL's restrictive dependency checks; no broad `CASCADE`, unknown-object deletion, compatibility RPC, or `IF EXISTS` masking an unexpected starting schema. Applied migrations and D01 historical baseline artifacts stay immutable.

1. Drop the eight exact `public` signatures in the [reviewed RPC inventory](catalog-inventory.md#exact-active-rpc-signatures-and-acls):
   - `cleanup_old_webhook_events()`
   - `get_effective_tier(uuid)`
   - `record_stripe_webhook_event_attempt(text,text,jsonb,text,text,timestamp with time zone)`
   - `record_retryable_stripe_webhook_event_attempt(text,text,jsonb,text,text,timestamp with time zone)`
   - `upsert_organization_billing_snapshot_if_current(jsonb)`
   - `upsert_organization_billing_snapshot_and_mirror_if_current(jsonb,jsonb,jsonb)`
   - `block_invitation_if_member_cap_exceeded(uuid,uuid,uuid,integer,text)`
   - `list_platform_organization_tier_counts()`
2. Drop only `public.organization_billing_snapshots`, `public.stripe_webhook_events`, `public.organization_checkout_attempts`, and `public.organization_plan_feature_overrides`, including their rows and table-owned objects. The [catalog](schema-snapshots.md#archived-files) and executable [preflight](owner-preflight.sql) name every one of their 65 columns, 20 constraints, 15 indexes, nine policies and three user triggers, with definitions and grants. Table row/array types, internal FK/TOAST objects and defaults retire through ownership, not a broad cascade. Preserve their outgoing referenced Organization/Auth rows and shared functions.
3. Drop only these eight columns from `public.organizations`: `tier`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`, `gift_tier`, `gift_expires_at`, `gifted_by`. Their owned constraints are `organizations_tier_check`, `organizations_gift_tier_check`, `organizations_subscription_status_check`, and `organizations_gifted_by_fkey`; only `tier` and `subscription_status` have defaults. Preserve every other field and row.

The three retiring user triggers are `organization_billing_snapshots_updated_at`, `organization_checkout_attempts_updated_at`, and `update_stripe_webhook_events_updated_at`. Preserve `update_updated_at_column()` and its 15 retained trigger consumers. No commercial enum, view or cron job was discovered. The two-argument mirror overload is already absent; an unexpected overload or dependency blocks review of that operation.

No retained effective function needs a commercial rewrite: all 95 retained function definitions/configuration/ACLs match the baseline in both verified targets, and current source has no retired caller. Unexpected hosted callers or mixed behavior block the affected destructive operation for review; do not introduce a compatibility RPC. Preserve membership/admission/suspension helpers, invitation blocked/history fields and enum values, stored platform `billing` identities and their current denial behavior, exports/audit/acquisition/outbox, Personnel Duty Role, Sign-In Rosters and all Calendar facts. Shared JSON and historical metadata are not deletion targets.

The complete D02 cutover also deletes the retired-only `supabase/tests/organization_billing_snapshots_rls.sql`, removes only the six retired-RPC assertions in `sensitive_rpc_privileges.sql`, and removes the unused `organization_plan_feature_overrides` fixture in `src/hooks.organizationAdmission.test.ts`. Keep all retained privilege/admission assertions. Fresh and populated-upgrade target artifacts were generated through the [real generation process](generation-baseline.md) and match; baseline artifacts and immutable history remain untouched. The target absence contract also verifies removal of the anonymously executable legacy ledger RPCs. See the [verification procedure](retirement-verification.md) and [receipt](retirement-result.json).

## Executable read-only preflight

[owner-preflight.sql](owner-preflight.sql) uses a read-only repeatable-read transaction, bounded lock/statement timeouts, `ON_ERROR_STOP`, and catalog assertions against D01's reviewed definitions. It checks:

- Exact function signatures, bodies/configuration, owners and ACLs; unexpected overloads fail.
- Exact commercial table columns, owners, RLS, ACLs, constraints, indexes, policies and user triggers; eight Organization column definitions and four attached constraints.
- Inbound dependencies across schemas, recursively including automatically owned row types and other subordinate objects. Additional Organization indexes/triggers fail rather than disappearing silently with a column.
- Unclassified routine-body references, including nonpublic routines, and cron callers; commercial publication membership or an all-tables publication fails.
- Nonzero commercial table counts and nonnull commercial Organization field counts are reported for owner disposition. No customer identifiers, payloads or row values are output; populated tables are expected, not silently approved for erasure.

The inline expected manifest comes from [catalog-baseline.json](schema-snapshots.md#archived-files); function definition MD5 values are equality fingerprints, not security hashes. Catalog definitions under `search_path=pg_catalog` match the original capture. A changed fingerprint requires investigating/reviewing the actual definition; do not update expected values simply to obtain a pass. The existing catalog query remains a disposable-only discovery tool; do not run its potentially sensitive body/job output against a real environment without separate authorization and a private evidence plan.

This preflight deliberately requires a role with full RLS visibility and catalog/table read privileges. Insufficient access, timeout, missing extensions, unknown objects or drift is **BLOCKED**, not an empty result. Its body search conservatively flags full identifier words (including `tier`); false positives require review. Dynamically assembled identifiers, external jobs/callers and arbitrary embedded JSON dependencies cannot be established by catalog searches. They remain explicit manual blockers until the owner inventories and dispositions them. A schema match cannot establish backup readiness, app compatibility or data-retention disposition.

Reproduce the pre-retirement check from a **temporary source export of merged D01** at `584af3797dae92c42968d69ab8e6ad279f955836`, as specified in the [upgrade source-selection procedure](retirement-verification.md#reproduction-and-isolation). Verify the original 156 D01 input hashes; the current D02 checkout deliberately has a different 157-input target manifest and cannot be used as the old-schema replay source. Use that export with the [replay guide](replay-baseline.md) to allocate a **new** disposable project, then load the [populated fixture](upgrade-baseline.md). The historical D01 preflight run allocated `/tmp/t3-phase04-01c-02/isolated`, project `t3-phase04-01c-02`, unused ports 60720–60727/60729 and inspector 24783 (offset `old + 4400`), Postgres image 17.6.1.155, and seeds disabled with empty paths. Never reuse a stopped workspace or existing stack. The following records that completed run, not a reusable allocation. Substitute your newly allocated owned project/workdir in both commands after verifying ownership:

```bash
docker exec -i supabase_db_t3-phase04-01c-02 psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/stabilization/phase-04/owner-preflight.sql
python docs/stabilization/phase-04/owner-preflight.test.py /tmp/t3-phase04-01c-02/isolated /tmp/t3-phase04-01c-02/preflight-tests.json
```

The probe runner admits only a seed-disabled, unlinked disposable allocation outside protected ports. Prior setup/ownership verification is still required. It runs the actual assertion body against 15 transactional faults: overload, cross-schema view, body-only caller, external FK, row-type caller, added column, RPC configuration drift, mixed Organization check, expression index, RLS change, cron caller, owned sequence/rule/extended statistics and replication consumer. Each must fail for its relevant reason; connection close rolls back the fault, the unchanged preflight must then pass, and every persisted row must match the original capture. These cases test the refusal contract at PostgreSQL's boundary; the existing retained suites do not test this new verifier. Run all retained SQL contracts with `npm run db:test` from the isolated workdir and verify all 156 D01 baseline input hashes and the migration ledger. Compare full catalog before/after probes to detect schema residue as well as row changes.

Only a **separately authorized owner**, after choosing/verifying a target and arranging private receipts, may later use a configured libpq service (placeholder below, not a command run by this task):

```bash
psql 'service=OWNER_APPROVED_TARGET' -X -qAt -v ON_ERROR_STOP=1 -f docs/stabilization/phase-04/owner-preflight.sql
```

Do not put credentials in command history or Git. An exit 0 means only that this bounded preflight matched; the manual prerequisites below still block destructive execution. The final migration embeds the same reviewed manifest and dependency assertions, acquires five ACCESS EXCLUSIVE table locks, and rechecks inside its writable transaction. The read-only transaction/visibility guard is the sole assertion-body difference; the migration retains full-visibility admission. Its 5-second lock and 60-second statement timeouts stop a blocked or slow operation rather than permitting a partial cutover. Table locks do not freeze unrelated function bodies, cron jobs or external clients: a controlled schema-change/write window and caller shutdown remain mandatory. A prior read-only snapshot cannot protect against later schema/data/caller changes. Any mismatch stops the affected operation for explicit disposition; it does not justify discarding unrelated data or expanding the drop set.

## Exact candidate and execution boundary

The reviewed file is `supabase/migrations/20260921000100_retire_commercial_schema.sql`, SHA-256 `b99723191da90b7276e79b8a40a1d14ac447710d9d7522e2b886a9e6e1f80646`. Verify it before the controlled operation:

```bash
sha256sum supabase/migrations/20260921000100_retire_commercial_schema.sql
```

The D02 implementation is committed as `1e24c9e90e8baf984e5636e2130411e0bc14a4f6`, based on `main` at `584af3797dae92c42968d69ab8e6ad279f955836`; subsequent commits carry review records and handoff documentation. Resolve the actual PR head and merged default-branch commit before execution; a branch name is not a release identity. Use the platform's approved migration runner to apply this exact file and record its ledger entry, after separately authorizing the target and reviewing its pending-migration list. Do not use a blanket remote migration command that could apply other pending files. The driver runs no remote command.

Keep [owner-preflight.sql](owner-preflight.sql) as the pre-retirement check. Its count report supports explicit record disposition and its read-only rollback leaves data unchanged. It is expected to refuse the already retired schema; do not rerun it as a post-migration health check or edit it to match the target. After migration, use the [target absence contract](../../../supabase/tests/commercial_schema_retirement.sql) as a review specification, plus owner-approved retained-flow/data checks. The SQL test suite itself uses fixture/extension setup and is authorized only in disposable local projects, not as a production command. Generated schema snapshots are review artifacts, never executable migrations.

The D01 read-only preflight and D02 embedded assertions remain byte-equivalent after the documented transaction guard substitution. Existing D01 refusal evidence and D02's accepted/15-refusal/late-failure rollback evidence cover that unchanged contract. This final documentation reconciliation does not change SQL inputs or require another destructive replay. Any subsequent migration, assertion, SQL-test or generated-artifact change invalidates that continuity and requires the applicable isolated verification again.

## Ordered release and recovery prerequisites

[RELEASE](../RELEASE.md#billing-schema-local-cutover--04-02a) links this final plan. D01 merged into default `main` at `584af3797dae92c42968d69ab8e6ad279f955836`; the current D02 application has the same runtime files and already has no commercial schema callers. Before a D02 publication/merge that might release destructive behavior, Robert must identify the deployment owner/trigger, notify affected operators, and verify the following order against the actual app and schema candidates:

1. Identify the reviewed app SHA and separately reviewed forward-migration SHA/file/hash. Deploy the application that no longer calls commercial objects while the old schema still exists. Inventory and drain old instances, workers, scheduled jobs, RPC/API clients and in-flight requests; pause relevant writes for the migration window. Old application images and old provider configuration are not assumed safe rollback candidates.
2. Stop/disposition external billing delivery and financial obligations using the existing [commercial retirement sequence](../RELEASE.md#commercial-operations-retirement--03-07b-01). Confirm provider retries and independent operators cannot resume commercial writes. These actions need separate authorization; application removal does not cancel charges or erase obligations.
3. Inventory real object/data differences privately. Obtain explicit disposition for all four populated financial/history tables and eight column values, including retained archives and applicable obligations. Preserve ambiguous shared JSON/metadata/roles/invitation history by default; ambiguity blocks that destructive step only. Record owner, scope and evidence reference without private payloads.
4. Verify a complete recoverable backup/PITR point and a successful restore rehearsal in a separately authorized target. Record coverage of database/schema/roles/extensions and associated Auth/Storage/config dependencies, retention, custodian, timestamp, recovery-point/time objectives, and a compatible application candidate. A backup job's success alone is not restore proof. Decide how to pause/capture/reconcile writes since that point; do not promise lossless rollback without this evidence.
5. Run the final owner-approved read-only preflight with full visibility, review counts/dependencies/callers and obtain explicit migration authorization. Use the complete [D02 work record](../EVIDENCE.md#task-04-02b--final-owner-preflight-and-d02-acceptance) and reviewed PR candidate to verify fresh replay, populated upgrade, exact retained-row comparison, positive/negative RLS, target absence checks, real regeneration, canonical commands/build and independent review. Hosted Actions is currently unavailable; do not infer a CI pass from local evidence. Apply only the reviewed forward migration with transactional abort on any mismatch; no interactive ad hoc cascade or remote execution by this driver.
6. Before resuming traffic, verify retained R1–R7 data/identity/relationships/meaningful fields, Calendar person/Group assignments and edits, reviewed acquisition/invitations/provisioning, auth/MFA/suspension/tenant scope, exports/audit and technical limits. Verify target absence, required grants/helpers and app compatibility. Capture owner evidence privately. Remove external commercial secrets/config only after all retained callers and the agreed recovery candidate no longer require them; retain auth/email/cleanup settings.

**Before migration commit:** a failed transactional migration can roll back its schema/data changes; the reviewed migration contains only transactional assertions/locks/DDL and no nontransactional side effect; its late-failure rollback was exercised locally. Keep compatible app/caller shutdown in place while resolving the failure.

**After destructive commit:** reversing DDL or redeploying an older binary cannot recreate deleted records. Stop affected traffic/writes and choose a reviewed compatible roll-forward, or restore the verified pre-change backup/PITR into the owner-approved recovery target with its compatible app/config. Account for every write since the restore point (reconciliation/replay, accepted data loss, duplicate side effects and authentication/storage consistency). Unknown recovery compatibility, unverified restore or undispositioned writes block recovery claims and the destructive release. Do not overwrite the live database based on this plan.

D03 verifies integrated repository readiness; phase acceptance never means production cleanup occurred. Actual hosted operations remain **PENDING OWNER EXECUTION** until separately authorized evidence exists.

## Owner command sequence after verified merge

These are **owner-run remote operations**, not commands executed by the agent. Complete the ordered release/recovery prerequisites above first. This sequence was checked against installed Supabase CLI **2.101.0** and its [official CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push). The remote catalog and migration history have not been inspected here.

1. **Use the merged revision in a new worktree.** Replace `MERGED_D02_SHA` with the verified merge commit from the finished PR; choose another unused directory if this one exists. Run subsequent commands from that worktree. No dependency installation, seed loading or local database startup is needed for these operator commands.

   ```bash
   git fetch origin
   git worktree add --detach ../trooptotask-d02-migration MERGED_D02_SHA
   cd ../trooptotask-d02-migration
   supabase --version
   sha256sum supabase/migrations/20260921000100_retire_commercial_schema.sql
   ```

   Require the migration hash `b99723191da90b7276e79b8a40a1d14ac447710d9d7522e2b886a9e6e1f80646`. Confirm the compatible application is deployed and the agreed backup/restore, record disposition and caller/write shutdown are complete.

2. **Select the intended Supabase project.** Replace `YOUR_PROJECT_REF` with its Dashboard project reference, and use interactive authentication/password prompts. Keep secrets out of command arguments and shared logs.

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```

   Every earlier local/remote migration version must match, and the **only pending file** must be `20260921000100_retire_commercial_schema.sql`. Otherwise stop and review the discrepancy; do not reset, repair history, remove migration files or add include flags to force progress. If D02 is already recorded as applied, skip execution and investigate its existing result. The CLI has no single-target-version flag here; this pending-list check is essential.

3. **Run the read-only preflight on the same project.** Obtain the host and database username from Dashboard **Connect**, using a direct connection or session pooler on port 5432, not the transaction pooler. Replace `YOUR_HOST`/`YOUR_DB_USER` below; for session pooling the username includes the project reference. Verify it agrees with the project linked above. The database password is entered at the prompt.

   ```bash
   psql 'host=YOUR_HOST port=5432 dbname=postgres user=YOUR_DB_USER sslmode=require' \
     -W -X -v ON_ERROR_STOP=1 \
     -f docs/stabilization/phase-04/owner-preflight.sql
   ```

   Alternatively use the verified libpq service described above. Require exit zero and review the reported counts against the approved data disposition. The file includes a psql backslash command; do not paste it unchanged into SQL Editor. Keep the controlled maintenance window active. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

4. **Apply the one reviewed migration.** Recheck that the CLI confirmation lists only the D02 file, then confirm interactively:

   ```bash
   supabase db push --linked
   ```

   Do not use `--yes`, `--include-all`, `--include-seed` or `--include-roles`. Use the CLI rather than running the DDL directly in SQL Editor so successful application is recorded in migration history. On any error or interrupted connection, stop and establish actual schema/ledger state before retrying; do not assume commit did or did not happen. See [Supabase migration guidance](https://supabase.com/docs/guides/deployment/database-migrations).

5. **Verify the ledger and target absence.** Both local/remote lists must now include `20260921000100`, and the dry run must report no pending migrations:

   ```bash
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```

   Run the following read-only SQL on that same project using psql or SQL Editor. Expect three zero counts and one ledger row:

   ```sql
   SELECT 'retired_tables' AS check_name, count(*) AS remaining
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN (
     'organization_billing_snapshots', 'stripe_webhook_events',
     'organization_checkout_attempts', 'organization_plan_feature_overrides'
   )
   UNION ALL
   SELECT 'retired_columns', count(*) FROM pg_attribute
   WHERE attrelid = 'public.organizations'::regclass AND NOT attisdropped
     AND attname IN ('tier', 'stripe_customer_id', 'stripe_subscription_id',
       'subscription_status', 'current_period_end', 'gift_tier', 'gift_expires_at', 'gifted_by')
   UNION ALL
   SELECT 'retired_functions', count(*) FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname IN (
     'cleanup_old_webhook_events', 'get_effective_tier',
     'record_stripe_webhook_event_attempt', 'record_retryable_stripe_webhook_event_attempt',
     'upsert_organization_billing_snapshot_if_current',
     'upsert_organization_billing_snapshot_and_mirror_if_current',
     'block_invitation_if_member_cap_exceeded', 'list_platform_organization_tier_counts'
   );
   SELECT version FROM supabase_migrations.schema_migrations
   WHERE version = '20260921000100';
   ```

   These queries check target absence and ledger state, not retained data/behavior by themselves. Do not rerun the old-schema preflight as a health check or run fixture-based SQL tests against the real project.

6. **Verify retained data and flows before resuming traffic.** Compare the privately recorded retained data/identities/relationships, then exercise the Organization/Group, Personnel, Calendar person/Group assignment and edit, invitation/provisioning, auth/MFA/suspension, export/audit checks in the ordered plan. Keep the commands, outputs, migration/app revision and migration hash in private operator evidence. Use the recovery plan above if validation fails; recreating empty tables or reverting the app cannot recover deleted records.
