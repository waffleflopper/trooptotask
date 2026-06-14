# Plan 067: Consolidate account setup route orchestration

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/routes/auth/setup-account/+page.server.ts src/routes/auth/setup-account/page.server.test.ts src/routes/auth/renew-invite/+page.server.ts src/routes/auth/renew-invite/page.server.test.ts src/routes/api/access-requests/+server.ts src/routes/api/access-requests/server.test.ts src/lib/server/accountSetupCompletion.ts src/lib/server/accountSetupLinks.ts src/lib/server/accessRequestSetupDelivery.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

Account Setup Links have solid domain services, but the public SvelteKit routes
still own a lot of orchestration: token/session page state, provider factory
construction, rate-limit audit behavior, completion outcome mapping, cookie
clearing, and setup-link delivery construction. That spreads one account setup
workflow across routes. Consolidating route-ready orchestration makes the public
auth boundary easier to test and keeps Supabase provider details at the adapter
edge.

## Current state

- `setup-account/+page.server.ts` constructs the setup store/service in `load`.
- The same route validates token/session/access-request/setup-link state.
- The default action constructs admin/auth adapters and maps completion outcomes
  to audits, cookie clears, failures, and redirects.
- `renew-invite/+page.server.ts` directly constructs the Supabase setup-delivery
  service.
- `api/access-requests/+server.ts` directly constructs the same delivery
  service.
- `accountSetupCompletion.ts`, `accountSetupLinks.ts`, and
  `accessRequestSetupDelivery.ts` already contain reusable domain services.

Current excerpts:

```ts
// src/routes/auth/setup-account/+page.server.ts:149
const store = createSupabaseAccountSetupCompletionStore(getAdminClient());
const setupLinks = createAccountSetupLinkService(store);
```

```ts
// src/routes/auth/setup-account/+page.server.ts:197
const setupSession = readAccountSetupSessionCookie(cookies);
if (!setupSession) {
	return {
		state: 'missing' as const,
```

```ts
// src/routes/auth/setup-account/+page.server.ts:275
const adminClient = getAdminClient();
const store = createSupabaseAccountSetupCompletionStore(adminClient);
```

```ts
// src/routes/auth/setup-account/+page.server.ts:307
const auth = createSupabaseAccountSetupAuthAdapter(adminClient, getSupabaseClient(locals));
const completion = await createAccountSetupCompletionService(store, auth).completeSetupSession({
```

```ts
// src/routes/auth/renew-invite/+page.server.ts:64
const renewal = await createSupabaseAccessRequestSetupDeliveryService(getAdminClient()).requestFreshSetupLink({
```

```ts
// src/routes/api/access-requests/+server.ts:69
const adminClient = getAdminClient();
const service = createSupabaseAccessRequestSetupDeliveryService(adminClient);
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Setup-account route tests | `npx vitest run src/routes/auth/setup-account/page.server.test.ts` | exits 0 |
| Access request route tests | `npx vitest run src/routes/auth/renew-invite/page.server.test.ts src/routes/api/access-requests/server.test.ts` | exits 0 |
| Account setup service tests | `npx vitest run src/lib/server/accountSetupCompletion.test.ts src/lib/server/accountSetupLinks.test.ts src/lib/server/accessRequestSetupDelivery.test.ts` | exits 0 |
| Route provider grep | `rg -n "getAdminClient|createSupabaseAccountSetupCompletionStore|createSupabaseAccountSetupAuthAdapter|createSupabaseAccessRequestSetupDeliveryService|createAccountSetupCompletionService|createAccountSetupLinkService" src/routes/auth/setup-account/+page.server.ts src/routes/auth/renew-invite/+page.server.ts src/routes/api/access-requests/+server.ts` | no provider construction matches |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/routes/auth/setup-account/+page.server.ts`
- `src/routes/auth/setup-account/page.server.test.ts`
- `src/routes/auth/renew-invite/+page.server.ts`
- `src/routes/auth/renew-invite/page.server.test.ts`
- `src/routes/api/access-requests/+server.ts`
- `src/routes/api/access-requests/server.test.ts`
- New route orchestration module under `src/lib/server/`, for example
  `accountSetupRouteFlow.ts`
- `src/lib/server/accountSetupCompletion.ts`, `accountSetupLinks.ts`, and
  `accessRequestSetupDelivery.ts` only for exported types or small helpers
- `plans/README.md` status row only

**Out of scope**:

- Do not change Account Setup Link token format, expiry, or RPC contracts.
- Do not change access request approval semantics.
- Do not replace Supabase Auth or email delivery behavior.
- Do not add migrations.
- Do not batch this with plan 055 Auth email scan replacement.

## Git workflow

- Branch: `codex/067-consolidate-account-setup-route-orchestration`
- Commit style: short imperative subject. Suggested: `Consolidate account setup route flow`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create route-ready account setup flow contracts

Create a module such as `src/lib/server/accountSetupRouteFlow.ts` that owns
route-ready decisions but not SvelteKit cookie/redirect primitives.

Suggested result shape for load:

```ts
export type AccountSetupLoadResult =
	| { state: 'redirect-authenticated'; path: string }
	| { state: 'redirect-setup'; session: AccountSetupSession }
	| { state: AccountSetupPageState; message: string; clearSession?: true }
	| { state: 'valid'; email: string };
```

The route should still apply cookies and `redirect(...)`, but the flow module
should decide when those effects are required.

**Verify**:
Add focused tests for the new flow module or move route tests down until
`npx vitest run src/routes/auth/setup-account/page.server.test.ts` passes.

### Step 2: Move setup-account load state decisions

Move token/session/access-request/setup-link validation from
`setup-account/+page.server.ts` into the flow module. Preserve every existing
state and message:

- invalid/missing/expired/revoked/replaced/used/claimed/failed links,
- access request missing, completed, or not approved,
- valid session returning email,
- authenticated users redirecting to the existing authenticated path.

The route should read cookies/search params, call the flow, apply clear/set
cookie effects, and redirect or return data.

**Verify**:
`npx vitest run src/routes/auth/setup-account/page.server.test.ts` exits 0.

### Step 3: Move completion outcome mapping

Move the default action's completion orchestration into the flow module:

- password validation can stay in the route or move into the flow, but keep
  existing messages,
- rate-limit check and audit payload mapping should be tested in one place,
- completion outcomes should map to the same fail statuses/messages,
- cookie clearing decisions should be returned as effects for the route to
  apply,
- successful completion should still redirect to `/dashboard`.

Keep Supabase Auth provider calls behind injected ports or an adapter factory,
not inside the route.

**Verify**:
`npx vitest run src/routes/auth/setup-account/page.server.test.ts src/lib/server/accountSetupCompletion.test.ts`
exits 0.

### Step 4: Centralize public setup-delivery service construction

Add a server-only factory/helper for public access-request setup delivery so
`renew-invite` and `api/access-requests` no longer call
`createSupabaseAccessRequestSetupDeliveryService(getAdminClient())` directly.

The helper can live beside `accessRequestSetupDelivery.ts` or in the new route
flow module, but it must be the only place that combines `getAdminClient()` with
the Supabase delivery service.

Update both routes and their tests to mock the helper.

**Verify**:
`npx vitest run src/routes/auth/renew-invite/page.server.test.ts src/routes/api/access-requests/server.test.ts`
exits 0.

### Step 5: Keep routes thin and run the full gate

After the refactor, the three public routes should still parse HTTP inputs and
apply SvelteKit effects, but they should not construct Supabase account-setup
stores/auth adapters/delivery services directly.

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

- Flow tests or route tests cover load token/session states.
- Flow tests or route tests cover completion outcomes and audit decisions.
- Renew-invite and access-request route tests cover delivery helper mapping.
- Existing domain service tests remain green.
- Full repo gate.

## Done criteria

- [ ] Setup-account route no longer owns token/session state-machine details.
- [ ] Public setup-delivery provider construction is centralized outside routes.
- [ ] Existing status messages, fail statuses, redirects, and cookie behavior are
      unchanged.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 067 is updated.

## STOP conditions

Stop and report back if:

- The route flow abstraction starts duplicating domain service logic instead of
  orchestrating it.
- Cookie or redirect effects cannot be represented clearly without hiding
  SvelteKit behavior in a server utility.
- Plan 055 has already changed the same Auth/account-setup provider seams in
  this worktree.
- Tests reveal current account setup behavior is ambiguous and needs product
  direction.

## Maintenance notes

Keep provider-specific account setup construction in server adapter/factory
modules. Future public auth routes should call route-ready flow functions rather
than assembling Supabase providers inline.

