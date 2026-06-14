# Plan 061: Share retention cleanup support

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/lib/server/core/useCases/archiveRetention.ts src/lib/server/core/useCases/archiveRetention.test.ts src/lib/server/core/useCases/onboardingRetention.ts src/lib/server/core/useCases/onboardingRetention.test.ts src/routes/api/cleanup-archived-records/+server.ts src/routes/api/cleanup-archived-records/server.test.ts src/routes/api/cleanup-expired-onboardings/+server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

Archive retention and onboarding retention both implement UTC month cutoff math
and admin notification fanout. Their cron routes also duplicate organization
retention-config loading, but only archive retention has an injectable endpoint
core test. Shared retention support reduces policy drift and gives both cron
endpoints the same authorization/config test seam.

## Current state

- `archiveRetention.ts` has `notifyAdminsViaStore` and `retentionCutoff`.
- `onboardingRetention.ts` has another `notifyAdminsViaStore` and another
  `retentionCutoff`.
- `cleanup-archived-records/+server.ts` exposes
  `_runArchiveRetentionCleanupEndpointCore`.
- `cleanup-expired-onboardings/+server.ts` performs authorization, org config
  loading, store construction, and cleanup inline.
- Archive and onboarding retention tests already cover month-end clamping and
  admin notifications separately.

Current excerpts:

```ts
// src/lib/server/core/useCases/archiveRetention.ts:124
async function notifyAdminsViaStore(
	store: DataStore,
	orgId: string,
```

```ts
// src/lib/server/core/useCases/archiveRetention.ts:154
function retentionCutoff(now: Date, retentionMonths: number): string {
```

```ts
// src/lib/server/core/useCases/onboardingRetention.ts:47
function retentionCutoff(now: Date, retentionMonths: number): string {
```

```ts
// src/lib/server/core/useCases/onboardingRetention.ts:77
async function notifyAdminsViaStore(
	store: DataStore,
	orgId: string,
```

```ts
// src/routes/api/cleanup-expired-onboardings/+server.ts:9
export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Retention tests | `npx vitest run src/lib/server/core/useCases/archiveRetention.test.ts src/lib/server/core/useCases/onboardingRetention.test.ts` | exits 0 |
| Endpoint tests | `npx vitest run src/routes/api/cleanup-archived-records/server.test.ts src/routes/api/cleanup-expired-onboardings/server.test.ts` | exits 0 |
| Duplication grep | `rg -n "function retentionCutoff\|function notifyAdminsViaStore" src/lib/server/core/useCases` | shared helper only |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/lib/server/core/useCases/archiveRetention.ts`
- `src/lib/server/core/useCases/archiveRetention.test.ts`
- `src/lib/server/core/useCases/onboardingRetention.ts`
- `src/lib/server/core/useCases/onboardingRetention.test.ts`
- New shared helper under `src/lib/server/core/useCases/`, for example
  `retentionSupport.ts`
- `src/routes/api/cleanup-archived-records/+server.ts`
- `src/routes/api/cleanup-archived-records/server.test.ts`
- `src/routes/api/cleanup-expired-onboardings/+server.ts`
- New `src/routes/api/cleanup-expired-onboardings/server.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not change retention defaults or cleanup semantics.
- Do not change notification titles/types/messages except where tests require
  preserving the exact current output.
- Do not add or run migrations.
- Do not reset, delete from, or otherwise mutate local or remote databases.
- Do not merge archive and onboarding cleanup into one cron endpoint.

## Git workflow

- Branch: `codex/061-share-retention-cleanup-support`
- Commit style: short imperative subject. Suggested: `Share retention cleanup support`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract cutoff and notification helpers

Create a shared helper module under `src/lib/server/core/useCases/`, for
example `retentionSupport.ts`, that exports:

- `retentionCutoff(now: Date, retentionMonths: number): string`,
- `notifyAdminsViaStore(store, orgId, excludeUserId, notification)`.

Move the existing implementation from archive/onboarding retention without
changing behavior. Keep the month-end UTC clamp exactly as tested.

Update both retention use cases to import these helpers and remove their local
duplicates.

**Verify**:
`npx vitest run src/lib/server/core/useCases/archiveRetention.test.ts src/lib/server/core/useCases/onboardingRetention.test.ts`
exits 0.

### Step 2: Normalize org retention config loading

Add a small shared endpoint helper only if it stays simple, for example:

```ts
export function mapArchiveRetentionOrgConfigs(orgs: Array<{ id: string; archive_retention_months: number | null }>) {
	return orgs.map((org) => ({ id: org.id, retentionMonths: org.archive_retention_months }));
}
```

Use it from both cleanup routes so defaulting stays in the use cases, not in
one route but not the other. Do not introduce a broad cron framework.

**Verify**:
`npx vitest run src/lib/server/core/useCases/archiveRetention.test.ts src/lib/server/core/useCases/onboardingRetention.test.ts`
exits 0.

### Step 3: Add an onboarding cleanup endpoint core

Refactor `src/routes/api/cleanup-expired-onboardings/+server.ts` to expose an
injectable `_runOnboardingRetentionCleanupEndpointCore` mirroring
`_runArchiveRetentionCleanupEndpointCore`.

The core should accept:

- `request`,
- `env` with `CLEANUP_SECRET` and `CRON_SECRET`,
- `orgConfigs`,
- `runCleanup`.

It should authorize first, then call `runCleanup(orgConfigs)`, then return JSON.
The route `GET` can still construct the admin client and load organizations.

**Verify**:
Create `src/routes/api/cleanup-expired-onboardings/server.test.ts` by modeling
`cleanup-archived-records/server.test.ts`, then run:
`npx vitest run src/routes/api/cleanup-archived-records/server.test.ts src/routes/api/cleanup-expired-onboardings/server.test.ts`.

### Step 4: Preserve current retention behavior

Make sure tests still prove:

- archive retention clamps month-end cutoffs,
- onboarding retention clamps month-end cutoffs,
- per-organization retention settings are respected,
- admin notification fanout still excludes the triggering user when supplied,
- empty org config arrays return zero counts.

Add a direct helper test only if existing use-case tests no longer clearly
cover the shared helper.

**Verify**:
`npx vitest run src/lib/server/core/useCases/archiveRetention.test.ts src/lib/server/core/useCases/onboardingRetention.test.ts`
exits 0.

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

- Existing archive and onboarding retention tests remain green.
- New onboarding cleanup endpoint-core tests match the archive endpoint-core
  authorization and env behavior.
- Full repo gate.

## Done criteria

- [ ] There is one shared implementation of retention cutoff math.
- [ ] There is one shared implementation of admin notification fanout.
- [ ] Onboarding cleanup has an injectable endpoint core with tests.
- [ ] Cleanup behavior and response shapes are unchanged.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 061 is updated.

## STOP conditions

Stop and report back if:

- The two retention paths intentionally need different cutoff math.
- Shared helpers require a broad DataStore abstraction change.
- Adding endpoint tests requires hitting a real Supabase instance.
- Any step appears to require migration, local DB reset, or production DB access.

## Maintenance notes

Future retention families should reuse the shared cutoff and notification
helpers. If cleanup endpoints grow more shared cron behavior, plan that as a
separate cron-edge abstraction.
