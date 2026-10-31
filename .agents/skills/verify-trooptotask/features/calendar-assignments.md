# Manual assignments

A Calendar operator plans Person and Group coverage for a day or month. Saved assignments keep their Organization, date,
type and assignee across Calendar, the Duty planner and report reads; a clear removes only the selected slot.

## Sub-features

- `saved-slots`: the September 15 Person, Group and archived assignments retain their fixture IDs and assignees;
  Organization B's slot stays private.
- `manual-slot`: set an empty Person and Group slot, reload, change or clear each, and preserve unrelated saved slots.
- `failed-clear`: a refused or failed day-dialog clear restores the saved slot and explains the failure; an explicit
  retry can clear it.
- `monthly-planning`: the Duty planner's month table, with the shared period navigation, one cell per type and date, and
  weekend, closure, today and past rows treated.
- `duty-picker-order`: for an Organization-wide operator, the lane picker and the planner picker for one slot list the
  same roster pool in the same order, highest count going into that day first, each with `count N` and any roster code;
  exempt people are absent, and anyone else outside the pool appears only for a name search, marked
  `Not on this roster`. On a day the roster does not detail, such as a No duty weekend in the Duty planner (the
  Calendar lane offers no `+` there), the pool still comes first, in DA 6 order without counts, and everyone outside it
  stays search-only and marked. Each picker reads its own day when it
  opens, reads `Loading roster counts…` over a skeleton with no options meanwhile, and on failure reads
  `Roster counts could not be loaded.` with `Retry`, lists no one until a name search, then offers anyone not excused
  marked `Count unavailable`, and never reads again on its own. A Group-scoped operator gets name order with no counts.
  When no one is in the pool that day, everyone not excused is listed, marked `Not on this roster`, rather than nothing.
- `duty-before-form`: on a day before a person type's open DA 6 form, the picker says under its search box what saving
  there does, so a past date never shows a bare `No one matches.` On a form that can still move back (no closed form
  before it and no carried starting numbers), a day the roster details with someone in the pool reads `Counts.`, names
  the form's current start, and lists the pool with counts as if the form began that day; saving moves the DA 6 start
  there and the counts today move with it. On such a form, a day with no one in the pool, or in the Duty planner a No
  duty weekend or holiday, reads `Not counted,` and that saving still moves the DA 6 start. On a roster already running it reads
  `Not counted, before this roster's DA 6 (starts <day>)`, lists everyone not excused in name order without counts, and
  saving there moves neither the start nor any count.
- `planner-conflicts`: a person assigned on a day an availability entry with roster code A, D or U covers is flagged in
  the cell and listed in `Conflicts`, D and U included, and on a day the roster does not detail (a No duty weekend, or a
  day before the open form) any covering availability entry still flags a hand assignment; `Find replacement` opens the
  same picker and a replacement clears the entry, except on a roster detail day for an Organization-wide operator, where
  it opens `planner-replacement`.
- `planner-replacement`: `Find replacement` on a roster detail day opens a popover beside the conflicted cell (below it
  on a narrow page) that previews the rule's pick, who can't pull that day and the later roster days the choice
  re-picks; choosing another candidate previews again, and `Assign <name>` writes the day and its re-picks together. A
  roster change since the preview is refused, explained and previewed again; hand-assigned days never change.
- `planner-swap`: for an Organization-wide operator, a filled day of a person type with a roster, today or later and not
  already swapped, offers `Swap with…` in its picker. It opens a popover beside the cell (below it on a narrow page)
  that lists the roster's other filled detail days held by someone else, from a skeleton or a load error with `Retry` in
  a list region of fixed height. Choosing a day previews both days, each with who stands it now and who held it, any A,
  D or U warning on the new placements and `Numbers on the DA 6 stay as published.`; nothing saves until `Swap days`.
  Both cells then show the new people and an exchange mark, `Roster · count today` and every DA 6 number stay as
  published, and the DA 6 remarks gain `<who> and <who> exchanged <day> and <day>. Numbers as published.` A swapped
  day's picker names the other day, offers `Undo swap` while both days are today or later, and warns that saving another
  person or clearing it ends the swap. `Clear month`, `Quick fill` with `Only open days` off and `Find replacement` warn
  the same way. A roster change since the preview is refused and previewed again. A Group-scoped operator sees no
  `Swap with…` and sends no swap read.
- `planner-roster-counts`: for an Organization-wide operator, the `Roster · count today` panel under `Conflicts` shows
  one duty type's roster after the last detail on or before today, highest count first, with a skeleton while it loads,
  a load error with `Retry roster counts` when it fails (the grid stays usable either way), muted rows carrying the
  roster code, `Today` for today's assignee and an excused footer. One `duty-rosters` read serves the panel and the
  month's conflicts; it starts beside the month's range read and repeats after every assignment or availability write
  the page confirms, whether made in a cell, Fill from roster, `Daily Assignments` or an availability entry. Those
  writes also refetch the open picker's day. A Group-scoped operator sees no panel and sends no roster read.
- `planner-fill`: for an Organization-wide operator a Person type's column header has a `Fill` button (named
  `Fill <type> from roster`) that opens `Fill from roster`, which previews the roster's picks for the open days from a
  chosen first day through a last day and writes them with `Fill N days`; a roster change since the preview is refused,
  explained and previewed again. `One person instead` and the column actions open `Quick fill`, which fills Weekdays,
  Weekends or All with `Only open days` on by default. Both clear the month after confirmation.
- `planner-range-retry`: a failed uncovered month load settles with Retry; a successful retry restores editable local
  assignments.
- `assignment-authorization`: view-only, no-Calendar, Group-scoped and foreign-Organization actors cannot write outside
  their authority.
- `calendar-lanes`: each shown assignment type is a lane under the Calendar dates, followed by the Days lane; an open
  day's `+` opens the duty picker (only once its range has loaded), an assigned day and a row marker open
  `Daily Assignments`, and readers see names without actions. A Person type whose `Weekends & holidays` is `No duty`
  offers no `+` on a weekend, holiday or closure and does not count it in `N open`, `Full` or the screen-reader summary;
  a day it is still assigned keeps its name and edit action, and a Group type ignores the setting. A range that has not
  loaded shows no count.
- `assignment-reentry`: an assignment saved while the Calendar re-entry snapshot is in flight stays visible after it
  applies; [Calendar navigation](calendar-navigation.md) step 16 drives it.
- `planner-states`: the monthly table, loading, failed save, keyboard and focus, denied and scoped states, and
  large-roster render at 1440 light and 390 dark.

## How to get to it (user POV)

Sign in with Calendar operation access and choose `Duty planner` under `Calendar` in the sidebar, or the Calendar
toolbar's `Duty planner`. Either opens the page headed `Duty planner` under the eyebrow `Calendar · Planning`. Its
header holds `Today`, `Previous month`, the month title button (it opens the month picker) and `Next month`, then
`Back to calendar`. The table has one column per assignment type (Calendar lane types first, then planner-only types,
archived types left out) and one row per date. A column header shows the type's chip and name with a
`<type> column actions` button beside the name, and `N OF M DAYS` under the name. For an Organization-wide operator, a
Person type also has a `Fill` button (named `Fill <type> from roster`) beside the count. An empty cell is an `Assign`
button named `Assign <type>, <Tue 22 Sept>`; a filled one is a button named `<type>, <date>: <rank last, first>`, with
`, unavailable: <status and dates>` when an availability entry covers the date. Either opens the duty picker for that
slot. The `Conflicts` panel beside the table (below it on a narrow page) lists every flagged slot with
`Find replacement`. Below `Conflicts`, an Organization-wide operator sees the `Roster · count today` panel: a
`Duty roster` toggle group of type codes (each named by its type) and a table named `<type> roster` whose `Up next` rows
show the rank and last name and a `Count` (a code such as `A 0` for someone a roster code covers today, `Today` for
today's assignee), split into `Weekdays` and `Weekends & holidays` tables for a split roster, and a footer sentence such
as `<rank> <last name> is excused.` for excused people. Click a Calendar date header, an assigned lane day or a row
marker to see the `Daily Assignments` modal for that date. An open lane day's `+` opens the same duty picker. `Reports`
shows assignment coverage and other Calendar projections. A Calendar reader may see saved assignments but cannot manage
them.

## Driving it with verify:app

### Helper controls

```bash
$V network arm-hold 2 calendar-reports/status-days # Calendar report data; daily-assignments is the single slot save
$V workbook .verification/evidence/verify-trooptotask/RUN/assignment-load.xlsx 'Assignment Coverage'
```

For `daily_assignments`, the filter also accepts `date`, `assignee_id`, and `assignment_type_id`.

### Journeys

Preconditions: doctor passes on a fresh worker; `$V fixture` supplies `orgA`, `orgB` and September 15 seeded
assignment/type/assignee IDs. Use September 22, 2026 for the temporary Planner slots only after
`$V rows daily_assignments orgA date 2026-09-22` and the corresponding B read both return zero; if fixtures change,
record another preflighted empty date. Use `$V actor calendarOperate calendar` for the visible `Duty planner` toolbar
action and keep its page ID. The date format in every name is the browser's en-GB short form, which spells September
`Sept`. Take exact `$V rows daily_assignments orgA date DATE` readbacks before and after reload.

1. In Calendar on September 2026, confirm the seeded Staff, Retiring and archived Person codes appear as row markers on
   September 15 and B's type/person do not. The Staff and Group lanes under the dates show `ABLE` and `Alpha` on
   September 15; check the same saved values in the planner. Click `Duty planner` (on the row, or under
   `More Calendar controls` when the toolbar folds); the page headed `Duty planner` opens on the month Calendar last
   showed, here September. If its title reads another month, choose September 2026 through the month title button's
   picker. Read September 15: `Verification Staff Duty` is Able, flagged `unavailable: Verification Leave 14–16 Sept`,
   `Verification Group Duty` is Alpha and `Verification Retiring Duty` is Baker, flagged for
   `Verification Training 15 Sept`; `Conflicts` lists the two flagged slots. The archived type is excluded from the
   table but its seeded assignment remains in the authenticated September range response. Compare the four original A
   assignment IDs and B's absence against `$V fixture` and the response, then reload and confirm the same visible
   values.
2. On the preflighted September 22 date (or October dates when it is taken), click
   `Assign Verification Staff Duty, Tue 22 Sept`, type `Able` into `Find person` and choose the suggestion with Enter.
   Read back one A row with `date` equal to `2026-09-22`, `assignment_type_id` equal to the `typePersonnel` fixture ID
   and `assignee_id` equal to the `personA` fixture ID, and no B row. On the same date, click
   `Assign Verification Group Duty, Tue 22 Sept` and choose a Group; read back exactly one A Group row with
   `assignment_type_id` equal to the `typeGroup` fixture ID and `assignee_id` equal to that Group ID, alongside the
   Staff row. Reload, confirm the title still reads September 2026 (the anchor cookie restores it; use the month picker
   if it does not), then confirm both visible selections and the same saved row IDs. Change the occupied Staff slot from
   Able to Unassigned through its cell's picker; after reload, require exactly one row for that date/type with that
   Person's ID and the original row ID and creation time. Change back, reload and require the same identity with
   `daily_assignment.updated` audits for both edits. Re-select the saved assignee and require no save request or audit.
   Repeat Alpha to Bravo to Alpha for the Group slot. Empty-slot creation emits only `daily_assignment.created`. Confirm
   the unrelated four September 15 rows stayed intact. Clear each slot with `Clear assignment` in its picker, then read
   back absence of just those two slots and retention of the seeded IDs. Reload to confirm the clear persisted. Also
   open an empty Calendar date header, inspect the `Daily Assignments` modal, set and clear one Person slot there, and
   check the same persisted row through the helper.
3. Use `Next month`, `Previous month` and `Today` in the planner header and confirm the title and the selected month's
   rows follow navigation. On an empty month such as November 2026, assign one Person to a weekday through its picker,
   then open `Verification Staff Duty column actions`, which opens `Quick fill`, choose another Person in `Assignee`,
   leave `Days` on `Weekdays` and `Only open days` checked, and read the button (`Fill 20 days` with one weekday taken)
   and the note (`Keeps the 1 day already assigned.`). Click it and compare exact expected dates and assignee/type IDs
   with A rows; the earlier slot must keep its Person. Reload and confirm. Open the column actions again, choose the
   first Person, uncheck `Only open days` (the note reads `Replaces the 21 days already assigned.` and the button
   `Fill 21 days`) and click it; those rows now carry the new assignee. Open the menu, click `Clear month`, read
   `Clear every Verification Staff Duty assignment in November 2026?`, cancel once (rows unchanged), then confirm; only
   that type's month rows disappear. Baker, who is exempt from Staff, must be absent from `Assignee`. Restart this owned
   worker if a seeded month was altered.
4. Arm `$V network arm-fail $PAGE calendar-range`, then click `Next month` until a previously uncovered month requests a
   range; one adjacent month can already be cached. Require `Assignments for this month could not be loaded.`,
   `Retry calendar load`, and a matched synthetic `503` in `$V network state $PAGE`. Click Retry, require a real `200`,
   a settled table and retained A rows without B values. While the request is held or failed, the table is absent, so no
   cell can be edited. Restore the network control even after failure.
5. In separate signed-in pages, inspect the direct planner route as `calendarView` and `manager`; neither may expose
   editable slots. Send authenticated single and batch assignment requests with a unique empty-day/date marker as each
   of `calendarView`, `manager`, `calendarScoped` targeting B's Person or an unassigned A Person, and `calendarOperate`
   targeting B's Organization. Require `403` or concealment `404`, and compare A/B daily-assignment rows before and
   after. A hidden `Duty planner` action alone is not authorization proof. Keep any affected access failure visible
   rather than accepting a provider `500` as a policy denial.
6. For a hidden occupied slot, use `calendarOperate` to save Bravo in an empty Group slot, then record the complete
   saved provider row, including ID and `created_at`. Open the same date in a separate `calendarScoped` Planner page:
   its Group slot appears empty. Choose Alpha in that cell's picker. Require a `409` POST, the generic
   `This assignment slot is unavailable. Refresh the Calendar and try again.` feedback, no leaked Bravo detail, an empty
   scoped slot after reload, and the exact protected row unchanged. Repeat the rejected save through the date-header
   `Daily Assignments` modal, then clear Bravo through the operator's visible control. Recheck zero temporary rows and
   the original seeded IDs. An unrelated provider failure must retain its own error classification; the SQL concurrency
   and rollback suites provide the distinct simultaneous-writer proof.
7. **Daily Assignments modal.** As `calendarOperate` in Calendar September 2026, click the September 15 date header at
   1280x800 light and at 390x844 dark. Capture `Daily Assignments` with its date and the seeded Staff, Group and
   Retiring slots; at 390 read the dialog's bounds against `innerWidth`. Close without changes.

8. **Calendar lanes and duty picker.** As `calendarOperate` on Calendar September 2026 at 1280x800 light and at 390x844
   dark, capture the lanes under the dates: `Verification Staff Duty`, `Verification Group Duty`, then `Days`. Each
   assignment lane's label shows its color, name and `N open` or `Full`. Lane rows are 26px tall, 24px under 641px. The
   Days lane names `Verification Unit Closure` on September 15. Click Staff's September 15 day, named
   `Verification Staff Duty for Tuesday, September 15, 2026: SPC Able, Synthetic. Edit assignments`; `Daily Assignments`
   opens for that date. Close it. On Able's September 15 row, the Staff marker chip is its own button inside that day's
   column: read its `getBoundingClientRect()` against the September 15 and 16 cells. Focus it and press Enter; it opens
   the same modal. Close it. On a preflighted empty date, click
   `Assign Verification Staff Duty for <weekday, month D, YYYY>`. The picker opens beside the day, named by the type and
   date, with focus in `Find person`. Press Escape, focus the same `+` and press Space; the picker opens again. Baker is
   exempt, so Baker is absent. Press Escape and require focus back on the `+`. **Order and counts.** On the Staff lane's
   `+` for a preflighted empty day on or after today the options are the Staff roster pool, highest count going into
   that day first, ties in DA 6 order: on today with no Staff details yet, `SPC Able, Synthetic, count 1` and
   `SPC Unassigned, Synthetic, count 1`, and the planner's picker for the same day reads the same. Search with `fill` on
   `Find person` keeps that order. Search `baker`: Baker stays absent because Staff excuses Baker. Step 13 checks a
   selectable `Not on this roster` person on Retiring, which does not excuse Baker. A pool member a roster code covers
   reads `count N, unavailable: <status> (<code>)` with the status under the name in red. Opening the picker sends one
   `duty-rosters/day?typeId=…&date=…` read, and closing and reopening the same slot sends none. While that read is held
   (`$V network arm-hold $PAGE duty-rosters/day`) on a fresh slot, the picker reads `Loading roster counts…` above a
   skeleton with no options; release. With `$V network arm-fail $PAGE duty-rosters/day` armed, open another fresh slot:
   the picker reads `Roster counts could not be loaded.` with `Retry` and lists no one until a search, when `able`
   reads `Count unavailable`; searching `baker` still offers nobody. After five seconds open `list_network_requests` still
   shows exactly one day read for it. Restore and press `Retry`: one more read and the counts. Then save an availability
   entry for a pool member covering that day through the Calendar editor, or an assignment on an earlier day through
   `Daily Assignments`, and reopen the slot: one new day read, and the moved count or code shows. While
   `$V network arm-fail $PAGE daily-assignments` is armed, choosing a Person leaves the picker open, the day empty and
   the failure toast visible; restore and press Enter again to save. Read back one A row for the date and
   `typePersonnel`; the day shows the chosen code. Clear it through `Daily Assignments`. Open Group's `+`: its search
   reads `Find group` and lists Groups with no figures, each by its path in a nested tree (`2nd Platoon`,
   `2nd Platoon › 1st Squad`). `Daily Assignments` picks a Group duty from the `Set <type> group` tree button, with
   `No group` set apart to clear it. Close it. A range that is still loading has no `+` (arm
   `$V network arm-hold $PAGE calendar-range`, choose an uncovered month and read the lane before release: no `+`, no
   `N open` or `Full`, and the lane's summary says how many days are assigned is not known yet). As
   `calendarView`, the lanes show the same names, but no day has a `+` or opens an editor. Read the accessibility
   snapshot of Staff's September 15 day: it names
   `Verification Staff Duty for Tuesday, September 15, 2026: SPC Able, Synthetic` without `Edit assignments`, and the
   row marker is not a button. Capture the picker at both combinations and read its bounds against `innerWidth` at 390.
   **No duty.** As `calendarConfigure` in Settings → `Assignment Types`, add a Person type `Temp No duty` with
   `Weekends & holidays` set to `No duty` and a Group type with the same choice made before switching it to Group. On
   Calendar September 2026 the Person lane has a `+` on no weekend, no September 15 closure and no September 18 holiday,
   and its label's `N open` equals the number of `Assign Temp No duty for …` buttons (20 of 30 days, with a lane summary
   of `Temp No duty: 0 of 20 days assigned`). The Group lane keeps all 30 and reads `30 open`. Assign the Person type on
   a Saturday through `Daily Assignments`: that day shows the name and its edit action and the summary reads
   `1 of 21 days assigned`, with `N open` unchanged. Clear it and delete both types. Hold `calendar-range` as above: the
   lanes show no `+` and no count. Read `scrollWidth` against `innerWidth` at 1440, 1024 and 390.
9. **Planner states.** As `calendarOperate` open `Duty planner` on October 2026 at 1440x900 light and at 390x844 dark.
   Do not scroll by script before a capture. Record the document title (`Duty planner - Troop to Task`), the
   `CALENDAR · PLANNING` eyebrow, the `Duty planner` heading, the header's `Today`, then the `Previous month`, month
   button and `Next month` group, then the `Back to calendar` link, the table's name `October 2026 duty assignments`,
   each column header's chip, name, `N OF M DAYS`, `column actions` button and, on a Person type, the `Fill` button with
   its whole label visible and nothing overlapping the name, the Date column's day number, weekday and `TODAY` label,
   page `scrollWidth` against `innerWidth`, and the table's own scroll region (`October 2026 duty assignments`): its
   header stays sticky while the body scrolls, the current month opens scrolled so today's row is in view at both
   combinations without scripted scrolling, and at 390 the `Conflicts` panel sits below the table with
   `Roster · count today` under it. Open days offer a compact dashed `+ Assign` chip, not a full-width button. Read the
   rows' computed treatment: weekend rows are tinted, past rows are at opacity 0.7, today's row has its own fill. Then
   press `Previous month` to September 2026 and record the closure day (September 15): a tint with its name inline
   beside the weekday, and the two conflict cells on it (a destructive left border and an `ON <status dates>` line),
   with the `Conflicts` heading in the destructive tone beside its count. With the keyboard, focus
   `Find replacement for Verification Staff Duty, Tue 15 Sept`, press Enter, move to `SPC Unassigned` with ArrowDown and
   press Enter: the picker closes and focus lands on that slot's table cell button
   (`Verification Staff Duty, Tue 15 Sept: SPC Unassigned…`), not on the removed `Find replacement` button. Restore Able
   through the same cell's picker and read back the seeded rows. For loading, arm
   `$V network arm-hold $PAGE calendar-range`, click `Next month` until an uncovered month requests a range, capture
   `Loading assignments for this month...` with its bounds and no cells, then release and restore. Repeat step 4 at both
   combinations and record the failure region and Retry bounds against the viewport. For a failed save, see step 8. For
   keyboard, Tab from `Today` through the navigation, `Back to calendar`, each column's actions button and the first
   rows' cells, recording each stop's name and visible ring. Open one cell with the keyboard, press Escape and record
   where focus lands (back on the cell). Open `<type> column actions`, close it with Escape and with `Cancel`, and open
   `Clear month`, closing it once with Escape and once with `Cancel`, recording focus and unchanged rows each time. As
   `calendarView` and `manager`, open the planner route at both combinations and record the denial with no cell or
   navigation. As `calendarScoped`, record no `Roster · count today` panel, no `duty-rosters` request in
   `list_network_requests`, no `Fill` button in any column header, a column menu that opens `Quick fill` directly, and
   that a Person cell offers only Alpha people, and that the Group options in a Group cell's picker, `Quick fill`, the
   month view's lane picker and the Group select in `Daily Assignments` list only Alpha. For the large roster, run
   `$V seed bulk-501`, reload the planner five times and record the first cell paint, long tasks, DOM element count and
   the `__data.json` and `calendar-range` request counts, and that each newly opened picker slot adds one
   `duty-rosters/day` read and reopening a slot adds none. Then run `clean-seeds`.

10. **Failed clear in the day dialog.** As `calendarOperate`, use an empty date to save one Person assignment through
    the Calendar date-header `Daily Assignments` dialog. Record its exact saved row, reopen the same date and arm
    `$V feedback arm $PAGE` and `$V network arm-fail $PAGE daily-assignments`. Clear that slot through its visible
    `Clear selection` control. Require one matched `DELETE` with synthetic `503`, visible error feedback, the original
    selection restored, and the exact saved row unchanged. Save the feedback and network receipts before reloading.
    Restore both controls, reload, reopen the date and confirm the saved selection remains. Clear it again without the
    fault, then reload and verify only that temporary slot is absent. This is client failure and rollback proof. SQL
    suites separately prove transactional removal. A failure released after leaving its Organization must not toast in
    the new context; use the late-response store checks and [Organization switching](organization-switching.md) for that
    boundary.

11. **Roster counts.** As `calendarOperate` open `Duty planner` on October 2026 at 1440x900 light and at 390x844 dark,
    and record `list_network_requests`: the month's `calendar-range` read and
    `duty-rosters?today=<YYYY-MM-DD>&month=2026-10` start together, and moving a month sends that month's range read and
    roster read again together. The heading reads `Roster · count today`. With no October details yet, the Staff table
    `Verification Staff Duty roster` lists `SPC Able` and `SPC Unassigned` with count 0 and the footer
    `SPC Baker is excused. Open the DA 6 to see every number.`, whose link opens the Staff DA 6 at `?month=2026-10`
    (`2026-11` after `Next month`); Retiring lists Baker muted as `A 0` (accessible text `0, A: Verification Training`)
    while the training entry covers today. Compare the counts with
    `GET /org/<orgA>/api/duty-rosters?today=…&month=2026-10` in the signed-in page. Click the type's code in the
    `Duty roster` toggle group; pressing the active code again keeps it selected, and switching type adds no request.
    Assign Unassigned to the Staff slot on today through the planner: one `daily-assignments` POST, then one
    `duty-rosters` read, after which Unassigned reads `Today` (accessible `, count 1`). Clear it and require 0 again.
    For loading, arm `$V network arm-hold $PAGE duty-rosters` and reload: the panel shows `Loading roster counts` with
    skeleton rows while every `Assign` cell is already usable; release. For failure, arm
    `$V network arm-fail $PAGE duty-rosters` and reload: the panel reads `Roster counts could not be loaded.` with
    `Retry roster counts`, the grid still saves; restore and press Retry to recover the counts. Separately, with counts
    already loaded, arm the same `duty-rosters` failure and save a temporary assignment. The saved cell updates, the old
    counts stay visible with `These counts may miss the latest change.` and `Refresh`. Restore, press `Refresh` and
    compare refreshed counts with the saved assignment; remove that assignment. The default fixture has
    10 or fewer rows, so the panel shows no `Show all` button. For the large roster, run `$V seed bulk-501`, reload and
    require 10 rows with `Show all <N>`; press it and require the rest with the button now `Show fewer`; switching type
    folds it again. Then `clean-seeds` and reload.

12. **Fill from roster.** As `calendarOperate` on October 2026 at 1440x900 light, click
    `Fill Verification Staff Duty from roster`, the `Fill` button beside the column's day count; it reads `true` for
    `aria-expanded` while open, and Escape returns focus to it. `Verification Staff Duty column actions` opens
    `Quick fill` instead, whose `Fill from roster` link switches to the same popover. The popover is named
    `Fill from roster, Verification Staff Duty`, with `First day` on tomorrow and `Last day` on October 31, the open-day
    count under them, and a preview of the picks (`Day`, `Next up`, `Count`): starting from no details, Able then
    Unassigned alternating, the first pick at count 1 and the rest at 2 and up, five rows with
    `<n> more through 31 Oct`. The button reads `Fill <open days> days`. Change `First day` and require a fresh preview.
    The popover ends with `Open the DA 6`, linking to this roster's DA 6 for the shown month; a Group duty's header has
    no `Fill` button and its menu has no such link. Before committing, send an authenticated POST from the signed-in
    page that saves Unassigned on the second day of the range; then click `Fill`: the server answers `409`, the popover
    stays open with `The roster changed since this preview. Review the new picks and fill again.`, one
    `calendar-range?…&collections=assignments` read puts the saved day in the grid, and a new preview leaves that day
    out. With `$V network arm-fail $PAGE calendar-range` armed before that `Fill`, the re-read fails instead: above the
    grid `The roster changed, and this month's assignments could not be read again. Assigning waits until they load.`
    shows with `Retry`, and every cell, column action and `Find replacement` is disabled. Restore and press `Retry`: one
    range read, the banner leaves and the saved day shows. A refused replacement re-reads the same way. Click `Fill`
    again: the popover closes, the grid shows every pick, and `$V rows daily_assignments orgA` shows one row per pick
    with `source` `roster` and the manual day unchanged as `manual`. On Retiring, where Able sits in the Staff pool too,
    a pick on a day Able holds Staff duty reads `Skipped SPC Able (<n>). On Verification Staff Duty, count runs.` Assign
    Able to Retiring on a day Able holds Staff duty: both cells read `unavailable: … Duty (D)` and `Conflicts` lists
    them with `is on Verification Retiring Duty (D).` Capture the column headers and the Fill popover at 900x800 and
    390x844 dark: the `Fill` label stays visible, the type name and count truncate rather than overlap the buttons, and
    the popover bounds read: at least 8px inside each viewport edge. As `calendarScoped`, the column menu opens
    `Quick fill`, and an authenticated `POST /org/<orgA>/api/duty-rosters/fill/preview` or `/fill` returns `403` with
    nothing written. Clear the month's rows through `Clear month` before leaving.

13. **Find replacement.** The dates below are a weekday template, not fixed fixture dates. Before starting, choose a
    future month and a Friday F with all nine days F through F+8 in that month. Substitute F for 23 Oct, F+1 for 24 Oct,
    through F+8 for 31 Oct in every control name, request and readback in the ordinary-fixture portion below. The later
    `workload large` portion keeps its own fixture dates. Preflight an empty Staff/Retiring range and record existing
    availability before adding any; clear only the temporary assignments and availability created by this step.
    Roster fill cannot start before the browser's today. As `calendarOperate` at 1440x900 light, fill Verification Staff
    Duty from F through F+8 with `Fill 9 days` (Able first, then Unassigned, alternating), hand-assign Able on Fri 30 Oct
    through its cell's picker, and add Verification Leave for Able on 25 Oct (an authenticated `POST /api/availability` is fine
    setup). Reload. `Conflicts` lists `SPC Able, Synthetic is on Verification Leave (A).` Focus
    `Find replacement for Verification Staff Duty, Sun 25 Oct` and press Enter. A dialog named
    `Replace SPC Able, Verification Staff Duty, Sun 25 Oct` opens right of the 25 Oct cell without covering it, with
    `Able is on Verification Leave, so their count holds at 1 and they keep their place in line.` and that nobody gets
    an extra turn The `Next up on the Verification Staff Duty roster` radio group has one checked radio,
    `SPC Unassigned, count 1, next up, Verification Staff Duty the day before · Verification Staff Duty the next day`,
    which holds focus once the preview loads. `Can't pull 25 Oct` lists `SPC Able · Verification Leave, holds at 1` with
    an `A` chip. `Also re-picks 5 planned days` lists 26 MON Unassigned → Able, 27 TUE Able → Unassigned, 28 WED
    Unassigned → Able, 29 THU Able → Unassigned and 31 SAT Able → Unassigned, then
    `Days you assigned by hand stay put.`; 30 Oct is absent. Under the footer buttons, a two-line note that is
    `Someone else`'s accessible description reads
    `Someone else re-picks the later roster days too. To change only this day, click the name in the planner.` Tab
    cycles Someone else, Cancel, Assign Unassigned and the radio without leaving the dialog; Escape closes it and focus
    returns to `Find replacement`. With `$V network arm-hold $PAGE duty-rosters/replacement/preview` armed, reopening
    shows `Loading the roster` skeleton rows and a disabled `Assign`; release. With
    `$V network arm-fail $PAGE duty-rosters/replacement/preview`, the dialog reads the failure with `Retry preview`;
    restore and Retry. `Someone else` opens the duty picker `Verification Staff Duty, Sun 25 Oct` with `Find person`
    focused, without Able or `Clear assignment`, and under its title the two-line description
    `A pick here re-picks the later roster days too. To change only this day, click the name in the planner.`; Escape
    returns to the dialog. Clicking the 25 Oct name in the grid, from the dialog or from that picker, opens the plain
    picker for that day alone, with no description. For a pick off the roster, set Retiring's pool to MOS 68W (an
    authenticated `PUT api/assignment-types/roster` as `orgOwner`, restoring `poolRules:null` afterwards), fill it and
    open `Find replacement` on one of its conflicts (Able's 25 Oct Leave makes one): `Someone else`, search `Baker` and
    choose `SPC Baker, Synthetic, not on this roster`. The dialog returns with the radio `SPC Baker, Not on this roster`
    checked and the re-picks the server previewed for Baker (`selected` is Baker), and `Assign Baker` writes Baker on
    that day as `manual` with the re-picked days `roster`. Reopen and hold the commit with
    `$V network arm-hold $PAGE duty-rosters/replacement`: `Assign Unassigned` reads busy, every grid cell is disabled
    and the title still names Able; release. The dialog closes, focus lands on
    `Verification Staff Duty, Sun 25 Oct: SPC Unassigned, Synthetic`, and `$V rows daily_assignments orgA` shows 25
    Unassigned `roster`, 26 Able, 27 Unassigned, 28 Able, 29 Unassigned and 31 Unassigned `roster`, 30 Able `manual`.
    For drift, add Leave for Unassigned on 27 Oct, open its `Find replacement` (`Also re-picks 2 planned days`, 28 and
    29), then send an authenticated `POST /api/daily-assignments` that hand-assigns Able on 29 Oct and press
    `Assign Able`: the server answers `409`, the dialog stays open with
    `The roster changed since this preview. Review the new picks and try again.` and `Also re-picks 1 planned day`.
    Assign again: 27 Able `roster`, 28 Unassigned `roster`, 29 and 30 Able `manual`. As `calendarScoped`, an
    authenticated `POST /duty-rosters/replacement/preview` or `/replacement` returns `403` with nothing written. For
    candidates and widths, `$V seed workload large` and `actor perfWide calendar large`: clear November Staff Duty,
    `Fill 30 days`, return to October and open `Find replacement for Staff Duty, Thu 22 Oct`. The list holds every
    available pool member by count with `CPT Baker184` next up; ArrowDown to `CPT Carter185` shows `Loading re-picks`,
    then `Also re-picks 22 planned days` starting `1 SUN CPT Carter185 → CPT Irwin191`, and `Assign Carter185` writes
    them: November then reads Irwin191, Reyes356, Smith123, Vance282, Zimmer078 and Carter003 on 1 to 6 Nov. Open
    `Find replacement for Staff Duty, Sat 31 Oct` at 900x800 (the dialog flips left of the cell) and 390x844 (below the
    cell, at least 8 px inside each viewport edge); neither covers the cell.

14. **Before the DA 6.** On a fresh `$V seed da6` (its people have attribute history from 30 days before d0, so past
    days have a pool), as `calendarConfigure` open `Duty planner` on d0's month at 1440x900. On Staff Duty's `+ Assign`
    two days before d0 the picker's description reads
    `Counts. Saving moves this roster's DA 6 start from <d0> back to this day. Fill from roster counts it.` and lists
    the eight seeded people at count 1 in DA 6 order, Grant first. In `Roster · count today` choose `SD`: Okafor through
    Diaz read 1 with Grant `Today`. Search `diaz` and press Enter: `$V rows daily_assignments orgA date <d-2>` shows one
    `manual` row for Diaz, the panel reads Okafor through Ortiz 2 and Diaz 1, and the Staff Duty DA 6 reads From d-2.
    For a running roster, edit Charge of Quarters to `Separate count` in Settings → `Assignment Types` and confirm
    `Start a new DA 6?` (its new form opens d1 after a closed one). Its picker two days before d0 reads
    `Not counted, before this roster's DA 6 (starts <d1>). The DA 6 and Fill from roster leave it out.` and lists
    everyone not excused in name order without counts. Save Kim there: an authenticated `GET /day` for d1 returns the
    same standing before and after clearing that entry through its picker, and its open form still starts d1. On
    Calendar, Verification Staff Duty's form starts at the fixture's 15 September assignment, and the fixture people
    have no history before d0: its picker for 14 September reads
    `Not counted, as no one on this roster is detailed this day. Saving still moves its DA 6 start from Tue 15 Sept back to this day.`
    and lists everyone. Switch on `Show Staff Duty on the calendar` and open Staff Duty's lane picker before its start:
    it reads `Counts.` like the planner's. Capture both surfaces at 900x800 and 390x844 dark: the picker keeps at least
    8px inside each viewport edge, and one opening above a mid-screen cell shrinks its list rather than clipping its
    title. While `$V network arm-hold $PAGE duty-rosters/day` holds the read, the picker shows `Loading roster counts…`
    and no description; release.

15. **Swap duty days.** On a fresh `$V seed da6` as `calendarConfigure` (an Organization-wide operator) at 1440x900
    light, open `Duty planner` on d0's month. Pick Staff Duty days X and Y, both after today and held by different
    people, and read `Roster · count today` for `SD` and the Staff Duty DA 6 grid, remarks (`None.`) and all counts.
    Open X's picker: `Swap with…` sits above `Clear assignment`. With `$V network arm-hold $PAGE duty-rosters/swap`
    armed, choose it. A dialog named `Swap Staff Duty, <X>` opens right of X's cell without covering it, and the
    `Swap with` region shows five skeleton rows (`Loading days to swap with`) with `Swap days` disabled and
    `Choose a day to see both days after the swap.` below. Release: the list arrives in the same region (its height does
    not change, nor the dialog's) with every other filled detail day held by someone else, each a radio named
    `<day>, <rank> <last name>` plus any warning. Restore, then `$V network arm-fail $PAGE duty-rosters/swap` and
    reopen: the region reads the server message with `Retry` and the grid stays usable; restore and press `Retry` and
    the list arrives. Choose Y. `After the swap` lists X `<holder of X> → <holder of Y>` and Y the reverse, with
    `Numbers on the DA 6 stay as published.`; add Verification Leave for the holder of Y on X first (an authenticated
    `POST /api/availability` is fine setup, then reload) and the preview adds `<name> · Verification Leave (A) on <X>`
    with an `A` chip, and the option row carries it too. Press `Swap days`: the dialog closes, focus lands on X's cell,
    both cells show the new people and an exchange mark titled `swapped with <Y>, held by <name>`, the cell names end
    `swapped with <Y>, held by <name>`, and `$V rows daily_assignments orgA` shows the two rows keeping their IDs with
    the people exchanged. `Roster · count today` and every cell of the DA 6 equal the earlier reading; the remarks read
    `(1) <rank> <last> and <rank> <last> exchanged <X> and <Y>. Numbers as published.` (`<d> Mon` style, for example
    `12 and 19 Oct`), in the open form. Open X's picker: it names the other day, offers `Undo swap` and no `Swap with…`,
    and says `Saving another person or clearing this day ends the swap.` Choose `Undo swap`: both people are back, the
    marks and the remark are gone and the counts are unchanged. Swap again, then in X's picker choose a third person:
    the warning is in the picker before the choice; after it the mark on both days and the remark are gone, X holds the
    third person, Y keeps its swapped holder, and the DA 6 counts follow the holders. Open `Clear month` on a swapped
    roster: the confirmation adds `This ends 1 duty swap`. A day before today shows no `Swap with…`; a past swap shows
    no `Undo swap`. For the 409, open X's `Swap with…` and choose Y, then in a second page send an authenticated
    `POST /api/daily-assignments` that assigns a third person to Y and press `Swap days`: the server answers `409`, the
    dialog stays open with `The roster changed since this preview. Review the days and try again.`, the list reloads
    without Y, and one `calendar-range?…&collections=assignments` read puts the saved day in the grid. If the second
    page instead assigns a third person to X, the reloaded dialog names that person in its title and preview and clears
    the chosen day; choosing Y again and pressing `Swap days` saves. At 900x800 and 390x844 dark the dialog sits beside
    the cell on whichever side has room (left of it at 900, above it at 390), never over it, and choosing a day whose
    preview carries two warnings does not move or resize it; it stays at least 8 px inside each viewport edge with
    `document.documentElement.scrollWidth` equal to `innerWidth`. As `calendarScoped` no cell offers `Swap with…`, no
    swap request is sent, and an authenticated `GET /org/<orgA>/api/duty-rosters/swap` returns `403`.

The Dashboard's Unfilled `Fill N days` action saves its days through the same `/batch` request; the saved names must
appear in this Calendar lane and the planner after reload ([Dashboard actions](dashboard.md#actions)).

The assignment write endpoints are `/org/<orgA>/api/daily-assignments` with `POST {date,assignmentTypeId,assigneeId}` or
`DELETE {date,assignmentTypeId}`, and `/batch` with `POST {records:[{date,assignmentTypeId,assigneeId}]}`. The roster
endpoints are `GET /org/<orgA>/api/duty-rosters?today=YYYY-MM-DD&month=YYYY-MM` (counts today, the month's detail days
and conflicts), `GET /day?typeId=…&date=YYYY-MM-DD&today=YYYY-MM-DD` (the standing going into a detail day,
`{track:null,pool}` on any other day, `null` for a type with no open form; before the open form, `formStartsOn` with the
standing as if the form began that day when saving would count, else `{track:null,formStartsOn,movesStart}`), and
`POST /fill/preview {typeId,today,from,through}` and `POST /fill` with the same fields plus `picks:[{date,personId}]`,
which returns `409` when the roster changed. `GET /swap?typeId=…&today=…&date=…` lists the days the date can trade with
and any A, D or U warning on the two new placements; `POST /swap {today,days:[{assignmentTypeId,date,was}×2]}` exchanges
the two days and returns `409` when either holder changed, and `DELETE /swap {today,swapId}` undoes it. Any later write
that reassigns or clears a swapped day ends the swap. `POST /replacement/preview {typeId,today,date,assigneeId?}`
previews a replacement for the chosen person or, without one, the rule's pick; `POST /replacement` adds `assigneeId`,
`replacing` and `repicks:[{date,was,personId}]` (`was` is who held the day in the preview) and returns `409` when the
plan differs, any `was` changed, or a day is left unfilled. Saved rows carry `source` (`manual` or `roster`); the server
sets it and no client request names it. Use the signed-in page's read-only `evaluate_script` only for response
inspection or an authenticated request probe; actual planning actions use the visible controls. Read provider rows only
through the owned helper. [Calendar navigation](calendar-navigation.md), [Calendar access](calendar-access.md),
[Organization switching](organization-switching.md), and [Reports and history](reports-history.md) own the adjacent
range/scope/report journeys.

## Gotchas

- Malformed assignment and availability dates and ids are driven in [Invalid input](invalid-input.md); a rejected batch
  writes no record.
- The picker's suggestions may be visible in the screenshot but absent from the accessibility snapshot (the listbox
  reads `Suggestions...`). Fill `Find person` (or `Find group`) and press native `Enter`, or `ArrowDown` first to reach
  the second option, and read the saved assignee ID. Click another cell while a picker is open and focus can move to the
  dialog itself; `fill` the combobox's uid to type.
- Reassigning an occupied Person or Group slot updates its row in place. Require the same `id` and `created_at` after
  changing the assignee and reloading, with an identity-specific `daily_assignment.updated` audit. Re-selecting the
  current assignee sends no save request and writes no audit. Unrelated Group and seeded rows remain intact.
- Reloading the planner opens the month in the `ttt-calendar-anchor-date` cookie, the last month either Calendar view
  showed. With no cookie, or 30 days after the last move, it opens the current month. Use `Today` or `Previous month`
  before rereading another month's slots. The store opens on the first of the cookie's month, so a day-31 anchor, which
  the shared navigation steps from the first of the month, is not reachable from the planner and is proved in
  `CalendarPeriodNavigation.test.ts`.
- The column menu's `Assignee` is a native select, so `fill` it with the option's text (`SPC Able, Synthetic`), and
  `Days` is a radio group. The button names the count (`Fill 20 days`) and stays disabled until an assignee is chosen.
- `actor` can reuse a page's client store from before a seed or `clean-seeds`, so the panel may list the old rows.
  `navigate_page` reload before reading counts.
- The planner table does not show the archived type. Do not delete or rewrite the seeded September 15 rows during
  routine slot checks.
- Migration `20261023001100` preserves surviving slot identities in the shared transactional replacement RPC. Verify
  single, clear, day and batch writes; ordinary UI saves alone do not prove rollback or serialization. The SQL failure
  and concurrent-writer suites establish those database properties in an isolated provider.
- Empty-Group availability writes must return `403` with unchanged saved rows. Bulk Add must retain only failed People
  and the complete draft for an explicit retry; [Bulk status](bulk-status.md) owns that journey. After revoking a
  Calendar grant, require a settled `Access Restricted` page on entry from outside Calendar and on reload (a switch
  between Calendar pages keeps the loaded workspace), then restore the grant and require Calendar to load again.
