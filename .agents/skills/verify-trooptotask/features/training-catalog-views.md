# Training catalog and views

An Organization Training configurator defines requirements and saved matrix layouts. A member with Training view access
sees only their authorized roster and Organization catalog; only an Organization-wide configurator can change
definitions.

## Sub-features

- `catalog`: create, edit, order and delete Training types while preserving their IDs and retained completion references
  on ordinary edits.
- `applicability`: Everyone, Optional and targeted role/MOS/rank rules determine whether a Person is required to
  complete a type; exclusions win over targeting.
- `saved-views`: create, edit, order and delete a named set of Training columns, then use it in the matrix.
- `workspace-reuse`: moving between the matrix, Manage Types and Manage Views keeps the loaded workspace and sends no
  page-data request.
- `access`: Training view/operate and Group-scoped actors can read their allowed matrix but cannot change the
  Organization catalog, even when a Group-scoped actor has the Training configure capability; the latter retains its
  Bulk Import action for authorized records. A foreign Organization's catalog is private.

## How to get to it (user POV)

Choose `Training` in the Organization navigation. In the `Training controls` toolbar, open `Manage Types` (the primary
action, always on the row) or `Manage Views` (the first control to fold into `More Training controls` as the page
narrows; find it with the [shared UI recipe](shared-ui.md#find-a-toolbar-control-on-the-row-or-in-more)). Manage Types
shows a `Training type controls` toolbar holding `+ New Type` and, in the detail pane, `Training type detail controls`
holding `Edit`. Manage Views shows `Training view controls` with the `Back to Matrix` link and `New View`, and
`Training view detail controls` with `Edit`; read-only members see none of the create or edit actions. On the matrix,
choose the named saved view in `Training view filter` and switch the Group selector between all available Groups and
Alpha. A direct link (a full page load) to `training/types` or `training/views` must enforce the same access rules as
visible navigation. Moving between the matrix, `Manage Types` and `Manage Views` reuses the loaded workspace and is not
access proof.

## Helper controls

```bash
$V network arm-fail 2 training-types # fail one Training catalog request; training-views also supported
```

## Driving it with verify:app

Preconditions: `$V fixture` supplies `trainingRequired`, `trainingTargeted`, `trainingOptional`, `trainingView`, the
matching foreign IDs, Able/Baker/Unassigned IDs and dated Able completion. Use `$V actor trainingConfigure training` and
save its returned page ID and Organization ID. The seeded Required type applies to everyone: Able has a current
completion, while Baker and Unassigned have no record. Targeted applies to MOS `68W` but excludes role `NCO`: Able is
required and incomplete; Baker and Unassigned are not required. Optional does not require a missing record. The saved
Focus View orders Targeted before Required and omits Optional.

1. **Read the unchanged catalog and matrix:** From Training, open Manage Types. Select each seeded type and capture its
   expiration, applicability and Optional details. Return to the matrix, choose the Focus View, and confirm the visible
   Targeted/Required column names and order and the Able/Baker/Unassigned status differences above. Switch between `A-Z`
   and `Group`, then Alpha and all Groups using the compact Group selector; the saved view stays selected and the
   expected visible roster changes. Reload and select Focus View again; compare the same saved IDs and column order
   using `$V rows training_types orgA id <ID>` and `$V rows training_views orgA id <trainingView>`.
2. **Create, edit and cancel:** Open Manage Types as `trainingConfigure`, create a uniquely named type with a fixed
   expiration, targeted `68W` MOS, and an NCO exclusion. Capture the chosen controls and Save result; reload and read
   back the new row and its arrays. Edit the seeded Required type's description, save and reload;
   `$V rows training_types orgA id <trainingRequired>` and `$V rows personnel_trainings orgA id <trainingCurrent>` must
   retain the type, completion and reference IDs. Restore the original description with focused `Control+A` and
   `Backspace`, save, and read back the same IDs and a null description. Cancel a separate edit and confirm no row
   change. Create a uniquely named view with two distinguishable type columns, use the visible up/down controls to
   reorder them, save, reload, and confirm `$V rows training_views orgA name <marker>` has that order. Edit that view,
   save and read back its stable ID; Cancel a separate view edit. Delete only the newly created view and type through
   their visible confirmations, then verify both rows are absent. Keep seeded types and views for later journeys.
3. **Access and isolation:** As `trainingView`, `trainingOperate`, `trainingScoped` and `trainingScopedConfig`, open the
   matrix and direct Types/Views routes; record visible read access, configuration affordances and the Alpha-only roster
   for each scoped actor. For `trainingScopedConfig`, check that Import remains available while Manage Types/Views and
   their direct-page mutation controls are absent. As `viewer`, verify the Training-none denial. For each denied actor,
   send authenticated `POST` requests to both A catalog JSON endpoints with valid unique names through its signed-in
   page; require `403` or `404` and empty `$V rows` readback for those names. As `trainingConfigure`, attempt the same
   valid requests against B; require denial and no B rows. As `trainingForeign`, confirm B's private type/view are
   visible in B but A's types/views are absent. Record HTTP status and stored-row absence separately from the UI
   affordance. A `400` is an invalid payload, not proof of denial.
4. **Failed save and retry:** On a fresh `trainingConfigure` Types page, arm `$V network arm-fail $PAGE training-types`
   immediately before saving a newly named type. Capture the matched `503` in `$V network state $PAGE`, visible error
   feedback, retained form state, and zero stored rows for that name. Restore the hook, retry through the visible form,
   reload and read back exactly one saved row. Delete it through the visible confirmation and read back absence. Repeat
   the same sequence for a new view with `training-views`. Missing visible feedback, a closed form, or lost entered
   values is a product failure, not a passing retry. On a UI-created saved view, change its name and reverse two
   selected columns. Arm `training-views` before the edit PUT. A controlled 503 must retain the same name/order draft,
   useful error, and enabled Save. The original saved ID and fields remain exact. Restore the hook and explicitly retry;
   reload must show the edited name/order on that same ID. Delete only the temporary view. This existing-view edit is
   distinct from new-view creation.

5. **Retained lookups:** As `rosterViewer`, inspect the Organization Dashboard Training projection and record what it
   actually shows; its current percentage does not include missing completions. As `trainingOnboarding`, open
   `Onboarding` → `Templates` and inspect the Training Type selector in a temporary template step for the seeded
   Required/Targeted names. Remove the temporary template through the visible controls and read back its absence.
6. **Workspace reuse and a failed source:** As `trainingConfigure` on a settled matrix, clear resource timings and visit
   `Manage Types`, its `Training` link back to the matrix, then `Manage Views`. The page-data probe from the skill's
   Drive section must show no `__data.json` entry. Click `Reports`: expect one `training/reports/__data.json` and no
   workspace reload. Returning to the matrix from Reports loads the workspace again. Failed source: arm
   `$V server-source arm personnel_trainings fail-hard` and do a full load of `/training/types` (then
   `/training/views`); each shows the shared `WorkspaceLoadError` (`Unable to load Training` with `Retry Training`),
   never a stuck skeleton or a thrown render, and Retry recovers after `server-source restore`. A client-side visit from
   the matrix does not reload the source, so it cannot trigger this.
7. **Type-management add, edit, delete and confirm:** As `trainingConfigure` in `Training type management workspace`,
   add a uniquely named type, select its row in the `Training types` grid, edit its name and an MOS/role applicability
   chip through the group selector (add, then remove one chip) and save; reload and read back the same ID. Open Delete
   Type: the `Delete Training Type` alertdialog names the type. Cancel first and require the row, selection and focus on
   the opening control to remain; then confirm and require the list entry and `$V rows training_types orgA name MARKER`
   to be absent. Repeat add/edit/cancel-then-confirm delete for a temporary view in Manage Views. Capture each workspace
   at narrow and wide widths once.

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
