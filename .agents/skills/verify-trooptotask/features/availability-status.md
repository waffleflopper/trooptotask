# Availability status

A Calendar operator inspects a Soldier's status, changes its note or date range, adds another status, or removes one, with the result visible again after reload.

## Sub-features

- `status-view`: open a calendar cell and inspect its current status and dates.
- `status-edit`: edit the status and save or cancel.
- `status-add`: add a new status through the visible form.
- `status-remove`: remove a status through the visible action.
- `status-persist`: confirm a saved change through a second Calendar read.
- `status-failed-add`: if operation permission disappears before save, no row or premature success appears and the member sees an error.
- `status-failed-edit`: the original saved row and ID survive a failed in-place edit with a visible error.

## How to get to it (user POV)

Sign in with Calendar operation access, choose `Calendar`, and select a day cell in a person's row. A status cell such as `VERIFICATION LEAVE` opens `Set Personnel Status` with the person and date, current status, `Edit status`, `Remove status`, and `Add Another Status` controls.

## Driving it with verify:app

1. Run `$V actor calendarOperate calendar` and record `PAGE`. For seeded leave, use the month/year picker to reach September 2026 and choose Able's September 14–16 cell. The dialog identifies the person/day and shows `Verification Leave`, its range and `Alpha seeded leave`. For mutation use Able's unoccupied cell on today's `ui` date from `$V fixture`; capture the visible Person/day before editing.
2. Click `Edit status`. The dialog changes to `Edit Status` with `Status Type *`, `Start Date *`, `End Date *`, `Note`, `Cancel Edit`, and `Update Status`. Click `Cancel Edit` to confirm the original status returns unchanged.
3. In the unoccupied Able/day modal select `Verification Leave`, keep the one-day date range, and fill a unique note. Before `Add Status`, use `$V calendar-grant calendarOperate view`; submit from the still-open form. Capture the error and absence of an `added —` success, and `$V rows availability_entries orgA note "$NOTE"` showing zero rows. Restore with `$V calendar-grant calendarOperate restore`, reload, and reopen the day before another action.
4. Add the same unique note with operation access. Capture the action, result and `$V rows availability_entries orgA note "$NOTE"`: exactly one row for `personA`, `statusLeave`, today's start/end date. Reload, reopen, and confirm the note visibly persists.
5. Choose `Edit status`, fill a different note, narrow access to `view` while the editor stays open, and click `Update Status`. Capture `Could not save status`, the original note still shown, no `updated —` success, and the original row ID/fields unchanged in `rows`. Restore access, reload, edit again, then save. Confirm the new note uses the **same ID**, with exactly one matching row and the chosen Person/type/date. Reload and confirm the visible note.
6. Click `Remove status`; capture the explicit `Remove this status entry` confirmation, then `Remove`. Reload and reopen: the note and row are absent. `$V rows availability_entries orgA id <historical-id>` must still show the unrelated March record. Use only the unique entry created in this run for removal.

## Gotchas

- A person/day cell's accessible name can reflect several overlapping statuses. Identify the person row and date together before choosing a UID.
- The month grid may give the same accessible name to several day buttons. If so, inspect the visible `.personnel-row` containing `Able, Synthetic` and click its `[data-slot="date-cell"]` button at the selected day index through narrowly scoped `evaluate_script`; then verify the modal's Person and date before saving.
- Date pickers and status-type options are live UI; snapshot each opened list/dialog before choosing a value.
- `Cancel Edit` returns to `Add Another Status`; it does not close the whole dialog. Use `Close` to return to the grid.
- Permission changes are made only on this disposable worker. Always restore the Calendar grant after a failed iteration; a doctor pass does not restore a member's capability.
