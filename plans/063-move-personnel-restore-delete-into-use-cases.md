# Plan 063: Move personnel restore and permanent delete into use cases

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/lib/server/core/useCases/personnel.ts src/lib/server/core/useCases/personnel.test.ts src/routes/org/[orgId]/api/personnel/+server.ts src/routes/org/[orgId]/api/personnel/server.test.ts src/routes/org/[orgId]/api/personnel/permanent/+server.ts src/routes/org/[orgId]/api/personnel/permanent/server.test.ts src/lib/server/core/useCases/personnelArchivedArtifacts.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

Historical plan: lifecycle extraction is implemented. Stabilization [03-02b](../docs/stabilization/TODO.md#03-02-local-leaves--d02-1293) removes the subscription port, seat checks, tier-cache invalidation and restore quota response described below. Current Personnel writes use `WritePorts`; restore returns success or a retained authorization/validation error. The excerpts below record the old design and are not current implementation instructions.

- **Priority**: P1
- **Effort**: M
- **Risk**: MED-HIGH
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Historical rationale

`createPersonnelUseCases()` owns create, update, archive, and archive-batch, but
restore and permanent-delete still keep subscription, policy, artifact, audit,
and notification behavior inside route configs. That splits one lifecycle across
two layers. Moving restore and permanent-delete into the personnel use case
keeps lifecycle invariants in one place and makes route tests thinner.

## Historical state at planning

- `PersonnelUseCases` exports `create`, `update`, `archive`, and
  `archiveBatch`.
- `PATCH /api/personnel` implements restore inside the route.
- `DELETE /api/personnel/permanent` implements permanent delete inside the
  route.
- Route tests already cover policy-first authorization and route behavior.
- `personnel.test.ts` is the core use-case test home for create/update/archive.

Current excerpts:

```ts
// src/lib/server/core/useCases/personnel.ts:46
export interface PersonnelUseCases {
	create(ctx: WriteWithSubscriptionPorts, data: Record<string, unknown>): Promise<unknown>;
	update(ctx: WriteWithSubscriptionPorts, data: Record<string, unknown>): Promise<unknown>;
	archive(ctx: WriteWithSubscriptionPorts, id: string): Promise<{ requiresApproval: boolean } | void>;
	archiveBatch(ctx: ArchiveBatchPorts, input: ArchivePersonnelBatchInput): Promise<ArchivePersonnelBatchResult>;
}
```

```ts
// src/routes/org/[orgId]/api/personnel/+server.ts:63
fn: async (ctx, input) => {
	const { action, id } = input;
```

```ts
// src/routes/org/[orgId]/api/personnel/+server.ts:93
const personnelArchivedAt = person.archived_at;
await ctx.store.update('personnel', ctx.auth.orgId, id as string, { archived_at: null });
await restorePersonnelOwnedArtifacts(ctx, [id as string], personnelArchivedAt);
```

```ts
// src/routes/org/[orgId]/api/personnel/permanent/+server.ts:33
await ctx.store.delete('personnel', ctx.auth.orgId, id);
```

```ts
// src/routes/org/[orgId]/api/personnel/permanent/+server.ts:44
await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
	type: 'personnel_permanently_deleted',
```

## Commands you will need

| Purpose               | Command                                                                                                                                                                                                                                                                                                                                                                                    | Expected on success |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Core personnel tests  | `npx vitest run src/lib/server/core/useCases/personnel.test.ts src/lib/server/core/useCases/personnelArchivedArtifacts.test.ts`                                                                                                                                                                                                                                                            | exits 0             |
| Personnel route tests | `npx vitest run src/routes/org/[orgId]/api/personnel/server.test.ts src/routes/org/[orgId]/api/personnel/permanent/server.test.ts`                                                                                                                                                                                                                                                         | exits 0             |
| Route lifecycle grep  | `rg -n -e 'restorePersonnelOwnedArtifacts' -e 'personnel\\.restored' -e 'permanently_deleted' -e 'personnel_permanently_deleted' -e 'ctx\\.audit\\.log' -e 'ctx\\.notifications\\.notifyAdmins' -e "ctx\\.store\\.delete\\('personnel'" -e "ctx\\.store\\.update\\('personnel'" src/routes/org/[orgId]/api/personnel/+server.ts src/routes/org/[orgId]/api/personnel/permanent/+server.ts` | no matches          |
| Format                | `npm run format`                                                                                                                                                                                                                                                                                                                                                                           | exits 0             |
| Lint                  | `npm run lint`                                                                                                                                                                                                                                                                                                                                                                             | exits 0             |
| Governance            | `npm run governance:check`                                                                                                                                                                                                                                                                                                                                                                 | exits 0             |
| Typecheck             | `npm run check`                                                                                                                                                                                                                                                                                                                                                                            | exits 0             |
| Unit tests            | `npm run test`                                                                                                                                                                                                                                                                                                                                                                             | exits 0             |

## Scope

**In scope**:

- `src/lib/server/core/useCases/personnel.ts`
- `src/lib/server/core/useCases/personnel.test.ts`
- `src/routes/org/[orgId]/api/personnel/+server.ts`
- `src/routes/org/[orgId]/api/personnel/server.test.ts`
- `src/routes/org/[orgId]/api/personnel/permanent/+server.ts`
- `src/routes/org/[orgId]/api/personnel/permanent/server.test.ts`
- `src/lib/server/core/useCases/personnelArchivedArtifacts.ts` only if an
  exported type/helper is needed
- `plans/README.md` status row only

**Out of scope**:

- Do not change archive or archive-batch semantics.
- Do not change Personnel policy action ids.
- Do not change notification text except by moving it exactly into the use case.
- Do not add migrations.
- Do not batch this with plan 064 Personnel export work.

## Git workflow

- Branch: `codex/063-move-personnel-restore-delete-into-use-cases`
- Commit style: short imperative subject. Suggested: `Move personnel lifecycle writes into use cases`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend the personnel use-case contract

Add restore and permanent-delete operations to `PersonnelUseCases`:

```ts
restore(ctx: WriteWithSubscriptionPorts, id: string): Promise<{ success: true } | { message: string }>;
permanentlyDelete(ctx: WriteWithNotificationsPorts, id: string): Promise<{ success: true }>;
```

Use the narrowest existing port type that supports each operation. Restore needs
subscription cache invalidation and artifact restoration; permanent delete needs
notifications. Both operations may still use `fail(...)` for request errors such as missing ids,
missing rows, or invalid lifecycle state, so the route can stay thin without adding route-local
400/404 branching.

**Verify**:
`npx vitest run src/lib/server/core/useCases/personnel.test.ts` should fail
until Step 2 adds implementations/tests, then pass.

### Step 2: Move restore behavior into the use case

Move the restore logic from `_patchConfig.fn` into `createPersonnelUseCases().restore`.
Preserve behavior exactly:

- only action `restore` is accepted by the route,
- missing id returns 400 at the route/use-case boundary,
- seat-cap failure returns `{ message }` and the route formats it as 422,
- missing personnel returns 404,
- non-archived personnel returns 400,
- group-scoped feature policy is enforced using the personnel row group id,
- `archived_at` is set to null,
- `restorePersonnelOwnedArtifacts` runs with the previous archived timestamp,
- subscription tier cache is invalidated,
- audit action remains `personnel.restored`.

Add use-case tests for successful restore, cap rejection, missing row,
non-archived row, group-scope denial, artifact restoration, cache invalidation,
and audit.

**Verify**:
`npx vitest run src/lib/server/core/useCases/personnel.test.ts` exits 0.

### Step 3: Move permanent delete behavior into the use case

Move the permanent-delete logic from
`src/routes/org/[orgId]/api/personnel/permanent/+server.ts` into
`createPersonnelUseCases().permanentlyDelete`.

Preserve behavior exactly:

- missing id returns 400,
- missing personnel returns 404,
- active personnel returns 400,
- group-scoped feature policy is enforced,
- row is deleted from `personnel`,
- audit action remains `personnel.permanently_deleted`,
- admin notification type/title/message remain unchanged.

Add core tests for the success path and each failure branch.

**Verify**:
`npx vitest run src/lib/server/core/useCases/personnel.test.ts` exits 0.

### Step 4: Thin the routes

Update `_patchConfig.fn` to parse action/id and delegate to
`createPersonnelUseCases().restore(ctx, id)`.

Update permanent delete route to delegate to
`createPersonnelUseCases().permanentlyDelete(ctx, id)`.

Route tests should still assert route config policy metadata and result mapping,
but lifecycle behavior should be asserted in the use-case tests.

**Verify**:
`npx vitest run src/routes/org/[orgId]/api/personnel/server.test.ts src/routes/org/[orgId]/api/personnel/permanent/server.test.ts`
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

- Core tests cover restore and permanent-delete lifecycle behavior.
- Route tests cover HTTP config and mapping only.
- Existing artifact lifecycle tests stay green.
- Full repo gate.

## Done criteria

- [ ] Restore and permanent-delete are public methods on `PersonnelUseCases`.
- [ ] Route files no longer own Personnel lifecycle side effects.
- [ ] Core tests cover policy, subscription, artifacts, audit, and notification
      behavior.
- [ ] Existing route response behavior is unchanged.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 063 is updated.

## STOP conditions

Stop and report back if:

- Moving restore requires a wider port than existing Personnel use cases can
  safely accept.
- Permanent delete needs to coordinate with deletion-request approval state not
  visible in the current route.
- Tests reveal current restore or permanent-delete behavior is inconsistent with
  documented policy expectations.
- The change would require touching plan 064 export files in the same worktree.

## Maintenance notes

After this lands, keep Personnel lifecycle writes in `personnel.ts` or a clearly
named sibling use case. Avoid adding future route-local Personnel side effects.
