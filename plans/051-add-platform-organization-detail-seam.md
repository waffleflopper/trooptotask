# Plan 051: Add platform organization detail seam

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/routes/admin/organizations/[orgId]/+page.server.ts src/routes/admin/organizations/[orgId]/page.server.test.ts src/lib/server/core/useCases/platformOrganizationDetail.ts src/lib/server/core/useCases/platformOrganizationDetail.test.ts src/lib/server/adapters/supabasePlatformOrganizationDetail.ts src/lib/server/adapters/supabasePlatformOrganizationDetail.test.ts src/lib/server/adapters/inMemoryPlatformOrganizationDetail.ts docs/architecture/DRIFT_LEDGER.md docs/architecture/adrs/0011-platform-administration-boundary.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: architecture
- **Planned at**: commit `9a1e439b`, 2026-06-13 AKDT

## Why this matters

The platform admin organization detail page already uses narrow Platform Administration seams for
members, gifting, metrics, and audit activity. The load still reads the base Organization row and
the billing snapshot directly from `ctx.adminClient`, with Supabase row types and billing snapshot
mapping in the route file. That leaves one of the most important support screens half-seamed: a
reader must inspect the route to understand which provider rows define an Organization detail
payload. After this plan, the route should call a `PlatformOrganizationDetail` module and the
Supabase table details should live in its adapter.

## Current state

- `src/routes/admin/organizations/[orgId]/+page.server.ts:53-109` defines
  `AdminOrganizationBillingSnapshotRow` and `mapAdminOrganizationBillingSnapshot` in the route.
- `src/routes/admin/organizations/[orgId]/+page.server.ts:118-124` reads
  `organizations` directly through `adminClient.from(...)`.
- `src/routes/admin/organizations/[orgId]/+page.server.ts:146-156` reads
  `organization_billing_snapshots` directly through `adminClient.from(...)`.
- `src/routes/admin/organizations/[orgId]/+page.server.ts:125-168` then composes existing seams:
  `PlatformGifting`, `PlatformMembershipAdministration`, `PlatformMetrics`, `PlatformAudit`,
  plan policy, and plan usage.
- `src/routes/admin/organizations/[orgId]/page.server.test.ts:169-205` still allows direct
  `organizations` and `organization_billing_snapshots` reads in `makeOrgDetailLoadClient()`, while
  throwing for route-level audit and membership reads.
- `src/lib/server/core/useCases/platformOrganizationLedger.ts` is the list/subscription ledger seam
  from plan 042. It is useful precedent, but do not stretch it into a detail-page grab bag.
- ADR 0011 says remaining route-level admin reads should retire into several narrow Platform
  Administration modules rather than one extended `platformAdministration.ts` interface.

## Commands you will need

| Purpose                    | Command                                                                                                                                       | Expected on success |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Install, if needed         | `npm ci`                                                                                                                                      | exit 0              |
| Focused route test         | `npx vitest run src/routes/admin/organizations/[orgId]/page.server.test.ts`                                                                   | all pass            |
| Focused use-case tests     | `npx vitest run src/lib/server/core/useCases/platformOrganizationDetail.test.ts src/lib/server/adapters/supabasePlatformOrganizationDetail.test.ts` | all pass            |
| Provider-read grep         | `rg -n "AdminOrganizationBillingSnapshotRow|mapAdminOrganizationBillingSnapshot|organization_billing_snapshots|\\.from\\('organizations'\\)" src/routes/admin/organizations/[orgId]/+page.server.ts` | no matches          |
| Format                     | `npm run format`                                                                                                                              | exit 0              |
| Lint                       | `npm run lint`                                                                                                                                | exit 0              |
| Governance                 | `npm run governance:check`                                                                                                                     | exit 0              |
| Typecheck                  | `npm run check`                                                                                                                               | exit 0              |
| Full tests                 | `npm run test`                                                                                                                                | exit 0              |

## Scope

**In scope**:

- New `src/lib/server/core/useCases/platformOrganizationDetail.ts`
- New `src/lib/server/core/useCases/platformOrganizationDetail.test.ts`
- New `src/lib/server/adapters/supabasePlatformOrganizationDetail.ts`
- New `src/lib/server/adapters/supabasePlatformOrganizationDetail.test.ts`
- Optional `src/lib/server/adapters/inMemoryPlatformOrganizationDetail.ts`
- `src/routes/admin/organizations/[orgId]/+page.server.ts`
- `src/routes/admin/organizations/[orgId]/page.server.test.ts`
- `docs/architecture/DRIFT_LEDGER.md`
- `plans/README.md` status row only

**Out of scope**:

- Do not change the admin Organizations list or Subscriptions list. Those are owned by
  `PlatformOrganizationLedger`.
- Do not change organization-detail Svelte UI layout.
- Do not change gifting, membership, feature override, ownership transfer, or billing
  reconciliation actions except for imports made obsolete by the load refactor.
- Do not change billing redaction semantics by admin role.
- Do not add or change database migrations.
- Do not collapse detail, ledger, gifting, membership, and audit into a single broad platform-admin
  interface.

## Git workflow

- Branch: `codex/051-add-platform-organization-detail-seam`
- Commit style: short imperative subject. Suggested: `Add platform organization detail seam`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define a narrow PlatformOrganizationDetail contract

Create `src/lib/server/core/useCases/platformOrganizationDetail.ts`.

The module should own the detail-load payload for one Platform Administration Organization support
screen. Suggested public API:

```ts
export type PlatformOrganizationDetailResult =
	| { status: 'found'; detail: PlatformOrganizationDetailLoadData }
	| { status: 'not_found' }
	| { status: 'provider_error'; message: string };

export interface PlatformOrganizationDetail {
	getOrganizationDetail(orgId: string): Promise<PlatformOrganizationDetailResult>;
}
```

The `detail` shape should preserve the current route payload:

- `adminRole`,
- `org`,
- `billingSnapshot`,
- `planPolicy`,
- `planDiagnostics`,
- `cancellationSummary`,
- `members`,
- `personnelCount`,
- `auditEvents`.

Use dependency interfaces for the data the use case needs, rather than importing Supabase into the
core module. At minimum, the provider-specific store should expose:

- `getOrganizationById(orgId)`,
- `getBillingSnapshotByOrganization(orgId)`.

It is okay for the Supabase adapter to compose existing app-owned modules for gifting, membership,
metrics, audit, and plan diagnostics. Keep the route out of that wiring.

Behavior to preserve:

- invalid UUID is still rejected by the route before the use case is called,
- missing organization still becomes 404,
- missing billing snapshot still produces `billingSnapshot: null`,
- support-role billing redaction still uses `visibleBillingSnapshotForAdminRole`,
- gift-state read failure still logs and falls back to the loaded Organization gift columns,
- member emails still default to `'(unknown)'`,
- cancellation summary is still derived with `summarizeBillingCancellation`.

Behavior to improve:

- distinguish a missing Organization from a provider read failure when the adapter can tell the
  difference; return `provider_error` for true provider failures so the route can emit a sanitized
  500 instead of a misleading 404.

**Verify**:
`npx vitest run src/lib/server/core/useCases/platformOrganizationDetail.test.ts` fails before the
implementation and passes after it.

### Step 2: Move Organization and billing-snapshot row mapping into the Supabase adapter

Create `src/lib/server/adapters/supabasePlatformOrganizationDetail.ts`.

Move the route-local row type and mapper into this adapter:

- `AdminOrganizationBillingSnapshotRow`,
- `mapAdminOrganizationBillingSnapshot`.

The adapter should own:

- `adminClient.from('organizations')`,
- `adminClient.from('organization_billing_snapshots')`,
- Supabase result/error interpretation,
- composition of existing Supabase Platform Administration adapters.

Suggested factory:

```ts
export function createSupabasePlatformOrganizationDetail(ctx: AdminContext): PlatformOrganizationDetail {
	return createPlatformOrganizationDetail({
		store: createSupabasePlatformOrganizationDetailStore(ctx.adminClient),
		adminRole: ctx.adminUser.role,
		gifting: createSupabasePlatformGifting(ctx),
		membershipAdministration: createSupabasePlatformMembershipAdministration(ctx),
		metrics: createSupabasePlatformMetrics(ctx),
		audit: createSupabasePlatformAudit(ctx),
		planDiagnostics: createSupabasePlatformOrganizationPlanDiagnostics(ctx)
	});
}
```

The exact helper names are flexible. If adding a small private `readPlanDiagnostics` function is
simpler than a new exported adapter, that is fine as long as `createSupabaseDataStore(ctx.adminClient)`
and plan-policy provider wiring are not left in the route load.

**Verify**:
`npx vitest run src/lib/server/adapters/supabasePlatformOrganizationDetail.test.ts` exits 0.

### Step 3: Add focused use-case and adapter tests

Add use-case tests that prove:

- found Organization detail maps the current route payload shape,
- missing Organization returns `{ status: 'not_found' }`,
- true provider read failure returns `{ status: 'provider_error', ... }`,
- missing billing snapshot is not an error,
- billing snapshot visibility differs correctly by `support` versus `super_admin`,
- gift-state read failure falls back to Organization gift columns,
- membership rows map to `{ userId, email, role }` with `'(unknown)'` email fallback,
- plan diagnostics and cancellation summary are preserved.

Add Supabase adapter tests that prove:

- the Organization read uses the expected `organizations` columns,
- the billing snapshot read uses the expected `organization_billing_snapshots` columns,
- the billing snapshot mapper preserves cancellation and drift fields,
- provider errors are not silently converted into `null`.

Use existing test style from:

- `src/lib/server/core/useCases/platformOrganizationLedger.test.ts`,
- `src/lib/server/adapters/supabasePlatformOrganizationLedger.test.ts`,
- `src/routes/admin/organizations/[orgId]/page.server.test.ts`.

### Step 4: Thin the organization detail route load

Update `src/routes/admin/organizations/[orgId]/+page.server.ts` so the load function:

- validates the `orgId`,
- calls `createSupabasePlatformOrganizationDetail(ctx).getOrganizationDetail(orgId)`,
- maps `not_found` to `error(404, 'Organization not found')`,
- maps `provider_error` to a sanitized 500 such as `error(500, 'Failed to load organization detail')`,
- returns the `detail` payload on success.

Remove route-local imports that only supported the old detail load:

- `summarizeBillingCancellation`,
- `visibleBillingSnapshotForAdminRole`,
- `BillingSnapshot` type,
- `createSupabasePlatformMetrics`,
- `createSupabasePlatformAudit`,
- direct plan-policy/usage imports if they are no longer used by actions,
- direct billing snapshot row type and mapper.

Do not remove imports still needed by form actions.

**Verify**:
`rg -n "AdminOrganizationBillingSnapshotRow|mapAdminOrganizationBillingSnapshot|organization_billing_snapshots|\\.from\\('organizations'\\)" src/routes/admin/organizations/[orgId]/+page.server.ts`
returns no matches.

### Step 5: Update route tests around the new seam

Update `src/routes/admin/organizations/[orgId]/page.server.test.ts` so it mocks
`createSupabasePlatformOrganizationDetail`.

Replace `makeOrgDetailLoadClient()` with a stricter load client that throws on any direct provider
read. The route load test should assert:

- malformed UUID does not call the detail seam,
- found detail is returned unchanged,
- `not_found` maps to 404,
- `provider_error` maps to sanitized 500,
- route load does not touch `adminClient.from(...)`.

Keep existing action tests for gifting, membership, feature overrides, and billing reconciliation.
Those actions are outside this load-seam plan.

**Verify**:
`npx vitest run src/routes/admin/organizations/[orgId]/page.server.test.ts` exits 0.

### Step 6: Update drift documentation

Update `docs/architecture/DRIFT_LEDGER.md` under D-02 so the current-state truth says Platform
Administration organization detail base reads and billing snapshot reads now route through
`PlatformOrganizationDetail` and its Supabase adapter.

Do not mark D-02 resolved. This plan removes one cluster only.

**Verify**:
`npm run governance:check` exits 0.

### Step 7: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Use-case tests own detail shaping and failure semantics.
- Supabase adapter tests own table/row mapping.
- Route tests own UUID validation and result-to-SvelteKit error mapping.
- Existing action tests continue to guard organization-detail commands.
- Full repo gate.

## Done criteria

- [ ] `PlatformOrganizationDetail` exists as a narrow detail-page seam.
- [ ] Supabase Organization and billing snapshot reads for the detail page live in the adapter, not the route.
- [ ] The route load returns the same successful payload shape as before.
- [ ] Missing Organization maps to 404; provider read failure maps to sanitized 500.
- [ ] Billing visibility/redaction, gift fallback, plan diagnostics, cancellation summary, members, metrics, and audit activity are preserved.
- [ ] The provider-read grep in "Commands you will need" returns no matches.
- [ ] D-02 drift documentation mentions the retired organization-detail route reads without claiming all provider drift is gone.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 051 is updated.

## STOP conditions

Stop and report back if:

- The implementation starts changing organization-detail actions instead of only the load seam.
- Preserving the current payload requires merging this module into `PlatformOrganizationLedger`.
- Product wants billing snapshot read failures to render as a partial page rather than a sanitized
  load failure.
- A database migration appears necessary.

## Maintenance notes

Keep list and detail seams separate. `PlatformOrganizationLedger` answers bounded list questions;
`PlatformOrganizationDetail` answers one support-detail question. If future support detail sections
grow, add focused dependencies to this module instead of moving provider reads back into the route.
