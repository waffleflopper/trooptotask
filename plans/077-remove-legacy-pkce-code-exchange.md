# Plan 077: Remove the legacy PKCE code-exchange paths from reset-password and accept-invite

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan has a **hard precondition gate in Step 0** — if it is not
> satisfied, STOP and report; do not remove any code. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b3acfabb..HEAD -- src/routes/auth/reset-password/+page.server.ts src/routes/auth/accept-invite/+page.server.ts src/routes/auth/confirm`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b3acfabb`, 2026-06-14

## Why this matters

`/auth/reset-password` and `/auth/accept-invite` each carry a TODO-marked
"legacy PKCE code exchange" fallback: if the URL has a `?code=` param, they call
`supabase.auth.exchangeCodeForSession(code)`. This is the old email-link format.
The app-owned replacement is `/auth/confirm`, which uses
`verifyOtp({ token_hash, type })` (see `src/routes/auth/confirm/+page.server.ts`)
and sets the same pending-auth-flow cookie. Keeping both means two parallel
auth-entry code paths to reason about and a standing pair of TODOs that drift
(any change must be mirrored in two files). Once production email templates emit
`token_hash` links to `/auth/confirm` instead of `?code=` links, the legacy
fallback is dead and should go.

**This plan is the removal, gated on confirming the templates have migrated.**
The executor cannot inspect the Supabase email-template configuration, so the
precondition must be confirmed by the operator before any deletion.

## Current state

The two files are byte-for-byte parallel. `src/routes/auth/reset-password/+page.server.ts`:

```ts
import { setPendingAuthFlowCookie } from '$lib/server/mfaGate';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	// TODO: remove this legacy PKCE code exchange after production email templates
	// are fully rolled over to the app-owned /auth/confirm flow.
	const code = url.searchParams.get('code');
	if (code) {
		const { error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (exchangeError) {
			console.error('Reset-password code exchange failed:', exchangeError.message);
		} else {
			setPendingAuthFlowCookie(cookies, 'recovery');
		}
	}

	const {
		data: { session }
	} = await locals.supabase.auth.getSession();

	return { hasSession: !!session?.access_token };
};
```

`src/routes/auth/accept-invite/+page.server.ts` is identical except the log
prefix is `'Accept-invite code exchange failed:'` and the cookie flow is
`'invite'` instead of `'recovery'`.

The replacement path, `src/routes/auth/confirm/+page.server.ts`, already handles
recovery and invite via `verifyOtp({ token_hash, type })` and
`setPendingAuthFlowCookie(cookies, confirmation.type)`.

## Commands you will need

| Purpose    | Command                                                  | Expected on success |
|------------|----------------------------------------------------------|---------------------|
| Format     | `npm run format`                                        | rewrites, exit 0    |
| Lint       | `npm run lint`                                           | exit 0              |
| Governance | `npm run governance:check`                              | exit 0              |
| Typecheck  | `npm run check`                                          | exit 0, no errors   |
| Full tests | `npm run test`                                          | all pass            |
| E2E auth   | `npm run test:e2e:auth` (requires local Supabase)       | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/routes/auth/reset-password/+page.server.ts`
- `src/routes/auth/accept-invite/+page.server.ts`

**Out of scope** (do NOT touch):
- `src/routes/auth/confirm/*` — the replacement flow; it stays.
- `src/lib/server/mfaGate.ts` (`setPendingAuthFlowCookie`) — still used by
  `/auth/confirm`; do not remove it.
- Supabase email templates / dashboard config — not in this repo; the operator
  owns them.
- The `+page.svelte` files for these routes, unless removing the `?code=`
  handling leaves an unused prop (`hasSession` stays — it is still produced).

## Git workflow

- Branch: `advisor/077-remove-legacy-pkce` (or the repo's convention).
- One commit; message style short imperative (e.g. "Remove legacy PKCE code exchange").
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0 (GATE — do this first): Confirm the precondition

Do NOT remove any code until BOTH are confirmed:

1. **Operator confirmation**: ask the operator (Robert) to confirm that
   production Supabase email templates for **password recovery** and
   **invitation** now send links to the `/auth/confirm` flow (with
   `token_hash`/`type`), not legacy `?code=` links to `/auth/reset-password`
   or `/auth/accept-invite`. If this cannot be confirmed, **STOP and report** —
   the legacy fallback must remain.
2. **Codebase confirmation**: verify `/auth/confirm` handles both `recovery` and
   `invite` types — `grep -n "recovery\|invite\|type" src/lib/server/authConfirm.ts`
   and read `src/routes/auth/confirm/+page.server.ts`. If the confirm flow does
   not cover both, STOP and report.

If either check fails, mark the plan **BLOCKED** in `plans/README.md` with the
reason and stop.

### Step 1: Remove the legacy block from `reset-password`

Reduce `src/routes/auth/reset-password/+page.server.ts` to just the session
check:

```ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const {
		data: { session }
	} = await locals.supabase.auth.getSession();

	return { hasSession: !!session?.access_token };
};
```

Remove the now-unused `setPendingAuthFlowCookie` import and the now-unused
`url` and `cookies` destructured params.

**Verify**: `npm run check` → exit 0 (no unused-import/param errors).

### Step 2: Remove the legacy block from `accept-invite`

Apply the identical reduction to
`src/routes/auth/accept-invite/+page.server.ts` (same final shape; only the
file differs in nothing once the legacy block is gone).

**Verify**: `npm run check` → exit 0.

### Step 3: Run the full gate and the auth E2E

**Verify**:
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` → all exit 0.
- `npm run test:e2e:auth` → all pass (this exercises the recovery/invite entry
  flows end to end; it is the real safety net for this change). If a local
  Supabase is not available to run it, STOP and report that the E2E gate could
  not be run rather than declaring done.

## Test plan

- No new unit tests are required (this removes a branch). The guard is the
  existing auth E2E suite `e2e/specs/auth-email-flows.spec.ts`
  (`npm run test:e2e:auth`), which must pass and proves the `/auth/confirm`
  flow handles recovery and invite without the legacy fallback.
- If `reset-password` or `accept-invite` has a co-located server test asserting
  the `?code=` branch, update or remove that assertion to match the new behavior
  (and note it in the commit). Do not leave a test asserting removed behavior.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Step 0 gate confirmed (operator + codebase) — recorded in the PR/commit
      description or, if not, plan marked BLOCKED and no code removed.
- [ ] `grep -rn "exchangeCodeForSession" src/routes/auth/reset-password src/routes/auth/accept-invite`
      returns **no** matches
- [ ] `grep -rn "TODO: remove this legacy PKCE" src/routes/auth` returns **no** matches
- [ ] `npm run check` exits 0 (confirms no unused imports/params remain)
- [ ] `npm run lint` exits 0
- [ ] `npm run governance:check` exits 0
- [ ] `npm run test` exits 0
- [ ] `npm run test:e2e:auth` passes (or, if unrunnable locally, reported — not
      silently skipped)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 077 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 0 gate cannot be confirmed (templates not migrated, or `/auth/confirm`
  doesn't cover both recovery and invite). Mark BLOCKED.
- The "Current state" excerpts don't match the live files.
- Removing the legacy block leaves `hasSession` unused by the `+page.svelte`
  (it should still be used — if not, report rather than editing the component).
- `npm run test:e2e:auth` fails after removal, or cannot be run.

## Maintenance notes

- After this lands, `exchangeCodeForSession` should have no callers in
  `src/routes/auth`; the only supported email-link entry point is
  `/auth/confirm`. A reviewer should confirm no remaining route reads a `?code=`
  param for auth.
- If a future Supabase or email-provider change reintroduces `?code=` links,
  the correct fix is to extend `/auth/confirm`, not to restore these fallbacks.
