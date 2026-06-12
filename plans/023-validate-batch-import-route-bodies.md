# Plan 023: Validate batch import route bodies with zod schemas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79cfef20..HEAD -- "src/routes/org/[orgId]/api/personnel/batch" "src/routes/org/[orgId]/api/daily-assignments/batch" "src/routes/org/[orgId]/api/ict-tasks/batch"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `79cfef20`, 2026-06-11

## Why this matters

The repo's API route wrapper (`src/lib/server/adapters/httpAdapter.ts`) documents itself as the
layer that "parses + validates input, enforces permissions, calls the use case". When a route's
`RouteConfig` omits the `input` zod schema, the adapter passes the raw JSON body straight through:
`input = rawInput as TInput` (httpAdapter.ts:346). Three batch-import routes do exactly that and
then cast `input.records` with a TypeScript `as` — a compile-time lie with zero runtime checking.
Consequences today: a non-array `records` produces an opaque 500 instead of a clean 400, and —
more importantly — unknown keys ride through the cast. The daily-assignments use case type
(`DailyAssignmentSlotRecord`) accepts optional `dutyRosterTemplateRunId`, `sourceLineage`, and
`dutyRosterTemplateRunRowDate` fields, so a hand-crafted request to the batch endpoint can smuggle
duty-roster lineage metadata onto assignments that the UI never sends. Adding structural zod
schemas restores the wrapper's contract: malformed bodies get 400s, unknown keys are stripped
(zod's default), and the use cases keep doing the per-row semantic validation they already do.

## Current state

- `src/lib/server/adapters/httpAdapter.ts` — the route wrapper. The validation branch:

```ts
// src/lib/server/adapters/httpAdapter.ts:337-346 (as of 79cfef20)
// 2. Zod input validation
let input: TInput;
if (config.input) {
	const result = config.input.safeParse(rawInput);
	if (!result.success) {
		fail(400, result.error.issues.map((i) => i.message).join('; '));
	}
	input = result.data;
} else {
	input = rawInput as TInput;
}
```

- `src/routes/org/[orgId]/api/personnel/batch/+server.ts` — full current contents:

```ts
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { importPersonnelBatch } from '$lib/server/core/useCases/personnelBatch';

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) =>
		importPersonnelBatch(ctx, {
			records: input.records as Array<{
				rank: string;
				lastName: string;
				firstName: string;
				mos?: string | null;
				clinicRole?: string | null;
				groupName?: string | null;
				ets?: string | null;
				deros?: string | null;
			}>
		})
};

export const POST = handle(_postConfig);
```

- `src/routes/org/[orgId]/api/daily-assignments/batch/+server.ts` — full current contents:

```ts
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { batchDailyAssignments } from '$lib/server/core/useCases/dailyAssignmentsBatch';

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		return batchDailyAssignments(ctx, {
			records: input.records as Array<{ date: string; assignmentTypeId: string; assigneeId: string }>
		});
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const POST = handle(_postConfig);
```

- `src/routes/org/[orgId]/api/ict-tasks/batch/+server.ts` — full current contents. Note it does
  NOT export a `_postConfig` (unlike the other two) and has no colocated test:

```ts
import { handle } from '$lib/server/adapters/httpAdapter';
import { importIctTasksBatch } from '$lib/server/core/useCases/ictTasksBatch';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const POST = handle<Record<string, unknown>, unknown>({
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
	fn: (ctx, input) =>
		importIctTasksBatch(ctx, {
			mode: input.mode as 'create-only' | 'upsert',
			records: (input.records as Array<{ rowNumber: number; values: Record<string, string> }>) ?? []
		})
});
```

- The repo exemplar for a route WITH an input schema —
  `src/routes/org/[orgId]/api/onboarding-template-steps/reorder/+server.ts`:

```ts
export const POST = handle({
	mutation: true,
	policyAction,
	policyResource: { kind: 'unscoped' },
	input: z.object({
		templateId: z.string(),
		orderedStepIds: z.array(z.string())
	}),
	fn: reorderOnboardingTemplateSteps
});
```

- Client callers (read-only references — they define the real payload shapes the schemas must
  accept):
  - `src/features/calendar/stores/dailyAssignments.svelte.ts:281-285` — POSTs
    `{ records: [{ date, assignmentTypeId, assigneeId }] }`. **`assigneeId` can legitimately be
    the empty string** (its test at `dailyAssignments.svelte.test.ts:509-513` sends
    `assigneeId: ''`). Do NOT add `.min(1)` to it.
  - `src/features/critical-tasks/stores/ictTasks.svelte.ts` — the ict-tasks batch caller.
  - `src/features/personnel/components/PersonnelImportPage.test.ts` — pins the personnel batch
    payload shape.

- Per-row semantic validation already lives in the use cases and must STAY there:
  `src/lib/server/core/useCases/personnelBatch.ts` validates dates per-row and reports row-level
  errors (`validateBatchDateFields`, line 64); `ictTasksBatch.ts` reviews `invalidRows`. The new
  zod schemas are **structural only** (types and shape). If you make a field semantically strict
  (e.g. date regex, non-empty names), one bad row would 400 the whole request and break the
  per-row error-reporting UX of the bulk importers.

- Existing route-config test pattern —
  `src/routes/org/[orgId]/api/daily-assignments/batch/server.test.ts` (full contents):

```ts
import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _postConfig } from './+server';

describe('/api/daily-assignments/batch route config', () => {
	it('uses a policy-first config for batch assignment mutations', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.manageAssignments);
		expect(_postConfig.policyResource).toEqual({ kind: 'unscoped' });
		expect(_postConfig.mutation).toBe(true);
	});
});
```

- Zod is v4 (`zod: ^4.3.6` in package.json). In zod v4, `z.record` takes two arguments:
  `z.record(z.string(), z.string())`.

## Commands you will need

| Purpose    | Command                                       | Expected on success |
| ---------- | --------------------------------------------- | ------------------- |
| Unit tests | `npx vitest run "src/routes/org/[orgId]/api"` | all pass            |
| Full tests | `npm run test`                                | exit 0              |
| Typecheck  | `npm run check`                               | exit 0, 0 errors    |
| Lint       | `npm run lint`                                | exit 0              |
| Format     | `npm run format`                              | exit 0              |
| Governance | `npm run governance:check`                    | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/routes/org/[orgId]/api/personnel/batch/+server.ts`
- `src/routes/org/[orgId]/api/personnel/batch/server.test.ts`
- `src/routes/org/[orgId]/api/daily-assignments/batch/+server.ts`
- `src/routes/org/[orgId]/api/daily-assignments/batch/server.test.ts`
- `src/routes/org/[orgId]/api/ict-tasks/batch/+server.ts`
- `src/routes/org/[orgId]/api/ict-tasks/batch/server.test.ts` (create)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/server/adapters/httpAdapter.ts` — the validation branch is correct; the gap is in the
  routes.
- The use cases (`personnelBatch.ts`, `dailyAssignmentsBatch.ts`, `ictTasksBatch.ts`,
  `daily-assignment-slots/`) — their per-row validation is the semantic layer; leave it.
- The client stores/components — they already send conforming payloads.
- Other routes without `input` schemas (there are more across the API) — fix only these three
  batch routes; list any others you notice in your final report.

## Git workflow

- Branch: `advisor/023-validate-batch-import-route-bodies`
- Commit style: short imperative subject, matching repo history (e.g. "Harden archive retention
  cron auth"). Suggested: `Validate batch import route bodies`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the schema to the daily-assignments batch route

In `src/routes/org/[orgId]/api/daily-assignments/batch/+server.ts`, add `import { z } from 'zod';`
and an `input` schema, and remove the cast:

```ts
const batchInput = z.object({
	records: z.array(
		z.object({
			date: z.string(),
			assignmentTypeId: z.string(),
			assigneeId: z.string() // '' is a legitimate value (clears a slot) — no .min(1)
		})
	)
});

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	input: batchInput,
	fn: async (ctx, input) => batchDailyAssignments(ctx, { records: input.records })
} satisfies RouteConfig<z.infer<typeof batchInput>, unknown>;
```

Note: `batchDailyAssignments` accepts `DailyAssignmentSlotRecord[]`, whose extra fields are all
optional, so the narrowed 3-field record type assigns cleanly. The zod object default behavior
(strip unknown keys) is what blocks lineage-field smuggling — do NOT use `.passthrough()`.

**Verify**: `npm run check` → exit 0.

### Step 2: Add the schema to the personnel batch route

Same pattern in `src/routes/org/[orgId]/api/personnel/batch/+server.ts`:

```ts
const batchInput = z.object({
	records: z.array(
		z.object({
			rank: z.string(),
			lastName: z.string(),
			firstName: z.string(),
			mos: z.string().nullable().optional(),
			clinicRole: z.string().nullable().optional(),
			groupName: z.string().nullable().optional(),
			ets: z.string().nullable().optional(),
			deros: z.string().nullable().optional()
		})
	)
});
```

Required fields stay `z.string()` (possibly empty) — empty-value handling is per-row business
logic in `importPersonnelBatch`. Before finalizing, open
`src/features/personnel/components/PersonnelImportPage.test.ts` and confirm the payload it pins
always includes `rank`, `lastName`, `firstName` keys on every record. If any record in that test
omits one of those keys, make that field `.optional()` in the schema instead of changing the test.

**Verify**: `npx vitest run "src/routes/org/[orgId]/api/personnel/batch/server.test.ts" "src/features/personnel/components/PersonnelImportPage.test.ts"` → all pass.

### Step 3: Restructure and add the schema to the ict-tasks batch route

In `src/routes/org/[orgId]/api/ict-tasks/batch/+server.ts`, first match the convention of the
other two routes (exported `_postConfig` + `export const POST = handle(_postConfig)`), then add:

```ts
const batchInput = z.object({
	mode: z.enum(['create-only', 'upsert']),
	records: z.array(z.object({ rowNumber: z.number(), values: z.record(z.string(), z.string()) })).default([])
});
```

Before finalizing, open `src/features/critical-tasks/stores/ictTasks.svelte.ts` and confirm the
client always sends a `mode` value from `{'create-only','upsert'}`. If the client can omit
`mode`, check what `importIctTasksBatch` does with `undefined` and mirror that with
`.default(...)` rather than rejecting — preserving current behavior is the rule.

**Verify**: `npm run check` → exit 0.

### Step 4: Add and extend the route tests

1. Extend `src/routes/org/[orgId]/api/daily-assignments/batch/server.test.ts` with schema tests
   (the existing config test stays):
   - `_postConfig.input.safeParse({ records: [{ date: '2026-03-20', assignmentTypeId: 't1', assigneeId: '' }] })` → `success: true`.
   - `_postConfig.input.safeParse({ records: 'nope' })` → `success: false`.
   - Unknown keys are stripped: parse a record that also carries
     `dutyRosterTemplateRunId: 'smuggled'` and assert the parsed record has no
     `dutyRosterTemplateRunId` key (`expect(parsed.records[0]).not.toHaveProperty('dutyRosterTemplateRunId')`).
2. Extend `src/routes/org/[orgId]/api/personnel/batch/server.test.ts` the same way (valid record
   parses; `records: {}` fails; an unknown key like `isAdmin: true` is stripped).
3. Create `src/routes/org/[orgId]/api/ict-tasks/batch/server.test.ts` modeled on the
   daily-assignments test: assert `policyAction` is
   `POLICY_ACTION_CATALOG.criticalTasks.configureLibrary`, `mutation` is true, plus the schema
   cases (valid payload parses; missing `records` defaults to `[]`; bad `mode` fails).

**Verify**: `npx vitest run "src/routes/org/[orgId]/api"` → all pass, including the new tests.

### Step 5: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` → all exit 0.

## Test plan

- New/extended tests (pattern: the existing `server.test.ts` config tests shown above):
  - Each route's `input` schema accepts the exact payload its client store sends (happy path).
  - Non-array / wrong-type `records` fails parsing (the 400-instead-of-500 regression).
  - Unknown keys are stripped — specifically `dutyRosterTemplateRunId` on daily-assignments
    (the lineage-smuggling fix this plan exists for).
  - ict-tasks: `records` missing defaults to `[]`; invalid `mode` fails.
- Verification: `npx vitest run "src/routes/org/[orgId]/api"` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -L "input:" "src/routes/org/[orgId]/api/personnel/batch/+server.ts" "src/routes/org/[orgId]/api/daily-assignments/batch/+server.ts" "src/routes/org/[orgId]/api/ict-tasks/batch/+server.ts"` prints nothing (all three define `input:`)
- [ ] `grep -rn "as Array<" "src/routes/org/[orgId]/api/personnel/batch" "src/routes/org/[orgId]/api/daily-assignments/batch" "src/routes/org/[orgId]/api/ict-tasks/batch" --include="+server.ts"` returns no matches
- [ ] `npx vitest run "src/routes/org/[orgId]/api"` exits 0
- [ ] `npm run check`, `npm run lint`, `npm run test` all exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 023 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the three route files no longer matches its "Current state" excerpt.
- A client store sends a payload shape the schema in this plan would reject (e.g. extra REQUIRED
  semantics, missing `mode`) and you cannot preserve behavior with `.optional()`/`.default()` —
  report the mismatch instead of loosening to `z.any()` or `.passthrough()`.
- Any existing test fails after adding a schema — that means real traffic shape differs from the
  documented cast; report which test and which field.
- The fix appears to require changing a use case signature.

## Maintenance notes

- Any new route added under `src/routes/org/[orgId]/api` should define `input` — the adapter's
  `input = rawInput as TInput` fallback (httpAdapter.ts:346) exists for legacy routes, not new
  ones. Consider a follow-up governance check that flags `RouteConfig` objects with `fn` but no
  `input` (deferred from this plan: it needs a survey of how many legacy routes would fail it).
- Reviewer should scrutinize: that no schema added semantic validation (non-empty, date format) —
  that belongs to the use cases' per-row error reporting; and that the daily-assignments schema
  did not accidentally allow lineage fields.
- If the duty-roster feature ever needs to send lineage fields over HTTP (today it goes through
  server-side use cases directly), the schema must be extended deliberately, with authorization
  thought through — that is exactly the decision this schema forces into the open.
