# Sign-in rosters

A Training member creates a printable attendance roster from the current Personnel candidates, keeps its saved snapshot,
and manages a signed PDF scan without changing Training records.

## Sub-features

- `roster-entry`: open Sign-in rosters from the Training page and see saved rosters permitted by Training access and
  Group scope.
- `roster-create`: filter candidates by Group, Rank, MOS and Role (a person must match every filter that is set, and any
  choice within one filter counts; a top-level Group includes its sub-groups), choose date, order and layout, check the
  print preview, print the PDF, and save the selected Personnel facts with the filters.
- `roster-legacy`: a roster saved before MOS and Role filters, with no filter keys or only `groups` and `ranks`, still
  lists and reprints.
- `roster-snapshot`: reprint from the saved facts after a selected Person changes; later Personnel edits must not
  rewrite the saved roster.
- `roster-scan`: upload, download, replace and remove a small synthetic signed PDF in the roster's private file scope,
  by the row button or by dropping the PDF on the row.
- `roster-guards`: the sheet cannot be dismissed while a save, upload, removal or deletion runs, and a dirty new-roster
  form asks before it is discarded.
- `roster-scope`: an Alpha-scoped member sees Alpha-only rosters, while mixed-Group and unassigned snapshots stay
  outside that member's scope.
- `roster-denied`: Training read access cannot create, upload, remove or delete; no Training access or a foreign
  Organization cannot read or mutate the roster or scan.
- `roster-failure`: a failed list or scan request shows an error and recovers on retry without deleting the saved roster
  or file.
- `roster-removal-confirmation`: Remove and Delete succeed only on a confirmed command reply. An unconfirmed reply
  reports that the change could not be confirmed, and reload shows the saved pointer. If byte cleanup fails after a
  confirmed command, the request still succeeds, the toast says the stored file will be removed automatically, and the
  key keeps its retirement until cleanup removes it.

## How to get to it (user POV)

Sign in to Organization A, choose `Training` in the Organization navigation, then `Sign-in rosters` in the
`Training controls` toolbar (in `More Training controls` when it has folded). A sheet lists the saved rosters. Choose
`New roster`, enter a title, set Group, Rank, MOS and Role filters, date, order and layout while the print preview
follows, then choose `Save and print`. On a saved row, choose `Reprint`, attach a signed scan with `Add signed scan` or
by dropping the PDF on the row, download it from `Signed scan`, replace or remove it from the row menu, or delete the
roster after confirmation.

## Helper controls

Sign-in Roster actors are `rosterManager`, `rosterViewer`, `rosterScoped`, and `rosterForeign`.

```bash
$V actor rosterManager training # Training entry point with roster operate access
$V rows sign_in_rosters orgA title 'Unique synthetic title'
$V roster-files orgA ROSTER_ID # private Storage names, sizes and SHA-256
$V roster-replace PAGE orgA rosterAlpha EVIDENCE_PDF # ordinary multipart replacement; separate HTTP proof
$V network arm-fail PAGE sign-in-rosters # roster list, or sign-in-rosters/ROSTER_ID/upload
$V signed-download orgA ROSTER_ID .verification/evidence/verify-trooptotask/RUN/signed.pdf
```

`roster-files` checks only the named synthetic roster's private Storage path. `signed-download` saves the PDF page
opened by a visible scan button without printing its token-bearing URL; use native `upload_file` on the visible
`Signed Scan` input.

## Driving it with verify:app

Preconditions: `$V fixture` supplies `orgA`, `orgB`, Group, Person and seeded roster IDs. The synthetic roles are
`rosterManager` (A, Training `operate`, Personnel `configure`, Organization scope), `rosterViewer` (A, Training `view`,
Organization scope), `rosterScoped` (A, Training `operate`, Personnel `none`, Alpha-only Group scope), and
`rosterForeign` (B, Training `operate`, Organization scope). The existing `viewer` has Training `none`. The Alpha
fixture has a signed PDF and a saved snapshot of `PFC Able, Prior`, while the current Person is `SPC Able, Synthetic`;
the mixed Alpha/Bravo and foreign fixtures establish scope. Generate a small valid synthetic PDF under the run evidence
directory, for example with the installed `jspdf` package. Use native `upload_file` on the current `Signed Scan` UID.
Capture generated/reprinted PDFs with `$V export arm PAGE`, the visible button, `$V export save PAGE ...pdf`, then
`$V export restore PAGE`. After clicking a named signed scan, use `$V signed-download orgA ROSTER_ID ...pdf` to preserve
the browser-opened PDF without exposing its signed URL. `$V roster-files orgA ROSTER_ID` supplies separate private
Storage readback. It reports the exact row, full object keys, downloaded sizes and SHA-256 values, whether each object
is referenced, unsettled upload registrations, file retirements, and held releases that wait for another reference to
clear. Objects without the current pointer remain visible as orphan witnesses. Query or download failure is an error,
never confirmed absence.

1. Run `$V fixture`. Use `$V actor rosterManager training` and keep its returned `pageId` as `PAGE`. Choose the visible
   `Sign-in rosters` action. Expect the `Sign-in rosters` sheet with its saved count and `New roster`, with no Calendar
   assignment needed. Press Escape and expect focus back on the `Sign-in rosters` button, or on `More Training controls`
   when the action had folded.
2. Use a unique title, for example `Map Roster <run-id>`. Choose `New roster`, expect the title field focused, filter
   Group to Alpha and an observed rank that includes Able, choose `Rank` order and `Split by group`, and confirm the
   `N of M personnel match` line and the print preview before `Save and print`. Repeat once with an observed MOS and
   Role instead (the fixture holds `68W` and `11B`, role `NCO`): the saved `filter_config` must hold `mos` and `roles`
   with those values, and the preview must list only the people who match both. Capture the PDF itself. Expect its
   title, date or intentionally blank date, selected Person and signature column. The PDF downloads only once the save
   has succeeded. Reload Training, reopen Sign-in rosters, search for the title, and read
   `$V rows sign_in_rosters orgA title "$TITLE"`. Expect one row with `personnel_ids`, `personnel_snapshot`,
   `scope_group_ids`, filter and sort fields matching the selection, and no foreign Person. Capture the row ID as
   `ROSTER_ID` and a second visible read after reload. A single included Person proves the saved sort/layout selections,
   not their effect on PDF ordering. For that proof, use `$V seed duplicate-able` to add a PFC in Alpha alongside the
   seeded SPC, reload Training so the PFC joins the loaded roster, generate a second roster with both ranks and inspect
   the PDF order. Generate a third roster with Alpha and Bravo to distinguish `Separate by group` from a flat layout.
   Read back both saved rows and delete them through the UI. Keep the temporary PFC until final seed cleanup in step 7.
   **Nested Groups.** With the [nested Group tree](manage-groups.md#nested-group-tree) seeded, as `orgOwner` the `Group`
   combobox lists only `2nd Platoon`, `Alpha` and `Bravo`. Type `2nd` and press Enter: the description reads
   `9 of 12 personnel match the filters below`. With `Split by group` on, the preview reads `2nd Platoon HQ` (Diaz,
   Webb), then `2nd Platoon › 1st Squad` (Brooks, Kim, Lee, Moss, Nguyen, Ortiz, whose teams fold into the squad), then
   `2nd Platoon › 2nd Squad` (Patel). The dialog fits at 1024x640 and 390x844 with `scrollWidth` equal to the viewport.
   `Cancel` asks `Discard this roster?`. Save and print it, then read the row: each `personnel_snapshot` entry holds
   `groupAncestors` from the saver's root down to its Group's parent (`[2nd Platoon, 1st Squad]` for a team member),
   whatever names the request posted. Rename `1st Squad` in the Group editor and reprint: the sections still read
   `2nd Platoon › 1st Squad`, including for a squad whose saved People all sit in its teams. Rename it back. Move
   `1st Squad` under another top-level Group and reprint: the sections still read `2nd Platoon › 1st Squad` under
   the saved nesting. Move it back. A Group-scoped saver's ancestry starts at the first Group they can see. Every
   section path keeps its top Group, so a reprint reads the same whoever prints it.
3. Re-print the saved row and preserve that PDF. Change a selected synthetic Person's name or rank through the visible
   Personnel editor as `rosterManager`, retaining the original value for restoration. Reload Training and reprint the
   same saved roster. The PDF and `$V rows sign_in_rosters orgA id "$ROSTER_ID"` must still show the original snapshot
   facts and ID. Restore the Person through the visible editor and confirm the original values. If the Personnel edit
   path is unavailable, record the snapshot-change proof as unreachable; a second read without a source edit only proves
   persistence.
4. Choose `Add signed scan` on the saved row, select the small valid PDF through the real `Signed scan file for <title>`
   input, and observe upload progress then `Signed scan`. Reload and confirm it remains; read back the roster's
   `signed_file_path` and require an Organization A `sign-in-rosters/$ROSTER_ID/` path. Choose its named download
   button, run `$V signed-download orgA "$ROSTER_ID" .verification/evidence/verify-trooptotask/<run-name>/signed.pdf`,
   and compare its SHA-256 with the uploaded fixture. Select a second distinct PDF through the labeled `Replace scan`
   row menu item and confirm the new name replaces the old one. Choose `Remove scan`, reload, and confirm a null path.
   For an unshared key, `$V roster-files orgA "$ROSTER_ID"` must report no file, or only a pending retirement when the
   toast says the stored file will be removed automatically. If another roster or counseling record still references the
   key, expect the bytes to remain with a hold and no retirement. Roster scans must remain in the roster path of the
   private shared bucket; they are not Personnel Training completion attachments. For failure/retry, arm
   `$V network arm-fail "$PAGE" "sign-in-rosters/$ROSTER_ID/upload"`, select the file, capture the error and empty
   Storage readback, restore the control, then retry with the valid file. For the drop path, read the PDF bytes of a
   reprint from a `URL.createObjectURL` spy, build a `File` from them, and dispatch `dragenter` then `drop` on the row
   with a `DataTransfer` holding it: expect `Drop to attach` while dragging, then the same saved pointer as the button.
5. Use the seeded Alpha, mixed Alpha/Bravo, unassigned-Person and Organization B rosters from `$V fixture`; keep their
   IDs and original fields. Sign in with `$V actor rosterScoped training` in a separate context. Its list and a
   signed-in read-only `GET /org/<orgA>/api/sign-in-rosters` must include the Alpha-only row and exclude mixed,
   unassigned and Organization B rows. A signed-in `POST` selecting Baker, Unassigned or Foreign must return `400` with
   zero saved rows. The Personnel lookup applies the member's Group scope, so an out-of-scope Person gets the same
   answer as one unknown to the Organization. A signed-in GET of the known mixed roster's `/upload` endpoint and
   attempted scan/roster writes must deny access and leave the row/file unchanged. Compare exact IDs from `$V rows`, not
   just a hidden UI row.
6. Sign in with `$V actor rosterViewer training`; the saved rows and reprint action are available, while `New roster`,
   the scan input, `Remove scan` and `Delete roster` are absent. The signed Alpha row shows its `Signed scan` button;
   choose it, run
   `$V signed-download orgA "$ROSTER_ID" .verification/evidence/verify-trooptotask/<run-name>/viewer-signed.pdf`, and
   require the same byte size and SHA-256 as `$V roster-files orgA "$ROSTER_ID"`. Send signed-in requests from that same
   page for POST create, POST/DELETE upload and DELETE roster against the known ID. Each must return `403` and leave the
   row and file unchanged. With the existing Training-`none` `viewer`, attempt Training navigation and authenticated
   roster GET; expect denied page/data and a `403` response. With `$V actor rosterForeign training`, confirm
   Organization B cannot read Organization A's list or the known roster's scan via Organization A's API, and that
   Organization A data is absent from its own list. Preserve response status and Organization-specific readback.
7. Arm `$V network arm-hold "$PAGE" sign-in-rosters` after Training has loaded and open the sheet: expect five
   placeholder rows and the toolbar at the same height as after release. Release, close, then arm
   `$V network arm-fail "$PAGE" sign-in-rosters` before reopening to fail the first list request. Capture the visible
   error with `Retry` and the 503 control status. Restore the control, retry, and confirm the saved rows return. Delete
   only the uniquely created rosters through their visible confirmation, and read back zero rows and scan objects.
   Finish all comparisons that need temporary seeds across this worker. Restore any edited Personnel fields and armed
   controls, run `clean-seeds`, then owned worker cleanup.

For the two retained private buckets, run `$V private-buckets` after the owned worker passes `doctor`. Expect
`public:false` and `fileSizeLimit:10485760` for both buckets. `personnel-documents` accepts PDF, JPEG, PNG, HEIC and
HEIF; `counseling-files` accepts PDF only. Compare MIME sets without relying on ordering. This service-role
configuration readback is separate from native uploads, ordinary file authorization and hosted configuration parity. A
provider error is a failed readback, never a missing or correctly configured bucket.

## Gotchas

- For provider-sized roster history, `$V seed roster-pages` journals and inserts 1,001 Alpha-only A snapshots with fixed
  microsecond timestamps, null dates, historical names and extra nested marker fields. This is privileged synthetic
  setup, not native roster creation. Read `$V rows sign_in_rosters orgA` before native JSON/Excel downloads and compare
  every saved cohort row. Finish all comparisons that need temporary seeds across this worker before `$V clean-seeds`,
  which removes every journaled seed row, including other cohorts in the same worker. Settings → Ranks → details for
  `VFY-ACTIVE-A` must count each seeded roster once as a saved filter and once as a historical snapshot, preserving its
  rank deletion blocker. Existing Personnel/Training references remain separate. Capture the counts before and after
  cleanup and reload. A successful small export does not prove traversal beyond 1,000 rows.

- For a missing previous scan, use a fresh owned worker and `$V destruction overlap-scan` to remove all Organization A
  files in both retained buckets through ordinary owner Storage permissions; a fresh fixture has only the Alpha scan,
  whose saved path remains. Capture the Alpha row and empty `$V roster-files` result.
  `$V roster-replace "$PAGE" orgA rosterAlpha EVIDENCE_PDF` submits an ordinary multipart replacement from a normally
  signed-in roster-manager page. Expect success, the new saved path and exact new bytes; reopen the roster and reload to
  confirm persistence. This is direct authenticated HTTP/provider proof, separate from native upload/removal
  interaction. Repeat with the viewer to require denial and unchanged rows/files. Replacement never checks the old
  object's absence. The attach command retires the displaced key, and the request succeeds whether that key's cleanup
  completes or stays pending. Native drag-and-drop replacement is not established by this helper.

- `Sign-in rosters` is one `Training controls` action. It folds into `More Training controls` below about 1052 wide, so
  use the row button or the More item, whichever the fresh snapshot shows. The sheet is loaded on demand, so wait for
  its heading after opening it. Below 640 wide it fills the screen.
- The sheet opens as soon as the button is chosen. While its code downloads it shows a `Sign-in rosters` sheet with a
  loading skeleton (`Loading Sign-in rosters`). If the download fails it shows `Unable to open Sign-in rosters` with
  `Retry`, and Retry loads it without a page reload.
- `Save and print` saves first and downloads the PDF only after the save succeeds, from the saved roster's snapshot, the
  same page `Reprint` makes. A refused or failed save shows its error, keeps the form and downloads nothing. Hold the
  POST with `$V network` to prove no download appears while it waits.
- The header's `N waiting on a signed scan` is the server's count of rosters without a signed scan under the same search
  and date filters, so it is right before `Show more`. It drops after an attach, rises after a scan is removed, and
  drops when a roster without a scan is deleted.
- While a save is held, Escape and the overlay do nothing, `Close` is absent and the form is disabled. A form with a
  title or any filter also ignores Escape, and its back arrow opens `Discard this roster?`.
- The roster list shows 20 rows and `Show more` loads the next 20. With `$V seed roster-pages` the footer reads
  `Showing 20 of 1005`, then `Showing 40 of 1005`.
- The server rebuilds snapshot names, ranks and Group labels from selected Personnel IDs. A client-supplied snapshot is
  not authoritative. Creation is limited to 500 unique Personnel IDs, and out-of-scope selection is rejected before
  insert.
- A roster containing an unassigned Person is Organization-only. Group-scoped readers need every saved Group within
  their grant; later Person Group changes do not retroactively alter a stored roster's scope.
- The scan endpoint uses Training read for a signed URL and Training operate for upload/removal, plus roster scope and
  private Storage checks. Attach, Remove and roster deletion are the `attach_sign_in_roster_scan`,
  `remove_sign_in_roster_scan` and `delete_sign_in_roster` commands. Remove sends the expected `filePath` and answers
  `409` when the scan changed. A `404` means the roster is no longer available, not that this request deleted it. Only
  the current pointer's object is readable by members; displaced keys are retired and removed by cleanup. A returned
  signed URL or visible button alone does not prove downloaded bytes or denied direct file access.
- Keep Alpha/Bravo/Unassigned seed rows and private files disposable. Do not edit the maintenance or production
  database. Restore seeded Person changes and remove UI-created rosters before worker cleanup.

## Bounded scan lifecycle baseline

Finish reusable controls and this recipe before launch. Freeze executable inputs until final doctor and cleanup. Select
only affected scan cases for a lifecycle repair.

1. Capture `doctor`, fixture roles, exact roster row, and `roster-files` before each case. Use distinct valid PDF bytes
   for old and new scans. Capture the native snapshot, feedback, request status, and readback after each operation and
   reload. Require every acknowledged attachment to retain readable intended bytes. A failed or unconfirmed operation
   must preserve existing bytes or recover truthfully from an authoritative read. A dangling pointer is always a
   failure. An unreferenced upload is a failure unless its key has a retirement, or its registration stays open after an
   armed `roster-scan-settle` fault.
2. Run ordinary native upload, download, `Replace scan`, and **Remove scan** through the visible controls. For attach
   rejection, arm `$V fault arm roster-scan-attach`. Expect the error, the old pointer, and the new key retired with no
   registration. For committed attachment with a lost provider reply, arm `$V fault arm roster-scan-attach-lost-ack`.
   The real provider commits, the control consumes its reply, and the app server's fetch then fails with a transport
   exception, which the installed SDK reports without a database code. The server reconciles the exact key and reports
   success. A `-lost-ack` roster control never returns an application-specific code or status; a provider failure on the
   same call comes back unchanged and keeps its own message (`provider-failed` receipt). If another attachment displaces
   that key before reconciliation, the member sees `The signed scan change could not be confirmed. Reload to check it.`
   The newer scan stays and the displaced key retires. Immediate loss cannot prove that order, because nothing can
   attach between the reply and settlement. Use the committed pause below. Arm both `roster-scan-attach` and
   `roster-scan-settle` for failed reconciliation. Expect the original error, the unattached bytes, and one open
   registration. Capture readback before any retry. Do not claim a filename or successful HTTP status proves retained
   bytes.
3. For ordinary multipart HTTP, `$V roster-replace PAGE orgA rosterAlpha NEW_PDF` submits from the signed-in page. This
   is separate provider/API proof. Use `$V fault arm counseling-file-remove-lost-ack` or
   `$V fault arm counseling-file-remove` for displaced-file cleanup. Either way the replacement succeeds and the
   displaced key keeps a retirement until cleanup removes it. Restore faults between cases. Capture row, exact old/new
   object keys, registrations and retirements before any retry.
4. For Remove, arm `roster-scan-remove` or `roster-scan-remove-lost-ack` and use native **Remove**. A rejection keeps
   the pointer and bytes. A lost reply (the same transport loss after a committed reply) reports that the change could
   not be confirmed. Reload must show the authoritative pointer, and an explicit retry must converge. For whole-roster
   deletion, use `roster-delete` or `roster-delete-lost-ack` and the visible confirmation on a disposable roster. A
   refused deletion keeps the confirmation open with its error. After a lost reply, the retry reports
   `This roster is no longer available.` and drops the row.

   **Displacement between commit and settlement.** Open the same roster as `rosterManager` on two normally signed-in
   pages, and read `$V roster-files orgA ROSTER_ID` for the baseline. Arm
   `$V fault arm roster-scan-attach-committed-hold`. Select scan K on page one. The app server's real attach commits,
   the preload consumes its reply and pauses it. Poll `$V fault state` until
   `controls.roster-scan-attach-committed-hold` shows `phase:"committed-held"` and `call.providerStatus:200`. That
   receipt is the positive proof that K committed and has not reconciled. Read `roster-files` and require K as the
   pointer. Select scan L on page two. Only the first matching attach is paused, so L's attach is admitted and commits
   normally. Wait for page two to show L, then read `roster-files` and require L as the pointer. Run
   `$V fault release roster-scan-attach-committed-hold`. Page one's reply is lost as a transport exception, the server
   settles K, finds it displaced, and page one shows
   `The signed scan change could not be confirmed. Reload to check it.` The receipt now shows `phase:"faulted"` with
   `releaseReason:"released"`. Reload and require L, compare its downloaded hash, and require K retired and removed or
   still pending with its registration completed. `releaseReason:"deadline"` (the pause ends by itself after 120
   seconds) or `"restored"` does not establish the order. A restore releases the pause the same way and clears the
   control. Restore after the case.

5. Measure the real authenticated provider timeout with
   `python3 .agents/skills/verify-trooptotask/helpers/roster-provider.py timeout --worker 1 orgA ALPHA_ROSTER_ID`. This
   installs one temporary read-only probe RPC on the owned provider, invokes it with the synthetic manager's ordinary
   provider login, then removes the function and revokes that probe session. Preserve the returned setting and actor.
   For a bounded replacement overlap, run `roster-provider.py hold --worker 1 orgA ALPHA_ROSTER_ID`. After `HOLDING`,
   run `$V roster-replace PAGE orgA rosterAlpha FIRST_PDF SECOND_PDF`. The optional second PDF dispatches two ordinary
   authenticated requests concurrently. The holder independently queries the actual direct and transitive waiter graph,
   labels each waiter `attach`, `remove`, `delete` or a direct write, and rolls back after both writers arrive. It
   captures the holder and writer PIDs before release. A ten-second overall deadline, two-second first-waiter deadline,
   and twelve-second idle transaction limit prevent indefinite holds. No timed sleep establishes ordering. Require
   `RELEASE_GRAPH` with `overlap:true`, both real responses, and `HOLDER_ABSENT`. Compare every stored key with the
   final pointer, retirements and exact hashes.

   For replacement versus Remove, substitute `remove` for the second PDF. It sends the pointer read before dispatch as
   the expected key. For whole-roster deletion, substitute `delete`. Each request pair runs in one ordinary page
   evaluation and returns both full HTTP outcomes. To order replacement first, arm
   `$V fault arm roster-scan-remove-hold` or `$V fault arm roster-delete-hold`, then add `--release-fault NAME` to the
   holder. The private preload holds only that matching command before provider dispatch. The independent holder
   releases it after observing the replacement writer, then releases the row after both writers arrive. To order Remove
   or deletion first, use `roster-scan-attach-hold` instead. Every preload hold also dispatches after a four-second
   safety deadline. An observed `releaseReason:deadline` does not establish the requested ordering. Restore controls
   after each case. Independent `inventory --independent` validates the frozen candidate and owned provider directly
   without the serialized browser queue. Ordinary HTTP, temporary privileged instrumentation, and any SQL fallback
   remain separately labeled proof.

   **Native Delete against a held attach, then an explicit-ID insert.** Arm
   `$V fault arm roster-scan-attach-predispatch-pause`. Select a scan through the native input. The preload holds only
   the first app-server `attach_sign_in_roster_scan` call to the owned provider before dispatch, so nothing has
   committed. Every other request, including a second attach, passes. Poll `$V fault state` until the control shows
   `phase:"held"` with the attach call. That receipt is the positive proof that the attach is waiting. Delete the roster
   through its native confirmation and wait for the result. Then run `$V roster-insert rosterManager orgA ROSTER_ID`
   with the deleted roster's ID. It journals the target and a unique title before the write, signs the actor in through
   the normal provider password login, sends one authenticated PostgREST insert naming that ID, and revokes the session.
   It reports the requested and actual ID, `idReplaced`, status, any provider error, the requested-ID row before and
   after, and the created rows recorded for cleanup. Credentials never appear. This is ordinary provider/API proof under
   the actor's RLS, not native roster creation, which never sends an ID. `rosterScoped` may insert this Alpha row, so
   expect `201` with `idReplaced:true` and a server-assigned ID. Use `rosterViewer` or `rosterForeign` for denials,
   which record a status and no row. Run `$V fault release roster-scan-attach-predispatch-pause` and capture the attach
   outcome, the receipt and `roster-files` for both IDs. Only `releaseReason:"released"` establishes the order. The
   pause ends by itself after 120 seconds with `releaseReason:"deadline"`, and a restore reports `"restored"`. Neither
   is proof. For a delayed retry of the deletion, run `$V roster-replace PAGE orgA ROSTER_ID delete` from the signed-in
   page. It sends one ordinary DELETE and accepts a fixture roster key or an ID recorded by `roster-insert`, even when
   that roster no longer exists. It reports `rosterExisted` and the full response. `clean-seeds` deletes recorded
   inserts by ID and title.

6. Check only lifecycle denials touched by the controls. Viewer writes and mixed-roster scoped writes must deny without
   row, bytes, registration, or retirement changes. Restore faults and observations. Delete only UI-created rosters
   through their confirmations, run `clean-seeds`, then final doctor and owned worker cleanup. Preserve failures before
   cleanup, including orphan witnesses. Worker disposal removes synthetic failure leftovers without asserting that
   ordinary recovery removed them.

## Shared stored keys

These cases prove that a stored key is retired only after its final reference clears, across rosters, counseling and
documents. `$V seed roster-shared-keys` stages synthetic rows on new owner and reference Personnel. It journals every
row ID, key, upload registration, case and release type before the first write. It then writes real bytes through
registered uploads, so the bytes, holds and retirements use the same reference rules the app uses.
`$V roster-shared-keys state` reads back each recorded key. It reports the references, hold, retirement by key digest,
registrations, Storage object metadata, and downloaded size, SHA-256 and `matchesSeed`. The retirement stays visible by
digest after completion clears its object name. A read failure is an error, and only a provider 404 counts as absence.
Read `state` before and after each release and after each drain.

| Case                  | Key owner                                                              | Other reference                             | Releases, in order                                                                                                          |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ownerRelease`        | roster scan                                                            | archived counseling row on the other Person | native Remove on the owner roster, then ordinary counseling Delete                                                          |
| `nonowningRoster`     | roster scan                                                            | second roster pointing at the same key      | native Remove on the owner roster, then fixture release                                                                     |
| `reverseCounseling`   | archived counseling row                                                | roster pointing at the counseling key       | ordinary counseling Delete, then fixture release                                                                            |
| `crossPersonDocument` | archived document                                                      | archived document on the other Person       | ordinary document Delete on each                                                                                            |
| `foreignUnreleased`   | Organization B counseling row                                          | none                                        | none. It must keep its bytes and gain no hold or retirement                                                                 |
| `openRegistration`    | roster-prefix key with an unsettled registration and no roster pointer | archived counseling row                     | ordinary counseling Delete. It owns nothing, so the key must keep its bytes and registration and gain no hold or retirement |

Seeded titles read `Shared key CASE owner TAG` or `Shared key CASE reference TAG`, and `state` lists every row ID.
Remove a roster scan natively as `rosterManager`. For ordinary deletion, run
`$V artifact-http manager orgA PERSON_ID DELETE counseling-records/RECORD_ID` or `.../documents/RECORD_ID`. The release
targets are seeded archived because the app deletes only archived artifacts. `delete_sign_in_roster` and Remove refuse a
pointer outside the roster's own prefix, so no ordinary or native command can clear a nonowning or legacy roster
reference. `$V roster-shared-keys release CASE` clears that recorded reference roster's pointer with the owned service
role, guarded by the recorded key, and works only for `nonowningRoster` and `reverseCounseling`. Label it fixture proof.
Expect the owner's release of a still-referenced key to create a hold with no retirement. Releasing a nonowning
reference retires nothing by itself. The next `retention cron run records` after the final release must promote the hold
to a retirement and remove the bytes. Every drain must leave `foreignUnreleased` and `openRegistration` byte- and
row-identical. `$V roster-shared-keys reuse CASE` journals a probe, then asks the owned provider to register the same
key again. A retired key must be refused with `23514`. An accepted registration is a failure, and the probe settles it
at once.

`clean-seeds` settles open registrations and probes, deletes reference rows before owners, deletes the Personnel and
remaining bytes, completes the recorded keys' retirements and drops the manifest. It is idempotent and resumes after a
partial seed or cleanup. Remove scans attached natively to seeded rosters before cleanup, because those keys are not
journaled. A hold created during the run can remain after cleanup until the next drain or worker disposal. Cleanup
touches only recorded keys and inventories no other orphans.

Run
`node --test scripts/verification/outbound-controls.test.mjs .agents/skills/verify-trooptotask/helpers/roster-controls.test.mjs`,
`npx vitest run scripts/verification/rosterLostAck.test.ts` (the real controller, installed SDK, roster provider and
HTTP error mapping against a stateful fake that models neither SQL locking nor Storage bytes) and
`python3 .agents/skills/verify-trooptotask/helpers/roster-provider.test.py` for the target and recorded-key boundaries.
Native replacement, provider overlap, ordinary HTTP and privileged readback remain distinct proof.
`supabase/tests/sign_in_roster_scan_lifecycle{,_concurrency}.sql` prove the commands, waits and retirement in SQL.

For the Organization lifetime check, a busy roster sheet blocks the visible Organization switcher. Prepare Organization
B as the prior history entry through the visible switcher before returning to A. Hold the Remove response, use the
history fallback documented in [Organization switching](organization-switching.md), then release the response in B.
Require no roster feedback in B, unchanged B records, and a cleared scan after returning to A and reloading. The
response hold begins after the command commits. It proves late response suppression, not a command still running during
the switch. Run an unheld Remove with the same feedback observer as a positive control.

## Viewer day

With a browser zone whose day differs from UTC (see the [skill](../SKILL.md#launch)), create a roster, then set `From`
and `To` to the browser day. The new roster must be listed, and setting both to the UTC day (when different) must not
list it. The list request sends `createdFrom` and `createdBefore` as instants; a bare `from=YYYY-MM-DD` or malformed
instant returns 400.
