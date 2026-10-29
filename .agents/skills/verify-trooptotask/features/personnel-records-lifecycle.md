# Manage Personnel records

A member creates and edits a Soldier's record, imports a roster that adds new People and updates existing ones, and
archives or restores a record while keeping its identity, permissions and retained history intact.

## Sub-features

- `record-create-edit`: create through Personnel and Onboarding, edit through the roster modal and detail page, cancel
  or recover a failed save, and retain the Person ID through name, rank and Group changes.
- `record-import`: upload a roster workbook with several tabs and a header below a title, confirm the sheets and
  columns, fix a cell inline or answer a rail question once for many rows, skip rows, commit and download the rows not
  imported.
- `record-backfill`: a normalized DoD ID with one active holder wins over name, Group and rank. Otherwise the import
  matches active People by name, uses the Group to break a tie and asks
  `Which person?` when it cannot. Namesakes in one Group always get a question, keyed by the row's rank and with the
  namesake who holds that rank suggested, because a row may be promoting one of them. Only the same name, Group and rank
  share a question. It updates only the fields a row fills and differs on, and shows a replay as Unchanged with nothing
  to save.
- `record-import-group-path`: a Group cell matches a Group's whole name first, then a `/` path from the importer's
  visible roots; a bare name several Groups share asks `Which group?` with each path, and `Create` builds a missing
  path, reusing the Groups that exist.
- `record-archive-restore`: single and bulk archive remove People from active views; restore retains their IDs and
  restores only artifacts archived by that parent event.
- `record-approval`: an operate-only member requests archive approval without archiving the Person; an authorized
  reviewer applies the archive once.
- `record-access`: view, operate, configure, assigned Group, empty Group scope and foreign Organization requests
  preserve their distinct permissions and saved data.
- `record-consumers`: Training, Critical Tasks, Calendar, Onboarding and record exports retain the Person identity and
  their independent access lanes across record changes.
- `record-detail-readiness`: one scoped header lookup supplies the same Person ID to every tab; the Overview's Needs
  attention list and the Readiness tab check each source under its own permission and name a source they could not
  check.
- `record-soldier-data-sheet`: save and reload the Data sheet tab's one form, which writes the Person and the sheet
  together; recover a refused save with both halves unsaved; and preserve unrelated acknowledgement fields.
- `record-loss-acknowledgement`: distinguish detail ETS readiness from global ETS/DEROS losses, and set or clear the
  existing acknowledgement through its authenticated endpoint without inventing a Web toggle.
- `record-retention`: scheduled removal of expired archived parents, complete cascade-file cleanup, retained history,
  scoped counts and truthful failures.
- `record-switching`: Organization changes and late save responses cannot mix A's Personnel or write permissions into B.

## How to get to it (user POV)

Choose `Personnel` in the Organization navigation. Use `Add Person`, a named row (it opens the record) or its
`Quick edit`, or `Import`. The import page steps through File, Columns, Review and Done; browser Back steps back through
them. Archive from the detail page's `More Personnel record` menu or the roster's bulk bar (check a row, then choose
`Archive…`); a row's `Quick edit` has no Archive. An Organization owner/admin restores records through Settings →
`Archives`; archive requests appear under Settings → `Approvals`. The reverse creation path is Onboard →
`Start Onboarding` → `Add Person`.

## Helper controls

`manager` can manage Personnel and Groups; `viewer` can read them; `scoped` sees Alpha only.

`network arm-hold-fail PAGE personnel` holds one exact same-origin Organization A Personnel PUT with a synthetic 503
before dispatch. Other methods, Organizations, origins and endpoints pass through. Release and restore it explicitly;
capture unchanged rows separately from visible delayed-feedback behavior. The
[Personnel lifecycle recipe](personnel-records-lifecycle.md) owns the expected outcomes. This control proves client
response ordering, not a real provider outage.

Synthetic Organizations A/B include active PFC, SPC and SGT rank catalog entries for normal create/import validation.
Personnel lifecycle actors are `personnelOperate`, `personnelScoped`, `personnelScopedOperate`, `personnelEmpty`, and
`personnelSwitch`; they have other feature lanes absent. `personnelScoped` configures only Alpha;
`personnelScopedOperate` operates only Alpha and can create active People through Add Person and Import.
`personnelEmpty` configures an explicit empty Group scope, and `personnelSwitch` configures A but only views B. Use
`manager` for Organization-wide Personnel configuration and `orgOwner` for visible Settings restore/permanent removal.
`actor` accepts `settings/archives`; a configure-only Personnel member has no governance access to this page.

`seed personnel-lifecycle` returns one dedicated Alpha Person, two active same-rank/name People in Alpha/Bravo, an
archived duplicate, and exact artifact/Training/Critical Task IDs. Its fixed older archive timestamp identifies
independently archived artifacts; one unrelated Able note is a no-effect sentinel. Documents have metadata only, without
Storage objects: this seed proves row lifecycle, not downloads or file preservation. `rows` also permits `leader_notes`,
`personnel_follow_ups`, `counseling_records`, and `personnel_documents`, plus `last_name`, `first_name` and `slug`
filters. The existing `network` commands support `personnel`, `personnel/import`, `personnel/archive-batch` and
`personnel/permanent`, still bound to this worker's exact Organization A endpoint. Restore controls, visibly remove
UI-created People and run `clean-seeds`; it removes recorded dependent rows before their seeded parent and preserves
original fixture People. The [Personnel lifecycle recipe](personnel-records-lifecycle.md) owns the actions and
expectations.

`seed personnel-retention` creates two expired A People, recent/active A and recent B sentinels, real PDF objects in
both Personnel document buckets, active/recent/expired child rows and a retained local Evaluation whose four evaluator
references point to the first expired Person. It records every row ID and bucket/path/hash before writes.
`seed personnel-retention-1001` creates 1,001 expired A People with the same bounded sentinels and a few real child
files; setup and cleanup use batches of 100. `seed personnel-retention-dense` adds 1,001 active metadata rows per bucket
to one expired parent, including a real final-page PDF marker in each; the other 1,000 rows per bucket have valid
metadata-only paths with no stored object. This exercises complete cascade retirement within a bounded parent cohort
without thousands of uploads. These are privileged synthetic setup, not UI uploads or ordinary permission proof. Keep
them separate from the accepted metadata-only lifecycle seed. `retention files` inspects only recorded objects,
reporting confirmed absence or downloaded byte size/hash; inspection failures are errors, never absence. `clean-seeds`
removes only recorded rows and objects, including interrupted setup leftovers.

For Personnel proof, use `retention cron missing|wrong|run records`. `records` requests this owned app's
`/api/cleanup-archived-records` endpoint. `records` is the default and arbitrary paths are rejected. Launch generates a
private worker-only credential without inheriting any external secret. The helper records mode, endpoint, status,
redirect location and body without publishing that credential. Missing/wrong credentials must reject without effects.
The admitted request processes all synthetic Organizations using their real settings, so foreign sentinels must also be
unexpired. This is direct job/API proof, separate from native Archives/notification interaction. File cleanup is bounded
to 1,000 keys per pass. When `files.limitReached` is true, repeat admitted passes; it means more work may remain,
including after exactly 1,000 keys. Require a final pass with `limitReached:false`, `failed:0` and exact recorded file
absence before claiming completion. Use fixed-time command/provider checks for cutoff equality and controlled
partial/failure boundaries; do not freeze the app clock or claim browser 503 controls prove provider faults. See the
Personnel recipe for actual visible and persistence observations.

Personnel bulk proof uses `personnel-archive-batch PAGE orgA|orgB JSON_UUID_ARRAY` for one ordinary authenticated HTTP
batch, separately from native roster interaction. Only nonempty UUID arrays and the owned fixture Organizations are
admitted. The `personnel/archive-batch` network family supports failure, rejection, hold, held failure and observation;
every mode matches only the exact A POST and records its public selected IDs/count. Preserve the real response and
per-record outcomes; no helper retries a mutation. Run
`node --test .agents/skills/verify-trooptotask/helpers/deletion-requests.test.mjs .agents/skills/verify-trooptotask/helpers/network-control.test.mjs`
for the control boundaries.

## Driving it with verify:app

Keep actual baseline, failed, final and unrun observations separate in the run evidence. The
[Deletion Requests recipe](deletion-requests.md#driving-it-with-verifyapp) owns the cross-feature bulk
failure/partial/retry and late Organization-switch proof: unconfirmed batches retain selected recovery work,
acknowledged archival/approval IDs are not resent, and failed IDs remain available for explicit retry. Configure
archival and operator approval-required batches remain separate outcomes. The admitted direct archive and its artifact
cascade are one transaction. A rejected transaction has no effects; an unconfirmed reply still requires persisted-state
readback before deliberate replay.

Preconditions: owned launch and `doctor` pass for this checkout; use the index's `WORKER` and `V`. `$V fixture`
identifies Organizations A/B, Alpha/Bravo, original Person IDs and current dates. Run `$V seed personnel-lifecycle` once
and preserve its output: `tag`, `name` (`MapLifecycle<tag>`), `duplicateName` (`MapDuplicate<tag>`), `ids`, and
`archivedAt` (`2026-08-01T12:00:00.000Z`). Its `person` is active Alpha/SPC/Synthetic/68W/Medic; duplicateAlpha and
duplicateBravo share rank/name in different Groups, while archivedDuplicate has the same name and is already archived.
All start with null ETS/DEROS. Do not rename these match fixtures before the import scenario.

The seed's nine artifacts belong to `person`: active/independently archived note, counseling and document;
open/completed/independently archived follow-up. Independently archived rows carry the literal August timestamp. The
completed follow-up retains `completed_at` `2026-09-14T12:00:00.000Z` and null `archived_at`. Seeded Training and
Critical Task completion IDs also belong to that Person. Document rows are metadata only; no Storage object exists, so
this fixture cannot prove file download, upload or deletion. Use valid UI-uploaded synthetic files for an affected file
obligation and keep that proof separate from cascade metadata.

The base fixture retains active PFC/SPC/SGT ranks in A/B and exposes `rankCatalog.activeA` (`VFY-ACTIVE-A`),
`rankCatalog.retiredA` (`VFY-RETIRED-A`) and `rankCatalog.activeB` (`VFY-ONLY-B`), each with ID, Organization and state.
Their IDs are also `rankActiveA`, `rankRetiredA` and `rankActiveB`. Preserve
`$V rows organization_rank_catalog orgA id ID` readbacks for both A rows and the corresponding `orgB` readback for B's
row; all three custom codes are distinct. `onboardingTemplate` and its `onboardingCheckbox` already provide a configured
A template for the reverse creation path. Use these unchanged fixtures rather than creating a prerequisite template or
retiring seeded ranks.

Use `manager` for Personnel configure, `personnelOperate` for Organization A operate, `personnelScoped` for Alpha
configure, `personnelEmpty` for configure with an explicit empty Group set, and `personnelSwitch` for A configure/B
view. `viewer` reads A; `orgOwner` provides the visible Archives, Approvals and Onboarding paths.
`onboardingPersonnelScoped` configures both Personnel and Onboarding only in Alpha. `onboardingPersonnelScopedOperate`
operates both lanes only in Alpha; Onboarding-only actors retain Personnel none. Save each actor's page ID and returned
browser context. Before every denied or failure probe preserve the target rows, including unrelated A/B sentinels; after
the probe read the same IDs and compare explicit submitted fields. `$V rows personnel orgA id ID` and artifact-table
`personnel_id ID` queries provide exact disposable-provider proof, separately from UI interaction.

1. **Create, cancel and failed save:** As `manager`, choose Add Person. Enter a unique `MapCreated<tag>` last name,
   Synthetic first name, active SPC rank, 68W, Medic, Alpha, ETS `2027-05-01` and PCS / DEROS `2027-06-01`. Cancel once
   and require no row with that last name. Reopen, enter the same draft, arm `$V network arm-fail PAGE personnel` and
   submit `Add person`. Save network state, visible error and draft; no matching Person may exist. Restore the hook and
   retry visibly. Require exactly one saved row, capture its ID/slug/Group ID and reopen after reload with the submitted
   values. A closed dialog or success toast alone is insufficient. Independently prove required rank/name validation
   without a saved row. Duplicate names are supported: a deliberate second create may get another ID and distinct slug;
   create/import are not same-ID upserts.
2. **Roster and detail edits:** Edit that created row from the roster. Change Duty Role and dates, save and reload; ID
   and Organization remain unchanged. Cancel another draft and require unchanged storage. Open Details → Data sheet →
   Edit, change last name to `MapRenamed<tag>`, select Bravo and Save changes. Require the same Person ID, Bravo Group
   ID, new name/slug and navigation to the new detail URL; reload that URL. Arm a `personnel/PERSON_ID/data-sheet`
   failure before a later save: retain entered values and useful error (shown in the record header beside
   `Save changes`, with focus moved to it, or on the first named field when the server names one), compare unchanged
   saved fields, restore and retry. Save only a blood type from Data sheet → Edit on a Person whose slug carries a
   collision suffix or an older pattern, and require the slug unchanged and the original URL to still open. For a
   same-slug save, clear ETS and change PCS / DEROS without changing the name. Require the Readiness tab's Loss block to
   show ETS `None on file` immediately after Save, before any manual reload. Change Duty Role in another same-slug save
   and require both the detail fields and separate page header to refresh. Clear both dates through the visible fields
   and require null ETS/DEROS after reload. Existing retired ranks may remain on an edit; changing to a retired rank or
   using it for create is denied. If exercising catalog retirement, create/retire only a temporary rank through owner
   Settings and restore its state afterward; do not change seeded catalog rows merely to satisfy this recipe.
3. **Onboarding create reverse caller:** As orgOwner, navigate to Onboard and confirm the seeded A template/step
   prerequisite is loaded. Open Start Onboarding → Add Person → Rank. Require PFC/SPC/SGT and
   `rankCatalog.activeA.code`; A's retired code and B's active-only code must be absent. Explicitly select the custom
   active A code and enter a unique `MapOnboard<tag>` Person with Alpha, 68W, Medic and known dates. Save, require the
   new Person to become selected in the outer Member control, capture its saved ID, and reload Personnel to confirm that
   same ID, literal catalog code, Group and dates. Repeat the Add Person path as `onboardingPersonnelScopedOperate`:
   only Alpha is offered, without Bravo or `No group`; the active Person persists after reload and is selected in Member
   after Save. Cancel the draft without starting a packet. If no ranks can be selected, record the concrete failure and
   no-effect readback; do not bypass it with an API create or count the roster create as Onboarding proof. As
   `onboardingOperate` (Personnel none), load Onboard and open Start Onboarding: existing A People must remain
   selectable while Add Person is absent. Cancel without a packet write. Separately send a valid authenticated Personnel
   create through that actor's ordinary session using A's active rank, Alpha and a unique `MapDeniedOnboard<tag>` name;
   require HTTP 403 and no matching Person, comparing the preserved A/B rows. That request establishes denial separately
   from the visible affordance. When a change touches packet attachment, start the newly created Person and reload its
   saved packet; cancel it visibly afterward. Reuse the seeded template without deleting it. If an owned run truly lacks
   configured steps, create one temporary template/checkbox step visibly, record this prerequisite change and delete
   only that temporary template afterward. A rank-only bootstrap read failure must retain existing Onboarding data and
   Member selection, show a clear reload message and disable only Add Person. Establish that provider-fault and rendered
   interaction boundary with focused checks; the browser write-network control does not inject a server-side catalog
   read failure and earns no native outage credit. The [onboarding packets recipe](onboarding-packets.md) owns the
   broader packet/step/history lifecycle. Repeat the shared creation form as `onboardingPersonnelScoped`: Add Person
   must be available, active A ranks selectable, and Alpha the only permitted Group. No Group Assigned and clearing are
   unavailable; saving requires explicit Alpha selection. Create a unique Person, require it selected in the outer
   Member control and read the exact saved ID/Group after reload, then cancel the outer dialog without a packet write.
   As `personnelScoped`, independently exercise Personnel → Add Person with the same Group restrictions.
   `personnelEmpty` has no Add Person control. For hidden URL collision proof, first create a unique Bravo Person
   through manager UI, then create the same name in Alpha as the scoped actor: distinct IDs and sequential unique slugs
   must persist without showing the Bravo row. Repeat a scoped rename to a different hidden Bravo name when the update
   slug path changes. Direct authenticated requests establish server/provider behavior separately from these UI actions.
4. **Roster import: sheets, columns, review and commit.** Build a synthetic workbook with exceljs, replacing TAG with
   the seed tag. A `Cover` sheet holds two lines of prose. Sheets `1st PLT`, `2nd PLT` and `HQ` each have a title row
   and an `UNCLASSIFIED` banner above a header on row 3: `Rank, Name, MOS, Duty Position, PLT, ETS, DEROS, DOD ID`, with
   Name written `Last, First`. A hidden `Lookups` sheet lists ranks. `1st PLT` holds `Sgt.` on three new People, the
   unknown Group `1st PLT`, the impossible ETS `2027-02-30`, the military date `15MAR28`, a middle initial
   (`ImportTAGB, Jae M.`) and the same new Person twice. `2nd PLT` holds the seed's dedicated Person and `Baker` with
   new ETS dates, and the seed duplicate name with no Group. `HQ` holds one `SSG` row, a rank outside the catalog, and
   one clean row, both in Alpha. Leave DOD ID blank for this workbook; exercise IDs separately below. Upload it as
   `manager` on `Drop a spreadsheet here`.

   Columns: `Read sheets` checks the three roster tabs. `Cover` reads `No recognizable header in the first 15 rows` and
   `Lookups` reads `Hidden in Excel`; both stay unchecked. The summary reads `3 sheets read · 11 rows`. The preview
   marks row 3 `Header`, hatches the two rows above it and maps Name to `Last, First`, PLT to Group, Duty Position to
   Duty role, DEROS to PCS / DEROS and DOD ID to DoD ID. The footer reports all eight columns used.
   `Use row 4 as the header` unmaps every column, shows
   `Map a column to Last name on every included sheet.` and disables Review; `Use row 3 as the header` restores the
   mapping. Set `Import Duty Position as` to `Don't import` and back, and require the footer to follow. Nothing is
   written before the commit.

   Review (`Review 11 rows`) reads `All · 11`, `Needs a fix · 8`, `New · 1` and `Update · 2`. The rail asks
   `Unknown rank` for `"Sgt."` (3 rows) with SGT preselected, `Unknown group` for `"1st PLT"` (6 rows) with
   `Create "1st PLT"`, `Which person?` for the seed duplicate with its Alpha and Bravo People and `Add as a new person`,
   and `Unknown rank` for `"SSG"`. A problem cell is a textbox with `aria-invalid="true"` described by the row's message
   line, such as `ETS: Enter a valid date.` Each row's header names the Person (`Last, First`) above its outcome and
   `sheet · row`, and a date cell shows the date that will be saved, `2028-03-15` for `15MAR28`. Apply SGT once and all
   three cells clear and show `SGT`, not `Sgt.`; a Group typed `alpha` shows `Alpha`. Create the Group: the name field
   takes focus, `Create group` saves one `groups` row (read it back) and all six rows take it. The in-file duplicate
   then shows on both rows as `Same record as row N on 1st PLT. Skip one of these rows.` Fill the bad ETS cell with
   `2027-02-28` and press Enter: the row turns New and focus moves to the next problem cell. Escape reverts a draft and
   blur commits it. Skip the second duplicate; the row offers Undo and keeps focus on it. Pick the Bravo duplicate.
   Choose `Skip 1 row` on the SSG question: that row offers `Change skip for … in the fix rail` instead of Undo, which
   moves focus to the SSG question; `Change` there and map SSG to SGT. `Import 10 changes` (`7 added · 3 updated`) stays
   disabled while any row waits for a fix.

   The commit sends one `POST api/personnel/import`, then refreshes the roster workspace and import page's ID list.
   Done reads
   `10 changes saved.` with Added 7, Updated 3 and Skipped 1 and no zero counts, and lists the skipped row as
   `1st PLT · row 9` with `You skipped this row.` Capture `Download these rows (.xlsx)` with `$V export`: one sheet
   named `1st PLT` with the original columns, DOD ID included, plus `Reason`. Read the rows back. Seven new People have
   SGT for both `Sgt.` and `SSG`, `2028-03-15` from `15MAR28`, first name `Jae` without the initial, `2027-02-28` for
   the corrected date and the new Group. The dedicated Person and Baker changed only ETS, only the Bravo duplicate got
   `2027-07-01`, and the Alpha and archived duplicates are unchanged.

   **Group paths.** After the [Group tree](manage-groups.md#group-tree) steps plus a moved `2nd Squad` and a
   `3rd Platoon › Weapons Squad`, upload a one-sheet workbook (`Rank, Last Name, First Name, MOS, Group`) whose Group
   cells are `2nd Platoon / 2nd Squad / Bravo Team`, `Alpha Team`, `2nd Platoon / 3rd Squad / Charlie Team` and
   `Weapons Squad`. Review reads `All · 4`, `Needs a fix · 2`, `New · 2`: the path and the unique bare name are New and
   show `2nd Platoon / 2nd Squad / Bravo Team` and `3rd Platoon / Weapons Squad`. The rail asks `Which group?` for
   `"Alpha Team"` with the radios `2nd Platoon / 2nd Squad / Alpha Team` and `3rd Platoon / 1st Squad / Alpha Team`,
   and `Unknown group` for the Charlie path with `Create "2nd Platoon / 3rd Squad / Charlie Team"`. Apply the 2nd
   Platoon path; `Create group` with the prefilled path saves `3rd Squad` (depth 2 under 2nd Platoon) and
   `Charlie Team` (depth 3 under it) and no second 2nd Platoon. `Import 4 changes` (`4 added · 0 updated`) saves each
   Person in the Group its path names. A path deeper than three levels is refused with
   `Groups can nest at most three levels deep.`

   Re-import the same file and give the same answers. Once the second duplicate is skipped again, the other ten rows
   read Unchanged behind `10 rows already match. Nothing to save.` and `Show`, `Import 0 changes` stays disabled, and
   the active roster keeps the same count and IDs with no duplicate.

   DoD ID: use only synthetic `0123456789` and `0000000001` through `0000000004`. As `personnelOperate`, import a
   new Alpha Person with `EDIPI` as the header and `012-345 6789` as its value. Columns maps it to DoD ID; Review
   includes normalized `0123456789`, and commit saves that ID. Open the Person's Data sheet and reload to confirm
   the leading zero and saved Person ID. Fill an unrelated Data sheet field, then import an ID-only change to
   `0000000001`; Review shows the old and new IDs, and the saved sheet retains the unrelated field. Import equal
   and blank IDs separately: an otherwise equal row is Unchanged, and a blank never clears the saved ID.

   Import that saved ID with a different name, Group and rank: matching still chooses the same active Person,
   and any filled Group/rank changes remain visible for review. Skip this row after observing its target if those
   changes are not wanted. Repeat the column mapping with `DoD ID number` and `EDIPI number`. An invalid ID such
   as `short` shows a DoD ID problem that can be corrected inline before saving. As `manager`, give the archived
   duplicate `0000000002` on its Data sheet before archiving it. Import that ID against a new or another existing
   Person: Review needs a fix and names the Organization-wide conflict. Archived People keep their IDs reserved.

   In a file with two different new People using free `0000000003`, commit saves the first and rejects the second
   through the normal failed-row receipt. Read both names back to prove that only the first Person exists. As an
   Alpha-scoped operator, import an ID already held in Bravo, including an archived holder. The row fails before
   creating or updating a Person. Its guidance explains that the holder is outside the Groups you can manage and
   says to ask an Organization admin to move that Soldier, then import again. The response never identifies the
   holder. Read the submitted names and update target back to prove no write. The server checks only IDs supplied in
   this batch across the Organization; its visible ID list stays Group-scoped.
   Server tests separately cover a race after that check: if the Person write succeeds but the ID write conflicts,
   the receipt says the Person was saved but the DoD ID was not. Keep that Person and its other saved fields.
   Repeat an import with a DoD ID from Your unit, Personnel to prove the setup lane loads the same visible IDs.
   Commit it and wait 4 seconds: the Done receipt stays with its counts and failed-row reasons while the step
   refreshes, and browser Back and Forward still step through Review, Columns and File before the commit.

   Import `Rank, Last name, First name, Group` with one new name twice, once in Alpha and once in Bravo: both rows read
   New and save as two People. Import `Last name, First name` with a new name: Review adds a Rank column whose cell on
   that row is an editor described by `Rank is needed for a new person.`, and `PFC` with Enter turns the row New. As
   `personnelScopedOperate`, a file without a Group column shows a Group editor the same way.

   Separately seed `duplicate-able`, which adds a PFC namesake beside the original SPC Able in Alpha, and reload. Import
   `Last name,First name,Group,Rank,MOS` with `Able,Synthetic,Alpha,SPC,25B` and `Able,Synthetic,Alpha,PFC,11B`. Each
   row asks `Which person?` with the namesake of that rank suggested. Apply both suggestions; the rows read Update and
   their MOS changes belong to their respective saved IDs. Before saving, replace the file with
   `Last name,First name,Group,Rank` and the rows `Able,Synthetic,Alpha,SGT` and `Able,Synthetic,Alpha,VFY-ACTIVE-A`.
   Neither rank settles the tie, so two separate `Which person?` questions each apply to one row. Answer the first with
   SPC Able and the second with PFC Able. Both rows read Update without an in-file duplicate error. Two rows with the
   same name, Group and unresolved rank share one question and still receive the in-file duplicate error if mapped to
   the same saved Person.

   Arm `network arm-fail PAGE personnel/import` before a commit: Done reports `0 changes saved.`,
   `The last batch was not confirmed` and a `Not confirmed` count with `Check the roster before importing these again.`,
   beside the Unchanged and Skipped counts; every sent row counts as not imported and no Person changes. Restore, choose
   `Import another file` and import again.

   A committed write whose provider reply is lost needs separate lower-level proof. The Personnel server, route and
   import-lane regression tests preserve the structured `unconfirmed` error. With 501 planned rows and an uncertain
   first chunk, require Not confirmed 500, Not attempted 1 and no second request. The pre-dispatch network control above
   does not establish provider-response loss.

   A mixed first chunk keeps each confirmed save and known failure. With one confirmed update, one unconfirmed create,
   one known failure and 497 confirmed creates, require Updated 1, Added 497, Failed 1, Not confirmed 1 and Not
   attempted 1. No second request runs. The not-imported workbook contains only the unconfirmed, failed and unsent rows,
   with each row's reason. The confirmed update stays out of that workbook.

   Repeat as `personnelOperate`: Add Person and Import are reachable without Manage Groups. An unknown Group offers the
   existing Groups and `No group` with no Create. `personnelScopedOperate` sees only Alpha and no `No group`, so a new
   Person needs Alpha.

5. **History, leaving, loading and widths.** Back from Review returns to Columns and then File with the file kept;
   Forward returns to Columns. With a file chosen, a link out asks `Leave this import?`: `Keep importing` stays and
   `Leave import` follows the link. While Import is saving, links, Back and the Organization switcher do nothing. As
   `personnelSwitch` with `network arm-hold PAGE personnel/import 2` on the 5,000-row file, choosing Organization B
   leaves the page on A. After `network release` every batch finishes in A and Done shows there; B then opens with no
   import state and no new B rows. Reload asks the browser's leave prompt and starts at File, and Back into an earlier
   import entry also shows File. `$V server-source arm status_types hold 1 60000` holds the Personnel workspace: the
   header and stepper stay, the File step shows a skeleton of the same layout, and the drop zone arrives at the same
   position (y 176 px, 256 px tall at 1440). `server-source arm status_types fail-hard 1` shows the shared
   `Unable to load Personnel` alert, and `Retry Personnel` recovers after restore. At 1280 px and wider the Review grid
   fits every default column beside the rail, Person first; a narrower grid scrolls sideways under the sticky Person
   column. Below 1024 px the rail stacks above the rows in focus order, and at 390 the rows become cards. No width
   scrolls the page sideways.
6. **Single archive, exact cascade and visible restore:** Preserve parent and all nine artifact rows. As manager,
   archive the dedicated parent from its detail page's `More Personnel record` → `Archive` and confirm Archive
   Personnel. A pre-request `personnel` failure must leave parent/artifacts unchanged with useful feedback; restore and
   retry. Capture absence from active Personnel after reload and the saved parent timestamp T. Active
   note/counseling/document and followOpen must now have archived_at exactly T; followOpen becomes archived.
   noteArchived/counselingArchived/documentArchived/followArchived keep the literal August timestamp; followCompleted
   remains completed with its original completed_at and null archived_at. IDs, Person references and unrelated rows stay
   unchanged. As orgOwner, open Settings → Archives, locate this parent and Restore. Require absence from Archives and
   return to the active roster after reload, original ID/slug/rank/Group/dates, null parent/archive-owned artifact
   timestamps and open followOpen. Independently archived rows stay archived; followCompleted stays completed. A
   repeated restore of an active Person may reject with 400 and must change no row. Separately replay the authorized
   single archive request before restore: it must not replace the original event timestamp or strand the earlier cascade
   on restore. A changed timestamp or stranded artifact is a failure. This API replay is not another UI archive journey.
7. **Other archive entry points, bulk and approval:** On separate temporary People, exercise the roster bulk bar's
   `Archive…` with one row selected and detail → `More Personnel record` → Archive, confirming saved absence after
   reload. For bulk, restore the dedicated parent first and select it plus duplicateAlpha through the roster bulk bar's
   `Archive…`. Require both IDs archived, one shared parent-event timestamp and the same nine-artifact expectations;
   restore each through Archives. Include a denied/missing candidate separately and capture the actual per-row result
   and every changed/unchanged row; do not assume a partially successful batch is atomic. An authorized replay
   acknowledges already-archived People and completes only their still-active artifacts under each saved parent
   timestamp; independently archived siblings retain their own timestamps. Replay the same IDs through the ordinary
   authenticated batch endpoint and compare every parent/artifact field. An operate-only requester must not repair an
   archived Person’s artifacts or create another approval request. Separately reject a later-parent or late-artifact
   write in the actual database transaction. Require zero changes from that command, then explicitly retry. Existing
   archived parents retain their saved event; newly archived People use the new request’s timestamp. Seed a separate
   historical partial state at the SQL boundary and require replay to finish only its remaining eligible artifacts.
   Healthy direct bulk uses one scoped candidate read and one command for admitted IDs; set-based children use each
   parent’s saved event, including mixed historical timestamps. These controlled faults are SQL proof, not native
   partial-provider failure. Restore must commit event-owned children and the parent clear together; controlled child
   and final-parent-clear failures must roll back, and explicit retry must preserve independently archived/completed
   history. A pre-request UI failure proves its own no-effect/draft/retry behavior and cannot establish these
   partial-persistence cases. As personnelOperate, archive a separate temporary Person. A 202 requiresApproval response
   must leave the Person active, then create one pending archival request. Repeat submission and require no duplicate
   pending request. Fail `deletion-requests` before submission to prove useful error, no pending row and unchanged
   Person, then restore/retry. As orgOwner, Approvals → the exact request → Approve; require approved request and that
   same Person archived after reload. A rejected approval transaction must preserve the pending request, Person and
   every artifact; an unknown acknowledgement must not be described as rollback. The
   [Deletion Requests recipe](deletion-requests.md) owns broader request review; this recipe checks its Personnel
   effect. Repeat request failure/retry and pending-request replay from the roster bulk bar's `Archive…` with one row
   selected, using a distinct temporary Person. An operate-only actor cannot normally enter the sensitive detail page:
   capture that denial separately; do not relax permissions to manufacture a detail approval journey. Preserve the
   detail caller’s approval-result handling with focused lower-level checks if its seam changes. In the bulk bar a
   failed archive or approval submission keeps the Person selected with an error toast and must not claim success;
   restore the hook and retry, and a successful archive or accepted/pending approval drops that Person from the
   selection. Capture the actual 202 followed by approval 503/200/409 and exact Person/request readbacks separately. For
   detail, use a configure actor for direct archive failure/retry; reopen the confirmation after failure if it closes
   and verify the unchanged active Person before retry. A permission change while detail is already open needs separate
   controlled proof and is not established by the ordinary operate actor’s denied navigation. No unsaved detail draft is
   implied by its archive confirmation. **Permanent removal:** As orgOwner, Settings → Archives → the helper-seeded
   archivedDuplicate → Delete. A wrong confirmation name must keep `Delete permanently` disabled; Cancel changes no row.
   Reopen, type its exact displayed name, arm `personnel/permanent` failure and submit: useful error, unchanged archived
   Person and artifacts, and no success claim. Restore and retry visibly; require HTTP 200, removal from Archives and
   exact saved-ID absence after reload. A Person still picked for a Calendar Tasking is refused: `Delete permanently`
   answers 409, the dialog stays, the toast reads
   `NAME is picked for “TITLE”. Remove them from that tasking before deleting.` and the archived row remains (see
   [Events & Taskings](events-taskings.md) Staffing step 11). Preserve all other A/B People and the independent history
   sentinels. Metadata-only documents establish no Storage-byte deletion. Keep the command’s delete → success audit →
   awaited notification → response ordering and notification-failure effects under focused lower-level proof; a
   pre-request browser 503 cannot establish provider or notification failure. Use only helper-created temporary People
   for this destructive journey. After a successful `Delete permanently`, focus moves to the next row's first action,
   else the previous row's, else the `Archived people` heading; never `body`.
8. **Denied capability, Group, empty and foreign scope:** Viewer has no create/edit/import/direct-archive/restore
   controls; attempt valid authenticated writes to establish 403 or concealed 404 with no effect. personnelOperate can
   create active People, update and import but cannot directly archive, restore or permanently delete.
   `personnelScopedOperate` sees Add Person below 1024 px and at 390 px; its Group list contains only Alpha. Save an
   Alpha/SPC Person, reload and compare the same ID, Group and rank. Authenticated create requests for Bravo and no
   Group return 403 with no matching saved Person. `personnelScoped` can create/edit Alpha and import Alpha; Bravo,
   unassigned and foreign Person writes and Group reassignment are denied, while mixed import may save authorized rows
   and report rejected rows. Probe same-Organization POST/PUT with a foreign Group ID too: a foreign Group must never
   become a saved reference. Foreign and nonexistent valid Group IDs must produce the same concealed failure before any
   fields change; compare ID/slug/dates and success-audit absence. A valid same-Organization reassignment and null/empty
   unassignment must retain the Person identity and dates after reload. An update omitting Group preserves its
   reference; a historical foreign reference is retained for review rather than silently repaired, and explicitly
   resubmitting it is rejected. Isolated populated-upgrade/provider proof must preserve these historical rows and
   conceal their foreign Group labels; it does not authorize altering production data. personnelEmpty sees no roster
   People and cannot create/update/import/archive/restore any Person; an empty set never becomes Organization scope. The
   authenticated archive/restore RPCs must give restricted and empty-scope configurers the same concealed not-found
   response for a hidden Person and a nonexistent valid ID, with every row unchanged. `personnel_lifecycle_atomic.sql`
   owns that comparison; `personnel_lifecycle_concurrency.sql` separately proves Group moves and authority loss during
   actual waits. Include valid single and bulk payloads for denied targets and compare exact A/B rows. A 400 from
   invalid input does not prove authorization. Match responses that intentionally report per-row missing/denied records
   to no unauthorized effects; they need not all be whole-request 403. Detail/page-data requests must not disclose
   out-of-scope names/IDs. Isolated `feature_direct_write_authority.sql` proof shows a direct operate write cannot
   archive, restore or permanently delete a Person, and permanent deletion needs configure on an already archived
   Person. Keep API checks distinct from UI observations and isolated SQL/RLS proof. For a Group-reference change, also
   use the manage-groups recipe to create a temporary Group and a temporary Person assigned to it. Preserve the Person
   ID, slug and dates, delete the Group visibly, then reload Personnel/detail and require the same Person with an empty
   Group and all other fields retained. Recheck independent Calendar, Training, Critical Tasks, Onboarding and fresh
   Sign-In Roster labels with valid and unassigned People. Isolated upgrade SQL covers active/archived unassignment and
   atomic rejection of a Group deletion referenced by historical foreign Personnel; actual PostgREST reads cover
   old-client schema compatibility and concealment without rewriting those rows. Keep those provider results distinct
   from fresh-database UI evidence.

9. **Retained consumers and exports:** Before archive, after archive and after restore, reload Training as trainingView,
   Critical Tasks as ictViewer and Calendar as calendarView. The dedicated Person's saved ID is visible in active views
   only when active; its seeded Training/ICT completion IDs and dates remain stored throughout. Use authorized history
   routes to establish retained archived history where supported; changing Personnel must not grant these actors
   sensitive Personnel access. Onboarding must read the same active Person identity; any existing packet/history
   reference stays bound to it. As orgOwner/manager, arm real workbook capture on the named Person's Export records
   action and inspect the saved workbook for submitted Personnel fields and permitted Training history; the August
   document metadata proves no file bytes. While the dedicated Person is archived, open Settings → Archives as orgOwner,
   arm `$V export arm PAGE`, choose that row's `Export`, then save and inspect the captured `<name>-records.xlsx`
   workbook for the same Personnel fields. Organization export, retention and artifact file lifecycle have their own
   recipes; a change affecting them reverifies its call there. Use the existing Training/Critical Task/Calendar recipes
   for their independently specified readiness/report meanings rather than inventing new percentages for the expanded
   Personnel seed.
10. **Organization switching and held saves:** As personnelSwitch, inspect A configure controls and seed names, then
    Switch organization → Verification Organization B. B shows Foreign and no A People; view-only B has no mutation
    controls. Return to A and arm `network arm-hold PAGE personnel` for a temporary Person edit. Submit, require network
    state to record a real successful A response held after persistence, and read back its saved A ID/values. If the
    pending modal permits switching, use the visible switcher; otherwise prepare B as the preceding history entry and
    use native browser History Back to B, recording the blocked menu separately. Capture B before and after release: no
    A Person/draft/feedback may enter B, and B row readback stays unchanged. Restore the hook and return to A to reload
    the saved edit. Repeat with `network arm-hold-fail PAGE personnel`: this control holds one same-origin A PUT503
    before dispatch. Preserve full A/B rows before the action, admit B before release, and require no stale
    success/error feedback, no modal close in B and unchanged complete A/B rows. Restore the hook and explicitly retry a
    fresh current A edit; require one saved value and reload it. A hook lost during full navigation is unavailable
    ordering proof, not success. Also open a native second tab with the returned browserContext, switch its shared
    session to B while the first tab awaits an A save, then release. Record each actual route: a tab still on A may show
    its permitted saved A record, while a B tab must show only B and view permissions. Separate isolated actor contexts
    do not establish shared-session behavior. No supported read-response control is implied by the write endpoint
    families; add scoped read controls only when an affected read-ordering obligation requires them.

11. **Scheduled parent retention:** Use a fresh owned worker and `seed personnel-retention`; preserve its exact IDs,
    object manifests, dates and hashes. As orgOwner, Settings → Archives must show both expired A People and the recent
    A sentinel. Capture native before snapshots and screenshot; inspect the dedicated archived Person detail where
    reachable. `retention files` must show every recorded real object with its expected byte size/hash.
    Missing/wrong-secret `retention cron` requests must return 401 and preserve exact A/B rows and objects; these direct
    job requests are not UI clicks. The admitted `run` request must delete expired A parents, cascade all their
    active/recent children, and remove both buckets' objects for deleted child/parent rows while retaining recent/active
    A, recent B and unrelated file sentinels. Independently archived expired children are cleaned by the earlier
    artifact families, so their counts remain separate from the parent count. Read the same saved IDs again, including
    the local Evaluation: all four evaluator IDs clear and its update timestamp advances monotonically, while every
    other Evaluation field and retained name/date stays unchanged. Capture the actual count-only administrator
    notification without Person names. Reload Archives natively and require both expired names absent and the recent
    sentinel still visible; inspect notification persistence. A second real job call reports zero new deletions and
    changes no retained row/object. Separately, use a fresh `personnel-retention-1001` setup for the provider-sized
    boundary. The operation must complete 1,001 expired parents with the exact count, bounded candidate URLs and one
    atomic parent deletion. Compare independently paginated candidate/remaining IDs and recorded objects with the actual
    job result; capture any failed request, its sanitized status and URL byte length. Exercise missing/wrong-secret
    admission on the supported cron route, then an admitted run and zero-effect retry. Separately use
    `personnel-retention-dense` to prove cascades and transactional file retirement cover more than 1,000 child rows:
    all saved child rows must cascade and every retired key must remain recoverable. Each maintenance pass drains at
    most 1,000 keys. Repeat admitted passes until `files.limitReached` is false and `files.failed` is zero, then require
    the final-page real PDF marker in each bucket absent and retained sentinel hashes unchanged. The limit flag says
    another pass may be needed; a false flag with failures is not completion. No single-page count or in-memory test
    establishes this boundary. Fixed-time command tests cover strict cutoff equality, Organization predicates,
    controlled partial/zero deletion, candidate-read/delete/Storage failures and no false success summary. Controlled
    provider tests must read actual rows/files after each fault and identify the injected boundary. Keep legacy
    Evaluation proof separately identified: the parent RPC requires fresh isolated replay/grant/cutoff/count checks and
    populated upgrade preserving the legitimate historical evaluator fixtures. Include a mixed parent batch with one
    freely deletable parent and one historical foreign-reference blocker: the deferred database/actual PostgREST
    rejection must preserve both parents and all child/Evaluation fields. Do not bypass constraints in the browser
    worker. A deletion blocked by historical foreign references must preserve the parent, its children and files,
    although earlier retention families may have already completed. Run final `doctor` and clean recorded seeds/files.

### Detail, Data sheet and loss baseline

These scenarios extend the lifecycle fixture above. Use a dedicated `personnel-lifecycle` parent and capture its Person,
artifact and `personnel_extended_info` rows before changes. Preserve stable ID, Organization, Group, rank and name
across every edit. A save keeps the stored slug unless it changes the first or last name; only a name change regenerates
it. Do not change original fixture records merely to populate the detail screen. Record native interactions separately
from authenticated HTTP/provider checks and lower-level deferred/rejected-lane tests.

1. **Header and readiness sources:** As orgOwner, open the dedicated Person's Details and reload. Capture the record
   header (Group and duty role eyebrow, `RANK FIRST LAST` title, MOS badge and title, time in service and grade against
   the viewer's day, and today's availability pill), the settled Overview ([Personnel Overview](personnel-overview.md))
   and Readiness tab, and navigation through Overview, Readiness, Log, Files, Data sheet and Archived, including a
   direct URL to each. The breadcrumb leaf reads `Last, First`. Each tab must keep the same parent Person ID. Header
   admission requires Personnel operate; the dashboard and sensitive artifact reads require configure. Repeat
   manager/configure-only, Alpha-scoped, Bravo denial, empty-scope and foreign-Organization cases with exact
   before/after rows. Configure-only may see `Couldn't check <source>` for foreign-feature sources while the loss check
   still runs; this is permission isolation, not a provider outage. Use `seed rating-scheme` for actual ID-linked rater,
   trimmed free-text evaluator, active entries and completed history examples; preserve its literal entries and do not
   count seed creation as UI interaction. If two candidate entries both produce Aligned, that visible result cannot
   establish which entry was selected; newest noncompleted selection requires the meaningful fixed-date operation tests.
   A denied streamed page may return HTML 200 while its public data error and rendered screen conceal the header with
   403/404; record those separate boundaries instead of assuming the HTML status. Independently owned Training and
   Critical Tasks retain their authorized Person callbacks. Streamed loading/rejection and provider failures require
   focused callback/component proof when no browser selector reaches that server read; record those paths as
   lower-level-only rather than a native fault pass.
2. **Data sheet save, cancel, error and retry:** Open Details → Data sheet and read every section (an empty value reads
   `Not set`; the footer names the last saver). Choose Edit in the header: the tab becomes one form, the other tabs dim,
   and the header shows `N unsaved changes`, Cancel and Save changes. Fill known synthetic values for blood type, BASD,
   date of rank, marital status, dependents, children (one `Name, age` and one name without age), civilian/military
   education, emergency/spouse contacts, vehicle, personal email/phone and all four address fields. Cancel one draft: it
   asks to discard, Escape asks instead of discarding, and leaving through the sidebar or browser Back asks too; require
   no row change after discarding. Reopen, arm `$V network arm-fail PAGE personnel/PERSON_ID/data-sheet`, submit Save
   changes and preserve the useful error, retained form values, network state and unchanged full row. Restore the
   control and retry through Save changes. For a refusal, enter a changed MOS and an invalid personal email: the email
   shows its message inline, focus moves to it, and both the Person row and the sheet row stay unchanged. The Identity
   section's `DoD ID` input (mono, numeric keyboard) refuses `12345` with `Enter a 10-digit DoD ID` beside it, `aria-invalid`
   and focus; `0123456789` saves, the read view's Identity section shows it in mono, and the record heading reads
   `SPC SYNTHETIC ABLE (0123456789)` with the ID muted, mono and not uppercased while the tab title stays
   `SPC Able, Synthetic - Personnel`. A name that wraps at 390 px keeps the ID on its own line with no horizontal
   scroll. A second Person in the Organization saving the same ID is refused beside the field. `viewer` cannot open the
   record or its `peek?section=identity` (403). Capture the
   success, reopen after reload and compare every explicit saved value with
   `$V rows personnel_extended_info orgA personnel_id PERSON_ID`, including `marital_status_date` and `updated_by` (the
   saving member's id). Set an ETS across the loss window and require the line
   `Was <date>. Enters the loss window on save.` (or `Leaves`) beside the picker before saving. Children retain parsed
   names/nullable ages, military education retains trimmed nonempty lines, and blank optional values persist as null.
   For clearing a saved text field, use native select-all/Backspace and inspect the fresh form plus stored null; an
   empty `fill_form` result alone does not establish that the input event reached the product. A single saved field or
   toast is insufficient. Preserve row ID and created_at on later updates, allowing only legitimate updated_at changes.
   A denied ordinary PUT to `/api/personnel/PERSON_ID/data-sheet` must preserve all target and unrelated A/B fields;
   keep that authenticated denial distinct from the visible Edit affordance. Record operate-only admission honestly
   instead of bypassing it to claim a native form pass.
3. **Detail ETS versus global loss signals:** Through the Data sheet edit form, set the dedicated Person's ETS outside
   the configured loss window and PCS / DEROS to today +15 days. Reload detail: Needs attention lists an Upcoming
   `PCS / DEROS` loss row inside the loss window that opens the Data sheet, and the Readiness LOSS card shows both
   dates. Personnel and Calendar must still show the due PCS / DEROS signal, and the Dashboard's Arriving and leaving
   column must name the nearest in-window Person and departure date. Do not require a day-count label that column does
   not render. Next clear ETS and set DEROS to today +7: the detail loss row and the global views both move to the new
   PCS / DEROS date. Read the exact saved dates and record the run's local date/window. Restore null dates through the
   same native form. Global signals choose the nearest nonnegative date within the inclusive window, omit overdue-only
   records and preserve stable Person identity; detail's inclusive ETS warning, overdue result and default 180-day
   fallback remain meaningful fixed-date tests. Screenshots establish observed content, not measured performance or a
   race guarantee.
4. **Award acknowledgement and sibling fields:** Personnel pages have no acknowledgement toggle; the Dashboard's Leaving
   row sets it through `Award started` ([Dashboard actions](dashboard.md#actions)), and clearing has no UI. For each set
   and clear, use `$V artifact-http ROLE orgA|orgB PERSON_ID POST award-tracking BODY_FILE` with an evidence-root JSON
   file containing exactly `{"acknowledged":true}` or `{"acknowledged":false}`. The helper uses normal HTML login,
   independently confirms the actor session and sends only this collection POST; it accepts no item path, other verb or
   extra body field. Capture actual status/body and the exact full SDS row. Read only the public acknowledgement-ID
   arrays in Personnel/Dashboard data to prove the list behavior; never retain their complete session-bearing data
   response. Existing Personnel/Calendar loss markers and the Dashboard's Arriving and leaving column remain separate
   visible consumers. There is no native acknowledgement badge transition to claim, even where announcement copy
   mentions an absent button. The set retains all SDS values and stores a real nonnull acknowledgement timestamp; clear
   preserves the same row/fields and sets only that value to null, with legitimate updated_at changes. Repeat an SDS
   update while acknowledgement is set and require the original acknowledgement timestamp unchanged. Clear with no
   existing SDS row must not create one. Group, empty-scope, foreign and non-operating requests must not alter either
   record family; preserve the ordinary session's actual denial and full A/B readbacks. Badge listing retains its
   separate view permission and may expose only authorized Person IDs, without granting sensitive SDS read access.
   Preserve the audit actions for successful SDS updates and acknowledgement set/clear; failure or denial must not
   produce a success action.
5. **Detail denial matrix and refresh shape.** Load `/org/<A>/personnel/<slug>` as each actor and record the page title,
   `navStatus` and h1; denial arrives as HTTP 200 with a 403/404 node, so also fetch
   `<slug>/__data.json?x-sveltekit-invalidated=00011` with the actor's session. `orgOwner`, `manager` and
   `personnelScoped` (Alpha configure) open Alpha Persons, and `personnelScoped` also opens an archived Alpha Person,
   whose header carries no archived marker beyond the `Archived` tab. `viewer`, `personnelOperate`,
   `personnelScopedOperate`, `scoped` and `perfScoped` get the 403 page
   (`This requires Personnel can manage permissions`): for `viewer` and `scoped` the `[slug]` layout node and the page
   node are both 403, while for the operators the layout node returns the Person and only the page node is 403. Every
   tab URL denies the operators the same way, Readiness included, because each tab's page load requires sensitive-record
   reading, so an operator never sees the tab bar. The header resolves through a request memo shared by the layout and
   the page. A Bravo or unassigned slug for `personnelScoped`, any A slug for `personnelEmpty` or `personnelForeign`, a
   foreign slug and a nonexistent slug all get 404. Each Overview section streams on its own and runs its own feature
   policy on that one Person: `Next 14 days` and the `Rating chain` card are absent for an actor who may not read them,
   a readiness source the actor may not read is named in a `Couldn't check <source>` line under `Needs attention`, and
   any other failure shows that section's `Couldn't load` line while the rest render. Refresh shape:
   `performance.clearResourceTimings()`, act through the UI, then list `__data.json` (with `x-sveltekit-invalidated`)
   and `/api/*` entries. Node order is root, Organization, Personnel layout, `[personnelSlug]` layout, `[personnelSlug]`
   page; the list page has root, Organization, Personnel layout, page; import has root, Organization, Personnel layout,
   page. `1` means that node's server load reran. Roster Edit save and Add Person: the write only. Roster single
   archive, Edit-dialog archive and bulk archive: the write, then `personnel/__data.json` `0010` and no
   `/api/app-shell-chrome` request. Import commit: one `personnel/import` request per 500 rows, then
   `import/__data.json` `0010`. Data sheet save with the same slug: the write, then `<slug>/data-sheet/__data.json`
   `00011` and no `/api/app-shell-chrome` request; the header and the roster row show the saved values with no reload.
   Slug change: the write, then the new slug's `data-sheet/__data.json` (replace history) with `00011`. Detail archive:
   the write, then Personnel opens and refreshes with `personnel/__data.json` `0010`, with no `[slug]` data request and
   no `/api/app-shell-chrome` request. Detail open from the roster: `[slug]/__data.json` `00011`, which does not rerun
   the Personnel layout. Tab links: `<tab>/__data.json` `00001`. Sidebar Home to Personnel: `personnel/__data.json`
   `0010`. Import page open: `import/__data.json` `0001`.

Finish with final `doctor`, restored dates and exact original A/B row comparisons. Helper cleanup removes only recorded
seeded IDs; the dedicated Person's dependent SDS row may cascade with that owned parent.

## Gotchas

- Malformed, missing and foreign Personnel input and the edit form's 4xx messages are driven in
  [Invalid input](invalid-input.md).
- While the import commits, the commit bar shows `Saving X of Y`; Back and the browser history wait for it to finish,
  and choosing another Organization shows `Your import is still saving. You can leave when it finishes.` and stays.
- Import reads `.xlsx`, `.csv` and `.tsv`; it has no paste box. Source row numbers count every row above the header, so
  a header on row 3 makes the first Person row 4. Native `upload_file` reads only workspace paths, so copy the workbook
  under `.verification/evidence/` first.
- Answers apply to one file. Re-importing the same file asks the same rail questions, and the same answers make every
  saved row Unchanged.
- Seed the lifecycle bundle once per unchanged scenario. Restore its parent before the next archive; recreate through
  clean-seeds/reseed or owned worker restart after a replay defect. Never repair proof by editing archived_at directly.
- The seed's archivedDuplicate intentionally remains archived and excluded from matching. Read it by ID; a
  duplicate-name count alone combines three different states.
- A synthetic pre-request 503 cannot prove transaction rollback or recovery after a committed but lost response. Single
  archive/cascade, review and batch faults need actual SQL/provider proof; preserve historical partial states as
  explicit replay fixtures and retain unexpected partial effects as failures.
- Network families personnel, personnel/import, personnel/archive-batch and personnel/permanent match exact A endpoints.
  Restore every network/feedback/export control, including after failed or blocked attempts. Metadata without stored
  files cannot prove file download/export cleanup.
- Configure-only Personnel access does not open Organization governance. Use orgOwner/orgAdmin for visible Archives and
  Approvals; record a member's direct authorized API restore separately from UI reachability.
- Focused lifecycle, import lane, archive-artifact, slug, modal/import/detail/store and denied-route tests cover what
  the browser cannot. Parent and artifact transactions are exercised through Personnel’s lifecycle command port and SQL
  contracts, with batch approval/result composition at Delivery. The route-owned Edit archive integration checks use the
  real lazy dialog/store/helper/approval transport; uncached detail approval-result checks remain lower-level evidence,
  not a normally reachable operate-only detail journey. `supabase/tests/personnel_unassigned_row_scope.sql` and
  `personnel_artifact_rls_group_scope.sql` provide distinct isolated provider/security proof; browser/API checks do not
  replace them. Existing component tests cover async modal failure and the import flow's history, rail and inline edits
  below the browser.
- Dispose of UI-created temporary People visibly where authorized. Pending requests or packets may require an owned
  restart; no broad helper deletion is implied.
- `src/features/deletion-requests/createDeletionRequest.server.test.ts` covers approval submission's supported-resource,
  identity, duplicate-pending and notification-failure cases; API POST and bulk Delivery both submit through it.
