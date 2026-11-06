# Audit capture and safe projections

Organization owners and administrators inspect their own activity summaries; the platform operator investigates saved events across
Organizations without disclosing those privileged details to anyone else.

## Sub-features

- `capture`: a real producer's event keeps its meaning, actor, Organization and resource references; risky freeform
  details and unauthenticated email identifiers are masked before storage. Required platform events retain target
  labels; those without an Organization also retain the actor's email and typed reason.
- `organization-log`: owner and administrator summaries in newest-first order, read 50 at a time from the server, with
  Load more and a `more available` or `end of the log` footer.
- `log-filters`: Person, Member, Kind and a From/To day range, each held in the address (`person`, `member`, `kind`,
  `from`, `to`), so reload, Back and Forward keep them. Changing one resets paging and reads only the entries. An entry
  older than the newest 100 is found by each filter.
- `record-capture`: the database writes every Calendar availability add, change and removal in the same transaction
  as the change, with the actor, status, person and dates saved as labels. A later rename or deletion does not change
  the sentence. A change shows its dates before and after. One bulk add, import or removal writes one entry per row
  under one batch, which Logs shows as one line that opens to its rows.
- `family-capture`: the same holds for Personnel, Training, Critical Tasks, Onboarding, Groups, the Calendar
  catalogs, and Calendar events and taskings with their equipment and checklist items. A change made through the member's own session is audited by the database in the same transaction, with the
  signed-in member as Actor and saved labels for the record and, for a person's record, the person (`<rank> <last>,
<first>`). A change the server makes with its own authority (a leader note, counseling record, document, export or
  deletion request) is written by the app, awaited, and fails the change if the write fails. Seeded fixture rows are
  written by the database with no signed-in member and read `System`.
- `streamed-load`: Logs paints its header and filters at once, holds the results skeleton while the audit read runs and
  shows its own load error, with retry, when that read fails. A failed Load more keeps the rows above it and offers its
  own Retry.
- `actor-label`: an event's Actor is the member's stored membership email, else their account identity email. A former
  member with no membership row stays `Unknown member`. Most fixture memberships have a null email, which exercises the
  fallback; `deletionRequester` and `deletionReviewer` must show their addresses after a denied bulk archive.
- `safe-labels`: authorized page data resolves only same-Organization Personnel, Training and Calendar labels, preserves
  saved masked values and strips remaining top-level string UUID details.
- `platform-log`: operator-only Activity at `/admin/activity`, stored details, paging and category/search/date filters.
- `denial-and-recovery`: member/foreign denial, failed page navigation and retry, and target changes without
  cross-Organization disclosure.

## How to get to it (user POV)

As an Organization owner or administrator, open Settings and Logs. Narrow it by Person, Member, Kind and a From and To
day, then use Load more to read older entries. Rows sit under day heads in the viewer's time zone. The
screen shows one-sentence summaries (Time, Area, Event and Actor), with before and after values only where the saved
details carry them, not event details. As the platform operator, open Admin and Activity; filter by category, search or
date, navigate pages and open a row's `Details` disclosure. Members without administrator access have no Audit Log admission.

## Driving it with verify:app

### Helper controls

Scheduled maintenance is headless service proof. Use `seed maintenance-retention` for expired/unreferenced and
saved-reference Critical Tasks and Calendar types, active/recent A/B sentinels, old/recent A/B Audit events and six
account setup lifecycle classes with retained Access Requests. `maintenance-retention-1001` creates 1,001 eligible rows
in each library and 1,001 expired-unused setup links; clean the small cohort first. Setup journals exact targets before
writes. `retention maintenance` reads only recorded targets in batches, omitting setup token hashes; `clean-seeds`
removes those recorded rows in dependency order. This is privileged synthetic setup/readback, separate from ordinary
service admission.

`retention cron missing|wrong|run records|onboarding|audit|setup-links` invokes each configured job on the owned origin
without browser/session cookies. Capture status, any redirect and full response, then exact row/file and notification
readback. Missing/wrong credentials must return 401 without effects; admitted jobs must report actual effects and
preserve ineligible/history witnesses. Repeat to prove zero new mutations and truthful repeated summaries. Audit retains
a one-year strict cutoff; setup cleanup revokes expired unused links and preserves claimed/completed/failed history,
Access Requests and User Accounts. A redirect to sign-in is a failed admission observation, not an authorized job run.
`records` runs the archived-records job. The Personnel, artifact and Onboarding recipes own their source-specific setup,
failure and provider-sized proof. Exact cutoff equality belongs to fixed-time service/SQL checks; these live fixtures do
not freeze the application clock. External schedules are uninspected.

Audit verification uses the [capture/projection recipe](audit-capture-projections.md), existing Organization
owner/admin/member roles, the platform operator and `seed audit`. The seed records all temporary A/B audit
IDs before writes; `clean-seeds` uses their `org_id` scope. `actor` accepts `settings/logs` and `admin/audit` (which redirects to `/admin/activity`); ordinary
Organization actors may attempt the admin destination for denial. `rows audit_logs orgA|orgB` also accepts `action`. The
`audit-page` network family matches only A's `settings/logs/__data.json` navigation request, using its current canonical
URL segment. It establishes client failure/retry separately from provider failures.
`audit-training-update PAGE orgA|orgB JSON` sends a bounded ordinary authenticated PUT to `personnel-trainings`,
accepting a saved synthetic UUID plus Notes/completion/expiration fields. Capture original fields and restore them
through the same interface; this is separately identified HTTP producer proof, distinct from the native editor’s POST.
Privileged stored-event setup, native producer actions, authenticated page-data disclosure and visible UI are distinct
proof.

### Journeys

Run `doctor` for the selected owned worker, then `$V fixture`. Reuse `orgOwner` (A owner), `orgAdmin` (A administrator),
`orgMember`/`viewer` (A member), `orgSettingsPeer` (B owner), `platformReviewer` (the platform operator) and `platformSupport`
(no operator row). `$V actor ROLE settings/logs` and `$V actor ROLE admin/audit` sign in with a provider session, which writes
no `auth.login_success` event; step 5 uses the form for the sign-in producer. Ordinary Organization actors can attempt
the admin destination to observe denial; no role is elevated by the helper.

Capture original A/B audit rows before `$V seed audit`. The seed records 105 recent A events, one old A event (1 Jan
2000, saved person `personA`, member `orgAdmin`, kind `personnel.updated`, so each Logs filter reaches it only past the
newest 100), four excluded authentication/rate-limit events and one B sentinel, with every ID saved before insertion. Its returned
action/tag/witness IDs identify label, system, legacy actor and foreign-reference cases.
`$V rows audit_logs orgA|orgB [id|action VALUE]` supplies separate privileged provider readback. These seeded values are
stored-event prerequisites, not producer sanitization or ordinary authorization proof.

1. **Owner log, filters and paging.** Sign in as `orgOwner`, open Logs through Settings, and capture day heads, the
   Time/Area/Event/Actor cells and the footer, which reads `50 entries loaded · more available` and a `50+` count on the
   cut-off day. Press Load more until the footer reads `end of the log` and compare the loaded count with the
   nonexcluded A provider rows (`$V rows audit_logs orgA`): they match, and seeded authentication/rate-limit actions and
   B's event stay out. A deletion's Area reads in the destructive color. System and the saved legacy actor appear for
   their witnesses. Then find the old A row (it is past the newest 100) by each filter in turn. Open `Person`, type the
   name and press Enter (`SPC Able, Synthetic`); the URL gains `?person=` and the list reads `3 entries loaded · end of
the log`, with the 1 Jan 2000 entry under its own day head. A note under the Person filter says entries written
   before people were recorded match by member, kind and date only. Clear it, choose Member `orgAdmin…` (`?member=`),
   Kind `Personnel updated` (`?kind=personnel.updated`) and the From picker's day (`?from=`): each narrows the list. Open
   `?from=2000-01-01&to=2000-01-01` for the old entry, `?to=1999-12-31` and `?from=2000-01-02&to=2000-12-31` for `No
entries match these filters` with `Clear filters`: both dates are inclusive days in the viewer's zone. Back returns to
   the previous filter, Forward restores the next, reload keeps both. In the Network list a filter change is one
   `settings/logs/__data.json?x-sveltekit-invalidated=00001` request (page load only, not the layout) and Load more is one
   `api/audit-log?after=…` request.
2. **Page-data labels and disclosure.** From that normally admitted page, make a read-only same-origin GET to its
   `settings/logs/__data.json` through native `evaluate_script` or inspect the actual navigation response. Preserve
   status and the complete response separately from the visible summary. Inspect the known enriched witness: same-A
   rank/name, Training type and Calendar status resolve; remaining top-level UUID details disappear; stored
   `[redacted]`/masked email remain. Foreign/missing references must not resolve to B labels. Actor membership email is
   an authorized owner disclosure; a null actor displays System. The returned event/user/resource identifiers are
   retained references, distinct from stripped detail values.
3. **Role and target denial.** Sign in as `orgAdmin` and open Logs: the nav shows `Logs` without the `Owner` tag and the
   page lists the same A summaries as the owner's. Sign in separately as `orgMember`/`viewer`, attempt Logs, and record
   the visible denial plus an ordinary authenticated page-data response without audit rows. From that session a
   same-origin GET of `api/audit-log?after=…` returns 403 as well; as `orgAdmin` it returns 200 with
   `private, no-store`, and a missing or malformed `after` returns 400. As B-only `orgSettingsPeer`, try
   the recorded A URL and repeat the ordinary response check; its own B Logs must contain the B sentinel and no A
   cohort. As the admitted A owner, navigate to B and confirm denial rather than accepting A's stale summaries as B
   data. `platformSupport` and an ordinary member must be denied full `/admin/audit`, including page-data responses. UI
   affordances, authenticated HTTP and provider reads are distinct evidence.
4. **Platform paging and filters.** Sign in as `platformReviewer`; `admin/audit` lands on `/admin/activity`. Activity
   lists registered actions, plus platform prefixes such as `security.` at the `All` scope, so `seed audit`'s
   `verification.audit_*` rows do not appear here; use real events such as the failed sign-in below. Choose a category
   radio and a search term, check the URL holds them and the rows match both, then reload. Open a row's `Details`
   disclosure, inspect saved masked details (platform reads retain raw saved identifiers), and reload. The
   People detail returns recent activity with saved `details` and `ipAddress` after platform-administrator admission;
   the Organization detail projection omits details/IP/user-agent. Capture both separately from full Activity and keep
   ordinary-member/support denial checks separate.
5. **Actual producer.** Through the normal sign-in form submit one synthetic failed login with a unique domain such as
   `synthetic@d19-TAG.example.test` (the local part is masked); verify `auth.login_failure` persists, email is masked
   and no submitted password is recorded. This event has no Organization: correlate the unique masked domain through the
   admitted Platform Audit page data, rather than the A/B-scoped provider helper. Separately open an existing Training
   matrix cell, change its Notes in Edit Training Record and Save. Read the actual `training_record.updated` event and
   verify its actor/resource/Organization, then reload/reopen to confirm persistence. A first save of an empty cell
   writes `training_record.created` and a later change `training_record.updated`; both carry saved labels for the
   Training type and the person. Restore the original completion fields through the editor and read them back. Use
   `$V audit-training-update PAGE orgA JSON` with the saved record `id` and a Notes change for separately identified
   ordinary PUT proof, and read the event, admitted owner labels and privileged raw saved details separately. The
   notes text itself is never saved, only that it changed. Restore the original Notes through the same helper. Seeded
   page-data witnesses establish label projection, not that PUT's writing. Native producer, privileged
   readback and display each establish their own boundary.
6. **Navigation failure and retry.** On a fresh owner General Settings page, focus Logs with native keyboard controls,
   arm `$V network arm-fail PAGE audit-page`, then press Enter. Avoid hover prefetch consuming the one-shot failure
   before navigation. This matches only A's Logs page-data GET. Capture the failed navigation, matched 503 and visible
   error, restore the hook and select Logs/reload successfully. A failed audit read after navigation is step 7's in-page
   error, not this one. This proves client navigation recovery; it does not
   simulate a provider error or establish audit-writer failure guarantees. Provider/query/writer failure guarantees
   require separately identified lower-level proof.
7. **Streamed load and load error.** As `orgOwner` on Logs at 1280x900 light, `$V server-source restore`, arm
   `$V server-source arm audit_logs hold 1 60000` and reload. The header, subtitle and the Person, Member, Kind, From and
   To controls render at once and stay usable; below them the results skeleton (a header row and six rows) sits in an
   `aria-busy` region. Record the top and height of the `h1`, the `Filter the audit log` group and the skeleton's header
   row. `server-source release` and record the same for the group and the table header: the `h1` and group match
   exactly and the header row starts at the same top. `restore`, arm `fail-hard 1` and reload: a destructive alert
   `Unable to load Audit log` with `Retry Audit log` replaces the results under the same header and filters, and the
   settings nav still works. `Retry Audit log` renders the log. With the page loaded, arm `fail-hard 1`, press Load more:
   an alert reads `The next entries could not be loaded. The entries above are unchanged.` with `Retry`, the footer still
   reads 50 entries, and `restore` then Load more reads 100. Repeat at 1024x800 and 390x844, where the filters stack
   in one column and nothing scrolls sideways (`scrollWidth` minus `clientWidth` is 0 on the document, `main` and the
   table). Hold the load with `$V network arm-hold PAGE audit-page` from General Settings (arm before the reload, then
   focus Logs and press Enter, so the viewport prefetch does not use it up) and read the header block's height and the
   next block's top while the skeleton shows and again after `release`: at 390x844 they are 108 and 273 and at
   1024x800 120 and 236 both times, because the subtitle holds two lines at either width whatever the unit is called.
   For the empty state, create a unit through [Organization creation](organization-creation.md), which starts with one
   System entry per federal holiday it seeds; clearing those rows in the owned worker's own provider leaves
   `No audit log entries yet.` with no filters and no Clear filters button, which holds at 390 and 1024 without
   sideways scroll.
8. **Calendar availability capture.** As `calendarOperate`, follow [availability status](availability-status.md) to add
   a status for a fixture person, drag its end a day later, then remove it. As `orgOwner` the Logs Calendar rows read
   `Added <Status> for <Rank> <Last>, <First> from <d Mon> to <d Mon>`, `Changed <Status> for … from <d>–<d Mon> to
<d>–<d Mon>` and `Deleted <Status> for …`, each with the operator as Actor. `$V rows audit_logs orgA action
availability.updated` shows saved `actor_label`, `record_label`, `subject_label`, a `batch_id` and the dates in
   `details`; a note change saves `note: {withheld: true}`, never the note. Rename that person through Personnel and
   reload Logs: the three sentences keep the old name. Then, through [bulk status](bulk-status.md) Add, save one status
   for two people. Logs shows one line `Added 2 availability entries`, a button with `aria-expanded="false"`; Enter
   opens a row per person and search for one surname still finds the line. Remove those two through bulk Remove and
   read `Deleted 2 availability entries` the same way. Restore the rename.
9. **Family capture.** As `orgOwner`, make one ordinary change per family and read each in Logs and with
   `$V rows audit_logs orgA action <kind>`. Quick edit a person's Duty role on Personnel (`personnel.updated`, Event
   `Changed SPC Able, Synthetic: role Medic → Senior Medic`). Add `Charlie` in Manage Groups (`group.created`,
   `Added Group Charlie`). On Training, open an empty cell and Save (`training_record.created`, `Added training
record <type> for <person>, completed <d Mon>`). On ICTLs, open an empty cell, pick a date and a validation method,
   Save (`personnel_ict_completion.created`). On Onboard, Start onboarding for a person
   (`onboarding.started`, `Started onboarding for <person> (<template>)`). On a person's page, Add to record then
   Note (`personnel.leader_note.created`, `Added a leader note for <person>`, empty `details`, `subject_label` filled
   by the database). In Calendar Settings, Add new status type (`status_type.created`). On Events, add an event (`calendar_event.created`, `Added event <title> from <d Mon> to <d Mon>`), then cancel
   it (`calendar_event.cancelled`; the reason is never saved). On a Tasking, Start it (`calendar_tasking.started`).
   A roster Fill writes one `daily_assignment.created` per day under one batch, which Logs folds into one line. Every one of these shows the
   owner's email as Actor, while the fixture's own rows show `System`. Then rename the person (Last name in Quick
   edit): the earlier sentences keep the old name and the rename reads `Changed SPC Alder, Synthetic: name Able,
Synthetic → Alder, Synthetic`. Restore the name. The Add onboarding Member picker lists names only on screen, not
   in the snapshot; type, press ArrowDown and Enter. The ICT dialog needs a Validation Method before Save.
10. **Organization export reverse consumer.** As the owner, open Settings and Data Export, arm the maintained
    export/observe controls, and download actual JSON and Excel through their visible buttons. Inspect the complete saved
    Audit section/sheet: same-A stored rows and raw masked fields remain, including excluded auth actions; B's sentinel
    must be absent. Compare against an independently captured A provider set before export, accounting separately for the
    legitimate post-build event (`export.created` for JSON; `export.excel_created` for Excel). Capture real network
    status and downloaded bytes, restore both controls, and keep the actual files.

Restore hooks and edited originals, run `clean-seeds`, and read every seed ID back as absent in its recorded
Organization. Original audit rows must retain their saved fields; expected producer/login additions remain confined to
this disposable provider until owned cleanup.

## Gotchas

- Organization Logs admits owners and administrators, in app policy and in the `audit_logs` read policy alike. Support's Feedback access
  does not grant full Platform Audit access.
- Audit display enrichment is not a second sanitizer. Historical raw saved details are not retroactively masked by
  either query; synthetic raw-secret inserts cannot be counted as producer masking tests.
- Stripping applies to top-level string UUID detail values. It does not remove event identity, resource/user references
  or platform raw saved details, and does not promise recursive removal.
- Organization Logs and Platform Audit both read server pages of 50. Logs pages by entry, so a bulk batch that spans a
  page boundary reads `Added at least N entries` until the next page arrives. The first load has no whole-table count.
- The Logs pickers do not expose their options to `take_snapshot` or the `option` role in `click`. Click the picker
  button, then `type_text` the name and press Enter, or read the options with `evaluate_script`
  (`() => [...document.querySelectorAll('[role=option]')].map((o) => o.textContent.trim())`). Most fixture members have
  no email, so their Member option reads as an ID prefix.
- `api/audit-log` rejects a request without a valid `after`, because the first page arrives with the Logs page load.
- A bare `server-source arm audit_logs hold` can release before a slow capture finishes; pass `hold 1 60000`. Arming
  while a hold is still active is refused as a conflicting control, so `restore` before each arm. Save screenshots
  with `take_screenshot`'s `filePath`; `--save` writes the tool's JSON response, not a PNG.
- Native select filling matches visible option text. Use keyboard selection/deletion to clear search or Notes when an
  empty `fill` does not fire an input event. Verify Logs is actually keyboard-focused before arming its failure;
  same-route navigation can reset focus.
- Source-owned Personnel, Training, Calendar and Organization label-reader SDK tests separately protect archived/partial
  names, null/empty type names, exact membership emails, empty references, complete provider pages and whole-read
  failures. Settings composition and route tests bind those real readers after owner admission, including an owner with
  no feature grants. `auditLogQuery`, writer, platform service/adapter, settings route and admin adapter tests retain
  separate behavioral/security obligations. The timestamp-index SQL test proves its index only. Do not run cleanup jobs
  merely to prove audit reads.
