# Feature And Module Conventions

This document describes the conventions that fit the current v1 repo. It is intentionally specific to this codebase.

## Current-State Shape

- Route shells live under `src/routes/**`.
- Product feature modules live under `src/features/*`.
- Shared UI lives under `src/lib/components/**` and `src/lib/components/ui/**`.
- Server entities, ports, use cases, and adapters live under `src/lib/server/**`.

The codebase already trends toward:

- thin route shells
- feature-owned page views, contexts, stores, and utilities
- shared UI primitives instead of one-off shared markup
- use-case-based server logic

That trend is real, but not finished. Contributors should strengthen it instead of branching away from it.

For stabilization, apply the [program decisions](ARCHITECTURE.md#stabilization-decisions): each declared module or UI migration includes all affected consumers and deletion of replaced implementations, old-path wrappers, aliases and configuration. A migrated example component or a compatibility facade does not complete a cutover.

## Frontend Conventions

### Route shells

- Prefer route files that mainly:
  - gather route data
  - wire feature contexts
  - render feature page views
  - coordinate streaming or hydration concerns
- Avoid turning route files into the long-term home for feature orchestration or business rules.

### Feature modules

Within `src/features/*`, prefer this shape when it fits:

- `components/` for feature UI
- `contexts/` for page-level orchestration
- `stores/` for feature state containers
- `utils/` for focused calculations or transformations
- feature types near the feature root

Keep feature-specific logic inside the feature module unless it is truly shared across multiple features.

### Shared UI

- Use shared UI primitives before building new one-off controls.
- Keep generic shared UI in `$lib/components/ui/*`.
- Keep layout or shell primitives in `$lib/components/*`.
- Keep public marketing primitives in `$lib/components/public/*`.
- Follow `docs/component-catalog.md` for shared UI usage and styling expectations.
- The current UI foundation is shadcn-svelte, Tailwind v4, and TroopToTask compound components. Shared components own appearance; route-level changes are behavioral only.
- Visual changes happen in tokens, generated/shared component source, or documented shared component variants. Component fit problems should be reported as design-system gaps instead of patched locally.
- When production routes are explicitly migrated or revised, replace obsolete route CSS with Tailwind utility composition that matches the shared baseline instead of preserving route-specific legacy visuals.

### Contexts and stores

- Page contexts are valid in v1, but they should not silently become god objects.
- If a context starts to own too many unrelated concerns, that is a signal to deepen module boundaries rather than keep stuffing logic into it.
- Prefer pushing stable calculations and business rules into smaller modules with thinner public interfaces.
- The `Roster Read Model` is shared infrastructure under `$lib/stores` and `$lib/server/core/useCases/rosterReadModel.ts`, because Calendar, Training, Dashboard, Onboarding, Rating Scheme, settings archives, and shell hydration read the same organization roster. Remove the existing Duty Roster consumer with that feature; preserve retained readers. Personnel-owned write workflows still belong under `$features/personnel`. See `docs/architecture/ROSTER_READ_MODEL.md` for the explicit `full`/`scoped` and `active`/`archived`/`all` usage contract.

### Client read models

For orchestration-heavy frontend pages, prefer a feature-owned client read model when a context or tab component starts combining many hydrated stores, route payloads, grouping preferences, formatting rules, and display-row calculations.

A client read model should:

- live inside the owning feature module
- consume already-authorized route data and hydrated stores
- expose pre-shaped view data for the page or tab components
- keep browser persistence behind tiny local adapters when needed
- preserve route, provider, and authorization boundaries

This pattern is appropriate for dashboard-style surfaces where components should mostly render stable rows, counts, sections, and labels instead of re-deriving business-facing screen state. It is not a reason to move provider access or route permissions into frontend modules.

`CalendarRangeCoordinator` owns calendar range expansion, request de-duping, range-store merging and retry state. Its advanced duty event merging is scheduled for removal with all Duty Roster consumers in phase 05 of [TODO](../stabilization/TODO.md); preserve the ordinary Calendar behavior and persisted facts in R6.

`DutyRosterRun`, `dutyRosterBrowserExport` and the read-only `dutyEventCrud.ts` hydration shim are obsolete removal targets, not module patterns to extend or feed into a replacement Duty Roster surface. Their owning tasks must delete the implementations and consumers. Historical duty rows do not justify continued runtime hydration; resolve schema/data disposition separately under the DB contract.

## Server Conventions

### Default path

For new server work, prefer:

1. entities for schema mapping and validation
2. use cases for business logic
3. ports for abstract dependencies
4. adapters for provider-specific behavior
5. route wrappers for request/load glue

### Route handlers and loads

- Prefer `handle()`, `entityHandlers()`, and `loadWithContext()` / streaming workspace loaders when they fit.
- Avoid ad hoc request parsing, permission checking, and persistence logic inside route files when an existing wrapper or use-case path already exists.

### Provider access

- Treat route-level direct provider usage as tolerated legacy, not the default pattern.
- Auth-specific provider calls remain acceptable where they are genuinely auth-provider-specific.
- Outside auth, new business logic should prefer use cases and adapters.

## Deepening Guidance

The v1 repo has several large orchestration-heavy modules. Those are not failures to hide; they are candidates for deliberate module-deepening work.

Use explicit architecture-review work when a slice is intended to:

- shrink a broad interface
- hide coordination complexity behind a smaller public API
- reduce file-jumping to understand one concept
- replace shallow helper sprawl with a deeper module boundary

Use the `improve-codebase-architecture` workflow for that kind of change instead of treating it as incidental cleanup.

## Current Hotspots

The following areas are especially likely to benefit from deepening rather than surface-level cleanup:

- calendar contexts, range loading, and page orchestration
- dashboard bootstrapping and context orchestration
- personnel page orchestration and bulk flows
- training reports and applicability flows
- organization settings and membership-management flows

## Conventions For Drift

- If current code and desired architecture disagree, record the disagreement and bounded remediation in the stabilization queue.
- Do not normalize a contradiction into precedent just because it already exists.
- Complete every seam required by the authorized cutover. Record unrelated discoveries for their owning tasks; do not use drift documentation to close an unfinished migration.
