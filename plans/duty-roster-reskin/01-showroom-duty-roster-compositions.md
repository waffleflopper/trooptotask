# Step 1: Add Duty Roster Showroom Compositions

## Purpose

Add duty-roster-specific examples to `/ui-showroom` before changing the production `/org/[orgId]/duty-rosters` route. Utilize a new `/ui-showroom/duty-roster` route that includes the app-shell layout from `/ui-showroom/app-shell`. The goal is to prove the route's needed shared UI compositions against the calibrated shadcn-svelte baseline first.

This is a planning and shared-UI calibration step, not a production route migration.

## Inputs

- `docs/plans/2026-05-06-shadcn-svelte-tailwind-v4-ui-migration-rfc.md`
- `docs/plans/2026-05-06-shadcn-svelte-tailwind-v4-component-inventory.md`
- `docs/plans/2026-05-03-duty-roster-replacement-da6-prd.md`
- `docs/component-catalog.md`
- Current shared UI under `src/lib/components/ui/**`
- Duty roster mockups from the design pass

## Scope

Create showroom examples for the duty-roster compositions the final reskin will need:

- Template register with selectable row, icon actions, pagination, and right summary rail.
- New template wizard pool step with stepper, eligibility filters, resolved pool, exemptions panel, and pool summary rail.
- Generate setup with date range controls, pool snapshot, DA6 rule summary, warnings, errors, and generate summary rail.
- Preview review list mode with readiness metrics, row statuses, manual change entry point, and draft/official action groups.
- Preview review DA6 matrix mode with metadata block, legend, print options rail, and official actions.
- History list with filters, sortable columns, pagination, state legend, and empty-history state.
- History detail with official-history notice, list/matrix switch, correction entry point, and correction side panel.
- Settings ledger with sectioned identity, eligibility, exclusions, locked baseline, template summary rail, archive warning, and sticky unsaved-changes bar.

## Required Shared Components To Exercise

- `button`
- `badge`
- `tabs`
- `field`
- `input`
- `textarea`
- `select`
- `combobox`
- `multi-select`
- `checkbox`
- `date-picker`
- `table`
- `data-table`
- `pagination`
- `alert`
- `sheet`
- `tooltip`
- `separator`
- `stepper`
- `operational-matrix`
- `empty`
- `skeleton`

## Design-System Gap Checks

While building the showroom examples, record whether these are missing shared patterns:

- `PageShell`
- `PageHeader` Probably not needed, would rather use the appshell breadcrumb header paradigm currently in use
- `RouteTabs`
- `FactGrid`
- `SummaryRail`
- `StickyActionBar`
- `DutyRosterStatusBadge`
- `DA6Matrix`
- `ManualChangePanel` or `CorrectionSheet`
- `AuditTimeline`
- `WarningSummary`
- `DateRangeControls` <RangeCalendar /> may be useful
- `CircularProgress` or a decision to remove that design detail

Do not solve gaps by styling the showroom locally in a way production routes can copy. If a pattern is missing, capture it as a shared-component gap.

## Acceptance Criteria

- all UI maintains the "shadcn"-like visual appareance
- `/ui-showroom` includes a duty-roster section or equivalent route-like examples for the screens listed above.
- Examples use existing shared UI primitives without route-local visual overrides.
- Every new shared composition need is captured in the showroom, the conversion map, or this plan directory before route migration begins.
- The examples cover desktop and constrained widths.
- The examples include warning, error, empty, locked, disabled, selected, and loading states.
- The production duty-roster route is not migrated in this step.

## Implementation Progress

- Added `/ui-showroom/duty-roster` with a showroom-local app shell frame.
- Added static composition examples for the template register, new template pool wizard, generate setup, preview review list, DA6 matrix, history list, history detail, and settings ledger.
- Added showroom-local helpers for repeated composition scaffolding: fact rows, metrics, summary rails, exemption pills, section wrappers, and multi-select field examples.
- Added a focused showroom test covering the main route examples, tab switching, manual change sheet, correction sheet, and DA6 matrix rendering.
- Production duty-roster routes remain untouched by this step.

### Captured Shared-Component Gaps

- `SummaryRail`: currently represented by a showroom-local composition and should become a shared wrapper if reused by production screens.
- `FactGrid` / `FactRow`: repeated summary rows and metric groups need a shared API before route migration.
- `StickyActionBar`: settings unsaved-change actions are represented locally and should be promoted or mapped to an existing shared pattern before production use.
- `DA6Matrix`: the existing `operational-matrix` primitive can support the shape, but a duty-roster-specific shared composition is likely needed for labels, legend, cell states, and print-safe density.
- `ManualChangePanel` / `CorrectionSheet`: side-panel flows are represented with `sheet`, but the duty-roster form layout and warning stack should be standardized before production migration.
- `AuditTimeline`: represented locally inside the correction/history detail example and should become a shared timeline pattern if it appears outside duty roster.
- `DateRangeControls`: single `date-picker` controls work, but a dedicated range control remains a likely shared-component gap.
- `CircularProgress`: not implemented in the showroom; recommend deciding whether to remove that visual detail or add a shared progress primitive before route migration.

## Verification

- Run focused component/showroom tests if existing tests cover the touched showroom surface.
- Run `npm run format`.
- Run `npm run lint`.
- Run `npm run governance:check`.
- Run `npm run check`.
- Run `npm run test`.

## Stop Conditions

Stop and report a design-system gap if any mockup element requires route-local changes to shared component visuals, including colors, spacing, radius, borders, density, typography, or internal selectors.
