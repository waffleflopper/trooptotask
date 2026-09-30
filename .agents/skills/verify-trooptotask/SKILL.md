---
name: verify-trooptotask
description: 'Drive the TroopToTask web UI in an owned synthetic browser and Supabase session. Use for the maintained user-journey feature map, screenshots, and observable persistence checks.'
---

# Verify TroopToTask

Drive the production build through its visible SvelteKit web UI. The repository's `verify:app` command owns a disposable local Supabase project, synthetic accounts, an app copy, and a private Chromium profile. Run every command from the repository root. Read the matching [feature map](features/README.md) entry before driving a journey. For ordinary issue work, extend and drive affected features and dependencies before the cutover and again afterward. Use [maintain-verification-skill](../maintain-verification-skill/SKILL.md) for an explicitly requested full-map source/live upkeep pass. Requirements come from issue acceptance and approved retained contracts; distinguish a product regression from map or control drift.

## Launch

```bash
npm run --silent verify:app -- --help
npm run --silent verify:app -- info
npm run --silent verify:app -- launch
npm run --silent verify:app -- doctor
```

`info` checks prerequisites without starting anything. `launch` builds and starts the isolated production app; its `PASS` output gives the owned origin and candidate digest. `doctor` must also return `PASS` with that origin and digest before a drive. If `info` reports no compatible Chromium, run `npm run --silent verify:app -- setup` before launch. The launcher needs local Docker, Supabase CLI, Node 24, and Chromium 149 or newer; it reports a blocked prerequisite rather than borrowing another app or database.

Worker `1` is the default. Add `--worker 2` to **every** command for a second independent session. Each worker owns its own ports, provider, app, and browser. Use `doctor` or `cleanup` when a worker is already occupied; do not double-drive it. Never attach this skill to the maintenance database, a personal browser profile, or a remote provider.

## Doctor

Run `npm run --silent verify:app -- doctor` whenever the page, provider, or build looks wrong. It checks ownership, the running app, the provider, and whether the candidate still matches the checkout, including this SKILL.md and the feature-map Markdown. After changing source or those driving instructions, run `npm run --silent verify:app -- restart` and use new evidence. Other prose remains outside the candidate digest. A blocked doctor is a stop for that worker until its reported cause is resolved.

## Drive

`login` signs in through the normal form and returns the page ID and Organization ID. `manager` can manage Personnel and Groups; `viewer` can read them; `scoped` sees Alpha only. Calendar actors include `calendarView`, `calendarOperate`, `calendarConfigure`, `calendarLane`, `calendarScoped`, `calendarEmpty`, `calendarScopedConfig`, and `calendarSwitch`. Training actors include `trainingConfigure`, `trainingView`, `trainingOperate`, `trainingScoped`, `trainingScopedConfig`, `trainingEmpty`, `trainingSwitch`, `trainingForeign`, and `trainingOnboarding`; Sign-in Roster actors are `rosterManager`, `rosterViewer`, `rosterScoped`, and `rosterForeign`. The public `login` command lands on Personnel; for a direct Training or Calendar starting route, use the skill's `actor` helper below. It submits the same visible sign-in form with private synthetic credentials and prints no password. Use the returned page ID, not tab order.

```bash
npm run --silent verify:app -- login manager
npm run --silent verify:app -- tool list_pages '{}'
npm run --silent verify:app -- tool take_snapshot '{"pageId":2}'
npm run --silent verify:app -- tools
```

The page ID `2` above illustrates the JSON shape; substitute the ID returned by this run's login. For every click or fill, get a fresh `take_snapshot`, choose the UID beside the named control, and call `tool click` or `tool fill` with that page ID and UID. UIDs change after navigation or a dialog update. `tools` gives the current native DevTools schemas for `click`, `fill`, `press_key`, `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, network, console, and `evaluate_script`. Prefer accessible names in snapshots over position or coordinates. Read-only evaluation may inspect rendered results and authenticated responses. The documented `network` and `export` helper controls use narrowly scoped evaluation for synthetic failure, delay, and download capture. When the date grid lacks a unique snapshot UID, use evaluation only to click the visible button in the named Person row and recorded day; never invoke app handlers or alter app state directly.

## Evidence

Keep proof under `.verification/evidence/verify-trooptotask/<run-name>/`, outside the disposable worker. Save a before snapshot, the user action, an after snapshot and screenshot, and a second visible read after reload or reopening for persisted changes. The native tools accept `filePath`:

```bash
npm run --silent verify:app -- tool take_snapshot '{"pageId":2,"filePath":".verification/evidence/verify-trooptotask/example/after.txt"}'
npm run --silent verify:app -- tool take_screenshot '{"pageId":2,"filePath":".verification/evidence/verify-trooptotask/example/after.png"}'
```

Create the run directory first and use the actual page ID. Keep working notes in scratch space with the feature, candidate digest, origin, browser version, synthetic role and Organization, action, expected and observed result, and artifact paths. For saved data capture the trigger, stable visible result, and second read after reload; use `rows` below for exact synthetic persistence and absence checks. For denied writes capture request status and unchanged rows as well as the UI affordance. For a downloaded report preserve the workbook and inspect its contents. In those scratch notes distinguish source-mapped, live-verified, failed, and unreachable paths with the attempted route and prerequisite. An old receipt or a happy path does not verify a difficult case.

After the final doctor and owned cleanup, publish the run through the [durable artifact packaging contract](../../../docs/architecture/DEFINITION_OF_DONE.md#packaging-durable-artifacts). Keep the raw captures in ignored scratch space and preserve their tested revision/digest; adding archives or adopting revised driving instructions must happen outside an active run. Independent acceptance reads the expanded artifacts; CodeRabbit's source review does not establish their observations.

## Cleanup

Restore any armed `network` or `export` control and temporary Calendar grants, then run `clean-seeds`. That command removes only rows created by the helper: remove your UI-created rows through the visible controls and read back their absence, and restore any edited original fixture fields with the same ID. A seeded deletion or federal reset needs `verify:app restart` on this owned worker before another journey relies on the original rows; run `doctor` and `fixture` again afterward. Run `npm run --silent verify:app -- cleanup` for the worker you launched, including failed attempts. It stops only owned processes and the disposable provider. Then confirm the proof files still exist under `.verification/evidence/verify-trooptotask/`. Review artifacts before sharing them.

## Helpers

`npm run --silent verify:app -- --help` is the launcher reference, and `npm run --silent verify:app -- tools --worker 1` lists the native browser operations. The narrow [control helper](helpers/control.mjs) uses only the same worker's authenticated supervisor and disposable provider. Run it from the repository root, always using the worker selected at launch:

```bash
V='node .agents/skills/verify-trooptotask/helpers/control.mjs --worker 1'
$V fixture                              # public synthetic IDs/dates; no credentials
$V actor calendarLane calendar          # normal form; returns pageId and Organization ID
$V actor rosterManager training          # Training entry point with roster operate access
$V actor orgOwner settings/members       # owner entry to member management
$V actor orgInvitee dashboard           # confirmed account without a membership
$V actor orgCreator org/new             # confirmed account for creation
$V rows availability_entries orgA note 'Unique synthetic note'
$V rows sign_in_rosters orgA title 'Unique synthetic title'
$V rows organization_invitations orgA status pending
$V created-org 'Unique synthetic Organization name' # orgCreator-owned row and default readback
$V roster-files orgA ROSTER_ID           # private Storage names, sizes and SHA-256
$V calendar-grant calendarOperate view   # simulate an open page losing operate access
$V calendar-grant calendarOperate restore
$V seed duplicate-able                  # or overlap, bulk-501, training-pages; returns a tag
$V clean-seeds                          # only rows created by this helper
$V network arm-fail 2 calendar-range    # one scoped synthetic 503; use the actual page ID
$V network arm-fail 2 sign-in-rosters    # roster list, or sign-in-rosters/ROSTER_ID/upload
$V network arm-fail 2 training-types     # fail one Training catalog request; training-views also supported
$V network arm-fail 2 availability/batch 2 # second matching batch request fails
$V network arm-hold 2 availability      # hold a real response after persistence
$V network state 2                      # matched requests, statuses, IDs, held state
$V network release 2
$V network restore 2                    # also releases a stuck response
$V feedback arm 2                       # observe actual transient success/error toasts
$V feedback state 2                     # captured rendered messages; no app-state changes
$V feedback restore 2
$V export arm 2                         # capture the next workbook Blob
$V export state 2                       # captured Blob size, MIME type and download filename
$V export save 2 .verification/evidence/verify-trooptotask/RUN/status-days.xlsx
$V export restore 2
$V signed-download orgA ROSTER_ID .verification/evidence/verify-trooptotask/RUN/signed.pdf
$V workbook .verification/evidence/verify-trooptotask/RUN/status-days.xlsx
$V workbook .verification/evidence/verify-trooptotask/RUN/assignment-load.xlsx 'Assignment Coverage'
```

`rows TABLE orgA|orgB [id|name|title|note|personnel_id|user_id|type VALUE]` reads only allowlisted synthetic tables in the owned provider; compare known fixture IDs and explicit submitted values. For `daily_assignments`, the filter also accepts `date`, `assignee_id`, and `assignment_type_id`. `roster-files` checks only the named synthetic roster's private Storage path. `signed-download` saves the PDF page opened by a visible scan button without printing its token-bearing URL; use native `upload_file` on the visible `Signed Scan` input. `calendar-grant` changes only the named synthetic member's Organization A Calendar capability and records its original value for restoration. `seed` creates only the named temporary fixture, and `clean-seeds` deletes only its recorded IDs and dependent availability; run it before worker cleanup. A network control matches only an allowlisted Organization A endpoint, records request statuses, and lasts until `restore`; arm one at a time on the actual page. `export save` writes only under this skill's durable evidence directory and accepts `.xlsx`, `.pdf` or `.json`. The helper does not provide a journey or verdict; drive visible controls with native DevTools and record the observation yourself.

`fixture` exposes synthetic invitation emails without passwords or tokens. `actor` also accepts `training/reports`, `settings/members`, `settings/exports`, `settings/danger`, `dashboard`, and `org/new`; its `access` field reports an explicit visible settings-page denial or `not-assessed`. Actor arrival alone does not prove a streamed workspace loaded or that access is allowed; inspect the actual controls/data and request/provider results. `rows` also permits `email`, `status`, and `invitation_id` filters for the allowlisted invitation and outbox tables. Query stored email values in lowercase.

Critical Tasks actors are `ictConfigurator`, `ictOperator`, `ictViewer`, `ictScoped`, `ictEmpty`, `ictForeign` and `ictSwitch`; all have Personnel/Training access absent. `ictSwitch` operates A and views B. `actor` accepts `critical-tasks`, `critical-tasks/library` and `critical-tasks/reports`. The [completion/readiness recipe](features/critical-tasks-completions-readiness.md) owns dated examples, import/history and scope checks. `network` also accepts `personnel-ict-completions`, `personnel-ict-completions/batch`, `critical-tasks/reports/summary`, `critical-tasks/reports/export` and `critical-tasks/matrix/export`; it still matches only the exact synthetic A endpoint. `rows personnel_ict_completions orgA ict_task_id ID` reads completion IDs and values. Training controls include `personnel-trainings`, `personnel-trainings/batch`, `deletion-requests` for submission and `deletion-requests/review` for review; these match exact endpoints. Use `workbook FILE 'Critical Tasks Report'` or `workbook FILE 'Critical Task Matrix'` for the respective exports.

`created-org NAME` reads only an Organization with that exact name created by this worker's `orgCreator`, then reports its owner membership and default Group, Calendar and rank rows. Use a unique name, read count zero before submitting, and read the same name after the visible creation action. It cannot inspect an arbitrary Organization ID. `workbook FILE` reads the `Status Days` sheet by default; pass the sheet name for other Calendar exports.

Run state-changing helper commands serially on an owned worker. `seed` records its generated IDs before insertion so `clean-seeds` can recover from an interrupted insert; it also safely deletes IDs that were never inserted. Restore temporary grants and network hooks before cleanup.

`feedback` observes only rendered Sonner success/error messages, keeping up to twenty distinct type/text pairs until restored. Arm it immediately before the action when a native tool's settling wait outlasts a toast; capture `state` before reload and restore it afterward. Its DOM observer does not change app data, timing or handlers. Unchanged toasts already visible at arm time are excluded; a new toast or a changed message/type is captured. Attribute captured messages to the action and inspect its request/provider outcome too.

For focused checks of network response ordering and feedback capture, run `node --test .agents/skills/verify-trooptotask/helpers/network-control.test.mjs .agents/skills/verify-trooptotask/helpers/feedback-control.test.mjs`.

Synthetic Organizations A/B include active PFC, SPC and SGT rank catalog entries for normal create/import validation. Personnel lifecycle actors are `personnelOperate`, `personnelScoped`, `personnelEmpty`, and `personnelSwitch`; they have other feature lanes absent. `personnelScoped` configures only Alpha, `personnelEmpty` configures an explicit empty Group scope, and `personnelSwitch` configures A but only views B. Use `manager` for Organization-wide Personnel configuration and `orgOwner` for visible Settings restore/permanent removal. `actor` accepts `settings/archives`; a configure-only Personnel member has no governance access to this page.

`seed personnel-lifecycle` returns one dedicated Alpha Person, two active same-rank/name People in Alpha/Bravo, an archived duplicate, and exact artifact/Training/Critical Task IDs. Its fixed older archive timestamp identifies independently archived artifacts; one unrelated Able note is a no-effect sentinel. Documents have metadata only, without Storage objects: this seed proves row lifecycle, not downloads or file preservation. `rows` also permits `leader_notes`, `personnel_follow_ups`, `counseling_records`, and `personnel_documents`, plus `last_name`, `first_name` and `slug` filters. The existing `network` commands support `personnel`, `personnel/batch`, `personnel/merge` and `personnel/archive-batch`, still bound to this worker's exact Organization A endpoint. Restore controls, visibly remove UI-created People and run `clean-seeds`; it removes recorded dependent rows before their seeded parent and preserves original fixture People. The [Personnel lifecycle recipe](features/personnel-records-lifecycle.md) owns the actions and expectations.

`trainingEmpty` operates with explicit empty Group scope and Personnel none. `trainingSwitch` operates A and views B, also without Personnel access. Actor output includes a nonsecret `browserContext` name; pass it to native `new_page` with the owned URL to open a second tab sharing the same cookies/session. `seed training-pages` creates 26 temporary Alpha/PFC People: the first is 68W/Medic, the other 25 are 11B/NCO. It records their IDs before insertion and uses ordinary `clean-seeds` cleanup.

For a real download, arm `network arm-observe PAGE training-reports/export` (or `export`, `export-excel`, `personnel/PERSON_ID/export`) alongside `export arm`. Observation leaves the real request/response untouched and records status plus public Content-Type/Content-Disposition only. Save network state and Blob capture output together; the latter includes the observed download-anchor filename, byte count, MIME type and SHA-256. `export state` reports whether a Blob was captured, including after a failed export. Restore both controls. JSON captures are inspected as JSON, not passed to `workbook`.

Onboarding actors are `onboardingConfigure`, `onboardingOperate`, `onboardingView`, `onboardingScoped`, `onboardingEmpty`, `onboardingForeign` and `onboardingSwitch`, with all other feature lanes absent. `onboardingPersonnelScoped` additionally configures Personnel, with both lanes restricted to Alpha; use it for the shared Personnel creation form. Switch configures A and views B; Scoped configures with Alpha scope and Empty has no Groups. The [template/configuration recipe](features/onboarding-templates.md) owns approved expectations and distinguishes failed catalog affordances from actual server/provider denial. `actor` accepts `onboarding`, `onboarding/templates` and `onboarding/history`. `rows` allows `onboarding_template_steps`, `personnel_onboardings` and `onboarding_step_progress` as well as templates, with `template_id`, `onboarding_id` and `template_step_id` filters. `network` accepts exact A `onboarding-templates`, `onboarding-template-steps`, `onboarding-template-steps/reorder` and `onboarding-templates/UUID/duplicate` endpoints. Onboarding network controls reload the current page to install before its adapter captures fetch; arm before opening/filling the draft. Restore also disables a captured wrapper. Client503/hold controls do not establish atomic multiwrite provider behavior.

Notifications actors are `notificationMember`, `notificationOther`, `notificationForeign` and `notificationSwitch`, with every feature lane absent. Switch belongs to A/B; the others belong only to their named Organization. `actor ROLE home` enters the Organization Dashboard through normal sign-in. `seed communications` creates 24 own A inbox rows, peer/foreign/switch sentinels and active/inactive/expired global announcements. It records exact IDs before insertion; `clean-seeds` removes only those IDs in their recorded Organization or the helper-owned global announcement IDs. `fixture` reports public notification account IDs. `communications ROLE` reads only that synthetic account's feedback and dismissals of helper-owned announcements. `platformReviewer` and `platformSupport` are isolated no-Organization accounts with super-admin/support roles; `actor ROLE admin/feedback` uses the normal sign-in form for their existing allowed Feedback review paths. Communications readback also retains Admin Notes. See the [communications recipe](features/notifications-feedback.md).

`network` also supports `notifications` at the exact A endpoint and global `feedback` and `announcements/dismiss` endpoints. Their failure/hold controls exercise the same page's real UI response handling; they do not prove provider delivery or automatic retry. Restore hooks before cleanup. The owned app excludes external feedback tokens, so real GitHub mirroring is not a live-verified path.
