# Plan 031: Derive feedback organization context server-side

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- src/routes/api/feedback/+server.ts src/lib/components/FeedbackModal.svelte src/lib/server/core/useCases/organizationDataExportManifest.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

The feedback endpoint saves rows with an admin Supabase client, but it trusts `organizationId`,
`organizationName`, and `pageUrl` from the browser. Any authenticated user can associate feedback
with another organization's UUID, which pollutes platform triage and that organization's exported
`beta_feedback` data. After this plan, a feedback row may only be associated with an organization
the authenticated user belongs to, and the organization name is derived server-side.

## Current state

- `src/lib/components/FeedbackModal.svelte:35-40` sends client-controlled org metadata:

```ts
body: JSON.stringify({
	category,
	message: message.trim(),
	pageUrl,
	organizationId: orgId,
	organizationName: orgName
})
```

- `src/routes/api/feedback/+server.ts:109-143` trusts that metadata and inserts with an admin
  client:

```ts
const body = await request.json();
const { category, pageUrl, organizationId, organizationName } = body;
// ...
const { error: insertError } = await adminClient.from('beta_feedback').insert({
	user_id: user.id,
	user_email: user.email,
	organization_id: organizationId || null,
	organization_name: organizationName || null,
	category: category || 'general',
	message,
	page_url: pageUrl || null,
	page_section: pageSection || null,
```

- `src/lib/server/core/useCases/organizationDataExportManifest.ts:104` includes `beta_feedback`
  in organization exports, so incorrect org attribution becomes visible in exported org data.
- The beta GitHub issue mirror is intentionally out of scope for this plan. Robert explicitly said
  it will go away after beta and does not need remediation here.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route tests | `npx vitest run src/routes/api/feedback/server.test.ts` | all pass |
| Format | `npm run format` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Governance | `npm run governance:check` | exit 0 |
| Typecheck | `npm run check` | exit 0 |
| Full tests | `npm run test` | exit 0 |

## Scope

**In scope**:

- `src/routes/api/feedback/+server.ts`
- `src/routes/api/feedback/server.test.ts` (create)
- `plans/README.md` status row only

**Out of scope**:

- Do not remove the beta GitHub issue mirror in this plan.
- Do not change admin feedback review pages.
- Do not change organization export behavior.
- Do not require org context for feedback submitted outside an org route; those rows may remain
  organization-null.

## Git workflow

- Branch: `advisor/031-derive-feedback-organization-context-server-side`
- Commit style: short imperative subject. Suggested: `Derive feedback organization context server-side`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a server-side resolver for feedback org context

In `src/routes/api/feedback/+server.ts`, add a small helper that takes:

- the admin Supabase client,
- authenticated user id,
- optional `organizationId`,
- optional `pageUrl`.

Behavior:

- If no `organizationId` is supplied, return `{ organizationId: null, organizationName: null, pageUrl: normalizedPageUrlOrNull }`.
- If `organizationId` is supplied, validate it as a UUID. Invalid UUID -> `fail/error(400, ...)`.
- Query `organization_memberships` for a row with that `organization_id` and `user_id`, joining or separately reading `organizations.name`.
- If no membership exists, return 403.
- Derive `organizationName` from the database, never from the body.
- Normalize `pageUrl`: accept only same-origin relative app paths or URLs whose pathname belongs to
  the verified org route. If this is awkward, store `null` for suspicious page URLs rather than
  rejecting useful feedback.

Keep the helper in the route file unless it grows enough to justify a colocated module.

**Verify**: `npm run check` -> exit 0.

### Step 2: Use the resolver for DB insert and GitHub issue context

Replace the trusted destructuring of `organizationName` with the resolved server value. The DB
insert should use:

```ts
organization_id: resolved.organizationId,
organization_name: resolved.organizationName,
page_url: resolved.pageUrl,
```

For the beta GitHub issue body, pass the resolved organization name and page URL. Do not remove the
GitHub issue mirror.

**Verify**: `npm run check` -> exit 0.

### Step 3: Add route tests

Create `src/routes/api/feedback/server.test.ts`. Mock `getAdminClient` and the GitHub token/fetch
path so the tests do not call GitHub.

Cover at least:

- unauthenticated request returns 401,
- authenticated request without org id inserts a feedback row with null org fields,
- authenticated request with an org id they belong to inserts the derived org name, ignoring a
  spoofed `organizationName` in the body,
- authenticated request with another org id rejects with 403 and does not insert,
- invalid org UUID rejects with 400.

Follow existing route-test style: import the exported `POST`, call it with a `Request`, and inspect
the mocked admin-client calls.

**Verify**: `npx vitest run src/routes/api/feedback/server.test.ts` -> all pass.

### Step 4: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] Client-supplied `organizationName` is ignored.
- [ ] Client-supplied `organizationId` is accepted only after membership verification.
- [ ] Feedback outside org context still works with null org fields.
- [ ] Spoofed org attribution cannot be inserted.
- [ ] GitHub feedback mirroring remains present and best-effort.
- [ ] `plans/README.md` status row for 031 is updated.

## STOP conditions

Stop and report back if:

- Feedback submission is being removed entirely from the beta app before this plan starts.
- The route has moved behind an org-specific URL, changing the right source of org context.
- Verifying membership requires a broad auth/provider-boundary refactor.

## Maintenance notes

When beta feedback is retired, remove the GitHub mirror and route in a separate cleanup plan. This
plan only fixes active beta data attribution while the route exists.
