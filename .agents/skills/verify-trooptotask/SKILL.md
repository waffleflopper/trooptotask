---
name: verify-trooptotask
description: 'Drive the TroopToTask web UI in an owned synthetic browser and Supabase session. Use for the experimental user-journey feature map, screenshots, and observable persistence checks.'
disable-model-invocation: true
---

# Verify TroopToTask

Drive the production build through its visible SvelteKit web UI. The repository's `verify:app` command owns a disposable local Supabase project, synthetic accounts, an app copy, and a private Chromium profile. Run every command from the repository root. Read the matching [feature map](features/README.md) entry before driving a journey.

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

Run `npm run --silent verify:app -- doctor` whenever the page, provider, or build looks wrong. It checks ownership, the running app, the provider, and whether the executable candidate still matches the checkout. After a source change, run `npm run --silent verify:app -- restart` and use new evidence. A blocked doctor is a stop for that worker until its reported cause is resolved.

## Drive

`login` signs in through the normal form and returns the page ID and Organization ID. `manager` can manage Personnel and Groups; `viewer` can read them; `scoped` sees Alpha only. Calendar actors include `calendarView`, `calendarOperate`, `calendarConfigure`, `calendarLane`, `calendarScoped`, `calendarEmpty`, `calendarScopedConfig`, and `calendarSwitch`. The public `login` command lands on Personnel; for actors without a Personnel landing page or for a direct Calendar starting route, use the skill's `actor` helper below. It submits the same visible sign-in form with private synthetic credentials and prints no password. Use the returned page ID, not tab order.

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

## Cleanup

Restore any armed `network` or `export` control and temporary Calendar grants, then run `clean-seeds`. That command removes only rows created by the helper: remove your UI-created rows through the visible controls and read back their absence, and restore any edited original fixture fields with the same ID. A seeded deletion or federal reset needs `verify:app restart` on this owned worker before another journey relies on the original rows; run `doctor` and `fixture` again afterward. Run `npm run --silent verify:app -- cleanup` for the worker you launched, including failed attempts. It stops only owned processes and the disposable provider. Then confirm the proof files still exist under `.verification/evidence/verify-trooptotask/`. Review artifacts before sharing them.

## Helpers

`npm run --silent verify:app -- --help` is the launcher reference, and `npm run --silent verify:app -- tools --worker 1` lists the native browser operations. The narrow [control helper](helpers/control.mjs) uses only the same worker's authenticated supervisor and disposable provider. Run it from the repository root, always using the worker selected at launch:

```bash
V='node .agents/skills/verify-trooptotask/helpers/control.mjs --worker 1'
$V fixture                              # public synthetic IDs/dates; no credentials
$V actor calendarLane calendar          # normal form; returns pageId and Organization ID
$V rows availability_entries orgA note 'Unique synthetic note'
$V calendar-grant calendarOperate view   # simulate an open page losing operate access
$V calendar-grant calendarOperate restore
$V seed duplicate-able                  # or overlap, bulk-501; returns a tag
$V clean-seeds                          # only rows created by this helper
$V network arm-fail 2 calendar-range    # one scoped synthetic 503; use the actual page ID
$V network arm-fail 2 availability/batch 2 # second matching batch request fails
$V network arm-hold 2 availability      # hold a real response after persistence
$V network state 2                      # matched requests, statuses, IDs, held state
$V network release 2
$V network restore 2                    # also releases a stuck response
$V export arm 2                         # capture the next workbook Blob
$V export save 2 .verification/evidence/verify-trooptotask/RUN/status-days.xlsx
$V export restore 2
$V workbook .verification/evidence/verify-trooptotask/RUN/status-days.xlsx
```

`rows TABLE orgA|orgB [id|name|note|personnel_id|user_id|type VALUE]` reads only allowlisted synthetic tables in the owned provider; compare known fixture IDs and explicit submitted values. `calendar-grant` changes only the named synthetic member's Organization A Calendar capability and records its original value for restoration. `seed` creates only the named temporary fixture, and `clean-seeds` deletes only its recorded IDs and dependent availability; run it before worker cleanup. A network control matches only an Organization A Calendar endpoint, records request sizes/statuses, and lasts until `restore`; arm one at a time on the actual page. `export save` writes only under this skill's durable evidence directory. The helper does not provide a journey or verdict; drive visible controls with native DevTools and record the observation yourself.

For a focused check of the network control's overlapping-response behavior, run `node --test .agents/skills/verify-trooptotask/helpers/network-control.test.mjs`.
