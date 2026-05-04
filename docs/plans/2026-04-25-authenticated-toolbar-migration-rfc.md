# Authenticated Toolbar Migration RFC

Parent issue: #655

Related issues: #650, #651, #652, #653, #654

Related plan: `docs/plans/2026-04-25-floating-page-toolbar-system.md`

## Purpose

Migrate authenticated-route toolbar usage to the new floating toolbar family after the Critical Tasks tracer bullet proved the API. The migration should end with one coherent toolbar system, not a half-legacy state where older primitives remain indefinitely because route-specific behavior was forced through the wrong abstraction.

The implementation work should be sliced so each issue migrates a coherent set of routes end-to-end, adds reusable toolbar primitives when a route does not fit cleanly, and keeps route smoke tests focused on parity while component tests cover reusable behavior.

## Current State

#650 through #654 are closed. Critical Tasks now proves the Phase 1 toolbar family:

- `FloatingPageToolbar` as the shell and compact-panel coordinator.
- `ToolbarActions` and `ToolbarAction` for policy-driven actions.
- `ToolbarSearchItem` for compactable search.
- `ToolbarGroup`, `ToolbarFilterSelect`, `ToolbarViewToggle`, and `ToolbarToggle` for stateful controls.
- `ToolbarOverflowMenu` as the shared command overflow surface.

The remaining authenticated app still mixes:

- `FloatingPageToolbar` with route-local children.
- `ProgressiveToolbarActions`.
- `SmartToolbar`.
- `ToolbarSearch`.
- `ToolbarSelect`.
- direct buttons/links inside toolbar slots.
- route-local nav, count, status, and summary fragments.

`PageToolbar` does not currently appear as a live authenticated-route dependency in the audited route/component files, but it remains a shared page-header primitive with tests and historical references. It should not be removed as part of this migration unless a later audit confirms it has no non-toolbar purpose.

## Inventory

| Area | Routes/components | Current controls | Migration notes |
| --- | --- | --- | --- |
| Critical Tasks main | `src/routes/org/[orgId]/critical-tasks/+page.svelte` | Already on `ToolbarGroup`, `ToolbarSearchItem`, `ToolbarToggle`, `ToolbarViewToggle`, `ToolbarActions` | Treat as the parity baseline. Do not churn unless a new primitive changes the shared API. |
| Critical Tasks detail/report/library | `IctPersonnelDetailPage.svelte`, `IctReportsView.svelte`, `IctTaskLibraryPage.svelte` | Search, select filters, dense report filters, task-library actions | Needs compactable search/select groups and likely a summary/meta primitive for report context. |
| Personnel | `PersonnelPageView.svelte` | view segmented control, search, `ProgressiveToolbarActions`, read-only upgrade note | Straight migration to `ToolbarViewToggle`, `ToolbarSearchItem`, `ToolbarActions`, plus a reusable status/meta item for read-only messaging. |
| Calendar main | `CalendarPageView.svelte`, `calendarToolbarItems.ts` | group filter, search, `SmartToolbar` actions, dropdowns, icon button, overflow toggles | Needs SmartToolbar-to-ToolbarActions replacement, dropdown action support or policy extension, toggle actions, and lucide icon mapping. |
| Calendar spoke pages | `AssignmentPlannerPage.svelte`, `BulkStatusPage.svelte`, `CalendarSettingsPage.svelte`, `CalendarReports.svelte` | back/related links, selects, subnav tabs, action buttons | Mostly low-risk; settings need a reusable nav/tab or link-group primitive rather than route-local anchors. |
| Training | `TrainingPageView.svelte`, `TrainingTypesPage.svelte`, `TrainingReportsPage.svelte` | select filters, action buttons, clear filters, export, `MultiTagSelect` in report filters | Training reports are a mismatch: add a reusable multi-select toolbar filter or compact panel policy instead of hand-packing `MultiTagSelect`. |
| Evaluations | `RatingSchemePageView.svelte` | status ledger, select filters, view segmented control, `ProgressiveToolbarActions`, shown count | Needs status/metric cluster primitive and grouped filters before migrating actions. |
| Onboarding | `OnboardingPageView.svelte`, `history/+page.svelte`, `templates/+page.svelte` | history/back links, manage templates link, primary start/add actions, manual overflow menu, read-only note | Needs nav/link action treatment and generated overflow; keep permission gates and disabled template-state behavior unchanged. |
| Admin | `admin/+layout.svelte`, `approvals`, `archived`, `audit`, `settings` | admin tab nav, filter select, counts, retention/status notes | Needs a toolbar nav primitive and passive meta item. Avoid turning section tabs into command overflow. |
| Organization settings and billing | `settings/+page.svelte`, `billing/+page.svelte` | `ProgressiveToolbarActions` only | Good early action-only migrations once component support is stable. |
| Dashboard | `DashboardPageView.svelte` | passive date/status text | Consider replacing with a toolbar meta item or removing toolbar usage if no page controls remain. |

## Mismatches To Resolve With Reusable Pieces

These should become shared toolbar primitives or policy extensions when encountered in a migration slice. Do not solve them with route-local snippets that only happen to fit one page.

1. `ToolbarNavGroup`
   - For tab-like or back/related navigation currently rendered as direct anchors or `SubNav`.
   - Applies to admin sections, duty roster tabs, onboarding history/templates links, and calendar spoke navigation.
   - Must not put current-section navigation into command overflow by default.

2. `ToolbarMetaItem`
   - For passive count, date, read-only, retention, and save-state text.
   - Applies to dashboard date, audit count, admin settings pending state, archived retention note, personnel read-only note, rating shown count, and similar small status text.
   - Should support compact hiding or abbreviated labels without behaving like a command.

3. `ToolbarMetricGroup`
   - For compact status summaries such as the evaluation overdue/60d/30d ledger.
   - Should be visually calm, accessible as summary content, and collapsible as one stateful/context group.

4. `ToolbarMultiSelectFilter`
   - For `MultiTagSelect` usage in training reports.
   - Should preserve selected tags and active count in compact mode.

5. Dropdown/toggle action support in `ToolbarActions`
   - Calendar `SmartToolbar` currently owns dropdown actions, icon buttons, overflow-only items, and active overflow toggles.
   - Prefer extending `ToolbarActionConfig` deliberately over preserving `SmartToolbar` as a parallel page-toolbar system.

6. Icon mapping expansion
   - Calendar settings and additional route actions need first-class lucide icon names in `ToolbarIcon.svelte`.
   - Do not carry raw SVG strings into the new toolbar action API.

## Final Cleanup Target

After all authenticated usages migrate:

- Remove `ProgressiveToolbarActions.svelte`, `ProgressiveToolbarActions.types.ts`, and their tests if no non-toolbar usage remains.
- Remove `SmartToolbar.svelte`, `SmartToolbar.types.ts`, `SmartToolbarTest.svelte`, and their tests after calendar no longer depends on them.
- Keep `ToolbarOverflowMenu` if it remains the command overflow surface used by `ToolbarActions`.
- Keep `ToolbarSelect` and `ToolbarSearch` only if they are documented as low-level building blocks used by `ToolbarFilterSelect` and `ToolbarSearchItem`, not as route-level toolbar APIs.
- Keep `ToolbarIconButton` only if a real standalone icon-button use remains outside the floating toolbar family; otherwise remove it with the old primitive tests.
- Keep `PageToolbar` unless a separate audit proves authenticated and public page headers no longer need it.
- Update `docs/component-catalog.md` at the end of cleanup so route authors see one target toolbar API.

## Proposed Migration Waves

These are written as `to-issues`-ready vertical slices. Each slice is independently reviewable and should update component docs when it changes the public toolbar API.

### Slice 1: Add Navigation And Meta Toolbar Primitives

Type: AFK

Blocked by: none

What to build:

Add reusable toolbar primitives for non-command toolbar content that already appears across authenticated routes: navigation groups and passive meta/status items. Prove them on the simplest admin/status routes without changing product behavior.

Candidate routes:

- `src/routes/org/[orgId]/admin/+layout.svelte`
- `src/routes/org/[orgId]/admin/approvals/+page.svelte`
- `src/routes/org/[orgId]/admin/archived/+page.svelte`
- `src/routes/org/[orgId]/admin/settings/+page.svelte`
- `src/features/dashboard/components/DashboardPageView.svelte`

Acceptance criteria:

- [ ] Add `ToolbarNavGroup` or equivalent shared primitive for tab/back/related navigation.
- [ ] Add `ToolbarMetaItem` or equivalent shared primitive for passive counts, dates, retention notes, pending state, and read-only notices.
- [ ] Admin section tabs remain navigation, not command overflow.
- [ ] Passive meta content remains accessible and does not masquerade as a button.
- [ ] Migrated routes preserve labels, links, counts, and visibility.
- [ ] Component tests cover nav active state, keyboard-accessible links, meta rendering, and compact behavior.
- [ ] Route tests cover only route-level parity for the migrated pages.

Verification:

- `npm run test -- --run src/lib/components/ui/toolbar`
- Relevant route tests for migrated routes.
- Full standard verification before completion.

### Slice 2: Migrate Action-Only Toolbars

Type: AFK

Blocked by: Slice 1

What to build:

Replace `ProgressiveToolbarActions` on action-only authenticated pages with `ToolbarActions`, preserving permission gates, disabled states, protected primary actions, and overflow behavior.

Candidate routes:

- `src/routes/org/[orgId]/billing/+page.svelte`
- `src/routes/org/[orgId]/settings/+page.svelte`
- any simple calendar/training/onboarding spoke pages with only back links plus one primary action, if Slice 1 already covers their nav/meta needs

Acceptance criteria:

- [ ] Billing actions migrate from `ProgressiveToolbarActions` to `ToolbarActions`.
- [ ] Organization settings actions migrate from `ProgressiveToolbarActions` to `ToolbarActions`.
- [ ] Existing permission gates and read-only disabled states are unchanged.
- [ ] Overflow ordering and icon-only behavior remain equivalent where currently visible.
- [ ] No route-local adapter survives if it belongs in shared action mapping.

Verification:

- Focused action component tests only if new action policy behavior is added.
- Existing route tests or new smoke tests for action presence and disabled state.
- Full standard verification before completion.

### Slice 3: Migrate Personnel And Onboarding Workflows

Type: AFK

Blocked by: Slices 1 and 2

What to build:

Move personnel and onboarding toolbars onto the new family, proving common roster/onboarding patterns: search, view toggle, generated actions, navigation links, manual overflow replacement, primary disabled states, and read-only messaging.

Candidate routes:

- `src/features/personnel/components/PersonnelPageView.svelte`
- `src/features/onboarding/components/OnboardingPageView.svelte`
- `src/routes/org/[orgId]/onboarding/history/+page.svelte`
- `src/routes/org/[orgId]/onboarding/templates/+page.svelte`

Acceptance criteria:

- [ ] Personnel search uses `ToolbarSearchItem`.
- [ ] Personnel view mode uses `ToolbarViewToggle`.
- [ ] Personnel actions use `ToolbarActions`.
- [ ] Onboarding history/templates links use the shared nav/link primitive.
- [ ] Start onboarding and add template actions preserve disabled and read-only behavior.
- [ ] Manual `ToolbarOverflowMenu` usage is replaced by generated command overflow where appropriate.
- [ ] Read-only upgrade text uses the shared meta primitive.

Verification:

- Route tests for search binding, view toggle, action availability, and disabled onboarding start.
- Component tests for any nav/meta behavior not covered in Slice 1.
- Full standard verification before completion.

### Slice 4: Migrate Calendar Main And Spoke Toolbars

Type: AFK

Blocked by: Slices 1, 2, and any dropdown/toggle action support discovered in this slice

What to build:

Replace the calendar `SmartToolbar` path and migrate calendar main/spoke toolbars to the new toolbar family. Add shared dropdown/toggle action support and icon mappings if needed.

Candidate routes/components:

- `src/features/calendar/components/CalendarPageView.svelte`
- `src/features/calendar/utils/calendarToolbarItems.ts`
- `src/features/calendar/components/AssignmentPlannerPage.svelte`
- `src/features/calendar/components/BulkStatusPage.svelte`
- `src/features/calendar/components/CalendarSettingsPage.svelte`
- `src/features/calendar/components/reports/CalendarReports.svelte`

Acceptance criteria:

- [ ] Calendar group filter uses `ToolbarFilterSelect`.
- [ ] Calendar personnel search uses `ToolbarSearchItem`.
- [ ] Calendar dropdown actions, icon settings link, overflow export actions, and active toggles are represented through the new toolbar action API or deliberate shared extensions.
- [ ] Raw SVG icon strings are replaced by shared lucide icon names.
- [ ] Duty roster tab navigation uses the shared nav primitive.
- [ ] Calendar spoke pages preserve back/related links, filters, primary actions, and permission gates.
- [ ] `SmartToolbar` has no remaining calendar route usage after this slice.

Verification:

- Component tests for dropdown/toggle action support if added.
- Calendar route smoke tests for primary actions, settings link, export/toggle overflow, search, and group filter.
- Duty roster route parity tests for tab navigation and related links.
- Full standard verification before completion.

### Slice 5: Migrate Training Toolbars And Multi-Select Filters

Type: AFK

Blocked by: Slice 1 and `ToolbarMultiSelectFilter` decision in this slice

What to build:

Migrate training hub, type management, and reports to the new toolbar family. Add a reusable multi-select toolbar filter primitive or compact panel policy for training report type filters.

Candidate routes:

- `src/features/training/components/TrainingPageView.svelte`
- `src/features/training/components/TrainingTypesPage.svelte`
- `src/features/training/components/TrainingReportsPage.svelte`

Acceptance criteria:

- [ ] Training hub filters use `ToolbarFilterSelect` inside a `ToolbarGroup`.
- [ ] Training type actions use `ToolbarActions`.
- [ ] Training report single-select filters use `ToolbarFilterSelect`.
- [ ] Training report type `MultiTagSelect` is supported through a reusable toolbar primitive or policy extension.
- [ ] Clear filters and export actions use `ToolbarActions` with correct disabled behavior.
- [ ] Report filtering behavior and reload behavior remain unchanged.

Verification:

- Component tests for multi-select compact/active behavior.
- Route tests for filter persistence, clear filters, and export disabled state.
- Full standard verification before completion.

### Slice 6: Migrate Evaluations And Remaining Critical Tasks Subpages

Type: AFK

Blocked by: Slices 1, 2, and 5 if multi-select/group behavior is reused

What to build:

Migrate the densest remaining toolbars: evaluations and Critical Tasks subpages. Add a reusable metric/status group if the evaluation ledger does not fit existing primitives cleanly.

Candidate routes:

- `src/features/rating-scheme/components/RatingSchemePageView.svelte`
- `src/features/critical-tasks/components/IctPersonnelDetailPage.svelte`
- `src/features/critical-tasks/components/IctReportsView.svelte`
- `src/features/critical-tasks/components/IctTaskLibraryPage.svelte`

Acceptance criteria:

- [ ] Evaluation filters use `ToolbarGroup` plus `ToolbarFilterSelect`.
- [ ] Evaluation view mode uses `ToolbarViewToggle`.
- [ ] Evaluation actions use `ToolbarActions`.
- [ ] Evaluation status ledger uses a reusable metric/status primitive or a documented policy extension.
- [ ] Critical Tasks detail/library search uses `ToolbarSearchItem`.
- [ ] Critical Tasks detail filters use `ToolbarFilterSelect`.
- [ ] Critical Tasks report/library actions preserve current permission and disabled behavior.

Verification:

- Component tests for metric/status primitive if added.
- Route tests for evaluation filtering/view/action parity.
- Route tests for Critical Tasks subpage search/filter/action parity.
- Full standard verification before completion.

### Slice 7: Remove Superseded Toolbar Primitives

Type: AFK

Blocked by: Slices 1 through 6

What to build:

Remove obsolete toolbar primitives and update documentation once no authenticated routes depend on them.

Acceptance criteria:

- [ ] `ProgressiveToolbarActions` and its types/tests are removed when no imports remain.
- [ ] `SmartToolbar` and its types/tests are removed when no imports remain.
- [ ] `ToolbarIconButton` is removed or documented as non-toolbar-only if a legitimate standalone use remains.
- [ ] `ToolbarSearch` and `ToolbarSelect` are either kept as low-level building blocks or removed if the new family no longer uses them.
- [ ] `ToolbarOverflowMenu` remains only as the command overflow implementation behind `ToolbarActions`, unless a cleaner replacement exists.
- [ ] `docs/component-catalog.md` names the final target API and removes migration-only guidance that is no longer true.
- [ ] `rg` confirms no authenticated-route imports of superseded route-level toolbar primitives remain.

Verification:

- `rg "ProgressiveToolbarActions|SmartToolbar|ToolbarIconButton|ToolbarSearch|ToolbarSelect" src/routes src/features src/lib/components`
- Full standard verification before completion.

## Dependency Order

1. Slice 1: Add Navigation And Meta Toolbar Primitives
2. Slice 2: Migrate Action-Only Toolbars
3. Slice 3: Migrate Personnel And Onboarding Workflows
4. Slice 4: Migrate Calendar Main And Spoke Toolbars
5. Slice 5: Migrate Training Toolbars And Multi-Select Filters
6. Slice 6: Migrate Evaluations And Remaining Critical Tasks Subpages
7. Slice 7: Remove Superseded Toolbar Primitives

Slices 4 and 5 can run in either order after Slice 1, but Slice 7 must stay last. Slice 6 should wait until the metric, filter, and action extension patterns are settled so the densest pages do not create one-off exceptions.

## Suggested To-Issues Input

Use #655 as the parent issue. Create implementation issues in the dependency order above. Each issue body should include:

- Parent: #655
- What to build: the slice description above
- Acceptance criteria: the criteria listed for the slice
- Blocked by: the actual issue numbers created before it
- Verification: route parity tests plus reusable component tests, then standard repo verification

Before creating issues, confirm:

- The seven-slice granularity is right.
- Slice 1 should create nav/meta primitives first instead of letting each route discover them ad hoc.
- Calendar should be one focused slice because it owns the `SmartToolbar` removal path.
- Training reports should be the slice that proves multi-select filter support.
- Evaluation and Critical Tasks subpages should wait until the reusable primitive set is less speculative.

## Stop Conditions

- Stop and ask if a toolbar behavior depends on ambiguous product intent rather than current UI parity.
- Stop and split a new prerequisite issue if a needed primitive is large enough to distort a route migration slice.
- Do not preserve `SmartToolbar` or `ProgressiveToolbarActions` as parallel route-level systems once their usages are migrated.
- Do not remove `PageToolbar` in this sequence unless a separate audit confirms it is no longer needed as a page-header primitive.
