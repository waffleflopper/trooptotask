# Manage Personnel artifacts

A member records follow-ups and leader notes, uploads counseling PDFs and other documents, and manages each Soldier's
retained history through archive, restore, export and scheduled retention.

## Sub-features

- `artifact-entry-points`: the Personnel Overview's open follow-ups, last counseling and latest note and the Log, Files
  and Archived tabs retain the same Person identity.
- `artifact-create-retry`: failed saves retain text, dates and selected files; visible retry creates one saved artifact
  and reload shows its submitted fields.
- `artifact-follow-ups`: create and edit title, notes and due date; complete, reopen, archive and restore while
  retaining the saved identity.
- `artifact-counseling`: upload a completed session's PDF, conducted date, title, optional summary and optional
  conductor name without adding signature tracking or a counseling form workflow. Open the saved PDF from its
  `DA 4856 · PDF` chip.
- `artifact-documents`: upload supported files within the file and per-Soldier storage limits, derive or edit the title,
  and open the authorized saved file.
- `artifact-notes`: create and read the accepted leader-note shape, preserve contributor-label fallback and
  archive/restore behavior.
- `artifact-lifecycle`: archive individual items, restore or permanently delete them from Archived, and retain the
  parent archive event and unrelated historical items.
- `artifact-sensitive-scope`: distinguish configure reads from operate writes, authorized Alpha from
  Bravo/unassigned/empty scope, and the requested Organization from a foreign Organization.
- `artifact-export`: preserve raw Organization export rows separately from readable workbook projections and the
  existing narrower single-Person workbook.
- `artifact-retention`: delete only expired archived artifacts, remove files for deleted rows, preserve
  active/recent/foreign sentinels and report truthful counts and failures.
- `artifact-storage-responses`: document signing rejects malformed replies; admitted cleanup preserves already-missing
  objects while rejecting malformed or unrelated deletion acknowledgments and keeping known partial effects explicit.
- `artifact-switching`: a Person or Organization change and late responses cannot carry the previous record's draft,
  saved items or file access into the next record.

## How to get to it (user POV)

Choose Personnel, find a Soldier and choose the Soldier's row. The record header names the Person and holds Edit,
`More Personnel record` (Export records, Archive) and `Add to record`; the tabs below it are Overview, Readiness, Log,
Files, Data sheet and Archived. Overview provides Follow-up, Counseling PDF, Document and Leader note forms and
recent-item previews. Use Show all, or Log (follow-ups and notes) and Files (counselings and documents), for their
complete lists. The Log tab badge counts open follow-ups and the Archived tab shows its item count. Log shows follow-ups
on the left and leader notes on the right. A follow-up's checkbox completes it in one click, `Reopen` reverses it, and
clicking its title opens an inline editor (title, notes, Due date, Archive, Cancel, Save) where Archive lives. Clicking
a note's text opens its inline editor the same way. Only one Log row edits at a time; Enter in a follow-up title saves
and Escape cancels. Counselings and documents provide Archive on Files; documents provide Open. Archived combines all
four families behind an `All · N | Follow-ups | Counselings | Documents | Notes` filter and provides Restore and Delete
for each item.

Follow-up, Note, Counseling and Document appear in `Add to record` only for a member who may manage and read sensitive
records, because Log and Files require that read. Training completion follows Training record completions. Export
records appears only with Personnel export. `Add to record` items only navigate: Follow-up and Note open
`/log?add=follow-up` and `/log?add=note`, which focus the quick-add title input and the note composer; Counseling and
Document open Files, and Training completion opens Readiness. The roster's `Note` button and N key do not navigate: they
open a popover composer that posts a follow-up or a leader note to the same collection endpoints from any member who may
manage that Person's records, whether or not they can read the Log (see `find-personnel` step 15); the saved row then
reads like any other in Log. Files opens on a Counselings section whose `Last counseled` heading comes from the server
(the newest counseling dated on or before the viewer's day, whatever the page), with a 12-month coverage bar and a
Documents table, with a drop zone and Storage meter in the right rail. Dropping or choosing a file there opens an
`Add a file` dialog where the member picks Counseling (PDF only) or Document. `?add=counseling` and `?add=document` open
that dialog with the kind chosen and the file picker focused.

Use `More Personnel record` → Export records in the record header for the single-Person workbook. An Organization
owner/admin uses Settings → Exports for complete Organization JSON and Excel, and Settings → Archives for parent
Personnel restore. Scheduled retention has no user-facing run button; its admitted job call and provider/file effects
are separate from the visible Archived list.

## Helper controls

Personnel file lifecycle faults use `fault arm document-file-remove|counseling-file-remove` to reject one DELETE to the
named bucket on this worker's provider before dispatch. The corresponding `-lost-ack` names dispatch the removal and
replace a successful reply with 503. `document-attach` and `counseling-attach` reject one POST to `personnel_documents`
or `counseling_records` before dispatch, so the uploaded bytes have no row and the upload must retire its registration.
`document-attach-lost-ack` and `counseling-attach-lost-ack` dispatch one POST to `personnel_documents` or
`counseling_records`, then replace its successful reply with 503. These controls affect the owned app's matching bucket
or table, so run one mutation at a time and restore before unrelated file work. `fault state` preserves the method, path
and actual provider status for lost replies. Capture exact row/file readbacks and visible feedback under the
[Personnel artifacts recipe](personnel-artifacts.md#provider-faults-and-recovery).
`artifact-deletion orgA|orgB PERSON_ID document|counseling ARTIFACT_ID` reads the exact durable deletion receipt without
changing it. It uses privileged synthetic readback, not ordinary actor authorization. Pair it with `artifact-files`
before and after admitted scheduled cleanup. They establish controlled provider outcomes, not an actual outage. Run
`node --test scripts/verification/outbound-controls.test.mjs` for method, endpoint, origin and one-shot isolation.

Personnel artifact verification uses the [artifact recipe](personnel-artifacts.md). `personnelForeign` configures only
Organization B; existing `personnelOperate`, `personnelScoped`, `personnelEmpty`, `viewer` and `personnelSwitch`
preserve their distinct A grants. `network` also accepts exact `personnel/PERSON_ID/leader-notes`, `follow-ups`,
`counseling-records`, `award-tracking` and `documents` families, their named record endpoints, and a named document's
`/download`. It still binds to this worker's exact Organization A path.

`seed personnel-artifact-context` prepares a dedicated positive switching actor, `personnelContext`, with Personnel
configure in A and one recorded temporary configure membership in B. It creates two active People with distinct
IDs/names and the same Organization-scoped slug, sixteen active/independently August-archived artifact witnesses and
eight real synthetic PDFs. The complete row/path ownership manifest is saved before inserts/uploads; ordinary
`clean-seeds` removes those exact rows/files and the temporary B membership. Existing actors and denial grants remain
unchanged. Use the returned actor ID, slug, A/B parent IDs, rows and file hashes; provider-seeded files are
prerequisites, not native upload or ordinary authorization proof. UI-created artifacts need their own recorded IDs/paths
and ordinary archive/delete cleanup before seed cleanup.

`artifact-files orgA|orgB PERSON_ID [counseling|document FILE_PATH ...]` reads only that synthetic Organization/Person's
two file-bearing tables, checks their known private Storage paths and reports actual byte sizes/SHA-256 or confirmed
absence. Optional paths must be previously recorded for the same Person; preserve before-path readbacks to inspect
removal after its row is gone. Current counseling/document file paths are explicitly bound to the named
Organization/Person. Query, listing or download failures are errors, never absence. These service-role readbacks
establish stored bytes separately from an ordinary actor's sensitive-file authorization. Create real uploads through the
visible forms; the metadata-only lifecycle seed does not establish file outcomes. Do not publish signed URLs or
credentials.

`artifact-http ROLE orgA|orgB PERSON_ID METHOD FAMILY[/RECORD_ID[/download]] [BODY_FILE]` makes one normal authenticated
HTTP request after the same owned-worker doctor check. It signs in the named fixture actor through the real HTML
`/auth/login?/login` form and caches only that admitted session's cookies in the owned worker's private directory, bound
to its worker session ID, actual app origin and actor ID. Cache directories/files use `0700`/`0600`; cookies and
credentials never enter evidence or command output. Every command independently checks that `/auth/login` redirects the
session to `/dashboard` before sending its artifact request. A missing/expired cache uses normal login; a rejected
cached session clears and permits one fresh normal login and confirmation. A cached check returning `429` or `5xx`
blocks without another login or artifact request and preserves the cache, reporting its status and numeric
`Retry-After`. Authentication metadata distinguishes `normal` from `reused` and records the actual login/confirmation
statuses. Cookie rotations and deletions persist. Successful `clean-seeds` removes only this worker session's HTTP
cache; owned `verify:app cleanup` removes the entire private worker directory. It does not use browser evaluation or the
service role. Targets are restricted to this worker's Organizations A/B and exact Personnel UUID paths: the four
artifact collections allow `GET`/`POST`, their record UUIDs allow `PATCH`/`DELETE`, and only a named document's
`/download` allows `GET`. Redirects are inspected without following them; any location outside the owned origin blocks
the command. A returned signed download URL is redacted and never fetched.

`POST`/`PATCH` require a JSON object in `BODY_FILE`; `GET`/`DELETE` accept no body file. Both body and upload files must
resolve inside `.verification/evidence/verify-trooptotask/`, including after resolving symlinks. Ordinary JSON fields
pass through unchanged. Document/counseling collection `POST` uses multipart fields from the object, with an optional
`file` descriptor:

```json
{
	"title": "Synthetic file guard",
	"file": {
		"path": ".verification/evidence/verify-trooptotask/RUN/synthetic.pdf",
		"type": "application/pdf",
		"name": "synthetic.pdf"
	}
}
```

Counseling also accepts its normal `dateConducted` and `summary` fields. `type` is explicit and `name` defaults to the
source basename, so deliberate MIME/name mismatches and unsupported or oversized uploads exercise the actual app guards
without changing the helper. Omit `file` for a missing-file probe. Multipart fields other than `file` must be scalar
strings, numbers, or booleans. The helper reports actor/Organization/Person IDs, exact method/path, authentication
mode/statuses, submitted fields, evidence-relative file names, uploaded byte size/SHA-256, HTTP status, public
`Retry-After`, redirect location and full response body. Credentials, cookies, authorization tokens and signed URL
tokens are replaced with `[REDACTED]`; other private response fields remain visible for security proof. Bodies are not
truncated. Session reuse does not change the app's request limits: pace commands, record rate-limit responses and
respect `Retry-After`; the helper does not retry artifact mutations. Preserve this direct API observation separately
from native UI interaction and compare denied writes with unchanged provider rows/files. Run
`node --test .agents/skills/verify-trooptotask/helpers/artifact-http.test.mjs` for its login, cookie, input-boundary and
redaction checks.

`seed artifact-retention` creates dedicated active A/B Persons and expired A, active/recent A and active/recent B rows
for all four artifact families. A completed Follow-up history row remains unarchived. `seed artifact-retention-1001`
creates 1,001 expired A rows per family, with returned final-generated cohort markers. These identify known rows/files;
their lexical IDs do not establish discovery-page placement without ordered provider receipts. Both variants record all
exact row IDs and actual file paths before any insert/upload, use bounded inserts and support ordinary `clean-seeds`
recovery. These are privileged setup fixtures, not native uploads or ordinary-actor authorization proof. They do not
change Organization settings; use `retention settings` to read only the owned A/B `archive_retention_months` values and
verify the reported 36-month default assumption.

Preserve the seed's parents, classified rows, timestamps, file manifests and markers. `retention files` checks every
recorded real object independently of surviving metadata, with `observedSize`/`observedSha256` or confirmed absence.
Small setup stores twelve real PDFs; large setup stores fourteen, including first/last expired file witnesses. The other
large expired file rows explicitly have `stored:false` metadata-only paths, and establish no stored bytes. Each bucket
also has a real unrelated object without a metadata row. B controls are unexpired because the admitted job processes
every Organization; an expired B row would legitimately be deleted. Read exact parent/child/provider rows before and
after `retention cron missing|wrong|run records`, reload native Archived and inspect the actual administrator
notification. Strict cutoff equality belongs in fixed-time operation checks; these wall-clock fixtures establish
old/recent/active behavior without claiming a live equality boundary. Preserve provider failures and partial effects.
Run `node --test .agents/skills/verify-trooptotask/helpers/artifact-retention.test.mjs` for interrupted-insert/upload
cleanup recovery.

## Driving it with verify:app

Record baseline, failed, final and unrun paths separately.

Preconditions: owned launch and `doctor` pass for this checkout; use the feature index's `WORKER` and `V`. Preserve the
candidate/digest, runtime/browser versions, `$V fixture` output, every returned actor page and Organization/Person IDs.
Use one driver for the owned browser and freeze source, fixtures and controls during proof.

Run `$V seed personnel-lifecycle` once for a dedicated active Alpha Person and its independent historical artifacts.
Preserve `person`, `duplicateAlpha`, `duplicateBravo`, the saved artifact IDs and the literal independently archived
timestamp `2026-08-01T12:00:00.000Z`. Its note, counseling, document and open-follow-up companions support parent-event
comparison. The completed follow-up retains `completed_at` `2026-09-14T12:00:00.000Z` and null `archived_at`. Its
document/counseling paths are metadata only: they establish no stored bytes or file access.

Use `$V artifact-files orgA PERSON_ID` and the corresponding `orgB` readback for recorded counseling/document rows,
bucket/path, object byte sizes and SHA-256. Preserve its `tables` and `files` outputs. After row deletion, pass recorded
paths explicitly with `$V artifact-files orgA PERSON_ID counseling COUNSELING_PATH document DOCUMENT_PATH`; otherwise an
absent row would remove its path from the readback. Upload real synthetic files through the native file control for the
create journey; a provider-seeded file is a prerequisite, not a native upload. Keep the local upload
filename/content/hash and resulting saved row/file manifest. Choose fresh unique titles containing the recorded tag so
no original fixture item is mistaken for a newly saved item.

Actors: `manager` configures Personnel in A; `personnelScoped` configures Alpha only; `personnelEmpty` has configure
with an explicit empty Group set; `personnelOperate` operates in A without sensitive-read access; `viewer` only views
ordinary Personnel. `orgOwner` reaches Organization exports and parent Archives. `personnelForeign` configures B for the
positive foreign-file control. Use each actor's own returned browser context. Preserve exact A/B rows and file manifests
before denial/fault probes and compare them afterward.

For direct ordinary-actor API proof, use the documented
`$V artifact-http ROLE orgA|orgB PERSON_ID METHOD FAMILY[/ARTIFACT_ID[/download]] [BODY_FILE]` helper. Bodies and upload
inputs must be under the run evidence directory. For example, a document POST body is
`{ "title": "Unique synthetic title", "file": { "path": ".verification/evidence/verify-trooptotask/RUN/synthetic.pdf", "type": "application/pdf" } }`;
a counseling body additionally supplies `dateConducted` and optional `summary`. Follow-ups and Notes use their existing
JSON fields, while item PATCH bodies use the actions/status described below. Preserve the helper's complete sanitized
request/response and exact row/file readbacks before and after each probe. It reuses only the actor's ordinary session
bound to this owned worker and confirms authentication before each artifact request. Recorded seed cleanup and owned
disposal clear its private cache. It does not change browser cookies or make a native UI claim. Respect the unchanged
rate limits and record any `Retry-After`; a rate-limited control or request earns no target permission result. Rejected
login/redirect/helper guard results establish no artifact request or permission pass. Archive and remove only the exact
newly created IDs through admitted ordinary artifact requests before seed cleanup.

1. **Overview and complete-list entry points:** As manager, open the dedicated Person through the roster. Capture the
   header, the Overview's open follow-ups (the three due soonest), `Last counseled` and `Latest note`, and the Log,
   Files and Archived tabs; require the same Person ID in the saved page data and returned artifacts. Log's follow-ups
   load all nonarchived rows (open first by due date, then a `Completed · N` section previewing two with Show all), and
   its notes load the newest five with `Show N older notes` paging twenty at a time through the leader-notes collection
   GET (`limit`, `beforeCreatedAt`, `beforeId`). Capture a second read after reload. A preview count alone does not
   establish complete-list coverage. A denied or failed artifact stream must not be counted as a successful empty list;
   record its actual rendering separately from the unaffected Overview sections.

2. **Follow-up create, edit and status recovery:** On Log, type a unique title and pick a Due date in the quick-add row,
   arm the exact collection endpoint below for a 503, then press Enter. Preserve visible error, unchanged draft and
   exact absence of a matching saved row. Restore the hook and retry visibly; require one saved ID, submitted fields,
   `status: open`, null completion/archive and reload. Click the title to edit that same ID, press Escape once and
   require unchanged storage; edit again, fail its item PATCH, then retry with the same title/notes/date. Clear the due
   date and require null after reload. The checkbox must retain the ID, record completion time and `completed_by` (the
   row reads `Done <date> · <name>` under `Completed · N`) and update the Log badge without a reload; with its item
   PATCH failed it must snap back unchecked with an inline error. Reopen clears completion and attribution. The database
   stamps `completed_by` and `archived_by` from the caller, so read them back as the acting member's id after each
   checkbox, archive and restore, and expect null after reopen and restore. While a Save is held, Archive and Save in
   that editor are disabled. Archive from the editor removes it from the active list and makes it visible under Archived
   with `Archived <date> · <name>`. Completed follow-ups stay visible until individually archived; parent archive
   handles only open follow-ups.

3. **Leader-note create and retry:** Create a unique note through the Log composer (or Overview → Add note), fail the
   exact collection POST, preserve the entered text/error and zero saved effect, restore and retry. Reload Log and
   require exactly the saved ID, trimmed text, author display/fallback, date derived from `createdAt`, timestamp string
   and null `archivedAt`. Click the note's text, change it and Save: require the same ID and author, the new text and a
   later `updated_at`, with no `edited` label. Empty text is rejected before a write; the accepted maximum is 4,000
   characters. Archive one new note, reload Log/Archived, and compare its saved text/author/identity before restore or
   delete. An auth-user UUID or historical literal author remains the accepted fallback when no Organization member
   label resolves; a completer or archiver with no resolvable label shows no name. A page request whose
   `beforeCreatedAt` is an impossible date such as `2026-02-30T10:00:00Z` returns 400, not 500.

4. **Counseling PDF create and file retry:** On Files, use native `upload_file` on the drop zone's input with a valid
   synthetic PDF and choose Counseling. Enter the conducted date, a unique title, an optional summary and a conductor;
   Conducted by defaults to the uploader's name. Arm `counseling-attach` for one POST to `counseling_records`, select
   Upload and retain the visible error, fields and selected file; then use `$V artifact-files` to require no new row and
   the stored object absent. That helper reads rows and Storage objects, not upload registrations, so registration
   retirement after a failed attach stays unverified here; `artifactWrites.server.test.ts` covers retiring an unattached
   key. Restore and retry using the same visible draft. Require one counseling ID with matching title/date/summary,
   `conducted_by` as typed, uploader identity and a recorded `counseling-files` object under the admitted
   Organization/Person. Compare size/hash with the submitted bytes and reload the saved row: it reads
   `Conducted by NAME · uploaded DATE`, or `Uploaded by NAME` when the conductor is empty. Select the row's
   `DA 4856 · PDF` chip and capture the download-endpoint status and the opened PDF bytes; the signed URL lasts 300
   seconds, so a URL alone is not proof. Non-PDF and files over 10 MB are refused beside the drop zone before any
   request; use real provider/API checks for validation the native chooser prevents submitting, including MIME-spoofed
   contents.

5. **Document create, title, Open and retry:** On Files, use native `upload_file` on the drop zone's input with a valid
   synthetic PDF or PNG and choose Document. The title derives from the filename; edit it to a unique title before
   submission. Arm `document-attach` for one POST, preserve title/file/error and use `$V artifact-files` to require no
   new row and no stored object (registrations are not read, as in step 4), restore and retry. Require one saved
   ID/title, byte size/content type, uploader and actual `personnel-documents` object under the admitted
   Organization/Person, with submitted byte hash. Reload and select that row's Open; capture the actual
   download-endpoint status and opened PDF or downloaded bytes. The signed URL lasts 300 seconds; receiving a URL alone
   does not prove the object is readable or exact. Fail the exact download endpoint separately and require useful error
   without file/row changes, then restore and retry. Require the Storage meter to move by the uploaded bytes after the
   refresh. Repeat a separate Overview upload/Open for its distinct form. PDFs, JPEG, PNG and supported HEIC/HEIF may be
   at most 10 MiB; unsupported types, mismatched signatures, oversized files and the per-Soldier cap must preserve saved
   data. The default cap is 100 MiB and counts active documents. Provider/SQL checks establish the concurrent cap
   boundary; an ordinary small upload is not cap proof. The isolated SQL contract
   `supabase/tests/personnel_document_cap_concurrency.sql` uses two real sessions waiting on the same dedicated Person
   lock, then requires one admitted insert, one cap failure, the exact final active-byte sum and unchanged
   archived/other-Person/foreign rows. Run it only through the Definition of Done’s fresh disposable database procedure.
   This establishes metadata concurrency, without a multipart, Storage, RLS or HTTP-status claim.

6. **Individual archive, restore and permanent deletion:** For each family, retain a new artifact's complete saved row
   and any file manifest. Fail its native Archive request, require the row still active and visible, restore the hook
   and retry. Reload the active tab and Archived: require the exact artifact ID only in its archived list and its saved
   archive event. Archive must preserve files. From Archived, fail Restore, require the same archived row visible and
   unchanged, then restore/retry visibly and reload both tabs; identity/content stay the same, archive clears and
   follow-up returns open with null completion. Archive again, fail Delete and require row/file preserved; restore/retry
   visibly and require that exact row absent after reload and both recorded file objects absent for the deleted
   counseling/document. After committed row deletion, failed file cleanup must report pending cleanup, retain a durable
   receipt and finish through an admitted retry or maintenance. A retry must report the saved deletion outcome rather
   than claim no effect. An ordinary authenticated DELETE of an active artifact must be rejected before row/file
   deletion, and a direct SQL DELETE of an active artifact row deletes nothing. Repeated binary/note archive returns its
   existing conflict; preserve the current restore behavior rather than introducing a new conflict expectation. Record
   the archive timestamp used for display separately from `updated_at`: an independently archived follow-up whose fields
   differ must display its saved `archived_at`, not an unrelated update time.

7. **Parent archive and historical independence:** Reuse [Personnel record lifecycle](personnel-records-lifecycle.md)'s
   single/bulk archive, replay/restore and approved-effect recipe rather than duplicating the whole parent journey.
   Extend it with newly uploaded real files and exact all-family rows. Active note/counseling/document and open
   follow-up share the parent's saved archive timestamp; completed follow-up and independently archived August items
   remain unchanged. Parent restore reopens only items with that exact parent event; original historical archive dates
   remain. Compare Training/ICT and A/B sentinels. This cascade is nontransactional and ordered; retain any partial
   failure and its repaired retry rather than claiming SQL atomicity. Parent file retention is separately owned proof
   and does not establish independently archived artifact retention.

8. **Configure reads, operate writes and denied scope:** As personnelScoped, open Alpha's same tabs and actual document
   Open; require only the recorded Alpha artifacts/file. Bravo, unassigned, empty-scope and foreign resources are denied
   or concealed according to admission/resource lookup, with no returned private fields or stored effects. As viewer and
   personnelOperate, capture actual detail/tab denial and authenticated GET collection/download denial: ordinary roster
   access does not grant sensitive records. Separately make a valid authenticated operate POST/PATCH against each
   allowed Alpha artifact and require its exact write while GET remains denied. Its archive, restore or status response
   contains only the artifact ID, archive time and follow-up status, never title, notes or file path; denied sensitive
   pages provide no native upload form, so this is API/provider proof. For a permitted Person, substitute another
   same-Organization Person's artifact ID and require 404/no row/file effect. Preserve A and B exact sentinels for
   denied create/archive/restore/delete, and use personnelForeign's successful B reads/file as the positive control.
   Direct Storage read/write/removal attempts must obey the same requested Organization/Group and configure/operate
   rules, and a direct counseling or document row write with a `file_path` outside its own Person's prefix is rejected;
   SQL and Storage effects remain separately identified from UI affordances.

9. **Raw and readable Organization exports:** Before deleting new artifacts, as orgOwner use Settings → Exports and
   download JSON and Excel through their native controls. Save the actual files and `$V rows data_exports orgA` / `orgB`
   lifecycle readbacks before and after each download. Compare new row IDs, requester, status, size and completion time
   with the actual artifact; export completion updates remain best-effort, so a successful download alone does not
   establish a completed lifecycle row. JSON `sections` and the retained artifact keys must contain complete
   same-Organization raw rows for active and archived counseling, document, follow-up and note, with IDs, stored
   contributor values and file paths intact; B rows must be absent. Readable Excel uses separate Counseling Records,
   Leader Notes, Personnel Follow-ups and Personnel Documents sheets, resolving Person labels and projecting fields.
   Document filename is the last stored path component; readable document sheets do not expose full `file_path`. Raw
   workbook sheets preserve the raw row fields. Compare exact raw values and readable cells against saved rows; a
   display label cannot replace raw author/uploader identity or a raw file path. An owner/admin Organization export can
   include all Groups independently of an ordinary member's sensitive-read lane. The `data_exports` INSERT policy
   permits owner/admin membership roles, so a member role fails lifecycle insertion before artifact construction.
   Focused route checks with a synthetic `canManageMembers` context and an in-memory lifecycle store cover delegated
   member-manager JSON/Excel admission; they do not prove a database-backed export. Ordinary members without
   member-management authority and foreign Organization requests receive the current denial with no new export lifecycle
   row or artifact. Settings UI entry is owner/admin only. Record failed download/lifecycle states and retry without
   claiming success from a toast.

10. **Single-Person workbook reverse consumer:** From the record header's `More Personnel record` menu select Export
    records and save the actual workbook. Its existing sheets are Personnel Info, Training Records, Counseling Records
    and Availability History, with same-Person counseling including archived history. This narrower workbook does not
    contain separate Documents, Follow-ups or Leader Notes sheets; the optional legacy Leader Notes information row is
    blank. Preserve the format, filename, content-disposition and scoped export policy. Compare title mirrored into
    stored `subject` and summary into `notes` for newly uploaded counseling, and retain unrelated training/availability
    facts permitted by the actor's ordinary database permissions. Personnel configure admits this workbook, but an
    ordinary member with Calendar none receives header-only Availability History. Use that same configure member with
    Calendar view and matching Person Group scope for complete admitted history; record any temporary grant and restore
    its original value after the positive export. Apply this distinction to the Alpha-scoped member too, retaining
    hidden/foreign parent denials. Owner/admin role access does not establish the ordinary Calendar-none negative case.
    A permission-filtered empty history is distinct from a source-read failure. Failure must show an export error
    without a successful download/audit. Do not treat this workbook as complete Organization artifact export proof.

11. **Person/Organization switching and late responses:** Use a fresh `$V seed personnel-artifact-context` and its
    `personnelContext` actor for positive configure-to-configure navigation. Preserve the temporary B membership,
    matched-slug A/B Persons, all sixteen artifact witnesses and eight real PDF path/size/hash readbacks. Existing
    `personnelSwitch` retains its configure-A/view-B denial contract. Open A through visible Personnel navigation; enter
    a distinct draft and selected file. Use the header's Organization menu to select B: its same-slug, same-tab route
    permits a reused page instance. Capture the B route/header, loaded B rows and empty A draft/picker; do not infer
    this from a full reload. Same-Person/Organization data refresh must preserve the current draft.

    For response ordering, arm a hold on one exact A artifact endpoint, submit natively and record `network state`
    showing the real response is held. This control holds delivery after the real fetch, so capture the admitted A
    row/file effect before switching; it does not cancel or roll back the server write. Switch through the visible
    Organization menu, enter a distinct B draft/file and release A. B's draft/file, loaded records, errors and
    independent pending controls must remain B's. Submit B normally and compare its actual ID/path/content after reload.
    Preserve Follow-up edit/status, Document Open and Archived local-list/action observations separately where changed:
    a late A Open must not open its URL while B is current, an old action's completion must not clear B's still-pending
    action, and a slow Log save must not close an editor the user has since opened on another row, nor one reopened on
    the same row: hold a follow-up Save, click a note, reopen the follow-up, type, then release; the newer draft stays
    open with its text. Ordinary provider/file readbacks are separate from native interactions.

    For a same-Person Overview refresh, enter counseling/document drafts and select their PDFs, then use Data sheet →
    Edit on the dedicated seeded Person to change its name and canonical slug. Preserve the same Organization/Person IDs
    and the actual saved parent change. After the resulting navigation reloads artifact streams, require both drafts and
    both native picker filenames/FileLists to remain visible; submit through their ordinary buttons without reselecting
    files, then compare exact saved rows and stored PDF hashes. Change that seeded Person's name again after successful
    uploads and require the refreshed native pickers to stay empty. Do not edit an original fixture Person for this
    probe.

    Repeat a same-Organization Person change through the visible roster and return to the same tab. That path unmounts
    the artifact page; it proves destination isolation but does not establish mounted prop reuse. Component checks cover
    Person-only mounted reuse and A→B→A while native matched-slug Organization navigation covers the actual reused
    route. A hook lost during full navigation earns no ordering credit. Save exact request statuses, visible values and
    A/B effects; receiving a signed URL alone is not file access. Restore hooks, archive/delete only newly created UI
    artifacts through admitted ordinary actions, prove their recorded file paths absent, then clean the recorded seed
    and temporary membership. Nested data-sheet/approval callbacks and server cancellation are outside this
    artifact-isolation observation.

12. **Separate artifact retention:** Use a fresh owned `$V seed artifact-retention` setup for expired, recent and active
    artifacts on retained active A/B Persons, real counseling/document file witnesses and unrelated file sentinels. Use
    `artifact-retention-1001` in a separate fresh run for provider-sized cohorts and final-ID file witnesses. Preserve
    its classified rows, parent IDs, returned markers and actual files; dense metadata-only paths do not prove stored
    bytes. Verify the reported default assumption through `$V retention settings`. B controls must be unexpired because
    the job processes all Organizations. Prove exact cutoff equality separately in fixed-time operation checks; the live
    fixture does not freeze the application clock. Record exact IDs/timestamps/bytes before the admitted job call.
    Missing/wrong-secret admission must have no effects. The admitted run removes only rows strictly before the cutoff,
    follow-ups only when archived, and only deleted rows' files; active/recent/cutoff-equal/foreign rows and sentinels
    remain. Reload each Person's Archived tab and capture actual count-only administrator notification. Repeated
    admitted runs have zero new row deletions and may continue pending file cleanup. Provider-sized sets must prove
    complete conditional deletions and counts with bounded request URLs. Inspect every eligible and retained ID
    independently. Inject database-delete and Storage failures separately and inspect actual rows, receipts and files.
    Each file-bearing deletion transaction records pending cleanup for keys no longer referenced; files are removed only
    after that transaction commits. Recheck the strict cutoff at mutation time so a restored or re-archived row survives
    a stale candidate. A failed family may follow earlier committed families; pending cleanup still drains
    independently. Storage or completion failure must leave retryable work, including when the bytes are already absent.
    A later maintenance pass must complete the receipt while preserving active, recent and foreign files. Each pass
    removes at most 1,000 queued file keys. `files.limitReached` means its page budget ended on a full page, so more
    work may remain. Repeat admitted passes until `limitReached` is false and `failed` is zero, then prove every
    recorded expired marker absent and retained bytes unchanged. A false limit flag with failures does not mean cleanup
    is complete. Real two-session SQL checks establish restore/delete ordering separately from these live fixtures.
    Existing `personnel-retention` fixtures chiefly prove expired-parent cascade; retain their applicable observations
    separately from these active-parent artifact runs. Use `$V retention files` after row deletion to inspect every
    recorded real path; compare complete parent/child rows and retained file sizes/hashes, then clean only recorded
    seeds and dispose the owned worker. Fixture availability is preparation, not a passing result.

13. **Tab refresh shape.** As `orgOwner`, from Able's Overview clear Resource Timings and click each of Log, Files,
    Archived and Overview. Each click sends one `<tab>/__data.json` with `x-sveltekit-invalidated=00001` and no `/api/*`
    request, and the tab badges keep their settled counts. Log and Archived stream their lists behind shaped skeletons
    with their own error state. Each Log and Files skeleton holds one record at its loaded row's height, so a Person
    with one record keeps everything below in place and an empty Person moves by less than one row. Hold one with
    `$V server-source arm personnel_follow_ups|leader_notes|counseling_records|personnel_documents hold 1 120000`,
    choose the tab, measure, then release and restore. A Log write (add, complete or archive a follow-up or note) or an
    Archived restore/delete updates the Log and Archived badges by invalidating `app:personnel-detail-counts` alone,
    with no page data reload.

Exact browser fetch endpoints use fixture UUIDs, not the visible Organization slug. Collection POST/GET paths are
`/org/ORG_ID/api/personnel/PERSON_ID/follow-ups`, `/leader-notes`, `/counseling-records` and `/documents`. Item
PATCH/DELETE appends the saved artifact ID. Binary/note PATCH uses `{ action: 'archive' }` or `{ action: 'restore' }`;
Follow-up PATCH uses `{ status: 'open'|'completed'|'archived' }`, its complete edit fields, or `{ action: 'restore' }`.
Documents Open uses `/documents/DOCUMENT_ID/download`. For A, arm
`$V network arm-fail PAGE personnel/PERSON_ID/documents` or the corresponding exact family/item; `arm-hold` and
`arm-observe` take the same path. Preserve `$V network state PAGE`, then use `release` for held responses and `restore`
before the next probe. The network helper targets A's UUID endpoint only; a B native interaction earns no
injected-failure credit from that hook. A collection hook does not cover its item or download requests. Helper batch
fields `count: 0`/`ids: []` on multipart and ordinary item requests are not payload proof.

For the two retained private buckets, run `$V private-buckets` after the owned worker passes `doctor`. Expect
`public:false` and `fileSizeLimit:10485760` for both buckets. `personnel-documents` accepts PDF, JPEG, PNG, HEIC and
HEIF; `counseling-files` accepts PDF only. Compare MIME sets without relying on ordering. This service-role
configuration readback is separate from native uploads, ordinary file authorization and hosted configuration parity. A
provider error is a failed readback, never a missing or correctly configured bucket.

## Provider faults and recovery

These cases expect recoverable file cleanup and preserved committed uploads. Use the owned provider controls documented
in the skill, preserve every `fault state` receipt and restore each fault before retry or cleanup.

- Upload a real synthetic document or counseling PDF through the native form with its `document-attach-lost-ack` or
  `counseling-attach-lost-ack` fault armed. The provider commits the metadata row but the app receives 503. Read back
  the exact row and file hash. A lost reply must not cause compensation to delete a file referenced by a committed row.
  Record the visible saved or uncertain state, reload, and inspect whether retry can create a duplicate.
- Archive a real uploaded document or counseling and arm `document-file-remove` or `counseling-file-remove`. Confirm
  Delete natively. Preserve the exact metadata, recorded file path and bytes, actual error or completion response, and
  any durable cleanup work. Reload before retry. Read the durable receipt with
  `$V artifact-deletion orgA PERSON_ID document|counseling ARTIFACT_ID`. This privileged readback is separate from
  ordinary retry authorization. Cleanup must remain discoverable after metadata deletion; a missing row alone is not
  recovery. Restore the control and drive the implemented retry or admitted maintenance path. Verify the recorded path
  is absent and unrelated active, recent and foreign files remain unchanged.
- Repeat removal with the matching `-lost-ack` fault. Its receipt must show the real provider succeeded before the
  synthetic 503. Recovery must converge when the file is already absent, without touching another file or inventing a
  rollback.
- Use the [deletion request provider-failure case](deletion-requests.md#driving-it-with-verifyapp) for an approval whose
  status write is rejected. The losing approval must preserve the source row and its bytes. Actual competing terminal
  reviewers and restore-versus-delete require separate isolated SQL or service interleaving proof, not a browser
  response hold.

## Gotchas

- Archive, Open, Restore and Delete repeat per item. Use a fresh snapshot and the named row; preserve the selected ID
  alongside the action. Delete opens a destructive `Delete archived item` confirmation: Cancel and Escape send nothing
  and return focus to Delete. Pressing the active filter option again keeps it chosen. Confirm keeps the dialog open and
  busy (Cancel, Confirm disabled, Escape ignored) until the DELETE settles; a failure keeps it open with a destructive
  Alert and Confirm retries; success closes it and focus goes to the next row's Restore, else the previous row's, else
  the `Archived` heading. The seeded document is metadata only. Its deletion must succeed when Storage confirms the
  object is already absent.
- The recorded outcome comes from visible actions plus saved row/file readback and reload. A closed form, disappearing
  card, signed URL or success toast alone is insufficient.
- A counseling PDF opens from its `DA 4856 · PDF` chip through the same Group scope and sensitive-read policy as the
  list. Compare the opened bytes with the stored object.
- Expect the note author fallback and 100-row composite-cursor traversal with complete legacy arrays; a small native
  list does not re-prove tied-timestamp or large-collection coverage.
- File cleanup crosses Storage/database calls. Document and counseling row deletion records cleanup in the same database
  transaction. Counseling approval commits its row/status transaction before removing bytes. A retired key cannot be
  reused. Pending cleanup is retried by the archive-retention job; this does not make Storage transactional.
- Lower-level checks cover what the browser cannot: Personnel `personnelCounselingRecords.server.test.ts`,
  `personnelDocuments.server.test.ts`, `personnelFollowUps.server.test.ts`, `personnelArchivedArtifacts.server.test.ts`,
  `personnelArtifactContext.server.test.ts`, delivery `personnelArtifacts.test.ts` (real SDK serialization under
  controlled finite REST), Organization member-label/document-cap collaborator tests; Personnel
  `personnelArtifactRetention.server.test.ts`, `artifactWrites.server.test.ts`, `leaderNotes.server.test.ts`,
  `governanceDeletion.server.test.ts`, `personnelLifecycle.server.test.ts` and
  `personnelLifecycleCommands.server.test.ts`, `personnelExport.server.test.ts` and `organizationExport.server.test.ts`;
  artifact draft/workspace/component tests; counseling/documents/notes page tests and artifact JSON/download route
  tests.
- Run isolated SQL through the
  [Definition of Done](../../../../docs/architecture/DEFINITION_OF_DONE.md#isolated-database-checks):
  `personnel_sensitive_artifact_reads.sql`, `personnel_counseling_file_scope.sql`,
  `personnel_artifact_rls_group_scope.sql`, `personnel_leader_note_traversal.sql`,
  `counseling_deletion_approval_atomic.sql`, `personnel_lifecycle_atomic.sql`, `personnel_lifecycle_concurrency.sql`,
  `personnel_lifecycle_cohort.sql` and `feature_direct_write_authority.sql`. These establish RLS, Storage paths,
  traversal and request/record boundaries separately from native UI and authenticated HTTP. Never aim them at a remote
  or existing local database.
- Before cleanup, compare retained rows/files and run a final `doctor`. Record unrun retention and provider boundaries
  as unrun.

## Viewer day

With a browser zone whose day differs from UTC (see the [skill](../SKILL.md#launch)), add a leader note and attach a
document. The Log tab's notes (`14 Oct` over `2026`) and the Overview Documents card must show the browser day, matching
the Files tab's documents (`14 Oct 2026`) and counseling uploads (`uploaded 14 Oct`), not the UTC date of the stored
timestamp.
