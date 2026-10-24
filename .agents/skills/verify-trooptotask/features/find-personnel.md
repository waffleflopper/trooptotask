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
- `roster-group-headers`: in `Group` view each group header has a pin toggle and a collapse toggle, operable by pointer
  and keyboard; a pin persists for the member and a collapse lasts for the page visit.
- `roster-states`: the roster's empty, no-match, restricted, disabled and narrow-screen states and its absence of URL
  state.
- `roster-signals`: the header's headcount strip, each row's status dot and Needs attention, ETS/PCS day badges, the row
  keyboard and actions, and the signals lane's loading and failure states.
- `roster-note`: the row's `Note` button and N key open a popover composer that adds a follow-up or a leader note
  without leaving the roster.

## How to get to it (user POV)

Sign in, choose `Personnel` in the organization navigation, and use `Search by name, rank, MOS, role, or group`. The
`Group` and `A-Z` buttons are above the roster. Choose a person's row, or focus it and press Enter, to open the record.
Each row's `Note` and `Quick edit` icon buttons show on hover or focus (always on a touch screen); N and E are their
keys. Below the md viewport (768 px) the actions column hides and `Quick edit` shows at the right of the name.

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
4. Choose the `Open SPC Able, Synthetic` row. Confirm the browser moved to that person's detail route and shows the same
   name. Return through the `Personnel` navigation link. For the Calendar-backed readiness check, run
   `$V calendar-grant manager view` on this owned worker, reload Personnel, and open Baker's record. Its Overview
   `Next 14 days` legend must show `Verification Training` through the fixture's `dates.uiAfter`; capture the visible
   summary and the saved Baker availability row ID from `$V fixture`/`$V rows`. Run `$V calendar-grant manager restore`
   immediately afterward, including after a failed attempt.
5. Sign in as `viewer` in its own page. The Organization roster must show Able, Baker, and Unassigned, while Foreign is
   absent. Capture the visible rows and an authenticated read-only request to the current `/personnel/__data.json`;
   compare the returned text against `personA`, `personB`, `personUnassigned`, and `personForeign` IDs from
   `$V fixture`. The first three must be present and the foreign ID absent.
6. Sign in as `scoped` in another page. Its Alpha roster must show Able and exclude Baker, Unassigned, and Foreign. In
   `Group` view only the Alpha header appears. Repeat the page-data ID comparison: only `personA` may appear, and
   neither the Bravo Group ID nor its name is in the Group catalog or pinned names. Save the visible and page-data
   observations together. A blank or failed data response is not a passing scope check.
7. **Roster table sort, filter and row action.** As `manager` in `A-Z`, capture the `Personnel roster` table header
   buttons (`Sort by Rank`, `Sort by Name`, ...) and the initial Name order. Click `Sort by Name` and require the
   reversed order and changed sort indicator, click it again to restore ascending, then sort by MOS (every fixture
   Person shares one rank, so Rank cannot show a reorder). Filter with the searchbox (`Baker`) and require only Baker's
   row, then clear with focused `Control+A`/`Backspace`. Choose Baker's row and require Baker's record route; return
   through `Personnel`.
8. **Group header pin and collapse.** As `manager` in `Group` view, read each header's two buttons: `Pin Alpha`
   (`aria-pressed="false"`, `data-state="off"`, title `Pin group to top`) and `Collapse Alpha` (`aria-expanded="true"`).
   The pin is the canonical `Toggle` (`data-slot="toggle"`, default size, 36x32 measured: `h-8 min-w-8 px-2.5`).
   Preserve `$V rows user_pinned_groups orgA user_id MANAGER_ID`, then arm `$V network arm-observe PAGE pinned-groups`
   and click `Pin Bravo`: `aria-pressed` becomes `true`, the label `Unpin Bravo` and title `Unpin group`, Bravo's header
   moves above Alpha's, and `network state` records one request with status 200 and the saved row names Bravo. Reload:
   Bravo stays first and still pressed. Click `Unpin Bravo`: original order and `aria-pressed="false"` return, and the
   saved rows match the preserved readback. Click `Collapse Alpha`: `aria-expanded="false"`, the label `Expand Alpha`,
   Alpha's rows leave the table and its count badge remains. Click `Expand Alpha` and require the rows back. Reload with
   Alpha collapsed and record that every group is expanded again (collapse is page state, not saved). Keyboard: Tab to
   `Pin Alpha` then `Collapse Alpha` with a visible focus ring, operate each with Enter and with Space, and require
   focus to stay on the same toggle after it flips. Enter, Space and a mouse click on a pin or an Unpin all keep focus
   on that group's pin (`data-pin-group`) after the group moves, checked once while a held `arm-hold` save keeps the
   reorder on screen and again after release; a sampler that logs `document.activeElement` never reads `body`. Switch to
   `A-Z` and back: pin order is retained. Pin failure recovery stays in the
   [Manage groups recipe](manage-groups.md#personal-group-pins). Do the same at 390 dark and require the headers
   readable and tappable, with no page-level horizontal scroll.
9. **Roster states and URL.** Empty: as `personnelEmpty` open Personnel and capture `No personnel on the active roster`
   or the access result the actor actually gets, with Add Person absent. Add Person appears in that state only for an
   actor who can add; record per actor. No match: type a name nobody has and require `No personnel match your search.`;
   clear with focused `Control+A`/`Backspace`. Restricted: sign in as `ictViewer` (Personnel none) and require
   `Access Restricted` with the permission message and no roster. Disabled: in `Archive` mode with a selected row,
   `Confirm Archive`, `Select shown` and `Clear` disable while an archive is held through
   `arm-hold PAGE personnel/archive-batch`. Loading: Personnel loads in the Organization layout before the page renders,
   and no control holds that load, so record UNAVAILABLE with the attempted route unless a skeleton is observed on
   navigation. URL: record that search text, view mode, sort, pins and collapse leave the URL unchanged, and that
   choosing a row opens `/org/<org>/personnel/<slug>`. Capture 1280 light and 390 dark, including the
   `Personnel controls` toolbar at 390: one row with the search field, `More Personnel controls` and `Add Person`, and
   no horizontal scroll (`scrollWidth` equals the viewport). `Import`, `Archive`, `Manage Groups` and the `A-Z`/`Group`
   view fold into More in that order (at about 1008, 956, 860 and 450px), so at 390 choose them from More. In `Archive`
   mode the `Bulk archive controls` toolbar keeps `Select shown`, `Cancel` and `Confirm Archive` on the row at 390 and
   moves `Clear` into `More Bulk archive controls` (it folds at about 404px).
10. **Opening a record for operators.** A row opens its record, shows the chevron and `Note for <name>`, and is named
    `Open <name>` only to an actor who holds Personnel sensitive-record reading unscoped and record access to that row.
    As `personnelOperate`, `personnelScopedOperate` (Operator in Alpha) or `perfScoped` on its large workload each row
    is named `<name>` and shows `Note for <name>` and `Quick edit <name>` only, and clicking the row or pressing Enter
    does not navigate (the URL stays on Personnel and no `<slug>/__data.json` request is sent). At 390
    `personnelOperate` still reaches it: the snapshot lists one `Quick edit SPC Able, Synthetic` and one
    `Note for SPC Able, Synthetic` button per row, each 28x28 at the right of the name, and the page's `scrollWidth`
    is 390. Choose it, set `MOS / Job Title` to `11B` and `Save Changes`: one `PUT` on `/api/personnel` returns 200,
    `personnel.mos` reads `11B`, focus returns to the row's `Quick edit` button and the dialog closes.
    `personnelOperate`, `personnelScopedOperate` and `perfScoped` loading the detail URL directly still get the 403
    page. `manager`, `orgOwner`, `personnelScoped` (configure) and `perfScopedLeader` open each row they may edit.
11. **Today's status and Needs attention.** As `orgOwner`, stage one case per source through the app's endpoints in the
    signed-in page (`evaluate_script` with `fetch`): `POST /org/<org>/api/personnel-trainings` for Able with the
    fixture's `trainingRequired` type, completed `2024-10-23` and expiring `2025-10-23`;
    `POST /org/<org>/api/personnel/<personB>/follow-ups` titled `Verify roster overdue follow-up` and due three days
    ago; `POST /org/<org>/api/rating-scheme` rating `personUnassigned` with an active `NCOER` for `2025-11-06` to
    `2026-11-05`. Each returns 200 with an `id`; a `verify:app restart` discards them. Reload Personnel at 1440: the
    header reads `Verification Organization A · Active roster`, `Personnel`, `3`, and the `Today's headcount` strip
    reads `2 present` and `1 Verification Training`. Able's dot is `Present today` and its Needs attention reads
    `Verification Required Training expired · 2 more` in red; Baker's dot is `Verification Training today` and reads
    `Verification All-MOS Critical Task missing · 2 more`; Unassigned reads
    `Verification All-MOS Critical Task missing · 3 more`. The footer reads `3 of 3 shown` with `N note`, `E quick edit`
    and `↵ open record`. Turn off `Critical tasks` and `Training` in Settings › Features
    (`organizations.disabled_features` reads `training, criticalTasks`) and reload: Able reads `—`, Baker
    `1 follow-up overdue` in red and Unassigned `NCOER due` in amber. Turn both back on afterward. Quick edit (E) on
    Able, set ETS 41 days out and save: one `PUT` and the name carries the `ETS · 41d` badge (PCS uses the outline
    badge). That save sends one `PUT` and no `roster-signals` request. `manager` (no Calendar grant) gets no strip and
    no dots, and its cells still read Baker's `1 follow-up overdue`. Group-scoped `dashboardScoped` reads `1`,
    `1 present` and only Able's row, named `SPC Able, Synthetic`, with `1 of 1 shown`.
12. **Row keyboard and actions.** Tab into the table: the first row takes focus with an inset ring and only that row is
    a tab stop. ArrowDown and ArrowUp move focus between rows, skipping Group headers. Enter opens the record; N opens
    the `Add to log for <name>` composer (step 15); E opens `Edit Personnel` for that row. The icon buttons are hidden
    until the row is hovered or holds focus; the verification browser reports `hover: none`, so it always shows them, as
    a touch screen does. Single archive is Quick edit's `Archive` button. Column hiding follows the table's own width,
    not the viewport: below 48rem Rank, MOS, Duty Role and Group hide and the rank moves before the name; below 36rem
    Needs attention folds onto a second line under the name; the actions column hides below the md viewport and `Note`
    and `Quick edit` then sit beside the name. At 1440, 900 and 390 the page has no horizontal scroll.
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
14. **Edits that change what applies.** As `orgOwner` on a fresh launch, before step 11's staging, Able's cell reads
    `Verification All-MOS Critical Task missing · 1 more`. Quick edit, set `MOS / Job Title` to `11B` and save: one
    `PUT` on `/api/personnel`, then one `POST /api/personnel/roster-signals`, and no `__data.json` request. The cell now
    reads `Verification All-MOS Critical Task missing`, because the `68W` `Verification Alpha Critical Task` stopped
    applying. Set it back to `68W` and `· 1 more` returns. Rank, MOS, duty role and Group edits reread that Person's
    cells; name, ETS and PCS edits send no `roster-signals` request.

15. **Note composer.** As `orgOwner` (or `manager`), click `Note for SPC Baker, Synthetic`, or focus Baker's row and
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
    - Loading and failure: `$V server-source arm rpc/roster_signal_follow_ups hold 1 90000` and reload: the composer
      shows a skeleton beside `ALREADY OPEN`; `release` and `restore` afterward. With `fail-hard` armed the line is
      absent and the rest works. `$V network arm-fail PAGE personnel/<id>/follow-ups`, then save: the popover stays open
      with the typed title and `Unable to add follow-up.` under it, and `rows` shows no matching row; after `restore`
      the same Add saves one row and closes.
    - Leaving with text typed: with a title typed, click another row, a name link or press Back. The URL stays on
      Personnel, the typed title stays and the footer reads `Discard what you typed?`. `Keep editing` returns focus to
      `Follow-up title` and drops the destination. `Discard` closes the composer and then opens the row or record (Back
      steps history back). With nothing typed the same click or Back goes straight through.
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

## Gotchas

- `Note for <name>` and `Quick edit <name>` repeat on each row; name them with the Person, not by position.
- The fixture's `viewer` and `scoped` actors can read the roster but may not open a Personnel Record, and operate-level
  actors see `Note` and `Quick edit` but no record link (step 10). Use `manager` for the record-opening step.
- A `verify:app restart` rebuilds the provider and discards step 11's staged rows; stage them again.
- `manager` deliberately starts with no Calendar grant for authorization checks. Temporarily grant it Calendar `view`
  for the integrated readiness check, then restore `none`. A missing availability summary under the default grant does
  not test the Calendar-backed read.
- Search results can change the visible rows without changing the URL; capture the search value and rows in the same
  snapshot.
- `Import`, `Add Person`, and archive are separate mutation journeys; their presence in the toolbar does not prove them.
- For roster load and search timing at 20/100/400 People, use the [performance recipe](performance.md); above 250 People
  the By Group view pauses rendering.
- A group header's two controls repeat per group; name them by their `aria-label` (`Pin Alpha`, `Collapse Alpha`) rather
  than by position. The pin is a `Toggle` and the collapse a `Button`; record their focus ring and accessible names
  exactly as rendered.
