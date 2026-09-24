# Governance Checks

This repo now has a lightweight governance check at `npm run governance:check`.

It is intentionally narrow. It does not prove the architecture is clean. It helps catch new drift in the highest-risk seams we already know about. The [stabilization decisions](ARCHITECTURE.md#stabilization-decisions) require removal of existing exceptions through their owning tasks; passing this check alone does not establish a finished cutover.

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

Existing baseline entries use narrow classification labels to identify the route boundary they represent.
These labels are inventory, not permission to add exceptions:

- `auth-edge` means a route still performs provider-specific auth/session/invite work at the boundary.
- `cron-edge` means a scheduled maintenance route still builds service-role cleanup stores, storage adapters,
  or privileged RPC calls directly from the route.
- `platform-admin-edge` means a Platform Admin route still uses the admin context client or service-role
  adapters for platform/org/user support operations at the route boundary.

## What It Does Not Claim

- it does not prove a route is architecturally good just because it is allowlisted
- it does not prove a privileged route/provider seam is clean just because it is recorded
- it does not prove the authz model is correct
- it does not replace code review, ADRs or resolution of open product/design decisions
- it does not yet cover every shallow module or every terminology problem
- the canonical `governance:check` does not yet enforce the Phase 07 owner, portable/web/server or dependency graph contract; D02 finishes its integration in 07-02c

## Phase 07 D02 boundary work in progress

`node scripts/module-boundaries.ts` runs the standalone 07-02b check over the complete `src` import graph from `scripts/module-imports.ts`. Its [owner declaration](../../scripts/module-boundaries.json) assigns every current source file exactly one owner, declares the D01 dependency direction and current public paths, and records known mixed-owner files as findings. The checker reports private cross-owner imports, undeclared dependencies, source-file and owner cycles, plus missing or duplicate ownership. Every current finding is printed with an owning Phase 08 packet; the command exits nonzero while that work remains. The report is evidence of migration debt, not an exception list or a passing global gate.

This command is not yet part of `npm run governance:check`. Leaf 07-02c owns portable/web/server direction, SvelteKit server-only placement, and integration without reducing the existing route/provider/permission controls. See the [current D02 evidence](../stabilization/EVIDENCE.md#task-07-02b-ownership-and-public-dependency-rule) for the exact candidate and report counts.

## Baseline File

The allowlist lives in `docs/architecture/GOVERNANCE_BASELINE.json`.

Treat that file as a temporary truth table for tolerated exceptions:

- if you remove a documented exception, remove or update the baseline entry in the same slice
- do not add exceptions, allowlists or permission couplings to accommodate new drift
- record newly discovered debt as bounded work in [TODO](../stabilization/TODO.md), not as a passing-gate exemption
- preserve guards, assertions, scan paths and budgets; do not weaken checks, skip tests or hide consumers to obtain green results

For feature permission couplings, `featurePermissionCouplings` is an exception list, not the list of feature
families to scan. The checker scans configured feature families even when this array is empty. Remove resolved
entries and retain the scan; new drift-ledger entries do not authorize new permission couplings.

## Current-State Truth Versus Guardrail

- Current-state truth:
  - v1 still has documented route-level provider leaks and privileged route/provider seams. The six current feature lanes are distinct and `featurePermissionCouplings` is empty; the checker detects configured foreign-lane couplings in the Critical Tasks and Rating Scheme families only (`FEATURE_PERMISSION_FAMILIES` in `scripts/check-governance.mjs`). It does not scan every feature for permission borrowing or prove policy correctness. Personnel's rank-catalog Training-view read is an intentional cross-owner read documented in the [ownership ledger](CURRENT_OWNERSHIP.md#persisted-and-operational-ownership-07-01b), not evidence of complete scanner coverage.
  - cross-owner deep imports, central feature use cases and feature `server/*.ts` placement remain mapped migration work. The standalone 07-02b check reports ownership and dependency findings, but does not yet prove the full [chosen module and delivery contract](adrs/0013-v1-module-and-delivery-contract.md).
- Intended guardrail:
  - no new leaks, privileged route/provider exceptions or permission borrowing should land; D02 adds executable import/dependency checks without weakening these current guards
- Queued remediation:
  - finish provider and module cutovers through the stabilization queue, deleting replaced implementations and consumers in each owning task; documentation or a baseline entry cannot substitute for removal evidence
