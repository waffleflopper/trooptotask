# Step 5: Final Cleanup And Verification

## Purpose

Close the duty-roster reskin by removing leftover route-local visual drift, documenting any remaining design-system gaps, and verifying the full workflow end to end.

## Inputs

- Completed Step 4 route migration
- `docs/component-catalog.md`
- Current duty-roster route and feature code
- Existing duty-roster tests

## Cleanup Scope

### Remove Local Visual Drift

Search for and remove or justify:

- Route-local button styling.
- Route-local badge/status color styling.
- Route-local table chrome that should be `DataTable`, `Table`, or `OperationalMatrix`.
- Route-local alert/warning panels.
- Route-local tab styling.
- Route-local sticky footer styling.
- Route-local sheet/dialog panel styling.
- Arbitrary Tailwind values used to tune shared component appearance.
- Scoped CSS that exists only to imitate shared component visuals.

### Confirm Shared Component Use

Confirm production duty-roster screens use the approved components/wrappers:

- `PageShell`
- `PageHeader`
- `RouteTabs`
- `FactGrid`
- `SummaryRail`
- `StickyActionBar`
- `DutyRosterStatusBadge`
- `DA6Matrix`
- `ManualChangePanel`
- `CorrectionSheet`
- `AuditTimeline`, if implemented
- `WarningSummary`
- `DateRangeControls`
- Existing shadcn primitives where direct use is enough

### Documentation

Update docs only where implementation changed shared APIs:

- `docs/component-catalog.md`
- `docs/component-catalog.md`, if a current-vs-target primitive decision changed
- Any duty-roster reskin plan notes if an approved deviation was needed

Do not bury remaining gaps in route code. Create an explicit gap list.

## Workflow Verification

Manually or through tests verify:

- Template register opens correct template views.
- New template setup handles basics, pool, exemptions, baseline, and review.
- Generate validation blocks past-date and invalid range cases.
- Generate preview renders list and DA6 matrix modes.
- Manual preview change handles clean swaps, warning-required reasons, and blocked archived/missing personnel.
- Print Draft does not write official history.
- Accept writes accepted history.
- Accept + Print writes history before print.
- Accept + Apply writes history and Calendar assignments.
- History list filters and paginates.
- History detail opens list and matrix modes.
- Corrections require reasons and update actual-served display.
- Calendar-linked corrections show Calendar impact messaging.
- Invalidation is latest-run-only and uses destructive confirmation.
- Invalidated runs remain visible and locked.
- Settings changes affect future runs only.
- Baseline is locked when accepted history exists.

## Visual Verification

Review at minimum:

- Desktop wide viewport.
- Desktop narrow viewport.
- Mobile width.
- Long template names.
- Long Soldier names.
- Empty states.
- Large table states.
- Warning/error states.
- Keyboard focus path through forms, tabs, tables, sheets, dialogs, and action bars.

## Acceptance Criteria

- No undocumented duty-roster route-local visual overrides remain.
- All remaining route-owned Tailwind is structural layout only and aligns with the component catalog baseline.
- Shared component docs match the actual APIs used by duty roster.
- The final gap list is empty or explicitly documented with follow-up scope.
- All required verification commands pass.

## Verification Commands

Run the full required project gate:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

## Stop Conditions

Stop and create a follow-up gap report if cleanup finds a missing shared primitive that cannot be resolved without widening the slice.
