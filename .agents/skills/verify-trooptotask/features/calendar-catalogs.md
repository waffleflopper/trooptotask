# Calendar catalogs

An Organization Calendar configurator maintains status and assignment choices; saved availability and assignments retain
their references through edits, while confirmed type deletion explains and removes only linked records.

## Sub-features

- `status-types`: add and edit name, one-day label and colors in the inline composer, reload, keep ID and linked leave;
  confirmed deletion removes linked availability and records an audit/notification effect.
- `status-effect`: every status type has a roster effect, set under `On duty rosters` in the composer:
  `Still available`, `Away` (A), `Other duty` (D) or `Misconduct` (U). A status row shows the code chip and effect text.
  Editing a saved status's effect first lists the numbers it changes on open DA 6 forms and saves only after
  confirmation; a new status, or an edit that changes no number or day (planned days included), saves without one.
  Saving never changes an assignment or a closed form.
- `status-order`: drag or keyboard-move status types to set the legend and picker order; every move is one ordered
  command that refuses a stale list.
- `assignment-types`: add Person and Group choices, edit name/code/color, keep ID/order and saved assignment; archived
  history remains readable but not an active choice.
- `duty-roster`: a Person type keeps a DA 6 duty roster. Its pool rules, dated excusals with reasons and weekend mode
  are set in the sheet's `Duty roster` section, and a live count shows who the rules match. Changing the rules or
  weekend mode closes the open DA 6 form on the day Save is pressed, saves it, and opens the next form the day after,
  carrying everyone's count. Only the server closes a form, and SQL rechecks the actor's Organization-wide Calendar
  configuration access. Successor numbers always have origin `carried`, even on another rule change before the form
  starts. `supabase/tests/roster_close_server_only.sql` proves the direct-RPC denial and carried-number lock. An excusal
  change saves in place. Switching the type to Group closes its open form the same way, and switching back to Person
  opens a fresh one. Only Settings loads the rank catalog; while it loads or after it fails, the rules editor alone
  waits or explains, weekends stay locked until it loads, excusals keep saving, and the rest of Calendar is unaffected.
  A saved Person type's sheet ends with a `Starting numbers` row that says whether the open form's numbers can still be
  copied in from a paper DA 6 and links to [DA 6 setup](calendar-da6.md).
- `calendar-lanes`: choose which assignment types appear as lanes under the dates and in what order; every change is one
  ordered command that refuses a stale list.
- `catalog-delete`: deleting a retiring assignment type removes its linked assignment but preserves unrelated and
  archived records. A Calendar or Dashboard snapshot read before the delete cannot bring back any assignment of that
  type, including one another member added that this tab never loaded. Store, hydrator and Dashboard read-model tests
  cover the late-snapshot order; step 5 proves only the deletion.
- `catalog-authorization`: view, operate, Group-scoped and foreign-Organization actors cannot configure the three
  Calendar catalogs.

## How to get to it (user POV)

With Organization-wide Calendar configuration access, choose `Calendar`, then `Settings` under `More Calendar controls`.
Open the `Status Types` or `Assignment Types` tab, then `Add new` or the row's actions. Status types open in one inline
composer: `Add new` opens it above the list, and a row's `More actions for <name>` → `Edit` opens it in place of that
row. A status row shows a `Reorder <name>` grip, a sample bar, the name, `One-day label · XX`, the roster effect (a code
chip and `Away, count holds`, `Other duty, count runs` or `Misconduct, count runs`; `Still available` has no chip), a
one-day chip and the `More actions for <name>` menu with `Edit` and `Delete`. The list heading reads `N status types`
beside `Drag to set legend and picker order.` An assignment type row has a `Show <name> on the calendar` switch and a
`More actions for <name>` menu with `Edit` and `Delete`. Assignment types sit in two lists: `On the calendar · N lanes`
in lane order with a `Reorder <name>` grip on each row, and `Duty planner only` sorted by name. Assignment type Add and
Edit open a side sheet. A deletion dialog says what the delete removes: schedule entries for a status, assigned days and
saved DA 6 forms (and, for a Person type, its duty roster) for an assignment type. `Holidays & closures` is the third
section and is driven in [Special days](special-days.md).

### Helper controls

`calendar-lanes` and `status-order` stop `rpc/set_calendar_lanes` and `rpc/set_status_type_order` before dispatch. Their
`-lost-ack` and `-hold` forms follow the [shared fault variants](special-days.md#helper-controls).
`$V network arm-fail $PAGE status-types/preview` fails the next effect preview with a 503.

## Driving it with verify:app

Preconditions: doctor passes on a fresh seeded worker; `$V actor calendarConfigure calendar/settings` returns `PAGE`;
`$V fixture` supplies IDs for seeded Leave/Retiring status, Staff/Group/Retiring/Archived assignment types, their
referenced availability/assignments, and the unrelated March record. The seeded A lanes are Staff (`sort_order` 0) then
Group (1); Retiring is planner only and Staff excuses Baker with the reason `First sergeant`. Capture each dialog before
confirmation. Row actions are named, such as `More actions for Verification Leave` → `Edit` and
`More actions for Verification Retiring Duty`. Run the deletion steps last, after journeys that need those rows.

1. **Status choices:** Open `Status Types`, add a uniquely named type through `Add new`, the `New status type` form's
   `Name` and `Add status type`. Leave `One-day label` untouched: it shows the first three letters or digits of the
   name, and `$V rows status_types orgA name <name>` reads `short_label` null and `sort_order` one past the highest.
   Reload and see the new type last. Open `More actions for Verification Leave` → `Edit`, change `Name`, type `lv` in
   `One-day label`, pick a swatch under `Color` and `Dark` under `Text`, then `Save changes`. Reload and reread; the row
   reads `One-day label · LV`. `$V rows status_types orgA id <statusLeave>` must show the same ID and sort order `11`
   with changed name, colors and `short_label` `LV`; `$V rows availability_entries orgA id <availabilityAlpha>` must
   still point to it. Edit that same ID back to `Verification Leave`, clear `One-day label`, set `Custom color` to
   `#166534` and choose `White`; reload and read back the original fields, `short_label` null, ID, order `11`, and
   linked availability before another journey uses Leave. Only the order command changes a position. Send an
   authenticated `PUT /org/<orgA>/api/status-types` with `{id: statusLeave, sortOrder: 0}` through the signed-in page
   using the request shape below; require `400` and read back order `11` on that same ID. Remove the type you added
   through its visible Delete confirmation and verify its row is absent.
2. **Assignment choices:** In `Assignment Types`, use `Add new` to add one Person-targeted type and one Group-targeted
   type with unique names and short codes, choosing `Group` under `Assigned to` on the second sheet. Both land in
   `Duty planner only` with `show_on_calendar: false`. Open `More actions for Verification Staff Duty` → `Edit` and
   change name, code and color; reload. Read back the same type ID, `sort_order` 0, `show_on_calendar: true`, Baker's
   open `roster_excusals` row and linked saved assignment ID. The active Settings lists exclude
   `Verification Archived Duty`, but an authenticated Calendar range and a reloaded Calendar page bootstrap for
   September 15 must still include its archived label and referenced assignment, without the foreign assignment type.
   Exercise Cancel on a separate edit without changing the row. Edit the same Staff ID back to
   `Verification Staff Duty`, code `VSD`, color `#166534`, and Person target. Reload and read back the original ID,
   fields, order 0, Baker's excusal, and linked assignment before another journey uses Staff Duty. Remove only the two
   types you added through their visible Delete confirmations and verify their rows are absent. **Status order.** Record
   `$V rows status_types orgA` first. Focus `Reorder Verification Leave` and press ArrowDown. The live region says
   `Verification Leave moved to position 2 of N`, focus stays on the grip, and native `list_network_requests` shows one
   `PUT api/status-types/order` with the full id list in `statusTypeIds` and the previous list in
   `expectedStatusTypeIds`. To see moves fold, run `$V network arm-hold $PAGE status-types/order` first (a local `PUT`
   settles in under 200 ms, so keys pressed by hand each send their own), press ArrowDown twice while the `PUT` is held,
   and release: `network state` shows one held `PUT`, and one follow-up `PUT` carries both moves. Drag another grip with
   the pointer. Reload. The list, the Calendar legend and the status choices in the availability dialog and the bulk
   pages follow the saved order, and `$V rows status_types orgA` shows dense `sort_order` values 0 to N-1 in that order.
   Type a filter: the grips disappear and the list says `Clear search to reorder.` Clear it. Step 11 drives its failed,
   lost and concurrent paths. The original positions are not restorable through Settings, so later steps compare
   positions against this step's readback. **Lanes.** The lane list reads `On the calendar · 2 lanes` with Staff then
   Group. Switch on `Show Verification Retiring Duty on the calendar`. It moves to the end of the lane list, and native
   `list_network_requests` shows one `PUT api/assignment-types/lanes` with `laneTypeIds` [Staff, Group, Retiring] and
   `expectedLaneTypeIds` [Staff, Group]. Focus `Reorder Verification Retiring Duty` and press ArrowUp twice. The live
   region says `Verification Retiring Duty moved to position 1 of 3`, focus stays on the grip, and the moves fold into
   at most one follow-up `PUT` while the first is in flight. Drag `Reorder Verification Staff Duty` below Group with the
   pointer. Reload. The list and the Calendar lanes under the September dates follow the saved order, and
   `$V rows assignment_types orgA` shows `show_on_calendar` true with `sort_order` 0, 1 and 2 in that order. With more
   than three lanes the list notes `Each lane adds about 26px above the roster.` Type `Retiring` in the filter: the
   grips disappear and the list says `Clear search to reorder.` Clear it. Then open
   `More actions for Verification Retiring Duty` → `Edit`, turn `Show on the calendar` off and save. Retiring returns to
   `Duty planner only` by name, and its row reads `show_on_calendar: false`. Restore the seeded order with the grips:
   Staff then Group. Read back Staff at 0, Group at 1, Retiring off, and unchanged saved assignments. Step 10 drives its
   failed, lost and concurrent paths.
3. **Server configuration boundary:** In separate signed-in pages, send uniquely named authenticated `POST` requests to
   A's `api/status-types`, `api/assignment-types`, and `api/special-days` as `calendarView`, `calendarOperate`,
   `calendarScoped`, `calendarEmpty`, `calendarScopedConfig`, and `manager`. Each must return `403` or `404` and
   `$V rows` for the relevant A table/name must remain empty. As `calendarConfigure`, send each request to B and confirm
   denial and no B row. A Calendar range as the configurator must still read its own status and assignment IDs. Use the
   explicit payloads below; a `400` does not establish authorization denial. Also as `calendarView`, send
   `PUT /org/<orgA>/api/status-types` with `{id: statusLeave, name: uniqueMarker}`. Require `403` or `404`, then
   `$V rows status_types orgA id <statusLeave>` must retain its original name, colors and order under the same ID. As
   `calendarConfigure`, send `PUT /org/<orgA>/api/assignment-types` with `{id: typeDelete, showOnCalendar: true}` and
   `POST /org/<orgA>/api/assignment-types` with the table's create payload plus `showOnCalendar: true`. Each must return
   `400`, the A lanes must stay Staff then Group and no `MARKER` row may exist; only the lane command writes
   `show_on_calendar` and lane order.
4. **Status deletion:** Choose `More actions for Verification Retiring Status` → `Delete`. Capture the warning that
   every schedule entry with this status will be removed, then confirm. A status with a roster effect adds that open DA
   6 forms recalculate and closed forms keep their saved numbers; one that is `Still available` says neither. Read back
   absence of `statusDelete` and its linked `availabilityDelete`, while the March historical entry remains. Compare A's
   `audit_logs` and `notifications` before/after: expect a `status_type.deleted` event for that ID and a
   `Status Type Deleted` administrator notification. Notification delivery is asynchronous, so observe it without
   claiming it committed atomically with deletion.
5. **Assignment deletion:** Choose `More actions for Verification Retiring Duty` → `Delete`. Capture the warning that
   every day it is assigned will be removed, then confirm. A person-assigned type also names its duty roster and saved
   DA 6 forms; a Group-assigned type names only its saved DA 6 forms. Read back absence of that type and its linked
   assignment; the Staff assignment and archived type/assignment remain. Compare notifications before/after for
   `Assignment Type Deleted`. Do not remove seeded Staff, Group or archived history. Before another journey needs either
   deleted fixture, run `npm run --silent verify:app -- restart --worker "$WORKER"`, then `doctor` and `$V fixture`
   again.
6. **Settings appearance.** Run steps 6 to 9 before steps 4 and 5 so the seeded rows are present. As `calendarConfigure`
   on `/calendar/settings`, use `resize_page` for 1280x800 and the visible **Toggle theme** for light. For each of
   `Status Types` and `Assignment Types`, capture the section tab in `Calendar settings sections` with its count and
   selected state, the panel heading, the `Calendar settings controls` toolbar (`Back to Calendar`, `Filter <section>`
   and the pinned `Add new`) and every row. A status row shows its grip, sample bar, name, `One-day label · XX`, one-day
   chip and `More actions for <name>`. An assignment type row shows its grip in the lane list, the short code outlined
   in the type color, the name, `Person` or `Group`, the switch with `On calendar` or `Planner only`, and
   `More actions for <name>`; capture both assignment type lists. With read-only evaluation, read each row action's
   `getBoundingClientRect()` right edge against its row's and `innerWidth`, and `document.documentElement.scrollWidth`
   against `innerWidth`. Type `zzz` in `Filter <section>` and capture the empty message for each section, then clear it.
   Repeat at 390x844 dark. Every row action must stay inside its row without horizontal scrolling, and every assignment
   type name must stay readable: where the row is narrow its switch and actions wrap below the name.
   [Special days](special-days.md) captures the `Holidays & closures` section.
7. **Settings forms and keyboard.** Open `Add new` in each section and capture the named fields: the inline
   `New status type` form's `Name`, `One-day label` with `Up to 3 letters`, the `Text` White/Dark toggle, the `Color`
   swatches with `Custom color`, and the preview of a one-day bar, a name bar and a name-with-note bar; `Full name`,
   `Short code`, `Color`, the `Assigned to` Person/Group toggle, the `Show on the calendar` switch and, for a Person
   type, the `Duty roster` section with `Who pulls this duty`, `Excused from this roster` and `Weekends & holidays`.
   With the name empty the submit button is disabled. Typing a name updates the untouched `One-day label` and the
   preview. A saved custom text color selects neither `White` nor `Dark` and is kept until one is chosen. With changes
   in the status composer, opening `Edit` on another row asks `Discard changes?`; `Cancel` keeps the draft and `Discard`
   opens the other row. `Add Assignment Type` also stays disabled until `Short code` is filled. The assignment type
   editor opens as the wide side sheet (`data-size="wide"`). Turning `Show on the calendar` on for a planner-only type
   shows `Adds lane N of N under the dates.`, a lane preview and the row marker preview; an existing lane reads
   `Lane N of M under the dates.` Choosing `Group` hides the `Duty roster` section; the `Assigned to` help reads
   `Group assignments have no duty roster.` For the assignment type dialog, press Escape on the clean form and record
   the focused element with read-only evaluation. A dialog with any change refuses Escape (`closeBlocked`); close it
   with Cancel. The status composer is inline. Escape inside it closes a clean draft and asks `Discard changes?` for a
   changed one; focus returns to `Add new` or the row's `More actions for <name>`. A second `Add new` with a changed new
   draft asks the same, and `Discard` opens an empty composer. Using only the keyboard from the selected section tab,
   press ArrowDown to `Assignment Types`, then press Tab until `More actions for Verification Staff Duty` has focus (the
   filter, `Back to Calendar`, `Add new`, the tab panel, `Reorder Verification Staff Duty` and
   `Show Verification Staff Duty on the calendar` come first), press Enter, choose `Edit` with Enter, then press Escape,
   and record the sheet's name and the focused element after it closes. Record the Tab order through the section tab,
   `Filter <section>`, `Back to Calendar`, `Add new`, the section's tab panel, each lane row's grip, switch and actions
   menu, then each planner-only row's switch and actions menu, with a visible focus indicator on each.
8. **Busy and failed save.** Open `More actions for Verification Leave` → `Edit` and change `Name` to a unique marker.
   Arm `$V feedback arm $PAGE` and `$V busy arm $PAGE`, run `$V calendar-grant calendarConfigure view`, then click
   `Save changes`. Require `busy state` to show `Save changes` disabled while the request is pending, the denied
   request, a visible failure message, the composer still open with the marker in `Name`, and
   `$V rows status_types orgA id <statusLeave>` unchanged. The assignment type dialog actions are not
   `button[type=submit]`, so the held Edit Closure dialog in [Component foundation](component-foundation.md) step 4 is
   the dialog busy proof. Restore the grant and the observer, then Cancel without saving. Repeat the denial for
   `Add new` in `Assignment Types` with a unique `Full name` and `Short code`; the dialog keeps both values and no row
   is created. Capture both cases at 1280 light and 390 dark.
9. **Denied Settings.** As `calendarView` and `calendarScopedConfig`, open `/calendar/settings` and capture the
   `Access restricted.` card and its `View calendar` link at 1280 light and 390 dark. Settings has no read-only catalog
   view.

10. **Lane change interruption.** Run after step 2 and before steps 4 and 5, starting from the seeded lanes Staff then
    Group. For every case, save `$V rows assignment_types orgA` and `orgB` before and after, both visible lists,
    `$V feedback state`, the fault or network receipts, and the same read after reload. Then reload and restore Staff
    then Group before the next case. A requested lane list must win, or the previous one must remain. A confirmed
    rejection leaves the previous lanes. An unconfirmed result may have committed, and a later command can replace it,
    so compare the visible lists and toast with the rows read when the page settles, before any reload. Every case must
    leave B's types unchanged. From the change through its outcome, the lists show the requested order even after
    leaving and reopening the section. Lane switches and grips stay enabled, and further changes fold into one follow-up
    `PUT` of the latest order; every row's `Edit` and `Delete` stays disabled.
    `$V network arm-fail|arm-hold PAGE assignment-types` matches only the next same-origin request to A's exact
    `api/assignment-types` path, of any method, so `network state` must show the intended method.
    - **Command fails.** Run `$V fault arm calendar-lanes`, then switch off
      `Show Verification Group Duty on the calendar`. The command gets a synthetic PostgREST 503 before dispatch, so the
      route answers `500`. The page makes one assignment-type read and shows one toast:
      `We couldn't confirm the calendar lane change. The calendar shows Verification Staff Duty and Verification Group Duty.`
      Group returns to the lane list and the rows are unchanged. Restore with `$V fault restore`.
    - **Reply lost.** Run `$V fault arm calendar-lanes-lost-ack` and switch Group off. The command commits and the
      server's SDK sees a transport failure, so the route answers `503`. The read finds Staff alone, so the toast says
      `The calendar shows Verification Staff Duty.` and Group stays in `Duty planner only` without a second command.
      `fault state` shows one match.
    - **Held reply across a section switch.** Run `$V network arm-hold $PAGE assignment-types/lanes` and switch Group
      off. When `network state` shows a held PUT with status `200`, select the `Status Types` section tab, then
      `Assignment Types` again without reloading. Group must still be in `Duty planner only`, and every row's `Edit` and
      `Delete` must be disabled. Switch on `Show Verification Retiring Duty on the calendar`; `network state` must still
      show one PUT. Release. One more `PUT` follows with `laneTypeIds` [Staff, Retiring] and `expectedLaneTypeIds`
      [Staff], with no toast, and after reload the rows hold Staff then Retiring.
    - **Held read after the command fails.** Run `$V fault arm calendar-lanes` and
      `$V network arm-hold $PAGE assignment-types`, then switch Group off. When `network state` shows the follow-up
      `GET` held, switch to `Status Types` and back. Every row's `Edit` and `Delete` must be disabled. Arm
      `$V feedback arm $PAGE` and release. Exactly one toast says the change couldn't be confirmed and names Staff and
      Group as the calendar lanes, the actions enable and the rows are unchanged. Restore both controls.
    - **Read after the command fails.** Run `$V fault arm calendar-lanes` and
      `$V network arm-fail $PAGE assignment-types`, then switch Group off. The command answers `500` and `network state`
      shows the follow-up `GET` failed with `503`. The page shows one toast:
      `We couldn't confirm the calendar lane change. Reload to see the saved lanes.` The rows are unchanged. Restore
      both controls.
    - **Held reply and a newer load.** On page 1 run `$V network arm-hold $PAGE assignment-types/lanes` and switch Group
      off. When `network state` shows a held PUT with status `200`, open a second tab as `calendarConfigure` with the
      returned `browserContext`, which loads Staff alone, and switch Retiring on there; wait for its `200`. A month
      change cannot supply the newer load: Calendar range loads reuse the loaded types. On page 1 clear resource
      timings, then without reloading choose `Back to Calendar`, the sidebar `Home` link and, once the Overview settles,
      the sidebar `Calendar` link and `Settings`. Before releasing, require the `__data.json` timings to show both
      loads, page 1's Settings to still show its pending list, and `network state` to still show the PUT held. Save
      native `list_network_requests` for page 1, arm `$V feedback arm $PAGE`, then release. The follow-up
      `GET api/assignment-types` must appear in a second native `list_network_requests` after release. Exactly one toast
      must say the change couldn't be confirmed and that the calendar shows Verification Staff Duty and Verification
      Retiring Duty, matching the recovery read. Page 1 sends no second `PUT` after the release, and the rows hold Staff
      then Retiring. Restore the hook and the observer.
    - **Delayed add.** Run `$V network arm-hold $PAGE assignment-types`, add a uniquely named type and, while
      `network state` shows its `POST` held, see every lane switch and grip disabled. Release, see the type listed under
      `Duty planner only`, restore the hook and remove the type through its Delete confirmation.
    - **Lifetime ends during the command.** As `calendarConfigureSwitch`, which can configure Calendar in both
      Organizations, on A Settings, run `$V network arm-hold $PAGE assignment-types/lanes`. It holds the PUT's real
      response after the provider commits it. Switch Group off. `network state` must show one held PUT with status
      `200`. While it is held, every row's `Edit` and `Delete` is disabled. Switch to B through `Switch organization`.
      While A's PUT is still held, B's switches, grips and row actions must be enabled. Run `$V network release $PAGE`,
      and save `network state` again. B's Settings must not show A's lanes or a toast, and A's rows hold Staff alone.
      For the reload variant, use `calendarConfigure`, hold the same way, then reload. The reload removes the hook, so
      the provider rows are the evidence there.
    - **Workspace refresh during a type edit.** First save a lane change. Hold an assignment-type edit response, then
      load another same-Organization workspace while the edit remains pending. A second configurator's change to another
      type must appear after the held edit settles and one fresh catalog GET completes. Cover a successful edit and a
      refused edit. The pending edit must not prevent daily rows from loading. With no intervening workspace load,
      settling the same edit must send no catalog GET. Restore the edit and both actors' changes. The edit sheet is
      modal, so a native click on the sidebar `Home` and `Calendar` links does nothing while the edit is pending: click
      them with `evaluate_script` (`a.click()` on the link whose `href` is the Organization's Home or Calendar path),
      which still runs the client router. For the refused edit, run `$V calendar-grant calendarConfigure view` before
      saving so the held reply is a `403`, make the second configurator's change as `calendarConfigureSwitch`, then run
      `$V calendar-grant calendarConfigure restore` before releasing: the follow-up `GET` needs the grant, and with it
      still revoked the page reports `We couldn't refresh assignment types.` instead. Store tests cover simultaneous
      edit/add acknowledgments, an ended Organization lifetime, and a catalog GET already in flight when a deletion or
      lane change starts. That GET's answer is discarded and one more GET follows once the write settles.
    - **Concurrent changes.** Open a second tab as `calendarConfigure` with the returned `browserContext` and leave it
      unreloaded. Run `$V fault arm calendar-lanes-hold`. Switch Group off on page 1, then wait until `fault state`
      shows `held`, which means page 1's command has not been dispatched. On page 2, switch Retiring on and wait for its
      PUT to settle with `200`. Then run `$V fault release calendar-lanes-hold`. Page 1's command still expects Staff
      then Group, so the database refuses it with `Calendar lanes changed` (SQLSTATE `CLN01`). The route answers `409`
      within a second or two and page 1 shows one toast:
      `Another Calendar change was saving at the same time, so this change was not saved. Try again.` Both pages show
      Staff, Group and Retiring after reload, and the rows match. Read `$V rows assignment_types orgA` again about 90
      seconds later: it still holds Staff, Group and Retiring. The hold orders the commands; the database lock and row
      waits are proved by `supabase/tests/calendar_configuration_command_concurrency.sql`, not by this case.
    - **Stale Calendar workspace after a change.** As `calendarConfigure` on A Settings, run
      `$V fault arm calendar-lanes-hold`, switch Group off and wait until `fault state` shows `held`. Choose
      `Back to Calendar`, the sidebar `Home` link and, once the Overview settles, run
      `$V server-source arm assignment_types hold 1 120000`. Choose the sidebar `Calendar` link. When
      `server-source state` shows the A type read held, run `$V fault release calendar-lanes-hold` and wait for native
      `list_network_requests` to show the `PUT` answered `200`. Then run `$V server-source release` and open `Settings`.
      Group must stay in `Duty planner only` and the Calendar must show Staff as its only assignment lane. The day's
      assignments must stay listed with no `role="alert"` and no toast, and native `list_network_requests` must show one
      `PUT` and two `GET api/assignment-types` calls in this sequence. The first confirms the command after Home loaded
      another workspace during the pending change. The second reconciles the separately delayed Calendar catalog after
      its source is released. Neither event may send another read. `$V rows assignment_types orgA` and the page after
      reload hold Staff alone. Restore both controls. For the control, switch Retiring on with no hold, then go to the
      Overview and back to Calendar Settings: one `PUT` and no `GET api/assignment-types`.

For each endpoint probe, substitute the public synthetic IDs and a unique marker from this run. Use the actor's returned
`PAGE`; `$V actor manager personnel` supplies the no-Calendar member's signed-in page. `tool evaluate_script` runs this
request in that page, with `PATH`, `METHOD`, and `PAYLOAD` replaced by the selected case:

```bash
npm run --silent verify:app -- tool evaluate_script "{\"pageId\":$PAGE,\"function\":\"async () => { const response = await fetch('PATH', {method:'METHOD',headers:{'Content-Type':'application/json'},body:JSON.stringify(PAYLOAD)}); return {status:response.status,body:await response.text()}; }\"}" --worker "$WORKER"
```

| POST path within the selected Organization | Payload                                                                               | No-effect readback                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `api/status-types`                         | `{name:'MARKER',color:'#166534',textColor:'#ffffff',shortLabel:'MK'}`                 | `$V rows status_types orgA name MARKER`                             |
| `api/assignment-types`                     | `{name:'MARKER',shortName:'DN',assignTo:'personnel',color:'#166534',sortOrder:1}`     | `$V rows assignment_types orgA name MARKER`                         |
| `api/special-days`                         | `{action:'addClosureDays',name:'MARKER',dates:['2026-09-21']}`                        | `$V rows special_days orgA name MARKER`                             |
| `api/special-days` reset                   | `{action:'resetFederalHolidays'}`                                                     | `$V rows special_days orgA type federal-holiday` keeps every ID     |
| `api/assignment-types/lanes` (`PUT`)       | `{laneTypeIds:['<typeGroup>'],expectedLaneTypeIds:['<typePersonnel>','<typeGroup>']}` | `$V rows assignment_types orgA` keeps Staff then Group as the lanes |
| `api/status-types/order` (`PUT`)           | `{statusTypeIds:[saved ids reversed],expectedStatusTypeIds:[saved ids]}`              | `$V rows status_types orgA` keeps every `sort_order`                |

Use `/org/<orgA>/` for the six denied local actors and `/org/<orgB>/` for the configurator's foreign attempts; read
`orgB` for those foreign attempts. Preserve each request/status and exact row result. Use the same request shape for the
`PUT` cases above, substituting their specified payloads and the actual `statusLeave` ID.

11. **Status order interruption.** Run after step 1. For every case, save `$V rows status_types orgA` before and after,
    the visible list, `$V feedback state`, the fault or network receipts, and the same read after reload. A requested
    order must win, or the previous one must remain.
    - **Command fails.** Run `$V fault arm status-order`, then move `Verification Leave` down one place. The command
      gets a synthetic PostgREST 503 before dispatch, so the route answers `500`. The page makes one
      `GET api/status-types` and shows one toast:
      `We couldn't confirm the status order change. The list shows the saved order.` The list shows the previous order,
      the live region says `Verification Leave is now at position 1 of 3`, and the rows are unchanged. Restore with
      `$V fault restore`.
    - **Reply lost.** Run `$V fault arm status-order-lost-ack` and move Leave down. The command commits and the route
      answers `503`. The read finds the new order, so the same toast shows and the list keeps the moved order without a
      second command. `fault state` shows one match.
    - **Read after the command fails.** Run `$V fault arm status-order` and `$V network arm-fail $PAGE status-types`,
      then move Leave. The follow-up `GET` fails with `503` and the toast says
      `We couldn't confirm the status order change. Reload to see the saved order.` Restore both controls.
    - **Writes wait for the order.** Run `$V network arm-hold $PAGE status-types/order` and move Leave. While the `PUT`
      is held, `Delete` in every row's actions is disabled and an open composer's submit button is disabled. Release;
      one `PUT` settled `200`, and the actions enable.
    - **Concurrent changes.** Open a second tab as `calendarConfigure` with the returned `browserContext` and leave it
      unreloaded. Run `$V fault arm status-order-hold`, move Leave down on page 1 and wait until `fault state` shows
      `held`. Use snapshots, not screenshots, while page 2 is open. On page 2 move a different type so the two results
      differ (for example page 1 moves Retiring Status up while page 2 moves the first type down), and wait for page 2's
      `200`. Run `$V fault release status-order-hold`. Page 1's command still expects the old order, so the database
      refuses it with `Status type order changed` (SQLSTATE `STO01`) and the route answers `409`. Page 1 makes one
      `GET api/status-types`, shows page 2's order and one toast:
      `Another Calendar change was saving at the same time, so this change was not saved. Try again.` `fault state`
      shows the held command `dispatched` with `providerStatus` 400, and `$V rows status_types orgA` read about 90
      seconds later still holds page 2's order. If both pages' moves produce the same final list, the command converges,
      the route answers `200` and no toast shows, so choose moves that differ. The database lock and row waits are
      proved by `supabase/tests/calendar_status_type_order_concurrency.sql`, not by this case.

12. **Duty roster.** Run after step 2 and before steps 4 and 5. A has three active people, all SPC: Able (68W, Alpha),
    Baker (11B, Bravo) and Unassigned (68W, no Group). Record `$V rows assignment_types orgA`,
    `$V rows roster_forms orgA` and `$V rows roster_excusals orgA` first. Every Person type has exactly one open form
    (`ends_on` null), and Staff's open excusal is Baker's.
    - **Rules and the live count.** As `calendarConfigure`, `Add new` in `Assignment Types` with a unique `Full name`
      and a `Short code`, leaving `Person`. `Who pulls this duty` starts on `Everyone`, which reads
      `All 3 people in the Organization`. Choose `Only people who match`. A rank row opens with `From rank` and
      `Through rank`; choose `Add Assignment Type` with them empty and the field error reads
      `Pick both ends of the rank range.` While the range is half picked the count still reads all 3. Choose `SPC` and
      `SPC`: the count reads `3 people on this roster`. Under `And also` choose `MOS`, focus the `MOS` combobox, type
      `68W` and press Enter: `2 people on this roster`, previewing `SPC Able, SPC Unassigned`. `See list` opens a
      popover listing the same two.
    - **Group rule in a nested tree.** With the [nested Group tree](manage-groups.md#nested-group-tree) seeded,
      `And also` › `Group` adds a `Group: <label>` tree button with `Remove the group rule`. From `Find a Group`, pick
      `1st Squad` and then `2nd Platoon` by keyboard: the trigger reads `Group: 2nd Platoon`, `1st Squad` shows
      `included` and is disabled, and a stored id no longer in the catalog reads `Another group`. Remove the rule before
      the next step.
    - **Excusal needs a reason.** Choose `Excuse someone`, pick Able under `Person to excuse`, leave `Reason` empty and
      choose `Excuse`. Able is not excused and the field error reads `Add a reason. It prints as a remark on the DA 6.`
      Type `Profile` and choose `Excuse`. A chip reads `SPC Able Profile` with `Reinstate SPC Able`, and the count reads
      `1 person on this roster`. Choose `Add Assignment Type`. No confirmation opens for a new type.
      `$V rows assignment_types orgA name <name>` reads `roster_pool_rules`
      `{"mos":["68W"],"rank":{"to":"SPC","from":"SPC"},"role":[],"groupIds":[]}` (all four rules, in jsonb key order)
      and `roster_weekend_mode` `same`. `$V rows roster_forms orgA assignment_type_id <id>` shows one open form starting
      today (UTC) with those rules, and `$V rows roster_excusals orgA assignment_type_id <id>` shows Able with reason
      `Profile`, `starts_on` the browser's today and `ends_on` null.
    - **Starting numbers row.** Reopen the type's `Edit`. Under `Weekends & holidays` a `Starting numbers` row reads
      `Everyone starts even. Keeping a paper DA 6 already? You can copy it in until the first <code> is pulled.` with a
      `Copy it in` link to `/calendar/rosters/<id>?setup=1`. Change the name: the link becomes a disabled button and the
      row adds `Save or cancel your changes first.` A new type's sheet has no row. After copied numbers are saved it
      reads `Copied from a paper DA 6. You can change them until the first <code> is pulled.` with `Change them`; once a
      detail is served it reads `… has been pulled, so they’re part of the record now.` with no button. Choose `Cancel`.
    - **A rule change starts a new form.** Reopen the type's `Edit`. Under `Weekends & holidays` choose
      `Separate count`, then `Save Changes`. A `Start a new DA 6?` dialog reads
      `This starts a new DA 6 on <tomorrow as D Mon>. The current form closes as it is. Everyone keeps their current count.`
      Choose `Cancel`: no form changes and the sheet stays open. Save again and choose `Save changes`. Native
      `list_network_requests` shows one `PUT api/assignment-types/roster`.
      `$V rows roster_forms orgA assignment_type_id <id>` now shows the first form with `ends_on` today and `record`
      `{"segments":[]}` (a month records a segment only once someone holds the duty in it), and a new open form starting
      tomorrow with rules `{"pool":{…},"weekendMode":"separate"}`.
      `$V rows roster_starting_numbers orgA form_id <new form>` carries Unassigned at `0` on both the `weekday` and
      `weekend` tracks with origin `carried`. Able stays excused with the same `roster_excusals` row. Reopen `Edit` and
      the sheet reads back `Separate count`, the SPC to SPC and 68W rules, and Able's chip. The `Starting numbers` row
      reads `Carried over from the last DA 6 when the roster rules changed. They’re part of the record.` with no button.
    - **A second change the same day.** Edit again, remove the MOS rule with `Remove the MOS rule`, and confirm. The
      count first reads `2 people on this roster`. The open form keeps its id and tomorrow's start with the new rules in
      place; no third form appears.
    - **Excusals alone.** Edit again, choose `Reinstate SPC Able` and `Save Changes`. No confirmation opens, Able's
      `roster_excusals` row is deleted (it started today), and the forms are unchanged.
    - **Group types.** Open `More actions for Verification Group Duty` → `Edit`; there is no `Duty roster` section and
      no `Excuse someone`.
    - **Switching to Group closes the form.** Edit the new type, choose `Group` and `Save Changes`.
      `$V rows roster_forms orgA assignment_type_id <id>` shows no open form; the last form ends today (UTC) with a
      saved `record`, and `$V rows assignment_types orgA name <name>` reads `assign_to` `group`. Edit again, choose
      `Person` and save: one new open form starts tomorrow.
    - **Rank catalog unavailable.** Run `$V server-source arm organization_rank_catalog fail-hard 1 120000` (the client
      retries a 503, so plain `fail` recovers), reload `/calendar/settings` and open the type's `Edit`.
      `Who pulls this duty` shows a `role="alert"` reading `Ranks unavailable` in place of `Everyone` and the rules, and
      saying roster rules, weekends and switching to Group can't change right now. The three `Weekends & holidays`
      choices and the `Group` choice of `Assigned to` are disabled, while `Excuse someone` still works and saves in
      place. Adding a new type through `Add Assignment Type` still offers `Group`. `$V server-source state` shows the
      matched read. Choose `Cancel`, `$V server-source restore`, then arm it again and open the sidebar `Calendar`: the
      planner and its lanes load with no `role="alert"`, and `server-source state` shows no match, because only Settings
      reads the catalog. Restore the control.
    - **Layout.** With the match rules and an excusal showing, capture the sheet at 1440x900 light, 900x800 and 390x844
      dark. At 1440 and 900 the sheet is 560 px wide and every `Who pulls this duty`, `Assigned to` and
      `Weekends & holidays` choice, including `Only people who match` and `Separate count`, sits on one line (32 px
      tall). At 390 the sheet fills the width. The rule rows wrap without horizontal scrolling, and
      `document.documentElement.scrollWidth` equals `innerWidth`.
    - Remove the type through its visible Delete confirmation; its forms, numbers and excusals go with it.

13. **Status roster effect.** Run after step 12. Record `$V rows status_types orgA`: every seeded status reads
    `roster_effect` `A`, and each row shows the `A` chip with `Away, count holds`.
    - **New status.** `Add new`, name `Verification AWOL`. `On duty rosters` shows four cards, `Still available`,
      `Away`, `Other duty` and `Misconduct`, with `Away` chosen. Choose `Misconduct` and `Add status type`. No
      confirmation opens. The row reads the `U` chip and `Misconduct, count runs`, and
      `$V rows status_types orgA name "Verification AWOL"` reads `roster_effect` `U`.
    - **Seed a number that moves.** Every roster's first form opens today (UTC), and a count moves only on a day with an
      assignment. Through the signed-in page, POST `api/availability` with personA, statusLeave and today as both
      `startDate` and `endDate`, then POST `api/daily-assignments` with today's `date`, `typePersonnel` and Unassigned's
      id from `$V rows personnel orgA`; both answer `200`. Able is away today while Unassigned holds Staff Duty, so
      Able's count holds at `0` under `A` and runs to `1` under `D`.
    - **Confirmation lists the change.** Open `More actions for Verification Leave` → `Edit`, choose `Other duty` and
      `Save changes`. A `Change what this status does?` dialog reads
      `Saving recalculates the open DA 6 forms below. Closed forms keep their saved numbers.` and lists
      `SPC Able 0 → 1 on the Verification Staff Duty DA 6`. Choose `Cancel`:
      `$V rows status_types orgA id <statusLeave>` still reads `A`, and the composer stays open. `Save changes` twice
      (composer, then dialog): the row reads the `D` chip and `Other duty, count runs`, `roster_effect` reads `D`, and a
      reload reads both back. No `daily_assignments`, `availability_entries` or `roster_forms` row changed.
    - **Planned days and a slow save.** Staff excuses Baker, so seed Unassigned instead: POST `api/availability` for
      personUnassigned and statusLeave on tomorrow, and POST `api/daily-assignments` for tomorrow to Able, so Unassigned
      is away on a planned duty day. Run the held-save and failed-save variants separately. Before each, set
      `Verification Leave` back to `Away`, confirm the change, reload and read back `roster_effect` `A`. Then edit it
      to `Other duty` and `Save changes`: the dialog also lists
      `SPC Unassigned: 1 day changes on the Verification Staff Duty DA 6` (`earlier` wording only when every changed day
      is before today). Run `$V network arm-hold $PAGE status-types`, choose `Save changes` in the dialog and see it
      stay open and busy (`Loading Save changes`, Cancel disabled), with `Name`, the effect cards and the composer's
      buttons disabled until `$V network release $PAGE`; then it closes and `roster_effect` reads `D`. With
      `$V network arm-fail $PAGE status-types` instead, the dialog stays open, enabled, with
      `Failed to save status type` under the list and `roster_effect` unchanged; `$V network restore $PAGE` and
      `Save changes` saves it.
    - **No confirmation without a change.** Edit `Verification AWOL`, choose `Away` and `Save changes`. Nobody held that
      status, so no dialog opens and `roster_effect` reads `A`.
    - **Preview failure.** Run `$V network arm-fail $PAGE status-types/preview`, edit `Verification Leave`, choose
      `Away` and `Save changes`. The dialog titled `Couldn't check roster numbers` says the status is not saved, and
      `roster_effect` still reads `D`. `$V network restore $PAGE`, choose `Try again`: the confirmation from the first
      case opens, with `SPC Able 1 → 0`.
    - **Layout.** Capture the composer and the confirmation at 1440x900, 900x800 and 390x844. Below 1024 px the effect
      cards stack, the row wraps its effect text, and `document.documentElement.scrollWidth` equals `innerWidth`.
    - Delete `Verification AWOL` through its Delete confirmation. Set `Verification Leave` back to `Away` so later steps
      read the seeded effect.
14. **Empty-state setup links.** Where a Calendar surface has no status types or no assignment types, it says
    `No status types yet.` or `No assignment types yet.` For a viewer with Calendar configure access it ends with a
    `Set up status types` or `Set up assignment types` link to `/org/ORG/calendar/settings?section=status` or
    `?section=assignments`; for anyone else it says `Ask someone who manages Calendar settings to add one.` The surfaces
    are the quick-add popover and the availability dialog (status types), the Bulk Status Add summary (status types),
    the Daily Assignments dialog and the duty planner (assignment types). The settings link opens on the named tab, and
    `?section=closures` opens `Holidays & closures`; an unknown value opens `Status Types`. To reach them, as
    `calendarConfigure` delete every status type and assignment type through their Delete confirmations (`restart`
    restores the fixture), then open Bulk Status, a Calendar day's `Set Personnel Status` dialog and `Daily Assignments`
    dialog, and the Duty planner; `calendarOperate` sees the `Ask someone` wording. Capture one status-type and one
    assignment-type empty state at 1280 px and 390 px, follow each link and read the selected tab.

## Gotchas

- Malformed, missing and foreign catalog ids and dates, and the editors' visible 4xx messages, are driven in
  [Invalid input](invalid-input.md).
- Calendar `configure` alone does not give a Group-scoped member catalog authority; Organization scope is also required.
  A missing Settings button proves only the affordance.
- The archived assignment type is excluded from active editing but must remain readable where a saved historical
  assignment references it. Deletion is intentionally destructive only for the selected linked records; retain unrelated
  history.
- The roster's `today` is the browser's day. The server refuses a day more than one day from UTC with
  `Check the date on this device, then try again.` A new type's first form opens on the UTC day.
- Native `fill` accepts select and color inputs when they appear in the snapshot. If a custom control is unnamed,
  inspect its visible label and DOM before a narrowly scoped `evaluate_script` value change, then verify the real Save
  action and persisted readback.
- Direct authenticated SQL catalog policies and foreign-reference constraints are covered by
  `supabase/tests/calendar_catalog_scope.sql` in a separate disposable database run; the browser endpoint check does not
  replace it.
- Native `fill` with an empty string leaves the `Filter <section>` list filtered, because the empty value fires no input
  event. The same search carries across section tabs. To clear it, `type_text` a character and press Backspace.
- The duty roster's `MOS`, `Role` and `Group` comboboxes and `Person to excuse` render their options without exposing
  them in `take_snapshot`. Type the value and press Enter, or read them with the `evaluate_script` below.
- The status `Select` in the availability dialog lists its options only while open, and `take_snapshot` leaves them out.
  Read them with `evaluate_script`
  (`() => [...document.querySelectorAll('[role=option]')].map((o) => o.textContent.trim())`). The Bulk Status page's
  `Status Type` combobox does list them in a snapshot.
- With two tabs open, run `select_page` with `bringToFront: true` before `take_screenshot`. A screenshot of a background
  tab can stall the owned DevTools for about three minutes.
