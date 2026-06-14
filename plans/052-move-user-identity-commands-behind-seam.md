# Plan 052: Move user identity commands behind seam

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/routes/admin/users/[userId]/+page.server.ts src/routes/admin/users/[userId]/page.server.test.ts src/lib/server/core/useCases/platformUserIdentityCommands.ts src/lib/server/core/useCases/platformUserIdentityCommands.test.ts src/lib/server/adapters/supabasePlatformUserIdentityCommands.ts src/lib/server/adapters/supabasePlatformUserIdentityCommands.test.ts src/lib/server/adapters/inMemoryPlatformUserIdentityCommands.ts src/lib/server/core/useCases/platformUserDirectory.ts src/lib/server/adapters/supabasePlatformUserDirectory.ts docs/architecture/DRIFT_LEDGER.md docs/architecture/adrs/0011-platform-administration-boundary.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: MED
- **Depends on**: none
- **Category**: architecture
- **Planned at**: commit `9a1e439b`, 2026-06-13 AKDT

## Why this matters

The platform admin user detail load already uses `PlatformUserDirectory` for auth-user detail,
memberships, suspensions, and active personnel counts. The form actions still call Supabase Auth
admin APIs directly from the route to send password reset and invite emails. ADR 0011 explicitly
allows raw `auth.admin.*` identity/email calls to remain as auth-provider edges, but says they
belong inside Platform Administration adapters, not in route handlers. After this plan, the route
should validate input, call a `PlatformUserIdentityCommands` seam, and map the result.

## Current state

- `src/routes/admin/users/[userId]/+page.server.ts:15-19` already loads user detail and recent
  activity through `PlatformUserDirectory` and `PlatformAudit`.
- `src/routes/admin/users/[userId]/+page.server.ts:31-57` performs password reset by calling
  `adminClient.auth.admin.getUserById`, `adminClient.auth.resetPasswordForEmail`, and `ctx.audit`
  directly in the route.
- `src/routes/admin/users/[userId]/+page.server.ts:63-89` performs invite resend by calling
  `adminClient.auth.admin.getUserById`, `adminClient.auth.admin.inviteUserByEmail`, and `ctx.audit`
  directly in the route.
- `src/routes/admin/users/[userId]/page.server.test.ts:183-272` tests direct auth-provider calls at
  the route boundary.
- `src/lib/server/adapters/supabasePlatformUserDirectory.ts:156-165` already wraps
  `auth.admin.getUserById` for detail reads.
- ADR 0011 says Platform Administration user-directory row shaping belongs behind a store port, and
  raw `auth.admin.*` identity/email calls may stay inside that adapter as acknowledged
  auth-provider edges under ADR 0004.

## Commands you will need

| Purpose                    | Command                                                                                                                                   | Expected on success |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Install, if needed         | `npm ci`                                                                                                                                  | exit 0              |
| Focused route test         | `npx vitest run src/routes/admin/users/[userId]/page.server.test.ts`                                                                      | all pass            |
| Focused use-case tests     | `npx vitest run src/lib/server/core/useCases/platformUserIdentityCommands.test.ts src/lib/server/adapters/supabasePlatformUserIdentityCommands.test.ts` | all pass            |
| Provider-command grep      | `rg -n -e 'auth\\.admin' -e 'getUserById' -e 'resetPasswordForEmail' -e 'inviteUserByEmail' src/routes/admin/users/[userId]/+page.server.ts` | no matches          |
| Format                     | `npm run format`                                                                                                                          | exit 0              |
| Lint                       | `npm run lint`                                                                                                                            | exit 0              |
| Governance                 | `npm run governance:check`                                                                                                                 | exit 0              |
| Typecheck                  | `npm run check`                                                                                                                           | exit 0              |
| Full tests                 | `npm run test`                                                                                                                            | exit 0              |

## Scope

**In scope**:

- New `src/lib/server/core/useCases/platformUserIdentityCommands.ts`
- New `src/lib/server/core/useCases/platformUserIdentityCommands.test.ts`
- New `src/lib/server/adapters/supabasePlatformUserIdentityCommands.ts`
- New `src/lib/server/adapters/supabasePlatformUserIdentityCommands.test.ts`
- Optional `src/lib/server/adapters/inMemoryPlatformUserIdentityCommands.ts`
- `src/routes/admin/users/[userId]/+page.server.ts`
- `src/routes/admin/users/[userId]/page.server.test.ts`
- `docs/architecture/DRIFT_LEDGER.md`
- `plans/README.md` status row only

**Out of scope**:

- Do not redesign `PlatformUserDirectory` list/detail pagination or row shaping.
- Do not change the user detail Svelte UI.
- Do not change account setup, access request, invite acceptance, or password reset acceptance flows.
- Do not hide or remove current audit events.
- Do not change public-origin behavior for admin-triggered invite/recovery emails.
- Do not add or change database migrations.

## Git workflow

- Branch: `codex/052-move-user-identity-commands-behind-seam`
- Commit style: short imperative subject. Suggested: `Move user identity commands behind platform seam`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define PlatformUserIdentityCommands

Create `src/lib/server/core/useCases/platformUserIdentityCommands.ts`.

Use a command-focused API instead of adding more responsibility to the list/detail directory
surface. Suggested shape:

```ts
export type PlatformUserIdentityCommandResult =
	| { status: 'sent'; email: string; message: string }
	| { status: 'not_found' }
	| { status: 'provider_error'; message: string };

export interface PlatformUserIdentityCommands {
	sendPasswordReset(input: { userId: string; inboundOrigin: string }): Promise<PlatformUserIdentityCommandResult>;
	resendInvite(input: { userId: string; inboundOrigin: string }): Promise<PlatformUserIdentityCommandResult>;
}
```

The core use case should own:

- looking up the target User Account email through a store port,
- deriving app-owned redirect URLs with `getAuthConfirmRedirectTo`,
- calling the command store to send the provider email,
- emitting the existing audit events only after the provider command succeeds.

Store port shape can be:

```ts
export interface PlatformUserIdentityCommandStore {
	getUserEmailById(userId: string): Promise<{ status: 'found'; email: string } | { status: 'not_found' } | { status: 'provider_error'; message: string }>;
	sendPasswordResetEmail(input: { email: string; redirectTo: string }): Promise<{ ok: true } | { ok: false; message: string }>;
	sendInviteEmail(input: { email: string; redirectTo: string }): Promise<{ ok: true } | { ok: false; message: string }>;
}
```

Preserve current behavior:

- missing user or missing email -> route returns `fail(404, { error: 'User not found' })`,
- password reset provider failure -> route returns `fail(500, { error: 'Failed to send password reset' })`,
- invite provider failure -> route returns `fail(500, { error: 'Failed to resend invite' })`,
- password reset success -> `{ success: true, message: 'Password reset email sent' }`,
- invite success -> `{ success: true, message: 'Invite email resent' }`,
- audit actions remain `admin.user.password_reset` and `admin.user.resend_invite`,
- audit details continue to include `{ targetEmail }`,
- password reset severity remains `warning`,
- invite resend severity remains `info`.

**Verify**:
`npx vitest run src/lib/server/core/useCases/platformUserIdentityCommands.test.ts` fails before the
implementation and passes after it.

### Step 2: Keep Supabase Auth calls in the adapter

Create `src/lib/server/adapters/supabasePlatformUserIdentityCommands.ts`.

The adapter is the only new place that should call:

- `ctx.adminClient.auth.admin.getUserById`,
- `ctx.adminClient.auth.resetPasswordForEmail`,
- `ctx.adminClient.auth.admin.inviteUserByEmail`.

Map provider errors into the command result contract. Log provider errors server-side, but do not
return raw provider details to the route.

Suggested factory:

```ts
export function createSupabasePlatformUserIdentityCommands(ctx: AdminContext): PlatformUserIdentityCommands {
	return createPlatformUserIdentityCommands({
		store: createSupabasePlatformUserIdentityCommandStore(ctx.adminClient),
		audit: { log: (event) => ctx.audit(event) }
	});
}
```

It is acceptable to reuse small mapper helpers from `supabasePlatformUserDirectory` if they are
already exported. If sharing would force a broad directory interface or a circular import, keep a
small local mapper in the command adapter.

**Verify**:
`npx vitest run src/lib/server/adapters/supabasePlatformUserIdentityCommands.test.ts` exits 0.

### Step 3: Add focused command tests

Core use-case tests should prove:

- password reset derives the same recovery redirect as the current route behavior,
- invite resend derives the same invite redirect as the current route behavior,
- `APP_PUBLIC_ORIGIN` is honored through `getAuthConfirmRedirectTo`,
- audit is emitted after successful provider send,
- audit is not emitted on not-found or provider failure,
- provider failures return sanitized command results.

Adapter tests should prove:

- `getUserEmailById` maps success, missing users, missing email, and provider errors,
- password reset calls `resetPasswordForEmail(email, { redirectTo })`,
- invite resend calls `auth.admin.inviteUserByEmail(email, { redirectTo })`,
- provider send errors are mapped without leaking raw objects.

Use `src/routes/admin/users/[userId]/page.server.test.ts` and
`src/lib/server/adapters/supabasePlatformUserDirectory.test.ts` as style references.

### Step 4: Thin the user detail route actions

Update `src/routes/admin/users/[userId]/+page.server.ts` so both actions:

- validate the UUID,
- call `createSupabasePlatformUserIdentityCommands(ctx)`,
- pass `{ userId, inboundOrigin: event.url.origin }`,
- map command results to the same route responses as today.

The route should no longer:

- destructure `adminClient` for these actions,
- call `auth.admin.getUserById`,
- call `resetPasswordForEmail`,
- call `inviteUserByEmail`,
- assemble identity-command audit payloads.

The route may continue to import and use `PlatformUserDirectory` and `PlatformAudit` for the load.

**Verify**:
`rg -n -e 'auth\\.admin' -e 'getUserById' -e 'resetPasswordForEmail' -e 'inviteUserByEmail' src/routes/admin/users/[userId]/+page.server.ts`
returns no matches.

### Step 5: Update route tests around the command seam

Update `src/routes/admin/users/[userId]/page.server.test.ts` to mock
`createSupabasePlatformUserIdentityCommands`.

Route tests should assert:

- malformed UUIDs do not call the command seam,
- password reset calls `sendPasswordReset({ userId, inboundOrigin })`,
- invite resend calls `resendInvite({ userId, inboundOrigin })`,
- not-found maps to 404,
- provider failure maps to the current 500 messages,
- success mapping remains unchanged,
- a strict `adminClient.auth` mock that throws is safe because the route does not touch auth
  provider commands directly.

Move the `APP_PUBLIC_ORIGIN` redirect assertion from the route test into the new core use-case test,
because redirect construction should now live in the command module.

**Verify**:
`npx vitest run src/routes/admin/users/[userId]/page.server.test.ts` exits 0.

### Step 6: Update drift documentation

Update `docs/architecture/DRIFT_LEDGER.md` under D-02 so the current-state truth says Platform
Administration user identity email commands now route through `PlatformUserIdentityCommands` and
the Supabase adapter instead of route-local Supabase Auth calls.

Do not mark D-02 resolved. This plan removes one cluster only.

**Verify**:
`npm run governance:check` exits 0.

### Step 7: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Use-case tests own command result mapping, redirect derivation, and audit timing.
- Supabase adapter tests own auth-provider calls.
- Route tests own UUID validation and result-to-form-response mapping.
- Existing user detail load tests continue to guard `PlatformUserDirectory` and `PlatformAudit`.
- Full repo gate.

## Done criteria

- [ ] `PlatformUserIdentityCommands` exists as a command-focused seam.
- [ ] Supabase Auth identity/email command calls live in the adapter, not the route.
- [ ] Password reset and invite resend responses are unchanged.
- [ ] App public-origin redirect behavior is preserved.
- [ ] Audit events are emitted only after successful provider sends.
- [ ] The provider-command grep in "Commands you will need" returns no matches.
- [ ] D-02 drift documentation mentions the retired route-local identity command calls without claiming all provider drift is gone.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 052 is updated.

## STOP conditions

Stop and report back if:

- The command module starts changing access-request setup links, invite acceptance, or recovery
  acceptance flows.
- Preserving public-origin redirect behavior requires route-local provider command calls.
- Supabase Auth returns error shapes that cannot be safely mapped without leaking provider details.
- A database migration appears necessary.

## Maintenance notes

Keep User Account identity commands distinct from user-directory read shaping. Raw auth-provider
calls are acceptable at this boundary, but only inside the adapter that implements the app-owned
command contract.
