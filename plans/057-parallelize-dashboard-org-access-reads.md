# Plan 057: Parallelize Dashboard organization access reads

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/lib/server/core/useCases/dashboardOrgAccess.ts src/lib/server/core/useCases/dashboardOrgAccess.test.ts src/lib/server/adapters/supabaseDashboardOrgAccess.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

The dashboard organization-access loader waits for organization memberships before starting the
pending-invitation lookup. Those reads use independent Supabase queries. Running them in parallel
removes avoidable login and org-switching latency without changing redirect behavior.

## Current state

- `loadDashboardOrgAccess` awaits organizations first, then invitations.
- The Supabase adapter implements the two reads as independent paginated queries.
- Existing tests assert redirect behavior and email normalization, but not read concurrency.

Current excerpts:

```ts
// src/lib/server/core/useCases/dashboardOrgAccess.ts:106
export async function loadDashboardOrgAccess(
	port: DashboardOrgAccessPort,
	input: DashboardOrgAccessInput
): Promise<DashboardOrgAccessResult> {
	const organizations = await port.listOrganizationsForUser(input.userId);
	const pendingInvitations = await port.listPendingInvitationsForEmail(normalizeEmail(input.email));
```

```ts
// src/lib/server/adapters/supabaseDashboardOrgAccess.ts:45
async listOrganizationsForUser(userId: string): Promise<DashboardOrganizationSummary[]> {
	const { data, error } = await selectAllSupabaseRows<OrganizationMembershipRow>(
```

```ts
// src/lib/server/adapters/supabaseDashboardOrgAccess.ts:75
async listPendingInvitationsForEmail(email: string): Promise<DashboardPendingInvitationSummary[]> {
	const { data, error } = await selectAllSupabaseRows<OrganizationInvitationSummaryRow>(
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Targeted test | `npx vitest run src/lib/server/core/useCases/dashboardOrgAccess.test.ts` | exits 0 |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/lib/server/core/useCases/dashboardOrgAccess.ts`
- `src/lib/server/core/useCases/dashboardOrgAccess.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not change the Supabase adapter query shapes.
- Do not change dashboard redirect rules.
- Do not change invitation accept/decline behavior.
- Do not add caching or pagination.

## Git workflow

- Branch: `codex/057-parallelize-dashboard-org-access-reads`
- Commit style: short imperative subject. Suggested: `Parallelize dashboard org access reads`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a concurrency characterization test

In `src/lib/server/core/useCases/dashboardOrgAccess.test.ts`, add a test that proves both read
promises are started before either one resolves.

One simple pattern:

- create a custom `DashboardOrgAccessPort`,
- in `listOrganizationsForUser`, push `organizations:start`, return a promise controlled by the
  test,
- in `listPendingInvitationsForEmail`, push `invitations:start`, return another controlled
  promise,
- call `loadDashboardOrgAccess` without awaiting it,
- wait one microtask,
- assert both `*:start` entries are present before resolving either promise.

Keep the existing redirect behavior tests unchanged.

**Verify**:

```bash
npx vitest run src/lib/server/core/useCases/dashboardOrgAccess.test.ts
```

fails before Step 2 and passes after Step 2.

### Step 2: Start both reads with Promise.all

Change `loadDashboardOrgAccess` to normalize the email once and start both reads together:

```ts
const normalizedEmail = normalizeEmail(input.email);
const [organizations, pendingInvitations] = await Promise.all([
	port.listOrganizationsForUser(input.userId),
	port.listPendingInvitationsForEmail(normalizedEmail)
]);
```

Preserve every existing redirect branch and return shape.

**Verify**:

```bash
npx vitest run src/lib/server/core/useCases/dashboardOrgAccess.test.ts
```

exits 0.

### Step 3: Run the full gate

Run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- New concurrency characterization test.
- Existing dashboard org access redirect tests remain unchanged and passing.

## Done criteria

- [ ] `loadDashboardOrgAccess` starts organization and invitation reads before awaiting either.
- [ ] Existing redirect behavior is unchanged.
- [ ] Targeted test and full repo gate pass.
- [ ] `plans/README.md` status row for 057 is updated.

## STOP conditions

Stop and report back if:

- A newly discovered port implementation requires invitation lookup to run after organization
  lookup.
- Parallelizing changes redirect behavior or error handling in a way the existing tests did not
  cover.
- The change requires editing adapter query semantics.

## Maintenance notes

Keep this as a use-case-level optimization. If dashboard access later needs caching or bounded
pagination, plan that separately so redirect semantics stay easy to review.
