---
name: verify-trooptotask
description:
  'Drive the TroopToTask web UI in an owned synthetic browser and Supabase session. Use for the maintained user-journey
  feature map, screenshots, and observable persistence checks.'
---

# Verify TroopToTask

Drive the production build through its visible SvelteKit web UI. `verify:app` owns a disposable local Supabase project,
synthetic accounts, an app copy and a private Chromium profile. Run commands from the repository root. Read the matching
[feature map](features/README.md) entry; drive affected features and dependencies before and after a change, updating
recipes with behavior changes. Distinguish product regressions from map/control drift. Use
[maintain-verification-skill](../maintain-verification-skill/SKILL.md) for explicitly requested full-map upkeep.

## Launch

```bash
npm run --silent verify:app -- --help
npm run --silent verify:app -- info
npm run --silent verify:app -- launch
npm run --silent verify:app -- doctor
```

`info` checks prerequisites without starting services. `launch` builds and starts the isolated production app; `PASS`
gives its owned origin and candidate digest. Require `doctor` to return `PASS` with both before driving. If no
compatible Chromium is found, run `npm run --silent verify:app -- setup`. Launch requires local Docker, Supabase CLI,
Node 24 and Chromium 149 or newer; missing prerequisites block launch without borrowing an app or database.

Worker `1` is the default. `export VERIFY_WORKER=2` selects worker 2 for CLI and helper commands; an explicit `--worker`
overrides it. Add `--worker 2` to every command for a second independent session with its own ports, provider, app and
browser. If occupied, use `doctor` or `cleanup`; do not double-drive. Never attach to the maintenance database, a
personal browser profile or a remote provider.

The owned app always runs with `TZ=UTC`, like production. The browser runs in the host zone unless `launch` names one
with `--browser-timezone <IANA>`. A bare `restart` keeps the previous session's browser zone, and
`restart --browser-timezone <IANA>` changes it. `doctor` reports `appTimeZone` and `browserTimeZone`. Follow the
[viewer-day checks](features/README.md#viewer-day-checks) for date boundaries.

## Doctor

Run `npm run --silent verify:app -- doctor` when the page, provider or build looks wrong. It checks ownership, app,
provider and checkout/candidate agreement, including this skill and feature-map Markdown. After source or
driving-instruction changes, `npm run --silent verify:app -- restart` and collect changed-behavior evidence. Select
reruns under [verification after a fix](../../../docs/architecture/DEFINITION_OF_DONE.md#verification-after-a-fix); a
restart or digest change alone requires no full recipe/fixture repeat. A blocked doctor stops that worker until its
cause is resolved. `STALE_CANDIDATE` names the first five changed checkout/app paths. `LAUNCH_PENDING` means startup is
still running; wait for launch and inspect the worker's `supervisor.log`.

## Drive

`login` opens a new isolated signed-in synthetic browser context and returns page/Organization IDs.

Actor and login contexts start with What's New dismissed. Use `actor --show-whats-new ROLE home` for its
[dialog recipe](features/shell-preferences.md#whats-new-fixture-state).

Public `login` lands on Personnel; use `actor` for direct Training/Calendar entry. Both obtain genuine password sessions
from the disposable provider using private synthetic credentials, set the app's httpOnly cookie through DevTools and
open an ordinarily admitted destination. They print no password and bypass app `/auth/` routes. Verified-authenticator
accounts still stop at `/auth/mfa-verify` with destination `next`, as after the form. `actor --form ROLE DESTINATION`
instead submits the visible sign-in form for form, `auth.login_success` audit or `/auth/` limiter proof. Use returned
page IDs, not tab order; with multiple pages, `tool select_page` before interacting or clicks can silently do nothing.

```bash
npm run --silent verify:app -- login manager
npm run --silent verify:app -- tool list_pages '{}'
npm run --silent verify:app -- tool take_snapshot '{"pageId":2}'
npm run --silent verify:app -- tools
```

The example page ID `2` is illustrative; substitute this run's returned ID in every command. Before clicking/filling,
take a fresh `take_snapshot`, then call `tool click` or `tool fill` with the named control's UID and page ID; UIDs
change after navigation/dialog updates. `upload_file` takes `filePaths`, e.g.
`{"pageId":2,"uid":"UID","filePaths":["/abs/file.csv"]}`. `tools` gives current native schemas for click, fill,
press_key, navigate_page, wait_for, take_snapshot, take_screenshot, network, console and evaluate_script. Prefer
accessible names over positions/coordinates. Evaluation may read rendered results/authenticated responses; documented
network/export controls narrowly evaluate synthetic failures, delays/downloads.

An `actor` page may open about 500 px wide; `resize_page` to 1280x800 before a 1280 capture or the toolbar folds into
`More`. All owned contexts share 127.0.0.1 and its limits: 10 `/auth/*` POSTs per 15 minutes, spent by form sign-ins,
sign-outs and `/auth/confirm` Continue, but not plain `actor`/`login`. Exhaustion shows
`Too many requests. Please wait and try again.`; `actor --form` times out in `wait_for` after 20 seconds while doctor
passes. Each signed-in context also costs about nine of 60 other requests/minute (doctor probe, favicon redirect, page,
data and shell), allowing about six contexts/minute; excess makes doctor report `APP_ENDPOINT_UNAVAILABLE`.

See [workspace reuse](features/README.md#workspace-reuse) for load observations. Reload with `navigate_page` after
`$V seed`, a `rows`-verified provider change, a grant change or another session's write before reading the result.

## Evidence

Save proof under `.verification/evidence/verify-trooptotask/<run-name>/`, outside the disposable worker. Capture a
before snapshot, the action, an after snapshot and screenshot, and a second visible read after reload or reopening for
persisted changes. Native tools accept `filePath`:

```bash
npm run --silent verify:app -- tool take_snapshot '{"pageId":2}' --text --save .verification/evidence/verify-trooptotask/example/after.txt
npm run --silent verify:app -- tool take_screenshot '{"pageId":2,"filePath":".verification/evidence/verify-trooptotask/example/after.png"}'
```

`tool --text` unwraps MCP text; `--save PATH` saves the printed output beneath `.verification/evidence/`. Invalid
destinations fail before the tool runs. Create the run directory first. Record feature, candidate digest, origin,
browser version, synthetic role/Organization, action, expected/observed result and artifact paths in scratch notes. For
saved data, capture the trigger, stable visible result and reload read; use `rows` for exact synthetic
persistence/absence. For denied writes, capture request status and unchanged rows as well as affordances;
hidden/disabled controls do not prove server authorization. Preserve downloaded workbooks and inspect contents. Mark
attempted paths **source-mapped**, **live-verified**, **failed** or **unreachable**, naming the attempted route and
missing prerequisite for unreachable paths. Old receipts and happy paths do not verify difficult cases.

After final doctor and owned cleanup, publish through
[artifact packaging](../../../docs/architecture/DEFINITION_OF_DONE.md#packaging-durable-artifacts). Keep raw captures in
ignored scratch with tested revision/digest. Publish archives or adopt revised driving instructions outside active runs.

## Cleanup

Restore armed `network`/`export` controls and temporary Calendar grants, then `clean-seeds`, which removes only
helper-created rows. Visibly remove UI-created rows and read back absence; restore edited original fields under the same
ID. After seeded deletion/federal reset, `verify:app restart` this worker before relying on original rows, then rerun
doctor/fixture. Run `npm run --silent verify:app -- cleanup` for the worker you launched, including failed attempts; it
stops only owned processes/provider. Confirm proof remains under `.verification/evidence/verify-trooptotask/` and review
artifacts before sharing.

## Helpers

`npm run --silent verify:app -- --help` documents the launcher;
`npm run --silent verify:app -- tools --worker "$WORKER"` lists native browser operations. The
[control helper](helpers/control.mjs) uses only the same worker's authenticated supervisor/disposable provider. Run from
the repository root with `WORKER` set to the launched worker:

```bash
V="node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"
$V click 2 button "A-Z" # fresh snapshot and one exact role/name match
$V fill 2 searchbox "Search by name, rank, MOS, role, or group" "Baker"
$V fixture # public synthetic IDs/dates; no credentials
$V actor --form manager personnel # visible sign-in form; spends the app's /auth/ budget
$V clean-seeds # only rows created by this helper
$V network state 2 # matched requests, statuses, IDs, held state
$V network release 2
$V network restore 2 # also releases a stuck response; a reload already removed the hook (restored:false)
$V feedback arm 2 # observe actual transient success/error toasts
$V feedback state 2 # captured rendered messages; no app-state changes
$V feedback restore 2
$V export arm 2 # capture the next workbook Blob
$V export state 2 # captured Blob size, MIME type and download filename
$V export restore 2
```

`pointer drag PAGE EXACT_URL FROM TO [STEPS]` sends trusted mouse input through this worker's browser endpoint: press
the unique `FROM` element's centre, move to `TO`'s centre in 10 steps by default, release. Use only for pointer-only
targets hidden from accessibility, such as Calendar resize grips; otherwise use native UID `click`/`drag`. It rejects
page ID/URL disagreement, zero/multiple matches and off-viewport targets.

`rows TABLE orgA|orgB [id|name|title|note|personnel_id|user_id|type VALUE]` reads only allowlisted synthetic tables in
the owned provider. Compare fixture IDs and submitted values.

`seed` creates named temporary fixtures only; run `clean-seeds` before worker cleanup to remove only recorded
IDs/dependent availability.

`network` matches only allowlisted A endpoints, records statuses and lasts until restore. Arm one at a time on the
actual page.

`export save` writes `.xlsx`, `.pdf` or `.json` only beneath durable skill evidence. Helpers supply no journey/verdict:
drive native visible controls and record observations.

`click PAGE ROLE NAME` and `fill PAGE ROLE NAME VALUE` use native structured accessibility names. Missing or ambiguous
matches stop without acting.

Actor arrival alone does not prove a streamed workspace loaded or that access is allowed; inspect the actual
controls/data and request/provider results.

`workbook FILE` reads the `Status Days` sheet by default; pass the sheet name for other Calendar exports.

Run state-changing helpers serially on an owned worker. `seed` journals IDs before insertion; `clean-seeds` recovers
interrupted inserts and safely deletes never-inserted IDs. Restore grants/network hooks before cleanup.

`feedback` uses a DOM observer for only rendered Sonner success/error messages without changing app data, timing or
handlers. It keeps up to twenty distinct type/text pairs until restore, excluding unchanged toasts present when armed
but capturing new toasts and changed text/type. Arm immediately before an action if native settling outlasts its toast;
save state before reload, attribute messages to that action and inspect request/provider outcomes, then restore.

Use the [native recording controls](features/shared-ui.md#native-recording) for video evidence.

Actor output includes a nonsecret `browserContext` name; pass it to native `new_page` with the owned URL to open a
second tab sharing the same cookies/session.

`busy arm|state|restore PAGE` observes distinct submit-button labels, `disabled` and `aria-busy`, like feedback, without
changing app timing/handlers.

`fault arm NAME [ORDINAL]` returns one synthetic PostgREST 503 on the Nth matching provider write, then passes later
writes. Arm different names together to fail both issuance and following cleanup; `fault state` lists armed
names/per-name receipts, `fault restore` clears all.

A fault may narrow by exact query values and top-level body values.

A receipt reports ordinal, match count, phase and the matched method and path, never a body.

Session cleanup clears armed mail/faults; `server-source restore` does not. Restore each control between cases.

### Helper families

Recipes own feature actors, targets, commands and proof limits:

- Calendar: [actors/range](features/calendar-navigation.md), [grants](features/calendar-access.md),
  [availability](features/availability-status.md), [bulk/Status Days](features/bulk-status.md),
  [assignments](features/calendar-assignments.md), [catalog faults](features/calendar-catalogs.md),
  [federal reset](features/special-days.md).
- Training: [catalogs](features/training-catalog-views.md),
  [actors/completions/print](features/training-completions-reports.md), [rosters/files](features/sign-in-rosters.md).
- Critical Tasks: [completions](features/critical-tasks-completions-readiness.md),
  [library faults](features/critical-tasks-library.md).
- Personnel: [lifecycle/retention/batch archive](features/personnel-records-lifecycle.md),
  [artifacts/HTTP/faults](features/personnel-artifacts.md), [Groups/pins](features/manage-groups.md).
- [Dashboard/sources/access](features/dashboard.md), [shell/preferences](features/shell-preferences.md).
- Onboarding: [actors/templates/faults](features/onboarding-templates.md),
  [packets/requests/retention/removal](features/onboarding-packets.md), [History seed](features/onboarding-history.md).
- [Notifications/Feedback](features/notifications-feedback.md), [Evals](features/evals-rating-scheme.md).
- Organization: [settings/reauth/destruction](features/organization-settings-destruction.md),
  [member entry](features/organization-member-access.md), [invitations/mail](features/organization-invitations.md),
  [creation](features/organization-creation.md), [exports](features/organization-exports.md).
- [Audit/maintenance](features/audit-capture-projections.md), [deletion requests/review](features/deletion-requests.md).
- Platform: [administration](features/platform-administration.md),
  [support content](features/platform-support-content.md).
- [Identity/MFA/passwords/links/sessions](features/identity-recovery-security.md).
- [Toolbar sweep](features/shared-ui.md), [style probe/diff](features/shared-compositions.md),
  [performance workloads](features/performance.md).
