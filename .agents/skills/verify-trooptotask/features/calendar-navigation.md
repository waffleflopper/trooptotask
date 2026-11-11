# Calendar navigation

A member moves through the availability calendar, narrows the people shown, and switches between the agenda, week,
month and long-range views.

## Sub-features

- `calendar-entry`: enter Calendar from organization navigation.
- `calendar-month`: move with `Today`, `Previous month`, the month picker on the title and `Next month`; the same
  controls drive the Duty planner's month.
- `calendar-range`: switch between `Agenda`, `Week`, `Month` and `3-Month` with `Calendar view` in the title row, at
  every width. Below 641px the Calendar opens on `Agenda`; at 641px and wider it opens on `Month`. Only the opening view
  follows the width: resizing never switches it and a reload opens on the width's view again.
- `calendar-week`: `Week` is the month grid over the seven days of one Monday-start week, titled `9–15 Nov 2026` (or
  `27 Oct – 2 Nov 2026` across a month edge) with `Previous week` and `Next week`. It fits 390px with no horizontal
  scroll.
- `calendar-agenda`: `Agenda` lists the same week day by day. Each day shows its date, a Special Day's name, `N available`
  and only the people who are out or on duty, one row per person with that day's statuses and duties together; a duty
  whose person is out carries the conflict mark and reason. A day with no one says `No one out or on duty.` It follows
  the group filter and the reader's scope and shows the entries the month grid shows.
- `calendar-toolbar`: as the page narrows, `Duty planner`, `Reports`, `Display`, `Events & Taskings` (when enabled)
  and the group filter fold into `More Calendar controls` in that order while `Bulk Status` stays on the row; `Settings`
  and the exports always live in More, after any folded controls.
- `calendar-filter`: narrow the grid with the group filter, which lists the reader's top-level Groups and shows a picked
  Group's whole subtree, or with the searchbox. The picked Group is remembered per person and Organization.
- `calendar-today`: on load and on `Today` the grid scrolls so today's column sits just right of the personnel column,
  unless it is already fully visible.
- `calendar-saved-range`: the fixed September statuses and closure render in month and long range, and the historical
  March status remains reachable.
- `calendar-picker-keyboard`: ArrowLeft changes focused month and Escape dismisses the picker.
- `calendar-workspace-reuse`: moving between Calendar, Assignments, Bulk Status and Settings keeps the loaded workspace
  and sends no page-data request.
- `calendar-range-retry`: an additional-range failure shows a retry and a later successful load restores local data.
- `calendar-stream-range`: pages wait for initial streamed data before loading additional ranges or accepting workspace
  actions.
- `calendar-grid-appearance`: month and long-range grids keep their title row, date columns, group bands, status bars
  and their labels, markers and legend at 1280 light and 390 dark without page overflow, and a 31-day month fits at 1440
  without horizontal scroll.
- `calendar-grid-keyboard`: Tab reaches the title row, the toolbar, date headers, lane days, group controls and Person
  names, then a row's day cells, then its status bars, `+N` buttons and (for assignment managers) row marker chips in
  order; Enter and Space activate them.
- `calendar-grid-groups`: a group collapses and expands, a collapsed group shows how many of its People are out each
  day, and a pin moves the group first and survives reload. Unpinned bands follow the Organization's Group order, not
  the alphabet. Nested Groups draw as indented sub-bands under their parent's own people (step 19).
- `calendar-grid-affordances`: a view-only member's day cells, date headers and Person names open no editor, and a
  status bar opens a popover with no actions.
- `calendar-grid-states`: the empty roster and the in-page Access Restricted state fit both widths.
- `calendar-grid-volume`: a large roster keeps virtualized rendering and its request count on load, month navigation and
  long range. When Robert asks for a measurement, step 15's latency harness compares interaction latency between
  revisions.
- `calendar-read-window`: a month's assignment and closure read covers only the shown days. Its availability read covers
  the shown days, and also today when today falls in the 90 days before them, for the title row's count. The server
  bootstrap reaches back to the day before its UTC day. A move requests only the part of each not yet loaded. `Week`
  and `Agenda` cover the Monday to Sunday shown the same way: a week inside the loaded months sends no request, and one
  that straddles the edge requests only its missing days.
- `calendar-reload-anchor`: a reload opens the month the page last showed, the month the server bootstrapped, with no
  range read.
- `calendar-markers`: Events, Suspenses and picked execution dates on the Month and 3-Month views behind the
  `Events & Taskings` switch; see [Events and Taskings](events-taskings.md#calendar-markers).
- `calendar-lane-display`: `Show Days`, `Show Events & Suspenses` and `Show Assignments` each hide only their lanes
  (all on by default), save per user and Organization and survive a reload. Weekend, holiday and closure shading stays
  with Days hidden. Hiding Events & Suspenses also hides the header suspense diamonds and the legend's `Suspense` entry.
  `3-Month` has only Events and Suspenses lanes, so Days and Assignments change nothing there.
- `calendar-reentry`: after leaving Calendar and coming back, another member's deletes and edits show; a save or delete
  confirmed while the new workspace snapshot was in flight survives it, including over another member's row the server
  replaced in the same slot; entries outside the snapshot's range stay.

## How to get to it (user POV)

Sign in with Calendar access and choose `Calendar` in the sidebar. The title row holds the eyebrow
(`Calendar · <Organization> · N personnel`) and the page title, which is the month/year button (opens the month picker;
heading level 1, e.g. `October 2026`), then `Previous month`, `Next month` and `Today` in that order, today's
`N of M available` count while today is in the loaded range, and `Calendar view` (`Agenda`, `Week`, `Month`,
`3-Month`). In `Week` and `Agenda` the title names the week and the arrows are `Previous week` and `Next week`. The Duty
planner's header (title `Duty planner`) carries `Today`, then a group of `Previous month`, the month/year button and
`Next month`, then `Back to calendar`, from the same shared component with only the month view. In `3-Month` the title
names the quarter and the arrows are `Previous 3 months` and `Next 3 months`. The `Calendar controls` toolbar below it
holds `Calendar group filter`, the personnel searchbox, `Events & Taskings` (when enabled, with a need-action badge),
`Duty planner` (assignment managers), `Reports`, `Display`,
`More Calendar controls` and the pinned `Bulk Status` menu. `Events & Taskings` opens `/calendar/taskings`;
`Bulk Status` includes `Import spreadsheet`, which opens `/calendar/import`. `Display` holds `Show Onboarding` (when onboarding People
exist), `Show Status Text`, `Show Personnel Roles`, `Show Days`, `Show Events & Suspenses` (only when Events & Taskings is
on) and `Show Assignments` as checkboxes that keep the menu open. `More Calendar controls`
always holds `Settings` (configure access), `Export to Excel` and `Download PDF`; the exports cover the shown quarter in
`3-Month`. The legend under the grid lists statuses; in `Month` it adds `Duty (codes)` for Person duties and, for people
who can add availability, `Drag across days to add`. A narrow page moves more controls into More; see
[Find a toolbar control on the row or in More](shared-ui.md#find-a-toolbar-control-on-the-row-or-in-more).

## Helper controls

When the date grid lacks a unique snapshot UID, use evaluation only to click the visible button in the named Person row
and recorded day; never invoke app handlers or alter app state directly.

Calendar actors include `calendarView`, `calendarOperate`, `calendarConfigure`, `calendarLane`, `calendarScoped`,
`calendarEmpty`, `calendarScopedConfig`, `calendarSwitch`, and `calendarConfigureSwitch`. The last actor can configure
Calendar in both Organizations.

```bash
$V actor calendarLane calendar # provider session; returns pageId and Organization ID
$V network arm-fail 2 calendar-range # one scoped synthetic 503; use the actual page ID
```

## Driving it with verify:app

Preconditions: doctor passes; `$V fixture` supplies fixed September/March records and the local current date. Restore
filters and request controls between cases.

1. Run `$V actor calendarOperate personnel`; keep its page ID as `PAGE`. From the fresh snapshot, click the sidebar
   `Calendar` link, then confirm the `/calendar` route and visible `Alpha`, `Bravo`, and `Unassigned` personnel groups.
2. Calendar and the planner open on the month either view last showed (the `ttt-calendar-anchor-date` cookie, for up to
   30 days after the last move; then the current month). Click `Today` first, then capture the current month title.
   Click `Next month` from a new snapshot and confirm the month advances. Click `Today` and confirm the title returns to
   the current month; test `Previous month` similarly. Use the month/year button to inspect the picker and dismiss it
   without changing the month when testing cancel.
3. Click `3-Month` in `Calendar view` and confirm the long-range view appears with `3-Month` checked, the quarter in the
   title, `Next 3 months` beside it and a legend of statuses only. Click `Month` to return. Open `Display` and confirm
   the display toggles; open `More Calendar controls` and confirm both exports are there. Capture each export with
   `$V export arm $PAGE`, the visible `Export to Excel` or `Download PDF` item, `$V export save $PAGE FILE` and
   `$V export restore $PAGE`: both produce a downloaded Blob (`.xlsx`, and a jsPDF PDF whose Month and 3-Month titles
   read `October 2026` and `October 2026 – December 2026`). `Download PDF` never fires `beforeprint`, so `$V print`
   observes nothing for it. Read the PDF with `pdftotext -layout` or `pdftoppm`, and the workbook with
   `$V workbook FILE 'October 2026'`. The PDF draws the screen's bars: one bar per entry labeled with its status and
   length when it fits (Able's three-day Leave reads `VER · 3D`), overlapping entries in the screen's lanes, and Person
   duty codes on the Month PDF. Each page repeats the heading, carries a legend of the printed statuses, duties and
   closures, and ends with `Page N of M`. The workbook keeps per-day cells.
4. Open `Calendar group filter` (`Group: All`) and select `Alpha (1)`; confirm Able remains while Baker is absent and
   the address is unchanged. Clear the filter and confirm both groups return. Fill the searchbox with `Able`, confirm
   Baker is absent, then focus it and press `Control+A` followed by `Backspace` with `tool press_key`. Confirm all
   groups return; an empty native `fill` can leave the previous filter applied.
5. With the filter clear, click the month/year label, choose September 2026, and capture the named Able, Baker and
   Unassigned rows and `Verification Unit Closure` (a `Days` lane segment under the date headers, with a tint and the
   closure name as the title of its date header). Able's `Verification Leave` bar covers September 14–16 and Baker's
   `Verification Training` bar September 15; a bar's accessible name carries its note (`Alpha seeded leave`,
   `Bravo seeded training`), which is not drawn on a bar of three days or fewer. Unassigned has leave that day. Click
   `3-Month` and confirm these bars by accessible name in the September–November view; the closure there has no `Days`
   lane, so read the closure's date header `title`. Move `Previous 3 months` twice: March–May shows the one
   `Historical retained` leave day. Move forward twice and confirm the September facts return. Wait for the range to
   settle; a loading label is not proof. In September–November, select an October date header: expect Month showing
   October with the route unchanged. Restore September before continuing. Open `Bulk Status` and follow `Import spreadsheet`
   to `/calendar/import`, then return to Calendar. When enabled, follow `Events & Taskings` to `/calendar/taskings`
   and return; its badge counts taskings needing action.
6. Open the `Month and year picker`; record the focused month, press `ArrowLeft` through `tool press_key`, confirm focus
   moves, then press `Escape` and confirm the dialog closes without changing the selected month. Capture before/after
   snapshots.
7. On an uncovered long-range request, arm `$V network arm-fail $PAGE calendar-range`, then use `3-Month` or
   `Next 3 months`. Capture `Additional calendar data is temporarily unavailable.` and `Retry calendar load`, plus
   `$V network state $PAGE` showing the synthetic `503`. Click `Retry calendar load`; expect a real `200`, local
   statuses and no foreign labels. Restore with `$V network restore $PAGE` even if the drive fails.
8. For workspace reuse, as `calendarConfigure` on a settled `/calendar`, clear resource timings, then use visible
   controls to visit `Duty planner`, the `Calendar` link, `Bulk Status` → `Add Bulk`, the `Calendar` link, and
   `More Calendar controls` → `Settings`. Read the page-data probe from the skill's Drive section after each stop:
   expect no `__data.json` entry. Then click `Reports` and expect one `calendar/reports/__data.json` whose Calendar
   layout digit is `0`. Separate `calendar-range` requests are range loads, not workspace reloads.
9. For streamed workspace readiness, start `calendarOperate` on Personnel and arm
   `$V server-source arm availability_entries hold 1 120000` before choosing Calendar. Confirm `server-source state`
   reports the real bootstrap read held. Capture `Loading Calendar data`, absent workspace controls and no new
   `calendar-range` request while the source is held. Release with `$V server-source release`, wait for the workspace
   controls, then choose `3-Month` and capture the completed additional-range response. Switch back to month view,
   select September 2026 and confirm the saved Able, Baker and Unassigned statuses and closure from step 5, with a
   second visible read. Restore with `$V server-source restore`. This controls response order in the owned app; it does
   not simulate a production outage. Delivery tests gate each delayed stream and cover cancellation after denial;
   Calendar range tests cover authoritative replacement and empty results.

10. **Grid appearance.** As `calendarOperate` on a settled `/calendar`, use `resize_page` for 1280x800 and the visible
    **Toggle theme** for light. Choose September 2026 and capture: the title row (eyebrow, month/year, `Previous month`,
    `Next month`, `Today`, the availability count on the current month, `Calendar view`), the toolbar, date headers with
    weekday and day, weekend shading, the `Days` lane with `Verification Unit Closure` and the closure's tinted date
    header, the light `ALPHA`, `BRAVO` and `UNASSIGNED` group bands with `Pin`, Person rows with rank and name, status
    bars (the short label on one-day bars, the status name on bars of two or three days, the name then its note only on
    longer bars or with `Show Status Text` on, a chevron where an entry crosses the month edge, two lanes and a `+N`
    where entries overlap), the assignment lanes under the dates (their labels, day cells and the Days lane), the
    September 15 row marker inside its own day cell, and the legend (statuses, `Duty (codes)`, then
    `Drag across days to add` at the end). Read `document.documentElement.scrollWidth` against `innerWidth` and the
    first group band's computed background and text color. At 1440x900 on October 2026 read `.calendar-body`
    `scrollWidth` against `clientWidth` (equal: the 31 days fit) and one date header's width (about 31px beside a 160px
    personnel column). Return to September 2026, choose `3-Month` and capture the September–November grid the same way:
    day numbers head each Monday and the first column, and bars carry the status name where they have room. Repeat both
    views at 390x844 dark. Navigate to the current month and capture the today column once per combination.
11. **Grid keyboard.** On the September 2026 month grid, click the month/year button twice to open and close the picker,
    then press Tab repeatedly and read `document.activeElement`'s text and `aria-pressed` after each press with
    read-only evaluation. Record the order through the month/year title, `Previous month`, `Next month`, `Today`,
    `Calendar view`, the toolbar, the date headers, each assignment lane's day buttons, the first group's toggle and
    `Pin`, the first Person name, that Person's day cells, then the row's status bars, `+N` buttons and row marker chips
    (focusable only for assignment managers; for other members they are hidden from the snapshot). On the September 15
    date header press Enter: `Daily Assignments` opens for that date; press Escape and record the focused element. On
    the first group toggle press Enter: its Person rows disappear; press Enter again to restore them. On Able's
    September 14 cell press Enter: `Set Personnel Status` opens for Able and that date; press Escape. Tab on to Able's
    `Verification Leave` bar and press Enter: its popover opens with focus inside; press Escape and confirm focus
    returns to the bar. Visible focus must show on each control.
12. **Groups and pins.** Click `BRAVO`'s `Pin`: it reads `Pinned` with `aria-pressed="true"` and the Bravo band moves
    first. Reload; the pin and order persist. Click `Pinned` to unpin, reload, and confirm the original order. As
    `calendarScoped`, whose whole view is Alpha, Calendar draws no `ALPHA` band and no `Pin`. Back as the first actor,
    click the `ALPHA` band to collapse it: Able disappears and the band shows `−N` under each day where N of its People
    are out (blank for none; the snapshot reads `<date>: N out`). Click it again to restore. After a Group editor
    reorder (see [Group order everywhere](manage-groups.md#group-order-everywhere)), unpinned bands follow the saved
    order: with Bravo moved above Alpha, sidebar navigation shows `BRAVO`, `ALPHA`, `UNASSIGNED`.
13. **View-only affordances.** As `calendarView`, choose September 2026 and click an empty day in Able's row, the
    September 15 date header and Able's name. No dialog opens. Click Able's `Verification Leave` bar: its popover shows
    the status, dates and note with no `Edit details`, `Remove` or resize handles, and a drag across empty days draws no
    selection. Record which toolbar actions are present: no `Bulk Status` or `Duty planner`, and no
    `Drag across days to add` in the legend.
14. **Empty and denied states.** As `calendarEmpty`, capture the grid at 1280 light and 390 dark; record whether
    `No personnel added yet` renders. For the in-page denied state, as `calendarOperate` on a settled `/calendar`, run
    `$V calendar-grant calendarOperate none`, then reach Calendar through the attempted path. The workspace-level
    `Access Restricted` card is the reachable denial; the in-page `CalendarPageView` card has no known route and stays
    unverified unless a run reaches it, so record which card renders. At 390 read the card's `getBoundingClientRect()`
    left and right against `innerWidth`. Restore with `$V calendar-grant calendarOperate restore`.
15. **Large-grid volume.** Run `$V seed bulk-501` (501 extra Alpha People) at 1280 light as `calendarOperate`, then
    reload `/calendar`. Read the rendered `[data-slot="date-cell"]` and `.virtual-row` counts, the total Person count,
    and `performance.getEntriesByType('resource')` grouped by `__data.json`, `calendar-range` and other. Then clear
    resource timings and, three times each, click `Next month`, then `Previous month`, and switch to `3-Month` and back.
    After each settles, read the same counts. Run `clean-seeds` afterward. Only when Robert asks for a measurement
    ([Definition of Done](../../../../docs/architecture/DEFINITION_OF_DONE.md#reproducible-performance-evidence)), also
    time each step from click to the settled month label, with a `performance.mark` set just before the native click and
    a `requestAnimationFrame` after the label changes, record a `performance_start_trace` with reload for the month
    load, and use the latency harness below.
    - **Latency harness (with availability, on request only).** `bulk-501` has no availability, so it measures roster
      and row cost only. `$V seed availability-volume` creates 501 People (201 Alpha, 200 Bravo, 100 Unassigned, named
      `Volume000`–`Volume500`) and about 616 entries across the previous, current and next month: 150 People with none,
      165 with one, 107 with two, 79 with three; about 140 one-day and 220 multi-week entries; 20 People with an
      overlapping pair; 10 whose entry crosses a month edge. The mix is fixed by seed `1684` and the local date, so each
      revision sees the same shape. After `launch`, `doctor` and the seed, run
      `node .agents/skills/verify-trooptotask/helpers/calendar-interaction-bench.mjs run --worker N --label A --out DIR`.
      It signs in as `calendarOperate`, sets 1440x900 light, reloads, refuses a dev server or a roster under 500, and
      then runs 2 warm-ups plus 9 measured repetitions of each interaction: search keystroke and clear, group filter
      (Bravo, then All), Next and Prev inside the loaded range, Next and Prev past it (each repetition one month
      further, so each makes a `calendar-range` request), Month to 3-Month and back, the availability modal opened from
      a day cell, and the first status bar's popover (`popover`, which fails with `no availability bar on this revision`
      before bars; a repetition counts only when that bar reports `aria-expanded="true"` and a popover it newly opened
      is visible, so a stale dialog cannot satisfy it). Every repetition marks `performance.now()` before the DOM event
      and again at the second `requestAnimationFrame` after the expected change is on screen, and records `JS+DOM` time
      to the end of the microtask flush, long tasks, requests by kind and the node counts. A repetition whose change
      never renders is an error and leaves the sample. The frame time is quantized to the display's 16.7 ms, so compare
      medians and ranges, and read the `JS+DOM` column for differences below one frame. `--cpu-throttle 4` slows the
      page's CPU by that factor so a sub-frame difference shows as several frames; label those runs separately. The run
      closes its page unless `--keep-page true` or `--page ID`; a page it leaves open gets its CPU throttle reset. Both
      happen even when the run fails. The harness drives DOM events from the page (the search value, a click, and the
      Select's pointer events) rather than CDP input.
    - **Compare revisions.** `summarize A=a1.json B=b1.json A=a2.json B=b2.json` pools repetitions per label. For a fair
      A/B, launch and seed each revision on its own worker (or `restart` one worker), run them alternately (A, B, A, B)
      with `--label` set, and note `uptime` before each run, since a busy machine moves every row. Run `clean-seeds` and
      `cleanup` afterward. For the limiter, start `performance_start_trace` on the page, repeat the slowest interaction
      by hand once, stop it with `filePath`, and keep that run out of the table.
16. **Two-member re-entry.** A is `calendarConfigure` and B is `calendarConfigureSwitch`, each signed in with
    `actor ... calendar`. Re-entry means leaving Calendar for Personnel and choosing the sidebar `Calendar` link; the
    page-data probe shows the Calendar layout digit `1`. Read status bar names in snapshots, after re-entry and again
    after reload.
    - **Another member's changes.** With A on Personnel, B removes Baker's October 14 `Verification Retiring Status`,
      removes `Verification Unit Closure` in Settings → Holidays & closures and edits the note on Baker's October 13–15
      training. Confirm the deletes and the new note with `rows`. After re-entry A must show neither deleted row and
      must show the new note.
    - **Held snapshot.** Calendar shows `Loading Calendar data` until every streamed source settles, so A starts the
      change on Calendar before leaving. Arm `$V network arm-hold-dispatch $PAGE availability` (or `special-days` or
      `daily-assignments`), submit an add or a delete, and leave with native `navigate_page` `back`; an open modal
      blocks the sidebar. Set a `window` marker first and read it on Personnel to prove a client-side navigation. Arm
      `$V server-source arm availability_entries hold 1 120000` (or `special_days` or `daily_assignments`; hold the
      source of the store under test, since each store applies as its own read streams), choose `Calendar` and require
      `server-source state` `held` with a provider `200`. Run `network release`: `network state` must show the real
      `200` and `rows` the saved or deleted row while the snapshot is still held. Then `server-source release` and read
      A's cell. Saves and deletes must both survive, for a status, a closure and a daily assignment. For the daily
      assignment, a variant has B replace that slot's assignee before A's held set or clear is released: the snapshot
      then carries B's row, and A's slot must show only A's saved assignee, or stay empty after a clear. Store and
      hydrator tests cover this replacement for a set, a clear and a Planner batch. Restore both controls.
    - **Outside the range.** Visit March 2026 and see `Historical retained`, return with `Today`, then re-enter. The
      snapshot covers assignments and closures from the anchor month through the month after it, and availability from
      the anchor month, or from the earliest viewer day in the 90 days before it when that day is earlier, through the
      same end. A viewer's day is the server's UTC day or the day either side of it. Arm
      `$V network arm-hold $PAGE calendar-range`, choose March in the month picker and read Able's March 11 while the
      range is held: the entry loaded before re-entry must still render.

17. **Read window.** As `calendarOperate` on `/calendar/assignments` (the planner and Calendar each own a range
    coordinator, so moving between them reads the new page's range again), clear resource timings, then read the
    `calendar-range` URLs after each move. Each read names its collections. Availability and assignments with their
    closures both cover the shown month, so a move into an unread month requests it once with
    `collections=availability%2Cassignments`. From an October 2026 bootstrap, `Previous month` into September requests
    `rangeStart=2026-09-01&rangeEnd=2026-09-30&collections=availability%2Cassignments`, and August requests `2026-08-01`
    to `2026-08-31` the same way. `Next month` past the loaded end requests `rangeStart=2026-12-01&rangeEnd=2026-12-31`,
    then January 2027. An Organization-wide planner also reads `duty-rosters?today=<viewer's day>&month=<YYYY-MM>`
    beside each move's range read, never after it. `Today` from a December bootstrap requests
    `rangeStart=2026-10-01&rangeEnd=<two days before the server's day>&collections=availability` and
    `rangeStart=2026-10-01&rangeEnd=2026-10-31&collections=assignments`, because that bootstrap's availability starts
    the day before the server's day (with the server on October 22, the availability read ends on October 20). A read is
    split into spans of at most 366 days, and a move inside coverage sends no request. Until the displayed month's span
    has loaded the lanes and the planner offer no `+` or `Assign` button. Arm `$V network arm-hold $PAGE calendar-range`
    first and release afterwards.
18. **Reload anchor.** As `calendarOperate` on `/calendar` in `Month`, click `Today`, then `Next month` twice to
    December 2026 and clear resource timings. Reload: the title reads `December 2026`, `document.cookie` holds
    `ttt-calendar-anchor-date=2026-12-01`, and no `calendar-range` request follows. Click `Today` and reload again: the
    title reads the current month.
19. **Nested Groups.** With the [nested Group tree](manage-groups.md#nested-group-tree) seeded, as `orgOwner` at
    1440x900 open `Calendar group filter`. A `verbose` snapshot lists `Group: All`, `2nd Platoon (9)`, `Alpha (1)`,
    `Bravo (1)` and `Unassigned (1)`, and no sub-group. Click the `2nd Platoon (9)` option UID: the trigger reads
    `2nd Platoon (9)`, the address is unchanged, nine rows remain and the bands run `0: 2nd Platoon 9 Pin`,
    `1: 1st Squad 6`, `2: Alpha Team 4`, `2: Bravo Team 1`, `1: 2nd Squad 1`, with Diaz and Webb under the top band
    before `1st Squad`. At 1024x640 and 390x844 the bands are the same, the filter sits in `More Calendar controls` at
    390, and `scrollWidth` equals the viewport. With `Group: All`, `Calendar display` → `Show sub-groups` off draws one
    band per top-level Group, `0: 2nd Platoon`, `0: Alpha`, `0: Bravo`, `0: Unassigned`, each holding its whole
    subtree in name order with no count; on, it adds `1: 1st Squad 6`, `2: Alpha Team 4`, `2: Bravo Team 1` and
    `1: 2nd Squad 1` under `2nd Platoon 9`. Reports → Availability → `Group` offers `2nd Platoon`, `Alpha` and `Bravo` (`Group: 3`). With `Display` → `Show
sub-groups` on, the Group by day grid lists each top-level Group with its sub-groups beneath, then a Total row; off
    it lists only the top-level rows and Total. Cell tiers come from the exact available fraction: blank at 80% or more,
    amber at 50% or more, red below. The Total row counts available People over all People for each day, not a mean of
    row percentages. Reports → Time away → `Group` offers the same
    three top-level Groups; checking only `2nd Platoon` selects 9 of 12 personnel, and the by-Group rows count all nine.
    These nested-Group values are source-mapped from the seed, not re-driven on the redesigned page.

20. **Lane display.** As `calendarConfigure` on Calendar September 2026 at 1440x900, 1024x768 and 390x844, record the
    `[data-lane-kind]` lanes and the date-header rects. Choose `Display` → `Show Days`, reload and read
    `$V rows user_org_preferences orgA`: `calendar.showDaysLane` is false for this user alone, the Days lane is gone, the
    person rows move up by exactly its height (26px, 24px under 641px), the header rects are unchanged, and weekends,
    the September 15 closure and the September 18 holiday keep their tint in the headers and the rows. Turn it back on:
    the row offset returns to zero. Repeat for `Show Assignments` (the assignment lanes go) and `Show Events &
Suspenses` with a suspense due in the month (the Events lane and the header diamonds go, the legend loses
    `Suspense` and keeps `Tasking commitment` and `Commitment conflict`). Turn all three off: no lane remains and
    `scrollWidth` equals `innerWidth`. In `3-Month`, `Show Days` and `Show Assignments` off change nothing, and
    `Show Events & Suspenses` off leaves no lanes. As `calendarConfigureSwitch` in Organization B every lane is on and no
    preference row exists. Open the `New closure` composer in Settings with `Show Days` off: its preview still has a
    Days lane. With Events & Taskings off, `Display` has no `Show Events & Suspenses`. Opening `Display` closes an open
    suspense card or duty picker. Restore every toggle.

21. **Remembered Group and scroll to today.** As `calendarConfigureSwitch`, choose `Alpha (1)` in `Calendar group filter`.
    `$V preferences calendarConfigureSwitch orgA` shows `calendar.groupFilter` set to `groupA`. Reload: the filter still
    reads Alpha and only Able's band shows. Switch to Organization B through the switcher: it shows `Group: All` and
    B's own row stays empty. Arm `$V network arm-fail $PAGE user-preferences` with `$V feedback arm $PAGE`, pick another
    Group, and require the 503, one error toast and the saved row unchanged; the choice stays on screen until reload,
    which shows the saved Group. Arm `arm-hold`, pick a Group, switch Organization before `release`, release and read
    both Organizations' rows: A holds the pick and B has none. For scroll, narrow the viewport until today's column is
    off screen (about 220px of grid), reload, and read `scrollLeft` of the month body and the header: they match and
    today's column starts at the personnel column's right edge. Scroll away, click `Today`: it returns without a jump,
    in `Month` and in `3-Month`. At widths where today is already visible nothing moves. Click `Today` on the current
    month: the grid still scrolls, because the click is its own request.
22. **Week and Agenda at 390, 768 and 1280.** As `calendarOperate` on `/calendar` with `Group: All`, `resize_page` to
    390x844 and reload: the `Calendar view` group reads `Agenda`, `Week`, `Month`, `3-Month` inside the title row with no
    horizontal page scroll (`document.documentElement.scrollWidth` equals the viewport), `Agenda` is checked, the title
    names the current week and the arrows read `Previous week` and `Next week`. Each day's card shows its date, a Special
    Day's name, `N available` and only the people out or on duty; a day with no one says `No one out or on duty.`
    Resize to 1280x800 without reloading: `Agenda` stays checked and nothing switches. Reload at 1280: `Month` is
    checked. Click `Week`: the title reads like `9–15 Nov 2026`, the grid shows seven day columns and the same
    status bars, duty codes and conflict marks the month shows for those days. At 390x844 click `Week` and read
    `scrollWidth` of the page and of the grid's scroller: both equal the viewport, with the 120px name column and
    seven day columns visible. At 768x1024 repeat `Agenda` and `Week` and confirm the layout holds. Click
    `Next week` and `Previous week` and confirm the week moves by seven days; click `Today` and confirm today's week.
    In `Agenda` click a status: the same entry popover as the month's bar opens with the status, dates and note. As a
    reader who can edit assignments, click a duty: the Daily Assignments editor opens for that date; a view-only reader
    sees the duty as text.
23. **Week and Agenda match the month.** Pick September 2026 and a week with overlapping statuses and a duty (the fixed
    September records). Record, in `Month`, each Person's status entries and duty codes for that week's days, then
    read `Week` and `Agenda` for the same week: the same people carry the same entries and duties, and a person outside
    the picked Group or the reader's scope appears in none of the three. Choose `Alpha (1)` in `Calendar group filter`:
    all three views change the same way and the pick survives a reload (see step 21). Compare entries by accessible
    name, not by row counts.
24. **Week read window and in-place states.** As `calendarOperate`, clear resource timings in `Week` on a week inside
    the loaded months and click `Next week` within them: no `calendar-range` request. Step to a week that straddles
    the loaded edge: one read of only the missing days (`collections=availability%2Cassignments`, or one of them).
    Arm `$V network arm-hold $PAGE calendar-range` and step to an unread week: the `Week` or `Agenda` body shows its
    skeleton in place while the title row and toolbar stay, then release. Arm `$V network arm-fail $PAGE
calendar-range` and step again: the body is replaced by `Additional calendar data is temporarily unavailable.` with
    `Retry calendar load`, never a broken page. `Retry calendar load` reads again and restores the week.

## Gotchas

- Sweep `Calendar controls` as `calendarOperate` or `calendarConfigure`. `calendarView` has no `duty-planner` or
  `bulk-status`, so the sweep fails its start check at any `--from`. Use
  `$V toolbar-sweep PAGE "Calendar controls" RUN_DIR --expect duty-planner,calendar-reports,calendar-display,calendar-events,group --pinned bulk-status --search --more-always --step 4`
  when `Events & Taskings` is enabled; otherwise omit `calendar-events` from `--expect`. Folding widths depend on the
  controls present; retain the sweep's observed widths rather than assuming fixed thresholds.
- The shared navigation steps from the first day of the displayed month, so a day-31 anchor (March 31) goes to February
  1 and April 1; that case lives in `CalendarPeriodNavigation.test.ts`, because a month move lands on the first of the
  month, so no live month route displays a day-31 anchor.
- A page keeps its anchor cookie across sign-ins in the same browser context, so a drive that left an actor on September
  reopens there. Press `Today` before a step that starts from the current month.
- Month labels depend on the test date; compare before and after instead of hardcoding September 2026.
- Month day cells are named `RANK Last, First, Weekday, Month D, YYYY` and long-range day numbers by their full date, so
  a cell can be found by name in a snapshot. Use named toolbar controls for navigation and the latest snapshot for any
  cell interaction.
- If the Group select's options are absent from the accessibility snapshot, open the named filter and use native
  `press_key` with `ArrowDown`/`ArrowUp` and `Enter`. Confirm the selected label and resulting Person rows after it
  settles; a DOM `.click()` on its custom option does not reliably select it.
- Use `$V fixture` for the fixed dates and today's local date; a current-month screenshot does not establish the
  September or March records.
- Arm the range failure before requesting an uncovered range. A cached range may not call the endpoint, so record
  `network state` before claiming a failure was exercised. Range coverage restarts each time `/calendar` mounts,
  including a return from another Calendar page.
- `calendarOperate` is a synthetic fixture role accepted by `login`; it has Calendar access that the ordinary `manager`
  fixture does not.
- For load, range change, 3-Month search and assignment save timing at 20/100/400 People, use the
  [performance recipe](performance.md). The large-grid steps above stay the `bulk-501` volume check.
