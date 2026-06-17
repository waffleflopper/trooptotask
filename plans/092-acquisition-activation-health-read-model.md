# Plan 092: Add acquisition and activation health visibility

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This is a direction/design slice for support-safe acquisition and
> first-week activation visibility. Follow `docs/agents/architecture-governance.md`
> before adding admin/provider seams. If Svelte files are edited, follow
> `docs/agents/svelte.md` and run `svelte-autofixer` until clean. If anything
> in the "STOP conditions" section occurs, stop and report. When done, update
> the status row for this plan in `plans/README.md` unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d485cdc5..HEAD -- docs/launch-acquisition-path.md plans/081-surface-first-run-owner-checklist.md plans/086-support-admin-visibility-self-service.md 'src/routes/org/[orgId]/api/getting-started' src/features/dashboard/read-model/dashboardScreenModel.svelte.ts src/features/dashboard/components src/routes/admin src/lib/server/adapters/supabasePlatformAdministration.ts src/lib/server/core/useCases/platformAdministration.ts src/features/personnel/components/PersonnelPageView.svelte src/features/personnel/components/PersonnelImportPage.svelte src/lib/server/core/useCases/orgProvisioning.ts supabase/migrations`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: plans/081-surface-first-run-owner-checklist.md, plans/083-public-account-creation-abuse-controls.md, plans/084-self-service-organization-onboarding.md, plans/085-checkout-trial-entry-billing-recovery.md, plans/086-support-admin-visibility-self-service.md, plans/087-self-service-acquisition-e2e-coverage.md
- **Category**: direction
- **Planned at**: commit `d485cdc5`, 2026-06-16 (reconciled; originally planned at `c6760c16`)

## Reconciliation note

On 2026-06-16, this plan was refreshed at `d485cdc5`. The getting-started
endpoint changed after the original plan to use policy-first route configs and
`identity-owned-preference` read-only-mode exceptions for dismissal writes. The
activation-health finding still stands: the endpoint still returns only
checklist support counts and dismissal state, not a post-checkout activation
health model.

## Why this matters

Plans 083-087 can get a customer from public signup through checkout, and Plan
081 gives owners a basic first-run checklist. After paid launch, Robert still
needs to know whether self-service customers reach product value: import a
roster, invite another leader, review seeded defaults, configure key workflows,
and create first operational artifacts. This plan adds a support-safe
activation read model and tightens the first-run checklist so acquisition does
not end at payment.

## Current state

- `plans/086-support-admin-visibility-self-service.md:109-119` covers support
  visibility for signup, email confirmation, Organization creation, checkout,
  and billing recovery.
- `docs/launch-acquisition-path.md:84-91` asks support to answer acquisition
  and billing-state questions, not post-checkout activation questions.
- `src/routes/org/[orgId]/api/getting-started/+server.ts:15-33` returns
  onboarding template step count, rating scheme entry count, org member count,
  and dismissed state; writes use the `identity-owned-preference`
  read-only-mode exception.
- `src/features/dashboard/read-model/dashboardScreenModel.svelte.ts:283-333`
  defines getting-started items for roster, statuses, training, assignments,
  members, onboarding, and evals.
- `src/features/dashboard/read-model/dashboardScreenModel.svelte.ts:285-289`
  links "Add the roster" to `/personnel`, while
  `src/features/personnel/components/PersonnelPageView.svelte:293-299` has a
  separate Import action and
  `src/features/personnel/components/PersonnelImportPage.svelte:501-516`
  accepts Excel/CSV roster files.
- `src/lib/server/core/useCases/orgProvisioning.ts:72-129` seeds status types,
  and `src/lib/server/core/useCases/orgProvisioning.ts:131-138` seeds a
  default Staff Duty assignment type.
- `supabase/migrations/20260413001158_remote_schema.sql:2138-2144` shows
  `getting_started_progress` only stores dismissal state.

Current excerpts:

```ts
// src/features/dashboard/read-model/dashboardScreenModel.svelte.ts:285-289
{
	id: 'personnel',
	label: 'Add the roster',
	href: `${orgPath}/personnel`,
	complete: this.personnelCount > 0
}
```

```ts
// src/lib/server/core/useCases/orgProvisioning.ts:72
const DEFAULT_STATUS_TYPES: OrgProvisioningStatusTypeSeed[] = [
```

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:2138
CREATE TABLE IF NOT EXISTS "public"."getting_started_progress" (
```

```ts
// src/routes/org/[orgId]/api/getting-started/+server.ts
policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard
readOnlyModeException: 'identity-owned-preference'
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Architecture docs | Read `docs/agents/architecture-governance.md` before admin/provider seam changes | docs read |
| Svelte docs | Svelte MCP docs flow if editing `.svelte` files | docs read |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions remain |
| Dashboard tests | `npx vitest run src/features/dashboard/read-model/dashboardScreenModel.svelte.test.ts src/features/dashboard/components/DashboardPageView.svelte.test.ts 'src/routes/org/[orgId]/(dashboard)/page.svelte.test.ts'` | all pass when files exist |
| Admin tests | `npx vitest run src/routes/admin/page.server.test.ts` plus new activation-health tests | all pass |
| Governance | `npm run governance:check` | exits 0 |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- A support-safe acquisition/activation health read model for Platform
  Administration, or a design document plus follow-up plan if a schema change is
  required.
- Existing getting-started support endpoint/read model only where it can expose
  better milestones without broad schema churn.
- First-run checklist copy/link improvements:
  - roster item should prefer import or clearly offer import/add;
  - seeded status/assignment defaults should be framed as review tasks, not
    proof of user-completed setup;
  - Duty Roster/DA6 setup may be added as a conditional first-week item if the
    data is already cheaply available.
- Admin/support docs that distinguish acquisition state from activation health.
- `plans/README.md` status row only.

**Out of scope**:

- Do not build a general analytics platform.
- Do not store raw IP addresses, raw emails beyond existing account records,
  source URLs with secrets, Vercel Analytics identifiers, or personal tracking
  beyond support-safe Organization-level facts.
- Do not add invasive user-level behavioral analytics.
- Do not add a database migration in this plan unless Robert explicitly
  approves after the design step; if persistence is required, stop and write a
  separate migration plan.
- Do not change billing entitlement, checkout, or Organization creation logic.

## Git workflow

- Branch: `codex/092-acquisition-activation-health`
- Commit style: short imperative subject, for example
  `Add activation health visibility`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Design the activation health contract

Define the stages Robert needs after self-service launch. Suggested support-safe
stages:

- signup submitted;
- email confirmed;
- Organization created;
- checkout started/completed/recovered;
- roster imported or meaningful roster threshold reached;
- another leader invited/accepted;
- seeded status and assignment defaults reviewed;
- first duty roster template/run created;
- onboarding/training/eval setup started.

Decide which stages can be computed from existing tables and which would
require persistence. If persistence is required for reviewed defaults or import
completion, stop and produce a separate migration plan instead of adding schema
inside this plan.

**Verify**:
Add a short design note to `docs/launch-acquisition-path.md` or a new
support-safe docs file that maps each stage to existing data or a required
follow-up.

### Step 2: Add the admin activation read model where existing data is enough

Using existing Platform Administration patterns, add an activation health read
model for self-service/paid Organizations only where the data already exists.
Keep it Organization-level and support-safe.

**Verify**:
Focused use-case/server tests cover an activated customer, a paid-but-empty
Organization, and a diagnostics-unavailable state.

### Step 3: Tighten first-run checklist semantics without schema churn

Improve the owner checklist using existing data:

- change roster copy/link so import is the primary path when permitted;
- clarify seeded status/assignment items as review/configuration tasks;
- add Duty Roster setup only if the support endpoint can count templates/runs
  cheaply through existing read paths.

Do not treat seeded defaults as a durable "reviewed" state unless there is
approved persistence.

**Verify**:
Dashboard read-model/component tests assert the revised labels, hrefs, and
completion behavior.

### Step 4: Document privacy/support boundaries

Update launch/support docs so acquisition funnel and activation health are
described as operational support facts, not personal analytics. Name what is
stored, what is aggregate, and what must not be captured.

**Verify**:
`rg -n "activation health|acquisition funnel|roster import|Duty Roster|support-safe|raw IP|analytics" docs/launch-acquisition-path.md docs/security/operational-control-evidence.md`
shows the boundary.

### Step 5: Run verification

Run focused dashboard/admin tests, Svelte autofixer if needed, governance, and
the full repo gate.

**Verify**:

- Focused dashboard tests exit 0.
- Focused admin activation tests exit 0.
- `npm run governance:check` exits 0.
- Svelte autofixer reports no issues/suggestions for edited Svelte files.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- Read-model tests for activation stages computed from existing data.
- Admin/server tests for role visibility and diagnostics failure.
- Dashboard read-model/component tests for checklist copy/link/completion.
- No browser or Vercel Analytics dependency is required for this plan.

## Done criteria

- [ ] Robert can see support-safe activation health for self-service/paid
      Organizations using existing data, or the plan stops with a separate
      persistence/migration follow-up.
- [ ] First-run checklist points real units toward roster import and avoids
      overstating seeded defaults as reviewed setup.
- [ ] Duty Roster/DA6 activation is either represented with cheap existing data
      or explicitly deferred with rationale.
- [ ] Docs distinguish acquisition/billing support state from activation health.
- [ ] No invasive personal analytics, raw IP capture, or secret-bearing data is
      added.
- [ ] Focused tests, governance, and full repo gate pass.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- Accurate activation health requires new persisted milestone state.
- The implementation would add personal tracking rather than Organization-level
  support facts.
- The work requires a migration, production data access, Vercel Analytics data,
  live Stripe, secrets, or database reset/deletion.
- The admin/provider seam would violate governance or require a new role model.

## Maintenance notes

Activation health should help Robert support customers, not surveil users. Keep
the first version coarse and Organization-level. If later product analytics are
needed, design them separately with privacy review and explicit retention rules.
