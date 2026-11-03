# Reports and history

A Calendar reader sees saved availability across current and historical ranges, reads time away over the past 90 days
from the same authorized people, and sees today's availability on the Dashboard without foreign facts.

## Sub-features

- `saved-ranges`: September and historical March Calendar reads retain own statuses and closure, excluding B.
- `time-away-lens`: the Time away lens defaults to the 90 days up to yesterday and leads with the share of person-days
  away, the status mix, days away per person by Group and a ranked list of people, from A's saved people only.
- `time-away-workbook`: the downloaded `Time away by person` and `Time away by group` sheets contain independently
  expected counts, labels, the flag column and Next out, without foreign rows.
- `availability-lens`: the Availability lens leads with the lowest day, a daily strength chart, a Group by day grid and
  who is out on the selected day, from the same A-only data, with a two-sheet workbook.
- `assignment-load-lens`: the Assignment load lens compares each person's duties with a fair share worked out from
  the duty's pool, excusals and who was away, in three sections with a two-sheet workbook, from one span request.
- `report-states`: the page title, the lens and span in the address, Availability's loading, error and retry, no-data
  and result states, and the large-roster run at 1280 light and 390 dark.
- `dashboard-current`: today's Baker training projects one unavailable Person and remains Organization-scoped after
  reload.

## How to get to it (user POV)

Choose `Calendar` → `Reports`. The page opens on Availability for the next 30 days. Choose `Time away` for the 90 days
up to yesterday, then `Export time away`. The month/year picker and `3-Month` view expose older saved dates. The Organization's Dashboard is its overview route; its current
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
3. Open `Reports`, choose `Time away`. The address is `?lens=time-away` and the range reads the 90 days up to
   yesterday (`Previous 90 days` is a link, `Next 90 days` is disabled). The result has the sections `Bottom line`,
   `Where the days went` (named for the largest status) and `Who was away`. No Foreign Person or `Foreign Private
Status` appears. The authenticated status-days response for September 14-16 includes A's saved availability IDs,
   excludes B's, and does not export the closure as a status row. Save the report result before exporting.
4. Run `$V export arm $PAGE`, click `Export time away` (on the row, or in `More Calendar report controls` at narrow
   widths), then `$V export save $PAGE .verification/evidence/verify-trooptotask/<run>/time-away.xlsx` and
   `$V export restore $PAGE`. Run `$V workbook <same-path> 'Time away by person'` and
   `'Time away by group'`. By person has Rank, Last Name, First Name, Group, one column per active status in Calendar
   Settings order, Total days away, Percent of span, `Flagged (N+ days)`, Next out and Next out day. Choose a span that
   holds September (`?lens=time-away&days=90&start=2026-09-01`) and compare Able (3 Verification Leave days, September
   14-16), Baker (Verification Training on September 15) and Unassigned (1 Leave day) with the visible rows. Each day
   counts once per Person, so a Person's total is the number of distinct away days in the span. No Foreign row, foreign
   status column or closure column appears. A click or toast without captured workbook bytes does not prove export
   contents.
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
away` and `Assignment load`: the address gains `lens=`, Back returns to the previous lens and a reload keeps it.
   Time away and Assignment load default to the 90 days up to yesterday (Availability to the 30 days from today), so
   leaving Availability for either drops its `days` and `start`. **Time away** keeps the span switch, Group, Counts as
   away and MOS filters, and adds `Flag at` (a sixth, quarter, third or half of the span, `30+ days` at 90 D). The
   `Previous` and `Next` links step one span earlier or later and `Next` stays disabled on the latest span; `14 D` to
   `90 D` end on yesterday; `Back` and a reload keep the span. One status-days request loads the span plus the 60 days
   after it, and count entries as for Availability: a preset or `Previous` makes exactly one more request, while
   `Group`, `MOS`, `Counts as away`, `Flag at` and the `Most away`/`Least away` toggle make none. The bottom line reads
   `N of M person-days` with the share, one sentence naming the busiest Group and how many people reached the flag, and
   the facts `N+ days away`, `Never away`, the largest status share and `Busiest group`. `Where the days went` shows
   the composition bar and, by Group, days away per person with the company average marked. `Who was away` ranks
   people with a stacked bar, a dashed flag line, days, share and Next out (`continues` when the entry runs past the
   span); `Show all N` lists everyone and `Show fewer` returns to the first 12. Seed `availability-volume` for enough
   people to see more than 12 rows and non-zero flags (its entries start in October, so use `Flag at` of `15+ days`).
   **Assignment load** reads like Time away: it defaults to the 90 days up to yesterday and has the span switch,
   `Previous`/`Next`, `Group`, `Counts as away` and `MOS`, plus `Duty types` (every active person-assigned type,
   checked). A preset or `Previous` makes exactly one more status-days request (nothing is loaded past the span), and
   `Group`, `MOS`, `Counts as away`, `Duty types` and the `Most over`/`Most under` toggle make none. A fair share works
   each assigned day out among the people the type's pool allows (rank range, MOS, role, Groups; none means everyone)
   who are not excused and not away that day, so a duty on a day with N such people adds 1/N to each. The report shows
   three sections. `Bottom line` gives the share of people within one duty of their fair share, a sentence naming who
   carries the most against a fair share and who drew nothing, and the facts `Duties in range`, `Eligible people`,
   `Never assigned` and `2+ over fair share`. `How each duty is spread` has one bar per duty (under, on share, over)
   with its eligible people, duties and `N never`. The by-person section ranks people with the duties, fair share, a
   bar either side of the fair share mark, the difference and the last duty, 12 rows then `Show all N` and `Show
   fewer`. The default `$V seed da6` puts Staff Duty every day and Charge of Quarters on four days from today, so
   the report reads forward: open `?lens=assignment-load&days=30&start=<today>` (any date works for `start`) and
   expect Okafor 4 duties against 2.8 (he is away for 2 of the 21 Staff Duty days, so 19 x 1/8 is 2.375, and away for 1
   of the 4 Charge of Quarters days, so 3 x 1/8 is 0.375, 2.75 in all), Grant 4 against 3.2 and Patel 3 against 3.2. Uncheck Charge of Quarters in
   `Duty types` and Okafor reads 3 against 2.4; uncheck `Verification Leave` in `Counts as away` and he reads 2.6.
   `$V seed da6 <YYYY-MM> 20` gives 20 people for `Show all 20` and the ordering (28 duties over 20 people is 1.4
   each). Record each selected span and every number before export.

7. For Availability and Assignment load, arm `$V export arm $PAGE`, click its visible Export action (`Export
   availability`, `Export assignment load`), save the Blob to a distinct `.xlsx` file under this run, and restore
   capture. Inspect each real sheet with `$V workbook FILE 'Availability by day'`, `'Group by day'` or
   `'Assignment load by person'` or `'Assignment load by duty'` (Time away's sheets are step 4). The `Availability by day` sheet has Date, Here,
   Away, Total, Here percent, one column per active status and Away personnel for every day of the span; `Group by
day` has one row per Group and a Total row of `available/total (percent%)` cells.
   Compare the saved cells with the visible result and fixture dates. `Assignment load by person` has Rank, Last Name,
   First Name, Group, one column per duty type in Calendar Settings order, Total, Fair share, Difference from fair
   share, Difference from average, Days present and Last duty, one row per person and an Average row. `Assignment load
   by duty` has Duty, Duties, Eligible people, Never drew it, Over fair share, On share and Under fair share. With
   `seed da6 <YYYY-MM> 20` the workbook holds Grant to Diaz with Staff Duty 2, Total 2, Fair share 1.4 and
   Difference 0.6, Recruit01 with 1, 1.4 and -0.4, and one Staff Duty row of 28, 20, 0, 0, 20, 0. No foreign Person,
   Group or assignment type may appear.

8. **Report states.** As `calendarLane` open `Reports` at 1280x800 light and at 390x844 dark, and once at about 900
   wide. Do not scroll by script before a capture. Require the document title `Calendar Reports - Troop to Task` on
   direct load and after client navigation, and `scrollWidth` equal to the viewport at 390 and 900. For loading, arm
   `$V network arm-hold $PAGE calendar-reports/status-days`, click `60 D`, capture the skeletons, read each section's
   height (`[aria-label="Availability report"] section`) and release; the heights while loading and after the result
   match. For an error, arm `$V network arm-fail $PAGE calendar-reports/status-days`, click `14 D`, and require the
   alert `Could not load availability` with `Retry`. Restore the control, click `Retry` and require the result. For no
   data, uncheck every Group and require `No personnel match these filters.` with no `Export availability` action. Time
   away repeats the checks on the same endpoint: hold it and click `60 D` for the skeletons (the sections `Bottom line`,
   `Where the days went` and `Who was away` keep their heights when the result lands, also on a span nobody was away
   in, such as `?lens=time-away&days=14&start=2025-01-06` then `30 D`), arm `arm-fail` and click `14 D`
   for the alert `Could not load time away` with `Retry`, and uncheck every Group for `No personnel match these
filters.` with no `Export time away` action. Assignment load repeats them: hold the endpoint and click `60 D` (the sections
   `Bottom line`, `How each duty is spread` and `Who carries the duty` keep their heights when the result lands, at 390,
   about 900 and 1280), arm `arm-fail` and click `30 D` for the alert `Could not load assignment load` with `Retry`
   (restore first, then `Retry`), open a span with no duty for `Nobody here shared a duty in this span.`, and choose a MOS
   nobody on duty has for the same text with no `Export assignment load` action. Organizations with no person-assigned
   type read `No duties were assigned to people in this span.` At 390 the day labels of a 30-day chart show every second day, and the grid
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
- Availability looks ahead and Time away looks back: both use the span switch (`14 D` to `90 D`, `start=` and `days=` in
  the address), Availability from today (30 days by default) and Time away up to yesterday (90 days by default). Assignment
  load uses the current calendar year. Use the visible range and `$V fixture` dates to calculate expected values before
  comparing rows; open Time away with `?lens=time-away&start=2026-09-01` (90 days from that start) if a fixed September
  fixture is outside the default span.
- The Time away tab is one lens with the shared Group, Counts as away and MOS filters, the span switch and `Flag at`; the
  Assignment load tab adds `Duty types` to the same filters and span switch. `Flag at` appears only on Time away.
