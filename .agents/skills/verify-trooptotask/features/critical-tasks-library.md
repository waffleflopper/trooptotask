# Manage the Critical Tasks library

A member with Critical Tasks configuration access maintains the unit's task definitions. Other members may see readiness
without gaining library write access, and one Organization's tasks must not appear in another.

## Sub-features

- `task-library`: create and edit a task's code, title, category, MOS applicability, expiration override and order; save
  and read it again after reload.
- `task-import`: review valid and invalid CSV rows before a create-only or upsert import, then read back the accepted
  rows and visible errors.
- `import-lost-reply`: a committed create-only or upsert write whose provider reply is lost reports its actual saved
  effects and preserves task identity.
- `task-lifecycle`: archive and restore a task without deleting an existing completion reference; active and archived
  filters show the correct records.
- `task-settings`: an Organization-scoped Critical Tasks configurator saves the default expiration and warning window
  without changing unrelated policy values.
- `task-access`: Critical Tasks `configure`, `view` and no-access members have distinct library permissions.
  Group-scoped configuration and a foreign Organization cannot write Organization A's library.
- `task-failure`: a duplicate code or failed save leaves the existing task intact and permits a corrected retry.
- `workspace-reuse`: moving between the matrix, Task Library and a task record keeps the loaded workspace; only each
  page's own load runs. Reports sits outside the `(workspace)` route group and never loads the workspace, so returning
  from Reports to the matrix loads it again.
- `workspace-read`: the readiness matrix, individual task record and Personnel Readiness tab show active tasks and
  scoped Personnel after their streamed workspaces load, and Reports shows them from its own page load; a configure
  member also receives archived definitions on every page inside the Critical Tasks workspace, and those pages show only
  active tasks.
- `import-switch`: an A import whose batch response arrives after switching to B adds no A task to B's library and shows
  no A feedback in B.
- `screen-states`: the task list buttons, task form and Defaults errors, the import dialog, and loading, empty, denied,
  foreign, narrow, dark and URL states (step 9).

## How to get to it (user POV)

Sign in to Organization A and choose `ICTLs` in the Organization navigation (its tooltip and breadcrumb read
`Critical Tasks`), then `Task Library`. Use `New Task`, the selected task's `Edit`, `Archive Task` or `Restore Task`, or
`Import CSV` (on the toolbar row, or in `More ICT task library controls` when the row is narrow).
`Critical Tasks Defaults` is below the library and uses the same configure permission.

## Helper controls

The [Critical Tasks library recipe](critical-tasks-library.md#driving-it-with-verifyapp) owns
`fault arm ict-tasks-insert-lost-ack`, `ict-tasks-update-lost-ack` and `ict-tasks-reorder-lost-ack`. They forward one
matching `POST` or `PATCH` to exact `/rest/v1/ict_tasks`, or one `POST` to `/rest/v1/rpc/reorder_ict_tasks`, on this
worker's loopback provider, consume a successful reply and throw `TypeError('fetch failed')`. A provider refusal passes
through unchanged. Reads, other methods, endpoints and origins remain untouched. They are table-scoped rather than row-
or Organization-scoped, so drive one intended mutation at a time and run `fault restore` before unrelated writes. Save
`fault state` with its actual `providerStatus`, native counts/errors and exact provider rows. These synthetic
post-commit transport losses establish committed-versus-reported import behavior, not an actual provider outage. Test
with `node --test scripts/verification/outbound-controls.test.mjs` before freezing controls for a run.

## Driving it with verify:app

Preconditions: set `V="node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"`, then run
`$V fixture`. It supplies Organization A's active `ictTaskAlpha` (68W, one retained completion) and `ictTaskGeneral`
(all MOS), archived `ictTaskArchived`, and Organization B's private `ictTaskForeign`. `ictConfigurator` is an ordinary
Organization A member with Critical Tasks `configure`; `ictViewer` has `view`; `ictScoped` has `configure` but
Alpha-only Group scope; `ictForeign` configures Organization B. The existing `rosterManager` has Training access and no
Critical Tasks access. Use `orgOwner` to confirm unrelated Organization policies remain available to an owner.

1. **Entry and filters:** With `$V actor ictConfigurator critical-tasks`, use the visible `Task Library` link. Expect
   only Organization A's active tasks in sort order, with the Alpha task's 68W label and All-MOS task. On the library
   page, search for `VERIFY-ICT-ALPHA`, select MOS `68W`, clear filters, then switch to `Archived` and find only the
   archived task. Reload and confirm the same A records; the foreign code must be absent. Capture the entry, filters and
   second read. `$V rows ict_tasks orgA` and `$V rows ict_tasks orgB task_code VERIFY-ICT-FOREIGN` provide separate
   synthetic provider readback.
2. **Readiness and reports:** As `ictConfigurator`, let the Critical Tasks matrix finish loading. Expect Organization
   A's active Alpha and All-MOS task codes, Alpha and Bravo Personnel, and no archived or foreign task code. Open the
   visible `Reports` link and require the readiness summary to show the same active task codes. As `ictScoped`, expect
   only Alpha Personnel in the matrix; as `ictForeign`, expect only Organization B's Person and task. As `orgOwner`,
   open Personnel, choose Able's `Details`, open its Readiness tab, and expect the Critical tasks table to read
   `1 of 2 ready` (50%). A Personnel `manager` without Critical Tasks access must not see that readiness value on the
   same tab. Open Able's matrix row and expect the individual record to retain the Alpha completion's date, expiration
   and Demonstration method, while the All-MOS task is not recorded. Capture the loaded matrix, individual record,
   report and Personnel Readiness tab, then revisit the library to confirm Active and Archived still separate after
   reload. This journey does not replace completion-write checks.
3. **Create and edit:** Use `New Task` to enter a unique code and title, category, comma-separated MOS values,
   expiration and sort order, then `Create Task`. Expect the new code and normalized values in the selected details.
   Reload; find the same ID with `$V rows ict_tasks orgA task_code CODE`. Edit its title and expiration, save, reload,
   and require the same ID and new values. Cancel a second edit and require no change. `New Task` and `Edit` move focus
   to Task Code, and `Cancel` returns it to the button that opened the form. A duplicate code must show a save error and
   leave the prior row unchanged; retry with a new code. Do not treat a toast or enabled button alone as persistence
   proof. **Direct-edit lost reply.** Record the original task ID and title, then edit its title. Arm
   `$V fault arm ict-tasks-update-lost-ack` before Save Changes. Require the public not-confirmed message with check and
   reload guidance, a neutral alert heading, the retained title draft and no success feedback. Capture the provider
   PATCH receipt and same-ID readback separately. Restore the fault, reload to inspect the saved title, then restore the
   original through Edit and a normally acknowledged Save Changes. A duplicate-code refusal must keep its specific
   reason and draft. For archive reply loss, require uncertainty feedback with the current view and confirmation
   retained until reload; inspect the actual saved archive state and restore visibly.

   **Atomic reorder.** Record exact task IDs and original sort orders with `$V rows ict_tasks orgA`. With no filters,
   use a visible Move up or Move down button. Native network observations must show one
   `POST /org/:orgId/api/ict-tasks/order` and one provider `POST /rest/v1/rpc/reorder_ict_tasks`, with no `ict_tasks`
   PATCH. `network arm-observe|arm-hold|arm-hold-fail PAGE ict-tasks/order` selects only the exact same-origin A POST.
   Hold delays the real reply after dispatch; held failure returns one synthetic 503 before dispatch. Restore the
   control after each case. Both Move buttons stay disabled until the reply, and focus returns to the pressed control or
   the other enabled Move button in its row. Require the intended order after reload, then restore the original order
   with a normal move. Arm `$V fault arm ict-tasks-reorder-lost-ack` before another move. Capture the public
   not-confirmed message with reload guidance, no success feedback, the provider receipt with `providerStatus: 200` and
   exact row readback separately. Expect both affected rows at their moved orders and never a half-swap or equal orders
   that were not equal before. Restore the fault and reload; the page must show the complete moved order. For a stale
   move, open a second tab before a normal move, then repeat the same move there without reloading. Use observation
   only, with provider faults restored. Capture the actual order POST status and response body plus rendered feedback; a
   pending request without a response establishes neither a refusal nor its cause. Require HTTP 409, the order-changed
   message with reload guidance and no row change; the move must not toggle back. Restore the original order with a
   normal move. For a tie, give two adjacent tasks the same order through Edit, move the later one up, and require the
   swapped display after reload with only the rows needed to separate them changed. For overlapping tied moves, record
   and then set three adjacent task Sort order fields to `0` through Edit. Call their ascending task codes A, B and C in
   the evidence. Open both tabs on that same view. In the first tab move A down, then in the stale second tab move B
   down. Require first success, second HTTP 409 with reload guidance, and provider order B, A, C after reload. Repeat
   from the original tied state with B down first and stale A down second; require A, C, B. Both commands must include
   unchanged swap participants and crowded boundary chains around propagated changes. Extend each boundary through
   original adjacent Sort order gaps of zero or one, stopping at a gap of at least two. For a disjoint race, assign four
   tasks with ascending codes A through D the Sort orders A=2, B=0, C=0, D=1. Open both tabs on the B, C, D, A view.
   Move B down first, then stale D down. Require first success, stale HTTP 409 with reload guidance, and
   provider/reloaded order C, B, D, A. Also check five tasks with A=1, B=0, C=2, D=0, E=1 from the B, D, A, E, C view.
   Move D down first, then stale E down. Require first success, stale HTTP 409 and provider/reloaded order B, A, D, E,
   C. Restore recorded orders between fixtures and after both races. Guards remain at their saved order and retain
   `updated_at`; the acknowledgement contains all participants. Restore every original Sort order through Edit. The
   1,000-row command limit counts guards too; a local swap in a large gapped library remains supported, while an
   oversized propagated or guarded span sends no command and offers Edit. Lower-level planner tests own those size
   limits. For the supported-order guard, set two adjacent active tasks to Sort order `2147483647` through their
   ordinary Edit forms. Move the later task up, which would require `2147483648` to separate the tie. Require
   `This move exceeds the supported ordering limits. Use Edit and set its Sort order instead.`, zero order POSTs,
   unchanged provider rows and unchanged visible order after reload. Restore both original Sort order fields through
   Edit and verify them. Component and SQL contract tests own refused, archived, foreign and concurrent moves.

4. **Archive and references:** Select seeded `ictTaskAlpha`; the detail shows one completion record. Archive it through
   the confirmation. Before reloading, return to the matrix through the visible `Critical Tasks` link: its column is
   gone and `Record Completion` no longer offers it. Expect it to leave Active and appear under Archived after reload,
   with the same task ID and `$V rows personnel_ict_completions orgA ict_task_id TASK_ID` still returning the original
   completion ID. Restore it from the reloaded library, return to the matrix through the `Critical Tasks` link, and
   require the restored column with its saved completion before any manual reload. The first navigation after a restore
   attempt reloads the workspace once. Reload and require the same active task and completion. Archive only a uniquely
   created task after its proof; the UI has no delete, so restart this owned disposable worker to remove created rows
   before another journey needs a fresh seed.
5. **Import:** From `Import CSV`, upload a small synthetic CSV with one unique valid task and one invalid row. Capture
   the preview, selected valid row and invalid-row explanation before confirming. Expect the accepted task and the
   preview's `1 errors` count with its row error (the result card excludes the unchecked invalid row, so it reads
   `0 failed`); reload and use `$V rows ict_tasks orgA task_code CODE` for the accepted row and zero rows for the
   rejected code. Repeat with `upsert` on the uniquely created code to prove the same ID updates. Use an owned worker
   restart for cleanup of imported rows. For mixed valid/invalid previews, clear selection and use Select all import
   rows. Require only valid rows checked, invalid checkboxes disabled, and their validation reasons still readable.
   Compare exact provider rows before/after preview and cancel without saving when checking preview behavior alone.

   **Committed import with a lost provider reply.** As `ictConfigurator`, upload a create-only CSV with header
   `task_code,title` and two unique valid rows. Read both codes with `$V rows ict_tasks orgA task_code CODE` and require
   zero rows before confirmation. Capture the two selected valid rows. Arm `$V fault arm ict-tasks-insert-lost-ack`,
   then use the ordinary import button. The control forwards one exact owned-provider `POST /rest/v1/ict_tasks`,
   consumes its successful reply and throws a synthetic transport error. Save `$V fault state` with the UI result, exact
   counts and row errors. Expect `2 created`, `0 updated`, `0 restored`, `0 failed`, and both tasks visible after Done
   without a reload. Require one provider row per code and a receipt with `providerStatus: 201`. If the UI reports
   conflicts or zero created despite saved rows, record a failing baseline. Reload for a separate visible persistence
   read. Restore `$V fault restore` before any other mutation.

   For the adjacent upsert case, reuse one uniquely imported code and record its ID and original title. Upload the same
   code with a changed title, choose upsert, and arm `$V fault arm ict-tasks-update-lost-ack` immediately before
   confirming. This loses one successful exact `PATCH /rest/v1/ict_tasks` reply. Expect `1 not confirmed`, `0 failed`
   and no saved-success claim. Record actual provider status, UI error and reload behavior separately. Restore the fault
   and reload to inspect the actual saved title and same provider ID before any new explicit retry. A disarmed ordinary
   retry must update that same ID once. These controls match this worker's table and method, not a particular row or
   Organization; drive one mutation at a time and disarm before archives or unrelated work. Archive uniquely created
   tasks through the UI after proof, then dispose this owned worker to remove them.

   **Lost browser batch reply.** Use `$V network arm-drop PAGE ict-tasks/batch [ORDINAL]` before confirming selected
   rows. This dispatches the real exact same-origin A POST, records its status, then rejects the browser reply once.
   Expect affected rows not confirmed, no automatic resend, and explicit reload guidance. Read saved codes separately,
   restore the hook and reload. Earlier confirmed chunks remain counted; later unsent chunks are not imported.

6. **Settings:** As `ictConfigurator` in the task library, read `Critical Tasks Defaults`, save distinct valid
   expiration/warning values and reload to see them persist. Restore the original values through the same page and read
   them again. Confirm the matrix reflects the saved thresholds after a fresh load. As `ictConfigurator`, attempt the
   mixed `Settings` → `Policies` page and direct Organization settings POST: both must remain denied. As `ictViewer` and
   `ictScoped`, send a valid signed-in POST to the dedicated Critical Tasks settings endpoint and require denial plus
   unchanged defaults. A `400` payload error is not permission proof.
7. **Dedicated and foreign access:** As `ictViewer`, open Critical Tasks readiness and attempt its library link and
   direct library route; expect no configure controls. Send a valid signed-in `POST /org/<orgA>/api/ict-tasks` from this
   page and require `403` or `404` plus `$V rows ict_tasks orgA task_code UNIQUE` returning zero. Repeat with
   Training-only `rosterManager` and Group-scoped `ictScoped`; Critical Tasks configuration requires the dedicated lane
   and Organization scope. As `ictForeign`, confirm its B task appears in B's library while A's code does not; an
   authenticated A task write must be denied and leave A unchanged. For `ictConfigurator`, an ordinary
   Organization-scoped member's valid create must persist; if UI or provider rejects it, preserve the exact
   request/status, unchanged row count and visible error as a baseline defect rather than changing the expectation.
8. **Workspace reuse:** As `ictConfigurator` on a settled matrix, clear resource timings and visit `Task Library`, then
   the matrix through the visible `Critical Tasks` link. The page-data probe from the skill's Drive section may show one
   `library/__data.json` whose Critical Tasks layout digits are `0`, and nothing for the return. The matrix must stay
   visible without a loading gap.

9. **Library, Defaults and import screen states.** Use the [component foundation](component-foundation.md) recipe's
   `reader.js` for focus, `aria-*` and live regions. Record each row PASS, FAIL, UNAVAILABLE or UNRUN with actor, width
   (1280x800 or 390x844) and theme; a FAIL stays FAIL until the same row passes on a later candidate. Toggle the theme
   with `Toggle theme` and the width with native `resize_page`.
   - ID: L1
     - Control or state: Task list selection buttons
     - How to reach it: `ictConfigurator` on `critical-tasks/library`, both widths
     - Expected: Each row is one `Button` named by its code and title, `aria-pressed="true"` on the selected row only.
       Tab reaches it; Enter and Space select it and keep focus; the app 3px ring shows on `:focus-visible`; the row is
       at least 24px tall. After a Move up or Move down press, focus stays on an enabled move button for that task,
       never `body`.

   - ID: L2
     - Control or state: Task form duplicate code
     - How to reach it: `New Task`, enter `VERIFY-ICT-ALPHA`, a title, category, `68W`, 12 and an order, then
       `Create Task`
     - Expected: The form stays open with every value. The error is a `Field.Error` on Task Code: `aria-invalid="true"`
       and an `aria-describedby` that resolves to it. Focus stays in the form. `$V rows ict_tasks orgA` is unchanged. A
       raw `<p>` is a FAIL

   - ID: L3
     - Control or state: Task form required fields
     - How to reach it: `New Task`, `Create Task` with every field empty
     - Expected: Each required field shows its own associated error (`aria-invalid`, resolving `aria-describedby`), or
       `Create Task` is disabled with a stated reason

   - ID: L4
     - Control or state: Defaults labels and range
     - How to reach it: `Critical Tasks Defaults`: read both inputs, then type `0` into Default expiration
     - Expected: `Default expiration` and `Expiring-soon window` resolve as labels and their help text resolves through
       `aria-describedby`. The range message is associated with the invalid field (`aria-invalid="true"`). Save is
       disabled with that reason

   - ID: L5
     - Control or state: Defaults failed save
     - How to reach it: As `orgOwner` in Members, change `ictConfigurator` to Critical Tasks view while its library page
       is open, then change a default and Save
     - Expected: `Failed to save Critical Tasks defaults` renders as an `Alert` (`role="alert"`), the entered values
       stay, and `$V rows organizations orgA` is unchanged. Restore the exact membership afterward

   - ID: L6
     - Control or state: Task import workspace
     - How to reach it: `Import CSV`, upload a CSV with one valid and one invalid row, then `Cancel`; open it again and
       finish an import of only the valid row with `Done`, then archive the imported task
     - Expected: The import is an inline workspace that replaces the library view, not a dialog. On open, focus moves to
       its `Import ICT Tasks` heading. Choosing a file moves focus to the `Review Import` heading. `Cancel` and `Done`
       return focus to `Import CSV`. Escape has no inline meaning. The invalid row's control is `aria-invalid="true"`
       with an `aria-describedby` that resolves to its reason; only valid rows can be selected

   - ID: L7
     - Control or state: Loading
     - How to reach it: `server-source arm ict_tasks hold 1 120000` on Home, then choose `ICTLs` and `Task Library`
     - Expected: A labelled loading region (`role="status"`, `aria-live="polite"`, no `aria-busy` on the live region)
       shows while the workspace is pending, not a blank page. `New Task` and `Import CSV` stay disabled with
       `Critical Tasks are still loading.` until release. Release with `server-source restore`

   - ID: L8
     - Control or state: Empty search and archived filter
     - How to reach it: Search `NO-SUCH-TASK`; switch to `Archived`
     - Expected: An `Empty` state names the empty filter result; the archived list shows only `VERIFY-ICT-ARCHIVED`

   - ID: L9
     - Control or state: Denied and foreign
     - How to reach it: `ictViewer` and `rosterManager` open `/org/<orgA>/critical-tasks/library` directly; `ictForeign`
       opens the same A address
     - Expected: The viewer and Training-only member get a settled denial (403 page or `Access Restricted`), with no
       library controls. The foreign member gets a 404 `Page not found` with no A data

   - ID: L10
     - Control or state: Narrow and dark
     - How to reach it: 390x844 dark: list, selected task details, the edit form, Defaults
     - Expected: No horizontal document overflow (`scrollWidth` equals `clientWidth`); controls stack inside the 358
       column; text and borders are visible in dark

   - ID: L11
     - Control or state: URL and selection state
     - How to reach it: Select a task, search, choose MOS `68W` and `Archived`, then reload
     - Expected: The address and storage carry no selection, search, MOS or status filter. After reload the library
       shows the Active list with an empty search and no MOS filter, and the first listed task is selected

10. **Import across a switch.** As `$V actor ictSwitch critical-tasks/library`, arm `$V feedback arm $PAGE`, open
    `Import CSV` and upload a CSV with header `task_code,title` and one unique valid task code. Arm
    `$V network arm-hold $PAGE ict-tasks/batch`, import the checked row and require a held real `200` plus one A row
    from `$V rows ict_tasks orgA task_code CODE`. Switch to B through the menu while it is held. B's Task Library is
    denied to this view-only actor, so follow `ICTLs` by client navigation (not a reload) and release. B's Critical
    Tasks list must show only `VERIFY-ICT-FOREIGN` and never the imported A code or title, with no A feedback; reload B
    and confirm. Back in A after reload, the imported task appears; archive it through the visible control. Repeat with
    `arm-hold-fail` and a second unique code: after release B shows no error and no new row exists in A or B. Imports
    over 500 rows send later chunks only after the first returns in the same Organization; the store's deferred-response
    tests own that ordering.

For direct denial proof, use the signed-in page's `evaluate_script` only for authenticated `fetch` with a valid unique
task payload, then compare exact provider rows using `$V rows`.

## Gotchas

- The Critical Tasks workspace requires read access; the library route load and page require configure access. Archived
  definitions are decided when the workspace loads, so a member newly granted configure sees them after a reload. A
  hidden button establishes only the UI affordance; request status plus unchanged rows establish denial.
- Library configuration is Organization-scoped. Group-scoped access may still read limited readiness, but it does not
  grant an Organization catalog write.
- Task archive hides a definition from active workflows and keeps its ID and completion history. Do not delete seeded
  completion rows to make an archive check pass.
- Organization policies remain guarded by owner/admin authority; Critical Tasks defaults use the dedicated library form
  and endpoint.
- The UI provides archive and restore but no task deletion. Restart the owned disposable worker to discard uniquely
  created proof rows; `clean-seeds` cannot remove UI-created tasks.
