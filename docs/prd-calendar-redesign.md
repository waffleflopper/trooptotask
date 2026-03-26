# PRD: Calendar Redesign — UI/UX Overhaul & Architecture Cleanup

## Problem Statement

The calendar page was the first feature built and accumulated technical debt as features were added without deliberate design. The result:

- **12 modals** orchestrated from a single page, many too complex for modal UX (duty roster generator, assignment planner, bulk operations)
- **An overflow menu with ~15 items** spanning unrelated concerns (bulk ops, planning, config, reports, exports, display toggles)
- **A 340-line god-object** (`CalendarPageContext`) handling selection state, personnel grouping, permissions, overflow menu definition, availability handlers, assignment handlers, bulk operations, duty roster logic, and export functions
- **Hardcoded clinic-specific assumptions** (FDS badge in date header, MOD restricted to providers)
- **CSS/JS hacks** — double borders in the grid, JavaScript-positioned sticky personnel column
- **Poor modal UX** — complex tools like duty roster generator and monthly assignment planner crammed into modals that require excessive scrolling

## Goals

1. **Clear information architecture** — the calendar page has one job: visibility grid with inline single-status editing
2. **Supporting tools get their own pages** — bulk ops, planning, duty roster, configuration become sub-routes
3. **Improved discoverability** — responsive toolbar with labeled groups replaces the overloaded overflow menu
4. **Morning glance panel** — Today's Breakdown becomes an inline collapsible summary, not a modal
5. **Cleaner codebase** — decompose the god-object context, eliminate the modal orchestrator, fix CSS hacks
6. **Remove hardcoded assumptions** — configurable assignment type display and eligibility instead of clinic-specific logic
7. **Consistent navigation** — breadcrumbs + back button matching the pattern established in training

## Design Decisions

### Core Calendar Page Purpose
The calendar's primary job is **visibility**: "Where is everyone and what are they doing?" Secondary action is **inline editing**: click a cell to add/edit/remove a single status for a single person. Everything else is a supporting tool that lives on its own page.

### Route Structure

```
/calendar
  +layout.server.ts    — loads: availability, assignments, special days,
                          assignment types, pinned groups, status types,
                          personnel, permissions
  +layout.svelte       — hydrates shared stores (minus roster history)
  +page.svelte         — calendar grid page

/calendar/bulk
  +page.svelte         — tabbed bulk operations (Add | Remove | Import)

/calendar/assignments
  +page.svelte         — manual assignment planner for complex/judgment-based scheduling

/calendar/duty-roster
  +page.server.ts      — loads roster history (only sub-route with its own server load)
  +page.svelte         — DA6-compliant duty roster generator with audit trail

/calendar/reports
  +page.server.ts      — already exists, no changes
  +page.svelte         — already exists, no changes

/calendar/settings
  +page.svelte         — status types, assignment types (with header badge radio),
                          holidays/special days
```

### Why Assignments and Duty Roster Are Separate Pages
- **Duty Roster** is governed by DA6 rules — fairness, rotation, exemptions, audit trail. Used for formal assignments (Staff Duty, CQ) where algorithmic fairness must be provable.
- **Assignments Planner** is manual placement for schedules requiring human judgment (on-call, complex assignments with factors outside the system). No algorithmic fairness claims.
- Merging them would muddy the DA6 audit trail ("was this generated fairly or hand-picked?").
- Both write to the same daily assignments data — the calendar grid shows the combined result.

### Why Reports Stay Feature-Scoped
Reports stay at `/calendar/reports` (not a unified reports area) to avoid loading massive cross-feature datasets. With 350+ personnel and 25+ mandatory trainings, combining calendar and training reports would cause performance issues. This matches the existing `/training/reports` pattern.

### Calendar Settings Page
A single scrollable page with sections (not tabs — each section is small):
- **Status Types** — CRUD table
- **Assignment Types** — CRUD table with a radio button column for "Show in date header" (replaces hardcoded FDS badge)
- **Holidays & Special Days** — CRUD table with "Reset to Federal Holidays" action

The radio button for header badge display lives inline in the assignment types table, not in a separate display section.

## Calendar Page Components

### Today's Breakdown Panel
- **Inline collapsible panel** between toolbar and grid (pushes layout down, does NOT overlay)
- Expanded by default on desktop, collapsed on mobile
- Dense, scannable summary designed for 3-5 second morning glance:
  - Status counts (X on leave, Y TDY, Z present)
  - Today's assignment coverage (CQ: SGT Smith, Staff Duty: SSG Jones)
  - Gaps/flags (e.g., "No CQ assigned for tomorrow")
  - Group strength ratios (1st PLT: 8/12 present)
- Does NOT include full personnel-by-status breakdown (the grid itself shows that)

### Responsive Smart Toolbar (New Shared Component)
Replaces `PageToolbar` on the calendar page. Designed as a reusable, composable component for adoption by other features later.

**Full width layout:**
```
[Today's Breakdown toggle]  [Bulk Status v]  [Planning v]  [gear icon]  [... export/display]
```

- **Bulk Status dropdown**: Add Bulk, Remove Bulk, Import CSV — each navigates to `/calendar/bulk` with the appropriate tab active
- **Planning dropdown**: Duty Roster, Assignment Planner — navigate to respective sub-routes
- **Gear icon**: navigates to `/calendar/settings`
- **Overflow (...)**: Export to Excel, Print/PDF, Show Status Text toggle

**Narrow width behavior:**
Visible buttons collapse right-to-left into a single organized overflow with **section headers**:
```
Today's Breakdown
---
BULK STATUS
  Add Bulk
  Remove Bulk
  Import CSV
---
PLANNING
  Duty Roster
  Assignment Planner
---
Export to Excel
Print / PDF
---
Calendar Settings
```

### 3-Month View Toggle
- Toggle button in the **month navigation area** (next to prev/next month buttons), not in the toolbar
- Switches between month view (default) and 3-month view
- 3-month view is **read-only** — no cell click editing (targets too small, different mental mode)
- Compressed columns: hides status text, assignment badges, front desk group
- Clicking a date column in 3-month view **jumps the month view to that month** (navigation tool)

### Month/Year Picker
- Clicking the month/year text (e.g., "March 2026") opens a month/year picker popover
- Standard calendar UX pattern for quick date navigation

### Date Header Improvements
- Dates with assignments show a subtle visual indicator (dot/underline) for discoverability
- Hover state change to signal clickability
- Assignment type badge is configurable (radio in settings), not hardcoded to FDS

### Calendar Grid Fixes
- Fix double borders (use single-side border pattern)
- Replace JS-positioned sticky personnel column with pure CSS `position: sticky; left: 0`
- Requires correct DOM structure for sticky-in-scrollable-container

### Modals Remaining on Calendar Page
Only two modals remain, both inlined directly in `CalendarPageView.svelte`:
1. **AvailabilityModal** — click a cell to edit one person's status
2. **DailyAssignmentModal** — click a date header to set that day's assignments

`CalendarModals.svelte` is eliminated.

## Navigation Patterns

### Sub-Route Navigation
- All `/calendar/*` routes highlight "Calendar" in the main app sidebar
- Each sub-page has **breadcrumbs + back button** in the toolbar, matching training section pattern
  - Example: `Calendar / Duty Roster` with clickable segments + back arrow
- Sub-routes are accessed via toolbar dropdown buttons (navigate, not open modals)

### Bulk Operations Page
Single page with tabs: `[Add] [Remove] [Import]`
- Tabs share the same data context (personnel, status types, existing entries)
- Same mental workflow: "I need to make bulk changes"

## Code Architecture Changes

### CalendarPageContext (Slimmed)
After the redesign, the context retains only:
- Selection state (selectedPerson, selectedDate, assignmentDate)
- Personnel grouping/scoping
- Permission checks
- Single-status availability handlers (add, remove)
- Daily assignment modal handler (single date click)
- Onboarding highlight state
- View mode state (month vs 3-month)

Target: ~150 lines, down from 340.

### Sub-Route Pages Own Their State
Each sub-route page manages its own:
- Page-specific state and handlers
- Form state and validation
- API calls for mutations

They read shared data from layout stores but don't push state back through the context.

### Data Loading
- Layout loads shared data (availability, assignments, special days, assignment types, pinned groups, status types, personnel, permissions)
- Roster history moves from layout to `/calendar/duty-roster/+page.server.ts` (can grow large over time, only needed by one page)
- `/calendar/reports` keeps its own server load (already exists)

### Hardcoded Assumptions to Remove
- `CalendarHeader.svelte`: FDS shortName lookup for date header badge -> configurable per org
- `DailyAssignmentModal` or equivalent: MOD restricted to providers -> configurable eligibility per assignment type (deferred: eligibility rules feature, but remove hardcoding now)

## Mobile Strategy
- **Desktop-first** for the full calendar grid
- Today's Breakdown panel works naturally on mobile (stacked layout)
- Single-status entry (AvailabilityModal) works on mobile
- Full grid is scrollable but not optimized for phone
- Broader mobile-specific views are a separate future initiative

## Implementation Order

Each step results in a working, deployable app. No big-bang rewrite.

1. **Build SmartToolbar component** — new shared component in `$lib/components/ui/`, tested in isolation
2. **Create `/calendar/settings`** — move StatusTypeManager, AssignmentTypeManager, SpecialDayManager to settings page. Remove from CalendarModals. Add gear icon to toolbar.
3. **Create `/calendar/bulk`** — move BulkStatusModal, BulkStatusRemoveModal, BulkStatusImportModal to tabbed page. Remove from CalendarModals.
4. **Create `/calendar/duty-roster`** — move DutyRosterGenerator to own page. Move roster history loading from layout to page server. Remove from CalendarModals.
5. **Create `/calendar/assignments`** — move MonthlyAssignmentPlanner to own page. Remove from CalendarModals.
6. **Convert TodayBreakdown to inline panel** — redesign for dense summary format, integrate into CalendarPageView. Remove from CalendarModals.
7. **Convert LongRangeView to view toggle** — integrate into calendar grid via month nav toggle. Remove from CalendarModals.
8. **Eliminate CalendarModals.svelte** — inline AvailabilityModal and DailyAssignmentModal into CalendarPageView.
9. **Slim down CalendarPageContext** — remove handlers/state now owned by sub-route pages.
10. **Swap PageToolbar for SmartToolbar** — wire up labeled groups and responsive collapse on calendar page.
11. **Fix grid CSS** — double borders, pure CSS sticky column, remove JS positioning hacks.
12. **Remove hardcoded FDS/MOD assumptions** — replace with configurable assignment type properties.
13. **Add month/year picker** — click month label to jump to a specific month.

## Deferred / Future Work

- **Batch entry tab** — bulk page tab for entering multiple people with different dates/statuses at once (e.g., processing a stack of leave forms)
- **Assignment type eligibility rules** — configurable constraints per assignment type (e.g., E-5+ only, specific groups only). Remove MOD hardcoding now, build flexible rules later.
- **Mobile-specific views** — abbreviated tool for quick lookups and single edits in the field
- **Customizable Today's Breakdown** — widget system for unit-specific metrics (e.g., provider-to-medic ratios for clinics)
- **Default view preference** — remember month vs 3-month preference per user

## Success Criteria

- Calendar page renders only the grid, status legend, today's breakdown panel, and two contextual modals
- All supporting tools accessible via sub-routes with proper breadcrumb navigation
- Overflow menu has 3 or fewer ungrouped items
- No hardcoded unit-type assumptions (FDS, MOD provider restriction)
- CalendarPageContext under 200 lines
- Personnel column sticky via CSS only, no JS positioning
- No double borders in grid
- SmartToolbar component reusable by other feature pages
