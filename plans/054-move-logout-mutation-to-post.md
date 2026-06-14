# Plan 054: Move logout mutation to POST

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/routes/auth/logout src/lib/components/TopHeader.svelte src/routes/dashboard src/routes/auth e2e/specs/z-auth.spec.ts src/lib/server/mfaGate.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

The current logout route signs the user out during a page `load`, so a GET navigation mutates auth
state. Any link, top-level navigation, or prefetch to `/auth/logout` can terminate the session and
clear pending invite/recovery flow state. This is lower severity than data-changing CSRF, but logout
is still an auth-state mutation and should require an intentional same-origin POST.

## Current state

- `src/routes/auth/logout/+page.server.ts` performs the mutation in `load`.
- Several UI surfaces link or navigate directly to `/auth/logout`.
- `src/lib/server/mfaGate.ts` includes `/auth/logout` in the pending auth-flow allowlist so invite
  and recovery sessions can leave the flow.
- `e2e/specs/z-auth.spec.ts` verifies logout by navigating directly to `/auth/logout`.

Current excerpts:

```ts
// src/routes/auth/logout/+page.server.ts:5
export const load: PageServerLoad = async ({ locals, cookies }) => {
	await locals.supabase.auth.signOut();
	cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
	redirect(303, '/');
};
```

```svelte
<!-- src/lib/components/TopHeader.svelte:471 -->
<DropdownMenu.Item variant="destructive" onclick={() => goto(resolve('/auth/logout'))}>
	<LogOut />
	Sign Out
</DropdownMenu.Item>
```

```svelte
<!-- src/routes/dashboard/+page.svelte:207 -->
<Button href="/auth/logout" variant="outline">Sign Out</Button>
```

```ts
// e2e/specs/z-auth.spec.ts:37
await page.goto('/auth/logout');
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Targeted route/action tests | `npx vitest run src/routes/auth/logout/page.server.test.ts` | exits 0 |
| Existing auth tests | `npx vitest run src/routes/auth src/lib/server/mfaGate.test.ts` | exits 0 |
| Targeted E2E | `npm run test:e2e:auth` or `npx playwright test --config=e2e/playwright.config.ts e2e/specs/z-auth.spec.ts` | logout case passes |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Suggested executor toolkit

- If you edit Svelte files, follow the repo AGENTS.md Svelte MCP documentation flow before writing
  code, then run `svelte-autofixer` until it reports no issues or suggestions.

## Scope

**In scope**:

- `src/routes/auth/logout/+page.server.ts`
- `src/routes/auth/logout/+page.svelte` (create if needed for a POST form)
- Logout links/forms in:
  - `src/lib/components/TopHeader.svelte`
  - `src/routes/dashboard/+page.svelte`
  - `src/routes/auth/mfa-verify/+page.svelte`
  - `src/routes/auth/accept-invite/+page.svelte`
  - `src/routes/auth/reset-password/+page.svelte`
- Focused tests:
  - `src/routes/auth/logout/page.server.test.ts` (create)
  - `e2e/specs/z-auth.spec.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not change login, MFA, invite, or recovery semantics beyond their sign-out affordance.
- Do not remove `/auth/logout` from `src/lib/server/mfaGate.ts` unless the new POST flow proves it
  is no longer needed for pending auth-flow exits.
- Do not change Supabase session establishment or pending-auth-flow cookie names.
- Do not redesign navigation UI.

## Git workflow

- Branch: `codex/054-move-logout-mutation-to-post`
- Commit style: short imperative subject. Suggested: `Move logout mutation to POST`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Convert logout to an action

Change `src/routes/auth/logout/+page.server.ts` so GET no longer calls
`locals.supabase.auth.signOut()` and no longer deletes the pending auth-flow cookie.

Use a default SvelteKit action for the mutation:

```ts
export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		await locals.supabase.auth.signOut();
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
		redirect(303, '/');
	}
};
```

Keep GET safe. It may render a small sign-out confirmation page, or redirect to `/` without
mutating auth state if that better fits the final UI. If GET redirects, tests must prove it did not
call `signOut` or delete the cookie.

**Verify**:

```bash
rg -n "auth\\.signOut\\(|cookies\\.delete\\(getPendingAuthFlowCookieName" src/routes/auth/logout/+page.server.ts
```

shows those calls only inside the action, not inside `load`.

### Step 2: Replace direct logout links with POST forms

Update every sign-out affordance that currently navigates to `/auth/logout` so it submits a POST to
the logout action instead.

Current direct references:

```bash
rg -n "logout|/auth/logout" src e2e -g "*.{ts,svelte}"
```

Preserve the visible text and icon treatment. In `TopHeader.svelte`, keep the dropdown item looking
like the existing destructive item, but route the actual mutation through a form submit. In the auth
flow pages, a small inline form/button is acceptable as long as it reads naturally in the existing
sentence.

**Verify**:

```bash
rg -n "href=\\\"/auth/logout\\\"|goto\\(resolve\\('/auth/logout'\\)|page\\.goto\\('/auth/logout'\\)" src e2e -g "*.{ts,svelte}"
```

returns no matches.

### Step 3: Add route/action tests

Create `src/routes/auth/logout/page.server.test.ts`, following the direct action-test style used by
`src/routes/auth/forgot-password/page.server.test.ts` and `src/routes/auth/confirm/page.server.test.ts`.

Cover:

- GET/load does not call `locals.supabase.auth.signOut`.
- GET/load does not delete the pending auth-flow cookie.
- POST/default action calls `signOut`.
- POST/default action deletes `getPendingAuthFlowCookieName()` at path `/`.
- POST/default action redirects to `/`.

**Verify**:

```bash
npx vitest run src/routes/auth/logout/page.server.test.ts
```

exits 0.

### Step 4: Update browser coverage

Change the logout E2E in `e2e/specs/z-auth.spec.ts` so it uses a real UI sign-out control or submits
the logout form. Do not use `page.goto('/auth/logout')` as the successful logout path.

**Verify**:

```bash
npx playwright test --config=e2e/playwright.config.ts e2e/specs/z-auth.spec.ts
```

passes locally when the E2E environment is available. If local Supabase or auth fixture setup is
blocked, report the blocker in the final handoff.

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

- New unit/action test for logout GET versus POST behavior.
- Updated E2E logout test that exercises the intentional UI/form path.
- Existing auth route tests remain green.

## Done criteria

- [ ] GET `/auth/logout` does not call `signOut`.
- [ ] Only POST/default action clears Supabase auth and the pending auth-flow cookie.
- [ ] No source UI uses direct `href`/`goto` logout navigation for the mutating path.
- [ ] Targeted unit tests pass.
- [ ] Targeted E2E logout test passes, or the final handoff records the local E2E blocker.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 054 is updated.

## STOP conditions

Stop and report back if:

- SvelteKit route/action constraints make the POST-only design require a different route shape than
  this plan describes.
- A GET-only logout flow is required by a third-party auth callback or production email template.
- The TopHeader dropdown component cannot contain or trigger a form submit without a broader UI
  refactor.
- Local E2E verification would require touching production auth or remote data.

## Maintenance notes

Future auth-state mutations should use POST actions or POST endpoints. GET routes may render a
confirmation or redirect, but they should not mutate Supabase auth state or app auth-flow cookies.
