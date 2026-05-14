# Step 2: Build Shared Shell Primitives

## Purpose

Create the shared page and workspace primitives that the duty-roster reskin needs before production route work starts. This step turns repeated mockup structure into reusable shared components rather than route-local layout.

## Inputs

- Step 1 component catalog findings
- `docs/plans/2026-05-06-shadcn-svelte-tailwind-v4-ui-migration-rfc.md`
- `docs/plans/2026-05-06-shadcn-svelte-tailwind-v4-component-inventory.md`
- `docs/component-catalog.md`
- Existing shared UI primitives under `src/lib/components/ui/**`

## Scope

Add or extend shared components for these patterns:

### `PageShell`

Owns consistent authenticated page padding, max width where appropriate, page body density, loading/empty/permission state placement, and route body overflow behavior.

### `PageHeader`

Supports:

- Back button slot.
- Title.
- Subtitle.
- Meta row, such as slug and status.
- Primary and secondary actions.
- Optional overflow menu.
- Compact mobile layout.

### `RouteTabs`

Shared route-level navigation for Generate, History, and Settings style views.

Supports:

- URL-backed tab items.
- Active route state.
- Optional count/status badges.
- Mobile overflow or wrapping behavior.
- No resurrection of legacy `SubNav`.

### `FactGrid`

Shared label/value display for dense operational facts.

Supports:

- One-column, two-column, and rail layouts.
- Optional icons.
- Optional status badges.
- Compact metadata typography.
- Long values that wrap safely.

### `SummaryRail`

Right-side rail pattern for selected template summaries, generate summaries, print options, metadata, warnings, and destructive secondary actions.

Supports:

- Section title.
- Section dividers.
- Fact rows.
- Action groups.
- Alert blocks.
- Responsive conversion to stacked content or `Sheet` where appropriate.

### `StickyActionBar`

Shared bottom action bar for unsaved changes and grouped draft/official actions.

Supports:

- Left context copy.
- Secondary action group.
- Primary action group.
- Loading/disabled states.
- Mobile stacking.
- Dirty-state messaging.

## Out Of Scope

- Do not migrate `/org/[orgId]/duty-rosters`.
- Do not add duty-roster-specific data rules to these primitives.
- Do not create route-specific visual variants.
- Do not create compatibility adapters for legacy UI.

## Acceptance Criteria

- Components live under `src/lib/components/ui/**` or another approved shared UI path.
- Each component appears in `docs/component-catalog.md` with desktop, mobile, empty, disabled, and long-content states where relevant.
- `docs/component-catalog.md` documents the public API and usage rules.
- The components compose existing shadcn-svelte primitives instead of duplicating button, badge, tab, table, or form visuals.
- Route code can vary behavior, labels, actions, and data, but not visual styling.

## Implementation Progress

- Added `src/lib/components/ui/page-shell` as the shared primitive family for this step.
- Added `PageShell.Root` for authenticated route content scrolling, padding, density, and width.
- Added `PageShell.Header` for route-local title, subtitle, back/meta/action/overflow snippets, and compact wrapping.
- Added `PageShell.Tabs` for route-level tabs with URL-backed links or local value-backed tab changes, optional badges, active state, disabled state, and horizontal overflow.
- Added `PageShell.FactGrid`, `PageShell.FactRow`, and `PageShell.Metric` for dense operational facts and metric groups.
- Added `PageShell.FactRow layout="stack"` for multi-column metadata grids where inline label/value rows would compress labels or long values.
- Added `PageShell.SummaryRail` and `PageShell.RailSection` for right-side operational summary rails.
- Added `PageShell.StickyActionBar` for dirty-state and grouped action bars.
- Updated the duty-roster guidance in `docs/component-catalog.md` to consume the shared primitives for the page shell, header, route tabs, fact rows, metrics, summary rails, and settings sticky action bar.
- Tightened the duty-roster history examples with `min-w-0` containment and local table overflow so wide history/detail tables do not slide under right-side rails.
- Converted the history filter row to a wrapping control layout so action buttons remain visible beside the summary rail across intermediate breakpoints.
- Documented the `ui/page-shell` public API and usage rules in `docs/component-catalog.md`.

### Notes

- `PageHeader` from the original plan is implemented as `PageShell.Header` to keep route shell primitives together as a compound shared family.
- `RouteTabs` is implemented as `PageShell.Tabs`; it supports both `href` items for URL-backed navigation and `value` items for component catalog/local tab state. Production routes should prefer URL-backed items where route state is represented by the URL.
- `SummaryRail` responsive conversion to a mobile `Sheet` remains a future behavior extension. The current shared primitive provides the stable rail surface and stacks naturally in responsive grid layouts.
- No production `/org/[orgId]/duty-rosters` route was migrated in this step.

## Verification

- Add or update focused component tests where practical.
- Run `npm run format`.
- Run `npm run lint`.
- Run `npm run governance:check`.
- Run `npm run check`.
- Run `npm run test`.

## Stop Conditions

Stop if a shell primitive needs a visual variant only for duty roster. Either generalize the need into a reusable shared API or ask for explicit permission before proceeding.
