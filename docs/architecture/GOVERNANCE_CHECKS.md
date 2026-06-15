# Governance Checks

This repo now has a lightweight governance check at `npm run governance:check`.

It is intentionally narrow. It does not prove the architecture is clean. It does help catch new undocumented drift in the highest-risk seams we already know about.

## What It Checks Today

- required governance files exist
- route-level Supabase usage under `src/routes/` stays inside an explicit allowlist, including
  direct `locals.supabase` access and Supabase clients destructured or aliased from `locals`
- route-level admin-provider wiring under `src/routes/` stays inside a separate allowlist, including
  `getAdminClient()` calls, `ctx.adminClient` usage, `const { adminClient } = ctx` destructuring, and
  service-role Supabase adapter creation
- configured feature families are scanned for cross-feature permission-lane couplings by default, and known
  exceptions stay explicitly documented
- allowlisted drift references still point at real entries in `docs/architecture/DRIFT_LEDGER.md`

## Baseline Classifications

Baseline entries use narrow classification labels so new exceptions can be reviewed against the route boundary
they actually represent:

- `auth-edge` means a route still performs provider-specific auth/session/invite work at the boundary.
- `billing-recovery-edge` means a billing reconciliation or checkout recovery route still wires privileged
  billing stores, subscription adapters, or audit writes directly from the route.
- `cron-edge` means a scheduled maintenance route still builds service-role cleanup stores, storage adapters,
  or privileged RPC calls directly from the route.
- `platform-admin-edge` means a Platform Admin route still uses the admin context client or service-role
  adapters for platform/org/user support operations at the route boundary.

## What It Does Not Claim

- it does not prove a route is architecturally good just because it is allowlisted
- it does not prove a privileged route/provider seam is clean just because it is recorded
- it does not prove the authz model is correct
- it does not replace code review, ADRs, or `grill-me`
- it does not yet cover every shallow module or every terminology problem

## Baseline File

The allowlist lives in `docs/architecture/GOVERNANCE_BASELINE.json`.

Treat that file as a temporary truth table for tolerated exceptions:

- if you remove a documented exception, remove or update the baseline entry in the same slice
- if you add a new exception on purpose, document why, update the drift ledger, and update the baseline in the same slice
- do not use the baseline to silently normalize accidental drift

For feature permission couplings, `featurePermissionCouplings` is an exception list, not the list of feature
families to scan. The checker scans configured feature families even when this array is empty; add entries only
for intentional, drift-ledger-backed cross-feature permission-lane couplings.

## Current-State Truth Versus Guardrail

- Current-state truth:
  - v1 still has route-level provider leaks, privileged route/provider seams, and feature-lane piggybacking
- Intended guardrail:
  - no new undocumented leaks, privileged route/provider seams, or piggybacking should land
- Deferred cleanup:
  - deeper enforcement should come after the first authz and provider-boundary remediation slices settle the target shape
