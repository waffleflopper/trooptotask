# Record Training and check readiness reports

A member records a Soldier's Training, checks the saved completion after reload, and uses the matrix, the Training
Reports briefing and the downloaded workbook to find current, expiring and missing requirements within their authorized
roster.

## Sub-features

- `completion-lifecycle`: add, edit, cancel and remove a completion through a matrix cell or the Person editor; dates,
  notes, certificate URL and the existing record ID survive ordinary updates and reload.
- `completion-recovery`: failed saves and removals leave stored facts unchanged, show useful feedback and allow retry;
  an operate-only deletion request is distinct from a completed deletion. Direct SQL deletion of a completion also needs
  Training configure.
- `completion-import`: import a wide or long training tracker on `/training/import`: map columns to training types,
  answer X marks once per training, fix a cell inline, skip a row, download the rows not imported, and re-import without
  duplicate completion identities. Exempt marks also need requirement configuration.
- `matrix-and-report`: Required and targeted applicability, dated status, the briefing's Bottom line, Forecast, Hot-spot
  grid, Type risk bars and Focus areas, URL-kept filters and the Affected soldiers drill-down from a cell or focus link
  agree with independently counted examples; Optional Training remains visible in the matrix without entering required
  readiness.
- `matrix-export`: the main Training page exports one alphabetical row per authorized Person in the selected Group and
  every Training type in catalog order, including columns hidden by a saved view. Cells retain saved dates or state
  exemption, missing, not required, or completion without a date. Expiration-only and completion-only columns identify
  their meaning in the header. Row 1 is one wrapped notice merged across the first four columns, "Exported YYYY-MM-DD.
  Colors reflect training status on this date. These are fixed colors, not Excel conditional formatting. They will not
  update as time passes or when dates change." with the same local date as the filename. The column header is row 2 and
  both rows stay frozen. Each training cell has a fixed fill and font from its status on that date: current green
  `FFDCFCE7`/`FF166534`, yellow `FFFEF9C3`/`FF854D0E`, orange `FFFFEDD5`/`FF9A3412`, expired red `FFFEE2E2`/`FF991B1B`,
  missing gray `FFF3F4F6`/`FF4B5563`, not required white `FFFFFFFF`/`FF6B7280`, exempt blue `FFE0F2FE`/`FF075985`.
  Defaults: day -1 expired, days 0-30 orange, 31-60 yellow, 61 current; a stored expiration date decides, not the
  exported completion date. The sheet has no conditional-formatting rules or formulas.
- `report-export`: the downloaded workbook has the sheets Summary, Forecast, Hot spots, Focus and Requirements for the
  briefing on screen; Requirements lists every affected requirement of the filtered briefing with status labels and
  saved dates.
- `report-print`: Print brief captures the loaded briefing and optional loaded detail page together. Print A uses an
  overview, a transposed matrix with bounded Group or duty-role columns, a compact worst-first type-risk summary, and an
  optional appendix. Every sheet retains context and white margins. Requirement readiness stays separate from Soldier
  counts.
- `completion-access`: Training view, operate and configure retain different actions; Alpha-only and
  foreign-Organization access cannot expose or change other Personnel's completions.
- `reverse-consumers`: Dashboard Training projections, Personnel readiness and the Person workbook retain their distinct
  meanings; Onboarding consumes completion references through its retained Training contract.

When restoring empty Notes or Certificate URL in the Person editor, focus the textbox and use native `Control+A` and
`Backspace` before Save. As with Type Description, `fill` with an empty string can clear DOM text without updating
Svelte's bound value. Inspect the actual save body and provider row if they disagree; preserve the failed attempt and
repeat only the affected clearing/restoration action.

## How to get to it (user POV)

Choose `Training` in the Organization navigation. Choose a Person's Training cell to add or edit that record, or open
the Person editor from the named row's `Quick edit`. Use the `Import` link in the `Training controls` toolbar to open
the import page. Use `Export Excel` in that toolbar for the full training matrix, keeping the selected Group and
including every Training column even when a saved view hides some. At narrow widths, open `More Training controls` if
the action has folded. Open `Reports` for the `Training Reports` briefing: the single-row `Training report controls`
toolbar (the `Forecast horizon` buttons `30 D`, `60 D`, `90 D` and `180 D` (named `30 days` to `180 days`) as pressed
toggles, which show as `30 days` to `180 days` radio items in More once the horizon folds, `Filter by view`,
`Filter by group`, `Filter by rank`, `Filter by MOS`, `Filter by duty role`, `Filter by training type`, `Clear filters`
when the selection is not the default, `Export Excel`, and the primary `Print brief`; the least important controls fold
into `More Training report controls` as it narrows), with the `Updating briefing` status staying in the page header
while a change loads, the Bottom line, the Forecast chart (`data-testid="training-briefing-forecast"`, with a
screen-reader table of weekly points), the Hot-spot grid (the `Hot-spot grid controls` toolbar above it with the
`Rows by` buttons, beside a visible `Rows by` caption; each cell is a button named
`<row>, <type>: <n>% ready today[, drops <k> points by <date>][, selected]` holding
`[data-slot=readiness-band-cell][data-tier]`), the `Already gone vs. about to go` Type risk table
(`Not ready and lapsing requirements by training type`: a row header per type, stacked bar, `Not ready` and `By <date>`
counts), and the `Where training time buys the most` Focus list (at most three numbered areas, each with its title
heading, sentence, what-if chip and a `View <n> soldier(s)` link; the wave area also states `First lapse <date>`).
Choosing a cell or focus link opens the `Affected soldiers` region below, moves focus to it and fills the
`Affected soldiers` table (Rank, Name, Group, Training type, Status today, Expiration date, Lapses in horizon) with a
status line, a `Rows <a>–<b> of <n>` range, `Rows per page` radios (25, 100) and the table's `Previous`/`Next` buttons
when there is more than one page; the open focus link carries `aria-current`. The shared pager owns focus while paging:
Enter on a pager button keeps focus on it, and when it disables at either end (including after the server page arrives)
focus moves to the other, enabled button; if the range shrinks to one page the pager unmounts and focus moves to the
table. Filters, horizon and `rowsBy` live in the URL, so a reload restores the same briefing. For the reverse Personnel
view, choose `Personnel`, the matching Person's row, then inspect the `Readiness` tab or choose `Export records`. Return
to the Organization Dashboard to inspect its Training summary.

## Helper controls

Training actors include `trainingConfigure`, `trainingView`, `trainingOperate`, `trainingScoped`,
`trainingScopedConfig`, `trainingEmpty`, `trainingSwitch`, `trainingForeign`, `trainingOnboarding`, and
`trainingOnboardingView` (Onboarding and Training view only).

For print evidence, use a freshly launched owned worker and its already loaded Training Reports page. Arm
`print arm PAGE`, click the visible **Print brief** with native controls, then save `print state PAGE` before
`print save`. The observer counts real `beforeprint` and `afterprint` events without replacing `window.print`. PDF
capture also produces print events, so counts read after capture cannot establish that the button invoked print. Restore
the observer afterward; reload or navigation discards it.

Reload before each separate print case on the owned headless browser, then recreate the intended filters, detail page or
error state before arming the observer. Repeated Print brief calls on one document have produced no new `beforeprint`
event until reload. A PDF from such a call still proves rendering; it does not prove that native invocation. Preserve
zero-event attempts separately.

`print save PAGE EXACT_REPORT_URL FILE.pdf` renders that document with Chromium's print stylesheet, backgrounds and CSS
page size. Quote the full current URL, including filters. It admits only this worker's `/org/ORG/training/reports` path,
the existing report query keys and a new `.pdf` beneath `.verification/evidence/verify-trooptotask/`. It rejects
mismatched native page IDs, duplicate exact URLs, changed documents, stale ownership, symlinks and existing files.
Capture has a 20-second deadline, a 20 MiB limit and at most two seconds for temporary protocol cleanup. It never
navigates or closes the native page/browser. Preserve the native click receipt and pre-capture event state separately
from the PDF. A PDF establishes print rendering, not a system dialog, physical printing or feature permission. Run
`node --test scripts/verification/print-capture.test.mjs .agents/skills/verify-trooptotask/helpers/print-observation.test.mjs`
for the fixed control boundaries.

```bash
$V print arm 2 # observe real beforeprint/afterprint events
$V print state 2 # save AFTER native Print brief click, BEFORE print save
$V print save 2 'EXACT_LOADED_REPORT_URL' .verification/evidence/verify-trooptotask/RUN/brief.pdf
$V print restore 2
```

Training controls include `personnel-trainings`, `personnel-trainings/batch`, `deletion-requests` for submission and
`deletion-requests/review` for review; these match exact endpoints.

`trainingEmpty` operates with explicit empty Group scope and Personnel none. `trainingSwitch` operates A and views B,
also without Personnel access.

`seed training-pages` creates 26 temporary Alpha/PFC People: the first is 68W/Medic, the other 25 are 11B/NCO. It
records their IDs before insertion and uses ordinary `clean-seeds` cleanup.

## Driving it with verify:app

Preconditions: `$V fixture` supplies `personA` (Able, Alpha, 68W, Medic), `personB` (Baker, Bravo, 11B, NCO),
`personUnassigned` (68W, NCO), `personForeign`, `trainingRequired`, `trainingTargeted`, `trainingOptional`,
`trainingCurrent`, and the foreign type/view IDs. It also supplies `dates.ui`, `trainingCompleted`, `trainingExpires`,
`trainingExpiredCompleted`, `trainingExpiredExpires`, `trainingWarningCompleted` `trainingWarningExpires` and
`trainingWarningDays`. Copy those literal dates into the run note before driving; do not calculate the expectation by
calling application status/report functions.

Start with unchanged seed rows. Required applies to all three A People. Targeted applies to 68W and excludes NCO, so
only Able is required. Optional does not enter required readiness. Only Able Required initially has a record: it is
current. There are therefore **four required cells: one Current and three Not Done, for 25% readiness**. Alpha is 50%;
Bravo and Unassigned are 0%. Required's Total cell is one ready of three, 33% after rounding; Targeted is zero of one,
0%. The Bottom line counts are Ready 1, expired 0, not recorded 3 and no lapse by the 90-day horizon end because
`trainingExpires` is later. The saved Focus View orders Targeted before Required and hides Optional; it does not change
these stored facts.

The dated import below adds Baker Required, completed two years before today and expired one year before today, and Able
Targeted, expiring `trainingWarningDays` after today (normally 15; 14 when avoiding a February 29 target). With the
seeded 60/30-day warning windows, the latter is warning-orange. After those two records, the same four required cells
are **one Current, one Expired, one Expiring and one Not Done, now 50% readiness**, because Current and Expiring
(warning-yellow and warning-orange) both count as ready. Alpha becomes 100%; Bravo and Unassigned remain 0%. Required
stays one Current/one Expired/one Not Done at 33%; Targeted is one Expiring at 100%. A warning record is labeled
Expiring rather than Current but is ready. Optional and foreign data must not inflate the denominator. These literal
counts are the report expectation, not a requirement that the Dashboard's separate currency presentation show the same
percentage.

1. **Unchanged matrix and report:** Run `$V actor trainingConfigure training`, save its page ID, and capture the loaded
   matrix. Require Able Required Current, Able Targeted Not Done, Baker/Unassigned Required Not Done, and
   Baker/Unassigned Targeted N/A. Optional has no completion and is N/A. Use the visible `Reports` link and capture the
   Bottom line at 25% ready today with Ready 1, Not ready (expired) 0, Not ready (not recorded) 3 and Lapse 0, the
   subtitle's three soldiers, and the Hot-spot grid's Alpha 50%, Bravo 0%, Unassigned 0% rows with the Required/Targeted
   Total cells above. The first paint must come from the server: the page HTML already holds these numbers and no
   `training-reports` summary request runs on load. Reload for a second visible read.
   `$V rows personnel_trainings orgA personnel_id <personA>` separately confirms the original `trainingCurrent` ID and
   literal completion/expiration dates; B data must be absent from A's matrix and report. **Main matrix export:** Return
   to Training and arm `$V export arm PAGE`, choose `Export Excel`, then save the captured file with
   `$V export save PAGE .verification/evidence/verify-trooptotask/<run-name>/training-matrix.xlsx`. Inspect it with
   `$V workbook FILE 'Training Matrix'` and restore the capture. Require one sheet, Name/Rank/Group identity columns and
   Required, Targeted, Optional in catalog order; Optional has `(completion only)` in its header. There are exactly
   three alphabetical Person rows. Able Required holds the literal `trainingCompleted` date, not its expiration date.
   Able Targeted and Baker/Unassigned Required say `missing`; Baker/Unassigned Targeted and all empty Optional cells say
   `not required`. No foreign Person or type appears. Select Focus View and repeat: all three training columns still
   export, including hidden Optional. Select Alpha and repeat: only Able exports, with every training column. Grouping,
   collapsed groups and matrix sorting do not omit records or change the alphabetical export order. Reload and repeat to
   prove the visible filters and export still agree.

   Repeat as Training view-only and Alpha-scoped actors. View-only can export without write controls; Alpha scope
   exports only Able. The foreign actor's workbook contains only B's Person and type. Training-none has no usable
   export; empty scope and an empty catalog disable the action. During hydration the action is disabled. During
   generation it keeps focus and is `aria-disabled` and `aria-busy`, and repeated activation cannot start another
   download. For failure recovery, on a fresh page before its first export, use native `emulate` with
   `networkConditions: "Offline"` to fail the lazy Excel module request, capture the visible error, then restore native
   emulation and run `doctor`. Retry explicitly. If the browser retains a failed module import, reload before retry and
   record that recovery path; never call an error a successful download. Capture native actions, the workbook and exact
   cell contents separately from authenticated source readback.

   For saved date variants, use the existing Optional completion and expiration-only/exemption journeys below, then
   export before removing their temporary rows. A valid undated completion says `completed (no date)`. A saved date wins
   over `not required`, and an exemption says `exempt` even when a date exists. Expiration-only columns append
   `(expiration only)` and hold the saved expiration date, including an expired one. Never-expiring columns append
   `(completion only)` and hold a saved completion date when supplied. Ordinary columns retain the last completion date
   even when expired. Restore original facts and remove only the temporary UI-created records/types before owned
   cleanup.

2. **Save, edit, cancel and failed-save retry:** Return to the Training matrix. As `trainingOperate`, open Baker
   Optional; its never-expiring form offers `Mark as Complete` and an optional completion date. Mark it complete, add a
   unique Notes marker and a valid synthetic Certificate URL such as `https://example.test/training`, then Save. Require
   confirmed success, the Optional cell's Current state and the same values after reload/reopening; read back exactly
   one Baker/Optional row and keep its new ID. Edit the notes and URL, save, and require that same ID. Cancel a further
   draft and require unchanged values. Arm `$V network arm-fail PAGE personnel-trainings`, edit again and Save. Capture
   the actual failed request, feedback and entered values; provider readback must retain the preceding saved row.
   Restore with `$V network restore PAGE`, retry through the form, and require the new values on the same ID after
   reload. In the modal and the Person editor the failure is an Alert titled `Training record was not saved` inside the
   dialog, focus is on `Save`, Escape is blocked while the draft is dirty and closes a pristine dialog (`closeBlocked`),
   and `Mark All Completed Today` failures remain toasts. A lost draft, a toast-only save failure or a closed form
   without useful error is a failure. This temporary Optional record must not change the required report's 25%
   readiness.
3. **Removal and approval distinction:** On that temporary Baker/Optional record, capture the original row before each
   attempt. As `trainingConfigure`, arm a one-request `personnel-trainings` failure, choose Delete and confirm
   `Delete Training Record`. Require useful failure feedback, unchanged saved row and an available retry; record the
   actual dialog behavior instead of treating a closed dialog as success. Restore the control and retry visibly. A
   successful configure removal must leave no row after reload. Repeat failure/retry from the named Person row: choose
   `Remove TYPE record`, confirm, and require the Person editor and confirmation to remain with the saved dates/notes
   after failure; retry must remove that exact record after reload. For a separate temporary completion created as
   `trainingOperate`, Delete may return **202 `{requiresApproval:true}`** and submit a Resource Deletion Request.
   Require the completion to remain and capture the pending-request outcome with `$V rows deletion_requests orgA`; 202
   is neither a failed permission probe nor a completed removal. Before submission, arm
   `$V network arm-fail PAGE deletion-requests`: require failed-request feedback, a retryable confirmation, the saved
   completion unchanged and no new pending request. Restore and retry, then reopen and repeat the removal request: 409
   already-pending is accepted without duplicating the request, and the Person editor retains the saved dates/notes.
   When approved-completion deletion is affected, sign in separately as `orgAdmin` on `settings/members`, then choose
   Approvals and locate the exact temporary completion request. Arm
   `$V network arm-fail REVIEW_PAGE deletion-requests/review` before Approve: capture the matched 503 and unchanged
   completion/pending request, restore, then retry visibly. Require review 200, the exact completion absent, the request
   approved, no other completion changed, and both Approvals and the original Training page consistent after reload. The
   `deletion-requests` control matches submission only; it does not match `/review`. A request-status failure after
   deletion is separate lower-level retry proof, not simulated by this pre-request 503. Preserve failures in submission
   or repeated pending requests. Use an owned worker restart for pending-request cleanup rather than deleting request
   rows through the helper.
4. **Tracker import, failure, re-import and same-ID update:** This journey must start with Baker Required and Able
   Targeted absent. Record any intervening mutations and restore or restart the owned worker first if necessary. Build
   `tracker.xlsx` with the tabs `Alpha`, `Bravo` and `HQ`. Each tab has two banner rows (`<TAB> — TRAINING TRACKER`,
   `UNCLASSIFIED // FOR TRAINING USE ONLY`) above the header
   `Soldier, GR, Verification Required Training, Targeted, Notes` and one row, substituting the actual fixture dates:
   Alpha `Able, Synthetic`, `SPC`, `TRAINING_COMPLETED`, `2025-11-31`, blank; Bravo `Baker, Synthetic`, `SPC`, `X`,
   blank, `Verification expired`; HQ `Unassigned, Synthetic`, `SPC`, `N/A`, blank, blank.

   As `trainingConfigure`, choose the `Import` link in `Training controls` and upload the workbook on
   `Drop a spreadsheet here`. Columns: `Read sheets` checks the three tabs at `1 row` each and reads
   `3 sheets read · 3 rows`. Each tab marks row 3 `Header` and hatches the banner rows. Soldier maps to `Last, First`,
   GR to Rank, Notes to Notes and `Verification Required Training` to that training type. `Import Targeted as` reads
   `Pick a training type`, and the footer reads
   `5 of 5 columns used · Pick a training type for Targeted here or in Review`. The button reads `Review 4 completions`,
   one per filled training cell; blank cells add nothing. Choosing the type in `Import Targeted as` instead shows it in
   Review as an answered rail question with `Change`. Nothing is written before the commit.

   Review reads `All · 4`, `Needs a fix · 3` and `Unchanged · 1`. Able Required matches its saved date and stays behind
   `1 row already matches. Nothing to save.` and `Show`. The rail asks `Unknown training type` for `"Targeted"` (1 row)
   with Verification Targeted Training preselected, and `Date for Verification Required Training X marks` for `"X"` (1
   row) with an empty `Date for X` picker, a disabled `Apply to 1 row` and `Leave these X marks out`; no date is
   assumed. Unassigned's `N/A` cell is described by `Verification Required Training can't be marked exempt.` Apply the
   training type: Able's Completed cell then reads `Enter a date like 2026-03-11.` Pick `TRAINING_EXPIRED_COMPLETED` for
   the X marks and apply: Baker's row turns New and shows that date in place of `X`. Fill Able's cell with
   `TRAINING_WARNING_COMPLETED` and press Enter: the row turns New and focus moves to Unassigned's cell. Skip
   Unassigned. `Import 2 changes` reads `2 added · 0 updated`. At 1440, Tab moves from the filters and search through
   the rail, then each editable cell and Skip button, then the commit bar.

   Arm `$V network arm-fail PAGE personnel-trainings/batch` and choose Import. Done reads `0 changes saved.` with
   Unchanged 1, Skipped 1 and Not confirmed 2, `The last batch was not confirmed` and
   `Check the training tracker before importing these again.`; `rows personnel_trainings orgA` still holds only the
   seeded completion. Download the not-imported workbook before leaving Done. Alpha's Targeted cell must contain the
   reviewed `TRAINING_WARNING_COMPLETED` date instead of the original impossible date. Re-import that download and
   require the correction to survive. Restore, choose `Import another file` and give the same answers. With
   `network arm-hold PAGE personnel-trainings/batch` the bar reads `Saving 0 of 2 changes` with Import disabled; release
   it. Done reads `2 changes saved.` with Added 2, Unchanged 1 and Skipped 1, and lists `Unassigned, Synthetic` at
   `HQ · row 4` with `You skipped this row.` Capture `Download these rows (.xlsx)` with `$V export`: one `HQ` sheet with
   the original five columns plus `Reason`, which reads `Verification Required Training: You skipped this row.` Read
   back two new completions: Baker Required completed `TRAINING_EXPIRED_COMPLETED` with Notes `Verification expired`,
   and Able Targeted completed `TRAINING_WARNING_COMPLETED` with no Notes. Able Required keeps its ID and dates.
   `Open training` shows the dated cells without a reload.

   Re-import the workbook with the same answers: the three remaining rows read Unchanged with
   `3 rows already match. Nothing to save.`, `Import 0 changes` stays disabled and the provider still holds three
   completions.

   Import a long CSV with the header `Last Name,First Name,Training Type,Date / Status,Notes` and two rows: Baker,
   Synthetic, Verification Required Training, `TRAINING_EXPIRED_COMPLETED`, `Verification expired v2`; Able, Synthetic,
   Verification Targeted Training, `TRAINING_WARNING_COMPLETED`, `Verification warning v2`. Columns maps every header.
   Review reads `Update · 2`; each Notes cell shows the new note above the old one struck through (`was empty` for
   Able). Done reads `2 changes saved.` with Updated 2. Read back the same two IDs and dates with the new Notes and no
   duplicate Person/type pair. A blank Notes cell keeps a saved note. A synthetic 503 proves failure before the request
   reaches the server only; a failed response after a real provider commit is a separate replay case.

   As `trainingView`, Training shows no Import link, `/training/import` shows the `403` page, and a direct
   `POST api/personnel-trainings/batch` returns `403` with rows unchanged. `trainingOperate` sees Import.

   **Expiration-only, exemptions and Person statistics:** When completion writes or Person summary counts are affected,
   create a temporary required type with per-Person expiration and exemptions enabled through Training configuration.
   Save Able with no completion date, a literal expiry inside the orange window, Notes and Certificate URL; edit the
   expiry and notes, then reload and require the same ID and null completion date. In the Person editor require Current
   1, Orange 1 and Not Done 1 (seeded Required, temporary type and missing Targeted); move the temporary expiry to
   yesterday and require Current 1, Expired 1 and Not Done 1. Use a date inside the yellow window for a separate Yellow
   1 check. Import a CSV with the header `Soldier,<temporary type name>` and the row `"Baker, Synthetic",Exempt` (`N/A`
   reads the same). As `trainingOperate`, the row needs a fix described by
   `Marking someone exempt needs permission to configure training requirements.`, the rail card
   `Exempt marks need access to training requirements` offers only `Leave exempt marks out`, and a direct exempt `POST`
   returns `403`. As `trainingConfigure`, the row reads New and shows `Exempt`, Done reads Added 1, and a re-import
   reads Unchanged. Require the type’s exact exempt Person ID, no Baker completion created, and Baker’s summary Current
   0/Not Done 1 because exempt and N/A rows do not enter readiness. Record the actual literal dates and independently
   counted cells. Remove the temporary completion and type visibly, then verify their absence and the original
   completion’s unchanged ID/dates. These counts assume the unchanged three-Person seed and no dated import from the
   preceding paragraph; restart the owned worker between scenarios if needed.

5. **Dated reports, filters and report recovery:** Open Reports again and require the post-import counts above: 50%
   ready today with Ready 2, expired 1, not recorded 1, and Lapse 1 because Able Targeted lapses inside the 90-day
   horizon, so the horizon figure is 25% and the sentence states a 25-point loss. In the Hot-spot grid, Alpha is 100%
   today and 50% at the horizon with a `▼` drop marker on Alpha × Targeted; Bravo and Unassigned remain 0%. Choose the
   Required Total cell and require one `training-reports/detail` request with `scope=cell&type=<required>` and no `row`,
   the selected outline on that cell and a status line naming its count of affected requirements; choose Alpha ×
   Targeted and require `row=<alpha group>`. Use `Filter by group` for Alpha then Bravo: Alpha's Bottom line is 100% and
   names Alpha as the scope, Bravo's is 0%; each change updates the address bar without a page navigation, and a reload
   of that URL restores the same briefing. Use `Clear filters` between independent cases. Use `Filter by MOS`,
   `Filter by duty role`, `Filter by training type`, `Filter by view` (Focus View orders Targeted before Required and
   hides Optional) and `Filter by rank` (SPC retains all three A People because this fixture has no second rank),
   recording the expected Person/column set before each change. Change `Forecast horizon` to 30 and 180 days and
   `Rows by` to MOS and Duty role; require the horizon date, forecast ticks and grid row labels to follow. For refresh
   failure, arm `training-reports` before changing a filter: require the `Unable to update the briefing` alert with
   `Retry`, the controls back on the briefing still shown, and the previous numbers unchanged. Restore, choose `Retry`
   and require the attempted filters and their briefing. Report-level Retry moves focus to the
   `Training readiness briefing` region while loading and keeps it there after the response, including a no-data result.
   Both Clear filters buttons and export-error Retry use that stable region when their pressed control disappears. The
   normal Export Excel button stays mounted and retains its existing focus behavior. Hovering or activating a Focus link
   after a filter change must avoid a page-data preload; activation still makes exactly one scoped detail request. If
   the user moves focus while the request is held, the response must leave it where they moved it. When a horizon or
   filter change closes a cell detail, or a Focus link replaces it, the old cell must lose both its selected outline and
   selected accessible name. For drill-down failure, arm `training-reports/detail` before choosing a cell: require
   `Unable to load affected soldiers` with `Retry`, restore and retry. Preserve a stale or misleading briefing as a
   failure. After the dated import, Type risk must list Required with Not ready 2 and By-horizon 0 above Targeted with
   Not ready 0 and By-horizon 1, on one shared bar scale. Each Focus link must request `scope=focus&focus=<key>` with no
   record ID in the page URL, and its table count must equal the soldier/requirement facts the area states. The Required
   Total cell's table must list Unassigned (Not Done) first, then Baker (expired, `trainingExpiredExpires`); Able
   Required stays absent because it is ready beyond the horizon.
6. **Actual workbook download and export failure:** Clear report filters and arm `$V export arm PAGE`, then choose
   `Export Excel`. Save the captured Blob using
   `$V export save PAGE .verification/evidence/verify-trooptotask/<run-name>/training-report.xlsx`, restore the capture,
   and inspect each of `$V workbook FILE Summary`, `Forecast`, `Hot spots`, `Focus` and `Requirements`; no other sheet
   may exist. Summary must state the on-screen ready-today and horizon percentages, the Organization goal, the four
   counts and a `Filter: <facet>` row for every filter with its display label. Forecast must have a row for today and
   one per weekly bucket ending on the horizon end, the last one short when the horizon is not a multiple of seven. Hot
   spots must match the grid's rows, Total and drops; Focus must repeat the on-screen sentences and what-if numbers.
   After the dated import, Requirements must hold exactly three rows in this order: Unassigned Required `Not Done`,
   Baker Required expired with `trainingExpiredExpires`, Able Targeted with its literal warning-day label,
   `trainingWarningExpires` and `Yes`; Able Required, Optional and N/A cells are absent, and no Foreign row or type
   appears. Opening a cell's drill-down before exporting must not narrow the workbook. Repeat a filtered Alpha download
   (`Filter by group` Alpha) and require Summary's Group filter `Alpha` and only Able Targeted in Requirements. Arm
   `training-reports/export`, choose `Export Excel` and require visible error with no successful download captured;
   restore and retry visibly. Preserve the workbook file, relevant request status/filename, UI snapshot and inspected
   contents together. A direct export fetch alone does not prove the visible download action.
7. **Dedicated, Group and foreign access:** Use `trainingView` for readable A matrix/report/download without completion
   edit controls; use no-lane `viewer` to attempt the direct Training/report routes and authenticated read/write
   requests. Use `rosterScoped` for Training operate with Personnel none: Alpha/Able is readable and a valid Alpha
   completion write may succeed, but Baker, Unassigned and Foreign reads/writes must be denied or concealed. Use the
   signed-in page's read-only page/report requests to compare the known IDs, then separate valid POST/PUT/DELETE and
   batch probes to `api/personnel-trainings` or `api/personnel-trainings/batch`. Include an assigned Alpha positive and
   denied mixed-Person batch; capture whether the denied batch leaves every requested row unchanged. As
   `trainingForeign`, B's matrix/report contains only B's data; requests for A's Person, type or completion ID must be
   denied with unchanged A rows. Expect authorized-denial status 403 or concealed 404, not payload 400. Save exact row
   readback before/after each mutation probe. A hidden control does not establish server authorization. Keep direct
   HTTP/provider checks distinct from browser interaction and isolated SQL/RLS proof. Group catalog: as
   `trainingScoped`, the matrix Group filter, the report filter and the page's `__data.json` must name only Alpha, and a
   saved Bravo pin must not come back in `pinnedGroups`; `trainingEmpty` must receive no Group IDs or names;
   `trainingView` (Organization-wide) keeps every Group.
8. **Reverse Personnel and Dashboard consumers:** After the dated imports and reload, use `rosterManager` to open
   Able/Baker Details in Personnel. Capture the Training readiness issues against the literal Person/type/date facts:
   Able's Targeted warning is due in `trainingWarningDays`, Baker's Required is overdue, and missing/inapplicable
   requirements retain their separate meaning. As a Personnel reader without Training access, inspect the same readiness
   route to establish that Training facts do not leak through the card. In the authorized detail view arm workbook
   capture, choose Export records and inspect its `Training Records` sheet for type labels, Completed Date, Expiration
   Date and Notes; preserve the same dated rows as a separate Person export, not a report workbook. Open the
   Organization Dashboard with Training read authority and inspect the visible expired/warning identities and any saved
   summary response. Preserve its retained currency meaning without demanding the report's 50% readiness. An Expired
   row's `Record class` saves one completion per checked Person through the same `POST api/personnel-trainings/batch` as
   this page; the new record must show here after reload ([Dashboard actions](dashboard.md#actions)). For Onboarding
   completion references, use `trainingOnboarding`: choose Onboard → Templates → Add Template, enter a unique name and
   Create. Add the first step, name it, choose Training and `Verification Required Training`, then Add Step. Return to
   Onboarding → Start Onboarding, select Able and Start with the default date. After reload, its Required step must be
   complete because the original completion exists. Start Baker after the expired import: its step is also complete
   because this contract checks record existence rather than currency. Start Unassigned: its step remains incomplete.
   The packets remain in progress until explicitly completed. Capture actual start responses and persisted packet/step
   IDs as separate HTTP proof. Cancel each temporary packet through its visible Cancel → Cancel Onboarding confirmation,
   then verify its cancelled entry in History. Delete the temporary template through its visible controls. The app
   retains cancelled packets and pending deletion requests; dispose of those residual rows only with this owned worker's
   cleanup or restart. A closed start dialog, successful type selector or source read does not establish packet creation
   or a completion-driven step. The owned fixture also contains Verification Onboarding A; before each start, visibly
   select this journey's uniquely named temporary template in the Template selector rather than relying on the default.
   The completed seeded Able packet does not block a new start.

9. **Empty scope, pagination and rank boundaries:** Use `trainingEmpty` for a matrix and report with no People; the
   briefing shows the no-applicable-requirements state and visible `Export Excel` is disabled with the reason
   `No personnel to export.` (the matrix button's description; `Export unavailable while loading.` during hydration,
   `No training types to export.` for an empty catalog) because there are no Soldiers. Separately capture the
   authenticated empty export response as API proof, not a visible download. Require exactly the five report sheets,
   zero Soldiers and applicable/ready counts with blank readiness percentages in Summary, the empty-scope Forecast and
   Hot spots Total, the Focus empty-state text, and headers with no data rows in Requirements. Catalog labels may remain
   visible under Training read authority; empty Group scope must not become Organization scope. Separately issue valid
   single and mixed-batch mutation probes and compare every affected A/B row before/after; denied scope leaves rows
   unchanged. With the ordinary three-Person seed, run `seed training-pages`, record its tag/first ID, and reload as
   `trainingConfigure`. There are now 29 A People and 31 required cells: one Current and 30 Not Done before dated
   imports, for 3% readiness. After the two dated imports there are one Current, one Expired, one Expiring and 28 Not
   Done; Current and Expiring are ready, so readiness is 6%. Choose the Required Total cell: the table shows
   `Rows 1–25 of <n>`; choose `Next` (keyboard Enter on the focused button; with two pages focus must then be on enabled
   `Previous`, and Enter on `Previous` must leave it on enabled `Next`, never `body` or the section, including while a
   held `training-reports/detail` response is pending, when focus stays on the pressed button) and require a `page=2`
   detail request, the first page's rows still shown while it loads, then the remaining rows with no omission or
   duplicate across the two pages. Arm `training-reports/detail` before a page change and require
   `Unable to load affected soldiers` while the loaded page stays labeled with its own range; restore and `Retry` loads
   the attempted page. Choose `100` rows per page and require one page from row 1. The workbook's Requirements sheet
   contains every affected requirement regardless of the visible page. PFC selects the 26 temporary People (27 required
   cells, no Current); SPC selects the original three (four required cells, one Current). MOS 68W selects Able,
   Unassigned and the first temporary Person (five required cells, one Current). Alpha selects 27 People (29 required
   cells, one Current). Before `clean-seeds`, finish every comparison that depends on the pagination cohort and every
   other journaled cohort, including their selected reverse consumers, actual workbooks and full saved-row readbacks.
   Restore all controls and changed grants, restore edited original fields and remove UI-created temporary rows through
   their documented app flows. `clean-seeds` is worker-wide: it removes every journaled cohort, not only
   `training-pages`. Capture the complete cohort/row inventory before cleanup, verify all temporary IDs are absent and
   the original fixture rows are unchanged afterward, then reload before using the three-Person expectations. If a later
   selected journey needs a removed cohort, seed it again and record the new bindings. 9a. **Print brief:** Follow the
   dedicated Print A procedure below. Preserve the native invocation separately from PDF capture. The dated three-Person
   briefing and Alpha with an open detail are the short cases. Other pages must print unchanged.
10. **Organization/session timing and multiple tabs:** Use `trainingSwitch` and save its returned `browserContext`; open
    a second native tab in that same context. A has operate controls; B has view access only. Hold a real A
    report/detail response with the documented network helper, change Organization through the visible selector, then
    release and require the loaded B view to retain B identities and permissions after reload. For an A completion write
    held after persistence, use the second tab to select B while the first tab awaits the response. Read back the
    committed A row, release the response, and require both tabs' actual routes to remain scoped with no A record in B.
    Returning to A shows the exact saved ID/values. Sign out visibly while a report response is held, release it, and
    require the signed-out page plus reload to remain at the sign-in gate. Record which tab owns each action and which
    requests actually matched; separate independent browser contexts do not prove shared-session behavior. Restore
    controls and original record fields through the visible app. **Retired completion editor:** In one native tab, first
    visit B then A with `trainingSwitch` so native Back can leave a busy A editor. Create only a temporary Optional
    completion, hold its real `personnel-trainings` response, and require actual A persistence. Use native Back to admit
    B before releasing. B must retain its records and permissions without a late success/error toast or former-editor
    close. Restore the hook, return to A, reload the exact saved row, and remove only that temporary completion through
    configure controls. This single-tab owner-lifetime check does not establish the separate shared-session two-tab
    case. Batch and already-dispatched approval lifetime have dedicated public-context/shared-helper regression checks,
    not a native race matrix.
11. **Never-expiring and raw export collaborators:** When report calculation is affected, create a temporary Required
    type with no expiration, save an Able record with the visible supported values, and require Current after reload
    with no fabricated expiry; missing required records for the other People remain missing. Reuse the
    expiration-only/exemption procedure above to inspect the corresponding report cells and literal totals, then visibly
    remove temporary records/types. For the raw Organization-export seam, use `orgOwner` → Settings → Export, arm Blob
    capture and `network arm-observe` for the selected JSON/Excel endpoint, and use the visible Export JSON/Export Excel
    buttons. Preserve actual artifacts, filename/status and exact Training sections/sheets: stored IDs,
    Organization/Person/type references, timestamps, null dates/Notes/URL, catalog/view fields and saved dated values
    survive. No B facts appear in A. A denied member receives no successful export. Preserve
    Personnel-without-Training's empty Training sheet versus authorized exact dated rows; no privileged bypass is
    permitted.

Restore every network/export control, use `$V rows personnel_trainings orgA|orgB` for narrowly scoped readback, and
clean only this owned disposable worker.

## Verify Print A with a dedicated cohort

Use Node 24 and a private task directory under the home cache for `TMPDIR`. Do not borrow another browser or service
when a dependency fails. Preserve the failing artifact and exact unavailable path.

Run `$V seed training-print` once. Save its returned tag, views, Groups, duty roles, types, dates and expected counts.
The helper journals every intended row before the first provider insert. `clean-seeds` removes every journaled temporary
cohort from this worker's toolkit-owned disposable provider, including Print A and partially inserted cohorts; it also
clears those seed journals. Complete all selected comparisons that depend on any journaled cohort before cleanup,
including pagination and reverse-consumer comparisons when their seeds remain present. Preserve the original fixture
rows separately and compare them before and after cleanup. Do not reset a database. Run
`node --test .agents/skills/verify-trooptotask/helpers/training-print-fixtures.test.mjs` for offline recovery proof.

As `trainingConfigure`, open Reports. Select the returned `Print A Dense <tag>` view, rank PFC, MOS 68V and 90 days.
These filters isolate the new cohort without changing the ordinary fixture expectations. There are 14 named Groups, 14
named duty roles, 24 full-name Training types and eight Soldiers per Group. Type order is the saved view's order. The
first type is Basic Life Support. The final type is Clinical Respiratory Therapy and applies only to the first seven
duty roles. Select `Rows by` Group, then repeat with Duty role for column continuation.

Use these independently counted expectations for the Dense view:

| Measure                                        | Expected                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Unique Soldiers                                | 112                                                                 |
| Applicable requirements                        | 2,632                                                               |
| Ready today                                    | 1,272 of 2,632, 48%                                                 |
| Ready at 90 days if no one renews              | 642 of 2,632, 24%                                                   |
| Drop                                           | 24 percentage points                                                |
| Not recorded, expired, lapsing                 | 730, 630, 630                                                       |
| All affected requirements in Excel             | 1,990                                                               |
| Basic Life Support                             | 112 applicable, 12 ready, 100 not recorded, no forecast lapse       |
| Each of types 2 through 23                     | 112 applicable, 56 ready, 28 missing, 28 expired, 28 lapsing        |
| Final targeted type                            | 56 applicable, 28 ready, 14 missing, 14 expired, 14 lapsing, 56 N/A |
| Soldiers with an already-not-ready requirement | 104                                                                 |
| Soldiers with a lapsing requirement            | 28                                                                  |

For each ordinary type, slots 1 and 2 in every Group are missing. Slots 3 and 4 expired 20 and five days before the
recorded fixture day. Slots 5 and 6 expire 10 and 30 days after that day, then lapse on days 11 and 31. Slots 7 and 8
expire after 120 and 365 days. Basic Life Support is missing for Soldiers 001 through 100 and current for 101
through 112. The targeted type repeats the eight-slot facts only in Groups 01 through 07. Each lapse date loses 315
requirements across all types. These source facts explain the counts without using application calculations as
expectations.

Groups 01 through 07 have 192 applicable requirements, 92 ready today and 46 ready at horizon. Groups 08 through 12 have
184 applicable, 88 ready today and 44 at horizon. Group 13 has 184 applicable, 92 ready today and 48 at horizon. Group
14 has 184 applicable, 96 ready today and 52 at horizon. Printed totals for each Group must retain these counts across
**all** selected types when columns continue on another sheet. The targeted type's last seven Groups are N/A, never 0%
or missing. The ordinary types drop 25 points. Numeric drops and N/A must remain legible without color. Basic Life
Support leads the worst-first type-risk summary.

1. Capture the Dense briefing without opening detail. Run `$V print arm PAGE`, choose the visible `Print brief` button,
   then run `$V print state PAGE`. Record actual `beforeprint` and `afterprint` event counts **before PDF capture**. A
   zero-event click is not invocation proof. Save the rendering with
   `$V print save PAGE <exact loaded report URL> .verification/evidence/verify-trooptotask/<run-name>/dense-letter-on.pdf letter on`.
   Record `$V print state PAGE` again after capture, then restore the observer. Keep the pre-capture button counts
   separate from the browser PDF capture's `beforeprint` and `afterprint` events. PDF events prove the capture
   lifecycle, not a visible print dialog or cancellation. Neither action may fetch a report or detail. Use native
   request observations to establish that boundary.
2. Open Basic Life Support's Total cell. The loaded detail has exactly `Rows 1–25 of 100`. Print and require only those
   25 rows, their scope, page 1 of 4, the exact range, and the explanation that unloaded rows are omitted. Choose Next
   and repeat for rows 26–50. Choose 100 rows per page and print all 100 loaded rows. Inspect every appendix
   continuation and its final row 100. A long appendix may use extra sheets. Repeated headings and scope must identify
   each continuation. Excel still exports all 1,990 affected requirements for the Dense briefing, independent of the
   open cell and loaded page.
3. Open an ordinary type's Total cell to inspect dated rows. Print its 25-row page, then its 84-row page at a 100-row
   page size. Keep canonical not-recorded-first, then expiration-date order. Do not reorder or calculate clinical
   statuses in the print layer. Long names and Group labels must wrap without dropping identities, dates or rows.
4. Arm a fresh observer and exercise the native browser's `Ctrl+p` command separately from the button. Record counts
   before any PDF capture. If a print dialog appears, cancel it, change a filter or detail page, and print again.
   Require fresh loaded data, an unchanged working screen after return, and no extra refetch. In headless Chrome, native
   `Ctrl+p` produces zero events and exposes no OS dialog, and sending Escape afterward does not prove cancellation.
   Record keyboard invocation and live cancellation as **unavailable**, never passed. Retain the pre-PDF button
   observation, browser PDF before/after events, and meaningful `trainingPrintCycle.svelte.test.ts` checks for release,
   fresh capture, duplicate invocation, thrown printing, and disposal. Unit checks complement the unavailable native
   path without replacing it or relaxing the data and lifecycle gates. During a held `training-reports` filter response,
   print the loaded briefing with its canonical filters rather than the attempted selection. Release and print the new
   briefing. Fail the filter request and require the same loaded briefing. During a held or failed
   `training-reports/detail` page request, print the retained loaded page with its own range. For a new scope with no
   loaded page, omit the appendix during loading and after failure. Restore controls and retry explicitly.
5. Repeat a delayed A report or detail case as `trainingSwitch`. Switch to B through the visible Organization selector
   before releasing the A response. B's print must contain only B's loaded report and detail. Repeat after sign-out
   where the parent timing recipe applies. Do not reuse an A capture on a new page instance. Preserve actual matched
   requests and routes.
6. Use the returned Short view with the same PFC and MOS filters. It has 336 applicable requirements, 124 ready today,
   68 ready at horizon, 156 missing, 56 expired, 56 lapsing and 268 affected requirements. Capture a short
   Group-filtered report as well. Use the returned Empty view for 112 Soldiers with no applicable requirements, then
   `trainingEmpty` for an authorized roster with zero Soldiers. Require N/A readiness, useful context and no empty
   appendix. Keep zero Soldiers distinct from zero applicable requirements.
7. Record the Organization's configured readiness goal. Verify that the printed goal, readiness bands and forecast match
   the loaded goal, including a separately authorized visible settings change and restoration. Percentages count
   applicable requirements, never Soldiers. Dates, horizon, loaded filters, type order, focus meaning and the forecast's
   `if no one renews` assumption must survive printing.
8. Capture Letter and A4 landscape with backgrounds on and off. The helper accepts
   `print save PAGE URL FILE.pdf [letter|a4] [on|off]`, defaults to Letter/on, and records those settings. Start once in
   each light and dark theme. Inspect monochrome output separately through the native print dialog or a grayscale view
   of the saved artifact. Record the requested background setting and the actual fills. `print-color-adjust: exact`
   preserves colored fills despite `printBackground: false`, so those captures do not prove that the background
   preference takes effect. A backgrounds-off PDF is not monochrome proof. Keep headings, totals, drop numbers, N/A and
   text legible. Use new artifact names for each capture.
9. Inspect **every PDF page**, including the last table row and every column continuation. Every sheet is landscape (792
   × 612 pt on Letter). Sheet 1 is the brief: `TRAINING READINESS BRIEF`, the Organization,
   `<n> soldiers · as of <day> · forecast through <day> (<n> days) · goal <n>%`, the full filter line, Bottom line
   (ready today → at the horizon, with the requirement counts), the forecast chart, `WHAT · WORST FIRST` with the top
   five types by not ready plus lapsing, and Focus. The matrix sheets follow, titled `Training type by group` (or
   `by duty role`): training types down the side in the selected order, Groups or roles across with `All groups`
   (`All roles`) first and each column's soldier count under its name, and `Not ready` and `Lapse by <day>` requirement
   counts on the right. Columns that do not fit continue on later sheets titled `…, continued`; with the Dense cohort
   below, Rows by Group gives five sheets, `GROUPS 1–7 OF 14` on sheets 2 and 3 and `GROUPS 8–14 OF 14` on sheets 4 and
   5, and Rows by Duty role does the same with `DUTY ROLES`. Each matrix sheet repeats the type labels, the `All`
   column, the count columns, the column headings, the running header
   `AS OF <day> · TO <day> · GOAL <n>% · … · MORE FILTERS ON SHEET 1`, the cell explanation and the `KEY` (tint bands
   from the goal down, bold below the goal, `86▼14` for a drop, `—` where no one requires the type). Types that do not
   fit continue on the next sheet, and the last sheet of each column run closes with `ALL SELECTED TYPES · TODAY` and
   `ALL SELECTED TYPES · BY <day>`. Every sheet ends with
   `TroopToTask · printed from the loaded report · Excel holds every affected requirement` and `Page n of N`. Body text,
   numbers and drops keep their size; the brief uses more sheets instead. Require white margins, useful section
   identity, repeated table headings and context on every sheet. Remove app chrome, actions and pagination. Preserve all
   selected types and Groups or roles exactly once per relevant table. Reject clipped labels, missing final rows,
   header-only fragments and content confined to the screen height. Do not copy the private PDF into source or evidence.

Before `$V clean-seeds`, complete the Print A PDF/workbook comparisons and all other selected comparisons that depend on
every still-journaled cohort, including their selected reverse consumers and exact saved sets. Preserve the complete
pre-cleanup cohort/row inventory. Restore print/export/feedback observers, network and native emulation controls,
changed grants and settings, and edited original fields; remove UI-created temporary records/types/views/templates
through their documented app flows. Run worker-wide `$V clean-seeds` once the dependent comparisons are complete. Verify
every journaled temporary ID is absent, the journals are cleared and the original fixture rows retain their exact saved
fields, then reload before returning to the ordinary three-Person expectations. Cancellation-history and pending-request
rows remain distinct from helper seeds and require the documented owned worker cleanup or restart. Keep fixture setup
and offline recovery tests separate from native UI, actual PDF and independent visual acceptance evidence.

## Gotchas

- An impossible date such as `2025-11-31` in a training cell needs a fix (`Enter a date like 2026-03-11.`) and is not
  sent. X, yes or a check mark never saves today's date: the rail asks once per training column. For an expiration-only
  type the cell date is the expiration date, and the question reads `Expiration date for … X marks`. A status other than
  completed or exempt is refused by the server with `400`. See [Invalid input](invalid-input.md).
- Required Training has three applicable People; Targeted has only Able. Optional records can become Current in the
  matrix while staying outside the report's required-readiness calculation. Do not count N/A as missing. A warning
  record is labeled Expiring, not Current, yet counts as ready in the report's readiness.
- Date examples are relative to the fixture's local day. Record the exact dates and rerun `fixture` after an owned
  restart; avoid comparing a later-day status to an earlier baseline expectation.
- The matrix's Focus View and Group selector control presentation. Clear stale selections before counting all three
  People or all Training columns; configuration and completion permissions remain distinct.
- Import needs permission to record completions: operate-only members see it and viewers do not. Exempt marks also need
  requirement configuration, which the server enforces. Group-scoped configuration keeps Import while catalog edits
  remain denied.
- Save/upsert is keyed by Organization, Person and type; preserve the recorded ID during edits and repeat imports.
  Notes/certificate readback is needed to distinguish a saved update from an unchanged optimistic row. For repeated
  create on an existing Person/Type pair, omitted dates, Notes and Certificate URL preserve saved values; explicit null
  clears supplied fields, with dated expiry calculated from a supplied completion date. Fresh create retains null
  defaults for omitted nullable fields.
- A configure deletion and an operate-only approval request have different outcomes. Capture request status and saved
  rows before interpreting a disappearing modal.
- Select portal options can be absent from accessibility snapshots. Inspect the visible listbox read-only and use
  focused keyboard selection, then capture the resulting selected label or row set. Do not call application handlers.
- Activating the selected Horizon or Rows by button again, by pointer or Space, must leave it pressed (a Rows per page
  radio stays checked) and avoid another request. Choosing a different option still changes the briefing or detail and
  its URL where applicable.
- Endpoint probes need valid fixture IDs and bodies. PUT uses the saved record ID; DELETE uses `{id}`; batch uses
  `{records:[{personnelId,trainingTypeId,completionDate,status:'completed'}]}`. A validation error does not prove scope
  denial.
- Never turn a failed observation into a pass by dropping it. Expiration-only, exemption, warning-yellow boundaries,
  empty-Group isolation, multiple-page UI, multiple tabs and delayed Organization/session switches need explicit
  fixtures and additional proof when affected; unrun paths remain named limitations.
- Focused modal/store/import/report/route tests and `supabase/tests/training_record_lane_scope.sql` complement this map.
  UI/API denial does not substitute for isolated provider/RLS checks, and arithmetic tests do not replace the downloaded
  workbook.

## Viewer day

Launch with `--browser-timezone` chosen per the [skill](../SKILL.md#launch) so the browser day differs from the app's
UTC day, and record both days. As `trainingConfigure`, record a completion for Able whose expiration is the browser day.
Reload, then read the same requirement in the Training matrix, the Training report (`/training/reports`), the Training
table on Able's Personnel Readiness tab and the Dashboard's Training readiness column, where it counts as expiring, not
expired. Every surface must treat it as due on the browser day (for example `0d left`), not expired; on the UTC-behind
zone none may show it as `Expired 1d ago`, and on the UTC-ahead zone none may show `1d left`. The report's `Today ·`
axis label and the exported workbook's name `training-report-<browser day>.xlsx` and `As of` row must carry the browser
day. The report URL must not gain an `asOf` parameter.
