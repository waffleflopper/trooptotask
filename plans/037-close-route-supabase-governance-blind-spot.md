# Plan 037: Close the route Supabase governance blind spot

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- scripts/check-governance.mjs docs/architecture/GOVERNANCE_CHECKS.md docs/architecture/GOVERNANCE_BASELINE.json src/routes/api/announcements/dismiss/+server.ts src/lib/server/adapters/supabaseOrgShell.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

The governance script checks route-level Supabase leaks by searching for the literal string
`locals.supabase`. A route can bypass the guardrail by destructuring `supabase` from `locals` and
using `supabase.from(...)`. The announcements dismiss endpoint does exactly that. After this plan,
the scanner catches destructured/aliased route clients and the current route-level write is moved
behind an adapter seam.

## Current state

- `scripts/check-governance.mjs:128-132`:

```js
function checkRouteSupabaseAllowlist() {
	const routeFiles = walkRelative('src/routes').filter(
		(filePath) => filePath.endsWith('.server.ts') || filePath.endsWith('/+server.ts')
	);
	const actualUsages = routeFiles.filter((filePath) => readRelativeFile(filePath).includes('locals.supabase'));
```

- `src/routes/api/announcements/dismiss/+server.ts:5-16`:

```ts
export const POST: RequestHandler = async ({ locals, request }) => {
	const { user, supabase } = locals;
	if (!user) throw error(401, 'Not authenticated');
	// ...
	await supabase.from('announcement_dismissals').upsert({ announcement_id: announcementId, user_id: user.id });
	return json({ success: true });
};
```

- `src/lib/server/adapters/supabaseOrgShell.ts:274-286` already owns announcement and dismissal
  reads for the app shell, so announcements are already adapter-shaped in one direction.
- `docs/architecture/GOVERNANCE_CHECKS.md` documents the route-level `locals.supabase` guardrail.

## Commands you will need

| Purpose             | Command                                               | Expected on success                   |
| ------------------- | ----------------------------------------------------- | ------------------------------------- |
| Governance          | `npm run governance:check`                            | exit 0                                |
| Focused route tests | `npx vitest run src/routes/api/announcements/dismiss` | all pass, if tests exist or are added |
| Format              | `npm run format`                                      | exit 0                                |
| Lint                | `npm run lint`                                        | exit 0                                |
| Typecheck           | `npm run check`                                       | exit 0                                |
| Full tests          | `npm run test`                                        | exit 0                                |

## Scope

**In scope**:

- `scripts/check-governance.mjs`
- `docs/architecture/GOVERNANCE_CHECKS.md`
- `src/routes/api/announcements/dismiss/+server.ts`
- A new or existing adapter/use-case module for announcement dismissal
- Focused tests if a route/adapter test pattern exists
- `plans/README.md` status row only

**Out of scope**:

- Do not broaden `GOVERNANCE_BASELINE.json` to bless this route leak.
- Do not refactor all announcement loading.
- Do not turn the governance script into a full AST linter; targeted string/regex detection is fine.

## Git workflow

- Branch: `advisor/037-close-route-supabase-governance-blind-spot`
- Commit style: short imperative subject. Suggested: `Catch destructured route Supabase usage`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move announcement dismissal behind an adapter seam

Create a small adapter such as `src/lib/server/adapters/supabaseAnnouncementDismissals.ts` with a
function that accepts `locals` or the user Supabase client and performs the upsert. The route should
no longer destructure or directly call `supabase.from(...)`.

Target route shape:

```ts
const { user } = locals;
// validate user and announcementId
await createSupabaseAnnouncementDismissals(locals).dismiss(user.id, announcementId);
```

Keep response shape `{ success: true }`.

**Verify**: `rg -n "const \\{ user, supabase \\}|supabase\\.from\\(" src/routes/api/announcements/dismiss/+server.ts` -> no matches.

### Step 2: Extend the governance scanner

Update `checkRouteSupabaseAllowlist()` so it catches at least:

- literal `locals.supabase`,
- destructuring from locals: `const { ..., supabase, ... } = locals`,
- route-local `supabase.from(`, `supabase.rpc(`, `supabase.auth`, or `supabase.storage` usage when the same file pulls `supabase` from route locals.

Keep allowlist behavior for existing baseline entries. If an allowlisted file no longer contains
any route-level Supabase usage under the broadened detector, report it stale as today.

**Verify**: `npm run governance:check` -> exit 0.

### Step 3: Update governance docs

In `docs/architecture/GOVERNANCE_CHECKS.md`, update "What It Checks Today" so it says the route
provider leak check catches direct and destructured/aliased Supabase clients in routes.

**Verify**: `npm run governance:check` -> exit 0.

### Step 4: Add focused tests if practical

If there is no existing test harness for `scripts/check-governance.mjs`, do not build a large one.
Instead, add a route/adapter test for announcement dismissal if there is a nearby pattern. At
minimum, rely on `npm run governance:check` plus the `rg` checks in Done criteria.

**Verify**: focused tests pass if added.

### Step 5: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] `src/routes/api/announcements/dismiss/+server.ts` no longer directly uses a Supabase client.
- [ ] `scripts/check-governance.mjs` detects destructured route Supabase usage.
- [ ] `npm run governance:check` exits 0.
- [ ] Governance docs mention the broadened detector.
- [ ] `plans/README.md` status row for 037 is updated.

## STOP conditions

Stop and report back if:

- The scanner starts flagging many false positives in non-route files.
- Fixing the announcements route requires an org-shell redesign.
- A broad AST parser dependency seems necessary; that is out of scope for this small guardrail.

## Maintenance notes

This governance check remains intentionally narrow. It should catch the current bypass pattern and
nearby variants, not become a complete architecture validator.
