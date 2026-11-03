# Reports and history

A Calendar reader sees saved availability across current and historical ranges, exports status-day totals from the same
authorized people, and sees today's availability on the Dashboard without foreign facts.

## Sub-features

- `saved-ranges`: September and historical March Calendar reads retain own statuses and closure, excluding B.
- `status-day-report`: the report page renders A's saved people and status totals, without foreign rows or special-day
  export data.
- `status-day-workbook`: the downloaded `Status Days` sheet contains independently expected counts, labels and
  exclusions.
- `availability-lens`: the Availability lens leads with the lowest day, a daily strength chart, a Group by day grid and
  who is out on the selected day, from the same A-only data, with a two-sheet workbook.
- `other-calendar-reports`: Time away (status days by person, away days by person) and Assignment load by person use
  the same A-only data in visible results and real workbooks until their lenses are redesigned.
- `report-states`: the page title, the lens and span in the address, Availability's loading, error and retry, no-data
  and result states, and the large-roster run at 1280 light and 390 dark.
- `dashboard-current`: today's Baker training projects one unavailable Person and remains Organization-scoped after
  reload.

## How to get to it (user POV)

Choose `Calendar` → `Reports`. The page opens on Availability for the next 30 days. Choose `Time away`, a year, then
`Run status-day report` and `Export status days`. The month/year
picker and `3-Month` view expose older saved dates. The Organization's Dashboard is its overview route; its current
availability card summarizes today.

## Driving it with verify:app

Preconditions: `$V actor calendarLane calendar` returns `PAGE`; `$V fixture` gives A/B Person and availability IDs,
`dates.historical`, `dates.uiBefore/uiAfter`, and closure IDs. Use the same signed-in page for the report and Calendar
reads. For the Dashboard projection, open `$V actor calendarView` in its own page: that role also has Personnel view
access, which supplies the visible roster summary.

1. Read
   `GET /org/<orgA>/api/calendar-range?rangeStart=2026-09-14&rangeEnd=2026-09-16&collections=availability,assignments`
   through authenticated `tool evaluate_script`, then the same read from March 11 through October 14, 2026. A read
   without `collections` receives `availability` and `assignments`, not `events`. Each response has `rangeStart`,
   `rangeEnd`, `availabilityEntries`, `specialDays` and `dailyAssignments`; status and assignment type catalogs come with the Calendar page, not this read.
   The first includes Alpha, Bravo and Unassigned seeded availability; the second also includes `availabilityHistorical`
   and any current Baker row overlapping those dates. Seeded leave rows name A's Leave type by `statusTypeId`,
   `specialDays` includes `closureA`, and neither response contains B's availability, status type or closure IDs. Save
   the request path, response status and known-ID comparison.
2. Choose September 2026 in Calendar. Capture Able's three leave day titles with `Alpha seeded leave`, Baker's training
   note, Unassigned's leave and the `Verification Unit Closure` date header. Switch to `3-Month`; September still shows
   those statuses and closure. Move twice to March–May, wait for loading to finish and capture one `Historical retained`
   leave day. Move forward twice and capture the restored September facts.
3. Open `Reports`, choose `Time away`, choose `2026`, and click `Run status-day report`. The rendered result includes Able and Baker (and
   Unassigned where listed), no Foreign Person or `Foreign Private Status`, and an `Export status days` action in
   `Calendar report controls` (on the row, or in `More Calendar report controls` at narrow widths). The authenticated
   status-days response for September 14–16 includes A's saved availability IDs, excludes B's, and does not export the
   closure as a status row. Save the report result before exporting.
4. Run `$V export arm $PAGE`, click `Export status days`, then
   `$V export save $PAGE .verification/evidence/verify-trooptotask/<run>/status-days.xlsx` and
   `$V export restore $PAGE`. Run `$V workbook <same-path>` and inspect the `Status Days` sheet. Able has `4`
   Verification Leave days (March 11 plus September 14–16); Unassigned has `1` Leave day; Baker has Verification
   Training on September 15 (`dates.middle`) and on each day of `dates.uiBefore..dates.uiAfter` inside 2026, and `1`
   Verification Retiring Status day on October 14 (`dates.later`). The total counts unique days with any status, so
   Baker's total is the number of distinct days in September 15, October 14 and `uiBefore..uiAfter` within 2026. A
   launch on 2026-10-20 reads `5` (September 15, October 14 and 19 to 21); a launch whose span covers October 14 reads
   `4`. The workbook has no Foreign row, foreign status column, or Organization closure status column. A click or toast
   without captured workbook bytes does not prove export contents.
5. In the `calendarView` page, visit Organization A's Dashboard and capture `2` of `3` `Available` and Baker once in
   `Out today`, with `Verification Training`. Overlapping entries select one displayed status per Person in catalog
   order; Baker remains one unavailable Person even when `Verification Retiring Status` also overlaps today. Require no
   B labels or Person. Reload and confirm the same scope. If the fixture's local date no longer overlaps Baker's seeded
   `uiBefore..uiAfter` after a long run, check the fixture date and relaunch rather than revising the expected product rule.
6. Drive the rest of the lenses. **Availability** is the default lens: `$V network arm-observe $PAGE
calendar-reports/status-days`, open `Reports`, and require the bottom line to name the lowest day (its percent, date
   and `N of M here`), one sentence naming the dominant away statuses, and the facts `Here today`, `Days under 80%`,
   `Groups under 50% on any day` and `Away on <date>`. Baker's current Training makes the lowest day today or
   tomorrow, and Bravo (one Person) is red on those days. Click `14 D`: the address gains `days=14`, the range reads 14
   days from today and exactly one more status-days request is made (count `performance.getEntriesByType('resource')`
   entries whose name contains `calendar-reports/status-days`). Open `Group` and uncheck Bravo, then `Counts as away`
   and `MOS`: the numbers and grid rows change with no new request. Click a chart column and a grid cell: the `Who`
   heading and list follow the picked day, and an everyone-here day reads `Everyone is here on this day.` Click `Time
away` and `Assignment load`: the address gains `lens=`, Back returns to the previous lens, a reload keeps the
   lens, and each lens shows its existing report (Status days by person and Away days by person; Assignment load by
   person) without the span switch. **Time away** and **Assignment load** run with their visible `Run` controls and
   follow the unchanged A-only rules below. **Assignment load by person** over calendar year 2026 shows Able with one
   Staff and one archived assignment, Baker with one Retiring assignment, and Unassigned with zero; the Group
   assignment does not count as a Person assignment. **Away days by person** shows Able's three September Leave days,
   Baker's current Training overlap and Unassigned's one September Leave day when those dates fall in its selected
   range. The status columns of Status days and Away days and the type columns of Assignment load follow the type
   order shown in Calendar Settings, not the order entries were saved, and keep that order after a reload and in each
   workbook. Record each selected date range, visible result and foreign exclusion before export.

7. For Availability, Away days by person and Assignment load, arm `$V export arm $PAGE`, click its visible Export
   action (`Export availability`, `Export away days`, `Export assignment load`), save the Blob to a distinct `.xlsx`
   file under this run, and restore capture. Inspect each real sheet with `$V workbook FILE 'Availability by day'`,
   `'Group by day'`, `'Personnel Tempo'` or `'Assignment Coverage'`. The `Availability by day` sheet has Date, Here,
   Away, Total, Here percent, one column per active status and Away personnel for every day of the span; `Group by
day` has one row per Group and a Total row of `available/total (percent%)` cells.
   Compare the saved cells with the visible result, fixture dates and A-only rows. The `Assignment Coverage` sheet must
   have Able 2, Baker 1 and Unassigned 0 for the unchanged seeded year; no foreign Person/Group or foreign assignment
   type may appear.

8. **Report states.** As `calendarLane` open `Reports` at 1280x800 light and at 390x844 dark, and once at about 900
   wide. Do not scroll by script before a capture. Require the document title `Calendar Reports - Troop to Task` on
   direct load and after client navigation, and `scrollWidth` equal to the viewport at 390 and 900. For loading, arm
   `$V network arm-hold $PAGE calendar-reports/status-days`, click `60 D`, capture the skeletons, read each section's
   height (`[aria-label="Availability report"] section`) and release; the heights while loading and after the result
   match. For an error, arm `$V network arm-fail $PAGE calendar-reports/status-days`, click `14 D`, and require the
   alert `Could not load availability` with `Retry`. Restore the control, click `Retry` and require the result. For no
   data, uncheck every Group and require `No personnel match these filters.` with no `Export availability` action. The
   legacy lenses keep their own validation, loading, error and no-data states (clear the start date; arm and release
   the same endpoint; `Run again`). At 390 the day labels of a 30-day chart show every second day, and the grid
   scrolls sideways with the Group column and its Lowest figure still visible. As `manager`, open the Reports route and
   record the denial. For the large roster, run `$V seed bulk-501`, open Availability for 90 days and run Status days
   by person five times with its default range. Record the time from the click or Run to the settled result, long tasks
   and DOM element count, then run `clean-seeds`.

When Calendar persistence or request composition changes, also drive
[Personnel record readiness](personnel-records-lifecycle.md), [single-Person record export](personnel-artifacts.md),
[Organization export](organization-exports.md), and [Dashboard composition](dashboard.md). Compare full original A/B
saved rows before mutations and after restoration, including IDs, creation metadata, nulls, catalog order and archived
assignment references. Inspect the actual downloaded Calendar sheets and complete same-Person availability history
permitted by the exporting actor's Calendar view and strict Group scope. Follow the linked single-Person export recipe
for separate ordinary member none/view cases and temporary grant restoration.

Complete every comparison that depends on a seeded cohort before `clean-seeds`; it removes every journaled cohort in
that worker. After cleanup, require recorded temporary IDs to be absent and all unaffected original A/B rows to remain
exact. Run destructive retiring-type deletion and federal reset only after journeys that need those original rows.
Before those terminal actions, record the selected catalog IDs, their linked availability/assignment IDs and the
original federal-holiday set. The terminal comparison must account for those declared removals and independently
expected replacement holidays, while preserving every other original row and all B rows. Do not recreate consumed
original IDs to claim restoration. Without terminal destructive actions, require the complete original A/B sets to
remain equal.

## Gotchas

- The fixed September/March records and today's Baker projection use different dates. Use `$V fixture` to calculate the
  workbook overlap, and wait for range loading to finish before comparing cells.
- A visible report is weaker than the downloaded workbook. The helper captures the real Blob from the visible Export
  action and saves it outside the disposable worker; restore the capture even after failure.
- Availability uses the span switch (`14 D` to `90 D`, default 30 days from the viewer's today, `start=` and `days=` in
  the address); the legacy lenses keep their own ranges. Status days by person and Assignment load use the current
  calendar year and Away days by person the past 90 days. Use the visible range and `$V fixture` dates to calculate
  expected values before comparing rows; change a date range through its UI, or open Availability with
  `?start=2026-09-14`, if a fixed September fixture is outside the default.
- The Time away tab stacks two reports and the Assignment load tab holds one, each with its own filters; the shared
  Group, Counts as away and MOS filters and the span switch appear only on Availability.
