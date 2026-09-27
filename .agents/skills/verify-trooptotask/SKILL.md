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

`login` signs in through the normal form with a synthetic account and returns the page ID and organization ID. `manager` can manage Personnel and Groups; `viewer` can read them; `scoped` sees its assigned group; `calendarOperate` can operate Calendar. The role names come from the launch fixture; use the returned page ID, not tab order.

```bash
npm run --silent verify:app -- login manager
npm run --silent verify:app -- tool list_pages '{}'
npm run --silent verify:app -- tool take_snapshot '{"pageId":2}'
npm run --silent verify:app -- tools
```

The page ID `2` above illustrates the JSON shape; substitute the ID returned by this run's `login`. For every click or fill, get a fresh `take_snapshot`, choose the UID beside the named control, and call `tool click` or `tool fill` with that page ID and UID. UIDs change after navigation or a dialog update. `tools` gives the current native DevTools schemas for `click`, `fill`, `press_key`, `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, network, console, and read-only `evaluate_script`. Prefer accessible names in snapshots over position or coordinates. Use evaluation only to inspect a result after the visible user path; do not invoke app handlers through it.

## Evidence

Keep proof under `.verification/evidence/verify-trooptotask/<run-name>/`, outside the disposable worker. Save a before snapshot, the user action, an after snapshot and screenshot, and a second visible read after reload or reopening for persisted changes. The native tools accept `filePath`:

```bash
npm run --silent verify:app -- tool take_snapshot '{"pageId":2,"filePath":".verification/evidence/verify-trooptotask/example/after.txt"}'
npm run --silent verify:app -- tool take_screenshot '{"pageId":2,"filePath":".verification/evidence/verify-trooptotask/example/after.png"}'
```

Create the run directory first and use the actual page ID. Record the feature ID, candidate digest, origin, browser version, synthetic role, action, expected and observed result, and artifact paths in that run directory. A final screenshot alone is insufficient: show the trigger and stable result, plus a second view of a saved value. Use only the normal UI and provider boundary. Record unreachable paths with the blocked prerequisite; another entry point does not prove a skipped one.

## Cleanup

Run `npm run --silent verify:app -- cleanup` for the worker you launched, including failed attempts. It stops only owned processes and the disposable provider. Then confirm the proof files still exist under `.verification/evidence/verify-trooptotask/`. Review artifacts before sharing them.

## Helpers

This skill ships no new script. `npm run --silent verify:app -- --help` is the command reference, and `npm run --silent verify:app -- tools` lists the native browser operations and argument schemas.
