# Governance Checks

This repo now has a lightweight governance check at `npm run governance:check`.

It is intentionally narrow. It does not prove the architecture is clean. It does help catch new undocumented drift in the highest-risk seams we already know about.

## What It Checks Today

- required governance files exist
- route-level Supabase usage under `src/routes/` stays inside an explicit allowlist, including
  direct `locals.supabase` access and Supabase clients destructured or aliased from `locals`
- known cross-feature permission-lane couplings stay explicitly documented
- allowlisted drift references still point at real entries in `docs/architecture/DRIFT_LEDGER.md`

## What It Does Not Claim

- it does not prove a route is architecturally good just because it is allowlisted
- it does not prove the authz model is correct
- it does not replace code review, ADRs, or `grill-me`
- it does not yet cover every shallow module or every terminology problem

## Baseline File

The allowlist lives in `docs/architecture/GOVERNANCE_BASELINE.json`.

Treat that file as a temporary truth table for tolerated exceptions:

- if you remove a documented exception, remove or update the baseline entry in the same slice
- if you add a new exception on purpose, document why, update the drift ledger, and update the baseline in the same slice
- do not use the baseline to silently normalize accidental drift

## Current-State Truth Versus Guardrail

- Current-state truth:
  - v1 still has route-level provider leaks and feature-lane piggybacking
- Intended guardrail:
  - no new undocumented leaks or piggybacking should land
- Deferred cleanup:
  - deeper enforcement should come after the first authz and provider-boundary remediation slices settle the target shape
