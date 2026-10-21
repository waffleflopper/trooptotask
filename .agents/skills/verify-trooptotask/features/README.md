# TroopToTask feature map

This is the user-facing map for the owned synthetic web app. Start with the relevant feature file; for a maintenance pass, exercise every file. The [verification skill](../SKILL.md) owns launch, doctor, native DevTools commands, synthetic controls, evidence and cleanup.

Expected results come from the selected issue's acceptance and the [Organization/Group authorization rules](../../../../docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md). Fixture identities make those rules observable; application output does not define the expectation.

## Baseline preconditions

- Set `WORKER=1` for the default owned worker or `WORKER=2` for the second session, and use it for every command, including restart and the helper. Run `npm run --silent verify:app -- doctor --worker "$WORKER"` and keep its candidate, origin, and browser version. Never drive another worktree's session.
- `fixture` reports Organization/Group/Person/status/Sign-in Roster IDs and fixed dates. Organization A has Alpha/Able, Bravo/Baker, an unassigned Person, saved Alpha/mixed/unassigned rosters, and a historical March status. The Alpha roster has a synthetic signed PDF and a deliberately older Personnel snapshot. Organization B has Foreign, a private roster, and private Calendar data. Today's seeded Baker training and the modal's default date use the local date returned by `fixture`.
- Use `npm run --silent verify:app -- login manager|viewer|scoped --worker "$WORKER"` for Personnel. Set `V="node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"`, then run `$V actor ROLE calendar` (or `calendar/settings`, `calendar/bulk`, `calendar/reports`) for Calendar actors. Each actor gets an isolated browser context; record its returned page ID and Organization ID.
- Catalog deletions and federal-holiday reset change original seeded rows. Drive those after journeys that need the rows, or restart only this owned worker before the next dependent journey. After restart, run `doctor` and `$V fixture` again and use fresh page/fixture IDs; `clean-seeds` only removes helper-created temporary rows.

## Driving conventions

Use `PAGE` for the returned page ID. Take a fresh `take_snapshot` before every native `click` or `fill`, select the UID beside the named control, and repeat after a dialog or navigation. The literal command shape is:

```bash
npm run --silent verify:app -- tool take_snapshot "{\"pageId\":$PAGE}" --worker "$WORKER"
npm run --silent verify:app -- tool click "{\"pageId\":$PAGE,\"uid\":\"$UID\"}" --worker "$WORKER"
```

Navigate between user pages through visible links and menus. For a fixed seeded date, use the Month and year picker, then choose the relevant named Person row and date cell. If several cells have the same name, a narrowly scoped DOM click on that visible row/day button through `evaluate_script` is allowed; do not call application handlers. Read-only authenticated `fetch` through that same signed-in page can establish a denied status or compare known fixture IDs in page data. The helper's `rows` command gives exact disposable-provider readback.

## Features

- [Dashboard composition and freshness](dashboard.md): source counts, packet progress, losses and delayed navigation.
- [Performance measurement on seeded workloads](performance.md): timing, traces and query statistics on synthetic workloads.

### Access and people

- [Trusted access and request isolation](access-context.md): admission, scope and denied writes.
- [Platform access, accounts and Organizations](platform-administration.md): platform admission, directories and suspension.
- [Platform announcements, Feedback and Audit support](platform-support-content.md): admin content lifecycle and recovery.
- [Platform admin states](platform-admin-states.md): admin screens in every state.
- [Sign in and sign out](sign-in.md): public gate, session and sign-out.
- [Public and marketing pages](public-pages.md): public pages and their navigation.
- [Identity recovery, MFA and account security](identity-recovery-security.md): MFA, recovery, invites, setup and security settings.
- [App shell and saved preferences](shell-preferences.md): shell chrome and preference persistence.
- [Shared dialogs, date selection and tooltips](shared-ui.md): accessibility, focus and form consumers.
- [Component family interaction contracts](component-foundation.md): field, menu, overlay and toast behavior.
- [Shared composition equivalence](shared-compositions.md): computed-style comparison of shared compositions.
- [Create an Organization](organization-creation.md): owner creation and retry.
- [Invite and accept Organization members](organization-invitations.md): invitation, setup and acceptance.
- [Manage Organization member access and ownership](organization-member-access.md): role, Group and ownership edits.
- [Archival and deletion requests](deletion-requests.md): submission, review and source effects.
- [Organization settings and destruction](organization-settings-destruction.md): name, URL, settings and deletion.
- [Organization settings, creation and communications states](organization-settings-states.md): settings screens in every state.
- [Organization data exports](organization-exports.md): export contents, lifecycle and recovery.
- [Find personnel](find-personnel.md): search, roster views and scope.
- [Personnel record lifecycle](personnel-records-lifecycle.md): create, import, archive and restore.
- [Personnel artifacts](personnel-artifacts.md): counseling, documents, follow-ups and notes.
- [Personnel Overview](personnel-overview.md): the Overview tab's streamed sections.
- [Personnel Readiness tab](personnel-readiness.md): training and critical-task tables and the drawer.
- [Manage groups](manage-groups.md): Group lifecycle and denial.
- [Rank catalog](rank-settings.md): rank packs, custom ranks and retirement.
- [Invalid, stale and conflicting input](invalid-input.md): malformed, missing and conflicting input.
- [Personnel, Groups and settings forms](personnel-form-states.md): form failure and screen states.
- [Dashboard and Training states](training-form-states.md): Dashboard and Training screens in every state.
- [Sign-in rosters](sign-in-rosters.md): roster snapshots, signed scans and scope.
- [Training catalog and views](training-catalog-views.md): requirement types and saved views.
- [Training completions, matrix and reports](training-completions-reports.md): records, imports, matrix and reports.

### Communications

- [Audit capture and safe projections](audit-capture-projections.md): audit summaries, details and masking.
- [Notifications, feedback and announcements](notifications-feedback.md): inbox, feedback and announcements.

### Onboarding

- [Onboarding templates and configuration](onboarding-templates.md): template and step lifecycle.
- [Onboarding packets, progress and history](onboarding-packets.md): packet progress, lifecycle and views.
- [Onboarding History](onboarding-history.md): finished packets and filters.
- [Onboarding and Sign-in Roster states](onboarding-roster-states.md): Onboarding and roster screens in every state.

### Evals

- [Rating Scheme and Evals](evals-rating-scheme.md): rating chain, due dates and workbooks.

### Critical Tasks

- [Manage the Critical Tasks library](critical-tasks-library.md): task definitions, import and archive.
- [Record Critical Tasks and inspect readiness](critical-tasks-completions-readiness.md): completions, status and reports.

### Calendar

- [Calendar navigation](calendar-navigation.md): date range, filters and picker.
- [Availability status](availability-status.md): status entry lifecycle and recovery.
- [Calendar access](calendar-access.md): read scope and denied writes.
- [Bulk status changes](bulk-status.md): bulk selection and import.
- [Calendar catalogs](calendar-catalogs.md): status and assignment type settings.
- [Manual assignments](calendar-assignments.md): assignment planner and quick fill.
- [Special days](special-days.md): holidays, closures and federal reset.
- [Reports and history](reports-history.md): Calendar reports and workbooks.
- [Organization switching](organization-switching.md): A/B isolation and delayed responses.

## Lower-level checks

Browser recipes do not replace component, server, provider or SQL checks. For a code change, run the affected Vitest files with `npm run test -- <file>` and follow the [Definition of Done](../../../../docs/architecture/DEFINITION_OF_DONE.md#required-commands). For example, `src/features/calendar/utils/availabilityImport.test.ts`, `stores/availability.svelte.test.ts`, `components/CalendarSettingsPage.test.ts`, `stores/specialDays.svelte.test.ts`, Calendar route server tests, and Personnel/Group route tests cover behavior below the UI. The SQL controls `supabase/tests/calendar_lane_unassigned_scope.sql`, `calendar_catalog_scope.sql`, `calendar_persistence_isolation.sql`, and `personnel_unassigned_row_scope.sql` require the separately owned disposable database procedure in the Definition of Done; never aim them at the existing local or remote database. A browser request denial complements those checks, and a UI affordance does not establish RLS.

## Feature entry contract

Every feature file starts with one user-facing summary and four H2 sections in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify:app`, and `Gotchas`. Keep preconditions, concrete actions, expected observations, and evidence capture together. Group a journey by what a member is doing, not by a script or one assertion.
