# Plan 076: Batch onboarding resync writes into bulk store calls

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b3acfabb..HEAD -- src/lib/server/core/useCases/onboardingResync.ts src/lib/server/core/useCases/onboardingResync.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b3acfabb`, 2026-06-14

## Why this matters

`resyncOnboarding` / `switchTemplate` reconcile a personnel onboarding's step
rows against its template. The reconciliation (`performDiff`) issues **one
database write per step** across three loops: deactivate orphaned steps
(per-row `update`), update steps that still exist (per-row `update`), and insert
new steps (per-row `insert`). For a template with N steps, a resync is up to N
round-trips when it could be two. Resync runs on template edits and template
switches; on larger templates this is a noticeable, avoidable burst of
sequential queries.

The DataStore already exposes the bulk primitives used elsewhere in the
codebase: `insertMany` (see `onboardingLifecycle.ts:127`, which bulk-inserts
these exact `onboarding_step_progress` rows) and `upsertMany` with an
`onConflict` key (see `trainingRecordsBatch.ts:164`). After this plan,
`performDiff` performs at most one `upsertMany` (for deactivations + metadata
updates, which are existing rows keyed by `id`) and one `insertMany` (for new
rows), preserving identical behavior and return data.

## Current state

`src/lib/server/core/useCases/onboardingResync.ts` — `performDiff` (lines 77-172).
The three write loops today:

```ts
// 1. Steps in instance but not in template → deactivate
for (const instanceStep of instanceSteps) {
	if (instanceStep.template_step_id && !templateStepMap.has(instanceStep.template_step_id)) {
		const updated = await ctx.store.update<StepProgressRow>(
			'onboarding_step_progress',
			ctx.auth.orgId,
			instanceStep.id,
			{ active: false }
		);
		results.push(mapToResult(updated));
	}
}

// 2. Steps in both → update metadata, preserve progress
for (const [templateStepId, templateStep] of templateStepMap) {
	const instanceStep = instanceStepMap.get(templateStepId);
	if (instanceStep) {
		const updateData: Record<string, unknown> = {
			step_name: templateStep.name,
			step_type: templateStep.step_type,
			training_type_id: templateStep.training_type_id,
			stages: templateStep.stages,
			sort_order: templateStep.sort_order
		};

		// Handle paperwork stage reset
		if (
			templateStep.step_type === 'paperwork' &&
			Array.isArray(templateStep.stages) &&
			templateStep.stages.length > 0
		) {
			const currentStage = instanceStep.current_stage;
			if (currentStage && !templateStep.stages.includes(currentStage)) {
				updateData.current_stage = templateStep.stages[0];
				updateData.completed = false;
			}
		}

		const updated = await ctx.store.update<StepProgressRow>(
			'onboarding_step_progress',
			ctx.auth.orgId,
			instanceStep.id,
			updateData
		);
		results.push(mapToResult(updated));
	}
}

// 3. Steps in template but not in instance → insert new
for (const templateStep of templateSteps) {
	if (!instanceStepMap.has(templateStep.id)) {
		const newRow = { /* ...full row, see file lines 149-164... */ };
		const inserted = await ctx.store.insert<StepProgressRow>('onboarding_step_progress', ctx.auth.orgId, newRow);
		results.push(mapToResult(inserted));
	}
}

return results;
```

Key facts the executor needs:
- `instanceSteps` and `instanceStepMap` are already fully loaded (lines 87-94);
  every existing-row mutation (loops 1 and 2) has the **complete current row**
  available, so a full-row upsert is safe (no column gets unintentionally
  nulled).
- `mapToResult` (lines 60-75) maps a `StepProgressRow` to the returned
  `ResyncStepResult`. The returned `results` array is surfaced as the API
  response `steps`. Verify whether the existing test asserts on ordering before
  assuming order is free (see Test plan).

The store interface (`src/lib/server/core/ports.ts:65-93`):

```ts
insertMany<T>(table, orgId, rows, select?): Promise<T[]>;
upsertMany<T>(table, orgId, rows, options: { onConflict: string; select?: string }): Promise<T[]>;
```

Exemplars to match:
- `insertMany` for these exact step rows: `onboardingLifecycle.ts:127-141`.
- `upsertMany` with `onConflict`: `trainingRecordsBatch.ts:164`.

## Commands you will need

| Purpose    | Command                                                                | Expected on success |
|------------|------------------------------------------------------------------------|---------------------|
| Format     | `npm run format`                                                       | rewrites, exit 0    |
| Lint       | `npm run lint`                                                         | exit 0              |
| Governance | `npm run governance:check`                                            | exit 0              |
| Typecheck  | `npm run check`                                                        | exit 0, no errors   |
| Focused    | `npx vitest run src/lib/server/core/useCases/onboardingResync.test.ts`| all pass            |
| Full tests | `npm run test`                                                        | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/lib/server/core/useCases/onboardingResync.ts` (rewrite the three write
  loops in `performDiff`; do not change `resyncOnboarding`/`switchTemplate`
  signatures or their policy/validation logic)
- `src/lib/server/core/useCases/onboardingResync.test.ts` (extend with a
  batching assertion)

**Out of scope** (do NOT touch):
- `src/lib/server/core/ports.ts` and the DataStore adapters — `insertMany` and
  `upsertMany` already exist; you must NOT add a new store method.
- The in-memory adapter (`src/lib/server/adapters/inMemory.ts`) — it already
  implements `insertMany`/`upsertMany`; the existing resync test uses it.
- Any onboarding lifecycle, policy, or template-edit code outside `performDiff`.

## Git workflow

- Branch: `advisor/076-batch-onboarding-resync` (or the repo's convention).
- One commit; message style short imperative (e.g. "Batch onboarding resync writes").
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Build the existing-row mutations and bulk-upsert them

Replace loops **1 and 2** with row-collection + a single `upsertMany`:

1. Collect a `existingRowUpserts: Record<string, unknown>[]` array.
2. In the loop over `instanceSteps` (orphans → deactivate): when the condition
   holds, push the **complete** instance row spread with the change, e.g.
   `existingRowUpserts.push({ ...orphanRowColumns(instanceStep), active: false })`.
   The simplest safe approach is to reuse the full row you loaded. Because the
   in-memory/Supabase `upsertMany` writes the columns you pass, include the full
   set of `StepProgressRow` columns (id, onboarding_id, template_step_id,
   step_name, step_type, training_type_id, stages, sort_order, completed,
   current_stage, notes, active) so nothing is dropped.
3. In the loop over `templateStepMap` (steps in both → update metadata): build
   the merged row `{ ...instanceStep, ...updateData }` (full row + the metadata
   overrides, including the paperwork-stage-reset fields when they apply) and
   push it to `existingRowUpserts`.
4. After both loops, if `existingRowUpserts.length > 0`, call once:
   ```ts
   const upserted = await ctx.store.upsertMany<StepProgressRow>(
   	'onboarding_step_progress',
   	ctx.auth.orgId,
   	existingRowUpserts,
   	{ onConflict: 'id' }
   );
   for (const row of upserted) results.push(mapToResult(row));
   ```

Note: every existing row already has an `id`, so `onConflict: 'id'` always
takes the UPDATE path — no accidental inserts.

**Verify**: `npm run check` → exit 0.

### Step 2: Bulk-insert the new rows

Replace loop **3** with row-collection + a single `insertMany`:

```ts
const newRows: Record<string, unknown>[] = [];
for (const templateStep of templateSteps) {
	if (!instanceStepMap.has(templateStep.id)) {
		newRows.push({ /* the same newRow object as today, lines 149-164 */ });
	}
}
if (newRows.length > 0) {
	const inserted = await ctx.store.insertMany<StepProgressRow>(
		'onboarding_step_progress',
		ctx.auth.orgId,
		newRows
	);
	for (const row of inserted) results.push(mapToResult(row));
}
```

Keep the `newRow` shape byte-for-byte identical to the current code (lines
149-164), including the `current_stage` paperwork conditional.

**Verify**: `npm run check` → exit 0, and
`npx vitest run src/lib/server/core/useCases/onboardingResync.test.ts` → all
existing tests pass (behavior unchanged).

### Step 3: Add a batching assertion to the test

See Test plan. Then run the full gate:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`.

## Test plan

- The existing suite `onboardingResync.test.ts` already covers
  deactivate/update/insert behavior against the in-memory store; it is your
  regression net. It must pass unchanged (same returned `steps`). If it asserts
  a specific **order** of `steps` that the batched version doesn't preserve,
  STOP and report — do not silently reorder assertions (the order change could
  be observable to clients).
- Add one test that proves batching: spy on the in-memory store's `insertMany`
  and `upsertMany` (or assert via call counts if the harness exposes them) for a
  resync that adds 2 new steps and updates 2 existing ones, asserting
  `insertMany` is called at most once and `upsertMany` at most once — not N
  per-row `insert`/`update` calls. If the in-memory store does not allow
  spying on method calls, instead assert the resync still returns the correct
  step set and add a code-level check (e.g. `grep`) in Done criteria; note the
  limitation in the test file comment.
- **Verification**:
  `npx vitest run src/lib/server/core/useCases/onboardingResync.test.ts` → all
  pass including the new case.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run governance:check` exits 0
- [ ] `npm run test` exits 0; `onboardingResync.test.ts` passes including the
      new batching assertion
- [ ] In `performDiff`, the per-row write calls are gone:
      `grep -n "ctx.store.update<\|ctx.store.insert<" src/lib/server/core/useCases/onboardingResync.ts`
      returns **no** matches inside `performDiff` (the `switchTemplate`
      `ctx.store.update('personnel_onboardings', ...)` at the use-case level is
      a different table and stays).
- [ ] `grep -n "upsertMany\|insertMany" src/lib/server/core/useCases/onboardingResync.ts`
      returns matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 076 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live `performDiff`.
- The existing test asserts a `steps` ordering the batched version cannot
  preserve, and reconciling it would change observable output.
- `upsertMany` in this codebase's in-memory or Supabase adapter does NOT
  perform a partial/full-row update keyed on the `onConflict` column as
  expected (verify against `trainingRecordsBatch.ts` usage and the adapter
  tests in `src/lib/server/adapters/inMemory.test.ts:330`). If its semantics
  differ, report — do not work around it.
- Batching would require adding or changing a DataStore method.

## Maintenance notes

- If `onboarding_step_progress` gains columns, the full-row upsert in step 1
  must include them, or the upsert will null them on existing rows. Prefer
  spreading the loaded `instanceStep` so new columns ride along automatically.
- `upsertMany` is keyed on `id`; this is only safe because every existing row
  already has an id. If the reconciliation ever upserts rows without ids, switch
  those to `insertMany`.
- A reviewer should confirm the returned `steps` array still contains exactly
  the deactivated + updated + inserted rows (no dups, no drops) — the in-memory
  test is the guard.
