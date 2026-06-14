# Plan 059: Expand governance for admin route seams

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- scripts/check-governance.mjs src/tests/check-governance.test.ts docs/architecture/GOVERNANCE_CHECKS.md docs/architecture/GOVERNANCE_BASELINE.json docs/architecture/DRIFT_LEDGER.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

`npm run governance:check` currently protects only one provider-boundary shape:
route-level `locals.supabase` usage. Service-role/admin-provider seams such as
`getAdminClient()`, `ctx.adminClient`, and route-local Supabase adapter creation
can still be added without showing up in the governance baseline. That makes the
guardrail weaker than the architecture docs imply and lets new privileged route
work bypass D-02 review.

## Current state

- `scripts/check-governance.mjs` only calls `hasRouteSupabaseUsage` while
  walking SvelteKit route files.
- `docs/architecture/GOVERNANCE_CHECKS.md` describes the current guardrail as
  route-level Supabase usage under an allowlist.
- `docs/architecture/GOVERNANCE_BASELINE.json` has `routeSupabaseAllowlist`,
  but no separate service-role/admin-provider route allowlist.
- `src/tests/check-governance.test.ts` already imports the governance module and
  tests the detector directly.
- Current route examples that should be classified, not silently ignored:
  `src/routes/api/feedback/+server.ts`,
  `src/routes/org/[orgId]/billing/success/+page.server.ts`,
  `src/routes/org/[orgId]/billing/cancel/+server.ts`,
  `src/routes/org/[orgId]/settings/logs/+page.server.ts`,
  `src/routes/api/cleanup-expired-onboardings/+server.ts`,
  and other current `getAdminClient()` or `ctx.adminClient` route uses.

Current excerpts:

```js
// scripts/check-governance.mjs:171
function hasRouteSupabaseUsage(content) {
	if (content.includes('locals.supabase')) return true;
```

```js
// scripts/check-governance.mjs:185
function checkRouteSupabaseAllowlist() {
	const routeFiles = walkRelative('src/routes').filter(
```

```md
<!-- docs/architecture/GOVERNANCE_CHECKS.md:9 -->
- route-level Supabase usage under `src/routes/` stays inside an explicit allowlist, including
  direct `locals.supabase` access and Supabase clients destructured or aliased from `locals`
```

```ts
// src/routes/api/feedback/+server.ts:217
const adminClient = getAdminClient();

// src/routes/org/[orgId]/billing/success/+page.server.ts:174
const adminClient = getAdminClient();

// src/routes/admin/billing-events/+page.server.ts:61
ctx.adminClient as SupabaseClient
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Targeted governance tests | `npx vitest run src/tests/check-governance.test.ts` | exits 0 |
| Governance check | `npm run governance:check` | exits 0 |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `scripts/check-governance.mjs`
- `src/tests/check-governance.test.ts`
- `docs/architecture/GOVERNANCE_CHECKS.md`
- `docs/architecture/GOVERNANCE_BASELINE.json`
- `docs/architecture/DRIFT_LEDGER.md`, only if a new drift-ledger id is needed
- `plans/README.md` status row only

**Out of scope**:

- Do not move any route code behind use cases in this plan.
- Do not mark D-02 resolved.
- Do not remove existing allowlist entries unless the scanner proves they are
  stale.
- Do not add migrations or touch local or remote databases.

## Git workflow

- Branch: `codex/059-expand-governance-for-admin-route-seams`
- Commit style: short imperative subject. Suggested: `Expand admin route governance checks`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an admin-provider route detector

Extend `scripts/check-governance.mjs` with a separate exported detector, for
example `hasRouteAdminProviderUsage(content)`. It should detect service-role or
admin-provider wiring in route files, including these current shapes:

- `getAdminClient()`,
- `ctx.adminClient`,
- `createSupabaseDataStore(getAdminClient())`,
- `createSupabase...(...getAdminClient()...)`,
- casts such as `ctx.adminClient as SupabaseClient`.

Keep this separate from `hasRouteSupabaseUsage` so the existing
`locals.supabase` allowlist stays readable.

**Verify**:
`npx vitest run src/tests/check-governance.test.ts` should fail until Step 2
adds tests and the detector works, then pass.

### Step 2: Cover the new detector with unit tests

In `src/tests/check-governance.test.ts`, import the new detector and add tests
for:

- `const admin = getAdminClient(); await admin.from('organizations')...`,
- `createSupabaseDataStore(getAdminClient())`,
- `ctx.adminClient as SupabaseClient`,
- a route that only parses request data and calls a use case, which should not
  be flagged.

Keep the existing `hasRouteSupabaseUsage` tests unchanged.

**Verify**:
`npx vitest run src/tests/check-governance.test.ts` exits 0.

### Step 3: Add a dedicated baseline section

Add a new `routeAdminProviderAllowlist` array to
`docs/architecture/GOVERNANCE_BASELINE.json`. Populate it with every current
route file the new detector reports. Each entry needs:

- `path`,
- `classification` such as `cron-edge`, `auth-edge`, `platform-admin-edge`, or
  `billing-recovery-edge`,
- `reason`,
- `driftIds` if the existing checker requires them for allowlist entries.

Known current examples include, but are not limited to:

- `src/routes/api/feedback/+server.ts`,
- `src/routes/api/cleanup-archived-records/+server.ts`,
- `src/routes/api/cleanup-expired-onboardings/+server.ts`,
- `src/routes/auth/setup-account/+page.server.ts`,
- `src/routes/auth/renew-invite/+page.server.ts`,
- `src/routes/api/access-requests/+server.ts`,
- `src/routes/org/[orgId]/billing/success/+page.server.ts`,
- `src/routes/org/[orgId]/billing/cancel/+server.ts`,
- `src/routes/org/[orgId]/settings/logs/+page.server.ts`,
- current platform-admin routes that still create Supabase adapters from
  `ctx.adminClient`.

Do not guess. Run the checker or an equivalent `rg` search and make the baseline
match the live code.

**Verify**:
`npm run governance:check` exits 0.

### Step 4: Wire the checker and docs

Add a `checkRouteAdminProviderAllowlist()` function beside
`checkRouteSupabaseAllowlist()` and call it from the main check sequence.
Document the new check in `docs/architecture/GOVERNANCE_CHECKS.md` as a narrow
guardrail: it records privileged route/provider seams; it does not prove the
route is architecturally clean.

If the baseline entries need a new drift-ledger id, add one concise entry to
D-02 in `docs/architecture/DRIFT_LEDGER.md`.

**Verify**:
`npm run governance:check` exits 0 and reports no undocumented admin-provider
route usage.

### Step 5: Run the full gate

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

- Extend `src/tests/check-governance.test.ts` for the new detector.
- Run `npm run governance:check` to prove the live baseline is consistent.
- Run the full repo gate.

## Done criteria

- [ ] New admin-provider route detector exists and is tested.
- [ ] `npm run governance:check` fails for an unallowlisted route using
      `getAdminClient()` or `ctx.adminClient`.
- [ ] Existing current admin-provider route seams are explicitly classified in
      `docs/architecture/GOVERNANCE_BASELINE.json`.
- [ ] Governance docs describe both the `locals.supabase` and admin-provider
      allowlists.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 059 is updated.

## STOP conditions

Stop and report back if:

- The new detector would require parsing TypeScript ASTs to avoid high false
  positives.
- More than 25 route files need allowlist entries; that is a broader governance
  design problem.
- The checker starts flagging non-route adapter or use-case files.
- Any change would require touching production or local database state.

## Maintenance notes

This plan intentionally creates a visible baseline of existing privileged route
seams. Follow-up implementation plans should remove entries as they move route
logic behind app-owned use cases or adapters.

