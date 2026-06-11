# 008 - Harden archive-retention cron authorization

Status: DONE
Priority: P1
Effort: S
Created: 2026-06-11
Audit commit: `c99874d0`
Depends on: `002-reject-unset-cleanup-bearer-secrets`

## Problem

`src/routes/api/cleanup-archived-records/+server.ts` still uses a local bearer-token comparison that treats any string value as configured. That means empty or whitespace environment secrets can create unsafe authorization behavior. A shared hardened helper now exists for cron-style cleanup endpoints, but this archive-retention endpoint has not been moved onto it.

## Evidence

- `src/routes/api/cleanup-archived-records/+server.ts` defines local `isAuthorized(...)` logic:
  - It accepts `typeof cleanupSecret === 'string'`.
  - It compares the header to `Bearer ${cleanupSecret}`.
  - It does not trim configured secrets.
  - It does not fail closed when no usable secret is configured.
- `src/lib/server/cronEndpointAuth.ts` already provides `assertCronEndpointAuthorized(...)`.
  - It trims secrets.
  - It filters empty values.
  - It returns 500 when no valid secret is configured.
  - It uses timing-safe comparison.
- `plans/002-reject-unset-cleanup-bearer-secrets.md` fixed the shared helper path but intentionally did not cover this endpoint.

## Goal

Archive-retention cleanup authorization uses the same hardened cron auth helper as other cleanup endpoints.

## Non-Goals

- Do not change archive-retention deletion semantics.
- Do not change the cleanup use case or storage behavior.
- Do not add or change database functions, grants, policies, or migrations.
- Do not rename environment variables in this slice.

## Files To Inspect

- `src/routes/api/cleanup-archived-records/+server.ts`
- `src/routes/api/cleanup-archived-records/server.test.ts`
- `src/routes/api/cleanup-archived-personnel/+server.ts`
- `src/lib/server/cronEndpointAuth.ts`
- `src/lib/server/cronEndpointAuth.test.ts`

## Implementation Plan

1. Add regression tests for unsafe secret configuration.
   - In `src/routes/api/cleanup-archived-records/server.test.ts`, add tests that reject:
     - `CLEANUP_SECRET=''` with header `Bearer `.
     - `CRON_SECRET='   '` with header `Bearer`.
     - both secrets unset with any bearer value.
   - Assert the endpoint fails with the helper's "secret is not configured" behavior when no non-empty secret exists.
   - Assert the cleanup use case is not run when authorization fails.

2. Replace the endpoint-local auth helper.
   - Import `assertCronEndpointAuthorized` from `src/lib/server/cronEndpointAuth.ts`.
   - Remove the local `isAuthorized(...)` function.
   - In `_runArchiveRetentionCleanupEndpointCore`, call:

```ts
assertCronEndpointAuthorized(input.request.headers.get('authorization'), [
	input.env.CLEANUP_SECRET,
	input.env.CRON_SECRET
]);
```

- In `GET`, call the same helper before building Supabase clients or stores.

3. Keep the compatibility alias intact.
   - Confirm `src/routes/api/cleanup-archived-personnel/+server.ts` still re-exports the same handler if that file is currently just an alias.
   - Do not duplicate auth logic there.

4. Remove stale auth code and search for similar leftovers.
   - Verify the archive-retention route no longer contains `function isAuthorized` or direct `Bearer ${...}` secret comparisons.
   - Do not broaden the slice to unrelated endpoints unless the same exact local helper remains in the archive-retention route family.

## Suggested Tests

Run the narrow tests first:

```bash
npm run test -- src/lib/server/cronEndpointAuth.test.ts src/routes/api/cleanup-archived-records/server.test.ts
rg -n "function isAuthorized|Bearer \\$\\{.*Secret\\}" src/routes/api/cleanup-archived-records/+server.ts
```

Before marking complete, run the full repo gate:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

## Acceptance Criteria

- Archive-retention cleanup uses `assertCronEndpointAuthorized(...)`.
- Empty, whitespace, and unset cleanup secrets fail closed.
- Authorized requests using either `CLEANUP_SECRET` or `CRON_SECRET` still pass.
- No cleanup work runs before authorization succeeds.
- All required verification commands pass.

## Risks And Notes

- A deployment with blank cleanup secrets may start returning 500 instead of accepting a blank bearer token. That is intended and should be treated as a configuration problem.
- Keep error messages generic; do not echo secret values.
