# Plan 093: Ship starter configuration packs for first-week workflows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan edits Svelte files, so follow `docs/agents/svelte.md`
> before editing and run `svelte-autofixer` until clean. Follow
> `docs/agents/architecture-governance.md` before adding route/provider seams.
> If anything in the "STOP conditions" section occurs, stop and report. When
> done, update the status row for this plan in `plans/README.md` unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 2f3bc4d6..HEAD -- src/routes/org/new src/lib/server/core/useCases/orgProvisioning.ts 'src/routes/org/[orgId]/api/getting-started' 'src/routes/org/[orgId]/(dashboard)' src/features/dashboard src/features/onboarding src/features/training src/features/duty-roster src/lib/server/core/useCases/onboardingTemplateCrud.ts src/lib/server/core/useCases/dutyRosterTemplates.ts src/lib/server/entities/trainingType.ts src/lib/server/entities/onboardingTemplate.ts src/lib/server/entities/onboardingTemplateStep.ts docs/launch-acquisition-path.md supabase/migrations`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: plans/081-surface-first-run-owner-checklist.md, plans/084-self-service-organization-onboarding.md, plans/092-acquisition-activation-health-read-model.md
- **Category**: direction
- **Planned at**: commit `2f3bc4d6`, 2026-06-28 (Robert selected starter configuration packs from the post-launch `$improve next` shortlist)

## Why this matters

Plan 092 lets Platform Administration see whether a self-service Organization
has started reaching product value, but the product still asks a new owner to
invent every first-week workflow from blank screens. A starter configuration
pack should help an owner create an editable onboarding template, basic training
requirements, and a Duty Roster template scaffold without silently imposing
doctrine or treating seeded defaults as reviewed.

This is activation work, not analytics work. It should make TroopToTask feel
useful in the first session after the roster import while staying safe for
different unit shapes.

## Current state

- `src/routes/org/new/+page.svelte:71-77` promises day-one defaults for groups,
  status types, assignment types, and federal holidays.
- `src/lib/server/core/useCases/orgProvisioning.ts:66-139` seeds Leadership,
  Alpha, Bravo, availability statuses, and one Staff Duty assignment type.
- `src/lib/server/core/useCases/orgProvisioning.ts:184-196` applies only those
  defaults and federal holidays during Organization creation.
- `src/routes/org/[orgId]/api/getting-started/+server.ts:7-15` exposes support
  counts for onboarding template steps, rating scheme entries, members, Duty
  Roster templates/runs/history, and dismissal state.
- `src/features/dashboard/read-model/dashboardScreenModel.svelte.ts:301-360`
  turns those counts into first-run checklist items for roster, statuses,
  training, assignments, Duty Roster, members, onboarding, and evals.
- `src/features/dashboard/components/GettingStartedCard.svelte:24-70` renders
  the setup card but only links users out to each blank workflow.
- `src/features/onboarding/components/OnboardingPageView.svelte:138-151` shows
  an empty onboarding template state with a single "Set Up Template" button.
- `src/features/training/components/TrainingTypesPage.svelte:268-277` shows an
  empty training type list with a single "New Type" button.
- `src/features/duty-roster/components/DutyRosterNewTemplateWorkspace.svelte:68-73`
  starts Duty Roster setup as a manual four-step wizard.
- `src/lib/server/core/useCases/onboardingTemplateCrud.ts:40-63` already owns
  onboarding template and step writes.
- `src/routes/org/[orgId]/api/training-types/+server.ts:1-5` writes Training
  Types through the entity CRUD route for `TrainingTypeEntity`.
- `src/lib/server/core/useCases/dutyRosterTemplates.ts:73-79` already owns
  configured Duty Roster template creation.

Current excerpts:

```svelte
<!-- src/routes/org/new/+page.svelte:71 -->
<p class="seed-label">Included On Day One</p>
```

```ts
// src/lib/server/core/useCases/orgProvisioning.ts:184
logBootstrapError('Groups seed error:', await port.seedDefaultGroups(created.orgId, DEFAULT_GROUPS));
```

```ts
// src/routes/org/[orgId]/api/getting-started/+server.ts:32
async function fetchGettingStartedSupport(ctx: UseCaseContext) {
```

```svelte
<!-- src/features/dashboard/components/GettingStartedCard.svelte:31 -->
<Card.Title class="mt-1">Get this Organization ready</Card.Title>
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Architecture docs | Read `docs/agents/architecture-governance.md` before route/provider seam changes | docs read |
| Svelte docs | Svelte MCP `list-sections`, then `get-documentation` for relevant Svelte/SvelteKit sections | docs read before editing `.svelte` files |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions remain |
| Starter pack use-case tests | `npx vitest run src/lib/server/core/useCases/starterConfigurationPacks.test.ts` | all pass |
| Getting-started route tests | `npx vitest run 'src/routes/org/[orgId]/api/getting-started/server.test.ts'` plus any new starter-pack route test | all pass |
| Dashboard tests | `npx vitest run src/features/dashboard/read-model/dashboardScreenModel.svelte.test.ts src/features/dashboard/components/DashboardPageView.svelte.test.ts 'src/routes/org/[orgId]/(dashboard)/page.svelte.test.ts'` | all pass |
| Workflow tests | Focused onboarding, training type, and Duty Roster template tests touched by the implementation | all pass |
| Governance | `npm run governance:check` | exits 0 |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- One opt-in starter configuration pack surfaced from the owner/admin
  first-run setup path.
- A server-owned starter pack contract with preview metadata, eligibility, and
  application result details.
- Applying the starter pack through app-owned seams for:
  - editable Training Types;
  - an editable onboarding template with ordered steps;
  - an editable Duty Roster template scaffold.
- Idempotency: applying the pack twice must not duplicate the same named
  artifacts.
- Permission safety: the apply operation must require the needed configure
  actions before mutating anything.
- Support-safe activation visibility: getting-started support data may report
  that starter-pack artifacts exist, but it must not store user-level behavior
  analytics.
- Copy that makes the pack clearly optional and editable.
- Tests for the starter pack contract, route behavior, dashboard state, and
  idempotent application.

**Out of scope**:

- Do not add a general template marketplace.
- Do not silently apply packs during Organization creation.
- Do not add paid-entitlement changes, billing behavior, checkout behavior, or
  Organization creation changes.
- Do not add analytics, raw IP logging, source URL tracking, or personal
  activity streams.
- Do not add external Slack, email, SMS, or GitHub automation.
- Do not add doctrine-specific official templates that imply every unit should
  use the same workflow.
- Do not reset or delete local database tables. Never touch the production
  database.

## Starter pack content contract

Start with one conservative pack named **First Week Operations**. It should be
described as a starting point, not a mandated standard.

Suggested editable artifacts:

- Training Types:
  - `Unit Orientation`, no expiration, neutral color.
  - `Required Annual Training`, 12-month expiration, neutral color.
- Onboarding Template:
  - `New Arrival Packet`.
  - Ordered steps:
    - `Confirm contact and roster details` as a checkbox step.
    - `Complete unit orientation` as a training step linked to `Unit Orientation`.
    - `Review required documents` as a paperwork step with simple stages such
      as `issued`, `returned`, `filed`.
    - `Assign duty role and Group` as a checkbox step.
- Duty Roster Template:
  - `Staff Duty`, slug `staff-duty`, short code `SD`.
  - Broad pool criteria by default; do not exclude Soldiers unless the owner
    edits the template.
  - Empty or zero manual baseline counts unless the existing use case requires
    a value.

The executor may adjust labels for consistency with live terminology, but keep
them generic, editable, and non-doctrinal. If Robert wants official pack content
or multiple unit-shape packs before implementation, treat that as a STOP
condition and write the content decisions down before coding.

## STOP conditions

- Applying the pack requires a new persistence table for pack application
  history, pack versions, or activation milestones.
- Existing app-owned use cases cannot apply the Training Type, onboarding, and
  Duty Roster artifacts without partial writes that are hard to detect or
  recover from.
- Authorization cannot be checked for all required configure actions before the
  first mutation.
- The implementation would require bypassing read-only mode or weakening a
  policy action.
- The pack content becomes doctrine-specific, legally sensitive, or otherwise
  requires Robert's product decision before it can be shipped.
- The executor discovers that the existing data model cannot make the apply
  operation idempotent without schema work.

## Git workflow

- Branch: `codex/093-starter-configuration-packs`
- Commit style: short imperative subject, for example
  `Add starter configuration packs`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Design the starter pack contract

Define a small app-owned contract for starter packs. Suggested file:
`src/lib/server/core/useCases/starterConfigurationPacks.ts`.

The contract should expose:

- pack id, name, description, and artifact preview;
- whether the current Organization already appears configured for each artifact
  family;
- whether the current actor can apply the pack;
- an application result that lists created, skipped, and failed artifact names
  without exposing provider details.

Keep the contract source-owned for this first pack. Do not add a database table
for pack definitions unless Robert explicitly approves a separate schema plan.

**Verify**:
Use-case tests cover the preview shape and the eligibility/readiness result for
an empty Organization and an already-configured Organization.

### Step 2: Add an idempotent apply use case

Implement `applyStarterConfigurationPack` through existing app-owned write
seams:

- create Training Types through the same entity/use-case path used by
  `TrainingTypeEntity`;
- create the onboarding template and steps through
  `createOnboardingTemplate` and `createOnboardingTemplateStep`;
- create the Duty Roster template through `createConfiguredDutyRosterTemplate`.

Before the first mutation, require all needed configure actions:

- `POLICY_ACTION_CATALOG.training.configureRequirements`;
- `POLICY_ACTION_CATALOG.onboarding.configureWorkflows`;
- `POLICY_ACTION_CATALOG.calendar.configureDutyTemplates`.

Make the operation idempotent by looking up existing artifacts by stable names
or slug before creation. If an artifact already exists, skip it and include it
in the result. Prefer no-op skips over overwriting owner-edited records.

**Verify**:
Focused tests prove:

- an empty Organization receives the starter artifacts;
- applying the same pack twice skips existing artifacts instead of duplicating
  them;
- missing any required configure permission stops before writes;
- read-only mode blocks mutation through the same guard path as other workflow
  configuration writes;
- result details stay support-safe.

### Step 3: Surface the pack from getting started

Expose starter pack preview and apply state from the first-run owner/admin path.
Either extend `GET /org/[orgId]/api/getting-started` or add a sibling
`/api/starter-configuration-packs` endpoint; choose the option that keeps route
policy and dashboard hydration simplest.

The apply endpoint must be a mutation route and must route through the starter
pack use case. It must not write directly from a Svelte component or route
handler.

**Verify**:
Route tests cover policy-first config, support-safe GET payload, successful
apply, and denied apply before mutation.

### Step 4: Add the dashboard affordance

Update the getting-started card so an owner/admin with an empty or mostly empty
workspace can apply **First Week Operations** without leaving the dashboard.

UX requirements:

- Keep the existing checklist.
- Show the pack as optional and editable after apply.
- Avoid nested cards inside the current setup card.
- Show a pending state while applying.
- After success, refresh the getting-started/dashboard support data so the
  checklist reflects the newly created artifacts.
- If apply fails, show a concise error without exposing provider details.

If the actor lacks one of the required configure permissions, do not show a
mutating button. A non-mutating "Open setup checklist" path is fine.

**Verify**:
Dashboard model/component tests cover visible pack CTA, successful apply state,
permission-disabled state, and failure rollback.

### Step 5: Update activation docs and evidence

Update `docs/launch-acquisition-path.md` or a closely scoped support-safe docs
file to explain:

- Organization creation still seeds basic defaults automatically;
- starter configuration packs are opt-in;
- starter pack application creates editable workflow configuration artifacts;
- Platform Administration activation health should treat pack artifacts as
  setup progress, not proof of workflow quality or command readiness.

**Verify**:
Docs stay support-safe and do not claim formal doctrine, certification, or
compliance.

### Step 6: Run verification and close out

Run the focused tests first, then the full gate:

```sh
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

If Svelte files changed, include the Svelte MCP documentation/autofixer evidence
in the closeout.

When complete, update `plans/README.md` status for Plan 093 to `DONE` and add a
brief completion note with the branch and verification summary.
