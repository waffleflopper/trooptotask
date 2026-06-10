# Plan 002: Reject unset cleanup bearer secrets

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise.
>
> **Drift check (run first)**: `git diff --stat 679b6113..HEAD -- src/routes/api/cleanup-old-data/+server.ts src/routes/api/cleanup-expired-onboardings/+server.ts src/routes/api/cleanup-account-setup-links/+server.ts src/routes/api/billing-reconciliation/+server.ts src/lib/server`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `679b6113`, 2026-06-10

## Why This Matters

Three cleanup endpoints compare the request header to template strings built from possibly undefined environment variables. If both `CLEANUP_SECRET` and `CRON_SECRET` are unset, `Authorization: Bearer undefined` passes. These routes use a service-role client and trigger cleanup work, so the endpoints must reject unset or blank secrets before comparing bearer tokens.

## Current State

- `src/routes/api/cleanup-old-data/+server.ts` calls `cleanup_old_audit_logs` and `cleanup_old_webhook_events`.
- `src/routes/api/cleanup-expired-onboardings/+server.ts` loads all organizations and deletes expired onboarding records.
- `src/routes/api/cleanup-account-setup-links/+server.ts` cleans stale account setup links.
- `src/routes/api/billing-reconciliation/+server.ts` already shows the safer local pattern: filter blank secrets before comparison and use timing-safe comparison.

Current unsafe pattern:

```ts
// src/routes/api/cleanup-old-data/+server.ts:7
const authHeader = request.headers.get('authorization');
const cleanupSecret = env.CLEANUP_SECRET;
const cronSecret = env.CRON_SECRET;

const isAuthorized = authHeader === `Bearer ${cleanupSecret}` || authHeader === `Bearer ${cronSecret}`;
```

Safer exemplar:

```ts
// src/routes/api/billing-reconciliation/+server.ts:18
function isAuthorized(authHeader: string | null, secrets: Array<string | undefined>): boolean {
	if (!authHeader) return false;
	const configuredSecrets = secrets.filter((secret): secret is string => Boolean(secret?.trim()));
	return configuredSecrets.some((secret) => timingSafeStringEqual(authHeader, `Bearer ${secret}`));
}
```

## Commands You Will Need

| Purpose                 | Command                                                                                                                                                                                   | Expected on success   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Targeted tests          | `npm run test -- src/lib/server/cronEndpointAuth.test.ts`                                                                                                                                 | new helper tests pass |
| Static regression check | `rg -n "Bearer \\$\\{.*Secret\\}" src/routes/api/cleanup-old-data/+server.ts src/routes/api/cleanup-expired-onboardings/+server.ts src/routes/api/cleanup-account-setup-links/+server.ts` | no matches            |
| Format                  | `npm run format`                                                                                                                                                                          | exits 0               |
| Lint                    | `npm run lint`                                                                                                                                                                            | exits 0               |
| Governance              | `npm run governance:check`                                                                                                                                                                | exits 0               |
| Typecheck               | `npm run check`                                                                                                                                                                           | exits 0               |
| Unit tests              | `npm run test`                                                                                                                                                                            | exits 0               |

## Scope

**In scope**:

- `src/lib/server/cronEndpointAuth.ts` (create)
- `src/lib/server/cronEndpointAuth.test.ts` (create)
- `src/routes/api/cleanup-old-data/+server.ts`
- `src/routes/api/cleanup-expired-onboardings/+server.ts`
- `src/routes/api/cleanup-account-setup-links/+server.ts`

**Out of scope**:

- Retention behavior, cleanup query semantics, or response shapes.
- `src/routes/api/billing-reconciliation/+server.ts`, except as an exemplar.
- The already safer `cleanup-archived-records` endpoint unless a reviewer explicitly expands scope.
- Database RPC grants. Plan 001 handles that layer.

## Git Workflow

- Branch: `codex/002-reject-unset-cleanup-bearer-secrets`
- Commit message style: short imperative, for example `Reject unset cleanup bearer secrets`
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Add a shared cleanup endpoint auth helper

Create `src/lib/server/cronEndpointAuth.ts`.

Target behavior:

- Accept `authHeader: string | null` and `secrets: Array<string | undefined>`.
- Trim/filter secrets so undefined, empty, and whitespace-only values are never accepted.
- If no configured secret remains, throw SvelteKit `error(500, 'Cleanup secret is not configured')` or a similarly clear non-secret message.
- If the auth header is missing or does not match a configured bearer token, throw `error(401, 'Unauthorized')`.
- Compare strings using `timingSafeEqual` with padded buffers, following the billing reconciliation pattern.
- Never log or return secret values.

**Verify**: `npm run test -- src/lib/server/cronEndpointAuth.test.ts` should fail before tests exist, then pass after Step 2.

### Step 2: Test the helper

Create `src/lib/server/cronEndpointAuth.test.ts`.

Cover:

- Rejects `null` header when a secret exists.
- Rejects a wrong bearer token when a secret exists.
- Accepts either cleanup-specific or shared cron secret.
- Rejects `Bearer undefined` when secrets are `[undefined, undefined]`.
- Rejects `Bearer ` when secrets are blank strings.
- Does not call any cleanup work in tests; this is a pure helper test.

Use Vitest and assert SvelteKit thrown errors by matching `{ status: 401 }` or `{ status: 500 }`.

**Verify**: `npm run test -- src/lib/server/cronEndpointAuth.test.ts` passes.

### Step 3: Replace the inline checks in the three affected routes

In each route, replace the inline `authHeader === \`Bearer ${...}\`` comparison with the shared helper:

- `src/routes/api/cleanup-old-data/+server.ts`
- `src/routes/api/cleanup-expired-onboardings/+server.ts`
- `src/routes/api/cleanup-account-setup-links/+server.ts`

The intended route shape is:

```ts
assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);
```

Use the actual exported helper name from Step 1. Keep the existing cleanup logic after authorization unchanged.

**Verify**:

```bash
rg -n "Bearer \\$\\{.*Secret\\}" src/routes/api/cleanup-old-data/+server.ts src/routes/api/cleanup-expired-onboardings/+server.ts src/routes/api/cleanup-account-setup-links/+server.ts
```

Expected: no matches.

### Step 4: Run the repo gate

**Verify**:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

All commands exit 0.

## Test Plan

- New helper tests in `src/lib/server/cronEndpointAuth.test.ts`.
- Existing exemplar: `src/routes/api/billing-reconciliation/server.test.ts` tests missing and wrong bearer tokens.
- Static regression check prevents the exact unsafe template-string pattern from remaining in the three endpoints.

## Done Criteria

- [ ] The three affected cleanup endpoints no longer compare against `Bearer ${cleanupSecret}` or `Bearer ${cronSecret}` directly.
- [ ] Undefined, empty, and blank secrets are never accepted.
- [ ] At least one nonblank configured secret is required before a request can be authorized.
- [ ] Targeted helper test passes.
- [ ] Full npm gate passes: `format`, `lint`, `governance:check`, `check`, `test`.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report if:

- Any affected route has already been refactored behind a shared scheduled-job wrapper.
- The route needs a different secret source than `CLEANUP_SECRET` or `CRON_SECRET`.
- The fix appears to require changing cleanup behavior or database deletion semantics.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance Notes

Future scheduled endpoints should use this helper instead of copying bearer-token checks. Reviewers should scan for new `Bearer ${secret}` comparisons in scheduled routes.
