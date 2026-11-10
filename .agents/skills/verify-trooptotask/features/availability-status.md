# Availability status

A Calendar operator inspects a Soldier's status, changes its note or date range, adds another status, or removes one,
with the result visible again after reload.

## Sub-features

- `status-view`: open a status bar and inspect its status, dates and note in the bar popover.
- `status-edit`: open `Edit details` from the popover, edit the status and save or cancel.
- `status-add`: add a new status through the visible form opened from an empty day.
- `status-quick-add`: drag across empty days in a person's month row and pick a status by click or number key.
- `status-touch-add`: on a touch screen, tap a start day then an end day in one person's month row and pick a status
  from the same quick-add popover.
- `status-resize`: drag a selected bar's end to change its dates in place.
- `status-remember`: the editor and quick-add start on the last status this person added in this Organization.
- `status-save-close`: `Save and close` saves a status and closes the editor; `Add Status` saves and stays open.
- `status-remove`: remove a status through the popover's inline confirmation.
- `status-undo`: the `added —` and `Status removed` toasts carry `Undo` for 10 seconds. Undo of an add deletes exactly
  the row the add wrote. Undo of a removal asks the server to put back what the removal deleted. The server keeps that
  record for 30 seconds, for the member who removed it only. The row returns under its own ID with the values it had
  when it was deleted, including any edit made after the remover's page loaded, and with its Tasking link. A same-status
  overlap since, an ID that exists again, or a record past its window is reported and left alone. Updates offer no Undo.
- `status-persist`: confirm a saved change through a second Calendar read.
- `status-failed-add`: if operation permission disappears before save, no row or premature success appears and the
  member sees an error.
- `status-failed-edit`: the original saved row and ID survive a failed in-place edit with a visible error.

## How to get to it (user POV)

Sign in with Calendar operation access and choose `Calendar`. Each entry draws as one bar across its days, named
`RANK Last, First, Status, D to D Month YYYY, N days, Note`. Clicking a bar opens a popover with the status, dates and
note plus `Edit details` and `Remove`; the bar shows end handles while it is selected. Clicking an empty day opens
`Set Personnel Status` for that person and date; clicking the person's name opens it for today. Dragging across empty
days draws a dashed `N days` box and opens `Add status, <range>` with the status types numbered 1 to 9 and
`Add a note or edit dates…`. On a touch screen
(`pointer: coarse`) tapping a day arms it as the start, drawn as a dashed `1 day` box, and tapping a second day in the
same row opens that same `Add status, <range>` popover. A row with more than two
overlapping entries ends its bottom lane with a `+N` button that lists the rest.

### Helper controls

```bash
$V rows availability_entries orgA note 'Unique synthetic note'
$V network arm-hold 2 availability # hold a real response after persistence
$V network arm-hold-dispatch 2 availability # hold a Calendar save or delete before dispatch; release sends it
$V network arm-drop 2 availability # persist one create, update or remove, then lose its reply (any method)
$V pointer drag 2 'EXACT_LOADED_URL' '[data-edge="end"]' '[data-person-id="ID"] [data-day="9"]' # real pointer drag by CSS selector
$V pointer touch 2 'EXACT_LOADED_URL' '[data-person-id="ID"] [data-day="9"]' '[data-person-id="ID"] [data-day="9"]' # trusted touch tap; two selectors swipe
```

## Driving it with verify:app

Preconditions: `$V fixture` supplies the Person/status IDs and local current date. Use a unique note for added rows and
restore any temporarily narrowed grant.

1. Run `$V actor calendarOperate calendar` and record `PAGE`. For seeded leave, use the month/year picker to reach
   September 2026 and click Able's `Verification Leave, 14 to 16 September 2026, 3 days, Alpha seeded leave` bar. The
   popover `Verification Leave, RANK Able` shows `Mon 14 – Wed 16 Sep · 3 days`, `Alpha seeded leave`, `Edit details`,
   `Remove` and `Drag ends to resize`. Press Escape: it closes and focus returns to the bar. For mutation use Able's
   unoccupied cell on today's `ui` date from `$V fixture`; capture the visible Person/day before editing.
2. Reopen the bar and click `Edit details`. The popover closes and `Set Personnel Status` opens in `Edit Status` with
   `Status Type *`, `Start Date *`, `End Date *`, `Note`, `Cancel Edit`, and `Update Status`. Click `Cancel Edit` to
   confirm the original status returns unchanged, then `Close`.
3. In the unoccupied Able/day modal select `Verification Leave`, keep the one-day date range, and fill a unique note.
   Before `Add Status`, use `$V calendar-grant calendarOperate view`; submit from the still-open form. Capture the error
   and absence of an `added —` success, and `$V rows availability_entries orgA note "$NOTE"` showing zero rows. Restore
   with `$V calendar-grant calendarOperate restore`, reload, and reopen the day before another action.
4. Add the same unique note with operation access. Capture the action, result and
   `$V rows availability_entries orgA note "$NOTE"`: exactly one row for `personA`, `statusLeave`, today's start/end
   date. Reload, click Able's name, and confirm the editor shows today's start/end dates and the saved note.
5. Click the new bar, choose `Edit details`, fill a different note, narrow access to `view` while the editor stays open,
   and click `Update Status`. The `403` is a definite refusal, so the page sends no re-read. Capture one error toast
   carrying the server's permission reason, the editor still open with the draft, the original note still shown on the
   bar, no `updated —` success, and the original row ID/fields unchanged in `rows`. Restore access, reload, edit again,
   then save. Confirm the new note uses the **same ID**, with exactly one matching row and the chosen Person/type/date.
   Reload and confirm the visible note.
6. Click the bar, then `Remove`; capture the inline `Remove Verification Leave, <range>?` with `Remove` and `Cancel`,
   then click `Remove`. Reload: the bar and row are absent. The modal's `Remove status` with its
   `Remove this status entry` confirmation is a second path from an empty day's `Set Personnel Status`.
   `$V rows availability_entries orgA id <historical-id>` must still show the unrelated March record. Use only the
   unique entry created in this run for removal.
7. **Quick add.** On a month row with empty days, native `drag` from one empty day cell to another two or more days
   away. A dashed `N days` box covers the range and `Add status, <range>` opens with the Person and day count. Press `1`
   with `tool press_key`: the popover closes and a bar for the first status appears over exactly those days with an
   `added —` toast. Confirm with `rows` and a reload. Repeat with `Add a note or edit dates…`: `Set Personnel Status`
   opens with the dragged dates. Escape during a drag cancels it with no popover. On a row that already has two
   overlapping entries, a third overlapping add keeps the first-lane bar and folds the other two into `+2` in the bottom
   lane; its button opens `2 more entries, RANK Last` listing both, and choosing one opens that entry's popover.
   **Touch quick add.** Native `click`, `drag` and `emulate` send mouse input, so a tap needs trusted touch events. Run
   `emulate` with `{"pageId":PAGE,"viewport":"390x844x2,mobile,touch"}` and reload; the legend reads
   `Tap two days to add`. Tap with `$V pointer touch PAGE 'EXACT_URL' SELECTOR SELECTOR` (the same selector twice);
   swipe with two different selectors. Pick day cells inside the 390 px viewport (read each `[data-day]` rect). Expect:
   (a) one tap on an empty day draws a dashed `1 day` box on that row, opens no dialog and no `Set Personnel Status`; (b) a horizontal swipe that starts on a day scrolls the grid, draws no box when none
   was armed, and leaves an armed box in place (read `[data-slot="calendar-selection"]`); (c) a second tap in the same
   row on a visible day opens `Add status, <range>` with the right day count; one tap on a
   status adds the bar over exactly those days, three taps in all (`rows` and a reload confirm); (d) a tap in another
   row, on a bar, on a person's name or on Next month clears the box (a bar still opens its popover); (e) Escape
   clears it. Remove the added entry through the bar popover afterwards.
8. **Resize.** Click a bar created in this run: `Drag ends to resize` shows in its popover and the bar draws a grip at
   each end it owns (none where it crosses the month edge, none in 3-Month, and none on the bars of people the member
   cannot manage). Capture that state. Grips are hidden from the accessibility tree, so native `drag` cannot reach them.
   Drag one with real pointer input by selector:
   `$V pointer drag PAGE 'EXACT_URL' '[data-edge="end"]' '[data-person-id="PERSON_ID"] [data-day="N"]'`, where `N` is
   the zero-based day of the visible month and the URL is the page's current URL from `list_pages`. Expect an
   `updated —` toast, the bar over the new days, and `rows` showing the same ID with the new end date. Record the dates
   before and after. A drag released on the bar's own edge saves nothing. Clicking the open bar again keeps its popover,
   including an open Remove confirmation.
9. **Appearance.** At 1280x800 light and again at 390x844 dark (visible **Toggle theme**, `resize_page`) capture Able's
   September bar popover and an empty day's `Set Personnel Status` with its Person, date and `Add Status`; at 390 read
   each dialog's `getBoundingClientRect()` against `innerWidth`. Close returns to the grid.
10. **Failed and lost writes.** Create, update and remove all use `/api/availability`, so each control below fits all
    three. Arm `$V network arm-fail $PAGE availability`, then quick-add (press `1`), edit a note through
    `Update Status`, and remove a bar. Expect `Could not save status. Try again.` for the first two (the modal stays
    open on the update) and `Could not remove status. Try again.` for the remove, no new bar, the original bar and note
    unchanged, and `$V network state $PAGE` showing the synthetic `503`. Restore, then arm
    `$V network arm-drop $PAGE availability` and repeat each action once: the provider persists the change but the reply
    is lost, and the bar must still match the saved row after the re-read (`added`, `updated`, `Status removed` toasts;
    no error toast and no duplicate). Arm `arm-hold $PAGE availability` and quick-add: the bar appears at once as a
    pending entry whose popover shows dates and note with no `Edit details`, `Remove` or grips; navigate to Personnel
    while held, `network release`, return to Calendar and expect one real bar and an `added —` toast. Restore every
    control and run `doctor` after any unexpected result. `arm-drop` matches POST, PUT and DELETE.
    **Failed reconciliation.** Restore the network control, open an empty day's editor and fill a unique note. Arm
    `$V network arm-drop $PAGE availability` and `$V server-source arm availability_entries fail-hard 1 120000`, then
    `Add Status`. The write commits but its reply is lost and the follow-up availability read fails. Require the alert
    `Saved status could not be confirmed. Reload the calendar before making another change.`, disabled `Add Status`
    and a `Close` button. Capture `network state` and `server-source state`; restore both controls before `rows`
    confirms exactly one saved row. Close, reload, inspect the saved bar and remove only that unique entry.
11. **Overlaps and the `+N` list.** After `$V seed availability-volume`, search for `Volume040`. Two overlapping entries
    stack in two lanes; a third overlapping day shows a `+2` button, and clicking it opens a dialog named
    `2 more entries, <rank> Volume040` listing each entry. Choosing one opens that entry's popover with `Edit details`
    and `Remove`; Escape returns focus to the `+2` button. Only the run of lower-lane entries that needs a third lane
    folds into `+N`; other bottom-lane entries in the same row stay bars. Run `clean-seeds` afterward.
12. **Busy, scope and focus.** Arm `$V network arm-hold $PAGE availability` and quick-add one status. While it is held,
    a drag on an empty day starts nothing and sends no request. The open bar's grips and its `Drag ends to resize` hint
    disappear until the save settles, and the editor's `Add Status` is disabled. Release and restore. Every entry point
    is disabled while a change settles, so the `Another change is still saving. Try again in a moment.` toast is a guard
    with no live path; `CalendarPageContext.test.ts` proves it. Fixture Scope Sets narrow viewing and managing together,
    so no actor sees a Person it cannot manage. Open the same bar as `calendarView`: the popover has no `Edit details`
    or `Remove` and the page has no `[data-edge]` grip. As `calendarScoped` the Alpha bar shows both grips.
    `Calendar.test.ts` proves the mixed roster. After `Remove` in a popover, focus lands on the person's row instead of
    the page.
13. **Duty chips, today and 3-Month labels.** With a saved Duty assignment on a day a bar covers, the chip sits in the
    bottom lane of that day and the bar moves to the top lane. On a day whose bottom lane already holds a lower bar or a
    `+N`, the lower item keeps the first quarter of that day and the chip the rest, resuming as a second piece on the
    next day when it continues. Only the first piece is a named, focusable button; later pieces open the same entry by
    pointer. Read every bar, `+N` and chip `getBoundingClientRect()` on such a day at the default 36px rows and with the
    46px row preference: no two may intersect, and the chip must be present. Today is a faint column tint, and the
    header keeps its today marker. In 3-Month a bar shows `NAME · ND`, then `ONEDAYLABEL · ND`, then `ONEDAYLABEL`, then
    nothing as it narrows.
14. **Person detail availability.** As `orgOwner` open Able's Details and reload. The record header shows today's status
    as a `Present today` pill (a held status reads `STATUS today` in warning colors) from its own layout stream; a
    viewer without Calendar availability access gets no pill. The Overview's `Next 14 days` section draws the Person's
    statuses, their own and their Group's assignment slots, and DONSA or Holiday closures as one strip from today, with
    a legend line per entry (`<range> · <note>`); with nothing saved it reads
    `Nothing on the Calendar for the next 14 days.` `Open in calendar` opens the Calendar on today's month, even after
    the Calendar last showed December, and rewrites the anchor cookie to it. As `personnelScoped` (Alpha configure, no
    Calendar access) the section is absent, not failed. `$V server-source arm availability_entries hold` holds the
    section on its skeleton while `Needs attention` and the right rail render; `fail` shows
    `Couldn't load the Calendar.` in that section only. Run `$V seed workload small`, then
    `$V actor perfScopedLeader personnel small` (Group-scoped configure). A Person with an entry covering today, such as
    Baker002, shows that status (`Appointment through Oct 19, 2026` on
    2026-10-18) from the single-Person read; scan the roster slugs with
    `<slug>/__data.json?x-sveltekit-invalidated=00011` to find one. A status saved through the Calendar UI appearing
    here is not covered. Run `clean-seeds` after the workload check.

15. **Remembered status and Save and close.** As `calendarConfigureSwitch`, create a uniquely named status type under
    `Settings` → `Status Types` (it sorts last). Open an empty day's `Set Personnel Status`: it starts on the first type.
    Pick the new type with the arrow keys and Enter, then click `Save and close`. The editor closes, the bar and an
    `added —` toast appear, and `$V preferences calendarConfigureSwitch orgA` shows `calendar.lastStatusTypeId` set to
    the new type's ID. Reload and open another empty day: the editor starts on the new type. Click `Add Status`: the entry
    saves, the editor stays open with `Current Status` listing it, and the form still starts on the new type. Drag across
    empty days: the popover lists the remembered type first with shortcut `1`, then the rest in the usual order. Press `2`
    to add another type: the next popover lists that type first, and `lastStatusTypeId` follows. Resizes and
    `Update Status` never change it. Delete only the type this run created (its entries go with it): the stored ID stays
    but the editor starts on the first type again. At 390x844 the footer stacks `Save and close`, `Add Status`, `Cancel`
    in that order inside the dialog; at 1024 they sit in one row. A failed save or lost reply leaves the editor open (see
    step 10). `$V rows user_org_preferences orgB` must have no row for this user until B is used.

16. **Undo.** Use an empty day for Able and a unique note. Arm `$V feedback arm $PAGE` first, and keep the
    toast-to-click path short: the offer lasts 10 seconds and each native call costs about a second. **Add:** `Add Status`,
    capture the `added —` toast with `Undo`, click `Undo` by name. Expect `Status removed again` and
    `$V rows availability_entries orgA note "$NOTE"` returning zero rows. **Remove:** save the status, open its bar,
    `Remove`, confirm, then click `Undo`. Expect `The removed status is back` and one row with the same ID, dates and
    note. **Tasking coverage:** create a Tasking with execution dates and one pick, then add Leave for the pick over every
    execution day from the Tasking's `Set availability…` (see
    [Set availability](events-taskings.md#set-availability)). Its line reads
    `Availability covers every execution day for everyone picked.` and `$V rows availability_entries orgA` shows
    `set_for_tasking_id` equal to the Tasking. On the Calendar, remove that status and click `Undo`. Expect
    `The removed status is back`, the same `set_for_tasking_id` in `rows`, and the Tasking's line reading
    `Availability covers every execution day for everyone picked.` again after a reload. **Changed since:** add a status, open `Edit status` in the still-open
    form, change the note and `Update Status`, then click the older toast's `Undo`. Expect a warning
    `Nothing was undone` with `1 status changed since and was left as it is` (`feedback` records only success and error
    toasts, so capture the warning with a screenshot) and the edited row unchanged in `rows`. A remove whose same
    status was added again over those dates reports the same warning. Repeat Add and Remove at 390x844 with the toast
    clear of the dialog buttons.

## Gotchas

- A drag starts only on a day no bar covers, since the bar takes the press. Pick an empty day for the first cell; the
  drag can then extend across bars.
- A touch start day is armed in memory only: changing the month, the Organization or leaving the Calendar drops it, and
  a pan or `pointercancel` from browser scrolling keeps it. A tap that is not on a day, or whose click lands anywhere
  else, drops it. The legend hint follows `pointer: coarse`, so a desktop browser shows `Drag across days to add`.
- Resize grips render only on a selected bar in Month view, and only for a mouse or pen; touch never offers them.
  Keyboard users change dates through `Edit details`.
- A drag that crosses into another day and returns to its first day before release still opens quick-add, as a one-day
  `Add status, <day>` popover (`<Person> · 1 day`); only a press that never leaves its first day is an ordinary day
  click and opens `Set Personnel Status`.
- The month grid may give the same accessible name to several day buttons. If so, inspect the visible `.personnel-row`
  containing `Able, Synthetic` and click its `[data-slot="date-cell"]` button at the selected day index through narrowly
  scoped `evaluate_script`; then verify the modal's Person and date before saving.
- Date pickers and status-type options are live UI; snapshot each opened list/dialog before choosing a value.
- `Cancel Edit` returns to `Add Another Status`; it does not close the whole dialog. Use `Close` to return to the grid.
- Permission changes are made only on this disposable worker. Always restore the Calendar grant after a failed
  iteration; a doctor pass does not restore a member's capability.

### Viewer day

Launch with `--browser-timezone America/New_York`. Open a cell and set a range from March 1 to March 10, 2026, across
the spring daylight-saving change. Before saving, the form must show `10 days`; after saving, the listed status must
show `(10 days)`. Remove the created row afterward.
