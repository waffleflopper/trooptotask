# Roster Read Model

The Roster Read Model is the shared read seam for displaying and selecting Personnel Records across feature surfaces. It owns roster status filtering, Scope Set visibility, grouping, search, and display ordering. Personnel still owns roster write workflows such as create, edit, archive, import, and bulk archive.

The pure read model and its types are owned by Personnel and exposed through `src/features/personnel/contracts.ts`. The one Organization-local client backing is owned by Personnel and exposed through its Web entrypoint; other feature workspaces hydrate it through the controlled Personnel operation. Server query helpers still live at their older paths until the remaining D03 consumer cutover.

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

Server use cases should use `loadRosterPersonnel(...)`, `loadRosterReadModel(...)`, or `createRosterReadModelFromDbRows(...)` from `src/lib/server/core/useCases/rosterReadModel.ts` when they need roster-shaped Personnel rows.

These helpers centralize the Personnel entity select, active/archived/all filtering, and default roster ordering. They do not replace feature authorization. The caller still owns the feature policy check and still chooses whether the loaded model is read with `full(...)` or `scoped(...)`.

## Write Boundary

Do not route Personnel write behavior through the read model. Personnel-owned stores and use cases remain responsible for roster administration. Cross-feature surfaces should use the read model for names, groups, search, filtering, and ordering, then call their own feature-specific write paths for feature data.
