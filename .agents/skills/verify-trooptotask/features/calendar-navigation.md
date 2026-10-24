# Calendar navigation

A member moves through the availability calendar, narrows the people shown, and switches between the month and
long-range views.

## Sub-features

- `calendar-entry`: enter Calendar from organization navigation.
- `calendar-month`: move with `Today`, `Previous month`, the month picker on the title and `Next month`; the same
  controls drive the Duty planner's month.
- `calendar-range`: switch between `Month` and `3-Month` with `Calendar view` in the title row.
- `calendar-toolbar`: as the page narrows, `Duty planner`, `Reports`, `Display` and the group filter fold into
  `More Calendar controls` in that order while `Bulk Status` stays on the row; `Settings` and the exports always live in
  More, after any folded controls.
- `calendar-filter`: narrow the grid with the group filter or searchbox.
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
  the alphabet.
- `calendar-grid-affordances`: a view-only member's day cells, date headers and Person names open no editor, and a
  status bar opens a popover with no actions.
- `calendar-grid-states`: the empty roster and the in-page Access Restricted state fit both widths.
- `calendar-grid-volume`: a large roster keeps virtualized rendering and its request count on load, month navigation and
  long range. When Robert asks for a measurement, step 15's latency harness compares interaction latency between
  revisions.
- `calendar-read-window`: a month's assignment and closure read covers only the shown days. Its availability read covers
  the shown days, and also today when today falls in the 90 days before them, for the title row's count. The server
  bootstrap reaches back to the day before its UTC day. A move requests only the part of each not yet loaded.
- `calendar-reload-anchor`: a reload opens the month the page last showed, the month the server bootstrapped, with no
  range read.
- `calendar-reentry`: after leaving Calendar and coming back, another member's deletes and edits show; a save or delete
  confirmed while the new workspace snapshot was in flight survives it, including over another member's row the server
  replaced in the same slot; entries outside the snapshot's range stay.

## How to get to it (user POV)

Sign in with Calendar access and choose `Calendar` in the sidebar. The title row holds the eyebrow
(`Calendar · <Organization> · N personnel`) and the page title, which is the month/year button (opens the month picker;
heading level 1, e.g. `October 2026`), then `Previous month`, `Next month` and `Today` in that order, today's
`N of M available` count while today is in the loaded range, and `Calendar view` (`Month`, `3-Month`). The Duty
planner's header (title `Duty planner`) carries `Today`, then a group of `Previous month`, the month/year button and
`Next month`, then `Back to calendar`, from the same shared component with only the month view. In `3-Month` the title
names the quarter and the arrows are `Previous 3 months` and `Next 3 months`. The `Calendar controls` toolbar below it
holds `Calendar group filter`, the personnel searchbox, `Duty planner` (assignment managers), `Reports`, `Display`,
`More Calendar controls` and the pinned `Bulk Status` menu. `Display` holds `Show Onboarding` (when onboarding People
exist), `Show Status Text` and `Show Personnel Roles` as checkboxes that keep the menu open. `More Calendar controls`
always holds `Settings` (configure access), `Export to Excel` and `Print / PDF`; the exports cover the shown quarter in
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
   `$V export arm $PAGE`, the visible `Export to Excel` or `Print / PDF` item, `$V export save $PAGE FILE` and
   `$V export restore $PAGE`: both produce a downloaded Blob (`.xlsx`, and a jsPDF PDF whose Month and 3-Month titles
   read `October 2026` and `October 2026 – December 2026`). `Print / PDF` never fires `beforeprint`, so `$V print`
   observes nothing for it. Read the PDF with `pdftotext -layout` or `pdftoppm`, and the workbook with
   `$V workbook FILE 'October 2026'`. The PDF draws the screen's bars: one bar per entry labeled with its status and
   length when it fits (Able's three-day Leave reads `VER · 3D`), overlapping entries in the screen's lanes, and Person
   duty codes on the Month PDF. Each page repeats the heading, carries a legend of the printed statuses, duties and
   closures, and ends with `Page N of M`. The workbook keeps per-day cells.
4. Open `Calendar group filter` and select `Alpha`; confirm Able remains while Baker is absent. Clear the filter and
   confirm both groups return. Fill the searchbox with `Able`, confirm Baker is absent, then focus it and press
   `Control+A` followed by `Backspace` with `tool press_key`. Confirm all groups return; an empty native `fill` can
   leave the previous filter applied.
5. With the filter clear, click the month/year label, choose September 2026, and capture the named Able, Baker and
   Unassigned rows and `Verification Unit Closure` (a `Days` lane segment under the date headers, with a tint and the
   closure name as the title of its date header). Able's `Verification Leave` bar covers September 14–16 and Baker's
   `Verification Training` bar September 15; a bar's accessible name carries its note (`Alpha seeded leave`,
   `Bravo seeded training`), which is not drawn on a bar of three days or fewer. Unassigned has leave that day. Click
   `3-Month` and confirm these bars by accessible name in the September–November view; the closure there has no `Days`
   lane, so read the closure's date header `title`. Move `Previous 3 months` twice: March–May shows the one
   `Historical retained` leave day. Move forward twice and confirm the September facts return. Wait for the range to
   settle; a loading label is not proof.
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
    first. Reload; the pin and order persist. Click `Pinned` to unpin, reload, and confirm the original order. Click the
    `ALPHA` band to collapse it: Able disappears and the band shows `−N` under each day where N of its People are out
    (blank for none; the snapshot reads `<date>: N out`). Click it again to restore. After a Group editor reorder (see
    [Group order everywhere](manage-groups.md#group-order-everywhere)), unpinned bands follow the saved order: with
    Bravo moved above Alpha, sidebar navigation shows `BRAVO`, `ALPHA`, `UNASSIGNED`.
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

## Gotchas

- Sweep `Calendar controls` as `calendarOperate` or `calendarConfigure`. `calendarView` has no `duty-planner` or
  `bulk-status`, so the sweep fails its start check at any `--from`. Use
  `$V toolbar-sweep PAGE "Calendar controls" RUN_DIR --expect duty-planner,calendar-reports,calendar-display,group --pinned bulk-status --search --more-always --step 4`.
  At 900 high, Duty planner folds at about 1072, Reports at about 944, Display at about 844 and the group filter at
  about 468.
- The shared navigation steps from the first day of the displayed month, so a day-31 anchor (March 31) goes to February
  1 and April 1; that case lives in `CalendarPeriodNavigation.test.ts`, because the Calendar store opens on the first of
  the anchor cookie's month, so no live route displays a day-31 anchor.
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
