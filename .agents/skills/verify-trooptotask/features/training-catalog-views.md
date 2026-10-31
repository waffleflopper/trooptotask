# Training catalog and views

An Organization Training configurator defines requirements and saved matrix layouts. A member with Training view access
sees only their authorized roster and Organization catalog; only an Organization-wide configurator can change
definitions.

## Sub-features

- `catalog`: create, edit, order and delete Training types while preserving their IDs and retained completion references
  on ordinary edits.
- `applicability`: Everyone, Optional and targeted role/MOS/rank rules determine whether a Person is required to
  complete a type; exclusions win over targeting.
- `saved-views`: the `Manage views` sheet lists saved views; its editor creates, edits, orders and deletes a named set
  of Training columns, and saving applies the view to the matrix.
- `workspace-reuse`: moving between the matrix, Manage Types and opening Manage views keeps the loaded workspace and
  sends no page-data request.
- `matrix-readout`: the page header, the cells, the group bands and the footer read the same readiness numbers, and the
  search, view and group controls narrow the rows without changing the header.
- `access`: Training view/operate and Group-scoped actors can read their allowed matrix but cannot change the
  Organization catalog, even when a Group-scoped actor has the Training configure capability; the latter keeps the
  Import link for authorized records. A foreign Organization's catalog is private.

## How to get to it (user POV)

Choose `Training` in the Organization navigation. The `Training controls` toolbar holds the `A–Z` and `Groups` toggle,
`Search name, rank, or MOS`, `Training view filter`, `Training group filter`, `Reports`, `Sign-in rosters` and `Export`.
Its `More Training controls` menu holds `Display`, `Import`, `Manage views` and `Manage types`; the first three
controls on the
right fold into it as the page narrows (find them with the
[shared UI recipe](shared-ui.md#find-a-toolbar-control-on-the-row-or-in-more)). `Training view filter` ends with
`Manage views…`, which opens the `Manage views` sheet; More's `Manage views` opens the same sheet. Manage Types shows
the page header `TRAINING TYPES` with `Back to matrix` and `New type`, over one list named
`Training types, in column order`; choosing a row's name opens the type sheet. The sheet lists the saved views A to Z,
each with `N of M columns`, and a `New view` button; a member who cannot configure sees no `New view` and cannot open a
view. Choosing a view opens its editor in the same sheet: `All views · Edit view` above the name, a `View name` field,
`In this view · N` (checked, in column order, each row with a drag handle) and `Not in this view · N`. The back arrow
(`Back to all views`) returns to the list; the footer holds `Delete view`, `Cancel` and `Save view`. On the matrix,
choose the named saved view in `Training view filter` and switch the Group selector between all available Groups and
Alpha. A direct link (a full page load) to `training/types` must enforce the same access rules as visible navigation;
`training/views` redirects (308) to `training`. Moving between the matrix, `Manage types` and opening `Manage views`
reuses the loaded workspace and is not access proof.

### Helper controls

```bash
$V network arm-fail "$PAGE" training-types # fail one Training catalog request; training-views also supported
```

## Driving it with verify:app

Preconditions: `$V fixture` supplies `trainingRequired`, `trainingTargeted`, `trainingOptional`, `trainingView`, the
matching foreign IDs, Able/Baker/Unassigned IDs and dated Able completion. Use `$V actor trainingConfigure training` and
save its returned page ID and Organization ID. The seeded Required type applies to everyone: Able has a current
completion, while Baker and Unassigned have no record. Targeted applies to MOS `68W` but excludes role `NCO`: Able is
required and incomplete; Baker and Unassigned are not required. Optional does not require a missing record. The saved
Focus View orders Targeted before Required and omits Optional.

1. **Read the unchanged catalog and matrix:** From Training, open Manage Types. Read the list at 1440: its visual
   columns
   `Training`, `Renews`, `Warns at`, `Who needs it`, `Applies to` and `Exempt`, one row per seeded type. Required reads
   `Every 12 months`, `60d · 30d`, `Everyone`, `3 of 3` and `—`. Targeted reads `Every 12 months`, `60d · 30d`,
   `MOS: 68W except Role NCO`, `1 of 3` and `—`. Optional reads `Never expires`, `—`, `Optional`, `0 of 3` and `—`.
   Return to the matrix, choose the Focus View, and confirm the visible Targeted/Required column names and order and the
   Able/Baker/Unassigned status differences above. Switch between `A–Z` and `Groups`, then Alpha and all Groups using
   the compact Group selector; the saved view stays selected and the expected visible roster changes. Reload and select
   Focus View again; compare the same saved IDs and column order using `$V rows training_types orgA id <ID>` and
   `$V rows training_views orgA id <trainingView>`.
2. **Create, edit and cancel:** Open Manage Types as `trainingConfigure`. Choose `New type`: the sheet reads
   `New training type · 4 of 4` over `Untitled type` (its fixed sort order sits after the highest seeded one, so the new
   row is last), `Create type` is the primary action and `Cancel` closes it. Create three types, each with a unique
   marker name:
   - Months: `Every few months`, color `Teal`, Good for `18`, First warning `90`, Final warning `45`. The timeline reads
     `Done 25 Oct 2026`, `Warn 26 Jan 2028 · 11 Mar 2028`, `Expires 25 Apr 2028` on 25 Oct 2026. The row reads
     `Every 18 months` and `90d · 45d`; read back `$V rows training_types orgA name MARKER` for `expiration_months` 18,
     `warning_days_yellow` 90, `warning_days_orange` 45, `color` `#3d8b8b` and a `sort_order` above every earlier row
     (31 after the seeded 10, 20, 30).
   - Card date: `Date on the card`. The row reads `Date on the card`; the stored `expiration_date_only` is true.
   - Never: `Never expires`. The row reads `Never expires` with `—` under `Warns at`.
   - Before creating the months type, set Good for `24` and First warning `90`, choose `Date on the card`, set Final
     warning `45`, choose `Never expires`, then `Every few months` again: the fields read `24`, `90` and `45`.

   Edit one of them: under `Who needs it` choose `Only some`, add an MOS chip `68W` under `Only` and a role chip under
   `Except` through `+ Add an exception`, then choose `Save changes`. The sheet closes, focus returns to that row's name
   button, the row reads `MOS: 68W except Role NCO` and `Applies to` reads `1 of 3` (the sheet read
   `Matches 1: SPC Able` and `Excludes 1: SPC Unassigned`). Reload and read back the arrays on the same ID. Edit the
   seeded Required type's description, save and reload; `$V rows training_types orgA id <trainingRequired>` and
   `$V rows personnel_trainings orgA id <trainingCurrent>` must retain the type, completion and reference IDs. Restore
   the original description with focused `Control+A` and `Backspace`, save, and read back the same IDs and a null
   description. Open another edit and change a field: Escape, a click outside and the corner close control are all
   unavailable while the edit is unsaved, and `Cancel` closes the sheet without asking, leaves the row unchanged and
   returns focus to the row's name button. An untouched sheet closes on Escape. Open `Manage views…`, choose `New view`,
   name it with a unique marker and check two distinguishable types: each checked type joins the end of `In this view`.
   Drag a grip, or press `Alt+ArrowUp` on a focused checkbox, to reorder them; unchecking a type moves it under
   `Not in this view`. `Save view` returns to the list, selects the view in `Training view filter` and shows its columns
   in that order; reload and confirm `$V rows training_views orgA name <marker>` has the same `columnIds` order. Edit
   that view and save; read back its stable ID. `Cancel` a separate edit and confirm no row change. Delete only the
   newly created view and types through their visible confirmations, then verify the rows are absent. Keep seeded types
   and views for later journeys.

   Server rule and legacy rows: through the signed-in page POST `api/training-types` with
   `warningDaysYellow:30, warningDaysOrange:30`, then `45`, and PUT `{id, warningDaysOrange:90}` for a type whose first
   warning is 90: each returns `400` `Make the final warning shorter than the first.` and writes no row. POST a legacy
   card-date type (`expirationMonths:24, expirationDateOnly:true, warningDaysYellow:120, warningDaysOrange:15`) and seed
   a legacy never type (`warningDaysYellow:10, warningDaysOrange:20`, seeded through the disposable provider API because
   the app's create route rejects that invalid pair), open each through the list and choose `Save changes` untouched:
   the sheet shows `Date on the card` with `120` and `15`, and `Never expires`; `$V rows` shows `expiration_months` 24
   and the warning days unchanged. Rename the never type and save again. The PUT omits both warning fields, the row
   retains `10` and `20`, and the new name persists after reload. Untouched invalid warnings on months and card-date
   types remain visible and block saving until corrected. With `$V network arm-hold 2 training-types`, change a field
   and choose `Save changes`: every field, `Delete type`, `Cancel` and `Save changes` are disabled, Escape does not
   close the sheet, and `network release` closes it with the saved value read back.

   Order regression: with at least 31 types in the disposable Organization, drag the last type above the first. Exactly
   one PUT to `api/training-types/order` sends the full `trainingTypeIds` and the previous `expectedTrainingTypeIds`.
   Reload and read every `sort_order` as unique consecutive positions `0` through `N - 1`. A stale expected list returns
   `409` without a write, unless the requested order is already saved, which returns `200` without a write. An omitted,
   repeated or foreign selected ID returns `400`. `PUT api/training-types` with a `sortOrder` returns `400` without a
   write, since only the order command moves a saved type. A refused reorder shows an error
   and restores the saved order. Remove only temporary types after the check.

3. **Access and isolation:** As `trainingView`, `trainingOperate`, `trainingScoped` and `trainingScopedConfig`, open the
   matrix and the direct Types route; record visible read access, configuration affordances and the Alpha-only roster
   for each scoped actor. For `trainingScopedConfig`, check that Import remains available while Manage Types and
   `Manage views` (in the View menu and in More) are absent. A full load of `/org/<org>/training/views` ends on
   `/org/<org>/training`. As `viewer`, verify the Training-none denial. For each denied actor, send authenticated `POST`
   requests to both A catalog JSON endpoints with valid unique names through its signed-in page; require `403` or `404`
   and empty `$V rows` readback for those names. As `trainingConfigure`, attempt the same valid requests against B;
   require denial and no B rows. As `trainingForeign`, confirm B's private type/view are visible in B but A's
   types/views are absent. Record HTTP status and stored-row absence separately from the UI affordance. A `400` is an
   invalid payload, not proof of denial.
4. **Failed save and retry:** On a fresh `trainingConfigure` Types page, arm `$V network arm-fail $PAGE training-types`
   immediately before saving a newly named type. Capture the matched `503` in `$V network state $PAGE`, the sheet's
   alert `Failed to save training type.`, the sheet still open with every entered value, and zero stored rows for that
   name. Restore the hook, retry through the visible form, reload and read back exactly one saved row. Delete it through
   the visible confirmation and read back absence. Repeat the same sequence for a new view in the `Manage views` sheet
   with `training-views`: the sheet stays on the editor, `View name` shows `Failed to save view.`, the name and checked
   order are kept and `Save view` is enabled again. Missing visible feedback, a closed form, or lost entered values is a
   product failure, not a passing retry. On a UI-created saved view, change its name and reverse two checked columns.
   Arm `training-views` before the edit PUT. A controlled 503 must retain the same name/order draft, useful error, and
   enabled `Save view`. The original saved ID and fields remain exact. Restore the hook and explicitly retry; reload
   must show the edited name/order on that same ID. Delete only the temporary view. This existing-view edit is distinct
   from new-view creation.

5. **Retained lookups:** As `rosterViewer`, inspect the Organization Dashboard Training projection and record what it
   actually shows; its current percentage does not include missing completions. As `trainingOnboarding`, open
   `Onboarding` → `Templates` and inspect the Training Type selector in a temporary template step for the seeded
   Required/Targeted names. Remove the temporary template through the visible controls and read back its absence.
6. **Workspace reuse and a failed source:** As `trainingConfigure` on a settled matrix, clear resource timings and visit
   `Manage Types`, its `Training` link back to the matrix, then open `Manage views…`. The page-data probe from the
   skill's Drive section must show no `__data.json` entry. Click `Reports`: expect one `training/reports/__data.json`
   and no workspace reload. Returning to the matrix from Reports loads the workspace again. Failed source: arm
   `$V server-source arm personnel_trainings fail-hard` and do a full load of `/training/types`; it shows the shared
   `WorkspaceLoadError` (`Unable to load Training` with `Retry Training`), never a stuck skeleton or a thrown render,
   and Retry recovers after `server-source restore`. A client-side visit from the matrix does not reload the source, so
   it cannot trigger this.
7. **Type delete, order and the Manage views sheet:** As `trainingConfigure`, create a uniquely named type, open its
   sheet and choose `Delete type`: the `Delete Training Type` alertdialog names the type. Cancel first and require the
   sheet and focus on the opening control to remain; then confirm and require the sheet closed, the row gone and
   `$V rows training_types orgA name MARKER` to be absent, with focus on the `New type` button. Reorder: grab a row's
   grip (`Reorder <name>`) and press ArrowUp, or drag it with
   `$V pointer drag PAGE URL '[aria-label="Reorder <name>"]' '[aria-label="Reorder <other>"]'`; the row moves up and the
   matrix column order follows after a reload, and `training_types.sort_order` reads the new order. With
   `$V network arm-hold $PAGE training-types/order`, press ArrowUp twice on the same grip: the row moves up two places
   at once and only one `PUT` is sent. After `$V network release $PAGE` (release again if the follow-up is held),
   `$V network state $PAGE` lists two `PUT`s with `200`, and `sort_order` reads the row two places up. Repeat
   add/edit/cancel-then-confirm delete for a temporary view in the `Manage views` sheet: `Delete view` opens the
   `Delete Saved View` alertdialog, Cancel keeps the editor, and Delete returns to the list without the view. Capture
   the Types page and the sheet at 1440, 1024 and 390 wide once; the Types list stacks each row into two lines below a
   58rem (928 px) container, and from 928 px every column through `Exempt` is visible with no clipping.

8. **Matrix readout:** As `trainingConfigure` at 1440 wide on a fresh seed, read the matrix before recording anything.
   Capture each value from a text snapshot.
   - Header: one right-aligned line above the toolbar, `0 EXPIRED · 0 EXPIRE WITHIN 30 DAYS`, in the small upper-case
     mono type. No eyebrow, visible title, `not recorded` count or readiness figure shows; the page's `Training` heading
     is screen-reader only.
   - Columns: `Verification Required Training 12 MO`, `Verification Targeted Training 12 MO` and
     `Verification Optional Training NO EXPIRY`, each with its color square.
   - Cells: Able's Required cell shows the lapse month and year of `trainingExpires` (`Oct ’27` on 25 Oct 2026); Able's
     Targeted, Baker's Required and Unassigned's Required read `No record` (red outline). Every cell that does not apply
     reads `—`, and the Optional column is `—` for all three.
   - Bands: `ALPHA 1` `50%`, `BRAVO 1` `0%`, `UNASSIGNED 1` `0%`. Collapse `BRAVO`: its band shows `1` under Required
     and the Baker row leaves; its toggle reports `aria-expanded="false"`.
   - Legend: `Expiring soon`, `Expiring`, `Expired`, `No record`, `Not required` and `EXEMPT`; no `Current until` entry.
     The matrix has no footer row.
   - Search: type `baker` into `Search name, rank, or MOS`. The count line reads `1 personnel × 3 types`, one row stays
     under `BRAVO`, and the header numbers do not change. Clear the field with `Control+A` and `Backspace` (`tool fill`
     with an empty value leaves the bound query in place). `11b` or the MOS `68W` match by MOS.
   - Display: More's `Display` submenu, there at every width, holds the checkboxes `Color every status` and
     `Only Soldiers needing action`, then the `Current cells show` radio group `Date`, `Check mark`, `Blank` with `Date`
     checked. Each choice keeps the menu open. `Check mark` turns Able's Required cell to `✓` and `Blank` empties it;
     `No record` cells keep their text. `Color every status` fills Able's Required cell green; the red and amber cells
     are unchanged. `Only Soldiers needing action` keeps all three rows on a fresh seed, since each has a `No record`
     cell, and the count line reads `3 of 3 need action × 3 types`; each band's count reads `1 of 1`. Record a
     completion in every open cell of one Soldier with the filter on: the row stays and the count drops to `2 of 3`;
     turning the filter off and on again removes the row. Reload: every choice is still set. Reset them all to `Date`
     and off afterwards.
   - Narrow widths: at 1024 the toolbar keeps `Search`, both filters and `Export` and folds `Reports` and
     `Sign-in rosters` into More; at 390 search takes its own full-width row (322 wide) above a row holding the toggle,
     `Training view filter` and More, and More lists `Group` (`Group: All`), `Reports`, `Sign-in rosters`, `Export`,
     `Display`, `Import`, `Manage views` and `Manage types`. Text typed in search and focus stay in the field when the
     width crosses 390 and 600. `scrollWidth` equals `clientWidth` on the page and on the `Training controls` toolbar,
     and the matrix viewport scrolls sideways inside itself.
9. **Manage views sheet layout and guards:** As `trainingConfigure`, open More, then `Manage views…` (the dialog is
   named `Manage views` and holds focus; Escape returns focus to `More Training controls`; opened from the View menu's
   last option, Escape returns it to `Training view filter`, which still reads the current view, and choosing
   `Manage views…` again opens the sheet again). The list reads `SAVED VIEWS · 1` and `New view`, and the seeded row
   `Verification Focus View` `2 of 3 columns`. Measured widths: the dialog is 384 wide on the right edge at 1440
   (left 1056) and 1024 (left 640), and at 390 it spans the screen (left 0, width 390); `scrollWidth` equals
   `innerWidth` at all three and the editor body does not scroll sideways. In the editor the footer holds `Delete view`
   at the far left and `Cancel`, `Save view` at the right at 1440 and 1024.
   - Editor: `In this view · 2` lists Targeted then Required, `Not in this view · 1` lists Optional. Check Optional: it
     becomes the third row of `In this view` and keeps focus; the description reads `3 of 3 trainings`, the back arrow
     (`Back to all views`) is disabled and Escape leaves the dialog open. `Cancel` returns to the list with
     `2 of 3 columns` and no row change.
   - Name: clear it on a new view and choose `Save view`; focus lands on `View name` with `Name is required.`.
   - Failed save: `$V network arm-fail $PAGE training-views`, save a new view named with a marker; the sheet stays on
     the editor with `Failed to save view.` on `View name`, the typed name is kept and `Save view` is enabled. After
     `network restore`, `Save view` returns to the list (`SAVED VIEWS · 2`), focus lands on the saved row, and
     `$V rows training_views orgA name <marker>` shows it.
   - Busy: `$V network arm-hold $PAGE training-views`, then `Save view`: the dialog reports `busy`; the back arrow,
     `View name`, `Delete view`, `Cancel` and `Saving...` are disabled and Escape leaves it open. `$V network release`
     returns to the list with the new name.
   - Delete: `Delete view` opens `Delete Saved View` reading `Delete "<name>"? This only removes the saved layout.`; its
     `Cancel` keeps the editor and focuses `Delete view`. With `arm-fail` armed, `Delete` shows the alert
     `Failed to delete view. Try again.` and the confirmation stays; with that view selected in the matrix,
     `Training view filter` still reads its name and the matrix keeps its columns. After `restore`, `Delete` returns to
     the list (`SAVED VIEWS · 1`) and `$V rows training_views orgA name <marker>` is empty. Deleting the view selected
     in the matrix selects `All trainings`.
   - Access: `trainingView` and `trainingScopedConfig` see `All trainings | Verification Focus View` in the View menu
     (no `Manage views…`); `trainingView` still has More with `Display`; `trainingScopedConfig` also has `Import`.
     Reports, Sign-in rosters and Export fold into More as the toolbar narrows.
   - Redirect and load: a full load of `/org/<org>/training/views` ends on `/org/<org>/training`. With
     `$V server-source arm personnel_trainings fail-hard` a full load of `/training` shows `Unable to load Training`
     with `Retry Training` instead of the matrix, so the sheet is unreachable; `server-source restore` recovers.

Use `tool evaluate_script` on the signed-in page for endpoint probes. Substitute the fixture IDs and a unique marker:

```bash
npm run --silent verify:app -- tool evaluate_script "{\"pageId\":$PAGE,\"function\":\"async () => { const response = await fetch('/org/ORG_ID/api/training-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'MARKER' }) }); return { status: response.status, body: await response.text() }; }\"}" --worker "$WORKER"
```

For views use `api/training-views` and `{name:'MARKER',columnIds:[]}`. Read the same marker in the selected Organization
through `$V rows training_types orgA|orgB name MARKER` or `$V rows training_views orgA|orgB name MARKER`.

## Gotchas

- Missing ids, duplicate names, the 100-character name limit and the forms' 4xx messages are driven in
  [Invalid input](invalid-input.md).
- Training `configure` requires Organization scope; Group-scoped Training access cannot change the global catalog. A
  hidden button alone does not establish the server denial.
- The Group selector is a compact control. Use its accessible name and visible options; do not assume Group pills.
- This select component's portal options may be absent from a DevTools accessibility snapshot even when rendered. Read
  its open listbox options without changing the page, then use the focused trigger's arrow keys and Enter; confirm the
  visible selected value or resulting matrix/step. An empty snapshot listbox alone does not prove an empty catalog.
- Clearing the Description textbox with `tool fill` can empty its DOM value without updating Svelte's bound value. Use
  focused keyboard selection and deletion, then inspect the save request body when diagnosing a discrepancy. The server
  accepts `description: null` and persists null.
- Deleting a type removes its completions from the loaded matrix without a reload, matching the server cascade. A type
  deletion that needs approval keeps them.
- A seeded Training type deletion can remove associated completions. Delete only rows created during this journey;
  restart this owned worker if a seeded row changes before another scenario needs it.
- `clean-seeds` removes helper-created temporary rows, not types or views created through the UI. Delete UI-created rows
  visibly and read back their absence before cleanup.
- Direct API and provider reads are not substitutes for browser interaction.
