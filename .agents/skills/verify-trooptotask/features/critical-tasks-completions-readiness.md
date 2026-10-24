# Record Critical Tasks and inspect readiness

A member with Critical Tasks operate access records validation results and uses the matrix, individual record and
reports to find readiness gaps. Current and expiring-soon completions count as ready; expired and missing completions do
not. MOS applicability excludes unrelated tasks from the denominator.

## Sub-features

- `completion-record`: create or edit a completion's date, method, validator and notes; preserve its ID on edit and
  require persistence after reload.
- `completion-recovery`: a failed save retains the modal draft and prior data; a corrected retry persists once. An
  unresolved response cannot be reported as saved.
- `completion-import`: import a multi-tab workbook on its own page: match each person by name and ask when two share
  one, map an unknown task code once for every row, flag a row repeated in the file, fix a date inline, commit, download
  the rows not imported and read the import back as Unchanged. The import never creates tasks.
- `import-lost-reply`: distinguish refused and unconfirmed completion writes from confirmed saved rows without
  duplicating dated history.
- `readiness`: matrix cells, individual readiness, Personnel detail and reports agree on current, expiring, expired,
  missing and not-applicable examples.
- `history`: multiple dated completions use the latest applicable record; archived task history retains its record and
  dates while leaving active readiness.
- `reports-export`: combined Group/rank/MOS/duty-role filters, error/retry and downloaded matrix/report workbooks
  preserve independently calculated values and scope.
- `completion-access`: dedicated Critical Tasks operate/view/no-access lanes, Alpha-only/empty Group scopes, unassigned
  Personnel and foreign Organization targets have distinct allowed and denied behavior.
- `scope-switch`: an A response cannot replace B's records or enable A's completion controls after switching
  Organizations, and the switcher waits while an A import saves.
- `screen-states`: matrix height and sticky scrolling, landmarks, a rejected workspace source, the Record Completion
  dialog (focus, held title, failed save), the import page, person detail tables, Reports metrics, chart data tables,
  the `Histogram MOS` select, and loading, empty, error, denied, narrow and dark states (step 11).

## How to get to it (user POV)

Choose `ICTLs` in Organization navigation (its tooltip and breadcrumb read `Critical Tasks`). The matrix toolbar
(`Critical Tasks controls`) is one row at every width: the `A-Z`/`Group` view switch, the search field,
`Critical Tasks group filter` (whose all-option reads `All groups`), `Gaps only`, `Export Excel`, `Import Completions`,
`Task Library` (configure only) and `Reports`, then the primary `Record Completion`. Record and import need operate
access; `Import Completions` is a link to its own page at `critical-tasks/import`, which steps through File, Columns,
Review and Done. As the page narrows, controls fold one at a time into `More Critical Tasks controls`, starting with
`Export Excel`, and the search field becomes an icon only after every other control has folded; `Record Completion`
stays on the row at every width. Open a Person's linked name for their individual task record; use a task's
`Log Completion` or `Edit` control there. Choose `Reports` for filters and `Export Excel`; its toolbar
(`Critical task report controls`) folds the same way, with the `Group`, `Rank`, `MOS` and `Duty role` filters leaving
from the last to the first and `Export Excel` pinned. The individual record (`Personnel critical task controls`) and the
task library (`ICT task library controls`) use the same toolbar: `Input Task` and `New Task` are pinned, and their other
controls fold into More. An authorized Personnel detail lists the Person's critical tasks on its Readiness tab. A
view-only member can inspect results without recording them.

## Helper controls

The [completion/readiness recipe](critical-tasks-completions-readiness.md#driving-it-with-verifyapp) owns
`ict-completions-insert-lost-ack` and `ict-completions-update-lost-ack`. They apply the
[same one-shot post-commit transport loss](critical-tasks-library.md#helper-controls) to exact `POST` and
`PATCH /rest/v1/personnel_ict_completions`, respectively. Restore before another mutation. Capture exact
Person/task/date IDs and notes with `rows personnel_ict_completions`, separately from native import counts and errors. A
committed insert must not be reported as refused, and an unresolved update must not be reported as confirmed merely
because its content matches a later read.

Critical Tasks actors are `ictConfigurator`, `ictOperator`, `ictViewer`, `ictScoped`, `ictEmpty`, `ictForeign` and
`ictSwitch`; all have Personnel/Training access absent. `ictSwitch` configures A and views B. `actor` accepts
`critical-tasks`, `critical-tasks/library` and `critical-tasks/reports`. The
[completion/readiness recipe](critical-tasks-completions-readiness.md) owns dated examples, import/history and scope
checks. `network` also accepts `ict-tasks/batch` (Task Library import, including `arm-hold-fail`),
`personnel-ict-completions`, `personnel-ict-completions/batch`, `critical-tasks/reports/summary`,
`critical-tasks/reports/export` and `critical-tasks/matrix/export`; it still matches only the exact synthetic A
endpoint. `network arm-drop PAGE ict-tasks/batch|personnel-ict-completions/batch [ORDINAL]` dispatches only the exact
same-origin A POST, records its real status and rejects that reply once. Confirm earlier chunks remain counted and lost
replies appear not confirmed with reload guidance; restore before unrelated actions.
`rows personnel_ict_completions orgA ict_task_id ID` reads completion IDs and values.

Use `workbook FILE 'Critical Tasks Report'` or `workbook FILE 'Critical Task Matrix'` for the respective exports.

## Driving it with verify:app

Set `V="node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"` and run `$V fixture`.
`ictOperator` has Critical Tasks operate with Personnel/Training none; `ictViewer` has view; `ictScoped` has Alpha-only
configure; `ictEmpty` has operate with an empty Group set; `ictForeign` configures B; `ictSwitch` configures A and views
B. `rosterManager` has Training without Critical Tasks. `orgOwner` can inspect the reverse Personnel consumer.
`$V actor ROLE critical-tasks` or `critical-tasks/reports` uses normal sign-in; navigate to individual records through
visible Person links. Do not print credentials or attach to another worker's provider.

The initial A fixture has Able (Alpha, 68W), Baker (Bravo, 11B), and Unassigned (68W). Alpha task applies to 68W;
All-MOS applies to all three. Only Able/Alpha is completed, so **one of five applicable assignments is ready (20%)**.
Able is **1/2 (50%)**, Baker **0/1**, Unassigned **0/2**. B's 11B Person is not applicable to its 68W task. The archived
definition is excluded. Library journeys rely on this unchanged seed; add dated examples through the UI rather than
pre-populating extra completions.

1. **Baseline and dedicated entry:** Sign in as `ictOperator`, let the matrix stream finish and capture its three A
   rows, active task codes and readiness values. There must be no library/configuration affordance. Open Able and read
   the retained Alpha completion ID/date/method via `$V rows personnel_ict_completions orgA id ID`. Reports must show
   20%; the owner's Personnel Readiness tab must agree for Able, its Critical tasks `<ready> of <total> ready` equal to
   50%. A Personnel-only manager must not receive that readiness value. Capture visible reads and separate provider
   evidence. The `Group` view lists the viewer's pinned Groups, then the Organization's Group order, then Unassigned: on
   the fresh fixture Alpha, Bravo, Unassigned. Pin Bravo for `ictOperator` with an authenticated
   `POST /org/<orgA>/api/pinned-groups` `{"groupName":"Bravo"}` from the page and reload: Bravo, Alpha, Unassigned. A
   `DELETE` with the same body unpins it.
2. **Record, failed save and retry:** On Able's individual page log All-MOS using `dates.ictWarningCompleted`,
   Demonstration, a unique synthetic validator and note. Arm one `personnel-ict-completions` failure before Save. Expect
   the modal/draft to remain, an error, no saved-success feedback and zero marker rows. Restore the network control and
   retry the same visible Save. Expect exactly one new row after reload, its entered values intact, **Able 2/2 (100%)**
   and **A 2/5 (40%)**. All-MOS expires at `dates.ictWarningExpires` and is expiring soon; it still counts as ready.
   Reopen that completion and save its unchanged values; require the same single row. Test a held real response by
   editing that existing warning completion: inspect persisted provider data while Save remains pending, then release
   and require confirmed feedback and reload. **Direct-edit lost reply.** Open an existing completion from a matrix cell
   or its individual record. Record its exact ID, date, method and notes, then enter distinct notes. Arm
   `$V fault arm ict-completions-update-lost-ack` before Save. Require the public not-confirmed message with check and
   reload guidance, a neutral alert heading, retained notes, method and date, and no success feedback. Capture the
   provider PATCH receipt and same-ID readback separately. Restore the fault and reload for a visible saved read before
   restoring original values through a normally acknowledged Save. The matrix and individual callers share the same
   modal; identify which was driven and which has component coverage.

3. **Edit and dated rules:** Edit that same completion to `dates.ictExpiredCompleted` with a different note. On reload
   require the same ID, `dates.ictExpiredExpires`, expired status, Able 50% and A 20%. Restore the warning date on that
   ID and recheck 100%/40%. Log Baker/All-MOS with `dates.ui`: Baker becomes 100%, A **3/5 (60%)**. No Alpha completion
   or applicable denominator belongs to Baker. Clear a note with visible keyboard Select All/Backspace, capture the
   empty draft, save and require stored null on the same ID. Native `fill` with an empty string may leave text intact; a
   retained value without an empty submitted draft is not an application failure. Run one keyboard submit/cancel and
   verify dialog focus returns to its trigger.
4. **Import and history:** Run `$V seed duplicate-able` first: it adds a PFC `Able, Synthetic` in Alpha beside the
   fixture's SPC. Build a synthetic workbook with exceljs. Give tabs `Alpha` and `Bravo` two banner rows above the
   header `Soldier, Task #, Date, Method, Graded by, Remarks`. `Alpha` holds
   Able/`VERIFY-ICT-ALPHA`/`2026-09-14`/Demonstration (the seeded completion),
   Able/`VERIFY-ICT-ALL`/`2026-10-01`/Demonstration/`SFC Lee`/`Range day`, and
   Baker/`OLD-ALPHA`/`2026-10-02`/Lecture/`SFC Lee`. `Bravo` holds Baker/`OLD-ALPHA`/`2026-10-09`/Lecture/`SFC Lee`,
   Unassigned/`OLD-ALPHA`/`2026-10-02`/Practical Exercise, Unassigned/`VERIFY-ICT-ALL`/`2026-10-03` twice (Remarks
   `First entry` and `Typed twice`), and Baker/`VERIFY-ICT-ALL`/`2026-13-40`/Lecture/`Bad date`. Names are written
   `Last, First`.

   As `ictOperator`, follow `Import Completions` and drop the file. Columns reads `2 sheets read · 8 rows`; `Soldier`
   maps to `Last, First` and `Graded by` starts at `Don't import`. Set `Import Graded by as` to `Validator` and require
   `6 of 6 columns used` and `Review 8 rows`. Review reads `All · 8` and `Needs a fix · 8`. The rail asks
   `Which person?` for `"Able, Synthetic" · 2 rows`, offering only `SPC Able, Synthetic` and `PFC Able, Synthetic` (both
   Alpha), and `Unknown task` for `"OLD-ALPHA" · 3 rows`, offering the active tasks only. The two `2026-10-03` rows read
   `Same record as row 7 on Bravo. Skip one of these rows.` and `Same record as row 6 on Bravo. …`, and the bad date
   shows an editable Completed cell with `Completed: Enter a valid date.` Choose SPC Able and `Apply to 2 rows`, choose
   `VERIFY-ICT-ALPHA` and `Apply to 3 rows`, skip one duplicate, and type `2026-10-13` into the Completed cell. Review
   reads `New · 6`, `Unchanged · 1` and `Skipped · 1` with `1 row already matches. Nothing to save.`; the footer reads
   `6 changes ready` and `6 added · 0 updated`. Import. Done reads `6 changes saved.` with Added 6, Unchanged 1 and
   Skipped 1, and the downloaded not-imported workbook holds the skipped row on `Bravo` with `Reason`
   `You skipped this row.` `$V rows personnel_ict_completions orgA` shows the six new rows on the SPC Able, Baker and
   Unassigned IDs: `OLD-ALPHA` saved as Alpha for all three rows, a blank method saved as `Other`, `SFC Lee` as the
   validator where given, and the corrected `2026-10-13`. None belongs to the seeded PFC. The matrix shows the new cells
   after Done without a reload.

   Choose `Import another file`, drop the same workbook with the same mapping and give the same answers and skip. Review
   reads `Unchanged · 7` behind `7 rows already match. Nothing to save.`, and `Import 0 changes` stays disabled. A row
   whose Remarks or Method differs from the saved completion for that Person, task and date reads Update, with the old
   value under the new one; a blank cell never clears a saved value. Run `clean-seeds` once the seeded PFC holds no
   completion.

   History: the store holds only the latest completion per Person and task, so an older dated row for a pair reads New
   in Review; the server matches it on Person, task and date and updates that row in place, so dated history is never
   duplicated. Archive Alpha through the configurator's library, then reload the operator's page and reopen Able: its
   Alpha dates remain in Historical Completions, while only All-MOS contributes to active readiness. Restore the same
   task ID.

   **Committed completion insert with a lost provider reply.** As `ictOperator`, import a CSV with header
   `Last name,First name,Task code,Completed,Validation method,Notes` holding a fixture Person, `VERIFY-ICT-ALL`, an
   unused date, Demonstration and a unique Notes marker. Read
   `$V rows personnel_ict_completions orgA personnel_id PERSON_ID` and require no matching row before confirmation. Arm
   `$V fault arm ict-completions-insert-lost-ack` on Review, then Import. The control lets one exact owned-provider
   `POST /rest/v1/personnel_ict_completions` commit, consumes its successful reply and throws a synthetic transport
   error. Expect the row counted as Added, exactly one saved Person/task/date row and `providerStatus: 201`. A raw
   uniqueness error despite a saved row is a failure. Restore `$V fault restore` and require the matrix cell after Done
   without a reload. The UI has no completion-delete action; discard the created row only by disposing this owned
   worker.

   For an adjacent same-date update, record the completion ID, import the same Person/task/date with revised Notes and
   arm `$V fault arm ict-completions-update-lost-ack` on Review. A successful PATCH whose reply is lost returns an
   unconfirmed result for that row. Done reads `0 changes saved.` with `Not confirmed 1` and
   `The last batch was not confirmed`. Reload to inspect the actual effect on the same provider ID before any new
   import. These controls are table- and method-scoped inside the owned provider, not restricted to one row or
   Organization; drive one mutation at a time.

   In a mixed batch, confirmed saves and known failures keep their own results when another row is unconfirmed. Only
   confirmed records merge into the completion store. Done counts the unconfirmed rows separately, leaves confirmed rows
   out of the not-imported workbook, and marks later chunks Not attempted without sending them.

   **Lost browser batch reply.** `$V network arm-drop PAGE personnel-ict-completions/batch [ORDINAL]` dispatches only
   the real exact same-origin A POST and rejects its reply once after recording its status. Use the registered
   `bulk-501` roster from step 8 with ordinal 2. Expect Done to read `500 changes saved.` with `Not confirmed 1` and no
   automatic resend. Exact saved-row readback can show all 501 committed while only 500 are confirmed in the UI. Keep
   confirmed, unconfirmed and not-imported counts distinct.

5. **Reports and downloaded values:** With the warning Able and current Baker rows, All Groups is 60%, Alpha 100%, Bravo
   100%, and MOS 68W **2/4 (50%)**. Unassigned remains 0/2 because its imported All-MOS is expired. Preserve report and
   matrix workbooks; inspect `Critical Tasks Report` and `Critical Task Matrix` using `$V workbook FILE SHEET`. The
   matrix workbook must retain scoped names/task columns and status/completion-date cells; the report workbook must
   retain readiness summaries and risk/task rows. The matrix has no readiness-total column, and the report has no
   completion-date cells. Archived/foreign data must be absent. Arm a summary failure before changing a filter; require
   a visible error with prior data retained, restore, clear the filter and reselect it to retry (there is no Retry
   button). Arm an export failure before Export; require no downloaded success and a working retry. Direct summary API
   reads prove supported Group/MOS filters separately from UI actions. Historical `asOf` calculations belong to
   owned-query/domain tests: the HTTP input does not accept an `asOf` parameter.

   For independent rank and compound examples, use the owner's visible Organization Settings → Ranks → Add Army first,
   then set Able to SGT through Personnel's Data sheet → Edit. The initially empty catalog rejects an unknown SGT with a
   retained draft; catalog setup is disposable fixture preparation. With the same dated completions, NCO or SPC is **1/3
   (33%)**, Alpha+68W+Medic+SGT is **2/2 (100%)**, 68W+NCO+SPC is Unassigned alone at **0/2**, Bravo+68W has **0/0
   (0%)**, and selecting both 68W and 11B is a union at **3/5 (60%)**. Capture visible compound controls and their
   workbook, separately from authenticated summary API responses. Matrix Gaps only (on the row, or in More's Filters
   section when folded) plus search Unassigned exports only that Person, Alpha Not Recorded and All-MOS Expired with its
   completion date. Restore Able's rank to SPC; editing the Data sheet name can also regenerate its slug while retaining
   the Person ID.

6. **Group and lane denials:** `ictViewer` sees results without log/edit/import controls; valid completion
   create/update/delete and batch writes must be denied with unchanged IDs/values. `rosterManager` cannot read/write
   Critical Tasks merely because navigation is under the same Organization. `ictScoped` sees Able only: import a CSV
   with Able, Baker and Unassigned rows. Baker and Unassigned each get an `Unknown person` question whose only choice is
   `SPC Able, Synthetic`; skip both and import, and Done reads `1 change saved.` with `2 rows not imported`. Only Able's
   row persists. A direct batch for Baker returns 200 with
   `This person is not on a roster you can record completions for.` and stores nothing. Prove direct Baker/unassigned
   writes and their detail pages are denied or concealed. A scoped batch may return 200 with per-row errors, and a Bravo
   report filter may return 200 with an empty authorized projection; require no excluded data or stored rows rather than
   a particular denial status for those responses. `ictEmpty` sees no Personnel and cannot write a named Person.
   `ictForeign` sees B only and cannot read/write A, including A IDs in a B payload. For direct authenticated API
   denials use valid known IDs and payloads: a validation 400 is not access proof. Compare exact `$V rows` before/after,
   including absent unique notes. Group catalog: as `ictScoped`, the workspace and report Group filters and their page
   data must name only Alpha; `ictEmpty` receives no Group IDs or names; `ictViewer` (Organization-wide) keeps every
   Group.
7. **Switch and stale response:** As `ictSwitch`, record A's matrix then arm a held completion response or summary
   fetch. After the request starts, use the Organization switcher to B, which is view-only. Release the A response. B
   must retain only its own Person/task, no A note or names, and no completion-write controls. Revisit A and read the
   persisted result independently. If navigation closes the modal or makes a specific hold path unreachable, record the
   actual attempted action and cover the reachable delayed request plus lower-level stale-response tests; never call a
   source inspection live proof.

8. **Wide imports and delayed chunks:** Reload the matrix after `$V seed bulk-501`; the import matches names against the
   loaded roster. The seed supplies a unique tag and 501 Alpha People named `Synthetic MapChunk<TAG><000..500>`. Build a
   CSV for All-MOS and `dates.ui` using those actual names; Review reads `New · 501`. Fail the second batch with
   `network arm-fail`: Done reads `500 changes saved.` with one Not confirmed, the first 500 rows are saved and one is
   absent. Import the file again: 500 rows read Unchanged and one New. Read back all 501 rows. This covers a 500-Person
   lookup; 501 different dates for Able's one task covers a separate shape. Keep all helper seeds registered for
   `clean-seeds`.

   Separately hold the first real 500-row response of a 501-date Able import with `network arm-hold`. The footer reads
   `Saving 0 of 501 changes`, and choosing B in the Organization switcher keeps the A import with
   `Your import is still saving. You can leave when it finishes.` Release: the second chunk follows in A and B receives
   no completion batch. The import-flow commit tests cover chunk ordering and the stop after an unconfirmed chunk.

9. **Permission changes and archived Personnel:** Open a completion draft, then use the owner's Members UI to change the
   operator to Critical Tasks view. Saving the old draft must fail with error-only feedback and unchanged rows; reload
   removes write/import controls. Restore operate, open Baker's draft, narrow the operator to Alpha, and require the
   same refusal and unchanged Baker rows. Reload permits Able and excludes Baker/unassigned; an allowed Able edit
   retains its ID. Restore the exact original membership scope/capabilities. Archive Able through the owner's Personnel
   UI, then open its ID-based Critical Tasks record: all retained dates remain in read-only history with no log/edit
   controls. Valid create/edit/delete requests and batch attempts cannot alter its records (batch may return 200 with a
   row error). Active matrix/reports exclude Able; with the dated fixture above, the remaining population is **1/3
   (33%)**. Restore the Person through Organization Settings → Archives and read back the same ID.

10. **Wide reads and provider pagination:** With registered `bulk-501` People, import the same 501 names for both Alpha
    and All-MOS tasks at `dates.ui` (1,002 rows). The existing seed plus those rows gives 1,003 distinct latest
    Person/task records. A completion on a nonapplicable task remains stored history; its MOS rule excludes it from the
    readiness denominator. Require the report screen, summary, downloaded report and Dashboard to load for this
    population. Compare an unfiltered owned `rows` read to the disjoint Alpha/All-MOS readback union: all 1,003
    IDs/values must remain. Reload the matrix, download its actual workbook, and require all 501 seeded All-MOS cells to
    be Current with the submitted date. Check a named last-window Person visibly; a successful import result alone does
    not prove a complete read. HTTP/provider failures must leave an error state rather than silently dropping rows. Keep
    historical trend semantics separately protected by application tests with a one-month task and January100% →
    February0% → March100% dated history.

11. **Matrix, person detail, completion dialogs and Reports screen states.** Use the `reader.js` from
    [Component family interaction contracts](component-foundation.md). Record each row PASS, FAIL, UNAVAILABLE or UNRUN
    with actor, width and theme; a FAIL stays FAIL until the same row passes on a later candidate. Run the layout rows
    with `$V seed training-pages` (26 extra Alpha People, so the matrix overflows vertically) and run `clean-seeds`
    before any row that depends on the fixture's readiness numbers. Failure rows use a synthetic undispatched 503
    (`network arm-fail`) or the synthetic 500 from `server-source fail-hard`; both prove client recovery only. Run
    `network restore PAGE` or `server-source restore` after each case. The workspace reads completions through the
    `latest_active_personnel_ict_completions` RPC, which `server-source` cannot match; arm `ict_tasks`, the workspace's
    catalog GET, for the loading and error rows.
    - ID: M1
      - Screen and control: Matrix page height and scrolling
      - How to reach it: `ictOperator` on the matrix with `seed training-pages`, at 1280x800 light and 390x844 dark.
        Read the page container and the app content frame rects, `document.scrollingElement` and the matrix panel
      - Expected: The page fills the content area below the header exactly: its bottom equals the frame's bottom within
        1px and the document does not scroll. The matrix scrolls inside its panel; after scrolling it down and right,
        the task-code header row stays at the panel top and the Personnel column stays at the left

    - ID: M2
      - Screen and control: Landmarks
      - How to reach it: Same page; count `main` and `[role=main]`
      - Expected: One `main` landmark. A `main` nested inside the shell's `main` is a FAIL

    - ID: M3
      - Screen and control: Workspace loading
      - How to reach it: On Home, `server-source arm ict_tasks hold 1 120000`, then choose `ICTLs`
      - Expected: A labelled loading region (`role="status"`, `aria-live="polite"`, no `aria-busy` on the live region)
        shows until release. Release with `server-source restore`

    - ID: M4
      - Screen and control: Workspace error (`critical-tasks/(workspace)/+layout`; Reports through
        `critical-tasks/+error`)
      - How to reach it: On Home, `server-source arm ict_tasks fail-hard 1`, then choose `ICTLs`. Repeat with a full
        load of `/critical-tasks/reports`, `/critical-tasks/library` and Able's record
      - Expected: `WorkspaceLoadError`: `role="alert"` `Unable to load Critical Tasks` with `Retry Critical Tasks`; the
        header and sidebar stay usable; Retry recovers after `restore`. A skeleton or blank page that stays with no
        alert or Retry is a FAIL. Save the console

    - ID: M5
      - Screen and control: Empty, view, denied and foreign
      - How to reach it: `ictEmpty`, `ictViewer`, `rosterManager`; `ictForeign` opens A's matrix address
      - Expected: Empty: an `Empty` state and `Record Completion` disabled with
        `Add personnel and active tasks before recording a completion.`; `Import Completions` carries
        `Add personnel and active tasks before importing completions.` on the row and in More. Viewer: results with no
        Record Completion, Import Completions, Task Library or cell write affordance, on the row or in More.
        Training-only: `Access Restricted`. Foreign: 404 `Page not found` with no A data

    - ID: M6
      - Screen and control: Matrix export failure
      - How to reach it: `network arm-fail PAGE critical-tasks/matrix/export`, then `Export Excel` (on the row, or in
        More when folded)
      - Expected: An `Alert` (`role="alert"`) states the failure and the matrix stays usable; the retry downloads. A raw
        `<p>` with no role is a FAIL

    - ID: M7
      - Screen and control: Record Completion dialog focus
      - How to reach it: Toolbar `Record Completion` (pinned on the row at every width, including 390)
      - Expected: Focus moves into the dialog (the `Person` control). Escape and Cancel close a pristine dialog and
        return focus to `Record Completion`. The dialog is named by its title

    - ID: M8
      - Screen and control: Held Record Completion title
      - How to reach it: Toolbar `Record Completion`, choose Unassigned and All-MOS, `dates.ui`, Demonstration.
        `network arm-hold PAGE personnel-ict-completions`, Save, read the dialog, then `network release PAGE`
      - Expected: While the create is held the dialog stays busy, Save is disabled and the title stays
        `Log ICT Completion`, the action being performed. After release the dialog closes once, one row exists and focus
        returns to `Record Completion`. `Edit ICT Completion` during the held create is a FAIL

    - ID: M9
      - Screen and control: Completion failed save
      - How to reach it: Matrix cell for Baker/All-MOS (search `Baker` first; the matrix renders only the rows near its
        scroll position, so after `seed training-pages` Baker's Bravo row is not rendered until scrolled into view):
        date, method, validator and note. `network arm-fail PAGE personnel-ict-completions`, Save
      - Expected: The dialog stays open with every value; an `Alert` (`role="alert"`) inside the dialog states the
        failure; focus stays on `Save`; zero marker rows. A toast alone is a FAIL. Restore, retry once and read the
        single row back

    - ID: M10
      - Screen and control: Completion import page
      - How to reach it: `Import Completions` (on the row, or in `More Critical Tasks controls` when folded), then the
        step 4 workbook through Review; Tab from `Find a completion`. Separately, a full load of `critical-tasks/import`
        under `server-source arm ict_tasks hold 1 120000`, then under `server-source arm ict_tasks fail-hard 1`
      - Expected: The link opens `critical-tasks/import` with `Import completions` and the File, Columns, Review and
        Done steps; at 390 the More item navigates there. Tab moves through the rail in order (the person radio group,
        its Skip, the task radio group, its Skip), then each row's fix cells and Skip button; each fix cell is
        `aria-invalid="true"` with an `aria-describedby` resolving to its message, and the app's 3px ring shows on
        `:focus-visible`. Under the hold the title and steps stay and the `Loading import` skeleton shows until
        `server-source restore`. Under fail-hard the page shows `Unable to load Critical Tasks` with
        `Retry Critical Tasks`, which reaches File after restore

    - ID: M11
      - Screen and control: Person detail tables
      - How to reach it: Open Able from the matrix at both widths
      - Expected: `Applicable Critical Tasks` and `ICT completion history` are named tables with `th scope="col"`
        headers and a row header per task. For an active Person the history table lists only completions on archived
        tasks, so with the fixture it is empty and reads `No archived task completions recorded.`; read its row headers
        after the library recipe archives `VERIFY-ICT-ALPHA`, which moves Able's seeded completion there. Each action is
        named `Log completion for CODE` or `Edit completion for CODE`. At 390 the wide tables scroll inside their own
        region and the document does not overflow horizontally

    - ID: M12
      - Screen and control: Reports KPI strip and tables
      - How to reach it: `ictOperator` on `critical-tasks/reports` at both widths
      - Expected: `Critical task report metrics` exposes each metric's name and value. The at-risk and below-threshold
        tables and the readiness matrix expose column headers; no document horizontal overflow

    - ID: M13
      - Screen and control: Chart data fallbacks
      - How to reach it: Same page; take an accessibility snapshot and read the three `.sr-only` tables
      - Expected: Each chart has one accessible data table: `6-month expiration cliff data` (Month, Total expiring and
        one column per MOS, six month rows), `Individual readiness distribution data` (one row per readiness band) and
        `12-month readiness trend data` (twelve rows). Values equal the chart's. The `Projected unit readiness` text is
        readable

    - ID: M14
      - Screen and control: `Histogram MOS` select
      - How to reach it: Same page at 1280x800 light, then 390x844 dark. Read the select's rect against its
        `Distribution - Individual Readiness by MOS` section
      - Expected: The select's label resolves and its rect lies inside its section on both sides at both widths.
        ArrowDown on the focused select changes the series and the fallback table follows. Extending past the card at
        1280 light is a FAIL

    - ID: M15
      - Screen and control: Reports loading, error and empty
      - How to reach it: `network arm-hold PAGE critical-tasks/reports/summary` then change `Filter by group`;
        `arm-fail` the same; `ictEmpty` on Reports
      - Expected: Hold: a labelled loading state. Fail: `Unable to update critical task reports` as an `Alert` with the
        prior data kept. Empty: a settled empty state. Record whether filters live in the address after reload

    - ID: M16
      - Screen and control: Toolbar fold sweep
      - How to reach it: `ictConfigurator` on the matrix.
        `$V toolbar-sweep PAGE "Critical Tasks controls" RUN_DIR --expect export-excel,import-completions,task-library,reports,gaps,group,matrix-view --pinned record-completion --search --step 2 --record sweep-light`,
        then the visible `Toggle theme` and the same with `sweep-dark` (about 28 minutes each; in evidence)
      - Expected: `toolbar-sweep.json` verdict passes: the toolbar is one row without horizontal overflow at every width
        from 1440 to 390; exactly one id folds per step in the `--expect` order and returns in the exact reverse order
        going up (across 768px the sidebar docks and the row's width jumps, so several ids may return going down and
        leave going up at that one step); `More Critical Tasks controls` exists only while something is folded; search
        stays a field until every listed id has folded and is then an icon; equal content widths give equal state down
        and up; no id leaves and returns between reads. `record-completion` and search are pinned. Save `foldedAt` and
        `restoredAt` per id with the recording

    - ID: M17
      - Screen and control: More contents and keyboard
      - How to reach it: At a width where every listed id is folded (about 390), focus `More Critical Tasks controls`
        and press Enter. ArrowRight on `Group, All groups`, then ArrowLeft; reopen it and press Escape. Choose each item
      - Expected: The menu has the headings `View`, `Filters` and `Actions` and no toolbar-name heading. View: a radio
        group `Critical Tasks matrix view mode` (A-Z, Group) whose choice changes the matrix. Filters: submenu
        `Group, All groups` (radio options; choosing Alpha leaves only Able and the submenu reads `Group, Alpha`) and
        checkbox `Gaps only`; an active filter (`Group, Alpha`, checked `Gaps only`) shows an `aria-hidden` accent dot
        at the right. Actions, in row order: `Export Excel`, `Import Completions`, `Task Library`, `Reports`; the
        icon-less `Task Library` and `Reports` start their text at the same left offset as the icon-bearing two.
        ArrowRight opens the submenu and focuses `All groups`. ArrowLeft closes only the submenu (one menu left) and
        focuses `Group, All groups`. Escape inside the submenu closes both menus in one press and returns focus to
        `More Critical Tasks controls`; Escape in the top menu does the same. Reports, Task Library and Import
        Completions navigate, Export Excel downloads the filtered workbook. A view-only actor sees no Import
        Completions, Task Library or Record Completion in the menu

    - ID: M18
      - Screen and control: Hidden filter dot
      - How to reach it: At 390, set Group to Alpha, turn on Gaps only, then restore both. Read the More button, its
        description and the same page at 1280
      - Expected: While a folded filter is non-default the More button carries a dot (`aria-hidden`) and its accessible
        description is `Hidden filters active: Group, Gaps only` (only the folded non-default filters, in row order; a
        view never counts). At defaults there is no dot and no description. A filter that is on the row sets no dot on
        More

    - ID: M19
      - Screen and control: Phone search
      - How to reach it: At 390 (search collapsed to an icon), type nothing then a query before narrowing; read the
        search icon, open it, press Escape, repeat with `Close search`
      - Expected: The icon is named `Search by name, rank, or MOS`. With a query it carries the dot and the description
        `Search text: QUERY`. Opening it expands the field across the row, followed by a ghost `Close search` button
        outside the field's own box, and hides every other control, including `Record Completion`. The field keeps
        Chrome's native clear control, so clear and close are two controls in two places, and the row's `scrollWidth`
        equals its `clientWidth`. Escape and `Close search` restore the row, return focus to the search icon and keep
        the query and the filtered matrix; Escape does not clear the field

    - ID: M20
      - Screen and control: Focus on fold
      - How to reach it: At a width where `Reports` is on the row, focus it, then narrow until it folds
      - Expected: Focus is on `More Critical Tasks controls`, not `body`. Widening until the control returns after focus
        was on More puts focus on a returned control

    - ID: M21
      - Screen and control: Soldier record toolbar
      - How to reach it: `ictConfigurator`, open Able from the matrix.
        `$V toolbar-sweep PAGE "Personnel critical task controls" RUN_DIR --expect print-record,category,status --pinned input-task --search --step 4 --record sweep-light`,
        then the visible `Toggle theme` and `sweep-dark`. At 390, open `More Personnel critical task controls`; as
        `ictViewer`, read the row and More
      - Expected: `toolbar-sweep.json` passes: one row, no horizontal overflow, `Print Record` folds first, then
        `Category`, then `Status`, and they return in reverse; `Filter by task ID or name` becomes an icon only after
        all three have folded; `Input Task` stays on the row. More lists `Status, All Statuses` and
        `Category, All Categories` under Filters (radio options change the table) and `Print Record` under Actions,
        which prints after the menu closes. A non-default folded filter puts the dot on More. The viewer has no
        `Input Task` on the row or in More; `Print Record` remains

    - ID: M22
      - Screen and control: Reports toolbar
      - How to reach it: `ictOperator` on `critical-tasks/reports`.
        `$V toolbar-sweep PAGE "Critical task report controls" RUN_DIR --expect role,mos,rank,group --pinned export-excel --step 4 --record sweep-light`,
        then dark. At 390, choose Alpha in `Filter by group` on the row, then open `More Critical task report controls`
        and choose `Clear filters`
      - Expected: `toolbar-sweep.json` passes with `Filter by duty role` folding first, then MOS and rank, and
        `Export Excel` pinned; `Filter by group` stays on the row at 390. At 390 the folded filters are submenus in More
        (`Rank, All Ranks`, `MOS`, `Duty role, All Duty Roles`); choosing Alpha refreshes the report and adds a
        `Clear filters` item. `Clear filters` resets all four and the report. The toolbar has no search and no wrap

    - ID: M23
      - Screen and control: Task library toolbar
      - How to reach it: `ictConfigurator` on `critical-tasks/library`.
        `$V toolbar-sweep PAGE "ICT task library controls" RUN_DIR --expect import,mos,status --pinned new-task --search --step 4 --record sweep-light`,
        then dark. At 390, choose `Archived` from the View radio group, then `Import`
      - Expected: `toolbar-sweep.json` passes with `Import` folding first, then `MOS`, then the `Active`/`Archived`
        switch, and `New Task` pinned. In More the status switch is the radio group `Filter ICT tasks by status`;
        choosing `Archived` lists archived tasks and adds `Clear filters`. `Import` navigates to
        `critical-tasks/library/import`. `New Task` is disabled with its loading reason while the library loads

Use the documented narrow `network arm-fail|arm-hold PAGE FAMILY`, `state`, `release`, `restore`,
`feedback arm|state|restore` and `export arm|save|restore` controls. Critical Tasks families are
`personnel-ict-completions`, `personnel-ict-completions/batch`, `critical-tasks/reports/summary`,
`critical-tasks/reports/export` and `critical-tasks/matrix/export`. Never invoke app handlers or alter application
stores.

Restore original fixture fields/task archive state and armed hooks. There is no visible completion-delete action;
discard UI-created completions only through this owned worker's cleanup/restart.

## Gotchas

- An impossible completion date such as `02/30/2026` is flagged during import review. A malformed import row is refused
  with `400` and saves nothing. See [Invalid input](invalid-input.md).
- Critical Tasks operate is independent of Personnel and Training; configure is required for library/default writes, not
  completion recording. Group scope remains authoritative on the server and provider.
- The latest completion is selected by completion date, then creation time. Older history must not overwrite a newer
  readiness result; same-date import upsert differs from creating a new dated record.
- Critical Tasks expiration uses a per-task override or Organization default. Expiring-soon counts as ready, the same
  rule Training uses for its warning states.
- The denominator is applicable Person/task assignments, not task count or Personnel count; zero-applicable report
  readiness is 0%, while a MOS/category matrix can use an empty value.
- History includes archived definitions; active matrix/report denominators exclude them. Archived Personnel history is
  read-only.
- `actor` establishes sign-in and a starting route, not completion of a streamed workspace or a permission verdict. Its
  `access` output is `not-assessed` unless it captured the explicit settings-page denial; inspect the actual UI and
  request/provider evidence.
- Browser sign-in shares the normal ten-auth-POSTs-per-fifteen-minutes limiter; combine journeys per actor and respect a
  natural cooldown. Never disable the limiter for proof.
- A successful UI write or report does not prove denial, RLS, atomic batch behavior, stale-response safety or another
  feature's math. Keep direct API/provider and existing component/application/SQL checks separately identified.

## Viewer day

Launch with `--browser-timezone` chosen per the [skill](../SKILL.md#launch) and record the browser and UTC days. Choose
or record a completion whose task expires on the browser day. After a reload, the Critical Tasks matrix, Critical Tasks
report and the Critical tasks table on Able's Personnel Readiness tab must classify it the same way. The Dashboard's
Critical tasks column must agree, with the same ready percent and lapse count as the report. The report export must
download `critical-task-report-<browser day>.xlsx` and the matrix export `critical-task-matrix-<browser day>.xlsx`.
