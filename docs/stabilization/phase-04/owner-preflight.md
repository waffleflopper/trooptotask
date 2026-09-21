# Billing schema preflight and recovery plan

Phase 04 / [D01 #1309](https://github.com/waffleflopper/trooptotask/issues/1309), leaf **04-01c-02**. This is preparation for [D02 #1310](https://github.com/waffleflopper/trooptotask/issues/1310). No retirement migration exists in D01. Production catalog, record disposition, backup restore, deployed callers and provider shutdown are **UNVERIFIED / PENDING OWNER EXECUTION**. Local preflight success does not authorize deletion or certify production readiness.

## Exact proposed destruction

D02 must deliver these changes atomically with all affected consumers, tests and generated target artifacts. Use explicit identities and PostgreSQL's restrictive dependency checks; no broad `CASCADE`, unknown-object deletion, compatibility RPC, or `IF EXISTS` masking an unexpected starting schema. Applied migrations and D01 historical baseline artifacts stay immutable.

1. Drop the eight exact `public` signatures in the [reviewed RPC inventory](catalog-inventory.md#exact-active-rpc-signatures-and-acls):
   - `cleanup_old_webhook_events()`
   - `get_effective_tier(uuid)`
   - `record_stripe_webhook_event_attempt(text,text,jsonb,text,text,timestamp with time zone)`
   - `record_retryable_stripe_webhook_event_attempt(text,text,jsonb,text,text,timestamp with time zone)`
   - `upsert_organization_billing_snapshot_if_current(jsonb)`
   - `upsert_organization_billing_snapshot_and_mirror_if_current(jsonb,jsonb,jsonb)`
   - `block_invitation_if_member_cap_exceeded(uuid,uuid,uuid,integer,text)`
   - `list_platform_organization_tier_counts()`
2. Drop only `public.organization_billing_snapshots`, `public.stripe_webhook_events`, `public.organization_checkout_attempts`, and `public.organization_plan_feature_overrides`, including their rows and table-owned objects. The [catalog](catalog-baseline.json) and executable [preflight](owner-preflight.sql) name every one of their 65 columns, 20 constraints, 15 indexes, nine policies and three user triggers, with definitions and grants. Table row/array types, internal FK/TOAST objects and defaults retire through ownership, not a broad cascade. Preserve their outgoing referenced Organization/Auth rows and shared functions.
3. Drop only these eight columns from `public.organizations`: `tier`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`, `gift_tier`, `gift_expires_at`, `gifted_by`. Their owned constraints are `organizations_tier_check`, `organizations_gift_tier_check`, `organizations_subscription_status_check`, and `organizations_gifted_by_fkey`; only `tier` and `subscription_status` have defaults. Preserve every other field and row.

The three retiring user triggers are `organization_billing_snapshots_updated_at`, `organization_checkout_attempts_updated_at`, and `update_stripe_webhook_events_updated_at`. Preserve `update_updated_at_column()` and its 15 retained trigger consumers. No commercial enum, view or cron job was discovered. The two-argument mirror overload is already absent; an unexpected overload or dependency blocks review of that operation.

No retained effective function needs a commercial rewrite in the audited chain. If D02 finds one, replace its mixed behavior with correctly owned noncommercial behavior and cut over every caller in the same PR before removal. Preserve membership/admission/suspension helpers, invitation blocked/history fields and enum values, stored platform `billing` identities and their current denial behavior, exports/audit/acquisition/outbox, Personnel Duty Role, Sign-In Rosters and all Calendar facts. Shared JSON and historical metadata are not deletion targets.

D02 also deletes the retired-only `supabase/tests/organization_billing_snapshots_rls.sql`, replaces only the six retired-RPC assertions in `sensitive_rpc_privileges.sql`, and removes the unused `organization_plan_feature_overrides` fixture in `src/hooks.organizationAdmission.test.ts`. Keep all retained privilege/admission assertions. Regenerate fresh and populated-upgrade target artifacts through the [real generation process](generation-baseline.md); do not manually erase baseline fields or replace immutable migration history. The baseline RPC privilege exposure remains an explicit D02 removal obligation.

## Executable read-only preflight

[owner-preflight.sql](owner-preflight.sql) uses a read-only repeatable-read transaction, bounded lock/statement timeouts, `ON_ERROR_STOP`, and catalog assertions against D01's reviewed definitions. It checks:

- Exact function signatures, bodies/configuration, owners and ACLs; unexpected overloads fail.
- Exact commercial table columns, owners, RLS, ACLs, constraints, indexes, policies and user triggers; eight Organization column definitions and four attached constraints.
- Inbound dependencies across schemas, recursively including automatically owned row types and other subordinate objects. Additional Organization indexes/triggers fail rather than disappearing silently with a column.
- Unclassified routine-body references, including nonpublic routines, and cron callers; commercial publication membership or an all-tables publication fails.
- Nonzero commercial table counts and nonnull commercial Organization field counts are reported for owner disposition. No customer identifiers, payloads or row values are output; populated tables are expected, not silently approved for erasure.

The inline expected manifest comes from [catalog-baseline.json](catalog-baseline.json); function definition MD5 values are equality fingerprints, not security hashes. Catalog definitions under `search_path=pg_catalog` match the original capture. A changed fingerprint requires investigating/reviewing the actual definition; do not update expected values simply to obtain a pass. The existing catalog query remains a disposable-only discovery tool; do not run its potentially sensitive body/job output against a real environment without separate authorization and a private evidence plan.

This preflight deliberately requires a role with full RLS visibility and catalog/table read privileges. Insufficient access, timeout, missing extensions, unknown objects or drift is **BLOCKED**, not an empty result. Its body search conservatively flags full identifier words (including `tier`); false positives require review. Dynamically assembled identifiers, external jobs/callers and arbitrary embedded JSON dependencies cannot be established by catalog searches. They remain explicit manual blockers until the owner inventories and dispositions them. A schema match cannot establish backup readiness, app compatibility or data-retention disposition.

Reproduce with a **new** disposable project using the [replay guide](replay-baseline.md), then load the [populated fixture](upgrade-baseline.md). This leaf allocated `/tmp/t3-phase04-01c-02/isolated`, project `t3-phase04-01c-02`, unused ports 60720–60727/60729 and inspector 24783 (offset `old + 4400`), Postgres image 17.6.1.155, and seeds disabled with empty paths. Never reuse a stopped workspace or existing stack. After verifying ownership, run:

```bash
docker exec -i supabase_db_t3-phase04-01c-02 psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/stabilization/phase-04/owner-preflight.sql
python docs/stabilization/phase-04/owner-preflight.test.py /tmp/t3-phase04-01c-02/isolated /tmp/t3-phase04-01c-02/preflight-tests.json
```

The probe runner admits only a seed-disabled, unlinked disposable allocation outside protected ports. Prior setup/ownership verification is still required. It runs the actual assertion body against 15 transactional faults: overload, cross-schema view, body-only caller, external FK, row-type caller, added column, RPC configuration drift, mixed Organization check, expression index, RLS change, cron caller, owned sequence/rule/extended statistics and replication consumer. Each must fail for its relevant reason; connection close rolls back the fault, the unchanged preflight must then pass, and every persisted row must match the original capture. These cases test the refusal contract at PostgreSQL's boundary; the existing retained suites do not test this new verifier. Run all retained SQL contracts with `npm run db:test` from the isolated workdir and verify all 156 current input hashes and the migration ledger. Compare full catalog before/after probes to detect schema residue as well as row changes.

Only a **separately authorized owner**, after choosing/verifying a target and arranging private receipts, may later use a configured libpq service (placeholder below, not a command run by this task):

```bash
psql 'service=OWNER_APPROVED_TARGET' -X -qAt -v ON_ERROR_STOP=1 -f docs/stabilization/phase-04/owner-preflight.sql
```

Do not put credentials in command history or Git. An exit 0 means only that this bounded preflight matched; the manual prerequisites below still block destructive execution. D02 must refresh the preflight to its final reviewed migration, acquire appropriate locks and recheck dependencies within the migration's transaction under a controlled change window. A prior read-only snapshot cannot protect against later schema/data/caller changes. Any mismatch stops the affected operation for explicit disposition; it does not justify discarding unrelated data or expanding the drop set.

## Ordered release and recovery prerequisites

[RELEASE](../RELEASE.md#billing-schema-preparation--04-01c-02) links this plan. D01 changes no runtime or active schema and needs no remote migration. Before any later D02 merge that might release destructive behavior, Robert must identify the deployment owner/trigger, notify affected operators, and verify the following order against the actual app and schema candidates:

1. Identify the reviewed app SHA and separately reviewed forward-migration SHA/file/hash. Deploy the application that no longer calls commercial objects while the old schema still exists. Inventory and drain old instances, workers, scheduled jobs, RPC/API clients and in-flight requests; pause relevant writes for the migration window. Old application images and old provider configuration are not assumed safe rollback candidates.
2. Stop/disposition external billing delivery and financial obligations using the existing [commercial retirement sequence](../RELEASE.md#commercial-operations-retirement--03-07b-01). Confirm provider retries and independent operators cannot resume commercial writes. These actions need separate authorization; application removal does not cancel charges or erase obligations.
3. Inventory real object/data differences privately. Obtain explicit disposition for all four populated financial/history tables and eight column values, including retained archives and applicable obligations. Preserve ambiguous shared JSON/metadata/roles/invitation history by default; ambiguity blocks that destructive step only. Record owner, scope and evidence reference without private payloads.
4. Verify a complete recoverable backup/PITR point and a successful restore rehearsal in a separately authorized target. Record coverage of database/schema/roles/extensions and associated Auth/Storage/config dependencies, retention, custodian, timestamp, recovery-point/time objectives, and a compatible application candidate. A backup job's success alone is not restore proof. Decide how to pause/capture/reconcile writes since that point; do not promise lossless rollback without this evidence.
5. Run the final owner-approved read-only preflight with full visibility, review counts/dependencies/callers and obtain explicit migration authorization. D02 must already have passed independent fresh replay, populated upgrade, exact retained-row comparison, positive/negative RLS, target absence checks, real regeneration, all canonical commands/build and review. Apply only the reviewed forward migration with transactional abort on any mismatch; no interactive ad hoc cascade or remote execution by this driver.
6. Before resuming traffic, verify retained R1–R7 data/identity/relationships/meaningful fields, Calendar person/Group assignments and edits, reviewed acquisition/invitations/provisioning, auth/MFA/suspension/tenant scope, exports/audit and technical limits. Verify target absence, required grants/helpers and app compatibility. Capture owner evidence privately. Remove external commercial secrets/config only after all retained callers and the agreed recovery candidate no longer require them; retain auth/email/cleanup settings.

**Before migration commit:** a failed transactional migration can roll back its schema/data changes; validate that D02's final migration contains no nontransactional side effects. Keep compatible app/caller shutdown in place while resolving the failure.

**After destructive commit:** reversing DDL or redeploying an older binary cannot recreate deleted records. Stop affected traffic/writes and choose a reviewed compatible roll-forward, or restore the verified pre-change backup/PITR into the owner-approved recovery target with its compatible app/config. Account for every write since the restore point (reconciliation/replay, accepted data loss, duplicate side effects and authentication/storage consistency). Unknown recovery compatibility, unverified restore or undispositioned writes block recovery claims and the destructive release. Do not overwrite the live database based on this plan.

D03 verifies integrated repository readiness; phase acceptance never means production cleanup occurred. Actual hosted operations remain **PENDING OWNER EXECUTION** until separately authorized evidence exists.
