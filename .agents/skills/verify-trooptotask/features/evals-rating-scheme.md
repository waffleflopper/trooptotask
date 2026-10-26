# Track evaluations and evaluator relationships

Members use Evals to track rated individuals, evaluators, rating periods, report types and workflow progress. Rating
Scheme access is independently grantable without Personnel access.

## Sub-features

- Page header with four counts in due tones, a search over rated Soldier and every evaluator, Grouped/table views
  (Grouped sorts by urgency or senior rater A to Z; the table opens by rated Soldier last name), and evaluation type,
  record status and workflow filters.
- Add/edit in a right-side sheet with one combobox per evaluator role (unit Person or a typed external name), optional
  intermediate rater/reviewer, annual dates, notes and separate workflow status; inline required-field errors;
  save/cancel and reload persistence.
- Overdue, 30-day, 60-day and current due calculations, completed exclusion and the Organization Dashboard due
  projection.
- Actual filtered Rating Scheme workbook, including evaluator names, dates, due/status/workflow labels and notes.
- Dedicated view/operate/configure access, Alpha/empty-Group/unassigned and foreign Organization isolation; permission
  narrowing when switching Organizations.
- Direct deletion for admins/owners, approval submission for ordinary operators and Rating-owned approved effects;
  failed saves/deletions/requests must report failure and support recovery without losing the current draft.
- Screen states: Grouped row buttons, Table view, search and its no-match state, entry sheet focus, required fields and
  failed save, a rejected workspace source, and loading, empty, denied, foreign, narrow and dark states (step 7).

## How to get to it (user POV)

Sign in, choose the Organization and open **Evals** from its navigation. Switch between **Grouped** and **Table**,
search, then use the evaluation filters. **Add Entry** opens a new draft; select an existing row to edit. **Export**
downloads the currently filtered entries. Return to the Organization Dashboard through its visible navigation to inspect
upcoming evaluations. A member with Personnel access alone cannot enter Evals.

## Helper controls

Rating Scheme actors are `ratingConfigure`, `ratingOperate`, `ratingView`, `ratingScoped`, `ratingEmpty`,
`ratingForeign` and `ratingSwitch`, with every other feature lane absent. Scoped operates only Alpha, Empty has no
Groups, and Switch operates A but only views B. `actor ROLE evals|home` enters Evals or the Organization Dashboard
through the normal sign-in form. `seed rating-scheme` creates four temporary Alpha People (Officer, Warrant, NCO and
archived) and ten dated evaluation records across A/B; it returns exact IDs and examples, records every ID before
insertion, and uses `clean-seeds`. `rows rating_scheme_entries orgA|orgB id ID` reads their
evaluator/status/workflow/date/notes fields; `rated_person_id` is also supported. `network` accepts the exact A
`rating-scheme` endpoint; use the existing `deletion-requests` control separately for approval submission. Inspect real
downloads with `workbook FILE 'Rating Scheme'`. The [Evals recipe](evals-rating-scheme.md) owns expectations.

## Driving it with verify:app

Record the local/browser date. Set `V="node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"` for
the owned worker. Run `$V seed rating-scheme` once and save its returned exact IDs, dates and examples. The
[helper controls](#helper-controls) describe the `rating*` actors. Use `$V actor ROLE evals` or `home`; use `manager` as
the Personnel-only denied actor and `orgOwner` for direct deletion.

1. **Read, filter, due and export.** Enter with `ratingView`. Verify view access without Personnel, no Add/Edit
   affordance, and actual loaded examples rather than actor arrival alone. The seed stores nine A entries, one of them
   an archived Alpha Person's (−2 days). Evals hides that entry, so `ratingView` sees eight: one overdue (Able −5 days),
   four due within 30 days (Alpha NCO +20, changed Officer +10, Bravo +25, unassigned +15), one Officer +45, one Warrant
   +90 and one completed NCO −90. Completed entries contribute no overdue count; Change of Rater remains distinct from
   workflow progress. The active filter shows six entries; all statuses shows eight. Check the three evaluation types
   and the NCO's **With Rater** workflow independently, in Grouped and Table views. Evals never lists the archived Alpha
   entry in Grouped, Table, filters or the workbook, and none of its rows reads "Unknown" for the rated Person;
   `$V rows rating_scheme_entries orgA id ARCHIVED_ENTRY_ID` still reads it, since archiving keeps the stored row.
   Export active, all-status and Alpha-filtered examples through the visible button. Arm `$V export arm PAGE`, save with
   `$V export save PAGE .verification/evidence/verify-trooptotask/RUN/evals.xlsx`, inspect
   `$V workbook FILE 'Rating Scheme'`, then restore. Expect only filtered accessible entries and the 15 retained columns
   with actual dates, names, statuses and notes. Pure tests cover exact 0/30/31/60/61-day boundaries; these live
   examples cover the displayed buckets.
2. **Create/edit, required fields and recovery.** With `ratingOperate`, open Add Entry, press **Add entry** with every
   field empty and inspect the inline required-field errors and the focus on the first missing field. Select the seeded
   Officer/Warrant/NCO to check rank-based OER/WOER/NCOER suggestions, without rewriting the rank catalog. Annual start
   changes fill the anniversary-minus-one-day thru date; an explicitly edited thru date remains. Pick an internal Alpha
   rater, or type a synthetic name into the Rater combobox and choose `Use "<name>" as an external rater` (the saved row
   has `rater_name` set and `rater_person_id` null); populate senior rater and optional intermediate/reviewer. Add
   workflow and notes, save, read the exact row with `$V rows rating_scheme_entries orgA id ID`, reload and reopen. Edit
   record status independently from workflow. Removing an optional evaluator clears its relationship and associated
   workflow. Cancel an edited draft and confirm stored values remain. Arm `$V network arm-fail PAGE rating-scheme`
   before a save; observe the failed request, unchanged provider row and preserved visible draft, then restore and
   retry. Delayed save should prevent duplicate submission/closing until completion.
3. **Scope and security.** With `ratingScoped`, expect only Alpha entries, without the archived Person's record (six
   rows; four when the default active filter applies, which also excludes the completed and change-of-rater entries);
   its lookup includes active Alpha People and excludes Bravo, unassigned, archived and foreign People. With
   `ratingEmpty`, expect zero entries and zero lookup choices. Use authenticated HTTP from these signed-in synthetic
   pages to attempt POST/PUT/DELETE against known Bravo, unassigned and foreign IDs: expect 403/404 as appropriate, no
   stored changes, and no disclosure of hidden names/notes. Enter Evals directly as the Personnel-only `manager`: expect
   a settled Access Restricted message, no Evals editor/rows and no persistent busy shell; authenticated workspace data
   remains restricted and Rating mutations return 403. The endpoint's `GET ?entry=<id>` reads one entry for its editor
   under Rating view and the actor's scope: a missing or malformed `entry` returns 400 and an unknown or hidden ID 404.
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
4. **Deletion and approval recovery.** Open a dedicated new entry with the ordinary operator and confirm Delete submits
   a request, returns approval-required behavior and leaves the entry stored. Observe the request row and visible
   feedback; repeat for the existing-pending case. Fail the Rating Scheme DELETE and then the `deletion-requests`
   submission independently using the matching network helper. Failure must not claim success, remove the stored entry
   or lose the open draft and confirmation; restore and retry. Hold the DELETE and approval POST separately: pending
   confirmation blocks repeated submission, Cancel/Escape and editor close/save/delete until settlement. The helper
   holds the real response after provider processing, so pending UI does not imply an unchanged database. A pending Save
   also blocks starting Delete. With `orgOwner`, directly delete only the UI-created entry and read its absence after
   reload. For the consumed Rating effect, create a separate expendable entry and submit deletion with the operator.
   Observe DELETE202 and the actual successful submission status, an unchanged evaluation and a matching pending
   request. Enter owner **Settings → Approvals**, locate the article by resource description/request ID and Approve.
   Observe review POST200, evaluation absence, matching request approved with reviewer/time, and unchanged seeded A/B
   sentinels. Reload Approvals/Evals and read persistence; do not substitute direct owner deletion.
5. **Dashboard and switching.** With `ratingOperate` and then `ratingScoped`, compare the Dashboard due projection
   against their accessible non-completed Evals entries: Organization-wide has one overdue and four within 30 days;
   Alpha has one overdue and two within 30 days. The archived Alpha entry (−2 days) is in neither count. The Dashboard's
   Evaluations column draws overdue, due within 30 days and current as shares (org-wide
   `1 overdue, 4 due within 30 days, 2 current`; Alpha `1 overdue, 2 due within 30 days, 2 current`), and its note names
   the 30 and 60 day counts separately (`4 more due within 30 days and 1 within 60.`), the 60-day entry counting as
   current in the bar. Needs you lists only overdue entries, each as an Overdue row that names the rated Person,
   including for an actor without Personnel access (`ratingOperate`). Evals also displays the 60-day bucket. Completed
   entries are excluded. An Overdue row's `Update status` opens this page's entry editor for that one entry and saves
   through the same `PUT api/rating-scheme`; the entry must read Completed here after reload
   ([Dashboard actions](dashboard.md#actions)). The projection must not borrow Personnel capability or expose
   Bravo/unassigned to Alpha. Its Dashboard entry payload carries the entry ID, rated Person ID, evaluation type, rating
   period end and record status, bucketed by the viewer's day, plus `ratedPersonName` (rank and name) from the same
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
   Evals with that entry's editor (`/evals?entry=<id>`, which drops the parameter once open). Current positive seed
   entries alone do not prove missing-rater branches or which otherwise-identical entry is newest; separate owner rule
   tests cover those. The Personnel-only `manager` gets no Rating chain card and a `Couldn't check the evaluation` line
   under Needs attention. As owner, enter **Settings → Exports**, capture **Export JSON** and **Export Excel**
   separately with the existing export hook, then restore each. Before other witnesses are created, A has nine Rating
   rows, including completed/change-of-rater, Bravo, unassigned and archived; B's foreign example is absent. Compare raw
   rows by ID, all 20 saved fields including timestamps and null/external references, `sections.ratingSchemeEntries`,
   its top-level duplicate and inventory count. Inspect **Export Inventory**, **Rating Scheme** and **Raw - Rating
   Scheme Entries** sheets. The Organization readable Rating sheet has 12 retained columns and saved report/workflow
   codes; Evals has 15 presentation columns. Organization export keeps the archived Person's stored entry among the nine
   rows, with its full authorized Personnel label, even though Evals and the Dashboard due projection omit it. Restoring
   that Person through Settings → **Archives** returns the unchanged entry to Evals and its due counts: overdue rises
   from one to two Organization-wide and in Alpha.

7. **Evals screen states.** Use the [component foundation](component-foundation.md) recipe's `reader.js`. Run
   `$V seed rating-scheme` first. Record each row PASS, FAIL, UNAVAILABLE or UNRUN with actor, width and theme; a FAIL
   stays FAIL until the same row passes on a later candidate.
   - ID: E1 - Screen and control: Page header, search and Grouped rows - How to reach it: `ratingOperate`, `Grouped`,
     1440, 1024 and 390 - Expected: The eyebrow reads `Rating scheme · <Organization>` above a large uppercase display
     `Evals` heading (about 48 px at 1440, smaller at 390), with the live status `6 of 8 shown` and four 15 px counts,
     the due ones semibold in their tones (`6 active`, `1 past thru`, `4 thru in 30 days`, `1 thru in 31 to 60 days` on
     the seed), separated by thin vertical rules at 1440. Each Senior rater section opens with a mono `SR` label, the
     name as a 28 px uppercase display heading, an `External` tag for a typed name and `Senior rates N`, all on one
     baseline, above a 2 px foreground rule; right-aligned non-zero counts in 12 px mono read
     `1 past thru · 3 in 30 days · 1 in 31–60` (middle dots, never `30d`). Each rater block has a 200 px left column at
     1024 and up (the rater name 15 px semibold, then `Rater · rates N` muted with an orange `· External` word for a
     typed name, on the same line at every width) and a bordered list of rows. A row has a 3 px due rail, the rated
     Person (`SPC Able`), a small bordered eval tag (`NCOER`) with the report label (`Annual`), the period as
     `25 Oct 25 → 20 Oct 26` (day padded to two digits), the workflow step or `Not tracked`, and the due text in its
     tone (`5d past thru` red, `Thru in 15d` orange, `Current` green). At 1440 every row is one line about 47 px tall
     and the first row of a rater is not stretched to the rater column's height; below that the rows keep two lines
     (Soldier and due text, then eval and workflow) with nothing clipped. The first row is the most urgent. Each row is
     one `Button` whose name carries every visible cell; Tab reaches it, Enter and Space open the sheet, and focus
     returns to that row after Escape or Save, or to `Add Entry` when the row is gone. `Group order` offers
     `Sort: Most urgent` and `Sort: Senior rater A to Z` and exists only in Grouped. With at least three Senior raters,
     one whose surname sorts last, whatever the rank, holding the most overdue entry comes first by urgency and last A
     to Z (add them through the sheet). Typing `zzzz` into `Search by Soldier or rater` shows `No entries match` and
     `0 of 8 shown`; `Clear search and filters` restores `6 of 8 shown`. Search also finds a Soldier by any label the
     page shows: `SPC Able`, `SPC Able, Synthetic` and `Able, Synthetic` each keep the Able rows

   - ID: E2
     - Screen and control: Table view and view mode
     - How to reach it: `Table`; click a header; then reload
     - Expected: Columns read Status, Rated Soldier, Eval, Rater, Senior rater, Thru and Workflow. The table opens
       sorted by rated Soldier last name A to Z (Able, Baker, Evalnco…, Evalofficer…, Evalwarrant…, Unassigned on the
       seed) with the arrow on `Rated Soldier`; the Status header sorts overdue first. Every row carries its due rail on
       the left edge and an `ext` tag beside a typed rater. `Evaluation view mode` buttons expose `aria-pressed` (a
       radio group in More once folded). Each row opens the editor by keyboard. View mode, search and filters live only
       in page state; a reload returns to `Grouped` with the default filters. At 1024 the table scrolls inside its own
       region and the document does not

   - ID: E3
     - Screen and control: Entry sheet focus and required fields
     - How to reach it: `Add Entry`, then `Add entry` with every field empty
     - Expected: A sheet slides in from the right, about 560 px wide at 1440 and the full screen below 640 px, focus
       moves into it, and the header reads the mono eyebrow `New entry` above the uppercase display title `Add entry`.
       Each missing control is `aria-invalid="true"` with a resolving `aria-describedby` and its own message below it
       (`Rated Soldier is required.`, `Start date is required.`, `Thru date is required.`, `Rater is required.`,
       `Senior rater is required.`) and focus moves to `Rated Soldier`. Type is a segmented control with the selected
       item raised. Escape and Cancel return focus to `Add Entry`. Sections (`Rated Soldier`, `Evaluation`,
       `Rating period`, `Rating chain`, `Tracking`) are divided by rules. The Report trigger reads the code and label
       (`AN · Annual`). Editing a row shows `Edit entry · SR <name>`, the rated Soldier as the title
       (`SPC Able, Synthetic`), a tone dot with `Thru 20 Oct 2026 · 5 days past` (an entry due in 15 days reads
       `Thru in 15 days`), and a `Delete entry` link only for an actor who may delete. The link opens
       `Delete this entry?`; confirming submits the approval request and closes the sheet

   - ID: E4 - Screen and control: Rating chain comboboxes and failed save - How to reach it: Open an entry, `Rater`,
     type a name nobody in the unit has (`COL Visiting Guest`), press Enter - Expected: The list reads
     `No one in the unit matches.` and ends with `Use "COL Visiting Guest" as an external rater`, wrapped on a narrow
     sheet. A unit Person shows a muted mono `In unit` hint; a typed name shows orange mono `External` text, not a
     filled badge. Under the chain a line reads
     `Search the unit, or type a name that isn't in it to add an external rater.`; `+ Intermediate rater` and
     `+ Reviewer` are underlined links, and each added slot has a remove button. After Save,
     `$V rows rating_scheme_entries orgA id ID` reads `rater_name` `COL Visiting Guest` and `rater_person_id` null, and
     the grouped row sits under that rater with its tag. Then `network arm-fail PAGE rating-scheme` and Save: the sheet
     stays open with every value; an `Alert` (`role="alert"`, `Rating entry was not saved`) inside the sheet states the
     failure; focus stays on `Save changes` (`Add entry` for a new one); the row is unchanged. A toast alone is a FAIL.
     Restore, retry once and read the row back

   - ID: E5
     - Screen and control: Workspace loading
     - How to reach it: On Home, `server-source arm rating_scheme_entries hold 1 120000`, then choose Evals
     - Expected: A labelled loading region (`role="status"`, `aria-live="polite"`, no `aria-busy` on the live region,
       named `Loading evaluations`) whose blocks match the loaded page: three header lines, one toolbar block and two
       Senior rater sections (a heading on a 2 px rule, a rater column at 1024 and up and a list), so nothing shifts
       when rows arrive. At 390 the toolbar block is two rows tall. Release with `server-source restore`

   - ID: E6
     - Screen and control: Workspace error (`evals/+layout`, `+page`)
     - How to reach it: On Home, `server-source arm rating_scheme_entries fail-hard 1`, then choose Evals; repeat with a
       full load of `/evals`
     - Expected: `WorkspaceLoadError`: `role="alert"` `Unable to load Evals` (or the evaluations subject) with a Retry
       button; the header and sidebar stay usable; Retry recovers after `restore`. A skeleton or blank page with no
       alert or Retry is a FAIL. Save the console

   - ID: E7
     - Screen and control: Empty, view, denied and foreign
     - How to reach it: `ratingEmpty`, `ratingView`, Personnel-only `manager`; `ratingForeign` opens A's Evals address
     - Expected: Empty: a settled `Empty` state. View: entries with no Add Entry or write control. Personnel-only:
       `Access Restricted`. Foreign: 404 `Page not found` with no A data

   - ID: E8
     - Screen and control: Narrow and dark
     - How to reach it: 390x844 dark: Grouped, Table, the Add and Edit sheets, Filters
     - Expected: No horizontal document overflow. The toolbar is two rows: `Search by Soldier or rater` across the full
       width (about 322 px), then `Grouped` / `Table`, `Filters` and an icon-only `Add Entry` (a 32 px square whose
       accessible name is still `Add Entry`) on one row. The header counts wrap to two lines. Grouped rows are two lines
       with the due text on the right and the rail on the left; the Senior rater heading wraps under its name; the table
       scrolls inside its region. The sheet fills the whole screen with reachable `Save changes` (`Add entry`) and
       Cancel; `Add entry` with every field empty lists the five inline errors inside it. `Filters` opens a menu of
       `Evaluation type, Eval Type: All`, `Evaluation status, Status: Active`, `Evaluation workflow, Workflow: All`,
       `Group order, Sort: Most urgent` (Grouped only) and `Export`

   - ID: E9
     - Screen and control: Toolbar fold sweep and Filters
     - How to reach it: `ratingOperate` on Evals.
       `$V toolbar-sweep PAGE "Evaluation controls" RUN_DIR --expect export,grouped-sort,workflow,status,eval-type --pinned add-entry,view-mode --search --step 4 --record sweep-light`,
       then dark. At 390, switch to `Table` on the row, open `Filters`, set `Evaluation type` to NCOER, then choose
       `Export`; as `ratingView`, read the row and Filters
     - Expected: `toolbar-sweep.json` passes with zero failures: `Export` folds first (near 1368), then `Group order`
       (1316), workflow (1160), status (1032) and type (960), each restoring within 4 px. The toolbar switches to its
       compact form when its own width falls below 640 px (a 390 phone, and a tablet beside the open sidebar), not by
       viewport: there search is a full-width row of its own, every filter and action is in `Filters` and only the view
       mode and the icon-only `Add Entry` stay on the second row. `Add Entry` and the search stay present at every width
       and no control changes membership twice in one 4 px step. A non-default folded filter puts the dot on `Filters`.
       `Export` downloads only the filtered entries. The viewer has no `Add Entry` on the row or in the menu

Remove UI-created entries through the owner UI. Compare every original A/B row across all 20 fields, including
timestamps, and confirm created-witness absence before `clean-seeds`. Complete every comparison depending on any
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
