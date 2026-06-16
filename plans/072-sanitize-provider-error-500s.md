# Plan 072: Sanitize provider errors returned from 500 paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat b3acfabb..HEAD -- src/routes/account/profile/+page.server.ts src/routes/account/profile src/lib/server/userProfile.ts src/lib/server/core/useCases/organizationUrlSlug.ts src/lib/server/core/useCases/organizationUrlSlug.test.ts src/lib/server/adapters/supabaseOrgShell.ts src/lib/server/adapters/supabaseOrgShell.test.ts src/routes/api/cleanup-archived-records src/routes/api/cleanup-expired-onboardings src/lib/server/logSanitize.ts plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b3acfabb`, 2026-06-14

## Why this matters

Several 500 paths return raw Supabase/provider error messages to clients. Those
messages can include table names, constraint names, schema details, or provider
diagnostics that are useful in logs but should not be part of user-visible
responses. The repo already has patterns for generic 500s and sanitized logs;
this plan applies that contract to the concrete leak paths from the audit.

## Current state

- `settingsActionFailure.server.ts` already converts 500 action failures to
  `An internal server error occurred`.
- `httpAdapter.rethrowOrWrap()` logs sanitized details and throws
  `Internal server error` for unhandled 500s.
- `src/routes/account/profile/+page.server.ts` returns
  `error.message` from `upsertCurrentUserProfile` failures.
- `resolveOrganizationRouteIdentity` calls `fail(500, error.message)` on
  organization lookup provider errors.
- `supabaseOrgShell` throws `error(500, membershipError.message)` on membership
  query provider errors.
- Cleanup cron routes throw `error(500, orgError.message)` after admin
  organization queries fail.

Current excerpts:

```ts
// src/routes/account/profile/+page.server.ts:30
try {
	await upsertCurrentUserProfile(locals, profile);
} catch (error) {
	return fail(500, { error: error instanceof Error ? error.message : 'Could not save profile' });
}
```

```ts
// src/lib/server/core/useCases/organizationUrlSlug.ts:96
if (error) {
	fail(500, error.message);
}
```

```ts
// src/lib/server/adapters/supabaseOrgShell.ts:203
if (membershipError) {
	throw error(500, membershipError.message);
}
```

```ts
// src/routes/api/cleanup-archived-records/+server.ts:42
const { data: orgs, error: orgError } = await admin.from('organizations').select('id, archive_retention_months');

if (orgError) {
	throw error(500, orgError.message);
}
```

```ts
// src/routes/org/[orgId]/settings/settingsActionFailure.server.ts:7
const data: Record<string, unknown> = {
	[errorKey]: status >= 500 ? 'An internal server error occurred' : error.message
};
```

```ts
// src/lib/server/adapters/httpAdapter.ts:282
console.error('[http-adapter] Unhandled route error:', sanitizeErrorForLog(err));
throw error(500, 'Internal server error');
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Profile tests | `npx vitest run src/lib/server/userProfile.test.ts src/routes/account/profile/page.server.test.ts` | exits 0 if a profile route test is added |
| Slug/org shell tests | `npx vitest run src/lib/server/core/useCases/organizationUrlSlug.test.ts src/lib/server/adapters/supabaseOrgShell.test.ts` | exits 0 |
| Cleanup route tests | `npx vitest run src/routes/api/cleanup-archived-records/server.test.ts src/routes/api/cleanup-expired-onboardings/server.test.ts` | exits 0 |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/routes/account/profile/+page.server.ts`
- A new `src/routes/account/profile/page.server.test.ts` if needed
- `src/lib/server/userProfile.ts` and `src/lib/server/userProfile.test.ts`
  only if moving provider-error mapping out of the route is cleaner
- `src/lib/server/core/useCases/organizationUrlSlug.ts`
- `src/lib/server/core/useCases/organizationUrlSlug.test.ts`
- `src/lib/server/adapters/supabaseOrgShell.ts`
- `src/lib/server/adapters/supabaseOrgShell.test.ts`
- `src/routes/api/cleanup-archived-records/+server.ts`
- `src/routes/api/cleanup-archived-records/server.test.ts`
- `src/routes/api/cleanup-expired-onboardings/+server.ts`
- `src/routes/api/cleanup-expired-onboardings/server.test.ts`
- A tiny shared helper under `src/lib/server/` only if it keeps the generic
  500 message consistent.
- `plans/README.md` status row only

**Out of scope**:

- Do not sanitize 400 validation messages; users still need useful form errors.
- Do not change provider logging except to ensure logged details are sanitized
  with `sanitizeErrorForLog`.
- Do not broadly rewrite every `error.message` occurrence in the repo.
- Do not change auth/MFA route response contracts in this plan.
- Do not add migrations or touch databases.

## Git workflow

- Branch: `codex/072-sanitize-provider-error-500s`
- Commit style: short imperative subject. Suggested:
  `Sanitize provider error responses`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add or reuse a generic 500 response helper

Prefer the existing messages:

- actions: `An internal server error occurred`
- request/load errors: `Internal server error`

If a helper improves consistency, keep it tiny and server-only, for example:

- `logAndReturnInternalActionFailure(errorKey, err, logPrefix)`
- `logAndThrowInternalServerError(err, logPrefix)`

Use `sanitizeErrorForLog(err)` for logs. Never include raw provider messages in
the returned 500 payload.

**Verify**:
`npx vitest run src/lib/server/logSanitize.test.ts` still exits 0 if the helper
touches logging utilities.

### Step 2: Sanitize profile save failures

Update `src/routes/account/profile/+page.server.ts` so provider failures from
`upsertCurrentUserProfile` return a generic 500 action failure. Add a route
test if none exists.

Test case:

- mock/stub profile persistence to throw
  `new Error('relation "user_profiles" does not exist provider_secret')`,
- action response has status 500,
- user-visible error is generic,
- raw text such as `user_profiles` or `provider_secret` does not appear in the
  returned data.

Keep validation failures from `parseUserProfileForm` unchanged.

**Verify**:
profile targeted tests exit 0.

### Step 3: Sanitize organization route identity failures

Update `resolveOrganizationRouteIdentity` so provider query errors are logged
with sanitized details and converted to a generic 500. Preserve existing 404
behavior for missing organizations and existing duplicate slug validation
helpers.

Update `organizationUrlSlug.test.ts` with a provider-error case that currently
would expose `error.message`.

**Verify**:
`npx vitest run src/lib/server/core/useCases/organizationUrlSlug.test.ts`
exits 0.

### Step 4: Sanitize org shell membership query failures

Update `src/lib/server/adapters/supabaseOrgShell.ts` so membership query
provider errors throw a generic 500 while logging sanitized details. Preserve
the existing 403 message for non-members.

Update the existing test currently expecting `table not found` so it expects
the generic message instead.

**Verify**:
`npx vitest run src/lib/server/adapters/supabaseOrgShell.test.ts` exits 0.

### Step 5: Sanitize cleanup cron organization-query failures

For both cleanup routes, sanitize failures from the initial admin
`organizations` query:

- `src/routes/api/cleanup-archived-records/+server.ts`
- `src/routes/api/cleanup-expired-onboardings/+server.ts`

Add tests that exercise the exported route or a small extracted helper with a
fake admin query error. The returned/thrown 500 should be generic and must not
contain raw table/provider text.

Preserve existing bearer-secret failure behavior and the core cleanup tests.

**Verify**:
`npx vitest run src/routes/api/cleanup-archived-records/server.test.ts src/routes/api/cleanup-expired-onboardings/server.test.ts`
exits 0.

### Step 6: Run the full gate

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

- Profile action provider failure returns generic 500.
- Organization slug lookup provider failure returns generic 500.
- Org shell membership provider failure returns generic 500 while non-member
  403 remains specific.
- Cleanup route admin-query failures return generic 500 while auth failures are
  unchanged.
- Full repo gate.

## Done criteria

- [ ] The concrete raw provider 500 paths in this plan no longer return raw
      provider messages.
- [ ] New/updated tests assert raw provider details are not present in returned
      500 payloads.
- [ ] 400 validation and 403 authorization messages remain useful and
      unchanged.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 072 is updated.

## STOP conditions

Stop and report back if:

- A caller or existing test depends on exact raw provider text in a 500
  response for user-facing behavior.
- You find a broader shared action-failure pattern that would require touching
  many routes outside this plan.
- Sanitized logging would drop all operational context needed to debug the
  provider error.

## Maintenance notes

Reviewers should look for accidental `error.message` exposure only on 500s.
Provider adapters may still keep raw messages internally or in typed
`provider_error` results, but route/page responses should convert those to
generic failures unless the status is a deliberate user-correctable 4xx.
