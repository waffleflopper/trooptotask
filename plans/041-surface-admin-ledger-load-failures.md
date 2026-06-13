# Plan 041: Surface admin ledger load failures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- src/routes/admin/subscriptions src/routes/admin/organizations docs/architecture/adrs/0011-platform-administration-boundary.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0a6e6000`, 2026-06-13

## Why this matters

The platform admin Organizations and Subscriptions pages currently turn primary organization query
failures into empty arrays. That makes database, permission, or provider failures look like "zero
organizations" or "no subscriptions found." These pages are support-facing operational tools; when
the primary ledger cannot load, the UI should fail visibly instead of presenting misleading metrics.

## Current state

- `src/routes/admin/subscriptions/+page.server.ts:107-139` loads all organizations, logs
  `orgsError`, then continues:

```ts
if (orgsError) {
	console.error('Admin subscriptions query failed:', orgsError);
}

const orgIds = (orgs ?? []).map((org) => org.id);
```

- `src/routes/admin/subscriptions/+page.svelte:94-110` renders metrics from
  `data.subscriptions.length`, and `src/routes/admin/subscriptions/+page.svelte:307-310` renders
  "No subscriptions found." for an empty array.
- `src/routes/admin/organizations/+page.server.ts:12-42` has the same pattern for Organizations:

```ts
if (orgsError) {
	console.error('Admin orgs query failed:', orgsError);
}

const orgIds = (orgs ?? []).map((org) => org.id);
```

- `src/routes/admin/subscriptions/page.server.test.ts` only covers the billing visibility helper.
  There is currently no `src/routes/admin/organizations/page.server.test.ts`.
- ADR 0011 says Platform Administration operational failures should surface instead of turning into
  empty dashboard cards or silent success.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install, if needed | `npm ci` | exit 0 |
| Focused subscriptions tests | `npx vitest run src/routes/admin/subscriptions/page.server.test.ts src/routes/admin/subscriptions/page.svelte.test.ts` | all pass |
| Focused organizations tests | `npx vitest run src/routes/admin/organizations` | all pass |
| Format | `npm run format` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Governance | `npm run governance:check` | exit 0 |
| Typecheck | `npm run check` | exit 0 |
| Full tests | `npm run test` | exit 0 |

## Scope

**In scope**:

- `src/routes/admin/subscriptions/+page.server.ts`
- `src/routes/admin/subscriptions/page.server.test.ts`
- `src/routes/admin/organizations/+page.server.ts`
- `src/routes/admin/organizations/page.server.test.ts` (create if absent)
- `plans/README.md` status row only

**Out of scope**:

- Do not redesign pagination or query shape in this plan. That is plan 042.
- Do not change partial diagnostics behavior for billing snapshots or plan diagnostics. Those
  should remain warning flags because the primary organization ledger still loaded.
- Do not expose raw database error details in user-visible text.
- Do not change admin role access.

## Git workflow

- Branch: `codex/041-surface-admin-ledger-load-failures`
- Commit style: short imperative subject. Suggested: `Surface admin ledger load failures`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add route-load failure tests first

For subscriptions, extend `src/routes/admin/subscriptions/page.server.test.ts` by mocking:

- `loadWithAdminContext` so the test can pass `__ctx`, following
  `src/routes/admin/access-requests/page.server.test.ts`,
- `selectAllSupabaseRows` so the first organizations query can return
  `{ data: null, error: { message: 'database offline' } }`.

Assert:

- `load(...)` rejects or throws a SvelteKit error instead of returning `{ subscriptions: [] }`,
- the failure is sanitized, not a raw database object,
- billing and plan diagnostic failures remain separate warnings when the org query succeeds.

Create `src/routes/admin/organizations/page.server.test.ts` with the same pattern. Assert primary
organization query failure does not return `{ organizations: [] }`.

**Verify**:
`npx vitest run src/routes/admin/subscriptions/page.server.test.ts src/routes/admin/organizations/page.server.test.ts`
fails before the implementation and passes after it.

### Step 2: Fail visibly on primary org query errors

In both route load files, import SvelteKit `error` and replace the current log-and-continue behavior
for the primary organization query with a sanitized server error:

```ts
if (orgsError) {
	console.error('Admin subscriptions query failed:', orgsError);
	error(500, 'Unable to load platform subscriptions.');
}
```

Use an Organizations-specific message in the organizations route. Keep the existing logging so
operators can diagnose the provider failure, but do not include raw error details in the
user-visible message.

Do not change these existing partial diagnostic paths in subscriptions:

- `billingDiagnosticsError`,
- `planDiagnosticsError`.

**Verify**:
`npx vitest run src/routes/admin/subscriptions/page.server.test.ts src/routes/admin/organizations/page.server.test.ts`
exits 0.

### Step 3: Confirm UI tests still match the partial-failure contract

Run the existing Svelte tests:

```bash
npx vitest run src/routes/admin/subscriptions/page.svelte.test.ts
```

Expected result: existing billing/plan diagnostic warnings still render when those flags are true.
No new empty-state assertion should treat a primary load failure as an empty list.

### Step 4: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Add route-load tests for primary organization query failures in both admin pages.
- Preserve existing subscriptions component tests for partial diagnostics.
- Full repo gate.

## Done criteria

- [ ] Subscriptions primary organization query failure no longer returns an empty subscriptions list.
- [ ] Organizations primary query failure no longer returns an empty organizations list.
- [ ] User-visible errors are sanitized.
- [ ] Billing snapshot and plan diagnostics still surface as warning flags when the primary ledger loads.
- [ ] Focused route tests cover both failure paths.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 041 is updated.

## STOP conditions

Stop and report back if:

- The route loaders have already been moved behind a Platform Administration module.
- Product explicitly wants a partial page with a custom inline error instead of a SvelteKit load
  failure. In that case, ask for the desired UX before implementing.
- Tests require exposing raw provider error messages to the browser.

## Maintenance notes

When a platform-admin page depends on a primary ledger, fail the load if that ledger cannot be
read. Warning flags are appropriate only for secondary diagnostics that can be missing while the
main operational list remains truthful.
