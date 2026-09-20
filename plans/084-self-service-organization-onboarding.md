# Plan 084: Add self-service organization creation and first-run onboarding

Historical implementation record. The [stabilization queue](../docs/stabilization/TODO.md) owns current work; the executor/drift instructions for this completed plan are retired. References below to deleted billing runbooks, plans or code identify historical inputs and do not authorize restoring them. Retained behavior and verification remain governed by the queue. Current acquisition/support guidance is in [Launch Acquisition Path](../docs/launch-acquisition-path.md); external commercial retirement follows [RELEASE](../docs/stabilization/RELEASE.md#commercial-operations-retirement--03-07b-01).

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: plans/083-public-account-creation-abuse-controls.md, plan 081
- **Category**: direction
- **Planned at**: commit `d485cdc5`, 2026-06-16 (reconciled; originally planned at `0cafdd3e`)

## Reconciliation note

On 2026-06-17, PR #1230 completed this plan after the `d485cdc5`
reconciliation. The first-run checklist from plan 081 is now connected to the
billing-enabled signup path from plan 083, and `/org/new` serves the
post-confirmation first Organization handoff.

Stabilization [03-02a](../docs/stabilization/TODO.md#03-02-local-leaves--d02-1293)
removes the ownership-cap availability loader and commercial page state.
The route retains verified-email admission and calls `provisionOrganization`
through the same adapter for atomic owner creation and default records.
The excerpts below describe the completed historical plan, not current instructions.

## Why this matters

Self-service account creation is not enough for paid acquisition. A new
customer needs a safe path from confirmed User Account to first Organization,
with clear onboarding and no accidental Organization Membership side effects
from Access Requests. The current `/org/new` route already provisions an
Organization for authenticated users, but it was not designed as the public
post-signup first-run path.

## Historical state at planning

- `src/routes/org/new/+page.server.ts` redirects unauthenticated users to
  `/auth/login`.
- `src/routes/org/new/+page.server.ts` calls `loadOrganizationProvisioning` and
  `provisionOrganization` through `createSupabaseOrgProvisioningPort`.
- `src/routes/org/new/+page.svelte` says "Organization Setup" and creates a
  workspace with seeded defaults.
- Plan 081 has landed a dashboard owner getting-started checklist backed by
  `src/routes/org/[orgId]/api/getting-started/+server.ts`.

Current excerpts:

```ts
// src/routes/org/new/+page.server.ts
if (!locals.user) throw redirect(303, '/auth/login');
```

```ts
// src/routes/org/new/+page.server.ts
result = await provisionOrganization(createSupabaseOrgProvisioningPort(locals), {
	name: (formData.get('name') as string) ?? '',
	userId: user.id,
	email: user.email
});
```

```svelte
<!-- src/routes/org/new/+page.svelte -->
<p class="subtitle">Stand up a workspace for scheduling, readiness tracking, and day-to-day unit management.</p>
```

```ts
// src/routes/org/[orgId]/api/getting-started/+server.ts
policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard;
readOnlyModeException: 'identity-owned-preference';
```

## Commands you will need

| Purpose                   | Command                                                                                                      | Expected on success                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Svelte docs               | Svelte MCP `list-sections`, then `get-documentation` for relevant Svelte/SvelteKit sections                  | docs read before editing `.svelte` files |
| Svelte autofix            | `svelte-autofixer` on edited Svelte files                                                                    | no issues or suggestions remain          |
| Org provisioning tests    | `npx vitest run src/routes/org/new/page.server.test.ts src/lib/server/core/useCases/orgProvisioning.test.ts` | all pass                                 |
| Dashboard first-run tests | Plan 081 focused dashboard tests if Plan 081 has landed                                                      | all pass                                 |
| Full repo gate            | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test`                | all exit 0                               |

## Scope

**In scope**:

- `src/routes/org/new/+page.server.ts`
- `src/routes/org/new/+page.svelte`
- `src/routes/org/new/page.server.test.ts`
- `src/lib/server/core/useCases/orgProvisioning.ts` and tests only if current
  creation policy needs a self-service flag or post-signup redirect support.
- Dashboard first-run route/component files only to integrate with Plan 081 if
  that plan has landed.
- Public/auth post-signup redirect copy introduced by Plan 083, if needed.
- `plans/README.md` status row only.

**Out of scope**:

- No Stripe checkout start in this plan.
- No trial, coupon, invoice, or payment recovery behavior.
- No production database, live Stripe, secrets, or local DB reset/deletion.
- No new schema unless `getting_started_progress` is proven insufficient. If
  schema is required, stop and ask for a separate migration plan.
- Do not create Organization Members from Access Request completion.

## Git workflow

- Branch: `codex/084-self-service-org-onboarding`
- Commit style: short imperative subject, for example
  `Add self-service organization onboarding path`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm Plan 083 and Plan 081 state

Read the implemented signup route from Plan 083 and the first-run checklist
work from Plan 081. If either surface is unavailable or has regressed, stop
unless the operator explicitly tells you to rebase the plan.

**Verify**:
`test -f docs/launch-acquisition-path.md && rg -n "self-service|signup|first-run|getting-started|org/new" docs/launch-acquisition-path.md plans/081-surface-first-run-owner-checklist.md src/routes/auth src/routes/org/new`
shows the expected signup and first-run context.

### Step 2: Make `/org/new` a deliberate post-confirmation destination

Keep the unauthenticated redirect. For confirmed self-service users, make the
page copy and server data clearly represent first Organization setup. If Plan
083 uses a post-confirm page, route it to `/org/new` only after email
confirmation.

Do not let unconfirmed users create Organizations.

**Verify**:
`npx vitest run src/routes/org/new/page.server.test.ts` passes with assertions
for unauthenticated redirect and confirmed-user create behavior.

### Step 3: Preserve provisioning policy and seeded defaults

Use the existing `provisionOrganization` use case and
`createSupabaseOrgProvisioningPort` boundary. If self-service needs a new
policy check, add it inside the use case or port rather than route-local raw
Supabase queries.

**Verify**:
`npx vitest run src/lib/server/core/useCases/orgProvisioning.test.ts src/routes/org/new/page.server.test.ts`
passes.

### Step 4: Connect first-run onboarding to the dashboard

After Organization creation, send the owner to the new Organization dashboard or
checklist state. If Plan 081 is present, ensure the owner checklist loads for
the new Organization and does not require manual support data refresh.

**Verify**:
Run the Plan 081 focused tests named in `plans/081-surface-first-run-owner-checklist.md`
and confirm they pass.

### Step 5: Run Svelte and repo verification

Run Svelte autofixer on every edited `.svelte` file until clean, then run
focused tests and the full repo gate.

**Verify**:

- Svelte autofixer reports no issues/suggestions.
- `npx vitest run src/routes/org/new/page.server.test.ts src/lib/server/core/useCases/orgProvisioning.test.ts` exits 0.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- Extend `/org/new` server tests for confirmed self-service users, existing
  owner limit handling, unauthenticated redirect, and use-case error mapping.
- Add component/page tests if visible copy or first-run presentation changes.
- Re-run Plan 081 dashboard tests if the checklist is used as the first-run
  destination.

## Done criteria

- [ ] Confirmed self-service users can intentionally create their first
      Organization.
- [ ] Unauthenticated or unconfirmed users cannot create Organizations.
- [ ] The existing Organization provisioning boundary remains the write path.
- [ ] First-run destination is clear and covered by tests.
- [ ] No checkout, trial, or payment behavior is added here.
- [ ] Svelte autofixer is clean for edited Svelte files.
- [ ] Focused tests and full repo gate pass.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- The confirmed self-service User Account path from Plan 083 is unavailable or
  regresses.
- Creating the first Organization requires a schema change not covered by this
  plan.
- The change would create Organization Membership from Access Request
  completion.
- Svelte MCP docs or `svelte-autofixer` are unavailable for edited Svelte files.
- Any step requires production DB, live Stripe, secrets, or local DB
  reset/deletion.

## Maintenance notes

This plan owns the transition from confirmed User Account to first Organization.
Plan 085 owns the transition from Organization to billing and checkout. Keep
those boundaries separate so account identity, tenancy, and billing recovery
remain reviewable.
