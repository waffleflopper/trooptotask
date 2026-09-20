# Plan 025: Add an end-to-end Playwright spec for the duty-roster workflow

Historical implementation record. The [stabilization queue](../docs/stabilization/TODO.md) owns current work; the executor/drift instructions for this completed plan are retired. References below to deleted billing runbooks, plans or code identify historical inputs and do not authorize restoring them. Retained behavior and verification remain governed by the queue. Current acquisition/support guidance is in [Launch Acquisition Path](../docs/launch-acquisition-path.md); external commercial retirement follows [RELEASE](../docs/stabilization/RELEASE.md#commercial-operations-retirement--03-07b-01).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (test-only; no production code changes)
- **Depends on**: none (runs after 013 lands if both are in flight — 013 touches the test toolchain)
- **Category**: tests
- **Planned at**: commit `79cfef20`, 2026-06-11

## Why this matters

Duty roster generation (the DA Form 6 replacement) is one of the app's flagship features, and its
server logic is among the most heavily tested in the repo — `dutyRosterTemplates.test.ts` alone is
3,808 lines / 89 tests, plus `acceptedRunCalendarSync.test.ts` (870 lines). But there is **zero
browser-level coverage**: `e2e/specs/` has 13 specs covering auth, calendar, personnel, training,
onboarding, billing-webhook, permissions, and admin — none touch `/duty-rosters`. The full
user-facing chain (SvelteKit load → workspace UI → generate → review → accept → assignments
visible on the calendar) is exactly the kind of integration that unit tests cannot catch when it
breaks: a load-function regression, a hydration error, or a form-action wiring mistake would ship
silently. After this plan, one spec drives the happy path end-to-end and fails loudly when the
workflow breaks in the browser.

## Current state

- E2E infrastructure (all exists and works — model everything on it):
  - `e2e/playwright.config.ts` — the config; specs boot their own isolated app server on
    `127.0.0.1:4173` (per README, your normal dev server on 5173 can keep running).
  - `e2e/global-setup.ts` / `e2e/global-teardown.ts` — seed and clean the local Supabase.
  - `e2e/fixtures/auth.ts` — exports `test`/`expect` with `ownerPage` (authenticated owner
    session) and `orgId` fixtures. Every spec starts
    `import { test, expect } from '../fixtures/auth';`.
  - `e2e/fixtures/test-data.ts` — seeded rows; includes a personnel record with
    `last_name: 'Doe'` (line ~40). Read this file fully before writing the spec to learn what
    already exists (personnel, groups, statuses, assignment types).
  - `e2e/pages/` — page-object pattern: `CalendarPage.ts`, `PersonnelPage.ts`,
    `TrainingPage.ts`, etc. There is NO `DutyRosterPage.ts` yet — you create it.
  - Spec exemplar — `e2e/specs/calendar.spec.ts` opens with:

```ts
import { test, expect } from '../fixtures/auth';
import { CalendarPage } from '../pages/CalendarPage';

test.describe('Calendar & Status', () => {
	let calendarPage: CalendarPage;

	test('navigate between months', async ({ ownerPage, orgId }) => {
		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);
		...
```

- The duty-roster surface under test:
  - `src/routes/org/[orgId]/duty-rosters/+page.svelte` — thin shell rendering
    `DutyRosterTemplateWorkspace` (from `$features/duty-roster/components/`).
  - `src/routes/org/[orgId]/duty-rosters/new/` — new-template route.
  - `src/routes/org/[orgId]/duty-rosters/[templateSlug]/` — per-template route.
  - `src/routes/org/[orgId]/duty-rosters/+page.server.ts` and `routeHelpers.server.ts` — load
    functions.
  - Components in `src/features/duty-roster/components/`: `DutyRosterTemplateWorkspace.svelte`,
    `DutyRosterNewTemplateWorkspace.svelte`, `DutyRosterGenerateView.svelte`,
    `DutyRosterHistoryView.svelte`, `DutyRosterTemplateSettingsView.svelte`, plus
    `workspace/` (preview/review logic — see `dutyRosterPreviewReview.test.ts` for the accept
    flow's behavioral contract) and `run/da6RosterEngine.ts` (generation engine).
  - Behavioral reference for what "accept" means server-side:
    `src/lib/server/core/useCases/duty-roster/templateLifecycle.ts` and `acceptedRuns.ts`, with
    their tests in `src/lib/server/core/useCases/dutyRosterTemplates.test.ts`.

- Prerequisites to run e2e locally: local Supabase must be running (`supabase start`); auth
  emails are captured by Mailpit at `127.0.0.1:54324`. See `docs/local-auth-testing.md` if auth
  fixture setup fails.

## Commands you will need

| Purpose                | Command                                                                               | Expected on success |
| ---------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| Local Supabase up      | `supabase status` (run `supabase start` if not running)                               | services listed     |
| Sanity: existing suite | `npx playwright test --config=e2e/playwright.config.ts e2e/specs/calendar.spec.ts`    | all pass            |
| New spec               | `npx playwright test --config=e2e/playwright.config.ts e2e/specs/duty-roster.spec.ts` | all pass            |
| Full e2e               | `npm run test:e2e`                                                                    | exit 0              |
| Lint/format            | `npm run lint && npm run format`                                                      | exit 0              |

Note: `npm run test`, `npm run check`, `npm run governance:check` should also pass, but this plan
adds no `src/` code, so they are a formality.

## Scope

**In scope** (the only files you should modify/create):

- `e2e/specs/duty-roster.spec.ts` (create)
- `e2e/pages/DutyRosterPage.ts` (create)
- `e2e/fixtures/test-data.ts` (extend ONLY if the flow needs a seeded row that doesn't exist —
  e.g. an assignment type; add, never modify or remove existing seeds: other specs depend on them)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- Anything under `src/` — if the workflow is broken or untestable without a `src` change (e.g. a
  missing `data-testid`), STOP and report; do not patch production code from a test plan.
- `e2e/global-setup.ts` / `global-teardown.ts` / `playwright.config.ts` — the harness works;
  seeds belong in `test-data.ts`.
- Other spec files.

## Git workflow

- Branch: `advisor/025-duty-roster-workflow-e2e-spec`
- Commit style: short imperative subject. Suggested: `Add duty roster workflow E2E spec`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the harness works before writing anything

Run the calendar spec (command above). If it fails, fix your environment (Supabase running, deps
installed), not the code. Do not proceed on a red harness.

**Verify**: `npx playwright test --config=e2e/playwright.config.ts e2e/specs/calendar.spec.ts` → all pass.

### Step 2: Map the real UI flow

Read, in order: `DutyRosterTemplateWorkspace.svelte`, `DutyRosterNewTemplateWorkspace.svelte`,
`DutyRosterGenerateView.svelte`, and `src/features/duty-roster/workspace/dutyRosterPreviewReview.test.ts`.
Write down (in your working notes, and later in your report):

1. The exact path to create a template (`/org/{orgId}/duty-rosters/new`) and the required form
   fields (name, assignment-type linkage, eligible personnel, schedule rules).
2. How a preview/run is generated from the template view and what the accept control looks like
   (button text / `data-testid` / role+name).
3. What the accepted run produces that is observable on the calendar (assignment cells for the
   roster's assignment type on the covered dates).
4. Which seeded fixtures the flow needs (at least one assignment type assignable to personnel and
   2+ active personnel). Check `e2e/fixtures/test-data.ts` for what exists; note any gap.

No verification command — this step's output is the selector/flow map used by Steps 3–4.

### Step 3: Create the page object

Create `e2e/pages/DutyRosterPage.ts` modeled structurally on `e2e/pages/CalendarPage.ts`
(constructor takes a `Page`; `goto(orgId)` navigates to `/org/${orgId}/duty-rosters`; locators as
getters; small action methods like `createTemplate(...)`, `generatePreview()`, `acceptRun()`).
Keep locators role-based (`getByRole('button', { name: ... })`) like the existing pages; fall
back to `data-testid` only where the components already define one.

**Verify**: `npx tsc --noEmit -p e2e` if the e2e folder has its own tsconfig; otherwise
`npm run lint` → exit 0.

### Step 4: Write the spec

Create `e2e/specs/duty-roster.spec.ts` with `test.describe('Duty Roster', ...)` and (at minimum)
this happy-path test, split into 2–3 tests if the workspace state allows independent entry points:

1. **Create a template**: navigate to the new-template route, fill the minimal valid form using
   seeded assignment type + personnel, save, and assert the template appears in the workspace
   register (`DutyRosterTemplateRegister`).
2. **Generate and accept a run**: from the template view, generate a preview for a small date
   window (a few days), assert the preview renders rows, accept it, and assert the UI reflects
   the accepted state (history view shows the run, per the review-flow contract in
   `dutyRosterPreviewReview.test.ts`).
3. **Verify on the calendar**: using `CalendarPage`, navigate to the month containing the run's
   dates and assert the roster's assignment appears (assignment short-name or assignee visible in
   the date header/cells — reuse whatever assertion style `calendar.spec.ts` uses for
   assignments).

Make the spec independent of execution order relative to other specs (create your own template
with a unique name, e.g. `E2E Roster ${Date.now()}`), and clean up is NOT required if global
teardown resets the database — check `global-teardown.ts` and mirror what other mutating specs
(e.g. `personnel.spec.ts`, `bulk-import.spec.ts`) do about cleanup.

**Verify**: `npx playwright test --config=e2e/playwright.config.ts e2e/specs/duty-roster.spec.ts`
→ all new tests pass, twice in a row (run it twice to catch order/state dependence).

### Step 5: Run the full e2e suite and the standard gate

**Verify**: `npm run test:e2e` → exit 0 (your spec must not break others — watch for seed
mutations). Then `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` → all exit 0.

## Test plan

This plan IS a test plan; the cases are in Step 4. Explicitly covered: template creation, run
generation, run acceptance, calendar materialization. Explicitly NOT covered (deferred, list in
your report so they're known): rejection/correction flows, run invalidation, multi-template
interactions, blocking-mode edge cases — all already covered at the use-case layer; add browser
coverage only if this spec proves stable in CI-less local runs.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test -f e2e/specs/duty-roster.spec.ts && test -f e2e/pages/DutyRosterPage.ts` → exit 0
- [ ] `npx playwright test --config=e2e/playwright.config.ts e2e/specs/duty-roster.spec.ts` exits 0 — on two consecutive runs
- [ ] `npm run test:e2e` exits 0
- [ ] `npm run lint` and `npm run format:check` exit 0
- [ ] `git status` shows no modified files outside the in-scope list (in particular: nothing under `src/`)
- [ ] `plans/README.md` status row for 025 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The calendar sanity spec (Step 1) fails after environment fixes — the harness has a
  pre-existing problem this plan must not paper over.
- The accept flow cannot be driven through the UI with stable selectors (e.g. it requires a
  `data-testid` that doesn't exist and role-based locators are ambiguous). Report the exact
  component and the selector you would need — adding it to `src/` is a separate, trivial change
  the operator must approve.
- Template creation requires seed data that cannot be added to `test-data.ts` without altering
  existing seeds other specs rely on.
- The spec passes alone but breaks another spec in the full run, twice — report the interaction
  instead of reordering specs (note `z-auth.spec.ts` suggests the suite already has one
  order-sensitive spec; do not add another).

## Maintenance notes

- This spec pins the duty-roster happy path; UI copy changes (button names) will break it —
  that's the point, but reviewers renaming workspace buttons should expect to update
  `DutyRosterPage.ts` locators in the same PR.
- If/when plan 016's billing E2E lands alongside this, full `npm run test:e2e` runtime grows;
  the per-spec npm scripts pattern (`test:e2e:auth`, `test:e2e:access-requests`) is the
  established way to add a targeted `test:e2e:duty-roster` script — deferred here because adding
  npm scripts wasn't needed to land the coverage.
- Deferred follow-up: rejection/correction-flow browser coverage (see Test plan).
