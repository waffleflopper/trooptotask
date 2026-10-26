# Manage groups

A manager adds, renames, orders and deletes Organization Groups and moves People between them in one two-pane editor,
then checks that each change saved on its own.

## Sub-features

- `groups-open`: open the Group editor from Personnel at 1440, as a full-height sheet below 1024 and at 390.
- `groups-add`: create a uniquely named Group with Enter; a duplicate or failed add keeps the draft beside its error.
- `groups-edit`: rename inline; the viewer's pin follows the new name.
- `groups-order`: reorder by drag and by Alt+Arrow; a stale order answers 409, adopts the saved catalog and reloads
  roster membership and pins.
- `groups-order-everywhere`: after a reorder, Personnel, Calendar, Bulk status, Training, Critical Tasks and sign-in
  roster PDFs list Groups as pins, then the saved order, then Unassigned. Group filters, including Onboarding's, follow
  the saved order without pins.
- `groups-members`: Add people, Move to… and Remove from Group, each in one request.
- `groups-remove`: delete a Group after choosing where its members go; an empty Group gets a plain confirmation.
- `groups-today`: the Today column's skeleton, failure and hidden states.
- `groups-denied`: a reader's same-Organization and foreign-Organization writes are rejected with no saved change.
- `groups-scope`: a Group-scoped Personnel configurer sees no `Manage Groups`; its Group writes are rejected, and its
  membership writes reach only its own Groups.
- `groups-pin`: pin and unpin a Group, reload, and verify this member's saved preference.
- `groups-pin-recovery`: preserve the current preference after a failed save and a late response from another
  Organization.

## How to get to it (user POV)

Sign in as a member with Organization-wide Personnel configuration access, choose `Personnel`, then `Manage Groups`. At
390 it is under `More Personnel controls`. The dialog `Manage Groups` reads
`2 Groups · 3 personnel · the order here is the order everywhere`. The left pane holds `New group name` with `Add`, the
Groups in display order and a dashed `Unassigned` row. Each Group row has a `Reorder <name>` grip and a `<name> <count>`
button, with `Pinned` read before the count when pinned. The right pane shows the selected Group: `Rename <name>`,
`Pin to top` or `Pinned to top`, `Add people to <name>`, and the member table with `Select <rank> <last>, <first>`
checkboxes. The footer holds `Delete <name>…`, `Changes save as you go` and `Done`. Every change saves as it is made;
`Done` only closes. A Group-scoped configurer and a viewer have no `Manage Groups` button or menu item.

Seeded Organization A has Alpha (SPC Able, Medic) and Bravo (SPC Baker, NCO), both at `sort_order` 0, plus SPC
Unassigned (NCO) without a Group. Groups sort by `sort_order`, then name, then ID. A fresh fixture lists Alpha before
Bravo, and deleting Alpha defaults to Bravo.

## Helper controls

`network arm-fail|arm-hold|arm-observe PAGE groups|pinned-groups` targets only that exact Organization A endpoint on the
owned app origin. `groups` covers add (POST), rename (PUT) and delete (DELETE). It does not match the nested
`groups/order` or `personnel/group-membership` routes; drive their failures with a second writer, as below.
`arm-hold-fail` additionally supports pinned Groups for a delayed undispatched 503. For the membership lifetime case,
use native `evaluate_script` to install the existing [network control](../helpers/network-control.mjs) on `window`, with
`mode: "hold"`, `ordinal: 1`, `sameOrigin: true`, `requestMethod: "POST"`, and the exact owned
`/org/<orgA>/api/personnel/group-membership` suffix. Its state, release and restore use the same `$V network` commands.
This holds the real response after persistence and does not change app state.
`$V server-source arm rpc/roster_signals hold|fail-hard 1 [MS]` drives the Today column. Restore every control and each
member's original ordered pin names; `rows groups|personnel|user_pinned_groups orgA ...` provides separate privileged
readback.

## Driving it with verify:app

Preconditions: doctor passes; `$V fixture` identifies Organizations A/B, Alpha/Bravo and Able/Baker/Unassigned. Use
unique new Group names, and return Able, Baker and Unassigned to their seeded Groups before cleanup. Run
`$V calendar-grant manager view` first so the Today column shows; restore it afterward.

1. **Open.** `npm run --silent verify:app -- login manager`; record its page ID as `PAGE`, `resize_page` to 1440x900 and
   click `Manage Groups`. Opening adds no network requests. The first Group is selected; Able reads `SPC`,
   `Able, Synthetic`, `Medic`, `Present`.
2. **Add.** Fill `New group name` with `Weapons Proof` and press Enter. The field clears, keeps focus, and
   `Weapons Proof 0` is selected with `No one is in this Group yet.` `rows groups orgA name "Weapons Proof"` returns one
   row with the next `sort_order` (1). Filling `alpha` and pressing Enter shows `A Group with that name already exists.`
   on the field with `aria-invalid="true"` and `aria-describedby`, and saves nothing. With
   `network arm-fail PAGE groups`, an add of `Fail Proof` shows `Synthetic request failure`, keeps the draft, and saves
   no row; restore and press Enter again to save it.
3. **Pin and rename.** Choose `Pin to top`. It becomes `Pinned to top` (pressed), the row reads
   `Weapons Proof Pinned 0`, and `rows user_pinned_groups orgA` holds one row with `group_name` `Weapons Proof`. Choose
   `Rename Weapons Proof`, fill `Group name` with `Weapons Squad`, and press Enter. The Group row keeps its ID, and the
   pin row now reads `group_name` `Weapons Squad`. Escape cancels an open rename without closing the dialog. With
   `arm-fail PAGE groups`, a rename shows `Unable to rename Group. Try again.` on the field with the draft kept.
4. **Order.** Focus `Weapons Squad Pinned 0` and press Alt+ArrowUp. The live region reads
   `Weapons Squad moved to position 2 of 3`, focus stays on that button, and `rows groups orgA` shows Alpha 0, Weapons
   Squad 1, Bravo 2. Drag `Reorder Alpha` onto `Bravo 1`. The list reads Weapons Squad, Bravo, Alpha and saves 0, 1, 2.
   For stale recovery, keep the editor open and use a second manager tab to delete a temporary Group containing
   Unassigned, moving its member to Bravo. Reorder in the first tab. Its PUT answers 409, followed by the saved catalog
   GET and a Personnel data reload. The pane shows
   `The Group order changed somewhere else. The list shows the saved order.` Select Bravo: Baker and Unassigned are
   members. Close the editor and confirm both on the roster; reload and compare `rows personnel`. A successful reorder
   makes no Personnel data reload. Separately start with a fresh fixture where Alpha and Bravo share `sort_order` 0. Add
   a third temporary Group, Order Proof, pin Alpha and keep a stale editor tab. Rename Alpha to Zulu in the second tab.
   Move Order Proof up in the stale tab: the 409 recovery shows Bravo before Zulu, Able in Zulu and the pin naming Zulu.
   Restore the name and original pins, and delete the empty Order Proof. Moving only Bravo above Alpha would already
   match the saved order after the rename and correctly return 200 as a replay.
5. **Members.** Select Weapons Squad, open `Add people to Weapons Squad` and pick `SPC Unassigned, Synthetic NCO`. The
   picker lists Unassigned first, then each Group's People in display order. Its `group_id` becomes Weapons Squad
   through one `POST /org/<orgA>/api/personnel/group-membership`, and the roster behind the dialog updates in place. Add
   Baker the same way, check `Select all members of Weapons Squad` (`2 selected`), and choose `Move to…`. The menu lists
   the other Groups and `Unassigned`. Choose Bravo: both rows move to Bravo in one request. Select Bravo, check
   Unassigned, and choose `Remove from Group`; its `group_id` is null again.
6. **Membership failure.** Add a Group `Stale Target`, delete it with an authenticated `DELETE /org/<orgA>/api/groups`
   (`{id, moveMembersTo: null}`), then move Able to `Stale Target` with `Move to…`. The toolbar shows
   `That Group is no longer available.`, and Able's `group_id` stays Alpha. Stale Target stays listed until a reload.
7. **Delete.** Move Baker into a new Group, then choose `Delete <name>…`. The footer becomes a strip:
   `Delete <name>? 1 member needs a new Group. Their records, notes and history are not affected.` `Move members to`
   receives focus and defaults to the next Group, or `Unassigned` for the last Group. Choose Bravo and press
   `Delete and move 1`. The Group row is gone, Baker's `group_id` is Bravo, the pin row is gone, and Bravo is selected.
   For an empty Group the strip reads `No one is in this Group.` with `Cancel` (focused) and `Delete`; Cancel returns
   focus to `Delete <name>…`. With `arm-fail PAGE groups`, `Delete` shows
   `We couldn't confirm the Group change. Reload to see what saved.` in the strip, and the row remains.
8. **Retired membership reply.** As `personnelSwitch`, establish A/B browser history. Hold the first real
   `POST /org/<orgA>/api/personnel/group-membership` reply after it saves a move of Able to Bravo. Use native Back to B
   and Forward to A, then move Able back to Alpha in the new visit. Release the old 200 reply. Able stays in Alpha in
   the editor and roster, and `rows personnel` plus reload still show Alpha. A matching Organization ID alone does not
   permit the old visit to apply its reply. Restore the response control.
9. **Today.** Arm `server-source arm rpc/roster_signals hold 1 60000`, reload and open the editor: Today shows a
   skeleton until `server-source release`, then `Present`. With `fail-hard 1` Today stays blank, and the roster reads
   `Today's status and Needs attention could not be loaded.` Without Calendar view access (`calendar-grant` restored)
   the editor has no Today column.
10. **Sheet and phone.** At 900x900 the dialog fills the viewport (900x900, no horizontal overflow) with the Groups list
    above the selected Group's details. At 390x844 open it from `More Personnel controls`. The selection toolbar keeps
    `Move to…` and `Remove from Group` on one line, the delete strip wraps its copy above the picker, and nothing
    overflows.
11. **Viewer.** Sign in as `viewer`. Personnel shows no `Manage Groups`. From that page send authenticated
    `GET /org/<orgA>/api/groups`, `PUT .../api/groups/order`, `PUT .../api/groups`, `DELETE .../api/groups` and
    `POST .../api/personnel/group-membership`, each with a well-formed body. Each answers 403; the same membership POST
    to Organization B answers 404. `rows groups orgA` and `rows personnel orgA` are unchanged.
12. **Group-scoped configurer.** Sign in as `personnelScoped`, which configures only Alpha. Personnel shows only Alpha,
    and `More Personnel controls` lists only `Archive`. The four Group requests answer 403. A membership POST moving
    Baker into Alpha answers 200 with `movedIds: []` and Baker in `unavailableIds`. Moving Able into Bravo or to
    Unassigned (`groupId: null`) answers 403. Rows are unchanged.

## Group order everywhere

Every page that groups People uses one rule: the viewer's pinned Groups in pin order, then the Organization's
`sort_order` (ties by name, then ID), then Unassigned. Start from a fresh fixture (Alpha and Bravo both 0, so Alpha
first).

1. As `manager` with `calendar-grant manager view`, open `Manage Groups`, select `Bravo 1` and press Alt+ArrowUp. The
   live region reads `Bravo moved to position 1 of 2` and `rows groups orgA` shows Bravo 0, Alpha 1. Choose `Done`: the
   roster rows read `Collapse Bravo`, `Collapse Alpha`, `Collapse Unassigned`.
2. Click the sidebar `Calendar` link, with no reload. The group bands read `BRAVO`, `ALPHA`, `UNASSIGNED` at 1440x900,
   900x900 and 390x844.
3. As `calendarOperate`, open `/calendar/bulk`. The Add roster picker's Group headers read Bravo, Alpha, Unassigned and
   keep that order after `Sort by Name` in either direction.
4. As `trainingConfigure` on Training, the `Group` view's matrix headers read `BRAVO (1)`, `ALPHA (1)`, `UNASSIGNED (1)`
   at 1440x900, 900x900 and 390x844. In `Sign-in rosters`, `New Roster` lists the Group filters Bravo, Alpha. An
   `Alphabetical` roster with `Separate by group` prints its sections Bravo (Baker), Alpha (Able), Unassigned; read it
   with `pdftotext -layout`, then delete the roster.
5. As `onboardingOperate`, the Onboarding `Group` filter lists `All groups`, Bravo, Alpha. The `Start onboarding` member
   picker is a flat list sorted by last name (Able, Baker, Unassigned) and does not follow Group order.
6. As `manager`, pin Alpha on its Calendar band. Calendar reads `ALPHA`, `BRAVO`, `UNASSIGNED`, and so does Personnel
   after sidebar navigation. Unpin it.
7. Restore. Move Alpha back up in the Group editor. It saves Alpha 0, Bravo 1, which shows the fixture's order. A
   `verify:app restart` brings back the seeded 0 and 0.

## Personal Group pins

Pins belong to the signed-in member and Organization. They store Group names in order. A rename or delete in the Group
editor carries or drops every member's pin for that Group in the same transaction; another member's open page shows it
on its next read. The pin helper changes only viewers who hold the old-name pin after that name leaves the catalog. A
direct call with a nonexistent old name and an existing new name changes nothing, as the ordinary-role SQL contract
proves. Preserve the complete original `user_pinned_groups` rows for A/B, including IDs, user IDs, names and sort order,
before starting. Locate `Pin Alpha`, `Pin Bravo`, or the corresponding `Unpin` control in Personnel, or `Pin to top` in
the editor. The UI has only Pin/Unpin; ordered replacement is API-only.

1. Sign in as `manager`, choose a visible Group whose original pin state is recorded, and arm
   `$V network arm-observe PAGE pinned-groups`. Click its named Pin or Unpin control. Capture the immediate pressed
   state, request status and complete self-user A rows. Reload Personnel and confirm the same preference and Group
   placement. Other users and B rows must remain unchanged. Calendar and Training should consume the same member's saved
   names when those lanes are admitted; a denied lane supplies no consumer proof.
2. Restore the observation control. Arm `$V network arm-fail PAGE pinned-groups`, then toggle a known Group. Preserve
   optimistic feedback followed by rollback, its 503 and exact unchanged provider rows. In the editor the toggle returns
   to `Pin to top` with `The pin did not save. Try again.` beside it and a `Failed to update pinned Groups. Try again.`
   toast. Restore the control and retry explicitly; reload to confirm the acknowledged preference. Do not call a failed
   response a saved pin.
3. Use `personnelSwitch` for the A/B lifetime case. Capture its complete original preference sets and open A Personnel.
   Arm `$V network arm-hold PAGE pinned-groups`, toggle a known Group, and confirm its real 200 and saved A row while
   the response is held. Switch visibly to B, record B's settled roster/pins, release the A response and prove B remains
   unchanged. Restore the control, return to A and reload the acknowledged saved preference. For an undispatched late
   failure, first restore or choose a safe currently unpinned name. Arm `arm-hold-fail` and click its named Pin control
   to issue POST, then capture the held state/status 503 and unchanged A rows before B navigation. Unpin uses DELETE and
   is not selected by this delayed-failure mode. Release after B settles and distinguish 503/no A effects from the real
   held 200 case. If the pending UI prevents switching, use actual native Back through known history and preserve any
   unavailable path; scripted history is separate evidence.
4. Restore each member's original names and order through explicit visible toggles or the ordinary own-preference
   replace API. Provider-generated IDs for recreated pins may change, so record those intended replacements and compare
   exact names/order plus the unaffected row IDs and values. Preserve the original captures. Restore network and
   feedback hooks before cleanup. No helper may delete another member's pins or all Organization preferences.

`groups` and `pinned-groups` controls match only their exact A endpoint on this owned app origin. They do not intercept
the other family, nested paths or B. A held response has already reached the app; a synthetic failure has not. Save
control state before navigation can discard it. SDK, use-case and API tests cover ordered replacement,
delete-then-insert partial failure and private user/Organization predicates.

## Gotchas

- `Add` is disabled for an empty name. A duplicate name is refused before any request (see
  [Invalid input](invalid-input.md)).
- A row appearing immediately after `Add` is not persistence proof. Read `rows groups` or reopen after reload.
- `Done` closes even with a typed draft and discards it; while a draft exists the `Close` button is absent and Escape is
  blocked. Clear a draft with Control+A and Backspace, because a native `fill` with an empty string does not update the
  bound value.
- Options in `Add people` appear only in a `verbose` snapshot; click the option UID from there.
- Denial needs server response and no-effect readback; a hidden button alone cannot prove it. Route, store and component
  tests cover the remaining verbs, keyboard paths and pending states.
