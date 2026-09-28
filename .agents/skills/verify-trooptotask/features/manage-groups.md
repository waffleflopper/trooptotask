# Manage groups

A manager adds, renames, or removes organization groups from the Personnel roster and checks that saved changes survive a fresh read.

## Sub-features

- `groups-open`: open the group-management dialog from Personnel.
- `groups-add`: create a uniquely named group.
- `groups-edit`: rename an existing group.
- `groups-remove`: remove a group after the visible confirmation path.
- `groups-persist`: reopen the dialog after reload to confirm the stored list.
- `groups-denied`: a reader's same-Organization and foreign-Organization writes are rejected with no saved Group.

## How to get to it (user POV)

Sign in as a member with Personnel configuration access, choose `Personnel`, then `Manage Groups`. In the dialog, type into `Organization groups` and choose `Add`; each saved group has `Edit <name>` and `Remove <name>` actions. Choose `Done` to return to the roster.

## Driving it with verify:app

1. Run `npm run --silent verify:app -- login manager`; record its page ID as `PAGE`. Save a before snapshot. Choose the UID for `Manage Groups` and call `tool click`; expect the `Manage Groups` dialog with `Alpha`, `Bravo`, `Organization groups`, and a disabled `Add` button.
2. Set `NAME="Map Proof $(date +%s)"`. From the dialog's fresh snapshot, use `tool fill` on its `Organization groups` textbox with `NAME`; `Add` becomes enabled. Click its fresh UID. The dialog now lists `NAME` with `Edit NAME` and `Remove NAME` buttons.
3. Save an after snapshot and screenshot. Click `Done`, then `tool navigate_page` with `{"pageId":PAGE,"type":"reload"}` using the real numeric page ID. Reopen `Manage Groups` from the new snapshot. `NAME` must still be listed; save this second read and the ID from `$V rows groups orgA name "$NAME"`.
4. Set `REPLACEMENT="$NAME renamed"`. Choose `Edit NAME`, inspect the fresh textbox/buttons, submit `REPLACEMENT`, then repeat the reload/reopen read. Choose `Remove REPLACEMENT`, follow the visible confirmation, and confirm its absence after reload. Use only the newly created synthetic group for these paths, not seeded `Alpha` or `Bravo`.
5. After creation, `$V rows groups orgA name "$NAME"` must return exactly one row. After rename, the old-name query must return zero and `$V rows groups orgA name "$REPLACEMENT"` must return exactly one row with the ID captured at creation. After removal, the replacement-name query must return zero; Alpha and Bravo remain. Capture an empty/duplicate Add attempt and the visible validation without changing a saved Group. If an Add request fails, preserve the draft/error state, then retry after recovery.
6. Sign in as `viewer` in a separate context. `Manage Groups` is unavailable, but that is only a UI affordance check. From the same signed-in page, send authenticated `POST /org/<orgA>/api/groups` and `POST /org/<orgB>/api/groups` with two distinct `Denied <run>` names through `tool evaluate_script` using `fetch`. Expect `403` for A and `403` or `404` for B. Record each HTTP status and `$V rows groups orgA|orgB name ...` showing zero rows.

## Gotchas

- `Add` is disabled for an empty name. A duplicate name can fail; use a fresh unique name and capture the visible error if testing that path.
- Dialog UIDs change after adding or editing. Snapshot again before clicking `Done`, `Edit`, or `Remove`.
- A row appearing immediately after `Add` is not persistence proof. Reopen after reload.
- Denial needs server response and no-effect readback; a hidden button alone cannot prove it. Group route/component tests cover other write verbs and keyboard/pending details separately.
