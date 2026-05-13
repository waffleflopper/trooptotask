# Step 4: Migrate Duty Roster Route Screens

## Purpose

Migrate the production duty-roster route screens to the shared shell primitives and duty-roster wrappers proven in Steps 1 through 3. This is the first step that should touch `/org/[orgId]/duty-rosters` production route code.

## Inputs

- Step 1 component catalog examples
- Step 2 shared shell primitives
- Step 3 duty-roster wrappers
- `docs/plans/2026-05-03-duty-roster-replacement-da6-prd.md`
- Current route files under `src/routes/org/[orgId]/duty-rosters/**`
- Current feature components under `src/features/duty-roster/components/**`

## Screen Migration Order

Migrate one screen group at a time, verifying after each group.

1. Route shell and tabs.
2. Template register.
3. New template wizard.
4. Generate setup.
5. Preview review list mode.
6. Preview review DA6 matrix mode.
7. History list.
8. History detail list/matrix.
9. Manual preview change panel.
10. Correction panel.
11. Settings ledger.
12. Empty/loading/error states across all screens.

## Route Rules

- Routes own behavior, data, permissions, labels, validation, action wiring, filters, and form submission.
- Shared components own visual appearance.
- Do not add route-local CSS or Tailwind classes that visually alter shared components.
- Do not add a route-specific wrapper around a shared component without explicit approval.
- If a shared component does not fit, stop and report the design-system gap.
- Keep route files thin. Business rules stay in feature/application modules.

## Required Behavior To Preserve

- Template register links to Generate, History, and Settings by slug.
- New template flow preserves identity, pool, exemptions, baseline, and review steps.
- Generate creates a preview only.
- Manual preview changes preserve generated-vs-final selection and reason requirements.
- Print Draft does not accept the run.
- Accept writes official history.
- Accept + Print saves before printing.
- Accept + Apply saves history and applies Calendar assignments.
- Accepted runs remain immutable snapshots.
- Later Calendar apply from history remains available.
- Corrections record who actually served, reason, actor, timestamp, and count impact.
- Only the latest accepted run can be invalidated.
- Invalidated runs stay visible and locked.
- Invalidation removes linked Calendar assignments.
- Settings changes affect future runs only.
- Baseline locks after accepted history exists.

## Required Visual States

- Active template row.
- Active route tab.
- Empty template register.
- Empty history.
- No eligible pool.
- Baseline locked.
- Draft preview.
- Official accepted run.
- Applied Calendar state.
- Needs sync Calendar state.
- Invalidated run.
- Correction pending/corrected.
- Manual override.
- Unresolved date.
- Warning summary.
- Destructive confirmation.
- Loading/generating state.
- Disabled action with reason.
- Mobile sheet/panel behavior.

## Acceptance Criteria

- All duty-roster screens align with the component catalog-approved shared UI baseline.
- No production route file invents new visual component styling.
- Existing route behavior remains intact.
- Existing URL states continue to work:
  - `/org/[orgId]/duty-rosters`
  - `/org/[orgId]/duty-rosters/new`
  - `/org/[orgId]/duty-rosters/[templateSlug]/generate`
  - `/org/[orgId]/duty-rosters/[templateSlug]/history`
  - `/org/[orgId]/duty-rosters/[templateSlug]/settings`
  - `/org/[orgId]/duty-rosters/[templateSlug]/history/[historyId]`
- Browser refresh and back/forward navigation preserve the selected route view.
- Desktop and mobile layouts are usable.

## Verification

- Run existing duty-roster tests.
- Add or update focused tests for changed route behavior.
- Run browser visual review against the route at desktop and mobile widths.
- Run `npm run format`.
- Run `npm run lint`.
- Run `npm run governance:check`.
- Run `npm run check`.
- Run `npm run test`.

## Stop Conditions

Stop if migration exposes a missing shared component, missing wrapper API, or route-specific visual need. Document the gap and return to Step 2 or Step 3 before continuing.
