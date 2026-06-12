# Plan 027: Restrict audit-log settings to owner-only access

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- src/lib/access/policyEvaluator.ts src/lib/access/policyEvaluator.test.ts "src/routes/org/[orgId]/settings" supabase/migrations/20260413001158_remote_schema.sql`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

The database policy for `audit_logs` allows organization owners and platform admins to read audit
logs. The settings UI currently loads the logs page through the generic organization governance
gate, which allows both owners and admins, then reads audit logs with a service-role admin store.
That means an org admin who is not an owner can read action history and hydrated actor details
despite the database contract saying otherwise. After this plan, audit-log settings use a
purpose-named owner-only policy action and the settings nav hides the logs tab from non-owners.

## Current state

- `supabase/migrations/20260413001158_remote_schema.sql:3894` defines the database contract:

```sql
CREATE POLICY "Org owners can read own audit logs" ON "public"."audit_logs" FOR SELECT USING (("public"."is_org_owner"("org_id") OR "public"."is_platform_admin"()));
```

- `src/routes/org/[orgId]/settings/settingsLoad.server.ts:53-55` wraps every settings subroute
  with `POLICY_ACTION_CATALOG.organization.accessGovernance`.
- `src/lib/access/policyEvaluator.ts:412-416` defines `organization.accessGovernance` as
  `admin-or-owner`.
- `src/routes/org/[orgId]/settings/logs/+page.server.ts:7-13` calls `loadSettingsPage(...)`,
  creates `createSupabaseDataStore(getAdminClient())`, and loads the audit-log page.
- `src/routes/org/[orgId]/settings/settingsShell.server.ts:73-87` sets `tabVisibility.logs: true`
  for owners and admins.
- `src/routes/org/[orgId]/settings/+layout.svelte:41` always includes the `Logs` tab.
- Existing owner-only examples: `organization.accessBilling`, `organization.manageBilling`,
  `organization.transferOwnership`, and `organization.deleteOrganization` in
  `src/lib/access/policyEvaluator.ts:417-470`.
- Existing route-load test pattern:
  `src/routes/org/[orgId]/settings/danger/page.server.test.ts` verifies admin redirect and owner
  success for an owner-only settings section.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused policy tests | `npx vitest run src/lib/access/policyEvaluator.test.ts` | all pass |
| Focused settings tests | `npx vitest run "src/routes/org/[orgId]/settings"` | all pass |
| Format | `npm run format` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Governance | `npm run governance:check` | exit 0 |
| Typecheck | `npm run check` | exit 0 |
| Full tests | `npm run test` | exit 0 |

## Scope

**In scope**:

- `src/lib/access/policyEvaluator.ts`
- `src/lib/access/policyEvaluator.test.ts`
- `src/routes/org/[orgId]/settings/logs/+page.server.ts`
- `src/routes/org/[orgId]/settings/logs/page.server.test.ts` (create)
- `src/routes/org/[orgId]/settings/settingsShell.server.ts`
- `src/routes/org/[orgId]/settings/settingsShell.server.test.ts` if it exists, or create/update the nearest shell test
- `src/routes/org/[orgId]/settings/+layout.svelte`
- `plans/README.md` status row only

**Out of scope**:

- Do not change the `audit_logs` RLS policy unless Robert explicitly decides admins should read
  audit logs. This plan aligns the app to the current DB policy.
- Do not broaden platform-admin behavior.
- Do not refactor `auditLogQuery.ts`; the issue is access to the page, not the query shape.

## Git workflow

- Branch: `advisor/027-restrict-audit-log-settings-access`
- Commit style: short imperative subject. Suggested: `Restrict audit log settings to owners`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a purpose-named owner-only policy action

In `src/lib/access/policyEvaluator.ts`, add `POLICY_ACTION_CATALOG.organization.accessAuditLogs`
near the other organization governance actions:

```ts
accessAuditLogs: governanceAction({
	id: 'organization.accessAuditLogs',
	label: 'Access organization audit logs',
	access: 'owner-only'
}),
```

Add/extend policy tests so owners are allowed and admins receive the existing owner-only denial
reason. Follow the owner-only action assertions already used for billing and danger actions.

**Verify**: `npx vitest run src/lib/access/policyEvaluator.test.ts` -> exit 0.

### Step 2: Gate the logs route with the new action

Change `src/routes/org/[orgId]/settings/logs/+page.server.ts` so the logs page does not rely on
the generic `loadSettingsPage(...)` `accessGovernance` wrapper. It still needs the same common
settings data, but its `loadWithContext` call must use:

```ts
policyAction: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
policyResource: { kind: 'organization' }
```

Reuse `buildCommonSettingsPageData`, `buildSettingsPageOrganization`, and `loadLogsSettings`
instead of duplicating data shaping. Preserve the suspended-org early return behavior from
`loadSettingsPage`.

Add `src/routes/org/[orgId]/settings/logs/page.server.test.ts` modeled on
`danger/page.server.test.ts` and `settingsLoad.server.test.ts`:

- suspended parent returns `{}` without loading logs,
- admin is denied/redirected before audit logs are fetched,
- owner loads logs with the shared page context.

**Verify**: `npx vitest run "src/routes/org/[orgId]/settings/logs"` -> exit 0.

### Step 3: Hide the Logs tab for non-owners

Change `SettingsShell.tabVisibility.logs` from always true to `isOwner`. Update the TypeScript
type from `logs: true` to `logs: boolean`.

In `src/routes/org/[orgId]/settings/+layout.svelte`, include the Logs tab only when
`settingsShell?.tabVisibility.logs` is true, matching the existing Danger tab pattern.

Update or add a focused settings-shell/layout test that proves admins do not see the Logs tab and
owners still do.

**Verify**: `npx vitest run "src/routes/org/[orgId]/settings"` -> all pass.

### Step 4: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] `POLICY_ACTION_CATALOG.organization.accessAuditLogs` exists and is owner-only.
- [ ] `/settings/logs` uses `organization.accessAuditLogs`, not `organization.accessGovernance`.
- [ ] Admin users cannot load the audit-log settings page and do not see the Logs tab.
- [ ] Owner users can load the audit-log settings page and see the Logs tab.
- [ ] No source files outside the in-scope list are modified.
- [ ] `plans/README.md` status row for 027 is updated.

## STOP conditions

Stop and report back if:

- Product intent has changed and admins are supposed to read audit logs. In that case this needs a
  DB-policy and product-copy decision, not a silent app-only change.
- The logs page has been moved out of settings or no longer uses `loadLogsSettings`.
- Fixing the nav requires broad settings-shell redesign.

## Maintenance notes

The new policy action should become the canonical action for any future audit-log surface. Reviewers
should scrutinize both page access and tab visibility; hiding the tab alone is not sufficient.
