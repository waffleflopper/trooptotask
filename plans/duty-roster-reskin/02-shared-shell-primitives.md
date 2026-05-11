# Step 2: Build Shared Shell Primitives

## Purpose

Create the shared page and workspace primitives that the duty-roster reskin needs before production route work starts. This step turns repeated mockup structure into reusable shared components rather than route-local layout.

## Inputs

- Step 1 showroom findings
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
- Each component appears in `/ui-showroom` with desktop, mobile, empty, disabled, and long-content states where relevant.
- `docs/component-catalog.md` documents the public API and usage rules.
- The components compose existing shadcn-svelte primitives instead of duplicating button, badge, tab, table, or form visuals.
- Route code can vary behavior, labels, actions, and data, but not visual styling.

## Verification

- Add or update focused component tests where practical.
- Run `npm run format`.
- Run `npm run lint`.
- Run `npm run governance:check`.
- Run `npm run check`.
- Run `npm run test`.

## Stop Conditions

Stop if a shell primitive needs a visual variant only for duty roster. Either generalize the need into a reusable shared API or ask for explicit permission before proceeding.
