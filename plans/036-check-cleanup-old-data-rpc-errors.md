# Plan 036: Check cleanup-old-data RPC errors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- src/routes/api/cleanup-old-data/+server.ts src/routes/api/cleanup-old-data/server.test.ts src/routes/api/cleanup-archived-records/+server.ts src/routes/api/cleanup-archived-records/server.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

The `cleanup-old-data` cron endpoint calls two retention RPCs and reports deleted counts, but it
never checks either RPC's `error`. A scheduled cleanup can silently fail and return
`auditLogsDeleted: 0` or `webhookEventsDeleted: 0`, hiding retention failures. After this plan, RPC
errors fail the endpoint loudly with a safe 500.

## Current state

- `src/routes/api/cleanup-old-data/+server.ts:12-20`:

```ts
const [auditResult, webhookResult] = await Promise.all([
	admin.rpc('cleanup_old_audit_logs'),
	admin.rpc('cleanup_old_webhook_events')
]);

return json({
	auditLogsDeleted: auditResult.data ?? 0,
	webhookEventsDeleted: webhookResult.data ?? 0
});
```

- `src/routes/api/cleanup-archived-records/+server.ts` is the nearby scheduled endpoint exemplar.
  It extracts `_runArchiveRetentionCleanupEndpointCore` and has
  `src/routes/api/cleanup-archived-records/server.test.ts` covering auth and response semantics.

## Commands you will need

| Purpose       | Command                                                         | Expected on success |
| ------------- | --------------------------------------------------------------- | ------------------- |
| Focused tests | `npx vitest run src/routes/api/cleanup-old-data/server.test.ts` | all pass            |
| Format        | `npm run format`                                                | exit 0              |
| Lint          | `npm run lint`                                                  | exit 0              |
| Governance    | `npm run governance:check`                                      | exit 0              |
| Typecheck     | `npm run check`                                                 | exit 0              |
| Full tests    | `npm run test`                                                  | exit 0              |

## Scope

**In scope**:

- `src/routes/api/cleanup-old-data/+server.ts`
- `src/routes/api/cleanup-old-data/server.test.ts` (create)
- `plans/README.md` status row only

**Out of scope**:

- Do not change cron authorization; plans 002 and 008 already handled that layer.
- Do not change the cleanup RPC SQL or grants.
- Do not run migrations or touch production data.

## Git workflow

- Branch: `advisor/036-check-cleanup-old-data-rpc-errors`
- Commit style: short imperative subject. Suggested: `Check cleanup old data RPC errors`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract a small endpoint core

In `cleanup-old-data/+server.ts`, add an exported helper similar to
`_runArchiveRetentionCleanupEndpointCore`. It should accept:

- `request`,
- env secrets,
- `runAuditCleanup`,
- `runWebhookCleanup`.

The helper should authorize the request, run both cleanup functions, check both `{ error }`
values, and return the JSON counts.

If either RPC returns an error, throw SvelteKit `error(500, 'Failed to cleanup old data')` or a
similarly safe fixed message. Do not return raw database error text to the client.

**Verify**: `npm run check` -> exit 0.

### Step 2: Wire GET through the helper

Keep `GET` responsible for reading `env`, creating `getAdminClient()`, and passing callbacks:

```ts
runAuditCleanup: () => admin.rpc('cleanup_old_audit_logs');
runWebhookCleanup: () => admin.rpc('cleanup_old_webhook_events');
```

Preserve the successful response shape:

```json
{ "auditLogsDeleted": 0, "webhookEventsDeleted": 0 }
```

**Verify**: `npm run check` -> exit 0.

### Step 3: Add endpoint-core tests

Create `src/routes/api/cleanup-old-data/server.test.ts` modeled on
`cleanup-archived-records/server.test.ts`.

Cover:

- missing bearer token rejects,
- valid cleanup secret returns counts from both RPCs,
- valid cron secret works,
- audit RPC error rejects with 500,
- webhook RPC error rejects with 500,
- when one RPC errors, the response is not a fake successful zero-count response.

**Verify**: `npx vitest run src/routes/api/cleanup-old-data/server.test.ts` -> all pass.

### Step 4: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] Both cleanup RPC errors are checked.
- [ ] Successful response shape is unchanged.
- [ ] Error responses use a safe fixed message.
- [ ] Focused endpoint-core tests cover both error branches.
- [ ] `plans/README.md` status row for 036 is updated.

## STOP conditions

Stop and report back if:

- The cleanup endpoint has been replaced by a different retention mechanism.
- Tests reveal callers depend on the endpoint returning 200 when an RPC errors.
- Fixing this appears to require SQL changes.

## Maintenance notes

This endpoint deletes retained operational data through RPCs. Reviewers should prefer loud failures
over quiet zero-count responses.
