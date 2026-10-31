# Find personnel

A member finds a Soldier in the organization roster, switches between group and alphabetical views, and opens the
person's record.

## Sub-features

- `roster-search`: match a person by name and return to the full roster by clearing the query.
- `roster-views`: switch between `Group` and `A-Z` presentations.
- `roster-open`: open a matching person's details.
- `roster-readiness`: a Personnel manager with Calendar view access sees the current saved availability in the person's
  Overview `Next 14 days`.
- `roster-scope`: a group-scoped member sees only their assigned people and Groups.
- `roster-organization`: an Organization-scoped reader sees Alpha, Bravo, and unassigned people, but no foreign Person.
- `roster-group-headers`: in `Group` view each header has a pin toggle, a collapse toggle, the Group name and count, a
  strength bar with `N of M present`, an attention count and a `⋯` menu, all operable by pointer and keyboard; a pin
  persists for the member and a collapse lasts for the page visit. Groups run pinned first, then the Organization's
  Group order, then Unassigned. The Group column is absent in this view. Only Organization-wide readers get the pin
  toggle and the menu's `Pin`; a Group-scoped reader gets neither. With `Display` → `Show sub-groups` on, nested Groups
  draw as slimmer indented bands inside their parent, with pins on top-level bands only and no Group filter: every
  reader sees their whole visible tree. The setting persists across screens and Organizations on this device. The
  [nested Group tree](manage-groups.md#nested-group-tree) recipe gives the expected bands for Organization-wide and
  scoped readers.
- `roster-states`: the roster's empty, no-match, restricted, disabled and narrow-screen states and its URL state (only
  `?show=`).
- `roster-signals`: the header's headcount strip, each row's status dot and Needs attention, ETS/PCS day badges, the row
  keyboard and actions, and the signals lane's loading and failure states.
- `roster-quick-edit`: a row's pencil or E opens that Person's fields in place under the row; one row edits at a time, a
  change summary shows `old → new`, Enter saves, Esc cancels, leaving unsaved changes asks first, and the Data sheet
  link saves or discards before it navigates.
- `roster-note`: the row's `Note` button and N key open a popover composer that adds a follow-up or a leader note
  without leaving the roster.
- `roster-bulk`: row, header and Group checkboxes select many People, and a floating `Selected people` bar adds a
  follow-up or note for each, moves them to a Group, exports them or archives them at once.
- `roster-peek`: at 1280 px and wider a row click or Space opens a preview beside the roster that reads each section on
  its own, browses with J and K over the rows search, filter and view show, closes with Esc or Space or when a filter
  hides the shown Person, and rereads only the sections a quick edit or bulk write changed.

## How to get to it (user POV)

Sign in, choose `Personnel` in the organization navigation, and use `Search by name, rank, MOS, role, or group`. The
`Group` and `A-Z` buttons are above the roster. Choose a person's row, or focus it and press Enter, to open the record.
Each row's `Note` and `Quick edit` icon buttons show on hover or focus (always on a touch screen); N and E are their
keys. Below the md viewport (768 px) the actions column hides and `Quick edit` shows at the right of the name. A
checkbox starts each row, the header row and each Group header; checking any opens the `Selected people` bar at the
bottom of the roster, and Esc clears the selection.

## Driving it with verify:app

Preconditions: doctor passes; `$V fixture` supplies the known Person IDs and current dates; the manager, viewer and
scoped actors retain their baseline grants.

1. Run `npm run --silent verify:app -- login manager`; keep the returned page ID as `PAGE`. `take_snapshot` shows the
   searchbox, `Group` and `A-Z` buttons, and seeded `SPC Able, Synthetic`, `SPC Baker, Synthetic`, and
   `SPC Unassigned, Synthetic` rows.
2. Use `tool fill` on the searchbox UID with `Able`. Snapshot again: `Open SPC Able, Synthetic` remains and Baker is
   absent. Focus the searchbox, press `Control+A` then `Backspace` with `tool press_key`, and confirm all seeded rows
   return. A native `fill` with an empty string can clear the displayed input without dispatching the search update.
3. Click the `A-Z` button UID and snapshot the alphabetical presentation. Click `Group` and confirm the `Alpha`,
   `Bravo`, and `Unassigned` headings return.
4. Click the `Able, Synthetic` name link in the `Open SPC Able, Synthetic` row (at 1280 px and wider a row click opens
   the preview instead, step 20). Confirm the browser moved to that person's detail route and shows the same name.
   Return through the `Personnel` navigation link. For the Calendar-backed readiness check, run
   `$V calendar-grant manager view` on this owned worker, reload Personnel, and open Baker's record. Its Overview
   `Next 14 days` legend must show `Verification Training` through the fixture's `dates.uiAfter`; capture the visible
   summary and the saved Baker availability row ID from `$V fixture`/`$V rows`. Run `$V calendar-grant manager restore`
   immediately afterward, including after a failed attempt.
5. Sign in as `viewer` in its own page. The Organization roster must show Able, Baker, and Unassigned, while Foreign is
   absent. Capture the visible rows and an authenticated read-only request to the current `/personnel/__data.json`;
   compare the returned text against `personA`, `personB`, `personUnassigned`, and `personForeign` IDs from
   `$V fixture`. The first three must be present and the foreign ID absent.
6. Sign in as `scoped` in another page. Its Alpha roster must show Able and exclude Baker, Unassigned, and Foreign.
   Alpha appears in the page header; there is no Group band or `Group`/`A-Z` switch because Alpha is its only
   visible Group and has no sub-groups. Repeat the page-data ID comparison: only `personA` may appear, and
   neither the Bravo Group ID nor its name is in the Group catalog, and the pinned Groups list is empty. Save the
   visible and page-data observations together. A blank or failed data response is not a passing scope check.
7. **Roster table sort, filter and row action.** As `manager` in `A-Z`, capture the `Personnel roster` table header
   buttons (`Sort by Rank`, `Sort by Name`, ...) and the initial Name order. Click `Sort by Name` and require the
   reversed order and changed sort indicator, click it again to restore ascending, then sort by MOS (every fixture
   Person shares one rank, so Rank cannot show a reorder). Filter with the searchbox (`Baker`) and require only Baker's
   row, then clear with focused `Control+A`/`Backspace`. Click Baker's name link and require Baker's record route;
   return through `Personnel`.
8. **Group header pin and collapse.** As `manager` in `Group` view, read each header's two buttons: `Pin Alpha`
   (`aria-pressed="false"`, `data-state="off"`, title `Pin group to top`) and `Collapse Alpha` (`aria-expanded="true"`).
   The pin is the canonical `Toggle` (`data-slot="toggle"`, default size, 36x32 measured: `h-8 min-w-8 px-2.5`).
   Preserve `$V rows user_pinned_groups orgA user_id MANAGER_ID`, then arm `$V network arm-observe PAGE pinned-groups`
   and click `Pin Bravo`: `aria-pressed` becomes `true`, the label `Unpin Bravo` and title `Unpin group`, Bravo's header
   moves above Alpha's, and `network state` records one request with status 200 and the saved row names Bravo. Reload:
   Bravo stays first and still pressed. Click `Unpin Bravo`: original order and `aria-pressed="false"` return, and the
   saved rows match the preserved readback. Click `Collapse Alpha`: `aria-expanded="false"`, the label `Expand Alpha`,
   Alpha's rows leave the table and its count, strength bar and attention count remain. Click `Expand Alpha` and require
   the rows back. Reload with Alpha collapsed and record that every group is expanded again (collapse is page state, not
   saved). Keyboard: Tab to `Pin Alpha` then `Collapse Alpha` with a visible focus ring, operate each with Enter and
   with Space, and require focus to stay on the same toggle after it flips. Enter, Space and a mouse click on a pin or
   an Unpin all keep focus on that group's pin (`data-pin-group` holds the Group ID) after the group moves, checked once
   while a held `arm-hold` save keeps the reorder on screen and again after release; a sampler that logs
   `document.activeElement` never reads `body`. Switch to `A-Z` and back: pin order is retained. Pin failure recovery
   stays in the [Manage groups recipe](manage-groups.md#personal-group-pins). Do the same at 390 dark and require the
   headers readable and tappable, with no page-level horizontal scroll.
9. **Roster states and URL.** Empty: as `personnelEmpty` open Personnel and capture `No personnel on the active roster`
   or the access result the actor actually gets, with Add Person absent. Add Person appears in that state only for an
   actor who can add; record per actor. No match: type a name nobody has and require `No personnel match your search.`;
   clear with focused `Control+A`/`Backspace`. Restricted: sign in as `ictViewer` (Personnel none) and require
   `Access Restricted` with the permission message and no roster. Disabled: select a row, choose `Archive…` and confirm
   while `arm-hold-fail PAGE personnel/archive-batch` holds the batch: the dialog's `Cancel` and `Archive` and every
   `Selected people` action but `Clear selection` disable until release. Loading: navigate to Personnel and capture
   its roster skeleton while the deferred workspace loads. No dedicated control holds this workspace read; if it
   finishes before capture, record UNAVAILABLE with the attempted route. URL: record that search text, view mode, sort,
   pins and collapse leave the URL unchanged (only a filter writes `?show=`, step 17), and that choosing a row opens `/org/<org>/personnel/<slug>`.
   Capture 1280 light and 390 dark, including the `Personnel controls` toolbar at 390: one row with the search field,
   `More Personnel controls` and `Add Person`, and no horizontal scroll (`scrollWidth` equals the viewport). `Import`,
   `Manage Groups` and the `A-Z`/`Group` view fold into More in that order at about 1100, 1052 and 920px and stay folded
   down to 390
   (`$V toolbar-sweep PAGE "Personnel controls" RUN_DIR --expect import,manage-groups,roster-view --pinned add-person --search --step 4`
   as `orgOwner`), so at 390 choose them from More. Archiving many People is the `Selected people` bar's `Archive…`
   (step 19).
10. **Opening a record for operators.** A row opens its record, shows the chevron and `Note for <name>`, and is named
    `Open <name>` only to an actor who holds Personnel sensitive-record reading unscoped and record access to that row.
    As `personnelOperate`, `personnelScopedOperate` (Operator in Alpha) or `perfScoped` on its large workload each row
    is named `<name>` and shows `Note for <name>` and `Quick edit <name>` only, and clicking the row or pressing Enter
    does not navigate (the URL stays on Personnel and no `<slug>/__data.json` request is sent). At 390
    `personnelOperate` still reaches it: the snapshot lists one `Quick edit SPC Able, Synthetic` and one
    `Note for SPC Able, Synthetic` button per row, each 28x28 at the right of the name, and the page's `scrollWidth`
    is 390. Choose Quick edit: the `Quick edit SPC Able, Synthetic` form opens under the row without `Full data sheet`.
    Set `MOS` to `11B` and choose `Save`: one `PUT` on `/api/personnel` returns 200, `personnel.mos` reads `11B`, the
    form closes and focus returns to the row. `personnelOperate`, `personnelScopedOperate` and `perfScoped` loading the
    detail URL directly still get the 403 page. `manager`, `orgOwner`, `personnelScoped` (configure) and
    `perfScopedLeader` open each row they may edit.
11. **Today's status and Needs attention.** As `orgOwner`, stage one case per source through the app's endpoints in the
    signed-in page (`evaluate_script` with `fetch`): `POST /org/<org>/api/personnel-trainings` for Able with the
    fixture's `trainingRequired` type, completed `2024-10-23` and expiring `2025-10-23`;
    `POST /org/<org>/api/personnel/<personB>/follow-ups` titled `Verify roster overdue follow-up` and due three days
    ago; `POST /org/<org>/api/rating-scheme` rating `personUnassigned` with an active `NCOER` ending on `$V fixture`'s
    `dates.trainingWarningExpires` (15 days out) and starting the day after `dates.trainingWarningCompleted` (a year
    earlier), so the evaluation is due on any run date. Each returns 200 with an `id`; a `verify:app restart` discards
    them. Reload Personnel at 1440: the header reads `Verification Organization A · Active roster`, `Personnel`, `3`,
    and the `Today's headcount` strip reads `2 present` and `1 Verification Training`. Able's dot is `Present today` and
    its Needs attention reads `Verification Required Training expired · 2 more` in red; Baker's dot is
    `Verification Training today` and reads `Verification All-MOS Critical Task missing · 2 more`; Unassigned reads
    `Verification All-MOS Critical Task missing · 3 more`. The footer reads `3 of 3 shown` with `X select`, `N note`,
    `E quick edit` and `↵ open record`. Turn off `Critical tasks` and `Training` in Settings › Features
    (`organizations.disabled_features` reads `training, criticalTasks`) and reload: Able reads `—`, Baker
    `1 follow-up overdue` in red and Unassigned `NCOER due` in amber. Turn both back on afterward. Quick edit (E) on
    Able, set ETS 41 days out and save: one `PUT` and the name carries the `ETS · 41d` badge (PCS uses the outline
    badge). That save sends one `PUT` and no `roster-signals` request. `manager` (no Calendar grant) gets no strip and
    no dots, and its cells still read Baker's `1 follow-up overdue`. Group-scoped `dashboardScoped` reads `1`,
    `1 present` and only Able's row, named `SPC Able, Synthetic`, with `1 of 1 shown`.
12. **Row keyboard and actions.** Tab into the table: the first row takes focus with an inset ring and only that row is
    a tab stop. ArrowDown and ArrowUp move focus between rows, skipping Group headers. Enter opens the record; at 1280
    px and wider Space opens the preview (step 20), and below it Space selects like x (step 19); N opens the
    `Add to log for <name>` composer (step 18); E opens that row's Quick edit form (step 14). The icon buttons are
    hidden until the row is hovered or holds focus; the verification browser reports `hover: none`, so it always shows
    them, as a touch screen does. Single archive is the bulk bar's `Archive…` with one row selected, or the record's
    `More Personnel record` menu. Column hiding follows the table's own width, not the viewport: below 48rem Rank, MOS,
    Duty Role and Group hide and the rank moves before the name; below 36rem Needs attention folds onto a second line
    under the name; the actions column hides below the md viewport and `Note` and `Quick edit` then sit beside the name.
    At 1440, 900 and 390 the page has no horizontal scroll.
13. **Signals lane loading, failure and reads.** Use `orgOwner` in the fixture's `orgA`; these controls do not match a
    performance-workload Organization. `$V server-source arm rpc/roster_signals hold 1 90000`, then reload. For a native
    `navigate_page` reload, use `timeout: 1000` and continue after its expected navigation timeout while the document
    streams. Confirm `server-source state` reports `matches: 1` and `phase: held` before capturing the loading state. At
    1440, 900 and 390, all three active People remain visible while each status dot, attention cell and the strip show
    skeletons. `$V server-source release` preserves row positions and shows `2 present` and `1 Verification Training` in
    the strip. Arm `fail-hard` instead: the roster stays usable with blank cells, no strip, and one notice
    `Today's status and Needs attention could not be loaded.` with `Reload`. `server-source restore`, choose `Reload`,
    and the cells return without a roster read: `$V perf statements reset` before and `perf statements read` after show
    one `roster_signals` call and no `FROM "public"."personnel"` statement, and the browser's one request is
    `__data.json?x-sveltekit-invalidated=0001`. A page load issues one roster read and one `roster_signals` call that
    names only the sources the viewer may read: with Training and Critical tasks off the call's `p_sources` omit
    `training` and `criticalTasks`, and `dashboardScoped` (no follow-up or counseling access) omits `followUps` and
    `counseling`. A first visit whose browser day matches the server's keeps the lane the first response carried (one
    `roster_signals` call). To exercise the viewer-day rerun, launch with `--browser-timezone Pacific/Pago_Pago`, whose
    date always differs from `Pacific/Kiritimati`. Set `document.cookie = 't2t_tz=Pacific/Kiritimati; Path=/'` and
    reload: the app corrects the zone and reruns only the signals lane.
14. **Quick edit.** As `manager` at 1440 in `Group` view, click `Quick edit SPC Able, Synthetic`, or focus the row and
    press E. The row takes a tinted band and an accent rule on its left edge, the pencil is pressed, and a
    `Quick edit SPC Able, Synthetic` form opens under it with Rank focused and Rank, Last name, First name, MOS, Duty
    role, Group, ETS and PCS / DEROS holding Able's saved values, `No changes` and `Save` disabled. Type `68C` in MOS:
    the summary reads `1 CHANGE` and `MOS 68W → 68C`. Arm `$V network arm-hold-fail PAGE personnel` and click `Save`:
    every field disables and the button reads `Saving...`; `$V network release PAGE` and the form stays open with every
    value, `Failed to update personnel` in an alert and `Save` enabled; `$V network restore PAGE`. Arm
    `$V network arm-observe PAGE personnel`, focus MOS and press Enter: one `PUT` `200`, the form closes, focus returns
    to Able's row and it reads `68C` without a reload; `$V rows personnel orgA last_name Able` reads `mos` `68C`. Press
    E, then Escape: the form closes and focus returns to the row. Escape and `Cancel` close without asking, even with
    typed changes. Press E on Able, change Duty role to `Senior Medic` and click Baker's `Quick edit`: the
    `Discard changes?` dialog names `SPC Able, Synthetic`; `Cancel` keeps Able's form and typed value, `Discard` opens
    Baker's form with Rank focused. With a typed Duty role in Baker's form click `Full data sheet`:
    `Save changes first?` offers `Cancel`, `Discard and open` and `Save and open`; `Save and open` sends one `PUT`
    `200`, `$V rows` reads the new `clinic_role`, and the page moves to `/personnel/verify-baker/data-sheet`. With a
    typed Duty role in an open form, a click on another row, that row's Name link, its `Note` button or browser Back
    stays on the roster and asks `Save changes first?` with `Cancel`, `Discard and leave` and `Save and leave`: `Cancel`
    keeps the form and typed value, `Discard and leave` closes the form and goes where the click was heading, and
    `Save and leave` sends one `PUT` `200` first. Reload and tab close use the browser's own prompt. Rename Baker's Last
    name to `Barker` and Save: the summary reads `Last name Baker → Barker`, the row stays under Bravo, its Name link
    now points at `/personnel/barker-synthetic` and `$V rows personnel orgA last_name Barker` reads that `slug`. Pick
    ETS `Dec 4, 2026` from the date picker (Next twice from October): the summary reads `ETS None → Dec 4, 2026`; after
    Save the row carries an `ETS · 42d` badge and `list_network_requests` shows the `PUT` and no `roster-signals`
    request. Change Group to Alpha (type `Alp` in the list and press Enter: the form stays open, a list's Enter does not
    save), Save: the row moves under Alpha and one `POST .../api/personnel/roster-signals` `200` follows the `PUT`; a
    Duty role or MOS change also rereads signals. As `orgOwner`, open Quick edit on Able, then check Able's box and
    choose `Move to Group` › `Bravo` in the `Selected people` bar: the toast reads `Moved 1 person to Bravo` and the
    form stays open. Type `68C` in MOS (the summary reads `1 CHANGE` and `MOS 68W → 68C`) and Save: one `PUT` `200`,
    Able stays under Bravo and `$V rows personnel orgA last_name Able` reads `mos` `68C` with Bravo's `group_id`,
    because the save sends only the changed field. Replace Last name with one space and click `Save`:
    `Enter a last name.` renders in a `role="alert"` message, the input is `invalid` with it as its description, no
    `PUT` is sent and focus stays on `Save`. As `viewer` the roster shows no `Quick edit` and E does nothing. As
    `personnelOperate` (no record reading) the form opens without `Full data sheet`. At 900 the fields wrap into rows
    and the page has no horizontal scroll. At 390 click the `Quick edit` button beside the name (the actions column has
    folded away): the fields stack in one column inside the table's own scroll area, `Save` and `Cancel` sit at its
    bottom, and `document.documentElement.scrollWidth` equals the 390 viewport. In `A-Z` view choose `Sort by MOS` with
    Able and Baker both on `11B` (the order reads Able, Baker, Unassigned) and rename Able to `Zulu`: the row keeps its
    place, so the order reads Zulu, Baker, Unassigned. Arm `$V network arm-hold PAGE personnel`, open Zulu's
    `Full data sheet` with a typed Duty role, choose `Save and open` and press browser Back to the Dashboard before
    `$V network release PAGE`: the write lands (`$V rows` reads the new `clinic_role`) and the page stays on the
    Dashboard. A rename, Group change or `restart` leaves the fixture changed; `verify:app restart` before relying on
    the original slugs.
15. **Edits that change what applies.** As `orgOwner` on a fresh launch, before step 11's staging, Able's cell reads
    `Verification All-MOS Critical Task missing · 1 more`. Open Quick edit, set `MOS` to `11B` and save: one `PUT` on
    `/api/personnel`, then one `POST /api/personnel/roster-signals`, and no `__data.json` request. The cell now reads
    `Verification All-MOS Critical Task missing`, because the `68W` `Verification Alpha Critical Task` stopped applying.
    Set it back to `68W` and `· 1 more` returns. Rank, MOS, duty role and Group edits reread that Person's cells; name,
    ETS and PCS edits send no `roster-signals` request.
16. **By Group headers.** As `manager` with `$V calendar-grant manager view` (restore afterwards), reload Personnel in
    `Group` view at 1440. The table's column headers read `Rank`, `Name`, `MOS`, `Duty Role`, `Needs attention` (no
    `Group`; `A-Z` still shows it). Headers run `Alpha`, `Bravo`, `Unassigned`: both Groups share `sort_order` 0, so
    they fall back to name. `Pin Bravo` puts Bravo first. A Group with a lower `sort_order` would precede both, which
    only the unit tests cover. Each header is one 49px line at 1440 with the pin, the chevron and name, the count, the
    bar, `N of M present`, the attention lane and the `⋯` menu (`Group actions for <Group>`). After staging Baker's
    overdue follow-up (step 11's POST, due `2026-10-20`): Alpha reads `1 of 1 present` with bar
    `Strength today: 1 present` and `—`; Bravo reads `0 of 1 present`, bar `Strength today: 1 Verification Training` and
    `1 needs attention` in red (`text-danger-foreground`); Unassigned reads `1 of 1 present` and the `Assign a Group`
    link where the count would be, and has no pin and no menu. On `perfWide` with the `small` workload Alpha reads
    `7 of 10 present`, bar `Strength today: 7 present, 2 Appointment, 1 School` and `10 need attention`; Bravo reads
    `8 of 10 present` and `10 need attention`. `Collapse Alpha` keeps the bar and the attention count and shows
    `Expand Alpha` (`aria-expanded="false"`). Enter and Space on the focused collapse button flip it and focus stays on
    it. The `⋯` menu holds `Rename`, `Add people` and `Pin` (`Unpin` once pinned); `Rename` and `Add people` open
    `Manage Groups` with that Group's pane selected (Bravo's menu opens the `Bravo` region) and `Pin` pins, and after a
    reload the Group is still first and its menu reads `Unpin`. `Assign a Group` opens it on the `Unassigned` region.
    Unpin every Group, then with the dialog open `Reorder Bravo` then ArrowUp moves Bravo above Alpha in the roster
    behind it at once (rows `Bravo`, `Alpha`, `Unassigned`), and a reload keeps that order; ArrowDown on `Reorder Bravo`
    restores it. Permissions: `viewer` sees no `Assign a Group` link and its menu holds only `Pin`; `manager` without
    the Calendar grant shows no bar and no `N of M present`, only the attention lane. Loading:
    `$V server-source arm rpc/roster_signals hold 1 90000` (this control reads Organization A), reload: the headers show
    the name and count with skeletons in the bar and attention lanes (3, 3 and 2 skeletons), and after
    `server-source release` the header tops (267, 361, 455) and heights (49) are unchanged. `fail-hard` instead: the
    headers show only name and count, no bar, and the one notice
    `Today's status and Needs attention could not be loaded.` shows. Narrow: at 900 and 390 every header is 73px and two
    lines (pin, name, count and `⋯` first; bar, `N of M present` and the attention lane second) and `scrollWidth` equals
    the viewport. The header wraps when the table is under 48rem wide, so 1024 also wraps. At 390 dark the bar, text and
    link stay readable and the `⋯` stays tappable. Name collision: in `Manage Groups` rename Bravo to `Unassigned` and
    reload. Headers run `Alpha`, `Unassigned` (the saved Group, with `Pin Unassigned` and
    `Group actions for Unassigned`), then the People with no Group under a second `Unassigned` that has only the
    `Assign a Group` link and sorts last. `Pin Unassigned` moves the saved Group above Alpha, labels the button
    `Unpin Unassigned` and keeps focus on it; the no-Group header stays last with no pin and no menu. Rename it back to
    `Bravo` afterwards. The snapshot reads the count as `1 person` and an empty attention lane as `None need attention`
    (visually hidden text, no `aria-label` on the spans).
17. **Attention filters.** As `orgOwner` after step 11's staging, Quick edit Able and set ETS 41 days after
    `$V fixture`'s `dates.ui` (or `PUT` `/api/personnel` with `{"id": personA, "ets": "<that date>"}`), then reload.
    Under the toolbar, `Show only` is followed by six buttons: `Expired or missing 3`, `Expiring ≤ 30d 1`,
    `Overdue follow-ups 1`, `Not present 1`, `ETS/PCS ≤ 90d 1` and `Counseling due 3` (counts cover the whole roster and
    ignore the search box). Click `Expiring ≤ 30d`: it turns dark with an ×, `aria-pressed="true"`, focus stays on it,
    the address becomes `?show=expiring`, `history.length` does not change, the roster shows only Unassigned with
    `NCOER due`, and the footer reads `1 of 3 match`. Click it again (or its ×) and the address loses `?show=`.
    `Overdue follow-ups` shows only Baker with `1 follow-up overdue`; `Not present` shows only Baker; `Counseling due`
    shows all three with `Counseling due` in amber; `ETS/PCS ≤ 90d` shows only Able. In `Group` view only the matching
    people's Group headers remain, each counting only its matches; switch to `A-Z`, type `Baker` under `?show=losses`
    and require `No personnel match this filter.` with `0 of 3 match`. The headcount entries are filters too:
    `1 Verification Training` sets `?show=status:<statusTypeId>` and shows Baker, `2 present` sets `?show=present` and
    shows Able and Unassigned, and the pressed entry is drawn dark with an × (click it to clear). With a typed Duty role
    open in Quick edit, click `Expired or missing` or an entry: `Save changes first?` asks, and `Cancel` leaves the chip
    and the entry unpressed (`aria-pressed="false"`), the address without `?show=` and all three people listed;
    `Discard and leave` sets `?show=expired` with the chip pressed. Open `?show=status:<statusLeave>`
    (`Verification Leave`, which nobody has today): the strip keeps `0 Verification Leave` pressed with its ×, the
    roster reads `No personnel match this filter.` with `0 of 3 match`, and clicking the entry removes `?show=` from the
    address; `scrollWidth` equals the viewport at 1440, 900 and 390. Open `?show=expired` directly and reload: the
    filter is restored; `?show=everyone` is dropped from the address with the roster whole. Hold the lane
    (`$V server-source arm rpc/roster_signals hold 1 90000`, reload with `?show=expired`): one chip placeholder per chip
    the actor can see (six for `orgOwner`) under `Show only` and the whole roster, with the chip row and the first row
    at identical offsets once released (viewport tops 222 and 362 at 1440, 244 and 384 at 390). With Losses & Awards off
    (`POST` `/api/organization/settings` with `{"featureSwitch":{"feature":"lossesAndAwards","on":false}}`), `manager`
    holds two placeholders that become two chips at the same offsets (222 and 362 at 1440 and 900, 206 and 346 at 390).
    `viewer` and `personnelOperate` can read no signal source, so their lane makes no `roster_signals` call and cannot
    be held; with Losses & Awards off they get no `Show only` row at any moment of a load, and Able's row stays at 316
    px at 1440 and 900 and 300 px at 390 from its first frame (install a per-frame sampler with `navigate_page`'s
    `initScript`). Turn Losses & Awards back on afterward. Arm `fail-hard` instead: no chip row, the whole roster, and
    the notice `Today's status and Needs attention could not be loaded.` followed by `Filter unavailable.` with
    `Reload`; the address keeps `?show=expired`, and `Reload` after `server-source restore` brings the filter back. Turn
    off `Critical tasks` and `Training` in Settings › Features (or `POST` `/api/organization/settings` with
    `{"featureSwitch":{"feature":"training","on":false}}`, then `criticalTasks`): `Expired or missing` disappears,
    `?show=expired` shows the whole roster with `Filter unavailable.` and `Clear filter`, and the button removes the
    parameter. Turn both back on afterward. At 390 px the chip row scrolls sideways inside itself and the page's
    `scrollWidth` stays 390. The chip is a fixed 30-day lens, whatever a type's own warning window: on a fresh launch
    (before step 11's staging) the row reads `Expiring ≤ 30d 0`, disabled. Stage `POST` `/api/training-types` with
    `{"name":"Verification Short Window","expirationMonths":12,"warningDaysYellow":14,"warningDaysOrange":7}` and `POST`
    `/api/personnel-trainings` for Able with that type, completed a year before and expiring 20 days after
    `$V fixture`'s `dates.ui` (both 200), then reload: `Expiring ≤ 30d 1`. Click it: only Able shows, reading
    `Verification Short Window expires in 20d` in amber, with `1 of 3 match`; with the chip cleared Able's cell still
    reads `Verification All-MOS Critical Task missing`, because the item is current under its own 14-day window. The
    type applies to everyone, so Baker and Unassigned gain a missing item; `verify:app restart` before relying on other
    step counts.

18. **Note composer.** As `orgOwner` (or `manager`), click `Note for SPC Baker, Synthetic`, or focus Baker's row and
    press N. A popover opens under the row (it flips above when the row is near the bottom of the window), headed
    `ADD TO LOG` and `SPC SYNTHETIC BAKER`, with `Follow-up` selected, `Follow-up title` focused and the row tinted. On
    the fixture's viewer day, Fri 23 Oct, the due chips read `Tomorrow`, `Fri 30 Oct` (next week's Friday, because today
    is Friday) and `+1 week`; the calendar button opens the full date picker and a date matching no chip shows as its
    own pressed chip. `Note` swaps in one text area with no date. Type a title, choose `Fri 30 Oct` (`aria-pressed`
    turns true) and press Control+Enter: exactly one `POST .../personnel/<id>/follow-ups` and one
    `POST .../roster-signals` (both 200, no workspace reload), the popover closes with focus back on the row, and the
    toast reads `Follow-up added for SPC Baker` with an `Open log` button.
    `$V rows personnel_follow_ups orgA personnel_id <id>` shows `due_date` `2026-10-30`. Click `Open log`: the URL
    becomes `/personnel/verify-baker/log` and Back returns to the roster. Reopen the composer: `ALREADY OPEN` reads
    `<title> · due <date>` for the soonest open follow-up, with `· overdue` in red when it is past and `· +N more` when
    others are open; it is absent for a Person with none. Esc with nothing typed closes at once; with text it shows
    `Discard what you typed?` with `Keep editing` (focus returns to the field) and `Discard`.
    - Loading and failure: `$V server-source arm rpc/roster_signals hold 1 90000`, reload and open Baker's composer: one
      skeleton shows beside `ALREADY OPEN`, and after `server-source release` the line resolves (absent when Baker has
      no open follow-up); `server-source restore` afterward. Follow-ups have no read of their own, so `fail-hard` fails
      the whole signals lane: the roster shows `Today's status and Needs attention could not be loaded.` with `Reload`,
      the composer opens with no `ALREADY OPEN` line and no skeleton, and a typed follow-up still saves
      (`rows personnel_follow_ups` gains the row). `$V network arm-fail PAGE personnel/<id>/follow-ups`, then save: the
      popover stays open with the typed title and `Unable to add follow-up.` under it, and `rows` shows no matching row;
      after `restore` the same Add saves one row and closes.
    - Leaving with text typed: with a title typed, click another row, a name link or press Back. The URL stays on
      Personnel, the typed title stays and the footer reads `Discard what you typed?`. `Keep editing` returns focus to
      `Follow-up title` and drops the destination. `Discard` closes the composer and then opens the row or record (Back
      steps history back). With nothing typed the same click or Back goes straight through. Clicking another row's
      `Note` button with a title typed asks the same question; `Discard` then opens that person's composer (empty,
      `Follow-up title` focused), and `Keep editing` leaves the first composer and its text open.
    - Viewer's day: the due chips count from the browser's day, not the page's loaded day. With the browser zone ahead
      of the server (`launch --browser-timezone Pacific/Kiritimati`, UTC+14), `Tomorrow` is the day after the browser's
      day, one day past the server's. A roster left open past midnight moves to the new day when the composer opens and
      reloads only the signals lane.
    - Saving: hold the follow-up `POST` (wrap `window.fetch` in the page and release it by hand) and choose
      `Add follow-up`. The `Note`/`Follow-up` toggle, both fields, every due chip, `Choose a due date` and `Cancel` are
      all disabled, and the button reads `Saving…`. Releasing a failure re-enables them, keeps the typed title and
      chosen chip, shows `Unable to add follow-up.` and returns focus to `Follow-up title`.
    - Widths: at 900 the popover is 420 wide and stays inside the window. At 390 the actions column is hidden, so
      `Note for <name>` and `Quick edit <name>` sit beside the name, each 28x28 (x 309 and 341 on the first row), and
      the page's `scrollWidth` is 390. Tapping `Note for SPC Baker, Synthetic` opens the composer 4px under that row,
      spanning x 8 to 382, with `Follow-up title` focused, and the page still has no horizontal scroll.
    - Access: `viewer`, `scoped` and `dashboardScoped` have no `Note` button and N opens nothing; `manager` has one on
      every row, and `personnelOperate` too: its save toast reads `Follow-up added for SPC Able` with no `Open log`
      because that actor cannot open the record.

19. **Select many and act once.** As `manager` in `Group` view at 1440, the header row starts with
    `Select everyone shown`, each Group header with `Select everyone in <Group>` (Unassigned too) and each row with
    `Select <name>`, all at x 289. `viewer` and `scoped` hold no bulk action and see no checkboxes. Click
    `Select everyone shown`: every checkbox checks, selected rows carry `data-state="selected"`, and the
    `Selected people` toolbar reads `3 selected` with `Follow-up for each` (accent), `Add note`, `Move to Group`,
    `Export`, `Archive…` and `Clear selection` (title `Clear selection (Esc)`). Unchecking one row turns the header and
    that Group's checkbox `mixed`. Keyboard: x toggles the focused row's selection (the footer hint reads `X select`);
    below 1280 px Space does the same, and at 1280 and wider Space opens the preview (step 20). Focus Able's row and
    press x (`1 selected`), ArrowDown and x (`2 selected`), x again (`1 selected`) and Esc: the bar leaves and focus
    stays on the row. At 900 Space on Baker's row reads `1 selected` and again clears it. Shift-click: native `click`
    has no modifiers, so on `perfWide` with the `small` workload click `Select SPC Baker002, Blake` natively, then
    dispatch a `click` with `shiftKey: true` on `Select SSG Foster006, Finley`: the five rows from Baker002 to Foster006
    in shown order are selected.
    - Placement: the bar is in the roster's flow and sticky 20px above the window's bottom. On the 20-person workload at
      1440x900 the table scrolls in its own box and the bar (714 wide, top 828) sits under the `20 of 20 shown` footer,
      covering no row. When the roster's own width is under 48rem (900 and 390) the actions show as icons with their
      names kept for assistive technology; the bar is 343 wide and `scrollWidth` equals the viewport. At 390 dark the
      bar keeps its chrome border and reads clearly.
    - Search: with five selected, search `Baker`: the bar reads `5 selected · 4 hidden by search`, and `Archive…` asks
      `Archive 5 personnel? …` with `This includes 4 people your search hides.` Actions apply to every selected Person.
      At 390 the hidden count sits on its own line under the selected count (`75 selected` over `74 hidden`, a 351-wide
      bar 52 tall) and every action, through `Clear selection`, stays inside the bar with `scrollWidth` 390.
    - Filter: as `orgOwner`, select all three, then click the `2 present` entry in the headcount strip (`?show=present`,
      selection kept): the bar reads `3 selected · 1 hidden by filter` and `Archive…` asks `Archive 3 personnel? …` with
      `This includes 1 person your filter hides.` Search `Able` as well and the bar reads
      `3 selected · 2 hidden by search and filter` with `This includes 2 people your search and filter hide.`; clear
      both and the hidden count leaves the bar. At 390 the filter case reads `3 selected` over `1 hidden` (344 wide, 52
      tall, `by filter` kept for assistive technology) with `scrollWidth` 390.
    - Follow-up for each: with all three selected, `Follow-up for each` opens `Add to log for 3 people` above the bar,
      headed `3 PEOPLE` on `Follow-up`, with no `ALREADY OPEN` line. Title `Turn in CIF hand receipt`, choose
      `Fri 30 Oct` and press Control+Enter: one `POST .../api/personnel/follow-ups/batch` (200) and one
      `POST .../api/personnel/roster-signals`, then the toast `Follow-up added for 3 people`.
      `$V rows personnel_follow_ups orgA title "Turn in CIF hand receipt"` returns three rows due `2026-10-30`, each
      `created_by` the manager, and `rows audit_logs orgA` holds one `personnel.follow_up.created` row by that user.
    - Add note: select Able and Baker and choose `Add note`; the composer opens on `Note`, titled
      `Add to log for 2 people`. With `$V network arm-fail PAGE personnel/leader-notes/batch`, `Add note` keeps the
      typed text and shows `Unable to save leader note.`, and `rows leader_notes orgA` has no such note. With `arm-hold`
      the button reads `Saving…`; `release` gives `Note added for 2 people`, two rows authored by the manager, and the
      selection stays. A note sends no `roster-signals` request.
    - Move to Group: the menu `Move N people to` lists `Alpha`, `Bravo` and `Unassigned`. Moving
      `SPC Unassigned, Synthetic` to `Alpha` sends one `POST .../group-membership` and one `roster-signals` POST, toasts
      `Moved 1 person to Alpha`, and `rows personnel orgA` shows Alpha's group ID on that Person.
    - Export: `$V export arm PAGE`, select all three and choose `Export`. No request is sent; the file is
      `personnel-<Organization URL segment>-<viewer day>.xlsx` (Organization A has no slug, so its ID:
      `personnel-<orgA>-2026-10-23.xlsx`). `$V workbook FILE Personnel` reads headers `Rank`, `Last name`, `First name`,
      `MOS`, `Duty role`, `Group`, `ETS`, `PCS/DEROS`, `Today`, `Needs attention` and one row per Person; `manager` has
      no Calendar grant, so `Today` is blank, and `Needs attention` reads `None`.
    - Archive…: select `SPC Unassigned, Synthetic`, choose `Archive…`: the dialog reads `Archive 1 personnel? …`, and
      `Archive` sends one `archive-batch` POST naming that ID, toasts `1 personnel archived`, sets `archived_at`, and
      the row and the bar leave. As `personnelOperate` the bar has no `Export`; `Archive…` on Able creates one pending
      `deletion_requests` row, Able stays on the roster and leaves the selection. With
      `$V network arm-hold-fail PAGE personnel/archive-batch` the dialog's `Cancel` and `Archive` and every bar action
      but `Clear selection` disable; `release` closes the dialog with the error toast
      `Archive results could not be confirmed. …`, the Person's `archived_at` stays null and the selection stays.
    - Group note: `Group actions for Alpha` → `Note to everyone in the Group` opens `Add to log for Alpha · 1 person` on
      `Note` above the Alpha header. Saving sends one `leader-notes/batch` POST and toasts `Note added for 1 person`.
      `viewer`'s menu holds only `Pin`; Unassigned has no menu.
    - Access: `personnelScoped` sees only Alpha's checkboxes, every action, and `Alpha` as the only move target. From
      its page, a `fetch` POST to `/org/<orgA>/api/personnel/follow-ups/batch` naming `personA` and `personB` returns
      200 with `{"writtenIds":[personA],"unavailableIds":[personB]}` and writes one row; `viewer`'s POST to
      `leader-notes/batch` returns 403 and writes none.
    - Signals: with `$V server-source arm rpc/roster_signals hold 1 90000`, reload and select everyone: selection works
      while 12 skeletons show, and after `release` the row tops (316, 410) and the bar top (504) are unchanged. With
      `fail-hard` the notice `Today's status and Needs attention could not be loaded.` shows and the bar keeps every
      action.
    - `network` accepts the exact `personnel/follow-ups/batch` and `personnel/leader-notes/batch` families.

20. **Peek panel.** As `orgOwner` at 1440x900, stage Baker's two follow-ups through
    `POST /org/<org>/api/personnel/<personB>/follow-ups` (`Turn in TA-50 shortage list` due four days before the viewer
    day, `Confirm leave address and POC` due six days after it) and one leader note through `.../leader-notes`. Reload
    Personnel and clear the page's resource timings (`performance.clearResourceTimings()`). Click a cell of Baker's row
    outside the name link (the `11B` text): the URL stays on Personnel and a complementary region
    `Preview of SPC Synthetic Baker` docks on the right. Its top bar reads `2 of 3 · J/K` in `Group` view with
    `Previous person`, `Next person`, `Open record` (the record URL) and `Close preview`. Identity reads `BRAVO · NCO`,
    `SPC SYNTHETIC BAKER`, `11B`, the amber `Verification Training today` pill and `(910) 555-0148`. A muted mono line
    directly under the name holds the Data sheet DoD ID; Baker has none, so it reads `No DoD ID` and the identity block
    keeps the same height as for a Person with an ID. `Next 7 days` draws today plus six days with the training bar and
    its legend; `Needs attention · 2` lists the two missing items with `Missing · Not recorded` and a `Readiness` link;
    `Open follow-ups · 2` shows `Overdue 4 days` in red and the other's weekday date; `Latest note` quotes the note. The
    page fetched exactly five requests, `peek?section=identity|next7|attention|followUps|note`, and no `__data.json`.
    While it is open the `Duty Role` and `Group` columns are hidden (a roster sorted by either keeps its order and page)
    and the `Today's headcount` strip is gone, Baker's row has the accent left rule, and the row's Note and Quick edit
    buttons are hidden. The footer hints read `Space preview`, `X select`, `N note`, `E quick edit` and `↵ open record`;
    below 1280 `Space preview` is gone.
    - Keyboard: Baker's row keeps focus. J moves focus to `Open SPC Unassigned, Synthetic` and the panel to
      `3 of 3 · J/K` with five reads for Unassigned; K back to Baker reads nothing (cached). Two J presses within 40 ms
      from Able read only the Person browsing stops on (five reads, none for the Person skipped). Tab from the row
      focuses `Previous person`; K there steps the panel while focus stays on that button; Esc closes the panel and
      returns focus to the Person's row; with the row searched away (open Baker, search `Unassigned`, Esc) focus lands
      on the first shown row, `Open SPC Unassigned, Synthetic`, or on the search field when no row is shown. Space on
      Baker's row opens it again and Space once more closes it. x selects without touching the panel (`1 selected`), and
      with a selection Space or a row click still opens the panel (only the checkbox selects). Esc then closes the panel
      first, and a second Esc clears the selection.
    - Follow-up: tick `Complete Turn in TA-50 shortage list`. One `PATCH .../follow-ups/<id>` and one
      `POST .../roster-signals`; the row reads `Done`, the heading `Open follow-ups · 1`, `rows personnel_follow_ups`
      shows `completed`, and Baker's attention cell drops to `· 1 more`. J then K rereads only `peek?section=followUps`.
    - Docked composer: choose `Add a note or follow-up for SPC Baker…`; the step 18 composer opens docked at the bottom
      of the panel with `Follow-up title` focused. Type a title and press Enter: one `POST .../follow-ups`, one
      `peek?section=followUps` and one `POST .../roster-signals`; the new follow-up shows with `No due date`, focus
      returns to the docked input and the toast reads `Follow-up added for SPC Baker` with `Open log`. A note there
      sends one `POST .../leader-notes` and one `peek?section=note`, and `Latest note` quotes it. One composer at a time
      includes the dock: with a title typed in it, focus Unassigned's row and press N, or check `Select everyone shown`
      and choose `Follow-up for each`. The dock asks `Discard what you typed?` with focus on `Keep editing` and nothing
      else opens; `Discard` empties the dock back to its input and opens `Add to log for SPC Synthetic Unassigned` (or
      `Add to log for 3 people`) with `Follow-up title` focused. The other way round, a typed bulk composer asks the
      same question when the dock's input is clicked, and `Discard` opens the docked composer.
    - Quick edit: the dock's pencil `Quick edit SPC Synthetic Baker` opens the step 14 form
      `Quick edit SPC Baker, Synthetic` under Baker's row with focus on `Rank`. Set `MOS` to `11C` and `Save`: one
      `PUT .../api/personnel`, one `peek?section=attention` and one `POST .../roster-signals`; the panel's MOS chip
      reads `11C` and `rows personnel orgA` shows `11C`. Esc, then Space on the row, shows `11C` again with no reads.
      Restore `11B`. Quick edit again and pick ETS `Dec 4, 2026`: one `PUT` and one `peek?section=attention`, no
      `roster-signals` and no other `peek` request; the panel reads `Needs attention · 3` with `ETS 4 Dec 2026` and
      `Upcoming · in 41 days`, and the row carries `ETS · 41d`. A name-only save sends no `peek` request.
    - Bulk writes: with Baker shown and selected, `Follow-up for each` (`Add to log for 1 person`) saved with
      Control+Enter sends one `follow-ups/batch`, one `peek?section=followUps` and one `roster-signals` POST, and the
      panel reads `Open follow-ups · 1` with the new title and `No due date`. `Move to Group` → `Alpha` sends one
      `group-membership`, one `peek?section=next7`, one `peek?section=attention` and one `roster-signals` POST, and the
      eyebrow reads `ALPHA · NCO`; move Baker back to `Bravo`. A Group change from Quick edit or from `Manage groups` (a
      member moved, or a Group deleted with its members reassigned) rereads the same two sections for each Person moved.
      Archiving the shown Person closes the panel.
    - Loading: `$V server-source arm leader_notes hold 1 90000`, reload and open Baker: only `Latest note` shows its
      three-line skeleton (`Latest note loading`) while the other sections fill, and the section's top does not move
      when `release` lets the note through. Stage a `Verification Leave` entry for Baker (`POST .../api/availability`,
      d+3 to d+5, with a note that runs past one line). With `$V server-source arm availability_entries hold 1 120000`
      armed after the page loads, open Baker: the seven-column strip skeleton shows two legend skeleton lines. At 1280
      and at 1440 the tops of `Next 7 days`, `Needs attention`, `Open follow-ups` and `Latest note` read 255, 444, 570
      and 680 while held and the same after `release`. The legend then reads two truncated lines,
      `Verification Training` and `Verification Leave` each with the start of their note. Restore.
    - DoD ID loading: save `0123456789` on Able's Data sheet, arm
      `$V server-source arm personnel_extended_info hold 1 90000`, reload and open Able: a skeleton line sits under the
      name and another beside the `68W` chip until `release`, and at 1440 the tops of `Needs attention`,
      `Open follow-ups` and `Latest note` read 287, 357 and 425 both while held and after. `fail-hard 1` instead shows
      `Couldn't load contact details.` with `Retry` beside `68W`, and after `restore` `Retry` shows the ID. `viewer`
      gets no panel; its `peek?section=identity` is 403.
    - Failure: `$V server-source arm leader_notes fail-hard 1`, reload and open Baker: `Latest note` reads
      `Couldn't load notes.` with `Retry` and the rest loads. `restore`, then `Retry` sends one `peek?section=note` and
      the note shows.
    - Readiness that cannot be fully checked: `$V server-source arm ict_tasks fail-hard 1`, reload and open Baker:
      `Needs attention · 1` lists `Verification Required Training` and a dashed `Couldn't check critical tasks.` row
      with `Retry`. `restore`, then `Retry` sends one `peek?section=attention` and the section reads
      `Needs attention · 2`.
    - Access: `manager` (no Calendar grant) gets the panel without `Next 7 days`; its `peek?section=next7` returns 200
      with `{"state":"hidden"}`, and `Needs attention · 0` reads `Nothing needs attention.` with no `Couldn't check`
      line for the Training, Critical Tasks, Evaluation or Onboarding lanes it may not read. Actors who cannot open the
      record (step 10) get no panel.
    - Filters: on a fresh launch open `?show=present` (`2 of 3 match`) and click Able's `68W`: the panel reads
      `1 of 2 · J/K`, the `Today's headcount` strip is gone and the `Show only` chips stay. J moves to Unassigned with
      `2 of 2 · J/K`, and a second J stays there (Baker is not shown). K back to Able, then click `Not present 1`: the
      address becomes `?show=not-present`, the panel closes because Able no longer shows, and focus stays on the chip.
      Open Baker (`1 of 1 · J/K`), then click the pressed `Not present` to clear it: the panel stays on Baker with
      `2 of 3 · J/K` and the footer reads `3 of 3 shown`. Under `?show=expired` all three match: Able reads
      `1 of 3 · J/K` and three J presses stop on Unassigned at `3 of 3 · J/K`. Stage an overdue follow-up each for Able
      and Baker (`POST .../follow-ups` with `dueDate` four days before the viewer day), open `?show=follow-ups`
      (`2 of 3 match`), open Baker (`2 of 2 · J/K`) and tick `Complete <title>`: once Baker's signals reread, the panel
      closes, the footer reads `1 of 3 match` and focus moves to Able's row. At 1280x800 under `?show=expired` the panel
      docks at x 810, the `Show only` row stays beside it (435 px wide, scrolling its 914 px of chips inside itself) and
      `scrollWidth` is 1280.
    - Widths: at 1280x800 the 470 px panel docks beside a 506 px roster, Needs attention folds under the name, the
      toolbar folds Import and Manage Groups into More and the footer shows only `3 of 3 shown`. At 900 and 390 a row
      click opens `personnel/verify-baker` and no panel renders; `scrollWidth` equals the viewport.

## Gotchas

- `Note for <name>` and `Quick edit <name>` repeat on each row; name them with the Person, not by position.
- The fixture's `viewer` and `scoped` actors can read the roster but may not open a Personnel Record, and operate-level
  actors see `Note` and `Quick edit` but no record link (step 10). Use `manager` for the record-opening step.
- A `verify:app restart` rebuilds the provider and discards step 11's staged rows; stage them again.
- `manager` deliberately starts with no Calendar grant for authorization checks. Temporarily grant it Calendar `view`
  for the integrated readiness check, then restore `none`. A missing availability summary under the default grant does
  not test the Calendar-backed read.
- Search results can change the visible rows without changing the URL; capture the search value and rows in the same
  snapshot. A chip toggle does change the URL (`?show=`) but replaces the history entry.
- The Quick edit Group and Rank lists are comboboxes: `take_snapshot` shows the listbox without its options, so read
  them from a screenshot or pick by typing then Enter.
- `Import`, `Add Person`, and archive are separate mutation journeys; their presence in the toolbar does not prove them.
- Native `click` sends no modifier keys, so a Shift range needs a dispatched `click` with `shiftKey: true` (step 19).
- For roster load and search timing at 20/100/400 People, use the [performance recipe](performance.md).
  Both views show 100 rows a page, with `Page N of M`, a `Rows per page` choice (50, 75, 100, 200) and
  `Previous`/`Next` below the table inside its frame. The choice applies to both views and survives a reload in that
  browser; pick it with Enter, ArrowDown and Enter, because the snapshot omits its options. A new search or filter
  starts at page 1. By Group pages in Group order: a Group cut by a page break shows its header on both pages and still
  counts all its People, and a page that starts inside a sub-group repeats its parent Group headers first. A collapsed
  Group keeps its header on the page where its rows would start and uses none of the page, so collapsing one brings
  rows from the Groups below it. On the `large` workload as `perfWide` the roster has 4 pages at 100; `s` matches 346
  and `sp` 117, and the toolbar search keeps focus and its text as the count changes. With a preview open, `J` from a
  page's last row turns to the next page and previews its first row.
- A group header's controls repeat per group; name them by their `aria-label` (`Pin Alpha`, `Collapse Alpha`,
  `Group actions for Alpha`) rather than by position. The pin is a `Toggle` and the collapse a `Button`; record their
  focus ring and accessible names exactly as rendered.
