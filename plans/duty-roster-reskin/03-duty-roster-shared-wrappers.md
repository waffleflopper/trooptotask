# Step 3: Build Duty Roster Shared Wrappers

## Purpose

Build the duty-roster-specific shared wrappers that encode domain presentation without pushing visual decisions into route files. These wrappers should sit on top of shared primitives and provide reusable route-ready building blocks for the final reskin.

## Inputs

- Step 1 showroom findings
- Step 2 shell primitives
- `docs/plans/2026-05-03-duty-roster-replacement-da6-prd.md`
- `docs/plans/2026-04-27-duty-roster-run-module-rfc.md`
- Existing duty roster modules under `src/features/duty-roster/**`
- Existing shared components under `src/lib/components/ui/**`

## Scope

Create or refine these wrappers.

### `DutyRosterStatusBadge`

Semantic wrapper over `ui/badge` for duty-roster states.

Required statuses:

- `active`
- `archived`
- `draft-preview`
- `official`
- `applied`
- `needs-sync`
- `invalidated`
- `latest`
- `correction-pending`
- `accepted`
- `manual`
- `review`
- `ok`
- `unresolved`
- `override`
- `locked`

The wrapper owns mapping from domain status to badge variant and accessible label. Routes must not pass arbitrary colors.

### `DA6Matrix`

Feature-owned wrapper around `ui/operational-matrix`.

Required capabilities:

- Draft and official modes.
- Sticky Soldier axis.
- Date column headers.
- DA6 cell displays for assigned, not assigned, exempt, blocked, manual override, and unresolved states.
- Assigned count and required count footer rows.
- Legend.
- Optional metadata header.
- Print-friendly layout constraints.
- Horizontal overflow that works on mobile.
- Accessible cell labels that do not rely on color alone.

Keep `ui/operational-matrix` domain-neutral. DA6-specific meanings belong in this wrapper.

### `ManualChangePanel`

Panel for draft preview manual changes.

Required content:

- Selected date.
- Current final selection.
- Original generated selection.
- Risk explanation.
- Replacement Soldier combobox.
- Selected Soldier summary.
- Reason field with required state when needed.
- Warning blocks.
- Save/cancel footer.

On constrained screens this should be able to render inside `Sheet`.

### `CorrectionSheet`

Panel for accepted-run corrections.

Required content:

- Date and originally assigned Soldier.
- Soldier who actually served.
- Reason select or reason input.
- Optional details textarea.
- Prior corrections.
- Outside-pool warning.
- Calendar/count impact info.
- Save/cancel footer.
- Close affordance.

### `AuditTimeline`

Shared or feature-owned timeline for correction and run history events.

Required content:

- Timestamp.
- Event title.
- Actor/system label.
- Optional description.
- Compact vertical layout for side rails.

This may be useful beyond duty roster, so prefer a shared UI component unless the first implementation is tightly DA6-specific.

### `WarningSummary`

Composable warning/info/error block for duty-roster review states.

Required content:

- Tone: info, warning, destructive, success.
- Icon.
- Title.
- Description or bullet list.
- Optional action button.
- Dismiss support only if the route has actual dismiss behavior.

### `DateRangeControls`

Wrapper for date range selection in generate flows.

Required content:

- Start date field.
- End date field.
- Computed date range label.
- Validation messaging.
- Optional quick range actions if future design calls for them.

## Out Of Scope

- Do not change DA6 business rules.
- Do not migrate production routes.
- Do not add new database behavior.
- Do not add route-local visual overrides.

## Acceptance Criteria

- Wrappers use the shared components created or confirmed in Steps 1 and 2.
- Wrappers appear in `/ui-showroom` or a dedicated duty-roster showroom section with realistic states.
- `docs/component-catalog.md` documents wrappers that are shared outside the feature layer.
- Feature-owned wrappers stay under `src/features/duty-roster/**` if they contain DA6-specific language or status semantics.
- Tests cover status mapping, matrix rendering contract, and required/optional panel states where practical.

## Verification

- Run focused component tests for new wrappers.
- Run Svelte autofix checks for new Svelte files during implementation.
- Run `npm run format`.
- Run `npm run lint`.
- Run `npm run governance:check`.
- Run `npm run check`.
- Run `npm run test`.

## Stop Conditions

Stop if the wrapper needs to change the visual nature of an existing shared component at its usage site. Move that need back into the shared component/showroom layer or ask for explicit approval.
