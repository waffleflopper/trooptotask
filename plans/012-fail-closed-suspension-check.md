# Plan 012: Fail closed when the user-suspension RPC errors in hooks.server.ts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- src/hooks.server.ts src/hooks.server.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

Every authenticated request runs a suspension gate in `src/hooks.server.ts`: it calls the
`is_user_suspended` Postgres RPC and redirects suspended users to `/suspended`. The call
destructures only `data` and never checks the RPC `error`. When the RPC fails (network blip,
Postgres error, exhausted connection pool), `data` is `null`/`undefined`, the `if (isSuspended)`
branch is skipped, and a **suspended user proceeds as if they were in good standing**. A
suspension gate that fails open is a security control that silently turns itself off exactly when
infrastructure is degraded. After this plan, an RPC failure produces a 500 for that request
(fail closed) and is logged, matching the repo's existing RPC error-handling convention.

## Current state

- `src/hooks.server.ts` — the single `handle` hook; sets up the Supabase server client, resolves
  the session, enforces MFA/session rules, and runs the suspension gate. The bug is at lines
  204–216:

```ts
// src/hooks.server.ts:204-216 (as of 22e6e184)
// Check user suspension (skip for auth routes, api routes, and the suspended page itself)
const skipSuspensionCheck = ['/auth', '/api/auth', '/suspended'].some((p) => event.url.pathname.startsWith(p));
if (event.locals.user && !skipSuspensionCheck) {
	const { data: isSuspended } = await event.locals.supabase.rpc('is_user_suspended', {
		check_user_id: event.locals.user.id
	});
	if (isSuspended) {
		return new Response(null, {
			status: 302,
			headers: { Location: '/suspended' }
		});
	}
}
```

- The file's imports at line 2 are currently:

```ts
// src/hooks.server.ts:2
import { type Handle, redirect } from '@sveltejs/kit';
```

`error` is NOT yet imported from `@sveltejs/kit`.

- Repo convention for Supabase RPC calls is to destructure **both** `data` and `error` and handle
  the error explicitly. Exemplar: `src/lib/server/subscription.ts` (the `getEffectiveTier` path)
  checks and throws on RPC/query errors. Another in-file exemplar: the MFA assurance call at
  `src/hooks.server.ts:178-185` destructures `error: assuranceError` and handles it (there it
  logs and continues, because MFA pending state is advisory; suspension is not — it must fail
  closed).

- `src/hooks.server.test.ts` — existing unit test for the hook. It has one test
  ("clears stale Supabase auth cookies when refresh token lookup fails") that establishes the
  mocking pattern: `vi.doMock('@supabase/ssr', ...)` returning a fake `createServerClient` with
  stubbed `auth.getSession`, `auth.getClaims`, `auth.mfa.getAuthenticatorAssuranceLevel`, and
  `rpc`, plus `vi.doMock('$env/static/public', ...)` and `vi.doMock('$lib/server/env', () => ({}))`,
  then `const { handle } = await import('./hooks.server')`. Model your new tests on it.

- How an authenticated request flows through the hook (you must satisfy all of this in test
  mocks to reach the suspension gate, see `src/hooks.server.ts:86-186`):
  1. `event.cookies.getAll()` must include a cookie whose name matches the Supabase auth storage
     key, e.g. `{ name: 'sb-example-auth-token', value: 'session' }` (with the mocked
     `PUBLIC_SUPABASE_URL: 'https://example.supabase.co'`), otherwise `safeGetSession` returns
     a null session without calling Supabase.
  2. `auth.getSession` must resolve `{ data: { session: { access_token: 'token', user: {...} } }, error: null }`.
  3. `auth.getClaims` must resolve `{ data: { claims: {...} }, error: null }`. The claims are fed
     to `buildTrustedUserFromClaims(claims, session.user)` — read
     `src/lib/server/authSession.ts` to see which claim fields it expects (at minimum the user
     id claim) and construct a minimal valid claims object.
  4. `session.user.last_sign_in_at` must be recent (e.g. `new Date().toISOString()`), or the
     24-hour absolute timeout at lines 159-170 signs the user out.
  5. `auth.mfa.getAuthenticatorAssuranceLevel` must resolve
     `{ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }` so `mfaPending` stays false.
  6. The request URL must be a protected, non-skipped path, e.g. `http://localhost/dashboard`
     (not under `/auth`, `/api/auth`, or `/suspended`).
  7. The hook's rate limiter runs first (line 65) — in the existing test it passes because a
     single request never trips it; keep `getClientAddress: () => '127.0.0.1'`.

## Commands you will need

| Purpose    | Command                                   | Expected on success |
| ---------- | ----------------------------------------- | ------------------- |
| Unit tests | `npx vitest run src/hooks.server.test.ts` | all pass            |
| Full tests | `npm run test`                            | exit 0              |
| Typecheck  | `npm run check`                           | exit 0, 0 errors    |
| Lint       | `npm run lint`                            | exit 0              |
| Format     | `npm run format`                          | exit 0              |
| Governance | `npm run governance:check`                | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/hooks.server.ts`
- `src/hooks.server.test.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- The `is_user_suspended` SQL function or any file under `supabase/migrations/` — the RPC is
  fine; the bug is the unchecked client-side call.
- `src/lib/server/mfaGate.ts`, `src/lib/server/authSession.ts` — read-only references.
- The MFA assurance error handling at lines 178-185 — it logs-and-continues by design
  (advisory state); do not "harden" it to match the suspension fix.
- The `/suspended` page and `user_suspensions` table.

## Git workflow

- Branch: `advisor/012-fail-closed-suspension-check`
- Commit style: short imperative subject, matching repo history (e.g. "Harden archive retention
  cron auth"). Suggested: `Fail closed when suspension RPC errors`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Check the RPC error and fail closed

In `src/hooks.server.ts`:

1. Add `error` to the kit import at line 2: `import { type Handle, error, redirect } from '@sveltejs/kit';`
2. Change the suspension block (lines 204-216) to destructure and handle the error:

```ts
if (event.locals.user && !skipSuspensionCheck) {
	const { data: isSuspended, error: suspensionError } = await event.locals.supabase.rpc('is_user_suspended', {
		check_user_id: event.locals.user.id
	});
	if (suspensionError) {
		console.error('Failed to check user suspension status:', suspensionError.message);
		error(500, 'Unable to verify account status');
	}
	if (isSuspended) {
		return new Response(null, {
			status: 302,
			headers: { Location: '/suspended' }
		});
	}
}
```

Design decision (do not relitigate): a suspension gate must fail **closed**. A transient RPC
failure turns into a 500 for that request rather than silently admitting a possibly-suspended
user. The log line preserves diagnosability.

**Verify**: `npm run check` → exit 0.

### Step 2: Add regression tests

In `src/hooks.server.test.ts`, add two tests modeled on the existing test's `vi.doMock`
pattern, using the authenticated-session mock recipe from "Current state":

1. **`fails closed when the suspension RPC returns an error`** — mock
   `rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection refused' } })`.
   Expect the `handle(...)` promise to **reject** with an object whose `status` is `500`
   (SvelteKit's `error()` throws an `HttpError`):
   `await expect(handle({ event, resolve })).rejects.toMatchObject({ status: 500 })`.
   Also assert `resolve` was NOT called.
2. **`redirects suspended users to /suspended`** (characterization of existing behavior) — mock
   `rpc: vi.fn().mockResolvedValue({ data: true, error: null })`. Expect the returned response
   to have `status` 302 and `Location` header `/suspended`.

If `buildTrustedUserFromClaims` rejects your minimal claims object, read
`src/lib/server/authSession.ts` and adjust the claims — do not weaken the production code to
make the test pass.

**Verify**: `npx vitest run src/hooks.server.test.ts` → 3 tests pass (1 existing + 2 new).

### Step 3: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` → all exit 0.

## Test plan

- New tests (in `src/hooks.server.test.ts`, pattern: the existing stale-cookie test):
  - RPC error → request fails with 500, `resolve` not called (the regression this plan fixes).
  - RPC returns `true` → 302 redirect to `/suspended` (pins existing behavior so the fix
    doesn't break the happy suspension path).
- Verification: `npx vitest run src/hooks.server.test.ts` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "error: suspensionError" src/hooks.server.ts` returns one match
- [ ] `npx vitest run src/hooks.server.test.ts` exits 0 with 3 passing tests
- [ ] `npm run check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run test` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 012 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The suspension block at `src/hooks.server.ts:204-216` no longer matches the excerpt above.
- You cannot construct a passing authenticated-session mock after reading
  `src/lib/server/authSession.ts` (i.e. the second new test can't reach the suspension gate) —
  report what `buildTrustedUserFromClaims` requires rather than modifying it.
- Any existing test in `npm run test` fails for a reason unrelated to your change, twice in a row.
- You find other callers of `is_user_suspended` with the same unchecked pattern — fix only
  hooks.server.ts and list the other call sites in your report.

## Maintenance notes

- Anyone adding a new RPC call in `hooks.server.ts` should follow this destructure-and-check
  pattern; the MFA assurance call (lines 178-185) intentionally logs-and-continues because it is
  advisory — the difference is whether the check is a security gate.
- Reviewer should scrutinize: that the 500 path cannot trigger for anonymous users (the block is
  guarded by `event.locals.user`) and that `/auth`, `/api/auth`, `/suspended` remain skipped so a
  DB outage doesn't lock users out of logout/login flows.
- Deferred: a broader "all RPC calls must check error" lint rule was considered and not planned —
  revisit if a second fail-open call site appears.
