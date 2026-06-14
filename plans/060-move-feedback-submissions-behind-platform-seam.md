# Plan 060: Move feedback submissions behind the platform feedback seam

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/routes/api/feedback/+server.ts src/routes/api/feedback/server.test.ts src/lib/server/core/useCases/platformFeedback.ts src/lib/server/core/useCases/platformFeedback.test.ts src/lib/server/adapters/supabasePlatformFeedback.ts src/lib/server/adapters/inMemoryPlatformFeedback.ts src/routes/admin/feedback/+page.server.ts src/routes/admin/feedback/page.server.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

The admin feedback page already reads and updates beta feedback through
`PlatformFeedback`, but public feedback submission still performs membership
lookup, GitHub issue mirroring, `beta_feedback` persistence, and request
mapping inside the API route. That leaves the beta feedback workflow tied to
HTTP and provider details. After this plan, the route should only authenticate,
parse, and delegate; submission policy and provider wiring should live behind
the same platform feedback seam as admin review.

## Current state

- `src/routes/api/feedback/+server.ts` owns server-side organization-context
  resolution with an admin client.
- The same route owns GitHub issue body construction and `fetch()` to the
  GitHub API.
- The same route inserts directly into `beta_feedback`.
- `src/lib/server/core/useCases/platformFeedback.ts` currently exposes only
  `list()` and `update()`.
- `src/lib/server/adapters/supabasePlatformFeedback.ts` maps only list/update
  store operations.

Current excerpts:

```ts
// src/routes/api/feedback/+server.ts:96
async function resolveFeedbackOrganizationContext(
	adminClient: ReturnType<typeof getAdminClient>,
```

```ts
// src/routes/api/feedback/+server.ts:141
async function createGitHubIssue(params: {
	category: string;
	message: string;
```

```ts
// src/routes/api/feedback/+server.ts:217
const adminClient = getAdminClient();
const organizationContext = await resolveFeedbackOrganizationContext(adminClient, user.id, organizationId, pageUrl);
```

```ts
// src/routes/api/feedback/+server.ts:232
const { error: insertError } = await adminClient.from('beta_feedback').insert({
```

```ts
// src/lib/server/core/useCases/platformFeedback.ts:36
export interface PlatformFeedback {
	list(): Promise<PlatformFeedbackItem[]>;
	update(input: PlatformFeedbackUpdateInput): Promise<PlatformFeedbackUpdateResult>;
}
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `npx vitest run src/routes/api/feedback/server.test.ts` | exits 0 |
| Use-case tests | `npx vitest run src/lib/server/core/useCases/platformFeedback.test.ts` | exits 0 |
| Admin feedback tests | `npx vitest run src/routes/admin/feedback/page.server.test.ts` | exits 0 |
| Provider-leak grep | `rg -n "getAdminClient\|beta_feedback\|api.github.com\|GITHUB_FEEDBACK_TOKEN\|createGitHubIssue\|resolveFeedbackOrganizationContext" src/routes/api/feedback/+server.ts` | no matches |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/lib/server/core/useCases/platformFeedback.ts`
- `src/lib/server/core/useCases/platformFeedback.test.ts`
- `src/lib/server/adapters/supabasePlatformFeedback.ts`
- `src/lib/server/adapters/inMemoryPlatformFeedback.ts`
- `src/routes/api/feedback/+server.ts`
- `src/routes/api/feedback/server.test.ts`
- `src/routes/admin/feedback/+page.server.ts` only if type names change
- `src/routes/admin/feedback/page.server.test.ts` only if type names change
- `plans/README.md` status row only

**Out of scope**:

- Do not remove the temporary GitHub beta feedback mirror in this plan.
- Do not change the public response shape: keep `{ success: true, githubIssue:
  string | null }`.
- Do not change feedback categories, labels, or the `beta_feedback` table.
- Do not add privacy-copy hardening. That was intentionally excluded from the
  earlier privacy plan.
- Do not add migrations.

## Git workflow

- Branch: `codex/060-move-feedback-submissions-behind-platform-seam`
- Commit style: short imperative subject. Suggested: `Move feedback submissions behind platform seam`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a submission contract to PlatformFeedback

Extend `src/lib/server/core/useCases/platformFeedback.ts` with types for:

- `PlatformFeedbackSubmissionInput`: user id, optional user email, category,
  message, page URL, and optional organization id,
- `PlatformFeedbackOrganizationContextStore`: resolves whether the submitting
  user belongs to the requested organization and returns org name/url slug,
- `PlatformFeedbackSubmissionStore`: inserts the `beta_feedback` row,
- `PlatformFeedbackMirror`: optional mirror that returns issue number/url or
  `null`,
- `submit(input)` on `PlatformFeedback`.

Move these route-local behaviors into the use case:

- category validation,
- message trimming and empty-message rejection,
- page URL normalization,
- organization access denial,
- non-blocking mirror result semantics,
- success when the mirror succeeds but DB insert fails, preserving existing
  behavior.

Use explicit result types rather than throwing for expected 400/403/500 route
responses.

**Verify**:
`npx vitest run src/lib/server/core/useCases/platformFeedback.test.ts` fails
until submission tests are implemented, then passes.

### Step 2: Move Supabase and GitHub wiring to adapters

In `src/lib/server/adapters/supabasePlatformFeedback.ts`, implement the new
ports:

- membership lookup against `organization_memberships`,
- insert into `beta_feedback`,
- GitHub mirror using `env.GITHUB_FEEDBACK_TOKEN` and `fetch()`.

Provider details belong here, not in `src/routes/api/feedback/+server.ts`.
Keep the warning when the GitHub token is not configured, and keep mirror
failures non-blocking.

If `fetch` mocking becomes awkward in adapter tests, inject a `fetcher` option
into the mirror adapter instead of reaching back into the route.

**Verify**:
`npx vitest run src/lib/server/core/useCases/platformFeedback.test.ts` exits 0.

### Step 3: Update the public feedback route

Replace route-local helpers in `src/routes/api/feedback/+server.ts` with a thin
handler:

- require `locals.user`,
- parse `request.json()`,
- pass user id/email and raw body fields to `createSupabasePlatformFeedback(...).submit(...)`,
- map expected result statuses to SvelteKit `error(...)` or `json(...)`.

The route should not import `getAdminClient`, `$env/dynamic/private`, or know
about `beta_feedback` or GitHub API details.

If `createSupabasePlatformFeedback` currently requires `AdminContext`, add a
second factory such as `createSupabasePlatformFeedbackForSubmission()` that
constructs the service from `getAdminClient()` in the adapter module.

**Verify**:
`rg -n "getAdminClient\|beta_feedback\|api.github.com\|GITHUB_FEEDBACK_TOKEN\|createGitHubIssue\|resolveFeedbackOrganizationContext" src/routes/api/feedback/+server.ts`
returns no matches.

### Step 4: Move route behavior tests down

Update `src/routes/api/feedback/server.test.ts` so route tests assert only:

- unauthenticated requests are rejected before service construction,
- expected use-case results map to the existing HTTP status and response body,
- unexpected submission failure maps to the existing generic 500.

Add or extend `platformFeedback.test.ts` for behavior currently covered at the
route layer:

- no organization id inserts null org fields,
- spoofed organization name is ignored,
- bad organization id returns 400,
- inaccessible organization returns 403,
- GitHub mirror success returns its URL,
- DB insert failure still returns success if the mirror already succeeded.

**Verify**:
`npx vitest run src/routes/api/feedback/server.test.ts src/lib/server/core/useCases/platformFeedback.test.ts`
exits 0.

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

- Core use-case tests own category/message/org/mirror/persistence behavior.
- Route tests own authentication and result-to-HTTP mapping.
- Existing admin feedback tests continue to pass.
- Full repo gate.

## Done criteria

- [ ] `src/routes/api/feedback/+server.ts` no longer imports provider/env/GitHub
      details.
- [ ] Submission behavior is covered in `platformFeedback.test.ts`.
- [ ] Existing public feedback API response shape is unchanged.
- [ ] The temporary GitHub mirror is preserved, not expanded.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 060 is updated.

## STOP conditions

Stop and report back if:

- Product direction changes and Robert wants the GitHub feedback mirror removed
  instead of moved.
- Moving the mirror requires exposing secrets outside server-only modules.
- Existing tests reveal a public response shape clients rely on that conflicts
  with the proposed result contract.
- Plan 059 has landed and the governance baseline cannot be reconciled without
  editing unrelated route classifications.

## Maintenance notes

This plan makes it cheaper to delete the beta feedback mirror later because
GitHub transport will be isolated behind one port. It does not decide when beta
feedback should be retired.
