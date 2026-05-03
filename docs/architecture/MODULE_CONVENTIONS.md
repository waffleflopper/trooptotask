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

### Contexts and stores

- Page contexts are valid in v1, but they should not silently become god objects.
- If a context starts to own too many unrelated concerns, that is a signal to deepen module boundaries rather than keep stuffing logic into it.
- Prefer pushing stable calculations and business rules into smaller modules with thinner public interfaces.

### Client read models

For orchestration-heavy frontend pages, prefer a feature-owned client read model when a context or tab component starts combining many hydrated stores, route payloads, grouping preferences, formatting rules, and display-row calculations.

A client read model should:

- live inside the owning feature module
- consume already-authorized route data and hydrated stores
- expose pre-shaped view data for the page or tab components
- keep browser persistence behind tiny local adapters when needed
- preserve route, provider, and authorization boundaries

This pattern is appropriate for dashboard-style surfaces where components should mostly render stable rows, counts, sections, and labels instead of re-deriving business-facing screen state. It is not a reason to move provider access or route permissions into frontend modules.

Calendar and duty-roster have several current examples of this direction:

- `CalendarRangeCoordinator` owns client-side calendar range expansion, request de-duping, range-store merging, retry state, and advanced duty event merging for the calendar page.
- `advancedDutyCollections` owns duty-roster template normalization and applied-duty timeline update rules so the page component does not repeat collection ordering and replacement rules inside every handler.
- `DutyRosterRun` owns simple-duty run snapshots, DA6 selection and numbering semantics, snapshot-derived apply/history payloads, and the formatting-neutral export model. `DutyRosterGenerator.svelte` should stay mostly form state, rendering, callbacks, and feedback orchestration.
- `dutyRosterBrowserExport` is a temporary browser download adapter for the current Excel-compatible HTML export. It may format and download an existing run export model or saved history record, but it must not rebuild selection, DA6 numbering, apply payloads, or history payloads.
- The `Advanced Duty Run Module` lives in `src/features/duty-roster/advanced-run/`.
  - It owns advanced team-duty generation decisions, draft Advanced Run Snapshots, availability/blocking classifications, slot proposals, snapshot-derived apply payloads, and the Team Duty Packet Export Model.
  - It is also the target home for post-apply revision semantics: one active Advanced Duty Revision Draft per applied Advanced Duty Run, compact Advanced Duty Revision Change Sets on reapply, hard/reviewable conflict classification, and revision-history display models.
  - `dutyEventCrud.ts` should load authorized data, enforce apply/reapply contracts, load current safety facts, persist records through use-case/adapters, and call this module instead of rebuilding generation or revision rules inline.
  - The snapshot custody contract is recorded in `docs/architecture/adrs/0007-advanced-duty-snapshot-custody.md`; the revision deepening contract is recorded in `docs/plans/2026-05-02-advanced-duty-run-revision-deepening-rfc.md`.
- Advanced duty route files and Svelte components should stay in request glue, wizard state, rendering, manual override controls, and feedback orchestration. They may carry `snapshotId` plus `snapshotFingerprint`, but they must not decide slot selection, transient series fairness, collision semantics, status-treatment behavior, or export-model content.
- `buildDutyPacketMarkup` and similar browser adapters are temporary formatting adapters for an existing Team Duty Packet Export Model. They may format, label, and download preview or applied packet output, but they must not rebuild advanced generation, explanations, warnings, conflicts, or assignment-source decisions.

These are feature-owned client orchestration boundaries. They should not grow into provider access, permission evaluation, or new duty-roster product behavior.

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
- duty roster generation and template/event flows, even though advanced-duty collection rules now have a feature-owned helper boundary
- personnel page orchestration and bulk flows
- training reports and applicability flows
- organization settings and membership-management flows

## Conventions For Drift

- If current code and desired architecture disagree, document the disagreement.
- Do not normalize a contradiction into precedent just because it already exists.
- If a slice is not explicitly authorized to remediate a seam, leave the seam narrower or better documented than before, not broader.
