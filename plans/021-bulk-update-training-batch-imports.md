# Plan 021: Bulk upsert Training batch import rows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report -- do not improvise. When done, update the status row for this plan
> in `plans/README.md` -- unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- src/lib/server/core/useCases/trainingRecordsBatch.ts src/lib/server/core/useCases/trainingRecordsBatch.test.ts src/lib/server/core/ports.ts src/lib/server/adapters/supabaseDataStore.ts src/lib/server/adapters/inMemory.ts src/lib/server/adapters/scopedDataStore.ts src/lib/server/adapters/supabaseDataStore.test.ts src/lib/server/adapters/inMemory.test.ts src/lib/server/adapters/scopedDataStore.test.ts supabase/migrations/20260413001158_remote_schema.sql`
> If any listed path changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/020-batch-training-mark-all-complete.md (soft; coordinate if both touch training tests)
- **Category**: perf
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

The bulk training importer already batches inserts, but it still updates existing training records
one row at a time. A CSV import with 300 existing completions becomes one lookup plus 300 update
round trips. The `personnel_trainings` table has a unique key on organization/person/training type,
so the importer can send completed rows through one bulk upsert and then split the returned rows
back into `inserted` and `updated` for the existing API response.

## Current state

- `src/lib/server/core/useCases/trainingRecordsBatch.ts` separates completed records into
  `insertRows` and `updateRows`, bulk inserts new rows, then loops updates one by one:

```ts
// src/lib/server/core/useCases/trainingRecordsBatch.ts:177-192
// Bulk insert
let insertedData: Record<string, unknown>[] = [];
if (insertRows.length > 0) {
	insertedData = await ctx.store.insertMany<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		insertRows.map((r) => r.row)
	);
}

// Individual updates
const updatedData: Record<string, unknown>[] = [];
for (const rec of updateRows) {
	const updated = await ctx.store.update<Record<string, unknown>>(entity.table, ctx.auth.orgId, rec.id, rec.row);
	updatedData.push(updated);
}
```

- The `DataStore` port has `insertMany` but no bulk upsert/update shape:

```ts
// src/lib/server/core/ports.ts:65-87
export interface DataStore {
	findOne<T>(...): Promise<T | null>;
	findMany<T>(...): Promise<T[]>;
	insert<T>(...): Promise<T>;
	update<T>(...): Promise<T>;
	...
	deleteManyByIds(table: string, orgId: string, ids: string[]): Promise<number>;
	insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]>;
}
```

- The Supabase adapter has a single-row `update` and multi-row `insertMany`:

```ts
// src/lib/server/adapters/supabaseDataStore.ts:280-298
async update<T>(table, orgId, id, data, select) {
	const orgColumn = getOrgColumn(table);
	const { data: row, error } = await supabase
		.from(table)
		.update(data)
		.eq(orgColumn, orgId)
		.eq('id', id)
		.select(select ?? '*')
		.single();
	...
}

// src/lib/server/adapters/supabaseDataStore.ts:350-360
async insertMany<T>(table, orgId, rows, select) {
	const orgColumn = getOrgColumn(table);
	const withOrg = rows.map((row) => ({ ...row, [orgColumn]: orgId }));
	const { data, error } = await supabase.from(table).insert(withOrg).select(select ?? '*');
	...
}
```

- The schema supports safe upsert:

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:2369-2379
CREATE TABLE IF NOT EXISTS "public"."personnel_trainings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "training_type_id" "uuid" NOT NULL,
    "completion_date" "date",
    "expiration_date" "date",
    "notes" "text",
    "certificate_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- supabase/migrations/20260413001158_remote_schema.sql:2795-2796
ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_clinic_id_personnel_id_training_type_id_key"
    UNIQUE ("organization_id", "personnel_id", "training_type_id");
```

- `src/lib/server/adapters/scopedDataStore.ts` returns a `DataStore` wrapper and currently
  pass-throughs write operations at lines 159-167. Any new write method on `DataStore` needs a
  pass-through there.

## Commands you will need

| Purpose          | Command                                                                                                                                                     | Expected on success |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Use-case tests   | `npx vitest run src/lib/server/core/useCases/trainingRecordsBatch.test.ts`                                                                                  | all pass            |
| Adapter tests    | `npx vitest run src/lib/server/adapters/inMemory.test.ts src/lib/server/adapters/scopedDataStore.test.ts src/lib/server/adapters/supabaseDataStore.test.ts` | all pass            |
| Batch route test | `npx vitest run src/routes/org/'[orgId]'/api/personnel-trainings/batch/server.test.ts`                                                                      | all pass            |
| Typecheck        | `npm run check`                                                                                                                                             | exit 0, 0 errors    |
| Lint             | `npm run lint`                                                                                                                                              | exit 0              |
| Format           | `npm run format`                                                                                                                                            | exit 0              |
| Governance       | `npm run governance:check`                                                                                                                                  | exit 0              |
| Full tests       | `npm run test`                                                                                                                                              | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/lib/server/core/ports.ts`
- `src/lib/server/adapters/supabaseDataStore.ts`
- `src/lib/server/adapters/inMemory.ts`
- `src/lib/server/adapters/scopedDataStore.ts`
- `src/lib/server/core/useCases/trainingRecordsBatch.ts`
- `src/lib/server/core/useCases/trainingRecordsBatch.test.ts`
- `src/lib/server/adapters/supabaseDataStore.test.ts`
- `src/lib/server/adapters/inMemory.test.ts`
- `src/lib/server/adapters/scopedDataStore.test.ts`
- Test-only `DataStore` fakes that fail typecheck solely because the new method is required.
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- Training UI components -- plan 020 handles the user-facing batch button.
- The public batch route response shape: keep `inserted`, `updated`, `exempted`, and `errors`.
- Supabase schema/migrations. The required unique key already exists.
- Exemption update loops in `trainingRecordsBatch.ts`; this plan targets completed-record insert/update throughput only.

## Git workflow

- Branch: `advisor/021-bulk-update-training-batch-imports`
- Commit style: short imperative subject. Suggested:
  `Bulk upsert training import rows`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a bulk upsert method to the DataStore port

In `src/lib/server/core/ports.ts`, add a method after `insertMany`:

```ts
upsertMany<T>(
	table: string,
	orgId: string,
	rows: Record<string, unknown>[],
	options: { onConflict: string; select?: string }
): Promise<T[]>;
```

Make it required, not optional. This is a real persistence capability the use case depends on.

**Verify**: `npm run check` will fail until adapters and test fakes are updated; use this failure
only to find every required implementation.

### Step 2: Implement `upsertMany` in all DataStore adapters

In `src/lib/server/adapters/supabaseDataStore.ts`, mirror `insertMany` but call Supabase
`.upsert(...)`:

```ts
async upsertMany<T>(table, orgId, rows, options): Promise<T[]> {
	if (rows.length === 0) return [];
	const orgColumn = getOrgColumn(table);
	const withOrg = rows.map((row) => ({ ...row, [orgColumn]: orgId }));

	const { data, error } = await supabase
		.from(table)
		.upsert(withOrg, { onConflict: options.onConflict })
		.select(options.select ?? '*');

	if (error) throw new Error(error.message);
	return (data ?? []) as T[];
}
```

In `src/lib/server/adapters/inMemory.ts`, implement matching behavior:

- Add the org column to each row, as `insertMany` does.
- Parse `options.onConflict` into conflict column names.
- For each incoming row, find an existing row in the same table whose conflict-column values all
  match.
- If found, merge the incoming row into that row while preserving the existing `id` unless the
  incoming row explicitly supplies the same `id`.
- If not found, insert a new row using the same ID/default behavior as `insertMany`.
- Return the upserted rows.

In `src/lib/server/adapters/scopedDataStore.ts`, pass the method through with the other writes:

```ts
upsertMany: inner.upsertMany.bind(inner);
```

Update any test-only `DataStore` fakes that fail typecheck by delegating to an in-memory store or
throwing a clear "not implemented in this test" error if the test cannot call the method.

**Verify**:
`npx vitest run src/lib/server/adapters/inMemory.test.ts src/lib/server/adapters/scopedDataStore.test.ts src/lib/server/adapters/supabaseDataStore.test.ts`
-> all pass.

### Step 3: Replace insert-plus-update loop with one upsert in the training batch use case

In `src/lib/server/core/useCases/trainingRecordsBatch.ts`:

1. Keep the existing validation, policy checks, training type lookups, and `existingRecords` map.
2. Keep classifying records into "already existed" vs "new" so the API can still return separate
   `inserted` and `updated` arrays.
3. Build one `completedRows` array for all non-exempt valid records. Include:
   - `personnel_id`
   - `training_type_id`
   - `completion_date`
   - `expiration_date`
   - `notes`
   - `updated_at: new Date().toISOString()`
4. Call:

```ts
const upsertedData = await ctx.store.upsertMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, completedRows, {
	onConflict: 'organization_id,personnel_id,training_type_id'
});
```

5. Split `upsertedData` into `insertedData` and `updatedData` by comparing each returned row's
   `(personnel_id, training_type_id)` key against the `existingRecords` map captured before the
   upsert.
6. Preserve `exemptedResults`, `errors`, and `summary` shape.

Do not use primary-key `id` for the upsert path. Existing imports are keyed by person/training
type, and the database unique key exists for exactly that.

**Verify**: `npx vitest run src/lib/server/core/useCases/trainingRecordsBatch.test.ts` -> all pass.

### Step 4: Add regression tests for operation count and response shape

Update `src/lib/server/core/useCases/trainingRecordsBatch.test.ts` to prove:

1. A mixed import with one existing training and one new training calls `ctx.store.upsertMany` once.
2. The same mixed import does not call `ctx.store.update` per existing row.
3. The returned `inserted` and `updated` arrays remain correctly split.
4. Error rows are not included in the upsert payload.
5. Exempt rows continue through the existing exemption path.

Update adapter tests:

- `src/lib/server/adapters/inMemory.test.ts` -- `upsertMany` updates matching conflict rows and
  inserts non-matching rows.
- `src/lib/server/adapters/scopedDataStore.test.ts` -- write operation passes through unchanged.
- `src/lib/server/adapters/supabaseDataStore.test.ts` -- mocked Supabase client receives
  `.upsert(..., { onConflict: 'organization_id,personnel_id,training_type_id' })` and `.select('*')`.

**Verify**:
`npx vitest run src/lib/server/core/useCases/trainingRecordsBatch.test.ts src/lib/server/adapters/inMemory.test.ts src/lib/server/adapters/scopedDataStore.test.ts src/lib/server/adapters/supabaseDataStore.test.ts`
-> all pass.

### Step 5: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test` ->
all commands exit 0.

## Test plan

- Use-case tests:
  - mixed existing/new completed records use one `upsertMany` call.
  - no per-row `update` calls for completed records.
  - API response still separates `inserted` and `updated`.
  - errors and exemptions keep current behavior.
- Adapter tests:
  - Supabase adapter calls `.upsert` with the exact conflict columns.
  - In-memory adapter mirrors conflict-column upsert behavior.
  - Scoped adapter delegates `upsertMany`.
- Verification: focused vitest commands plus the full repo gate.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg "upsertMany" src/lib/server/core/ports.ts src/lib/server/adapters src/lib/server/core/useCases/trainingRecordsBatch.ts`
      shows the port, adapters, and training batch use case.
- [ ] `rg "for \\(const rec of updateRows\\)" src/lib/server/core/useCases/trainingRecordsBatch.ts`
      returns no match.
- [ ] Focused use-case and adapter vitest commands exit 0.
- [ ] `npm run format`, `npm run lint`, `npm run governance:check`, `npm run check`, and
      `npm run test` all exit 0.
- [ ] The batch API response shape remains `inserted`, `updated`, `exempted`, `errors`.
- [ ] `git status` shows no modified files outside the in-scope list except test-only `DataStore`
      fakes required by TypeScript.
- [ ] `plans/README.md` status row for 021 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The unique constraint on `personnel_trainings (organization_id, personnel_id, training_type_id)`
  is missing in the live schema/migrations.
- Supabase JS in this project cannot express the required `upsert(..., { onConflict })` with a
  returned `select`.
- Splitting returned rows into inserted/updated cannot be made deterministic from the
  pre-upsert `existingRecords` map.
- Adding the required DataStore method forces broad production changes outside the adapters/use
  case listed above.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- Reviewer should focus on response-shape compatibility and authorization order. All policy checks
  must still happen before any write.
- This plan intentionally does not optimize exemption updates; that path changes training type
  configuration and needs a separate design if it becomes hot.
- The in-memory adapter must remain behaviorally close enough for use-case tests. Do not make the
  use case branch on adapter type.
