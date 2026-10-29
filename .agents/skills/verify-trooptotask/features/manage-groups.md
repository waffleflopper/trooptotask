# Manage groups

A manager builds the Organization's Group tree (Groups, their sub-groups and theirs, three levels at most), renames,
orders, moves and deletes Groups, and moves People between them in one two-pane editor, then checks that each change
saved on its own.

## Sub-features

- `groups-open`: open the Group editor from Personnel at 1440, as a full-height sheet below 1024 and at 390.
- `groups-add`: create a uniquely named Group with Enter; a duplicate or failed add keeps the draft beside its error.
- `groups-tree`: add sub-groups from a Group's `+`, two levels below a top-level Group; a team has no `+`.
- `groups-squads`: `Add standard squads…` on a top-level Group adds the chosen number of squads, each with an Alpha
  Team and a Bravo Team, keeping squads and teams that already exist.
- `groups-move-under`: move a Group and its sub-groups under another Group or to the top level; a target that would nest
  deeper than three levels is disabled.
- `groups-parent-gone`: an add under a Group another session deleted answers 400 and saves nothing.
- `groups-first`: with no Groups, a hint points at `New group name` and the editor teaches the first Group.
- `groups-edit`: rename inline; the viewer's pin stays on the renamed Group.
- `groups-order`: reorder siblings by dragging a grip or pressing ArrowUp/ArrowDown on it; a stale order answers 409, adopts the saved catalog and reloads
  roster membership and pins.
- `groups-order-everywhere`: after a reorder, Personnel, Calendar, Bulk status, Training, Critical Tasks and sign-in
  roster PDFs list Groups as pins, then the saved order, then Unassigned. Group filters, including Onboarding's, list
  only top-level Groups in the saved order, and a pick keeps its whole subtree.
- `groups-members`: Add people, Move selected members to and Remove from Group, each in one request.
- `groups-remove`: delete a Group and its sub-groups after choosing where their members go; an empty subtree gets a plain
  confirmation, and the roster reconciles without a reload. A Group still responsible for a Calendar Tasking is
  refused with the Tasking named.
- `groups-nested`: a three-level tree draws nested bands and offers only its top-level Groups to each screen's Group
  filter; other feature recipes reuse its seed.
- `groups-today`: the Today column's skeleton, failure and hidden states.
- `groups-denied`: a reader's same-Organization and foreign-Organization writes are rejected with no saved change.
- `groups-scope`: a Group-scoped Personnel configurer sees no `Manage Groups`; its Group writes are rejected, and its
  membership writes reach only its own Groups.
- `groups-pin`: pin and unpin a Group, reload, and verify this member's saved preference. A Group-scoped member sees no
  pin control and the server refuses their pin writes.
- `groups-pin-recovery`: preserve the current preference after a failed save and a late response from another
  Organization.

## How to get to it (user POV)

Sign in as a member with Organization-wide Personnel configuration access, choose `Personnel`, then `Manage Groups`. At
390 it is under `More Personnel controls`. The dialog `Manage Groups` reads
`2 Groups · 3 personnel · the order here is the order everywhere`. The left pane holds `New group name` with `Add`, `Drag to
reorder within a level`, the Group tree (`Groups in display order`, each sub-group list `Sub-groups of <name>`, indented
one step per level) and a dashed `Unassigned` row. Each Group row has a `Reorder <name>` grip, a `<name>` button, `Pinned`
when pinned, the count of people in its whole subtree, `Add a sub-group to <name>` (absent on a third-level team) and
`Change <name>`, a menu of `Rename`, `Move under…`, `Add standard squads…` (top-level Groups only) and `Delete…`. The
right pane is headed with the selected Group's path (`2ND PLATOON › 1ST SQUAD`), `Pin to top` or `Pinned to top` (top-level
Groups only), `Add people to <name>`, and the member table with `Select <rank> <last>, <first>` checkboxes; checked
members show `Move selected members to` (a tree picker with path labels) and `Remove from Group`. The footer holds
`Changes save as you go` and `Done`. Every change saves as it is made;
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
member's original ordered pins; `rows groups|personnel|user_pinned_groups orgA ...` provides separate privileged
readback.

## Driving it with verify:app

Preconditions: doctor passes; `$V fixture` identifies Organizations A/B, Alpha/Bravo and Able/Baker/Unassigned. Use
unique new Group names, and return Able, Baker and Unassigned to their seeded Groups before cleanup. Run
`$V calendar-grant manager view` first so the Today column shows; restore it afterward.

1. **Open.** `npm run --silent verify:app -- login manager`; record its page ID as `PAGE`, `resize_page` to 1440x900 and
   click `Manage Groups`. Opening adds no network requests. The first Group is selected; Able reads `SPC`,
   `Able, Synthetic`, `Medic`, `Present`.
2. **Add.** Fill `New group name` with `Weapons Proof` and press Enter. The field clears, keeps focus, and the
   tree gains `Weapons Proof` with count 0; select it to read `No one is in this Group yet.` `rows groups orgA name "Weapons Proof"` returns one
   row with the next `sort_order` (1). Filling `alpha` and pressing Enter shows `A Group with that name already exists.`
   on the field with `aria-invalid="true"` and `aria-describedby`, and saves nothing. With
   `network arm-fail PAGE groups`, an add of `Fail Proof` shows `Synthetic request failure`, keeps the draft, and saves
   no row; restore and press Enter again to save it.
3. **Pin and rename.** Choose `Pin to top`. It becomes `Pinned to top` (pressed), the row reads
   `Weapons Proof`, `Pinned`, `0`, and `rows user_pinned_groups orgA` holds one row whose `group_id` is the Weapons Proof
   Group's ID. Choose `Change Weapons Proof` → `Rename`, fill `Group name` with `Weapons Squad`, and press Enter. The Group row
   keeps its ID, and the pin row is unchanged: same row ID, same `group_id`. Escape cancels an open rename without
   closing the dialog. With `arm-fail PAGE groups`, a rename shows `Unable to rename Group. Try again.` on the field
   with the draft kept.
4. **Order.** Focus `Reorder Weapons Squad` and press ArrowUp. The live region reads
   `Weapons Squad moved to position 2 of 3`, focus stays on that grip, and `rows groups orgA` shows Alpha 0, Weapons
   Squad 1, Bravo 2. Drag `Reorder Alpha` onto the `Bravo` row. The list reads Weapons Squad, Bravo, Alpha and saves 0, 1, 2.
   For stale recovery, keep the editor open and use a second manager tab to delete a temporary Group containing
   Unassigned, moving its member to Bravo. Reorder in the first tab. Its PUT answers 409, followed by the saved catalog
   GET and a Personnel data reload. The pane shows
   `The Group order changed somewhere else. The list shows the saved order.` Select Bravo: Baker and Unassigned are
   members. Close the editor and confirm both on the roster; reload and compare `rows personnel`. A successful reorder
   makes no Personnel data reload. Separately start with a fresh fixture where Alpha and Bravo share `sort_order` 0. Add
   a third temporary Group, Order Proof, pin Alpha and keep a stale editor tab. Rename Alpha to Zulu in the second tab.
   Move Order Proof up in the stale tab: the 409 recovery shows Bravo before Zulu, Able in Zulu and the pin still on
   Zulu. Restore the name and original pins, and delete the empty Order Proof. Moving only Bravo above Alpha would
   already match the saved order after the rename and correctly return 200 as a replay.
5. **Members.** Select Weapons Squad, open `Add people to Weapons Squad` and pick `SPC Unassigned, Synthetic NCO`. The
   picker lists Unassigned first, then each Group's People in display order. Its `group_id` becomes Weapons Squad
   through one `POST /org/<orgA>/api/personnel/group-membership`, and the roster behind the dialog updates in place. Add
   Baker the same way, check `Select all members of Weapons Squad` (`2 selected`), and open `Move selected members to`
   (`Move to…`). The tree picker lists the other Groups by path and `Unassigned`. Choose Bravo: both rows move to Bravo in one request. Select Bravo, check
   Unassigned, and choose `Remove from Group`; its `group_id` is null again.
6. **Membership failure.** Add a Group `Stale Target`, delete it with an authenticated `DELETE /org/<orgA>/api/groups`
   (`{id, moveMembersTo: null}`), then move Able to `Stale Target` with `Move selected members to`. The toolbar shows
   `That Group is no longer available.`, and Able's `group_id` stays Alpha. Stale Target stays listed until a reload.
7. **Delete.** Move Baker into a new top-level Group, then choose `Change <name>` → `Delete…`. The confirmation
   `Delete <name>?` reads `1 person moves to the Group you choose. Their records, notes and history are not affected.`
   `Move them to` defaults to the parent, or `Unassigned` for a top-level Group. Choose Bravo and press
   `Delete and move 1`. The Group row is gone, Baker's `group_id` is Bravo, and the pin row is gone. For an empty Group
   it reads `No one is in it.` with `Cancel` and `Delete`. With `arm-fail PAGE groups`, `Delete` shows
   `We couldn't confirm the Group change. Reload to see what saved.` in the confirmation, and the row remains. With a
   Tasking owned by the Group (see [Events & Taskings](events-taskings.md) Staffing step 11), `Delete` answers 409 and
   the confirmation shows
   `This Group is responsible for “TITLE”. Move that tasking to another Group or the organization before deleting.`; the
   Group, its members and the Tasking are unchanged.
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
    `Move selected members to` and `Remove from Group` on one line, and nothing overflows. See
    [Group tree](#group-tree) step 7 for the tree at 390.
11. **Viewer.** Sign in as `viewer`. Personnel shows no `Manage Groups`. From that page send authenticated
    `GET /org/<orgA>/api/groups`, `PUT .../api/groups/order`, `PUT .../api/groups`, `DELETE .../api/groups` and
    `POST .../api/personnel/group-membership`, each with a well-formed body. Each answers 403; the same membership POST
    to Organization B answers 404. `rows groups orgA` and `rows personnel orgA` are unchanged.
12. **Group-scoped configurer.** Sign in as `personnelScoped`, which configures only Alpha. Personnel shows only Alpha,
    and `More Personnel controls` lists only `Archive`. The four Group requests answer 403. A membership POST moving
    Baker into Alpha answers 200 with `movedIds: []` and Baker in `unavailableIds`. Moving Able into Bravo or to
    Unassigned (`groupId: null`) answers 403. Rows are unchanged.
13. **First Group.** On a unit with no Groups (create one at `/org/new` as in
    [organization setup](organization-setup.md), then `Add your Groups` on its Groups step or `Manage Groups` on
    Personnel), focus is on `New group name`, described by the hint `Type a Group name here, then select Add.` with
    `Dismiss hint`. The list shows `Your Groups line up here, in the order the roster shows them.`, the right pane
    `No Groups yet` and `Name your first Group`, and there is no `Unassigned` row, `Drag to reorder` or Delete. Escape
    dismisses the hint and keeps the dialog open; a second Escape closes it. Add `HQ Section`: the hint does not return,
    the field is cleared and focused, and the right pane reads `No one in HQ Section yet`. Reload and reopen: no hint.
    Capture 1440, 1024 and 390; at 390 the hint sits under the field and covers nothing.

## Group tree

Start from a fresh fixture as `orgOwner` (or `manager`) at 1440x900 and open `Manage Groups`
(`2 Groups · 3 personnel · the order here is the order everywhere`). Read every saved change with
`rows groups orgA`; a row's `depth` is 1 for a top-level Group, 2 for its sub-group and 3 below that.

1. **Build.** Add `2nd Platoon` with Enter. `Add a sub-group to 2nd Platoon` opens `New sub-group in 2nd Platoon` with
   `Add` and `Cancel`; add `1st Squad`. The field stays open and focused for the next name; Escape closes it and keeps
   the dialog open. Under `1st Squad` add `Alpha Team` and `Bravo Team`. The rows read depth 1, 2, 3, 3, with
   `parent_id` naming the row above and the teams at `sort_order` 0 and 1. A team row has no `Add a sub-group`.
2. **Standard squads.** Add `3rd Platoon`, then `Change 3rd Platoon` → `Add standard squads…`. The confirmation reads
   `Each squad gets an Alpha Team and a Bravo Team. Squads and teams that already exist stay as they are.` with `Squads`
   (1 to 6, default 2) and `Add 2 squads`. Choosing 3 shows `Add 3 squads`. Adding 2 saves `1st Squad` and `2nd Squad`
   (depth 2, sort 0 and 1) and an `Alpha Team` and `Bravo Team` under each (depth 3): 13 Groups in all.
3. **Assign at any level.** The Personnel Quick edit and Add a person `Group` field is a tree picker with
   `Search Groups`; searching `alpha team` shows each matching team under its ancestors. Picking
   `2nd Platoon › 1st Squad › Alpha Team` reads `Group: 2nd Platoon › 1st Squad › Alpha Team`, and Quick edit's change
   line reads `Group Alpha → 2nd Platoon › 1st Squad › Alpha Team`. The bulk bar's `Move to Group` menu lists every
   Group by path in tree order, then `Unassigned`; moving one person shows
   `Moved 1 person to 2nd Platoon › 1st Squad › Alpha Team`. Each saves the chosen Group's ID as `group_id`.
4. **Move under.** `Change 2nd Squad` (under 3rd Platoon) → `Move under…` opens `Move 2nd Squad`:
   `2nd Squad and its 2 sub-groups move together. Choose the Group it goes under.` `Move` stays disabled until
   `Move under` has a choice. The picker offers `Top level` and every Group outside the moving subtree; the squads are
   disabled (a squad with teams under a squad would nest four deep) and so is the current parent. Choose `2nd Platoon`
   and `Move`: the squad and both teams keep their IDs, `2nd Squad` takes `parent_id` 2nd Platoon and the next
   `sort_order`, and the teams stay at depth 3.
5. **Subtree delete.** With Able in Alpha Team and two people in Bravo Team, `Change 1st Squad` → `Delete…` opens
   `Delete 1st Squad and its 2 sub-groups?`:
   `Alpha Team and Bravo Team are deleted with it. 3 people move to the Group you choose. Their records, notes and
history are not affected.` `Move them to` defaults to the parent, `2nd Platoon`, and lists no Group inside the
   subtree; `Unassigned` is last. `Delete and move 3` deletes the three rows, the three people take `group_id` 2nd
   Platoon, and after `Done` the roster shows them in the 2nd Platoon band with no page reload (`performance.timeOrigin`
   unchanged). An empty subtree reads `No one is in it.` and confirms with `Delete`. Pins on any deleted Group go with it.
6. **Parent gone.** From the signed-in page, add a Group, delete it with `DELETE /org/<orgA>/api/groups`
   (`{id, moveMembersTo: null}`), then `POST` the same endpoint with `{name: "Orphan Team", parentId: <deleted id>}`. It
   answers 400 `The parent Group is no longer available. Choose another.` and `rows groups orgA name "Orphan Team"`
   is empty.
7. **Narrow.** At 1024 the list and details sit side by side. At 390x844, from `More Personnel controls`, the tree sits
   above the selected Group's details with no overlap and no horizontal overflow. Every tree picker opened from a
   dialog at 390 (Move under, Move them to, Add a person `Group`, member access `Groups they work in`) is a bottom sheet
   painted above that dialog (both at z-index 50, the sheet's `elementFromPoint` hit at the bottom of the screen); Escape
   closes the sheet and leaves the dialog open.

## Group order everywhere

Every page that groups People uses one rule: the viewer's pinned Groups in pin order, then the Organization's
`sort_order` (ties by name, then ID), then Unassigned. Start from a fresh fixture (Alpha and Bravo both 0, so Alpha
first).

1. As `manager` with `calendar-grant manager view`, open `Manage Groups`, focus `Reorder Bravo` and press ArrowUp. The
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

Pins belong to the signed-in member and Organization and store Group IDs in order. A rename leaves every pin in place;
deleting a Group removes every member's pin on it through the foreign key, and another member's open page shows it on
its next read. Only Organization-wide readers (owner, admin, or Organization scope) read or write pins. A Group-scoped
member sees no pin toggle, no `Pin` menu item and no Calendar `Pin`; their stored pins stay in the table, unread, and
`POST` or `DELETE /org/<orgA>/api/pinned-groups` answers 403. Preserve the complete original `user_pinned_groups` rows
for A/B, including IDs, user IDs, Group IDs and sort order, before starting. Locate `Pin Alpha`, `Pin Bravo`, or the
corresponding `Unpin` control in Personnel, or `Pin to top` in the editor. The UI and API offer only Pin/Unpin.

1. Sign in as `manager`, choose a visible Group whose original pin state is recorded, and arm
   `$V network arm-observe PAGE pinned-groups`. Click its named Pin or Unpin control. Capture the immediate pressed
   state, request status and complete self-user A rows. Reload Personnel and confirm the same preference and Group
   placement. Other users and B rows must remain unchanged. Calendar and Training should consume the same member's saved
   pins when those lanes are admitted; a denied lane supplies no consumer proof.
2. Restore the observation control. Arm `$V network arm-fail PAGE pinned-groups`, then toggle a known Group. Preserve
   optimistic feedback followed by rollback, its 503 and exact unchanged provider rows. In the editor the toggle returns
   to `Pin to top` with `The pin did not save. Try again.` beside it and a `Failed to update pinned Groups. Try again.`
   toast. Restore the control and retry explicitly; reload to confirm the acknowledged preference. Do not call a failed
   response a saved pin.
3. Use `personnelSwitch` for the A/B lifetime case. Capture its complete original preference sets and open A Personnel.
   Arm `$V network arm-hold PAGE pinned-groups`, toggle a known Group, and confirm its real 200 and saved A row while
   the response is held. Switch visibly to B, record B's settled roster/pins, release the A response and prove B remains
   unchanged. Restore the control, return to A and reload the acknowledged saved preference. For an undispatched late
   failure, first restore or choose a safe currently unpinned Group. Arm `arm-hold-fail` and click its named Pin control
   to issue POST, then capture the held state/status 503 and unchanged A rows before B navigation. Unpin uses DELETE and
   is not selected by this delayed-failure mode. Release after B settles and distinguish 503/no A effects from the real
   held 200 case. If the pending UI prevents switching, use actual native Back through known history and preserve any
   unavailable path; scripted history is separate evidence.
4. Restore each member's original pins and order through explicit visible toggles. Provider-generated IDs for recreated
   pins may change, so record those intended replacements and compare exact Group IDs and order plus the unaffected row
   IDs and values. Preserve the original captures. Restore network and feedback hooks before cleanup. No helper may
   delete another member's pins or all Organization preferences.
5. Sign in as `personnelScoped` and open Personnel. Alpha is the whole view, so the roster draws no Alpha band and no
   `Pin`; the toolbar shows the static `Alpha` label. As `calendarScoped`, Calendar draws no `ALPHA` band and no `Pin`.
   An authenticated `POST /org/<orgA>/api/pinned-groups` with `{ "groupId": "<Alpha ID>" }` from that page answers 403,
   and `rows user_pinned_groups orgA user_id SCOPED_ID` is unchanged.

`groups` and `pinned-groups` controls match only their exact A endpoint on this owned app origin. They do not intercept
the other family, nested paths or B. A held response has already reached the app; a synthetic failure has not. Save
control state before navigation can discard it. SDK, use-case and API tests cover own-row and same-Organization
predicates and the Group-scoped refusal; the `group_editor_commands` SQL contract proves the same as ordinary signed-in
roles.

## Nested Group tree

Recipes that read nested bands, path labels or top-level Group filters share this seed. As `orgOwner` on Personnel
(`$V actor orgOwner personnel`), run native `evaluate_script` `fetch` calls in that page: `POST /org/<orgA>/api/groups`
with `{"name","parentId"}` for `2nd Platoon` (root), `1st Squad` and `2nd Squad` under it, and `Alpha Team` and
`Bravo Team` under `1st Squad`; then `POST /org/<orgA>/api/personnel` with
`{rank:"SPC",firstName:"Test",lastName,groupId,clinicRole:""}` for Diaz and Webb in 2nd Platoon, Lee in 1st Squad,
Brooks, Moss, Nguyen and Ortiz in Alpha Team, Kim in Bravo Team and Patel in 2nd Squad. Keep the returned IDs. With the
fixture's Able (Alpha), Baker (Bravo) and SPC Unassigned, Organization A holds 12 People.

1. **Bands.** At 1440x900 on Personnel in `Group` view, the bands (`[data-band-level]`) run `0: 2nd Platoon 9`,
   `1: 1st Squad 6`, `2: Alpha Team 4`, `2: Bravo Team 1`, `1: 2nd Squad 1`, `0: Alpha 1`, `0: Bravo 1`,
   `0: Unassigned 1`. No sidebar link's `href` carries a query, and `scrollWidth` equals the viewport.
2. **Scoped readers.** In `Settings` → `Members`, set `orgMember`'s Groups to `Selected` → `1st Squad` only and save. In
   `$V actor orgMember personnel` at 1440 the bands run `0: 1st Squad 6`, `1: Alpha Team 4`, `1: Bravo Team 1` with no
   pin, and at 390 `scrollWidth` is 390. With `Show sub-groups` off (step 3) the member sees one band, `0: 1st Squad 6`,
   at 1440, 1024 and 390. Set the Groups to `Alpha Team` only and reload that page: the eyebrow reads
   `Verification Organization A · Alpha Team`, the roster lists Brooks, Moss, Nguyen and Ortiz with `Alpha Team` in the
   `Group` column, and there is no band and no `A-Z`/`Group` switch. Restore the Groups to `Alpha` and read
   `access_scope_group_ids` back with `$V rows organization_memberships orgA id <orgMemberMembership>`.
3. **Show sub-groups.** On Personnel in `Group` view open `Display`: `Show sub-groups` is a checked menu toggle. Turn it
   off: the bands run `0: 2nd Platoon 9`, `0: Alpha 1`, `0: Bravo 1`, `0: Unassigned 1`, the address is unchanged and
   `localStorage['t2t:show-sub-groups']` reads `false`. Reload: the document carries `data-sub-groups-hidden` before
   hydration, the same four bands render and the layout-shift sum stays 0 at 1440. Calendar, Training, Critical Tasks,
   Training reports, Calendar Group availability and Home's `Available · next 14 days` by-group strip all open with
   sub-group rows hidden after navigation and after reload. `A-Z` view ignores the switch. A reader whose scope is one
   leaf Group sees no band and no switch. Turn it back on before leaving.

Clean up from the owner's page: `POST /org/<orgA>/api/personnel/archive-batch` with `{ids}` for the nine People,
`DELETE /org/<orgA>/api/personnel/permanent` with `{id}` for each, then `DELETE /org/<orgA>/api/groups` with `{id}` for
the teams, the squads and the platoon, one request at a time. A Group still responsible for a Tasking answers 409 naming
it; move that Tasking to `Organization level` and cancel it first. Read back with `$V rows groups orgA` and
`$V rows personnel orgA`.

## Gotchas

- `Add` is disabled for an empty name. A duplicate name is refused before any request (see
  [Invalid input](invalid-input.md)).
- A row appearing immediately after `Add` is not persistence proof. Read `rows groups` or reopen after reload.
- `Done` closes even with a typed draft and discards it; while a draft exists the `Close` button is absent and Escape is
  blocked. Clear a draft with Control+A and Backspace, because a native `fill` with an empty string does not update the
  bound value.
- Options in `Add people` appear only in a `verbose` snapshot; click the option UID from there.
- Tree picker rows are `treeitem`s named `<name>` (Group fields) or `<name> <count>` (scope pickers), so two teams named
  `Alpha Team` match the same name; search, then click the UID under the right ancestor. Clearing the search with a
  native `fill` of an empty string does not update the list.
- Names repeat across squads, so read `rows groups` by ID and `parent_id`, not by name.
- Denial needs server response and no-effect readback; a hidden button alone cannot prove it. Route, store and component
  tests cover the remaining verbs, keyboard paths and pending states.
