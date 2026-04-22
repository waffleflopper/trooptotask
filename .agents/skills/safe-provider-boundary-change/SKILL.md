---
name: safe-provider-boundary-change
description: Extracts route-local provider logic into app-owned use cases and adapters without casual behavior drift. Use when remediating `locals.supabase` leaks, thinning route shells, or working provider-boundary issues in dashboard, settings, org bootstrap, billing, export, or similar v1 seams.
---

# Safe Provider Boundary Change

Use this for v1 slices that move business logic away from direct `locals.supabase` route orchestration.

## Workflow

1. Read the issue and `docs/architecture/GOVERNANCE_BASELINE.json`.
2. Inspect the current route seam and list every direct provider call.
3. Separate:
   - auth-provider edge work that is allowed to stay provider-specific
   - business logic that should move behind app-owned boundaries
4. Preserve current semantics first.
5. Add or tighten focused tests before large extraction when practical.
6. Extract toward use cases, ports, and adapters.
7. Make the route thinner, not smarter.
8. Update:
   - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
   - `docs/architecture/DRIFT_LEDGER.md`
   - `docs/architecture/GOVERNANCE_BASELINE.json`
9. Run full repo verification.

## Rules

- Do not casually redefine authz, role, or scope semantics while moving provider code.
- Do not merge unrelated leak clusters into one opaque refactor.
- If the route leak shrinks or disappears, remove or narrow the baseline entry in the same slice.
- If you discover a new tolerated leak, document it explicitly instead of silently normalizing it.

## Stop conditions

Stop and split follow-up work if:

- the slice starts changing product behavior instead of preserving it
- the work requires unresolved authz design decisions
- multiple routes or seams are being bundled together only for convenience
