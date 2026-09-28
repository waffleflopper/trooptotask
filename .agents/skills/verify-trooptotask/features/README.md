# TroopToTask feature map

This is the maintained user-facing map for the owned synthetic web app. Start with the relevant feature file; for a maintenance pass, exercise every file. The [verification skill](../SKILL.md) owns launch, doctor, native DevTools commands, narrowly scoped synthetic controls, evidence, and cleanup.

## Baseline preconditions

- Set `WORKER=1` for the default owned worker or `WORKER=2` for the second session, and use it for every command, including restart and the helper. Run `npm run --silent verify:app -- doctor --worker "$WORKER"` and keep its candidate, origin, and browser version. Never drive another worktree's session.
- `fixture` reports Organization/Group/Person/status IDs and fixed dates. Organization A has Alpha/Able, Bravo/Baker, an unassigned Person, and a historical March status. Organization B has Foreign and private Calendar data. Today's seeded Baker training and the modal's default date use the local date returned by `fixture`.
- Use `npm run --silent verify:app -- login manager|viewer|scoped --worker "$WORKER"` for Personnel. Set `V="node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"`, then run `$V actor ROLE calendar` (or `calendar/settings`, `calendar/bulk`, `calendar/reports`) for Calendar actors. Each actor gets an isolated browser context; record its returned page ID and Organization ID.
- Catalog deletions and federal-holiday reset change original seeded rows. Drive those after journeys that need the rows, or restart only this owned worker before the next dependent journey. After restart, run `doctor` and `$V fixture` again and use fresh page/fixture IDs; `clean-seeds` only removes helper-created temporary rows.

## Driving conventions

Use `PAGE` for the returned page ID. Take a fresh `take_snapshot` before every native `click` or `fill`, select the UID beside the named control, and repeat after a dialog or navigation. The literal command shape is:

```bash
npm run --silent verify:app -- tool take_snapshot "{\"pageId\":$PAGE}" --worker 1
npm run --silent verify:app -- tool click "{\"pageId\":$PAGE,\"uid\":\"$UID\"}" --worker 1
```

Navigate between user pages through visible links and menus. For a fixed seeded date, use the Month and year picker, then choose the relevant named Person row and date cell. If several cells have the same name, the skill permits a narrowly scoped DOM click on that visible row/day button through `evaluate_script`; do not call application handlers. Read-only authenticated `fetch` through that same signed-in page can establish a denied status or compare known fixture IDs in page data. The helper's `rows` command gives exact disposable-provider readback; a disabled or hidden UI control alone cannot prove server authorization.

## Proof and skip reporting

In `.verification/evidence/verify-trooptotask/<run-name>/`, preserve before/action/after snapshots, screenshots, request status where relevant, and a second read after reload for saved changes. Save a workbook itself when validating export. Write a concise scratch run note with candidate, role, Organization, expected and observed result, artifact paths, and one of **source-mapped**, **live-verified**, **failed**, or **unreachable** for each attempted path. A path is unreachable only with the attempted route and concrete prerequisite; a visible success in another path is no substitute. Restore armed controls and grants, clean helper seeds, run owned cleanup, and confirm evidence survived.

## Features

### Access and people

- [Sign in and sign out](sign-in.md): public gate, member session, account menu, sign-out and form failure.
- [Find personnel](find-personnel.md): search, roster views, Organization-wide and Alpha-only reads, and record opening.
- [Manage groups](manage-groups.md): create, rename, remove, persist, and deny same/foreign Organization writes.

### Calendar

- [Calendar navigation](calendar-navigation.md): month, long range, group/search filter, seeded and historical dates, keyboard picker and range retry.
- [Availability status](availability-status.md): add/edit/remove, persistence, failed save recovery and retained history.
- [Calendar access](calendar-access.md): Organization and Group reads, denied single/batch writes, foreign status/Person protection and server readback.
- [Bulk status changes](bulk-status.md): selection, import review, valid and invalid rows, whole-entry removal, and partial chunk feedback.
- [Calendar catalogs](calendar-catalogs.md): status and assignment type settings, linked/archived records, deletion effects and configuration denials.
- [Special days](special-days.md): closures, federal reset, failed edit and Organization boundary.
- [Reports and history](reports-history.md): status-day report, downloaded workbook contents, Calendar history and Dashboard projection.
- [Organization switching](organization-switching.md): A/B data isolation, delayed range/mutation responses and permission narrowing.

## Distinct lower-level checks

These browser recipes do not replace focused component, server, provider, or SQL checks. For a code change, run the affected Vitest files with `npm run test -- <file>` and follow the [Definition of Done](../../../../docs/architecture/DEFINITION_OF_DONE.md#required-commands). In particular, `src/features/calendar/utils/availabilityImport.test.ts`, `stores/availability.svelte.test.ts`, `components/CalendarSettingsPage.test.ts`, `stores/specialDays.svelte.test.ts`, Calendar route server tests, and Personnel/Group route tests cover behavior below the UI. The SQL controls `supabase/tests/calendar_lane_unassigned_scope.sql`, `calendar_catalog_scope.sql`, `calendar_persistence_isolation.sql`, and `personnel_unassigned_row_scope.sql` require the separately owned disposable database procedure in the Definition of Done; never aim them at the existing local or remote database. A browser request denial complements those checks and a UI affordance does not establish RLS.

## Feature entry contract

Every feature file starts with one user-facing summary and four H2 sections in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify:app`, and `Gotchas`. Keep preconditions, concrete actions, expected observations, and evidence capture together. Group a journey by what a member is doing, not by a script or one assertion.
