# Troop to Task System Additions

## Implementation Heuristics

Before editing, inspect code in this order when relevant:

1. the route shell under `src/routes/**`
2. the matching feature module under `src/features/*`
3. shared UI under `src/lib/components/**` and `src/lib/components/ui/**`
4. server use cases, adapters, permissions, and entities under `src/lib/server/**`
5. nearby tests covering the same behavior

Do not introduce a new pattern until you have checked for an existing one in the same feature area.

## Route and Feature Boundaries

Prefer keeping `src/routes/**` files thin.
If a route already delegates to a feature module, continue that pattern.
Put reusable product behavior in `src/features/*` or `src/lib/server/core/useCases/*` instead of expanding route-local logic.

## Reuse Before Abstraction

Before creating a new component, store, utility, or server abstraction:

- check for an existing pattern in the same feature area
- check for a shared primitive under `$lib/components/*` or `$lib/components/ui/*`
- prefer established local patterns over inventing a new abstraction

Create a new abstraction only when duplication is clearly recurring or the new shape materially improves correctness, testability, maintainability, or performance.

## UI and UX Guidance

When work touches UI, UX, layout, styling, interaction, or visual polish:

- read `docs/component-catalog.md`
- read `src/app.css`
- read `.impeccable.md`
- prefer the existing Troop to Task design system and product character over generic SaaS aesthetics
- prefer shared components and canonical tokens before introducing custom UI

When the task is strongly design-oriented, polishing-oriented, or asks for better UX instructions, prefer using the repo's UI/design skills when appropriate, especially `ui-consistency-pass` and the available impeccable design skills.

Do not introduce visual language that conflicts with the product's established direction in `.impeccable.md`.

## Server Change Checklist

When changing server behavior, inspect the relevant:

- entity definition
- adapter or persistence implementation
- use case and permission logic
- nearby tests

Do not change persistence behavior in isolation if permissions, serialization, organization scoping, or auth context may also be affected.

## Testing Expectations

When behavior changes:

- add or update the closest sensible test when practical
- prefer regression coverage for bug fixes
- prefer use-case, entity, and adapter tests for server logic
- prefer component, context, and store tests for UI state behavior
- do not skip tests silently when behavior changed

If no test is added, explain why.

## Deprecated Demo and Sandbox Code

Demo and sandbox code is deprecated and being phased out.
When touching demo/sandbox-specific code:

- avoid expanding its scope
- avoid using it as the model for new implementation
- prefer leaving a removal-oriented note or TODO when relevant

## Migration and Remote Follow-up Rule

If code changes require a database migration or remote environment action:

- do not run it from pi
- explicitly state the required manual step in the final response
- mention that the remote migration or remote application must happen before merge or deploy when applicable

## Performance-Sensitive Areas

Be especially careful with render cost, derived state churn, and large-list behavior in:

- calendar views
- training matrix and reporting views
- duty roster generation flows
- dense tables and grouped lists

Prefer incremental, localized updates over broad reactive recalculation.

## Final Response Contract

When completing implementation work, summarize:

- files changed
- tests added or updated
- verification commands run and results
- remaining risks or follow-ups
- any manual migration, deployment, or remote-environment steps that pi did not run
