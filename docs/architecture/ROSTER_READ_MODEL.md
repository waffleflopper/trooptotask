# Roster Read Model

The Roster Read Model is the shared read seam for displaying and selecting Personnel Records across feature surfaces. It owns roster status filtering, Scope Set visibility, grouping, search, and display ordering. Personnel still owns roster write workflows such as create, edit, archive, import, and bulk archive.

The pure read model and its types are owned by Personnel and exposed through `src/features/personnel/contracts.ts`. The one Organization-local client backing is owned by Personnel and exposed through its Web entrypoint; other feature workspaces hydrate it through the controlled Personnel operation. Personnel also owns the server roster query through `src/features/personnel/index.server.ts`.

## Client Usage

Use `rosterStore.readModel(...)` from `src/features/personnel/index.ts` when the org shell has hydrated the current roster. It is a read-only view; workspace hydrators use `personnelRosterHydration` from that Web entrypoint to apply authorized page data. Use `createRosterReadModel(...)` only when a component or test has an explicit fallback roster payload.

Callers must make scope visible:

- `full(...)` means this surface intentionally reads every loaded Personnel Record.
- `scoped(scopeSet, ...)` means this surface limits the roster to the current member's Scope Set.

Callers must make roster status visible when status matters:

- `status: 'active'` for operational rosters, calendars, training matrices, onboarding candidate lists, and reports.
- `status: 'archived'` for archive management and historical-only archive lists.
- `status: 'all'` only for historical lookups or validation flows that must resolve both active and archived Personnel Records.

## Server Usage

Server use cases that need the request-visible Personnel roster use `loadRosterPersonnel(...)` from `src/features/personnel/index.server.ts`. It accepts active, archived or all status and the archived-newest order used by settings. The caller supplies its request store and owns its feature policy check; Personnel RLS still limits visible rows. Personnel's workspace explicitly loads a scoped roster and a lookup from its second user-authenticated store, then keeps the lookup scoped for Group actors. Dashboard and settings use their request stores. Calendar, Onboarding, Training and Critical Tasks use their separate Personnel-owned lane-authorized ports.

The server query centralizes the Personnel entity select, status filter and default name order. After loading rows, callers can build the portable read model and choose `full(...)` or `scoped(...)` explicitly.

## Write Boundary

Do not route Personnel write behavior through the read model. Personnel-owned stores and use cases remain responsible for roster administration. Cross-feature surfaces should use the read model for names, groups, search, filtering, and ordering, then call their own feature-specific write paths for feature data.
