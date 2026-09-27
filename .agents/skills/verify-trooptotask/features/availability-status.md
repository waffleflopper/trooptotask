# Availability status

A Calendar operator inspects a Soldier's status, changes its note or date range, adds another status, or removes one, with the result visible again after reload.

## Sub-features

- `status-view`: open a calendar cell and inspect its current status and dates.
- `status-edit`: edit the status and save or cancel.
- `status-add`: add a new status through the visible form.
- `status-remove`: remove a status through the visible action.
- `status-persist`: confirm a saved change through a second Calendar read.

## How to get to it (user POV)

Sign in with Calendar operation access, choose `Calendar`, and select a day cell in a person's row. A status cell such as `VERIFICATION LEAVE` opens `Set Personnel Status` with the person and date, current status, `Edit status`, `Remove status`, and `Add Another Status` controls.

## Driving it with verify:app

1. Run `npm run --silent verify:app -- login calendarOperate`, then choose `Calendar` from the sidebar. Take a snapshot and choose a `VERIFICATION LEAVE` cell in the `SPC Able, Synthetic` row. The dialog identifies the person and day and shows `Verification Leave`, its date range, and note `Alpha seeded leave`.
2. Click `Edit status`. The dialog changes to `Edit Status` with `Status Type *`, `Start Date *`, `End Date *`, `Note`, `Cancel Edit`, and `Update Status`. Click `Cancel Edit` to confirm the original status returns unchanged.
3. For a saved edit, reopen `Edit status`, fill `Note` with a unique synthetic note, click `Update Status`, and capture the result. Close the dialog, reload the page with `tool navigate_page`, reopen the same person/day cell, and confirm the note remains.
4. For add/remove coverage, use an unoccupied synthetic day cell for the same person. Select `Status Type *`, choose a visible type, set `Start Date *` and `End Date *`, fill `Note`, and click `Add Status`. Reopen after reload to confirm it, then use `Remove status` and its visible confirmation; reopen once more to confirm absence. Preserve the seeded status used in step 1.

## Gotchas

- A person/day cell's accessible name can reflect several overlapping statuses. Identify the person row and date together before choosing a UID.
- Date pickers and status-type options are live UI; snapshot each opened list/dialog before choosing a value.
- `Cancel Edit` returns to `Add Another Status`; it does not close the whole dialog. Use `Close` to return to the grid.
