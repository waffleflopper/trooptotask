# Plan 028: Approve deletion requests only after the resource effect succeeds

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- src/lib/server/core/useCases/deletionRequests.ts src/lib/server/core/useCases/deletionRequests.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

Deletion request approval currently updates the request row to `approved` before validating the
resource type or archiving/deleting the resource. If the resource type is unsupported, the resource
is missing, or a downstream archive/delete fails, the request can be left approved even though the
resource was not removed. That creates bad audit history and blocks a clean retry path. After this
plan, approval status is committed only after the deletion/archive effect succeeds.

## Current state

- `src/lib/server/core/useCases/deletionRequests.ts:135-165`:

```ts
export async function approveDeletionRequest(ctx: WriteWithNotificationsPorts, requestId: string): Promise<void> {
	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.reviewDeletionRequests);

	const request = await fetchPendingRequest(ctx, requestId);

	// Update request status
	await ctx.store.update(TABLE, ctx.auth.orgId, requestId, {
		status: 'approved',
		reviewed_by: ctx.auth.userId,
		reviewed_at: new Date().toISOString(),
		denial_reason: null
	});

	// Execute the deletion effect
	const resourceType = request.resource_type as string;
	const resourceId = request.resource_id as string;
	const tableName = RESOURCE_TYPE_TABLE_MAP[resourceType];

	if (!tableName) {
		fail(400, `Unsupported resource type: ${resourceType}`);
	}
```

- The current unsupported-resource test in `deletionRequests.test.ts` asserts a 400 but does not
  assert the request stays pending.
- The same test file already seeds pending requests with `seedPendingRequest(...)` and verifies
  personnel archival plus hard-delete behavior. Use those patterns.

## Commands you will need

| Purpose       | Command                                                                | Expected on success |
| ------------- | ---------------------------------------------------------------------- | ------------------- |
| Focused tests | `npx vitest run src/lib/server/core/useCases/deletionRequests.test.ts` | all pass            |
| Format        | `npm run format`                                                       | exit 0              |
| Lint          | `npm run lint`                                                         | exit 0              |
| Governance    | `npm run governance:check`                                             | exit 0              |
| Typecheck     | `npm run check`                                                        | exit 0              |
| Full tests    | `npm run test`                                                         | exit 0              |

## Scope

**In scope**:

- `src/lib/server/core/useCases/deletionRequests.ts`
- `src/lib/server/core/useCases/deletionRequests.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not change the deletion-request route or UI.
- Do not add a broad transaction abstraction unless it is already available and trivial to use.
- Do not change notification fire-and-forget behavior; notification failures intentionally do not
  roll back successful approval.

## Git workflow

- Branch: `advisor/028-approve-deletion-requests-after-resource-effect`
- Commit style: short imperative subject. Suggested: `Approve deletion requests after resource effects`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Validate resource type before any approval write

In `approveDeletionRequest`, move `resourceType`, `resourceId`, and `tableName` calculation above
the status update. If `tableName` is missing, return the same 400 before writing to
`deletion_requests`.

Add a test strengthening the existing unsupported-resource case:

- seed a pending request with `resource_type: 'unknown_type'`,
- call `approveDeletionRequest`,
- assert it rejects with `{ status: 400 }`,
- assert the stored request still has `status: 'pending'` and no `reviewed_at`.

**Verify**: `npx vitest run src/lib/server/core/useCases/deletionRequests.test.ts` -> exit 0.

### Step 2: Execute archive/delete before marking approved

Change approval ordering:

1. fetch pending request,
2. validate mapped resource type,
3. perform personnel archive or hard delete,
4. then update the request to `approved`,
5. then notify requester and audit log as today.

Use one `reviewedAt` timestamp value for the approval row so tests can assert it exists without
needing exact time.

Add failure-path tests:

- personnel archive update failure leaves request pending,
- non-personnel delete failure leaves request pending.

Inject failures by wrapping or overriding the in-memory store method used by the test, scoped to
the target table/id. Do not make the in-memory adapter globally flaky.

**Verify**: `npx vitest run src/lib/server/core/useCases/deletionRequests.test.ts` -> exit 0.

### Step 3: Validate resource type on request creation

Before creating a deletion request, reject unknown `input.resourceType` using the same
`RESOURCE_TYPE_TABLE_MAP`. Keep the read-only overlay exception for personnel unchanged.

Add a test that `createDeletionRequest` rejects an unknown resource type and does not insert a row.

**Verify**: `npx vitest run src/lib/server/core/useCases/deletionRequests.test.ts` -> exit 0.

### Step 4: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] Unknown resource types are rejected at create and approve time.
- [ ] Failed archive/delete leaves the request pending.
- [ ] Successful approval still archives personnel-owned artifacts and hard-deletes supported non-personnel resources.
- [ ] Notification delivery failures still do not fail approval after the resource effect succeeds.
- [ ] `plans/README.md` status row for 028 is updated.

## STOP conditions

Stop and report back if:

- The store API now supports a transaction boundary that changes the correct implementation shape.
- Tests reveal existing callers intentionally create deletion requests for resource types outside
  `RESOURCE_TYPE_TABLE_MAP`.
- The change appears to require route or UI response-shape changes.

## Maintenance notes

This plan does not make approval fully transactional. It fixes the proven bad ordering. A future
database/RPC transaction could further guarantee that the resource effect and approval row commit
together.
