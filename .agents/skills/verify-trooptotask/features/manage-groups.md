# Manage groups

A manager adds, renames, or removes organization groups from the Personnel roster and checks that saved changes survive a fresh read.

## Sub-features

- `groups-open`: open the group-management dialog from Personnel.
- `groups-add`: create a uniquely named group.
- `groups-edit`: rename an existing group.
- `groups-remove`: remove a group after the visible confirmation path.
- `groups-persist`: reopen the dialog after reload to confirm the stored list.

## How to get to it (user POV)

Sign in as a member with Personnel configuration access, choose `Personnel`, then `Manage Groups`. In the dialog, type into `Organization groups` and choose `Add`; each saved group has `Edit <name>` and `Remove <name>` actions. Choose `Done` to return to the roster.

## Driving it with verify:app

1. Run `npm run --silent verify:app -- login manager`; record its page ID as `PAGE`. Save a before snapshot. Choose the UID for `Manage Groups` and call `tool click`; expect the `Manage Groups` dialog with `Alpha`, `Bravo`, `Organization groups`, and a disabled `Add` button.
2. Set `NAME="Map Proof $(date +%s)"`. From the dialog's fresh snapshot, use `tool fill` on its `Organization groups` textbox with `NAME`; `Add` becomes enabled. Click its fresh UID. The dialog now lists `NAME` with `Edit NAME` and `Remove NAME` buttons.
3. Save an after snapshot and screenshot. Click `Done`, then `tool navigate_page` with `{"pageId":PAGE,"type":"reload"}` using the real numeric page ID. Reopen `Manage Groups` from the new snapshot. `NAME` must still be listed; save this second read.
4. For an edit run, choose `Edit NAME`, inspect the fresh textbox/buttons, submit a distinct replacement name, then repeat the reload/reopen read. For a removal run, choose `Remove NAME`, follow the visible confirmation, and confirm absence after reload. Use a newly created synthetic group for these paths, not the seeded `Alpha` or `Bravo` groups.

## Gotchas

- `Add` is disabled for an empty name. A duplicate name can fail; use a fresh unique name and capture the visible error if testing that path.
- Dialog UIDs change after adding or editing. Snapshot again before clicking `Done`, `Edit`, or `Remove`.
- A row appearing immediately after `Add` is not persistence proof. Reopen after reload.
