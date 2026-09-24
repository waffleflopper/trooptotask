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

## Chosen module and delivery contract (07-01d)

This is the target for the existing SvelteKit application, not a description of an already enforced import graph. The [ownership ledger](CURRENT_OWNERSHIP.md) assigns today's capabilities and data even where their code still lives in routes or central server files. [ADR 0013](adrs/0013-v1-module-and-delivery-contract.md) records why the existing `src/features/<owner>` roots remain the module roots. Create or move files only with a consuming cutover; do not create empty entrypoints or directories.

| Surface  | Target seam and allowed dependencies                                                                                                                                                                                                                                                                                                                                                         | Current reason to exist                                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portable | Owner-held `contracts.ts` or a similarly narrow explicit export under `src/features/<owner>/`. Plain data shapes, validation and pure rules may depend on domain-neutral leaves and declared portable exports of another owner. No Svelte/runes, `$app`, DOM/storage, provider SDK, raw database rows, Node-only code or credentials.                                                        | Personnel's leader-note shape is used by page data, JSON routes and Svelte views today. D03 must put its one authoritative representation under Personnel and make these actual consumers import it. Do not manufacture a contract for a future client. |
| Web      | Owner-held browser-safe `index.ts` and feature UI/state exports. They may use their own portable contracts, neutral UI primitives and declared public exports of another owner, but never a privileged module. A web barrel may export Svelte code and is **not** a portable entrypoint.                                                                                                     | Existing Personnel detail and notes views and their draft/fetch logic are web consumers. Other feature UI must not reach foreign mutable stores or private files.                                                                                       |
| Server   | Owner-held `index.server.ts` (and other `*.server.ts` files where needed) exposes authorized operations to server routes and declared server collaborators. Implementation may use owner-held typed ports and provider adapters, shared trusted-access infrastructure and owned SQL; it does not export a raw provider client, universal request context or arbitrary table/query interface. | Current leader-note operations are in `src/lib/server/core/useCases/personnelLeaderNotes.ts`; the page loads and JSON handlers call them directly. D03 moves this seam and D03/07-04 cuts over every current caller before deleting the replaced path.  |

`src/routes/**` owns SvelteKit page, form and JSON transport composition; `src/hooks.server.ts` owns request admission. Server loads and `+server.ts` handlers establish the trusted actor and requested Organization/resource access, then invoke the same owner operation directly. Server-rendered routes do not call their own JSON endpoints over HTTP. Browser code uses authorized page data or the existing JSON routes for interactions. Routes may import an owner's public web, portable or server seam appropriate to their execution context, but cannot treat a deep private feature file as public merely because it is reachable. Shared UI/utilities and provider infrastructure are leaves or lower-level collaborators; they do not import product modules. Cross-owner dependencies must be declared, point only to the other owner's public seam and form an acyclic graph. The source owner retains policy and mapping; a dashboard or report may compose its reads without taking over its tables or mutable stores.

SvelteKit recognizes `.server.ts` and `$lib/server` as server-only, including transitive imports; an arbitrary `server/` or `infrastructure/` directory under `src/features` does **not** provide that protection. Current feature `server/*.ts` files therefore remain a known placement gap until their owning cutovers. The D02 governance rule and production build must check the route/client/portable import paths as well as owner dependencies; Vitest alone does not prove this restriction. See the [SvelteKit server-only module contract](https://svelte.dev/docs/kit/server-only-modules).

Use one machine-readable declaration at `scripts/module-boundaries.json` for D02's module roots, permitted public dependencies and object ownership instead of one manifest per partly migrated module. The ledger remains the human-readable inventory and must agree with that declaration. D02 creates the declaration and checker together; its absence today is unfinished enforcement, not an exception or a passing gate. Do not change the current alias or create speculative packages to achieve this layout.

### Current JSON and page contract to preserve in the Personnel pilot

The existing `leader-notes` GET returns an array of `PersonnelLeaderNote`; POST and PATCH return one note; DELETE returns `{ success: true }`. The same note is present in Personnel detail/notes page data and the archived-artifact union. Its `id` and `personnelId` are the current stored identifiers as strings; `date` is a `YYYY-MM-DD` date-only string derived from `createdAt`, `createdAt` and non-null `archivedAt` are timestamp strings, and `archivedAt: null` means active. `author` is the current display label, not a newly exposed provider subject. Preserve these names and null meanings, the existing archive/restore actions and input text limit of 4,000 characters. Current public error meanings include 400 for invalid input/action, 401 for missing admission, 403 for denied permission, 404 for an absent scoped record, 409 for invalid archive/delete state, and a sanitized 500 for unexpected failure. A missing field must not silently become a different public meaning. The feature's portable shape describes these JSON values directly; it must not rely on SvelteKit page serialization or raw SQL row types.

Current note lists have no explicit application bound except for the detail card's single-note read. D03 must use stable pages of at most 100 notes per persistence read, ordered by `created_at` and `id` so equal timestamps cannot lose records. The page and archived-artifact consumers must still reach every note. The existing JSON GET without paging must continue to return the complete array; an opt-in cursor on that same route may return one bounded array with continuation. This preserves the current supported response meaning while bounding each database read and label lookup. A large legacy JSON response remains a known cost until a separately authorized contract change. The exact cursor parameter and continuation header belong to D03 implementation and consumer tests. D03 must verify full traversal and existing response/error behavior before the old path is removed. Binary document upload/download remains its existing transport, outside this note contract.

Colocate behavior tests with the owner operation and web interaction they exercise. Keep route admission/HTTP mapping tests with routes and SQL/RLS contracts under `supabase/tests`; D02's import-rule fixtures belong beside its checker. Test each rule at its cheapest stable interface, with real admission and SQL proof separate from synthetic actor tests. Do not duplicate source definitions as test expectations or use documentation checks as implementation proof.

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
- Visual changes happen in tokens, generated/shared component source, or documented shared component variants. Resolve component fit gaps within authorized UI work through shared APIs and affected consumers, following the [UI contract](../agents/ui-system.md).
- When production routes are explicitly migrated or revised, replace obsolete route CSS with Tailwind utility composition that matches the shared baseline instead of preserving route-specific legacy visuals.

### Contexts and stores

- Page contexts are valid in v1, but they should not silently become god objects.
- If a context starts to own too many unrelated concerns, that is a signal to deepen module boundaries rather than keep stuffing logic into it.
- Prefer pushing stable calculations and business rules into smaller modules with thinner public interfaces.
- The `Roster Read Model` currently sits under `$lib/stores` and `$lib/server/core/useCases/rosterReadModel.ts` because Calendar, Training, Dashboard, Onboarding, Rating Scheme, settings archives and shell hydration read the same Organization roster. The [ownership ledger](CURRENT_OWNERSHIP.md) assigns this retained read contract to Personnel; shared placement does not make its policy ownerless. Its current `full`/`scoped` and `active`/`archived`/`all` meanings remain in [Roster Read Model](ROSTER_READ_MODEL.md) until the owning consumer cutover.

### Client read models

For orchestration-heavy frontend pages, prefer a feature-owned client read model when a context or tab component starts combining many hydrated stores, route payloads, grouping preferences, formatting rules, and display-row calculations.

A client read model should:

- live inside the owning feature module
- consume already-authorized route data and hydrated stores
- expose pre-shaped view data for the page or tab components
- keep browser persistence behind tiny local adapters when needed
- preserve route, provider, and authorization boundaries

This pattern is appropriate for dashboard-style surfaces where components should mostly render stable rows, counts, sections, and labels instead of re-deriving business-facing screen state. It is not a reason to move provider access or route permissions into frontend modules.

`CalendarRangeCoordinator` owns calendar range expansion, request de-duping, range-store merging and retry state. Its former computed duty event merging is removed; ordinary Calendar behavior and persisted facts in R6 remain.

Phase 05 D01 removed Duty Roster generation, accepted-run commands and feature exports. D02 removed Calendar event hydration, computed overlays and manual conflict/provenance handling, including the reader/entities and last shared duty snapshot/blocking types. D03 removed remaining application metadata and integration consumers. Calendar assignment responses expose retained facts and metadata without duty provenance; existing stored provenance remains untouched until phase 06. Historical duty rows do not justify runtime hydration; phase 06 owns schema/data disposition under the DB contract.

## Server Conventions

### Default path

Current server code commonly follows this sequence, with central placement still to be cut over where it belongs to a feature:

1. entities for schema mapping and validation
2. use cases for business logic
3. ports for abstract dependencies
4. adapters for provider-specific behavior
5. route wrappers for request/load glue

For new or migrated feature work, put the owner operation behind its server-only seam above. Reuse retained entity mapping, typed ports, provider adapters and route wrappers without adding a second central public path.

### Route handlers and loads

- Prefer `handle()`, `entityHandlers()`, and `loadWithContext()` / streaming workspace loaders when they fit.
- Avoid ad hoc request parsing, permission checking, and persistence logic inside route files when an existing wrapper or use-case path already exists.

### Provider access

- Treat route-level direct provider usage as tolerated legacy, not the default pattern.
- Auth-specific provider calls remain acceptable where they are genuinely auth-provider-specific.
- Outside auth, new business logic should prefer use cases and adapters.

## Performance

Keep common workflows responsive as an Organization's data grows. Inspect the actual loading path before optimizing: avoid serial waits for independent requests, repeated queries per row, unnecessary payloads and repeated full-list calculations. A linear pass over a bounded collection can be the simplest efficient implementation.

Use optimistic updates when failure can be rolled back clearly and the operation's consequences allow it. Keep server authorization authoritative. Consider prefetching on hover or focus when it reduces likely navigation waits without excessive requests or crossing access boundaries. Keep optional data from blocking useful content and provide clear pending, success and failure feedback.

Reuse the existing data and state mechanisms. Add caching, background work or another abstraction only for an observed need, with explicit invalidation and failure behavior. For performance claims or dedicated optimization work, follow the [performance evidence contract](DEFINITION_OF_DONE.md#reproducible-performance-evidence).

## Deepening Guidance

The v1 repo has several large orchestration-heavy modules. Those are not failures to hide; they are candidates for deliberate module-deepening work.

Use explicit architecture-review work when a slice is intended to:

- shrink a broad interface
- hide coordination complexity behind a smaller public API
- reduce file-jumping to understand one concept
- replace shallow helper sprawl with a deeper module boundary

Keep deepening work within the requested boundary and finish its consumer cutover. Use an available module-design skill when useful; ordinary fixes do not require a separate architecture workflow.

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
