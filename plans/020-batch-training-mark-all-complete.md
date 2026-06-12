# Plan 020: Batch Training "Mark All Completed Today" through the batch API

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report -- do not improvise. When done, update the status row for this plan
> in `plans/README.md` -- unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- src/features/training/components/PersonTrainingEditor.svelte src/features/training/components/TrainingModals.svelte src/features/training/contexts/TrainingPageContext.svelte.ts src/features/training/components/PersonTrainingEditor.svelte.test.ts src/features/training/contexts/TrainingPageContext.svelte.test.ts src/routes/org/'[orgId]'/api/personnel-trainings/batch/+server.ts src/lib/server/core/useCases/trainingRecordsBatch.ts`
> If any listed path changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

The Training person editor has a "Mark All Completed Today" action. Today it loops over every
applicable training type and awaits one `onSave` call per type, which turns one user action into N
HTTP requests and N store updates. The app already has a bulk training endpoint and a store method
for merging batch results. This plan reuses that existing batch path so the user action becomes one
request while preserving the existing single-record fallback for other uses of the component.

## Current state

- `src/features/training/components/PersonTrainingEditor.svelte` only accepts single-record save:

```ts
// src/features/training/components/PersonTrainingEditor.svelte:27-37
interface Props {
	person: Personnel;
	trainingTypes: TrainingType[];
	trainings: PersonnelTraining[];
	onSave: (data: Omit<PersonnelTraining, 'id'>) => Promise<void>;
	onRemove: (id: string) => Promise<void>;
	onClose: () => void;
	onToggleExempt?: (typeId: string, exempt: boolean) => void;
}
```

- The bulk action serializes one save per training type:

```ts
// src/features/training/components/PersonTrainingEditor.svelte:247-262
async function doMarkAllCompleted() {
	showMarkAllConfirm = false;
	const applicableTypes = trainingTypes.filter((t) => !t.expirationDateOnly);
	const today = formatDate(new Date());

	for (const type of applicableTypes) {
		const expirationDate = calculateExpirationDate(today, type.expirationMonths);
		await onSave({
			personnelId: person.id,
			trainingTypeId: type.id,
			completionDate: today,
			expirationDate,
			notes: null,
			certificateUrl: null
		});
	}
```

- The button is in the same component:

```svelte
<!-- src/features/training/components/PersonTrainingEditor.svelte:312-314 -->
<Button type="button" size="sm" onclick={markAllCompletedToday}>Mark All Completed Today</Button>
```

- `src/features/training/components/TrainingModals.svelte` wires the person editor with only
  `onSave`:

```svelte
<!-- src/features/training/components/TrainingModals.svelte:94-103 -->
<PersonTrainingEditor
	person={pe.person}
	trainingTypes={trainingTypesStore.items}
	trainings={personnelTrainingsStore.items}
	onSave={ctx.handleSaveTraining.bind(ctx)}
	onRemove={ctx.handleRemoveTraining.bind(ctx)}
	onClose={modals.closerFor('person-editor')}
	onToggleExempt={(typeId, exempt) => ctx.handleToggleExempt(typeId, pe.person.id, exempt)}
/>
```

- `src/features/training/contexts/TrainingPageContext.svelte.ts` has a single-record save and a
  bulk-import invalidation hook:

```ts
// src/features/training/contexts/TrainingPageContext.svelte.ts:280-283
async handleSaveTraining(data: Omit<PersonnelTraining, 'id'>): Promise<void> {
	await personnelTrainingsStore.add(data);
}

// src/features/training/contexts/TrainingPageContext.svelte.ts:330-334
async handleBulkImportComplete(): Promise<void> {
	const { invalidate } = await loadNavigation();
	await invalidate('app:training-data');
	this.#modals.close('bulk-import');
}
```

- The store already knows how to merge batch results:

```ts
// src/features/training/stores/personnelTrainings.svelte.ts:19-32
interface PersonnelTrainingsExtensions extends Record<string, unknown> {
	getByPersonnelAndType: (personnelId: string, trainingTypeId: string) => PersonnelTraining | undefined;
	addBatchResults: (inserted: PersonnelTraining[], updated?: PersonnelTraining[]) => void;
	...
}

addBatchResults: base.mergeBatchResults,
```

- The existing batch endpoint is available and uses the bulk use case:

```ts
// src/routes/org/[orgId]/api/personnel-trainings/batch/+server.ts:7-12
export const _postConfig: RouteConfig<ImportTrainingRecordsInput, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => importTrainingRecords(ctx, input)
};
```

The batch use case accepts `{ records }`, where each record has `personnelId`, `trainingTypeId`,
`completionDate`, optional `notes`, and `status: 'completed' | 'exempt'`.

## Commands you will need

| Purpose                 | Command                                                                                                                                                 | Expected on success |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Component/context tests | `npx vitest run src/features/training/contexts/TrainingPageContext.svelte.test.ts src/features/training/components/PersonTrainingEditor.svelte.test.ts` | all pass            |
| Existing route test     | `npx vitest run src/routes/org/'[orgId]'/api/personnel-trainings/batch/server.test.ts`                                                                  | all pass            |
| Typecheck               | `npm run check`                                                                                                                                         | exit 0, 0 errors    |
| Lint                    | `npm run lint`                                                                                                                                          | exit 0              |
| Format                  | `npm run format`                                                                                                                                        | exit 0              |
| Governance              | `npm run governance:check`                                                                                                                              | exit 0              |
| Full tests              | `npm run test`                                                                                                                                          | exit 0              |

Because this touches Svelte files, follow the repo's Svelte MCP/autofixer workflow from
`AGENTS.md` if those tools are available in your environment.

## Scope

**In scope** (the only files you should modify):

- `src/features/training/components/PersonTrainingEditor.svelte`
- `src/features/training/components/TrainingModals.svelte`
- `src/features/training/contexts/TrainingPageContext.svelte.ts`
- `src/features/training/components/PersonTrainingEditor.svelte.test.ts` (create if missing)
- `src/features/training/contexts/TrainingPageContext.svelte.test.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/server/core/useCases/trainingRecordsBatch.ts` -- plan 021 handles server-side batch
  import internals.
- `src/routes/org/[orgId]/api/personnel-trainings/batch/+server.ts` -- reuse it; do not add a route.
- Training type exemption behavior.
- Bulk CSV importer UI.
- Certificate upload handling; this button does not attach certificates today.

## Git workflow

- Branch: `advisor/020-batch-training-mark-all-complete`
- Commit style: short imperative subject. Suggested:
  `Batch Training mark-all-complete saves`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a batch save handler to the training page context

In `src/features/training/contexts/TrainingPageContext.svelte.ts`, add a method near
`handleSaveTraining`:

```ts
async handleSaveTrainingBatch(
	records: Array<{ personnelId: string; trainingTypeId: string; completionDate: string | null; notes?: string; status: 'completed' }>
): Promise<void> {
	const res = await fetch(`/org/${this.orgId}/api/personnel-trainings/batch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ records })
	});

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(data.message ?? `HTTP ${res.status}`);
	}

	personnelTrainingsStore.addBatchResults(data.inserted ?? [], data.updated ?? []);
}
```

Use a local type alias if it keeps the method readable. Do not invalidate all training data on the
happy path; the response already includes inserted/updated records and the store can merge them.

**Verify**: `npm run check` -> exit 0.

### Step 2: Add an optional batch prop and use it for mark-all-complete

In `src/features/training/components/PersonTrainingEditor.svelte`:

1. Add an optional prop such as:

```ts
onSaveBatch?: (
	records: Array<{ personnelId: string; trainingTypeId: string; completionDate: string | null; notes?: string; status: 'completed' }>
) => Promise<void>;
```

2. Include `onSaveBatch` in the `$props()` destructuring.
3. In `doMarkAllCompleted`, build the records array once:

```ts
const records = applicableTypes.map((type) => ({
	personnelId: person.id,
	trainingTypeId: type.id,
	completionDate: today,
	notes: undefined,
	status: 'completed' as const
}));
```

4. If `onSaveBatch` exists, `await onSaveBatch(records)`.
5. If it does not exist, keep the current sequential `onSave` fallback so the component remains
   reusable in tests or future call sites.
6. Only update `editingStates` after the save path succeeds.

Do not pass `expirationDate` to the batch endpoint; `trainingRecordsBatch.ts` calculates it from
the training type, which is the same source of truth used by imports.

**Verify**:
`npx vitest run src/features/training/components/PersonTrainingEditor.svelte.test.ts` -> all pass
or, if the file did not exist before this plan, the new file's tests pass.

### Step 3: Wire the person editor modal to the batch handler

In `src/features/training/components/TrainingModals.svelte`, pass the new prop only to
`PersonTrainingEditor`:

```svelte
onSaveBatch={ctx.handleSaveTrainingBatch.bind(ctx)}
```

Do not change the single-record `TrainingRecordModal` wiring; it should continue using
`ctx.handleSaveTraining`.

**Verify**:
`npx vitest run src/features/training/contexts/TrainingPageContext.svelte.test.ts` -> all pass.

### Step 4: Add regression tests

Add or update tests to cover:

1. `PersonTrainingEditor` calls `onSaveBatch` once when "Mark All Completed Today" is confirmed,
   with one record per non-`expirationDateOnly` training type and `status: 'completed'`.
2. The fallback still calls `onSave` once per applicable type when `onSaveBatch` is omitted.
3. `TrainingPageContext.handleSaveTrainingBatch` posts once to
   `/org/${orgId}/api/personnel-trainings/batch` and calls
   `personnelTrainingsStore.addBatchResults(data.inserted, data.updated)` on success.
4. A non-OK response throws and does not mutate the store.

Use existing test patterns in:

- `src/features/training/components/TrainingRecordModal.test.ts`
- `src/features/training/contexts/TrainingPageContext.svelte.test.ts`
- `src/features/training/stores/personnelTrainings.svelte.test.ts`

**Verify**:
`npx vitest run src/features/training/contexts/TrainingPageContext.svelte.test.ts src/features/training/components/PersonTrainingEditor.svelte.test.ts`
-> all pass.

### Step 5: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test` ->
all commands exit 0.

## Test plan

- Component tests for the mark-all-complete action:
  - batch prop present -> one batch call, no N sequential saves.
  - batch prop absent -> existing sequential fallback still works.
  - expiration-date-only training types are excluded.
- Context tests for `handleSaveTrainingBatch`:
  - successful response merges inserted/updated results into the store.
  - failed response throws and does not merge.
- Verification: focused vitest command above plus the full repo gate.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg "onSaveBatch" src/features/training/components/PersonTrainingEditor.svelte src/features/training/components/TrainingModals.svelte src/features/training/contexts/TrainingPageContext.svelte.ts`
      returns the new prop, wiring, and handler.
- [ ] The mark-all-complete implementation has no unconditional `for ... await onSave(...)` path
      when `onSaveBatch` is provided.
- [ ] Focused component/context tests exit 0.
- [ ] `npm run format`, `npm run lint`, `npm run governance:check`, `npm run check`, and
      `npm run test` all exit 0.
- [ ] `git status` shows no modified files outside the in-scope list.
- [ ] `plans/README.md` status row for 020 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The batch endpoint no longer accepts `{ records }` or no longer returns `inserted`/`updated`.
- The batch use case stops calculating expiration dates itself; that would change the record shape
  this plan should send.
- `PersonTrainingEditor` has gained another production call site that cannot provide the batch
  handler and cannot tolerate the fallback.
- Svelte autofixer reports a structural issue you cannot resolve after two attempts.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- Reviewer should scrutinize whether the UI updates only after the batch request succeeds.
- Plan 021 improves the server-side batch implementation. This plan does not need to wait for it,
  but do not run both plans in parallel against the same files/tests.
- If future batch saves need certificate URLs, extend the server batch input deliberately; do not
  smuggle unsupported fields through this UI action.
