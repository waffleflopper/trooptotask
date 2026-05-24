# Billing Snapshot Backfill Runbook

This runbook is for reconciling existing organizations that still have legacy Stripe billing mirror fields but are missing or drifting from `organization_billing_snapshots`.

Do not run execute mode against production without Robert's approval and a saved dry-run report.

## What The Backfill Does

The backfill uses the existing billing reconciliation endpoint. It:

- lists organizations with paid tiers, Stripe customer or subscription IDs, billing statuses, or drifted Stripe snapshots
- reads the current Stripe subscription by subscription ID or customer ID
- compares Stripe state to `organization_billing_snapshots`
- seeds a `source = legacy_organization` review snapshot when Stripe has no current subscription but validated legacy billing fields exist
- reports missing or drifting snapshot fields
- in execute mode, updates the billing snapshot, the legacy organization billing mirror, and the per-process tier cache

The command defaults to dry-run mode. Dry-run mode does not write billing snapshots or organization billing mirrors. The endpoint still writes an audit row so the operator report is durable.

## Required Inputs

Use a production app URL and one approved reconciliation secret:

```sh
PUBLIC_APP_URL=https://app.trooptotask.com
BILLING_RECONCILIATION_SECRET=...
```

The running app environment must already have Stripe and Supabase service-role configuration. Do not put secrets in shell history for shared terminals.

## Dry Run

Run a small dry run first:

```sh
npm run billing:snapshot-backfill -- --app-url "$PUBLIC_APP_URL" --limit 10 --json
```

For a full dry-run report, page until `nextCursor` is `null`:

```sh
npm run billing:snapshot-backfill -- --app-url "$PUBLIC_APP_URL" --limit 100 --cursor "$NEXT_CURSOR" --json
```

Save the JSON output. Review:

- `failed` must be `0` before execute mode
- `drifted` is the count of organizations that would be repaired
- each result's `diagnostics` lists fields that differ from Stripe
- each result's `plannedWrites` shows the tables or cache entries execute mode would touch
- `legacy_organization_snapshot_seed` means the row was seeded from legacy fields for follow-up review; it is not treated as a Stripe source of truth

## Execute

Execute mode requires both `--execute` and `--confirm-production-backfill`:

```sh
npm run billing:snapshot-backfill -- \
  --app-url "$PUBLIC_APP_URL" \
  --limit 25 \
  --execute \
  --confirm-production-backfill \
  --json
```

Keep batches small. Page with `--cursor` until `nextCursor` is `null`.

The endpoint writes an `audit_logs` row with action `billing.reconciliation.batch` for every authorized batch, including dry runs.

## Verification

After each execute batch:

1. Rerun the same page in dry-run mode.
2. Confirm the repaired organizations now return `status: "matched"` or have only understood failures.
3. Spot-check Admin -> Organizations -> Billing snapshot for at least one repaired Team org and one repaired Unit org when present.
4. Run the billing launch preflight:

```sh
npm run billing:launch-preflight -- --json
```

## Rollback Or Remediation

There is no blanket rollback command. If a mismatch is found:

- stop execute batches
- keep the dry-run and execute JSON reports
- use Stripe as the source of truth for customer, subscription, price, period, cancellation, and status fields
- repair a single organization through the admin billing reconciliation action or a reviewed service-role SQL update
- rerun dry-run mode for that organization's page before continuing

Do not reset the database. Do not delete local or remote database tables or billing rows.
