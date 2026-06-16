# Plan 075: Require reauthentication before email change, revoke other sessions on password change, and stop leaking raw login errors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b3acfabb..HEAD -- src/routes/account/security src/routes/auth/login src/routes/api/auth/update-password`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b3acfabb`, 2026-06-14

## Why this matters

Three related account-security gaps in the authentication surface:

- **A — Email change has no reauthentication.** Changing the account password
  requires the current password (`/api/auth/update-password` calls
  `signInWithPassword` with `currentPassword` before `updateUser`). Changing
  the account *email* requires nothing but a valid session: the `updateEmail`
  action calls `locals.supabase.auth.updateUser({ email })` directly. An
  attacker who hijacks a session (or uses an unattended logged-in browser) can
  start an email takeover — point the account at an email they control,
  confirm from their inbox, then reset the password — **without ever knowing
  the password**. This is the standout gap: the app already treats credential
  changes as sensitive everywhere else; email change is the one hole.
- **B — Credential rotation does not revoke other sessions.** After a user
  rotates their password (the canonical "secure my account" action), existing
  sessions on other devices stay valid until they naturally expire (up to the
  24h absolute timeout in `hooks.server.ts`). A user who changes their password
  *because* they suspect compromise does not actually kick the attacker out.
- **C — Login leaks the raw provider error message.** The login action returns
  `error.message` straight from Supabase, which can vary by account state
  (e.g. "Email not confirmed" vs "Invalid login credentials"), enabling account
  enumeration. The app already logs the real error server-side for operators.

After this plan: email change requires the current password (closing the
takeover path), a successful password change revokes sessions on other devices,
and login returns a single generic credential error.

### Scope note on B (read before implementing)

B is implemented on the **password-change** success path, not the email-change
path, and this is deliberate: a Supabase email change is *pending* until the
user confirms it via the emailed link — confirmation happens on Supabase's
side, not in our code, so there is no server-side hook at which the email
change "completes" for us to revoke sessions. Password change, by contrast,
completes synchronously in `/api/auth/update-password`. Revoking other sessions
there delivers the security intent ("rotating credentials logs out other
devices") at the one place we actually control. Do not add session revocation
to the email-change action.

## Current state

### A — `src/routes/account/security/+page.server.ts` (the `updateEmail` action)

The whole file today:

```ts
// lines 26-52
export const actions: Actions = {
	updateEmail: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login');

		const formData = await request.formData();
		const email = sanitizeString(String(formData.get('email') ?? ''), 254).toLowerCase();

		if (!validateEmail(email)) {
			return fail(400, { emailError: 'Enter a valid email address', email });
		}

		if (email === locals.user.email?.toLowerCase()) {
			return fail(400, { emailError: 'Enter a different email address', email });
		}

		const { error } = await locals.supabase.auth.updateUser({ email });

		if (error) {
			return fail(400, { emailError: error.message, email });
		}

		return {
			emailSuccess: 'Check the new inbox to confirm this change. Until then, keep signing in with your current email.',
			pendingEmail: email
		};
	}
};
```

The reauth pattern to mirror lives in
`src/routes/api/auth/update-password/+server.ts:66-73`:

```ts
const { error: signInError } = await locals.supabase.auth.signInWithPassword({
	email,
	password: currentPassword
});

if (signInError) {
	return json({ error: 'Current password is incorrect' }, { status: 401 });
}
```

### A — `src/routes/account/security/+page.svelte` (the email form)

The email form is a native SvelteKit form action (`use:enhance`,
`action="?/updateEmail"`) spanning roughly lines 222-274. Today it contains a
single email input (line 263):

```svelte
<Input id="email" name="email" type="email" autocomplete="email" required value={form?.email ?? ''} />
```

There is already a `currentPassword` `$state` (line 27) but it is bound to the
**password-change** form (a `fetch` to `/api/auth/update-password`, line 167),
not the email form. The email form needs its own password field.

### B — `src/routes/api/auth/update-password/+server.ts`

After a successful password update (line 86-99), the handler optionally clears
the recovery cookie and returns:

```ts
const { error } = await locals.supabase.auth.updateUser({ password });

if (error) {
	const providerPasswordError = mapProviderPasswordError(error);
	if (providerPasswordError) {
		return json({ error: providerPasswordError }, { status: 400 });
	}
	return json({ error: 'Password update failed' }, { status: 401 });
}

if (locals.authFlow === 'recovery') {
	cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
}

return json({ ok: true });
```

No session revocation happens here. `supabase.auth.signOut({ scope: 'others' })`
revokes every session for the user *except* the current one — exactly what we
want (the current device stays logged in; other devices are kicked).

### C — `src/routes/auth/login/+page.server.ts`

The login action (lines 40-48):

```ts
const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

if (error) {
	auditLog(
		{ action: 'auth.login_failure', resourceType: 'user', severity: 'warning', details: { email } },
		{ userId: null }
	);
	return fail(400, { error: error.message, email, nextPath });
}
```

The real error is already captured in the audit log; only the client-facing
`error.message` needs to become generic.

### Repo conventions

- Server actions return `fail(status, { ...fields })` from `@sveltejs/kit` for
  validation/expected errors, and `redirect(303, ...)` for navigation.
- Error copy is plain sentence-case user-facing text.
- Tests are vitest, co-located as `<name>.test.ts` or `page.server.test.ts`.
  Login already has `src/routes/auth/login/page.server.test.ts`; model new
  server-action tests after it. The Supabase client is injected via `locals`
  and mocked with `vi.fn()` in those tests.

## Commands you will need

| Purpose    | Command                                                         | Expected on success     |
|------------|----------------------------------------------------------------|-------------------------|
| Format     | `npm run format`                                               | rewrites, exit 0        |
| Lint       | `npm run lint`                                                 | exit 0                  |
| Governance | `npm run governance:check`                                    | exit 0                  |
| Typecheck  | `npm run check`                                               | exit 0, no errors       |
| Unit tests | `npm run test`                                                | all pass                |
| Focused    | `npx vitest run src/routes/account/security src/routes/auth/login src/routes/api/auth/update-password` | new + existing pass |

## Suggested executor toolkit

- This plan edits one Svelte file. Before editing it, follow the Svelte MCP
  documentation flow and run `svelte-autofixer` on
  `src/routes/account/security/+page.svelte` until it reports no issues.

## Scope

**In scope** (the only files you should modify):
- `src/routes/account/security/+page.server.ts` (A)
- `src/routes/account/security/+page.svelte` (A — add password field to email form)
- `src/routes/account/security/page.server.test.ts` (A — create)
- `src/routes/api/auth/update-password/+server.ts` (B)
- `src/routes/api/auth/update-password/server.test.ts` (B — extend; it exists)
- `src/routes/auth/login/+page.server.ts` (C)
- `src/routes/auth/login/page.server.test.ts` (C — extend; it exists)

**Out of scope** (do NOT touch, even though they look related):
- The password-change form/flow in `+page.svelte` (the `fetch` to
  `/api/auth/update-password`) — it already requires the current password.
- `src/lib/server/sensitiveActionAuthorizer.ts` and the
  `/api/auth/confirm-sensitive-action` endpoint — do NOT rewire email change
  through the full MFA step-up authorizer. A current-password check (matching
  `update-password`) is the agreed, lower-risk approach for this plan.
- The email-change action's session handling — do NOT add session revocation to
  `updateEmail` (see "Scope note on B" above).
- Any Supabase migration or RLS change. This plan is app-layer only.

## Git workflow

- Branch: `advisor/075-account-email-change-hardening` (or the repo's branch
  convention if one is evident from `git branch`).
- Commit per logical unit (A, then B, then C). Message style is short
  imperative, matching `git log` (e.g. "Require current password to change email").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1 (A): Require the current password in the `updateEmail` action

In `src/routes/account/security/+page.server.ts`, inside `updateEmail`, after
the existing email validation and the "different email" check, and **before**
`updateUser({ email })`:

1. Read the current password from the form:
   `const currentPassword = String(formData.get('currentPassword') ?? '');`
2. If it is empty, return
   `fail(400, { emailError: 'Enter your current password to change your email', email });`
3. Reauthenticate using the user's *current* email and the supplied password,
   mirroring `update-password`:
   ```ts
   const currentEmail = locals.user.email;
   if (!currentEmail) {
   	return fail(401, { emailError: 'Your session is no longer active. Sign in again.', email });
   }
   const { error: reauthError } = await locals.supabase.auth.signInWithPassword({
   	email: currentEmail,
   	password: currentPassword
   });
   if (reauthError) {
   	return fail(401, { emailError: 'Current password is incorrect', email });
   }
   ```
4. Leave the existing `updateUser({ email })` call and its error handling in
   place (the success message is unchanged).

**Verify**: `npm run check` → exit 0.

### Step 2 (A): Add a current-password field to the email form

In `src/routes/account/security/+page.svelte`, inside the email `<form>`
(action `?/updateEmail`, around lines 222-274), add a password input named
`currentPassword` next to the email input. Use the existing `Input` component
and label styling already present in the file. Do NOT bind it to the existing
`currentPassword` `$state` used by the password form — give the email form its
own state (e.g. `let emailCurrentPassword = $state('')`) and bind to that, or
leave it uncontrolled with just `name="currentPassword"` and
`autocomplete="current-password"`. Clear the field on success if you add state.

The field must submit as form data named `currentPassword` so the server action
reads it. Keep the existing email input unchanged.

**Verify**:
- Run the Svelte autofixer on the file until clean.
- `npm run check` → exit 0.

### Step 3 (B): Revoke other sessions after a successful password update

In `src/routes/api/auth/update-password/+server.ts`, after the `updateUser({ password })`
success path (i.e. after the `if (error) { ... }` block at line 88-99 and
before/after the recovery-cookie cleanup at line 101-103), add:

```ts
// Rotating the password logs out other devices so a compromised session cannot persist.
const { error: revokeError } = await locals.supabase.auth.signOut({ scope: 'others' });
if (revokeError) {
	auditLog(
		{ action: 'auth.session_revoke_failed', resourceType: 'user', resourceId: userId ?? undefined, severity: 'warning', details: {} },
		{ userId }
	);
}
```

`auditLog` is already imported at the top of this file. Do **not** fail the
request if revocation errors — the password change already succeeded; only log
it. Keep the existing `return json({ ok: true })`.

**Verify**: `npm run check` → exit 0.

### Step 4 (C): Return a generic login error

In `src/routes/auth/login/+page.server.ts`, change line 47 from
`return fail(400, { error: error.message, email, nextPath });` to
`return fail(400, { error: 'Email or password is incorrect', email, nextPath });`.
Leave the `auditLog` call above it untouched (it preserves the real failure for
operators).

**Verify**: `npm run check` → exit 0.

### Step 5: Write/extend tests (see Test plan), then run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` → all exit 0.

## Test plan

- **Create `src/routes/account/security/page.server.test.ts`** (model structure
  after `src/routes/auth/login/page.server.test.ts` — mock `locals.supabase.auth`
  with `vi.fn()`s and call the action directly). Cover:
  - `updateEmail` with a missing/empty `currentPassword` → returns
    `fail(400)` with `emailError` mentioning the current password; `updateUser`
    is **not** called.
  - `updateEmail` where `signInWithPassword` returns an error → returns
    `fail(401)` with `Current password is incorrect`; `updateUser` not called.
  - `updateEmail` happy path: `signInWithPassword` resolves `{ error: null }`,
    `updateUser` resolves `{ error: null }` → returns `emailSuccess` and
    `pendingEmail`; assert `signInWithPassword` was called with the user's
    current email.
- **Extend `src/routes/api/auth/update-password/server.test.ts`**: assert that
  on a successful password update, `signOut` is called with `{ scope: 'others' }`,
  and that a `signOut` error does **not** change the `{ ok: true }` 200 response.
- **Extend `src/routes/auth/login/page.server.test.ts`**: a failed
  `signInWithPassword` returns the generic `Email or password is incorrect`
  (not the provider's message), and the `auth.login_failure` audit log still
  fires.
- **Verification**: `npx vitest run src/routes/account/security src/routes/auth/login src/routes/api/auth/update-password` → all pass, including the new cases.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run governance:check` exits 0
- [ ] `npm run test` exits 0; new account-security tests and the extended
      update-password/login tests exist and pass
- [ ] `grep -n "signInWithPassword" src/routes/account/security/+page.server.ts`
      returns a match (reauth is wired)
- [ ] `grep -n "scope: 'others'" src/routes/api/auth/update-password/+server.ts`
      returns a match
- [ ] `grep -n "error.message" src/routes/auth/login/+page.server.ts` returns
      **no** match in the failed-login `fail(...)` call
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 075 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the
  codebase drifted since this plan was written).
- `supabase.auth.signOut` in this codebase's installed `@supabase/supabase-js`
  does not accept a `{ scope }` option (check the type / docs). If so, report —
  do not invent an alternative revocation mechanism.
- Adding the current-password field to the email form would require
  restructuring the existing password form or its `currentPassword` state.
- The login or update-password tests assert on behavior this plan changes in a
  way you cannot reconcile by updating the assertion to the new generic message
  / new revocation call.
- Any change appears to require touching an out-of-scope file.

## Maintenance notes

- If email change is ever moved to the full sensitive-action step-up flow
  (`/api/auth/confirm-sensitive-action` + `SensitiveActionAuthorizer`), the
  current-password check added here becomes redundant and should be removed in
  the same change to avoid double prompts.
- Session revocation lives on the password-change path only, by design (email
  changes are pending until externally confirmed). If a server-side hook for
  "email change confirmed" is ever added, revisit whether to revoke there too.
- A reviewer should confirm the generic login message did not break any E2E
  auth spec that asserts specific copy (`e2e/specs/auth-email-flows.spec.ts`).
- The current-password reauth relies on Supabase's own sign-in rate limiting;
  if abuse appears, consider reusing `checkPasswordUpdateRateLimit`.
