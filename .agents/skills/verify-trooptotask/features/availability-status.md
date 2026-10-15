# Availability status

A Calendar operator inspects a Soldier's status, changes its note or date range, adds another status, or removes one, with the result visible again after reload.

## Sub-features

- `status-view`: open a status bar and inspect its status, dates and note in the bar popover.
- `status-edit`: open `Edit details` from the popover, edit the status and save or cancel.
- `status-add`: add a new status through the visible form opened from an empty day.
- `status-quick-add`: drag across empty days in a person's month row and pick a status by click or number key.
- `status-resize`: drag a selected bar's end to change its dates in place.
- `status-remove`: remove a status through the popover's inline confirmation.
- `status-persist`: confirm a saved change through a second Calendar read.
- `status-failed-add`: if operation permission disappears before save, no row or premature success appears and the member sees an error.
- `status-failed-edit`: the original saved row and ID survive a failed in-place edit with a visible error.

## How to get to it (user POV)

Sign in with Calendar operation access and choose `Calendar`. Each entry draws as one bar across its days, named `RANK Last, First, Status, D to D Month YYYY, N days, Note`. Clicking a bar opens a popover with the status, dates and note plus `Edit details` and `Remove`; the bar shows end handles while it is selected. Clicking an empty day opens `Set Personnel Status` for that person and date. Dragging across empty days draws a dashed `N days` box and opens `Add status, <range>` with the status types numbered 1 to 9 and `Add a note or edit dates…`. A row with more than two overlapping entries ends its bottom lane with a `+N` button that lists the rest.

## Driving it with verify:app

Preconditions: doctor passes; `$V fixture` supplies the Person/status IDs and local current date. Use a unique note for added rows and restore any temporarily narrowed grant.

1. Run `$V actor calendarOperate calendar` and record `PAGE`. For seeded leave, use the month/year picker to reach September 2026 and click Able's `Verification Leave, 14 to 16 September 2026, 3 days, Alpha seeded leave` bar. The popover `Verification Leave, RANK Able` shows `Mon 14 – Wed 16 Sep · 3 days`, `Alpha seeded leave`, `Edit details`, `Remove` and `Drag ends to resize`. Press Escape: it closes and focus returns to the bar. For mutation use Able's unoccupied cell on today's `ui` date from `$V fixture`; capture the visible Person/day before editing.
2. Reopen the bar and click `Edit details`. The popover closes and `Set Personnel Status` opens in `Edit Status` with `Status Type *`, `Start Date *`, `End Date *`, `Note`, `Cancel Edit`, and `Update Status`. Click `Cancel Edit` to confirm the original status returns unchanged, then `Close`.
3. In the unoccupied Able/day modal select `Verification Leave`, keep the one-day date range, and fill a unique note. Before `Add Status`, use `$V calendar-grant calendarOperate view`; submit from the still-open form. Capture the error and absence of an `added —` success, and `$V rows availability_entries orgA note "$NOTE"` showing zero rows. Restore with `$V calendar-grant calendarOperate restore`, reload, and reopen the day before another action.
4. Add the same unique note with operation access. Capture the action, result and `$V rows availability_entries orgA note "$NOTE"`: exactly one row for `personA`, `statusLeave`, today's start/end date. Reload, reopen, and confirm the note visibly persists.
5. Click the new bar, choose `Edit details`, fill a different note, narrow access to `view` while the editor stays open, and click `Update Status`. Capture `Could not save status`, the original note still shown, no `updated —` success, and the original row ID/fields unchanged in `rows`. Restore access, reload, edit again, then save. Confirm the new note uses the **same ID**, with exactly one matching row and the chosen Person/type/date. Reload and confirm the visible note.
6. Click the bar, then `Remove`; capture the inline `Remove Verification Leave, <range>?` with `Remove` and `Cancel`, then click `Remove`. Reload: the bar and row are absent. The modal's `Remove status` with its `Remove this status entry` confirmation remains a second path from an empty day's `Set Personnel Status`. `$V rows availability_entries orgA id <historical-id>` must still show the unrelated March record. Use only the unique entry created in this run for removal.
7. **Quick add.** On a month row with empty days, native `drag` from one empty day cell to another two or more days away. A dashed `N days` box covers the range and `Add status, <range>` opens with the Person and day count. Press `1` with `tool press_key`: the popover closes and a bar for the first status appears over exactly those days with an `added —` toast. Confirm with `rows` and a reload. Repeat with `Add a note or edit dates…`: `Set Personnel Status` opens with the dragged dates. Escape during a drag cancels it with no popover. On a row that already has two overlapping entries, a third overlapping add keeps the first-lane bar and folds the other two into `+2` in the bottom lane; its button opens `2 more entries, RANK Last` listing both, and choosing one opens that entry's popover.
8. **Resize.** Click a bar created in this run: `Drag ends to resize` shows in its popover and the bar draws a grip at each end it owns (none where it crosses the month edge, none for a view-only member, none in 3-Month). Capture that state. The native toolkit cannot drag a grip, because `drag` needs snapshot UIDs and the grips are hidden from the accessibility tree, and `click_at` is not enabled. Record the drag itself as unverified on the real surface; `CalendarPageView.svelte.test.ts` drives the press, move and release and asserts the saved range, and `calendarGesture.test.ts` covers clamping, the no-change release and cancel.
9. **Appearance.** At 1280x800 light and again at 390x844 dark (visible **Toggle theme**, `resize_page`) capture Able's September bar popover and an empty day's `Set Personnel Status` with its Person, date and `Add Status`; at 390 read each dialog's `getBoundingClientRect()` against `innerWidth`. Close returns to the grid.

## Gotchas

- A drag starts only on a day no bar covers, since the bar takes the press. Pick an empty day for the first cell; the drag can then extend across bars.
- Resize grips render only on a selected bar in Month view, and only for a mouse or pen; touch never offers them.
- The month grid may give the same accessible name to several day buttons. If so, inspect the visible `.personnel-row` containing `Able, Synthetic` and click its `[data-slot="date-cell"]` button at the selected day index through narrowly scoped `evaluate_script`; then verify the modal's Person and date before saving.
- Date pickers and status-type options are live UI; snapshot each opened list/dialog before choosing a value.
- `Cancel Edit` returns to `Add Another Status`; it does not close the whole dialog. Use `Close` to return to the grid.
- Permission changes are made only on this disposable worker. Always restore the Calendar grant after a failed iteration; a doctor pass does not restore a member's capability.
