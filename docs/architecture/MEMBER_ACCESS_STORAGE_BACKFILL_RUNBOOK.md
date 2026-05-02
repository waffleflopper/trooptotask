# Member Access Storage Backfill Runbook

This runbook covers the production handling for
`supabase/migrations/20260501000100_member_access_storage.sql`.

It exists because that migration adds the stored member-access shape approved in
ADR 0001, then backfills legacy membership and invitation permission columns into
the new `member_preset`, `capability_overrides`, `access_scope_kind`,
and `access_scope_group_ids` columns.

## Current-State Truth

- The migration is additive first: it adds nullable member-access columns to
  `organization_memberships` and `organization_invitations`.
- The broadest operation is the `UPDATE public.organization_memberships ...`
  backfill. It rewrites every membership row that is missing any destination
  member-access field.
- The invitation backfill follows the same shape, but `organization_invitations`
  is expected to be smaller and less write-heavy than memberships.
- The migration later makes the new columns `NOT NULL`, adds defaults, adds check
  constraints, and creates `member_access_group_scope_matches(...)`.
- No production database should be touched by agents while implementing or
  reviewing this documentation.

## Expected Lock Behavior

Postgres will take short table locks for `ALTER TABLE` statements. The broad
membership backfill is the long-running risk: it takes row locks on affected
`organization_memberships` rows and keeps them until its transaction commits.
Readers should generally continue through MVCC (Postgres' snapshot read model),
but concurrent membership writes can block the backfill or be blocked by it.

The final `SET NOT NULL` and check-constraint steps may scan the table and need a
strong table lock. They should be run only after the backfill count is zero and
the operator has confirmed there are no long-running membership writes.

Expected production impact when handled correctly:

- brief DDL lock windows for additive columns, defaults, `NOT NULL`, and checks
- potentially noticeable write contention during a one-shot membership backfill
- low risk for ordinary reads unless lock waits cascade into the app pool

## Production Recommendation

Do not run the existing migration directly against production unless an operator
has confirmed that `organization_memberships` is small, production traffic is
quiet, and a one-shot rewrite is acceptable.

For production with real customer membership volume, use a reviewed manual
procedure:

1. Apply the additive column and helper-function setup from the migration.
2. Backfill `organization_memberships` in small batches using the exact same
   `SET` expressions from the migration.
3. Backfill `organization_invitations` in one statement or in batches if the
   preflight count is unexpectedly large.
4. Confirm no destination member-access fields remain null.
5. Apply defaults, `NOT NULL` constraints, check constraints, and the
   `member_access_group_scope_matches(...)` function.
6. Mark the migration as applied only through the reviewed Supabase migration
   workflow used by the maintainer running the production change.

The batch update should be shaped like this. This is a template, not a
copy-paste-ready statement: the operator must copy the full `SET` block from the
committed migration instead of hand-translating the mapping logic.

```text
WITH batch AS (
  SELECT id
  FROM public.organization_memberships
  WHERE member_preset IS NULL
     OR capability_overrides IS NULL
     OR access_scope_kind IS NULL
     OR access_scope_group_ids IS NULL
  ORDER BY id
  LIMIT 500
  FOR UPDATE SKIP LOCKED
)
UPDATE public.organization_memberships AS organization_memberships
SET
  <the exact SET expressions from 20260501000100_member_access_storage.sql>
FROM batch
WHERE organization_memberships.id = batch.id;
```

Run one batch per transaction. Start with a small batch size, increase only if
lock waits and app health stay normal, and pause between batches if the app is
under load.

## Preflight

Before production execution:

- take or confirm a fresh managed database backup
- schedule the change for a low-traffic window
- confirm the app release that needs member-access storage is ready but not yet
  serving production traffic
- count rows needing membership backfill and invitation backfill
- check for long-running transactions touching memberships or invitations
- set conservative `lock_timeout` and `statement_timeout` for the operator
  session so unexpected blocking fails fast instead of silently queuing
- keep a rollback owner and release owner present for the whole migration window

Useful preflight counts:

```sql
SELECT count(*) AS memberships_needing_backfill
FROM public.organization_memberships
WHERE member_preset IS NULL
   OR capability_overrides IS NULL
   OR access_scope_kind IS NULL
   OR access_scope_group_ids IS NULL;

SELECT count(*) AS invitations_needing_backfill
FROM public.organization_invitations
WHERE member_preset IS NULL
   OR capability_overrides IS NULL
   OR access_scope_kind IS NULL
   OR access_scope_group_ids IS NULL;
```

## Stop Conditions

Stop the migration procedure before finalizing constraints if any of these occur:

- lock waits exceed the operator's configured timeout
- app error rates, checkout, invite acceptance, settings, or member-management
  flows show user-visible failures
- membership writes queue behind the migration
- Supabase reports connection pressure or transaction age that could affect
  normal traffic
- the null-field count does not decrease after a batch
- any batch uses SQL that differs from the committed migration's mapping logic

If a direct migration attempt times out before commit, treat the transaction as
failed and verify the remote migration state before retrying. If a manual batch
procedure has partially backfilled rows, leave the additive columns and completed
rows in place unless a human maintainer approves a rollback script. Partial
manual backfill is resumable; final `NOT NULL` and check constraints are the
point of no return for the release window.

Do not deploy code that depends on the new member-access storage until the
backfill is complete and final constraints/functions from this migration and the
following authorization-helper migration have been applied.

Do not leave production between `20260501000100_member_access_storage.sql` and
`20260502000100_remove_legacy_authorization_from_rls_helpers.sql` for a release
window. The second migration replaces the active RLS helper bodies with the final
member-access checks, so a failure there should stop the deploy until the helper
state is verified and corrected.

## Release Handoff

PRs that include or depend on this migration must include this handoff note:

> Remote migrations must be completed before merge/deploy. For production, do
> not blindly run `20260501000100_member_access_storage.sql` as a one-shot
> migration unless membership volume and traffic make the direct path acceptable;
> use the member-access storage backfill runbook and chunk the
> `organization_memberships` backfill when lock contention risk is non-trivial.

Maintainers should also note that agents did not run local or remote migrations
as part of this runbook-only issue.

## Related References

- `docs/architecture/adrs/0001-v1-authorization-replacement-model.md`
- `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
- `docs/architecture/LEGACY_AUTHORIZATION_INVENTORY.md`
- `supabase/migrations/20260501000100_member_access_storage.sql`
- `supabase/migrations/20260502000100_remove_legacy_authorization_from_rls_helpers.sql`
