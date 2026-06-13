# Plan 033: Hide backend error details from deferred app-shell chrome responses

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- src/lib/server/core/useCases/loadAppShell.ts src/lib/server/core/useCases/loadAppShell.test.ts src/lib/server/adapters/supabaseOrgShell.ts "src/routes/org/[orgId]/api/app-shell-chrome/+server.ts"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

The deferred app-shell chrome endpoint catches backend failures and returns `cause.message` to the
browser. Supabase adapter messages include table names, policy failures, and query context. These
details are useful in server logs but should not be exposed to authenticated clients. After this
plan, clients get a stable generic failure reason while server logs keep the detailed cause.

## Current state

- `src/routes/org/[orgId]/api/app-shell-chrome/+server.ts:22` returns the deferred chrome result
  directly as JSON:

```ts
return json(await appShell.loadDeferredChrome(part as DeferredChromePart));
```

- `src/lib/server/core/useCases/loadAppShell.ts:77-83` currently returns raw error messages:

```ts
} catch (cause) {
	console.error(`[app-shell] Failed to load deferred chrome part '${part}':`, cause);
	return {
		part,
		ok: false,
		reason: cause instanceof Error ? cause.message : 'Unknown error'
	};
}
```

- `src/lib/server/adapters/supabaseOrgShell.ts:258-259` throws
  `Failed to load unread notification count: ${notificationError.message}`.
- `src/lib/server/adapters/supabaseOrgShell.ts:366-369` throws
  `Failed to load organization memberships: ${message}`.
- `src/lib/server/core/useCases/loadAppShell.test.ts` already covers successful deferred chrome
  loads and is the right home for the new failure-shaping test.

## Commands you will need

| Purpose       | Command                                                            | Expected on success |
| ------------- | ------------------------------------------------------------------ | ------------------- |
| Focused tests | `npx vitest run src/lib/server/core/useCases/loadAppShell.test.ts` | all pass            |
| Format        | `npm run format`                                                   | exit 0              |
| Lint          | `npm run lint`                                                     | exit 0              |
| Governance    | `npm run governance:check`                                         | exit 0              |
| Typecheck     | `npm run check`                                                    | exit 0              |
| Full tests    | `npm run test`                                                     | exit 0              |

## Scope

**In scope**:

- `src/lib/server/core/useCases/loadAppShell.ts`
- `src/lib/server/core/useCases/loadAppShell.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not change the route response status code. Deferred chrome failures should still return JSON
  with `ok: false`; the UI expects a graceful degraded state.
- Do not rewrite `supabaseOrgShell.ts` error messages; keep detailed server-side causes.
- Do not alter `TopHeader` fetch behavior.

## Git workflow

- Branch: `advisor/033-hide-deferred-chrome-backend-error-details`
- Commit style: short imperative subject. Suggested: `Hide deferred chrome backend error details`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add failure-shaping tests

In `loadAppShell.test.ts`, add tests under `describe('loadAppShellDeferredChrome')`:

- a notification-count port method throws `new Error('relation "notifications" does not exist')`,
- returned result is `{ part: 'notification-count', ok: false, reason: <generic value> }`,
- returned JSON/reason does not contain `notifications`, `relation`, or the original message.

Add the same assertion for `organization-switcher` if the test helper makes it easy.

**Verify**: `npx vitest run src/lib/server/core/useCases/loadAppShell.test.ts` -> the new test
fails before implementation.

### Step 2: Return a generic client reason

In `loadAppShellDeferredChrome`, keep the `console.error` with the detailed `cause`, but change
the returned reason to a stable generic string such as:

```ts
reason: 'Unable to load app shell chrome';
```

Use the same generic reason for all thrown causes.

**Verify**: `npx vitest run src/lib/server/core/useCases/loadAppShell.test.ts` -> exit 0.

### Step 3: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] Deferred chrome failure responses do not include backend/PostgREST messages.
- [ ] Server-side logging still includes the original cause.
- [ ] Success responses for notification count and organization switcher are unchanged.
- [ ] `plans/README.md` status row for 033 is updated.

## STOP conditions

Stop and report back if:

- The client UI depends on specific backend error text for user-visible behavior.
- The deferred chrome contract has moved away from `{ ok: false, reason }`.
- The implementation requires changing adapter query behavior.

## Maintenance notes

This plan complements plan 024's log sanitization work but does not depend on it. It controls what
the client sees, not what the server logs.
