# Governance Checks

This repo now has a lightweight governance check at `npm run governance:check`.

It is intentionally narrow. It does not prove the architecture is clean. It does help catch new undocumented drift in the highest-risk seams we already know about.

## What It Checks Today

- required governance files exist
- route-level `locals.supabase` usage under `src/routes/` stays inside an explicit allowlist
- known cross-feature permission-lane couplings stay explicitly documented
- the remaining high-risk demo/sandbox exception files stay inside an explicit allowlist
- legacy authorization entry points stay inside an explicit inventory-backed allowlist
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
  - v1 still has route-level provider leaks, feature-lane piggybacking, demo/sandbox exception paths, and legacy authorization compatibility paths
- Intended guardrail:
  - no new undocumented leaks, piggybacking, demo/sandbox exception paths, or legacy authorization entry points should land
- Deferred cleanup:
  - deeper enforcement should come after the first authz and provider-boundary remediation slices settle the target shape

## Legacy Authorization Guardrail

The legacy authorization removal program is tracked by parent issue `#750`, with the first inventory and guardrail slice in `#756`.

The inventory lives in `docs/architecture/LEGACY_AUTHORIZATION_INVENTORY.md`. The allowlist lives in `legacyAuthorizationAllowlist` inside `docs/architecture/GOVERNANCE_BASELINE.json`.

The guardrail scans production `src` files and Supabase SQL files for legacy authorization entry points. The shared runtime APIs for `requireEdit(...)`, `requireFullEditor`, and `isFullEditor` are no longer allowlisted, so any production reintroduction fails governance unless a future issue explicitly documents a new historical or compatibility classification.

- `isFullEditor`
- `requireFullEditor`
- `requireEdit(...)`
- client `canEdit*` affordance gates
- `can_view_*` and `can_edit_*` database or adapter fields
- `scopedGroupId` and `scoped_group_id`

Tests and docs are not treated as production runtime usage. They still belong in the inventory as test coverage, fixture, or historical documentation references when they explain current-state compatibility.
