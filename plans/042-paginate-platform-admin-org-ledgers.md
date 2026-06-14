# Plan 042: Paginate platform admin organization ledgers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- src/routes/admin/subscriptions src/routes/admin/organizations src/lib/server/adapters/supabasePlatformMetrics.ts src/lib/server/core/useCases/platformMetrics.ts docs/architecture/adrs/0011-platform-administration-boundary.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/041-surface-admin-ledger-load-failures.md
- **Category**: perf
- **Planned at**: commit `0a6e6000`, 2026-06-13

## Why this matters

The platform admin Organizations and Subscriptions pages load and enrich every organization before
the browser paginates or filters. Subscriptions then runs plan policy and usage diagnostics for
every organization with concurrency 8. That makes a single admin page load O(total organizations)
and pushes provider load into navigation. After this plan, both pages should fetch a bounded
server-side page, enrich only visible organization ids, and keep route files as thin shells around
a narrow Platform Administration module.

## Current state

- `src/routes/admin/subscriptions/+page.server.ts:107-135` calls `selectAllSupabaseRows` over
  `organizations`.
- `src/routes/admin/subscriptions/+page.server.ts:141-159` builds `orgIds` from the full list and
  fetches personnel counts, owner memberships, and billing snapshots for all of them.
- `src/routes/admin/subscriptions/+page.server.ts:173-191` runs plan diagnostics for every org id.
- `src/routes/admin/subscriptions/+page.svelte` performs client-side filtering and pagination after
  the server has already loaded everything.
- `src/routes/admin/organizations/+page.server.ts:12-45` has the same all-organization load shape.
- ADR 0011 says provider-specific Platform Administration reads belong behind app-owned modules and
  admin routes should not grow route-local Supabase queries for platform business behavior.

## Commands you will need

| Purpose                    | Command                                                                                                                | Expected on success |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Install, if needed         | `npm ci`                                                                                                               | exit 0              |
| Focused server tests       | `npx vitest run src/routes/admin/subscriptions/page.server.test.ts src/routes/admin/organizations/page.server.test.ts` | all pass            |
| Focused component tests    | `npx vitest run src/routes/admin/subscriptions/page.svelte.test.ts src/routes/admin/organizations`                     | all pass            |
| New use-case/adapter tests | `npx vitest run src/lib/server/core/useCases src/lib/server/adapters`                                                  | all pass            |
| Format                     | `npm run format`                                                                                                       | exit 0              |
| Lint                       | `npm run lint`                                                                                                         | exit 0              |
| Governance                 | `npm run governance:check`                                                                                             | exit 0              |
| Typecheck                  | `npm run check`                                                                                                        | exit 0              |
| Full tests                 | `npm run test`                                                                                                         | exit 0              |

## Scope

**In scope**:

- New narrow Platform Administration organization/subscription listing use case files under
  `src/lib/server/core/useCases/`
- New Supabase adapter files under `src/lib/server/adapters/`
- Optional in-memory adapter test helper if the use case needs one
- `src/routes/admin/subscriptions/+page.server.ts`
- `src/routes/admin/subscriptions/+page.svelte`
- `src/routes/admin/subscriptions/page.server.test.ts`
- `src/routes/admin/subscriptions/page.svelte.test.ts`
- `src/routes/admin/organizations/+page.server.ts`
- `src/routes/admin/organizations/+page.svelte`
- `src/routes/admin/organizations/page.server.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not change billing redaction by admin role.
- Do not change plan entitlement calculations.
- Do not change organization suspension/gifting commands.
- Do not add automatic CI triggers.
- Do not do unrelated Platform Administration refactors.

## Git workflow

- Branch: `codex/042-paginate-platform-admin-org-ledgers`
- Commit style: short imperative subject. Suggested: `Paginate platform admin organization ledgers`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define the bounded read model

Create a narrow Platform Administration module for organization ledger reads. Use names that match
ADR 0011 language, for example:

```text
src/lib/server/core/useCases/platformOrganizationLedger.ts
src/lib/server/adapters/supabasePlatformOrganizationLedger.ts
```

The module should expose read methods for:

- paged Organizations list rows,
- paged Subscriptions ledger rows,
- total count for the current server-side query,
- page metadata: `page`, `pageSize`, `totalCount`, `totalPages`.

Keep page size bounded. Suggested defaults:

- default page size: 25,
- maximum page size: 100,
- invalid page numbers clamp to page 1.

Support server-side search by organization name if the current UI search box is retained. Do not
promise client-side searching across unloaded pages.

**Verify**: Add focused tests for page clamping, max page size, and query input normalization.

### Step 2: Implement Supabase page queries

In the Supabase adapter, replace full-table `selectAllSupabaseRows` with a bounded query:

```ts
adminClient
	.from('organizations')
	.select('id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at', { count: 'exact' })
	.order('created_at', { ascending: false })
	.range(from, to);
```

Apply `ilike('name', ...)` only when a non-empty search query exists.

For Subscriptions, enrich only the organization ids returned on the current page:

- personnel counts,
- owner memberships,
- billing snapshots,
- plan diagnostics.

Do not run `readEffectivePlanPolicy` or `readOrganizationPlanUsage` for organizations outside the
current page.

**Verify**: Adapter tests assert `.range(from, to)` is called and diagnostics are requested only
for page ids.

### Step 3: Thin the route loaders

Update `src/routes/admin/organizations/+page.server.ts` and
`src/routes/admin/subscriptions/+page.server.ts` so they:

- parse `page`, `pageSize`, and optional `q` from `event.url.searchParams`,
- call the new Platform Administration module,
- return the bounded list plus page metadata,
- preserve the plan 041 behavior of surfacing primary query failures.

Remove route-local `selectAllSupabaseRows` organization scans from these two routes.

**Verify**:
`rg -n "selectAllSupabaseRows|mapWithConcurrency" src/routes/admin/subscriptions/+page.server.ts src/routes/admin/organizations/+page.server.ts`
returns no matches for these routes.

### Step 4: Update the admin pages for server-side pagination

Update the Svelte pages so:

- pagination links include `page`, `pageSize`, and `q`,
- the search input submits/navigates to server-side query params,
- metrics distinguish total matching organizations from current page rows,
- empty states say no matching organizations/subscriptions only when the bounded query succeeds.

Keep UI density restrained and consistent with the existing admin pages. Do not add marketing-style
sections.

When editing Svelte, follow the Svelte MCP documentation flow and run `svelte-autofixer` until it
reports no issues or suggestions.

**Verify**:
`npx vitest run src/routes/admin/subscriptions/page.svelte.test.ts src/routes/admin/organizations`
exits 0.

### Step 5: Add regression tests for bounded behavior

Tests should prove:

- Organizations route passes page/search params into the module.
- Subscriptions route enriches only returned page ids.
- A page with 2 visible organizations does not run diagnostics for 100 seeded/mocked organizations.
- Existing billing visibility redaction remains intact.
- Primary load failures still surface per plan 041.

Use the route-shell mocking style in `src/routes/admin/access-requests/page.server.test.ts`.

### Step 6: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- New use-case tests for pagination input normalization and page metadata.
- Supabase adapter tests for bounded `.range(...)` and page-id-only enrichment.
- Route tests for Organizations and Subscriptions wiring.
- Svelte component tests for search/pagination and empty states.
- Full repo gate.

## Done criteria

- [ ] Admin Organizations no longer loads every organization before pagination.
- [ ] Admin Subscriptions no longer loads every organization before pagination.
- [ ] Subscriptions plan diagnostics run only for visible page organization ids.
- [ ] Route files no longer own provider-specific full-table organization scans.
- [ ] Server-side page/search metadata is returned and rendered.
- [ ] Billing visibility/redaction behavior is unchanged.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 042 is updated.

## STOP conditions

Stop and report back if:

- Product requires client-side search across all organizations with no server roundtrip.
- The new module would need to change billing snapshot semantics or expose redacted fields.
- The implementation requires a database migration. This plan should be query/application only.
- Svelte MCP/autofixer reports issues that cannot be resolved without redesigning the page.

## Maintenance notes

Keep future Platform Administration list pages bounded by default. If a support workflow truly
needs an all-organization export, build it as an explicit export/report path rather than as the
normal navigation query.
