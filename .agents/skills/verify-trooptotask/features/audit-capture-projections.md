# Audit capture and safe projections

Organization owners inspect their own activity summaries; the platform operator investigates saved events across
Organizations without disclosing those privileged details to anyone else.

## Sub-features

- `capture`: a real producer's event keeps its meaning, actor, Organization and resource references; risky freeform
  details and unauthenticated email identifiers are masked before storage.
- `organization-log`: owner-only summaries, newest-first ordering, search, sorting, 25-row client pages over the latest
  100 loaded records, counts and reload.
- `safe-labels`: authorized page data resolves only same-Organization Personnel, Training and Calendar labels, preserves
  saved masked values and strips remaining top-level string UUID details.
- `platform-log`: operator-only Activity at `/admin/activity`, stored details, paging and category/search/date filters.
- `denial-and-recovery`: admin/member/foreign denial, failed page navigation and retry, and target changes without
  cross-Organization disclosure.

## How to get to it (user POV)

As an Organization owner, open Settings and Logs. Narrow it with the All, Access, Records and Deletions scopes, search
or sort the table and use its Newer and Older paging controls. Rows sit under day heads in the viewer's time zone. The
screen shows one-sentence summaries (Time, Area, Event and Actor), with before and after values only where the saved
details carry them, not event details. As the platform operator, open Admin and Activity; filter by category, search or
date, navigate pages and open a row's `Details` disclosure. Organization administrators have no Audit Log admission.

## Helper controls

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

## Driving it with verify:app

Run `doctor` for the selected owned worker, then `$V fixture`. Reuse `orgOwner` (A owner), `orgAdmin` (A administrator),
`orgMember`/`viewer` (A member), `orgSettingsPeer` (B owner), `platformReviewer` (the platform operator) and `platformSupport`
(no operator row). `$V actor ROLE settings/logs` and `$V actor ROLE admin/audit` sign in with a provider session, which writes
no `auth.login_success` event; step 5 uses the form for the sign-in producer. Ordinary Organization actors can attempt
the admin destination to observe denial; no role is elevated by the helper.

Capture original A/B audit rows before `$V seed audit`. The seed records 105 recent A events, one old A event, four
excluded authentication/rate-limit events and one B sentinel, with every ID saved before insertion. Its returned
action/tag/witness IDs identify label, system, legacy actor and foreign-reference cases.
`$V rows audit_logs orgA|orgB [id|action VALUE]` supplies separate privileged provider readback. These seeded values are
stored-event prerequisites, not producer sanitization or ordinary authorization proof.

1. **Owner summary and loaded window.** Sign in as `orgOwner`, open Logs through Settings, and capture counts, day
   heads, visible Time/Area/Event/Actor cells and the Newer/Older controls. Compare the page's loaded IDs with the
   newest 100 nonexcluded A provider rows; do not claim access to older rows through client pagination. Move to another
   page, search the unique seeded event, pick a scope that holds it and one that does not, reverse Time sorting, sort by
   Area (day heads disappear), clear the search and reload. A deletion's Area reads in the destructive color. Check that
   System and the saved legacy actor appear for their known witnesses. Seeded authentication/rate-limit actions and B's
   event must stay out of A summaries/counts. The old A row counts toward total but not this month, which starts at
   midnight on the first of the viewer's month.
2. **Page-data labels and disclosure.** From that normally admitted page, make a read-only same-origin GET to its
   `settings/logs/__data.json` through native `evaluate_script` or inspect the actual navigation response. Preserve
   status and the complete response separately from the visible summary. Inspect the known enriched witness: same-A
   rank/name, Training type and Calendar status resolve; remaining top-level UUID details disappear; stored
   `[redacted]`/masked email remain. Foreign/missing references must not resolve to B labels. Actor membership email is
   an authorized owner disclosure; a null actor displays System. The returned event/user/resource identifiers are
   retained references, distinct from stripped detail values.
3. **Role and target denial.** Sign in separately as `orgAdmin` and `orgMember`/`viewer`, attempt Logs, and record the
   visible denial plus an ordinary authenticated page-data response without audit rows. As B-only `orgSettingsPeer`, try
   the recorded A URL and repeat the ordinary response check; its own B Logs must contain the B sentinel and no A
   cohort. As the admitted A owner, navigate to B and confirm denial rather than accepting A's stale summaries as B
   data. `platformSupport` and an ordinary member must be denied full `/admin/audit`, including page-data responses. UI
   affordances, authenticated HTTP and provider reads are distinct evidence.
4. **Platform paging and filters.** Sign in as `platformReviewer`; `admin/audit` lands on `/admin/activity`. Activity
   lists registered actions only, so `seed audit`'s `verification.audit_*` rows do not appear here; use real events such
   as the failed sign-in below. Choose a category radio and a search term, check the URL holds them and the rows match
   both, then reload. Open a row's `Details` disclosure,
   inspect saved masked details (platform reads retain raw saved identifiers), and reload. The
   User/Organization detail pages show recent activity references but must return no event details/IP/user-agent in
   their reduced activity DTOs; capture both separately from full Audit admission.
5. **Actual producer.** Through the normal sign-in form submit one synthetic failed login with a unique domain such as
   `synthetic@d19-TAG.example.test` (the local part is masked); verify `auth.login_failure` persists, email is masked
   and no submitted password is recorded. This event has no Organization: correlate the unique masked domain through the
   admitted Platform Audit page data, rather than the A/B-scoped provider helper. Separately open an existing Training
   matrix cell, change its Notes in Edit Training Record and Save. Read the actual `training_record.updated` event and
   verify its actor/resource/Organization, then reload/reopen to confirm persistence. Restore the original completion
   fields through the editor and read them back. The native editor uses POST upsert and records empty details; it does
   not produce label references. Use `$V audit-training-update PAGE orgA JSON` with the saved record `id` and a Notes
   change for separately identified ordinary PUT proof. It supplies Personnel/Training references; read the event,
   admitted owner labels and privileged raw saved details separately, and restore the original Notes through the same
   helper. Seeded page-data witnesses establish label projection, not that PUT's writing. Native producer, privileged
   readback and display each establish their own boundary.
6. **Navigation failure and retry.** On a fresh owner General Settings page, focus Logs with native keyboard controls,
   arm `$V network arm-fail PAGE audit-page`, then press Enter. Avoid hover prefetch consuming the one-shot failure
   before navigation. This matches only A's Logs page-data GET. Capture the failed navigation, matched 503 and visible
   error, restore the hook and select Logs/reload successfully. This proves client navigation recovery; it does not
   simulate a provider error or establish audit-writer failure guarantees. Provider/query/writer failure guarantees
   require separately identified lower-level proof.
7. **Organization export reverse consumer.** As the owner, open Settings and Data Export, arm the maintained
   export/observe controls, and download actual JSON and Excel through their visible buttons. Inspect the complete saved
   Audit section/sheet: same-A stored rows and raw masked fields remain, including excluded auth actions; B's sentinel
   must be absent. Compare against an independently captured A provider set before export, accounting separately for the
   legitimate post-build event (`export.created` for JSON; `export.excel_created` for Excel). Capture real network
   status and downloaded bytes, restore both controls, and keep the actual files.

Restore hooks and edited originals, run `clean-seeds`, and read every seed ID back as absent in its recorded
Organization. Original audit rows must retain their saved fields; expected producer/login additions remain confined to
this disposable provider until owned cleanup.

## Gotchas

- Organization Logs is owner-only despite the broader Settings shell admitting administrators. Support's Feedback access
  does not grant full Platform Audit access.
- Audit display enrichment is not a second sanitizer. Historical raw saved details are not retroactively masked by
  either query; synthetic raw-secret inserts cannot be counted as producer masking tests.
- Stripping applies to top-level string UUID detail values. It does not remove event identity, resource/user references
  or platform raw saved details, and does not promise recursive removal.
- Organization summaries use client pages over a bounded latest-100 load; Platform Audit uses server pages of 50.
- Native select filling matches visible option text. Use keyboard selection/deletion to clear search or Notes when an
  empty `fill` does not fire an input event. Verify Logs is actually keyboard-focused before arming its failure;
  same-route navigation can reset focus.
- Source-owned Personnel, Training, Calendar and Organization label-reader SDK tests separately protect archived/partial
  names, null/empty type names, exact membership emails, empty references, complete provider pages and whole-read
  failures. Settings composition and route tests bind those real readers after owner admission, including an owner with
  no feature grants. `auditLogQuery`, writer, platform service/adapter, settings route and admin adapter tests retain
  separate behavioral/security obligations. The timestamp-index SQL test proves its index only. Do not run cleanup jobs
  merely to prove audit reads.
