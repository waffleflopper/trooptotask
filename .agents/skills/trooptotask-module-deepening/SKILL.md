---
name: trooptotask-module-deepening
description: Deepens orchestration-heavy TroopToTask modules into clearer repo-specific boundaries with thinner interfaces. Use when refactoring dashboard, calendar, duty roster, personnel, training, or similar v1 surfaces after authz and provider-boundary intent is clear enough to proceed.
---

# TroopToTask Module Deepening

Use this repo-specific wrapper around `improve-codebase-architecture` for v1 deep-module slices.

## Workflow

1. Start from the issue seam, not from a whole-app refactor ambition.
2. Identify where understanding one behavior requires bouncing across too many route, context, store, and component files.
3. Find the deeper module hiding in that sprawl.
4. Prefer fewer entry points with clearer ownership.
5. Preserve user-visible behavior while reducing orchestration spread.
6. Replace shallow helper churn with stronger boundaries where practical.
7. Update:
   - `docs/architecture/MODULE_CONVENTIONS.md`
   - `docs/architecture/DRIFT_LEDGER.md`
   - `docs/architecture/ARCHITECTURE.md` if a reusable pattern changes

## Pairing

- Use `improve-codebase-architecture` to explore candidates and boundary options.
- Use `tdd` when the slice carries meaningful behavior risk.
- Use `retrofit-slice-audit` before close-out.

## Stop conditions

Stop and split work if:

- the slice turns into product redesign
- unresolved authz or provider-boundary questions dominate the seam
- the refactor starts spreading across unrelated features for convenience
