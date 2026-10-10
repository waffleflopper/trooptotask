# Manage groups

A manager adds, renames, or removes organization groups from the Personnel roster and checks that saved changes survive a fresh read.

## Sub-features

- `groups-open`: open the group-management dialog from Personnel.
- `groups-add`: create a uniquely named group.
- `groups-edit`: rename an existing group.
- `groups-remove`: remove a group after the visible confirmation path.
- `groups-persist`: reopen the dialog after reload to confirm the stored list.
- `groups-denied`: a reader's same-Organization and foreign-Organization writes are rejected with no saved Group.
- `groups-pin`: pin and unpin a visible Group, reload, and verify this member's saved preference.
- `groups-rename-recovery`: a failed rename keeps the edited name and its field error until Cancel or a successful retry.
- `groups-pin-recovery`: preserve the current preference after a failed save and a late response from another Organization.

## How to get to it (user POV)

Sign in as a member with Personnel configuration access, choose `Personnel`, then `Manage Groups`. In the dialog, type into `Organization groups` and choose `Add`; each saved group has `Edit <name>` and `Remove <name>` actions. Choose `Done` to return to the roster.

## Driving it with verify:app

Preconditions: doctor passes; `$V fixture` identifies Organizations A/B and seeded Alpha/Bravo. Use a unique new Group name and preserve those original Groups.

1. Run `npm run --silent verify:app -- login manager`; record its page ID as `PAGE`. Save a before snapshot. Choose the UID for `Manage Groups` and call `tool click`; expect the `Manage Groups` dialog with `Alpha`, `Bravo`, `Organization groups`, and a disabled `Add` button.
2. Set `NAME="Map Proof $(date +%s)"`. From the dialog's fresh snapshot, use `tool fill` on its `Organization groups` textbox with `NAME`; `Add` becomes enabled. Click its fresh UID. The dialog now lists `NAME` with `Edit NAME` and `Remove NAME` buttons.
3. Save an after snapshot and screenshot. Click `Done`, then `tool navigate_page` with `{"pageId":PAGE,"type":"reload"}` using the real numeric page ID. Reopen `Manage Groups` from the new snapshot. `NAME` must still be listed; save this second read and the ID from `$V rows groups orgA name "$NAME"`.
4. Set `REPLACEMENT="$NAME renamed"`. Choose `Edit NAME`, inspect the fresh textbox/buttons, submit `REPLACEMENT`, then repeat the reload/reopen read. Choose `Remove REPLACEMENT`, follow the visible confirmation, and confirm its absence after reload. Use only the newly created synthetic group for these paths, not seeded `Alpha` or `Bravo`.
5. After creation, `$V rows groups orgA name "$NAME"` must return exactly one row. After rename, the old-name query must return zero and `$V rows groups orgA name "$REPLACEMENT"` must return exactly one row with the ID captured at creation. After removal, the replacement-name query must return zero; Alpha and Bravo remain. Capture an empty/duplicate Add attempt and the visible validation without changing a saved Group. For a controlled Add failure, arm `$V network arm-fail PAGE groups` before submitting. Preserve the draft/error and unchanged rows, restore the control, then retry explicitly and reload. The failure is an undispatched synthetic 503, not a provider outage. Use `$V network arm-observe PAGE groups` for the separate ordinary success and restore afterward.
6. **Failed rename and remove keep values.** With a new synthetic Group, choose `Edit NAME`, type `REPLACEMENT`, arm `$V network arm-fail PAGE groups` and submit: require the edited name still in the textbox, the failure message shown through `Field.Error` with `aria-invalid="true"` and `aria-describedby` on that textbox, the dialog still open and `$V rows groups orgA name "$NAME"` unchanged. Press Cancel and require the saved name restored; repeat the edit and retry after restore. Arm `arm-fail` again, choose `Remove REPLACEMENT` and confirm: the Group stays listed with an error and its row remains. Record keyboard operation of Add (Enter in the textbox), Edit (Enter submits, Escape cancels the edit) and focus after each outcome. A blank or whitespace-only rename keeps `Save` disabled (a disabled button in the a11y tree, no message) and saves nothing; typing a real name enables it, and the saved name reads back after reload. With a typed draft the `Close` button is absent and Escape is blocked; clear the draft by typing a character and pressing Backspace (a native `fill` with an empty string does not update the bound value), then `Close` by name closes the dialog and Escape closes it again. At 390 dark require the dialog within the viewport.
7. Sign in as `viewer` in a separate context. `Manage Groups` is unavailable, but that is only a UI affordance check. From the same signed-in page, use `tool evaluate_script` and `fetch` to send authenticated `POST /org/<orgA>/api/groups` and `POST /org/<orgB>/api/groups` with `headers: {'Content-Type': 'application/json'}` and `body: JSON.stringify({name: 'Denied <run>'})`. Use a different name for each request. Expect `403` for A and `403` or `404` for B; a `400` means the probe did not reach authorization. Record each HTTP status and `$V rows groups orgA|orgB name ...` showing zero rows.

## Personal Group pins

Pins belong to the signed-in member and Organization. They store Group names in order. A Group rename does not propagate to saved pins. Preserve the complete original `user_pinned_groups` rows for A/B, including IDs, user IDs, names and sort order, before starting. Use a fresh native snapshot to locate `Pin Alpha`, `Pin Bravo`, or the corresponding `Unpin` control in Personnel. The public UI has Pin/Unpin; ordered replacement is a separate API/provider contract.

1. Sign in as `manager`, choose a visible Group whose original pin state is recorded, and arm `$V network arm-observe PAGE pinned-groups`. Click its named Pin or Unpin control. Capture the immediate pressed state, request status and complete self-user A rows. Reload Personnel and confirm the same preference and Group placement. Other users and B rows must remain unchanged. Calendar and Training should consume the same member's saved names when those lanes are admitted; a denied lane supplies no consumer proof.
2. Restore the observation control. Arm `$V network arm-fail PAGE pinned-groups`, then toggle a known Group. Preserve optimistic feedback followed by rollback, its 503 and exact unchanged provider rows. Restore the control and retry explicitly; reload to confirm the acknowledged preference. Do not call a failed response a saved pin.
3. Use `personnelSwitch` for the A/B lifetime case. Capture its complete original preference sets and open A Personnel. Arm `$V network arm-hold PAGE pinned-groups`, toggle a known Group, and confirm its real 200 and saved A row while the response is held. Switch visibly to B, record B's settled roster/pins, release the A response and prove B remains unchanged. Restore the control, return to A and reload the acknowledged saved preference. For an undispatched late failure, first restore or choose a safe currently unpinned name. Arm `arm-hold-fail` and click its named Pin control to issue POST, then capture the held state/status 503 and unchanged A rows before B navigation. Unpin uses DELETE and is not selected by this delayed-failure mode. Release after B settles and distinguish 503/no A effects from the real held 200 case. If the pending UI prevents switching, use actual native Back through known history and preserve any unavailable path; scripted history is separate evidence.
4. Restore each member's original names and order through explicit visible toggles or the ordinary own-preference replace API. Provider-generated IDs for recreated pins may change, so record those intended replacements and compare exact names/order plus the unaffected row IDs and values. Preserve the original captures. Restore network and feedback hooks before cleanup. No helper may delete another member's pins or all Organization preferences.

`groups` and `pinned-groups` controls match only their exact A endpoint on this owned app origin. They do not intercept the other family, nested paths or B. A held response has already reached the app; a synthetic failure has not. Use fresh page IDs and UIDs and save control state before navigation can discard it. SDK/use-case/API checks own ordered replacement, delete-then-insert partial failure and private user/Organization predicates. They do not establish a native reorder affordance.

## Gotchas

- `Add` is disabled for an empty name. A duplicate name can fail; use a fresh unique name and capture the visible error if testing that path.
- Dialog UIDs change after adding or editing. Snapshot again before clicking `Done`, `Edit`, or `Remove`.
- A row appearing immediately after `Add` is not persistence proof. Reopen after reload.
- Denial needs server response and no-effect readback; a hidden button alone cannot prove it. Group route/component tests cover other write verbs and keyboard/pending details separately.
