# Track evaluations and evaluator relationships

Members use Evals to track rated individuals, evaluators, rating periods, report types and workflow progress. Rating
Scheme access is independently grantable without Personnel access.

## Sub-features

- Two route tabs under the Evals header, **Rating Scheme** (`/evals/rating-scheme`) and **Eval Tracker** (`/evals`, where
  the sidebar's Evals lands), each a link; the Eval Tracker tab carries a red `N past thru` count of open Evaluations
  past thru.
- A Rating Scheme tab that lists one line per rating scheme, grouped by Senior rater then rater (or as a table), with
  a read-only badge for a line's open Evaluation, a right-side sheet to add or edit a line's chain, eval type, notes and
  archive state, and a Change rater dialog. It never moves an Evaluation's workflow step.
- An Eval Tracker tab that lists every Evaluation in work by urgency (past thru first, then the nearest thru), with
  four header counts, Status (Open, Completed, Open and completed), Report and Step filters, a search over the rated
  Soldier and every signer, Export and `Start evaluation`. Each row shows the due text, the rated Soldier and rater,
  the eval tag and report, the period, a five-segment workflow meter with its step and who it is waiting on. Below
  it, **Ready to start** lists schemes with nothing in work, and a Completed bar counts completed Evaluations with a
  `Show completed` link. At 390 the rows are cards.
- An Evaluation sheet, opened from a row, a card, `?entry=<id>` or the Dashboard: workflow moves (Back, Move and a
  step list whose `Jump to <step>` buttons cover only the steps the chain makes possible), report type, period and
  notes, the read-only rating chain with `Change rater`, the Person's other Evaluations, and Delete. A completed one
  shows the chain that signed it and when, and locks report and period until Reopen.
- A Start evaluation sheet, opened from the toolbar, a Ready to start row or `?start=<scheme id>`: it picks a
  scheme ready to start, fills the next Annual period, shows the chain it copies, and opens at Drafting or records an
  Evaluation already completed.
- One stored lifecycle per evaluation: `workflow_status` null is Not tracked and open, and only `completed` is
  complete. Change rater closes an open Evaluation as a Change of Rater (`CR`) report and opens the next one.
- Rating scheme membership, separate from the workflow step. Each rated Person has at most one listed rating scheme,
  which holds their chain; every Evaluation is on one. Archiving a line on the Rating Scheme tab keeps its open
  Evaluation on the tracker until it completes.
- Overdue, 30-day, 60-day and current due calculations, completed exclusion and the Organization Dashboard due
  projection.
- Actual filtered Eval Tracker workbook, including evaluator names, dates, due/status/workflow labels and notes.
- Dedicated view/operate/configure access, Alpha/empty-Group/unassigned and foreign Organization isolation; permission
  narrowing when switching Organizations.
- Direct deletion for admins/owners, approval submission for ordinary operators and Rating-owned approved effects;
  failed saves/deletions/requests must report failure and support recovery without losing the current draft.
- Screen states: the tracker table and cards, the two sheets, a rejected workspace source, loading, empty, denied,
  foreign, narrow and dark states (step 7).

## How to get to it (user POV)

Sign in, choose the Organization and open **Evals** from its navigation, which opens the **Eval Tracker** tab; the
**Rating Scheme** tab sits beside it. On the tracker, search and filter, select a row to open its Evaluation, or press
**Start evaluation**. **Export** downloads the rows shown. Chains are edited on the Rating Scheme tab. Return to the
Organization Dashboard through its visible navigation to inspect upcoming evaluations. A member with Personnel access
alone cannot enter Evals.

## Helper controls

Rating Scheme actors are `ratingConfigure`, `ratingOperate`, `ratingView`, `ratingScoped`, `ratingEmpty`,
`ratingForeign` and `ratingSwitch`, with every other feature lane absent. Scoped operates only Alpha, Empty has no
Groups, and Switch operates A but only views B. `actor ROLE evals|home` enters Evals or the Organization Dashboard
through a provider-created authenticated session; `actor --form ROLE evals|home` uses the visible sign-in form.
`seed rating-scheme` creates four temporary Alpha People (Officer, Warrant, NCO and archived), one listed rating scheme
for each rated Person who has none, and ten dated Evaluations across A/B. The NCO and the Officer each have two
Evaluations on one scheme, and each completed one keeps the chain that signed it. It returns exact IDs, the schemes and
examples, records every ID before insertion, and uses `clean-seeds`. `rows evaluations orgA|orgB id ID` reads an
Evaluation's workflow, dates, notes and signed chain; `rows rating_schemes orgA|orgB id SCHEME_ID` reads its chain,
notes and `archived_at`. Both also filter by `rated_person_id`, and `evaluations` by `rating_scheme_id`. `network`
accepts the exact A `rating-scheme` endpoint, which carries scheme saves and editor reads, the `evaluations` endpoint,
which carries Evaluation saves and deletes, and the record-named POST families `evaluations/<id>/workflow`,
`evaluations/<id>/change-rater`, `rating-scheme/<scheme id>/evaluations` and `rating-scheme/<scheme id>/archive`; each
matches that record's exact path only. A stale second tab still supplies a real refused move.
Use the existing `deletion-requests` control separately for approval submission. Inspect real
downloads with `workbook FILE 'Rating Scheme'`. The [Evals recipe](evals-rating-scheme.md) owns expectations.

## Driving it with verify:app

Record the local/browser date. Set `V="node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"` for
the owned worker. Run `$V seed rating-scheme` once and save its returned exact IDs, dates and examples. The
[helper controls](#helper-controls) describe the `rating*` actors. Use `$V actor ROLE evals` or `home`; use `manager` as
the Personnel-only denied actor and `orgOwner` for direct deletion.

1. **Read, filter, due and export.** Enter with `ratingView`. Verify view access without Personnel, no
   `Start evaluation` and rows that do not open, and actual loaded examples rather than actor arrival alone. The seed
   stores nine A Evaluations, one of them an archived Alpha Person's (−2 days), which the tracker never lists. The
   default Status (Open) shows six, `6 of 6 shown`, in urgency order: Able `5d past thru`, unassigned `Thru in 15d`,
   the Alpha NCO `Thru in 20d` (`With Rater`, waiting on `RTR External Rater due30`), Bravo `Thru in 25d`, the Officer
   `Thru in 45d` and the Warrant `Current`. The header reads `6 open`, `1 past thru`, `3 thru in 30 days` and
   `1 thru in 31 to 60 days`. The Completed bar reads `2 completed evaluations.`; `Show completed` switches Status to
   Open and completed and lists the NCO −90 and the Officer +10 `CR` after the open rows, each under the chain that
   signed it. A Change of Rater is a completed Evaluation with report type `CR`, not a separate status. No seeded
   scheme is ready to start, since every one has an Evaluation in work. Check the Report and Step filters (a Report
   or Step choice hides Ready to start), and the search by Soldier and by any signer. Export through the visible
   button: arm `$V export arm PAGE`, save with
   `$V export save PAGE .verification/evidence/verify-trooptotask/RUN/evals.xlsx`, inspect
   `$V workbook FILE 'Rating Scheme'`, then restore. Expect only the rows shown and the 16 retained columns with actual
   dates, names, statuses and notes. Pure tests cover exact 0/30/31/60/61-day boundaries; these live examples cover
   the displayed buckets.
2. **Start, edit and recovery.** With `ratingOperate`, make a scheme ready to start: open the Warrant (`Current`,
   Not tracked) and press `Mark completed`; `rows evaluations orgA id ID` reads `completed` with
   `chain_snapshot_at` and `snapshot_rater_name` set, and **Ready to start** lists the Warrant with
   `Last Annual completed <today>, thru <thru>` and the next period. `Start next Annual for <Soldier>` opens the Start
   sheet with that Soldier picked, `AN · Annual` from the day after the last thru to a year later, the chain read
   from the scheme, and `Open, at Drafting` chosen. `Start evaluation` sends one
   `POST api/rating-scheme/<scheme id>/evaluations`, toasts `Evaluation started at Drafting` and the new row reads
   `drafting` with that period. `Already completed` records it `completed` with today's chain instead. The toolbar's
   `Start evaluation` opens the same sheet with no Soldier; pressing Start then marks `Rated Soldier`
   `aria-invalid` with `Rated Soldier is required.`. Open an Evaluation and change notes, report or period: every
   move is disabled with `Save or cancel your edits to move the workflow.`; `Save changes` sends one
   `PUT api/evaluations` carrying only the changed fields, toasts `Evaluation saved` and closes the sheet. The
   scheme's `eval_type` and chain never change from this sheet; chain edits belong to the Rating Scheme line. Escape
   and an outside click leave a dirty sheet open; Cancel discards it. Arm `$V network arm-fail PAGE evaluations`
   before a save: the sheet stays open with every value and `The evaluation was not saved`, and the row is
   unchanged; restore and retry. A delayed save blocks a second submit and closing until it settles.
3. **Scope and security.** With `ratingScoped`, expect only Alpha entries, without the archived Person's record (six
   rows, all in the default listing);
   its lookup includes active Alpha People and excludes Bravo, unassigned, archived and foreign People. With
   `ratingEmpty`, expect zero entries and zero lookup choices. Use authenticated HTTP from these signed-in synthetic
   pages to attempt POST/PUT/DELETE against known Bravo, unassigned and foreign IDs: expect 403/404 as appropriate, no
   stored changes, and no disclosure of hidden names/notes. Enter Evals directly as the Personnel-only `manager`: expect
   a settled Access Restricted message, no Evals editor/rows and no persistent busy shell; authenticated workspace data
   remains restricted and Rating mutations return 403. The endpoint's `GET ?evaluation=<id>` reads one Evaluation and its
   rating scheme for its editor under Rating view and the actor's scope: a missing or malformed `evaluation` returns 400 and an unknown or hidden ID 404.
   Probe it with known Bravo, unassigned and foreign IDs as `ratingScoped` and `ratingEmpty` (expect 404), and with any
   ID as `manager` (expect 403); no response may carry hidden names or notes. After an allowed workspace loses access,
   stale evaluation rows must clear, and late allowed hydration must not refill the restricted workspace. Restored
   access may load a fresh authorized workspace. View-only and Personnel-only writes must fail, even if a control is
   hidden. Organization-wide operators retain unassigned access. Separately probe all four evaluator slots using only
   seeded IDs: new/changed foreign, missing or malformed IDs receive a generic 400 with no mutation; same-Organization
   archived, cross-Group and unassigned evaluators remain valid even for an Alpha operator. UUID case and repeated IDs
   represent the same Person. Null/empty clearing and external names remain supported. An unrelated edit that resubmits
   unchanged historical foreign links preserves those links. Direct provider writes must enforce the same integrity, and
   a foreign historical link must block and roll back Person deletion rather than alter another Organization. A mixed
   legacy row can also block local Person deletion when several SET NULL effects recheck untouched foreign slots; expect
   full rollback, not an automatic history rewrite. `rating_scheme_lane_scope.sql` supplies distinct positive/negative
   RLS coverage on a disposable provider.
4. **Deletion and approval recovery.** Start a dedicated Evaluation (flow 2) with the ordinary operator, open it and
   confirm `Delete evaluation` submits a request, returns approval-required behavior and leaves the Evaluation
   stored. Observe the request row and visible feedback; repeat for the existing-pending case. Fail the `evaluations`
   DELETE and then the `deletion-requests` submission independently using the matching network helper. Failure must
   not claim success, remove the stored Evaluation or close the open confirmation; restore and retry. Hold the DELETE
   and approval POST separately: pending confirmation blocks repeated submission, Cancel/Escape and sheet
   close/save/delete until settlement. The helper holds the real response after provider processing, so pending UI
   does not imply an unchanged database. A pending Save also disables `Delete evaluation`. With `orgOwner`, directly
   delete only the UI-created Evaluation (`Evaluation deleted`) and read its absence after reload. For the consumed
   Rating effect, start a separate expendable Evaluation and submit deletion with the operator. Observe DELETE202 and
   the actual successful submission status, an unchanged evaluation and a matching pending request. Enter owner
   **Settings → Approvals**, locate the article by resource description/request ID and Approve. Observe review
   POST200, evaluation absence, matching request approved with reviewer/time, and unchanged seeded A/B sentinels.
   Reload Approvals/Evals and read persistence; do not substitute direct owner deletion.
5. **Dashboard and switching.** With `ratingOperate` and then `ratingScoped`, compare the Dashboard due projection
   against their accessible open Evals entries, meaning neither completed nor archived: Organization-wide has one overdue and three within 30 days;
   Alpha has one overdue and one within 30 days. The archived Alpha entry (−2 days) is in neither count. The Dashboard's
   Evaluations column draws `past thru`, `thru in 30 days`, `thru in 31 to 60 days` and `current` as shares (org-wide
   `1 past thru, 3 thru in 30 days, 1 thru in 31 to 60 days, 1 current`; Alpha
   `1 past thru, 1 thru in 30 days, 1 thru in 31 to 60 days, 1 current`), and its note names the 30 and 31 to 60 day
   counts separately (`3 more thru in 30 days and 1 in 31 to 60. 1 current.`). Needs you lists only past-thru entries,
   each as a Past thru row that names the rated Person,
   including for an actor without Personnel access (`ratingOperate`). Evals also displays the 60-day bucket. Completed
   and archived entries are excluded; archiving the past-thru entry from its sheet empties Needs you and the `past thru`
   share after a reload, and Restore brings it back. A Past thru row's `Update status` opens the Evaluation sheet for that one Evaluation. Its
   Workflow moves post `api/evaluations/<id>/workflow`; a step keeps the panel open, and `Mark completed` saves
   through the row, which leaves the queue. The entry must read Completed here after reload
   ([Dashboard actions](dashboard.md#actions)). The projection must not borrow Personnel capability or expose
   Bravo/unassigned to Alpha. Its Dashboard entry payload carries the entry ID, rated Person ID, evaluation type, rating
   period end and workflow step, bucketed by the viewer's day, plus `ratedPersonName` (rank and name) from the same
   scoped Rating roster-reference read as Evals, and its chevron opens the entry. Evaluator names and notes stay absent.
   A viewer without `ratingScheme.readRosterReferences` receives no names. Empty-Group and absent Rating access receive
   no due entries. Inspect the authorized payload separately from the visible counts. With `ratingSwitch`, enter A,
   inspect entries and write affordances, switch visibly to B, and confirm only the one foreign example plus view-only
   affordances remain. Reload B, revisit A, and preserve each scope. Create a separate UI witness for delayed mutation
   checks; keep every original A/B sentinel untouched. Establish native A → B → A history before editing the witness.
   Hold its real A response after provider processing, capture the committed provider row and busy controls, then enter
   B through visible Organization navigation or the documented native `navigate_page` with `type:"back"`. Prove the
   canonical B URL, admitted B breadcrumb, one Foreign example and view-only affordances before release. The hold must
   still be active at that point. Release and immediately capture a screenshot, then the native snapshot and feedback
   state before a transient message can expire. Old responses must not populate B, change its record IDs, emit A
   success/error feedback there, close a replacement editor or begin a new approval request after departure. A real A
   provider commit remains real even if its UI continuation is retired. Check B again after reload. Separately hold
   DELETE202 across departure and require no subsequent approval POST. Hold an already-started approval POST across
   departure to cover its own feedback; record the actual successful status rather than assuming 201. If additional
   journaled deletion sources are seeded after the original one-Foreign proof, record their exact rows and use the
   actual resulting B count for later admissions. If the modal keeps navigation in A, releasing in A and visiting B
   later supplies no after-B-delivery credit. A script evaluation that calls history.back() is not native browser
   navigation.

6. **Personnel readiness and Organization exports.** As `orgOwner`, enter Personnel and open Able or the temporary
   Officer/NCO details. The Overview's **Rating chain · <eval type>** card names the active entry's Rater, Intermediate
   rater (only when set), Senior rater and Reviewer, with `Not set` for an empty role; saved internal IDs and nonblank
   external names both resolve. A drafting or due evaluation also appears in **Needs attention**, and its row opens
   Evals with that entry's editor (`/evals?entry=<id>`, which opens its Evaluation sheet; Back closes it, and closing it drops the parameter). Current positive seed
   entries alone do not prove missing-rater branches or which otherwise-identical entry is newest; separate owner rule
   tests cover those. The Personnel-only `manager` gets no Rating chain card and a `Couldn't check the evaluation` line
   under Needs attention. As owner, enter **Settings → Exports**, capture **Export JSON** and **Export Excel**
   separately with the existing export hook, then restore each. Before other witnesses are created, A has seven rating
   schemes and nine Evaluations, including the two completed ones (one a `CR` report), Bravo, unassigned and archived; B's foreign example
   is absent. Compare raw rows by ID, all 17 saved scheme fields and 21 saved Evaluation fields including timestamps,
   snapshots and null/external references, `sections.ratingSchemes` and `sections.evaluations`, their top-level
   duplicates and inventory counts. Inspect **Export Inventory**, **Rating Scheme**, **Evaluations**, **Raw - Rating
   Schemes** and **Raw - Evaluations** sheets. The readable Rating Scheme sheet has 8 columns, one row per scheme,
   including `archived_at`; the readable Evaluations sheet has 10, including saved report/workflow codes and the signed
   rater, senior rater and `chain_signed_at` of a completed Evaluation; Evals has 16 presentation columns, including `Rating Scheme` (Listed or Archived). Organization export keeps the archived Person's stored entry among the nine
   rows, with its full authorized Personnel label, even though Evals and the Dashboard due projection omit it. Restoring
   that Person through Settings → **Archives** returns the unchanged entry to Evals and its due counts: overdue rises
   from one to two Organization-wide and in Alpha.

7. **Evals screen states.** Use the [component foundation](component-foundation.md) recipe's `reader.js`. Run
   `$V seed rating-scheme` first. Record each row PASS, FAIL, UNAVAILABLE or UNRUN with actor, width and theme; a FAIL
   stays FAIL until the same row passes on a later candidate.
   - ID: E1 - Screen and control: Tracker header, table and search - How to reach it: `ratingOperate`, 1440, 1024
     and 390 - Expected: The eyebrow reads `Eval tracker · <Organization>` above the display `Evals` heading, with the
     live status `6 of 6 shown` and the counts `6 open`, `1 past thru`, `3 thru in 30 days` and
     `1 thru in 31 to 60 days` (the last hidden at 390). At 1440 the table's columns read Due, Rated Soldier (with
     `Rater <name>` under it), Report (a bordered eval tag and the report label), Period (`13 Nov 25 → 03 Dec 26`),
     Workflow (meter and step, or `Not tracked`) and Waiting on (a mono role code and the name, `—` when nobody), each
     row 60 px with a 3 px due rail. Below 1280 Period folds under Report and Waiting on under Workflow, and the table
     fits a 1024 window with no sideways scroll (its `Evaluations, scrollable` region reads equal client and scroll
     widths). Each row is focusable with the name `Open evaluation for <Soldier>`; Enter or Space opens the sheet and
     focus returns to that row after it closes. At 390 each Evaluation is a card button with the same name: the
     Soldier and due text, the eval tag with report code and period, the meter and step, then who it waits on. An
     Evaluation at `Submitted to HRC` reads a muted `Submitted` instead of a due text. Typing `zzzz` into
     `Search by Soldier or signer` shows `No evaluations match` and `0 of 6 shown`; `Clear search and filters`
     restores the list. No document overflow at any width

   - ID: E2 - Screen and control: Evaluation sheet - How to reach it: Open the Alpha NCO (`With Rater`) at 1440 and
     390 - Expected: A sheet slides in from the right (full screen at 390) with the eyebrow
     `Evaluation · Annual NCOER`, the rated Soldier as the display title and `Thru in 20 days · 13 Nov 25 → 03 Dec 26`.
     Workflow reads `With Rater · step 2 of 5 · waiting on External Rater due30` over a five-segment meter, with
     `Back to Drafting` and `Move to Rater Signed`, then the step list with `NOW` on the current step and a
     `Jump to <step>` button on every other step the chain allows. Report and period hold the Report select
     (`AN · Annual`), Start and Thru, and `NCOER, from the scheme line. Change the type on the Rating Scheme.`. Rating
     chain is read-only with `Edit on Rating Scheme ›` (`/evals/rating-scheme?line=<scheme id>`) and `Change rater`.
     `<Rank Last>'s evaluations` lists the Person's other Evaluations and opens one in place; Notes; then
     `Delete evaluation`. The footer reads `Workflow moves save on click.` with Cancel and `Save changes`

   - ID: E3 - Screen and control: Workflow moves - How to reach it: The same sheet; a second `ratingOperate` page
     opens the same Evaluation for the stale cases - Expected: Not tracked offers `Start tracking` and
     `Mark completed`; Drafting offers `Stop tracking`, `Send to Command Review` and `Move to With Rater`; Completed
     offers `Back to Submitted to HRC` and `Reopen`, which returns to Not tracked on the scheme's current chain. The
     step list omits `With Intermediate Rater`, `IR Signed`, `With Reviewer` and `Reviewer Signed` when the chain
     lacks that evaluator; the Warrant, whose chain has both, lists all fourteen. Each press sends one
     `POST api/evaluations/<id>/workflow`, the sheet shows the new step at once and `rows` reads the new
     `workflow_status` (`Move to Rater Signed` then `Jump to SR Signed` read `rater-signed` then `sr-signed`). While an
     edit is unsaved every move is disabled. Move the Evaluation forward in the second page, then step back in the
     first: the POST returns 409, the sheet shows `The workflow did not move` with
     `This evaluation has changed since you opened it. Refresh it and try again.`, and the row keeps the second
     page's step. With `$V network arm-fail PAGE evaluations/<id>/workflow` armed, a move returns 503, the sheet shows
     `The workflow did not move` and the step stays; after `network restore` the same press moves it

   - ID: E4 - Screen and control: Change rater - How to reach it: An open Evaluation's `Change rater` - Expected: The
     dialog asks for `New rater` and `Last day with <current rater>` and states the rated days, with
     `A Change of Rater report needs at least 90.` when fewer, which does not block. One
     `POST api/evaluations/<id>/change-rater` closes the dialog and the sheet with
     `Rater changed. A new Annual opened at Drafting.`: the Evaluation reads `CR`, `completed`, ends on the chosen day
     and keeps the old rater in `snapshot_rater_*`; the scheme reads the new rater, and a new `AN` Evaluation starts
     the next day at Drafting. With `$V network arm-fail PAGE evaluations/<id>/change-rater` armed, confirming keeps
     the dialog open with `The rater was not changed` and no new row. Two buttons carry the name `Change rater`, so
     click the dialog's by UID

   - ID: E5 - Screen and control: Completed sheet - How to reach it: `Show completed`, then the completed NCO row (two
     rows share its name, so click by UID) - Expected: The eyebrow ends `· Completed` and the due line reads
     `Completed <signed day>` in the completed tone. Workflow offers `Back to Submitted to HRC` and `Reopen` and the
     full step list. Report, Start and Thru are disabled with
     `Locked while completed. Reopen to change the report or period.`. `Signed by · kept <day>` lists the chain that
     signed it (`External Rater completed`) with `Current chain on Rating Scheme ›`, and a note names the scheme's
     current rater when it differs. Notes stay editable and save without validating the signed chain. The footer
     shows only Close until something changes

   - ID: E6 - Screen and control: Start evaluation sheet - How to reach it: Flow 2's Ready to start row, then the
     toolbar's `Start evaluation` - Expected: The eyebrow reads `Start evaluation · From the rating scheme` above the
     Soldier's name and `Last Annual completed <day> · thru <day>`. `Rated Soldier` lists only schemes ready to start,
     with the eval tag beside it. Report and period are prefilled (`Starts the day after the last thru.`), the chain
     section reads `Rating chain · copied from the scheme` with `Edit on Rating Scheme ›`, `Opens as` offers
     `Open, at Drafting` and `Already completed`, then Notes, Cancel and `Start evaluation`. Opened from the toolbar it
     has no Soldier picked

   - ID: E7 - Screen and control: Workspace loading - How to reach it: On Home,
     `server-source arm evaluations hold 1 120000`, then choose Evals - Expected: A labelled loading region
     (`role="status"`, named `Loading evaluations`) whose blocks match the tracker: three header lines, the tab row, a
     toolbar block, then a table header and five rows at 640 px and up or three card blocks at 390, so nothing
     shifts when rows arrive. Release with `server-source restore`

   - ID: E8 - Screen and control: Workspace error (`evals/+layout`, `+page`) - How to reach it: On Home,
     `server-source arm evaluations fail-hard 1`, then choose Evals; repeat with a full load of `/evals` - Expected:
     `WorkspaceLoadError`: `role="alert"` `Unable to load Evals` (or the evaluations subject) with a Retry button; the
     header and sidebar stay usable; Retry recovers after `restore`. A skeleton or blank page with no alert or Retry is
     a FAIL. Save the console

   - ID: E9 - Screen and control: Empty, view, denied and foreign - How to reach it: `ratingEmpty`, `ratingView`,
     Personnel-only `manager`; `ratingForeign` opens A's Evals address - Expected: Empty: `No evaluations in work` with
     `Open the Rating Scheme`. View: the rows with no `Start evaluation`, rows that do not open, and `?entry=<id>`
     opens nothing. Personnel-only: `Access Restricted`. Foreign: 404 `Page not found` with no A data

   - ID: E10 - Screen and control: Narrow, dark and toolbar fold - How to reach it: 390x844 dark: the tracker, both
     sheets and Filters; then
     `$V toolbar-sweep PAGE "Eval Tracker controls" RUN_DIR --expect export,step,report,status --pinned start-evaluation --search --step 4 --record sweep-light`
     and dark - Expected: No horizontal document overflow. At 390 the toolbar is `Search Soldier or signer...` across
     the full width, then `Filters` and an icon-only `Start evaluation` (accessible name still `Start evaluation`).
     Both sheets fill the screen with a reachable footer. `Filters` holds Status, Report, Step and Export; a
     non-default folded filter puts the dot on `Filters`. The sweep passes with zero failures, folding Export first,
     each control restoring within 4 px; record the measured fold widths. The viewer has no `Start evaluation`

   - ID: E11 - Screen and control: Address-opened sheets - How to reach it: A full load of `/evals?entry=<open id>`;
     Escape; then an in-app link to `?entry=<id>` and native `navigate_page` with `type:"back"` - Expected: The full
     load opens that Evaluation's sheet once the workspace streams in. Closing it removes `entry` from the address, so
     a reload opens nothing. After an in-app link opens it, Back returns to `/evals` with no dialog. A row-opened sheet
     adds no parameter. `?start=<scheme id>` opens the Start sheet on that scheme the same way

8. **Archive, restore and listing.** On a fresh seed with `ratingOperate`, record `$V rows evaluations orgA id ID`
   and `$V rows rating_schemes orgA rated_person_id PERSON_ID` for the overdue Able Evaluation and the NCO's two
   Evaluations. Archiving happens on the **Rating Scheme** tab's line sheet (`Archive`, one
   `POST api/rating-scheme/<scheme id>/archive`; `archived_by` is the actor's user ID and no Evaluation's
   `workflow_status` changes). Archive Able's line (its Evaluation is Not tracked): the tracker drops Able, reads
   `5 open` and `0 past thru`, and the tab's past-thru count disappears. Archive the NCO's line: its With Rater
   Evaluation stays on the tracker with its due text until it is completed, and its completed one stays in
   `Show completed` as history. The NCO's sheet offers no `Change rater` while its scheme is archived; the server refuses it too.
   Reload the Dashboard as `ratingOperate`: Needs you reads `0`. Restore Able's line: the scheme's `archived_at` and
   `archived_by` read null, Able returns to the tracker, and a Dashboard reload shows Able's Past thru row again.
   Check 1024 and 390 after each change: rows and cards keep their layout and nothing clips.
9. **Rating Scheme tab.** Run `$V seed rating-scheme`, then enter as `ratingOperate` and choose the **Rating Scheme** tab
   (`/evals/rating-scheme`). Record PASS, FAIL, UNAVAILABLE or UNRUN with actor and width for each row. The seed's
   one listed scheme per Person leaves `Add to scheme` with no Person to pick, so to add a line, archive a seeded
   Person's scheme first (sheet, `Archive`), then add that Person again; `clean-seeds` removes that Person and both of
   its schemes, and `rows rating_schemes orgA rated_person_id PERSON_ID` reads count 0 afterwards.
   - ID: R1 - Screen and control: Tabs and lines - How to reach it: `ratingOperate`, 1440, 1024 and 390 - Expected:
     The `Evals views` navigation holds `Rating Scheme` (current) and `Eval Tracker` with a red `1 past thru` count on the
     seed. The header counts read `6 on the scheme`, `1 senior rater`, `6 raters`, `1 with an eval in progress`, with the
     status `6 of 6 shown` (the total includes archived lines, so it reads `6 of 7` once one exists). Grouped has one `SR` section per
     Senior rater (`Senior rates N`, `External` tag for a typed name) and, under it, a rater block with a bordered list
     of lines; each line shows the rated Soldier, the eval type tag and the `IR` and `REV` slots (`Not set` when empty).
     A line with an open Evaluation shows a badge (five-segment meter, step label, and thru text such as `Thru in 20d`
     in its tone) that links to `/evals?entry=<evaluation id>`; following it opens that Evaluation's sheet on the
     tracker, and Back closes it. Table has Rated Soldier, Eval type, Rater, Intermediate, Senior Rater, Reviewer and Evaluation columns, opens
     by Rated Soldier and scrolls inside its own region at 1024. No document overflow at 1440, 1024 or 390; at 390 the
     toolbar is two rows with `Filters` and an icon-only `Add to scheme`, the line's slots wrap and the badge takes its
     own row

   - ID: R2 - Screen and control: Line sheet - How to reach it: Select a line, then `Add to scheme` - Expected: A sheet
     slides in from the right (full screen at 390). An existing line reads `Rating scheme line · SR <name>`, the rated
     Soldier as the title, and its read-only badge with `Open in Eval Tracker ›`; a line with no Evaluation in work
     reads `No open evaluation.` with `Start evaluation ›` (`/evals?start=<scheme id>`), a line whose Evaluation is
     Not tracked reads `Not tracked.` with `Open in Eval Tracker ›`, and an archived line reads
     `Archived. Off the rating scheme.`. A full load of `/evals/rating-scheme?line=<scheme id>` opens that line's sheet,
     as the Evaluation sheet's `Edit on Rating Scheme ›` does. A new line asks for the Rated Soldier first (only Persons with no listed scheme are offered,
     else `No one left to add.`), then Rater and Senior rater, optional `+ Intermediate rater` and `+ Reviewer`, the eval
     type (taken from rank) and notes. `Add to scheme` with every field empty marks the three required fields
     `aria-invalid` with `... is required.` and focuses `Rated Soldier`. A valid add sends one `POST api/rating-scheme`
     and nothing to `evaluations`: `rows rating_schemes` reads the new scheme with the picked eval type and
     `rows evaluations orgA rated_person_id PERSON_ID` gains no row. Saving an edit sends only the changed fields in one
     `PUT api/rating-scheme`; saving an untouched sheet sends nothing. A refused save (`network arm-fail PAGE rating-scheme`)
     keeps the sheet open with every value and a `role="alert"` reading `The line was not saved`; the row is unchanged,
     and after `network restore` the same Save persists. Escape and an outside click leave a dirty sheet open; Cancel
     discards it. `Archive` sends `POST api/rating-scheme/<scheme id>/archive`, the sheet then reads `Archived` with
     `Restore`, and `archived_by` is the actor. There is no delete for a scheme

   - ID: R3 - Screen and control: Change rater - How to reach it: Open a line that has an open Evaluation (the seeded
     NCO), `Change rater` - Expected: While an Evaluation is open the sheet shows the rater read-only with `Change rater`
     and a note that chain edits apply to the open Evaluation but the rater changes only through that button; the
     button is disabled while the sheet has unsaved edits. The `Change rater` dialog asks for `New rater` and
     `Last day with <current rater>` (today, kept inside the period), states the rated days (`N rated days.`, with
     `A Change of Rater report needs at least 90.` when fewer, which does not block), and previews `Closes` (`CR`,
     the period and the kept chain) and `Opens` (`AN`, the next day to a year later, `Drafting`). Confirming without a
     rater shows an alert. One `POST api/evaluations/<id>/change-rater` closes both dialogs; `rows evaluations` reads the
     old Evaluation `CR`/`completed` with the old rater in `snapshot_rater_*` and a new `AN` `drafting` Evaluation the
     next day, and `rows rating_schemes` reads the new rater. A refused change keeps the dialog open with
     `The rater was not changed`. Two buttons then carry the name `Change rater` (the sheet's and the dialog's), so click
     the dialog's by UID

   - ID: R4 - Screen and control: Access, empty and loading - How to reach it: `ratingView`, `ratingEmpty`, Personnel-only
     `manager`; `server-source arm evaluations hold 1 120000` then open the tab - Expected: View reads the lines with no
     `Add to scheme` and no line button; Empty reads `Nothing on the rating scheme yet` with `Add to scheme`; manager
     reads `Access Restricted`. While the workspace streams, the `Loading evaluations` region shows the tab-row
     placeholder, then the page replaces it without moving the header

   - ID: R5 - Screen and control: Export - How to reach it: `export arm`, `Export`, `export save`,
     `workbook FILE 'Rating Scheme'` - Expected: `rating-scheme-<browser day>.xlsx` with the sheet `Rating Scheme` and the
     columns Rated Individual, Rank, Eval Type, Rater, Intermediate Rater, Senior Rater, Reviewer, Rating Scheme (Listed
     or Archived) and Notes; only the filtered lines, and no workflow columns

Remove UI-created entries through the owner UI. Compare every original A/B scheme and Evaluation row across all saved fields,
including timestamps, and confirm created-witness absence before `clean-seeds`. Complete every comparison depending on any
journaled cohort before cleanup; `clean-seeds` removes all of the run's journaled cohorts. For approval-lifetime checks,
use journaled `deletion-sources` targets so documented cleanup owns their request history. Cancel an already-dispatched
pending request as its ordinary requester before owner removal; cancellation preserves terminal history until cohort
cleanup. Keep a UI-created delayed-save witness free of approval requests and remove it visibly as owner. Then confirm
known IDs and request history are absent in A/B.

## Gotchas

- Configure does not grant governance deletion: an ordinary configure member still requests approval; owner/admin direct
  removal remains separate, and direct SQL deletion of an entry also needs owner/admin.
- `ratingForeign` operates its own Organization B; its requests into A must be denied. It is not a view-only B actor.
  `ratingSwitch` operates A and views B. Before mutation probes, establish the actual fixture role, admitted
  Organization and target ID, then derive the expected result from those grants. Keep B's original full row as an
  untouched sentinel; do not use it to test an assumed denial. Use the admitted view-only actor for B write denials.
- Evals and the Dashboard due projection omit archived People's entries, while RLS and the stored rows keep them for
  export and restore. Never treat a hidden entry as a deleted one; read the stored row. A slot that names an archived
  evaluator still reads "Unknown" in the views.
- Due dates use browser-local midnight. Use the fixture/browser date and record the actual timezone; rerun dated
  expectations if the run crosses midnight.
- Workbook export is a client download, not a Rating Scheme export endpoint.
- A client-injected 503 proves visible response handling, not provider rollback, atomicity or real delivery.
  Authenticated HTTP and SQL observations remain separately identified.
- Approved Rating deletion keeps the request-authenticated provider. Separately probe an admitted synthetic admin
  downgraded to a viewer immediately before the real database DELETE: its own pending request may stay readable, but the
  evaluation must remain unchanged and approval must not report success. Restore the exact membership before a positive
  retry.

## Viewer day

With a browser zone whose day differs from UTC (see the [skill](../SKILL.md#launch)), export the Rating Scheme. The
download must be named `rating-scheme-<browser day>.xlsx`. An entry whose rating period ends 30 browser days ahead must
read due in 30 days at any time of day, including just after midnight on a daylight-saving week in `America/New_York`.
