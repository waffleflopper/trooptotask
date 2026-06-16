# Plan 073: Use local date-only helpers in onboarding and imports

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat b3acfabb..HEAD -- src/lib/utils/dates.ts src/lib/utils/dates.test.ts src/lib/utils/csvParser.ts src/lib/utils/csvParser.test.ts src/lib/server/core/useCases/onboardingLifecycle.ts src/lib/server/core/useCases/onboardingLifecycle.test.ts src/features/onboarding/stores/onboarding.svelte.ts src/features/onboarding/stores/onboarding.svelte.test.ts src/features/onboarding/components/StartOnboardingModal.test.ts plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b3acfabb`, 2026-06-14

## Why this matters

Date-only values such as onboarding start/completion dates and imported
training completion dates should follow the user's local calendar day. The repo
already has a shared `formatDate(date)` helper that formats local date parts,
and sign-in roster defaults now use it. A few remaining paths still use
`new Date().toISOString().split('T')[0]` or `.slice(0, 10)`, which can record
tomorrow for America/Anchorage users during the local evening.

## Current state

- `src/lib/utils/dates.ts` exports `formatDate(date)` using local
  `getFullYear/getMonth/getDate` parts.
- `StartOnboardingModal.test.ts` already has an Anchorage boundary regression
  for the start-date UI default.
- `onboardingLifecycle.ts` falls back to UTC slicing when `startedAt` is
  omitted.
- `onboarding.svelte.ts` uses UTC slicing for optimistic completion state.
- `csvParser.ts` uses UTC slicing for XLSX `Date` cells and for
  `parseTrainingStatus('yes')` / completed aliases.
- `csvParser.ts` intentionally uses UTC for Excel serial numbers; leave that
  behavior intact.

Current excerpts:

```ts
// src/lib/utils/dates.ts:34
/** "YYYY-MM-DD" - for form values and API data */
export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
```

```ts
// src/lib/server/core/useCases/onboardingLifecycle.ts:185
function resolveStartedAt(startedAt?: string): string {
	if (startedAt === undefined) {
		return new Date().toISOString().split('T')[0];
	}
```

```ts
// src/features/onboarding/stores/onboarding.svelte.ts:341
async completeOnboarding(id: string): Promise<boolean> {
	const display = getDisplay();
	const original = display.find((o) => o.id === id);
	if (!original) return false;

	const today = new Date().toISOString().split('T')[0];
```

```ts
// src/lib/utils/csvParser.ts:74
function cellToString(value: unknown): string {
	if (value == null) return '';
	if (value instanceof Date) return value.toISOString().slice(0, 10);
```

```ts
// src/lib/utils/csvParser.ts:157
// Yes/completed values -> completed today
if (['yes', 'y', 'true', '1', 'complete', 'completed', 'done', 'x'].includes(v)) {
	const today = new Date().toISOString().slice(0, 10);
	return { type: 'completed', date: today, raw };
}
```

```ts
// src/lib/utils/csvParser.ts:201
// Excel epoch: Jan 1, 1900, with the leap year bug (UTC to keep imports timezone-independent)
const ms = Date.UTC(1900, 0, 1) + (serial - 2) * 86400000;
const d = new Date(ms);
if (!isNaN(d.getTime())) {
	return d.toISOString().slice(0, 10);
}
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Date helper tests | `npx vitest run src/lib/utils/dates.test.ts` | exits 0 |
| CSV parser tests | `TZ=America/Anchorage npx vitest run src/lib/utils/csvParser.test.ts` | exits 0 |
| Onboarding tests | `TZ=America/Anchorage npx vitest run src/lib/server/core/useCases/onboardingLifecycle.test.ts src/features/onboarding/stores/onboarding.svelte.test.ts src/features/onboarding/components/StartOnboardingModal.test.ts` | exits 0 |
| Svelte autofixer | `svelte-autofixer src/features/onboarding/stores/onboarding.svelte.ts` | no issues or suggestions if this file is edited |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Suggested executor toolkit

- This plan touches a `.svelte.ts` store. Follow the repo's Svelte MCP
  documentation flow from `AGENTS.md`, then run `svelte-autofixer` on the edited
  Svelte store until it reports no issues or suggestions.

## Scope

**In scope**:

- `src/lib/utils/dates.ts`
- `src/lib/utils/dates.test.ts`
- `src/lib/utils/csvParser.ts`
- `src/lib/utils/csvParser.test.ts`
- `src/lib/server/core/useCases/onboardingLifecycle.ts`
- `src/lib/server/core/useCases/onboardingLifecycle.test.ts`
- `src/features/onboarding/stores/onboarding.svelte.ts`
- `src/features/onboarding/stores/onboarding.svelte.test.ts`
- `src/features/onboarding/components/StartOnboardingModal.test.ts` only if an
  existing helper/test setup should be reused
- `plans/README.md` status row only

**Out of scope**:

- Do not change timestamp fields such as audit timestamps, `created_at`,
  `updated_at`, billing event timestamps, or lifecycle timestamp columns that
  are intentionally absolute instants.
- Do not change Excel serial-number parsing in `csvParser.ts`; the current UTC
  math is explicitly timezone-independent and was previously fixed.
- Do not broadly replace every `toISOString()` in the repo.
- Do not change Personnel export filename dates or Training/Critical Tasks
  report generation dates in this plan; those need separate product semantics.
- Do not add migrations.

## Git workflow

- Branch: `codex/073-use-local-date-only-helpers`
- Commit style: short imperative subject. Suggested:
  `Use local date-only helpers`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Centralize the date-only helper call

Use the existing `formatDate(date)` helper for current local date values. If
you need a readability wrapper, add it in `src/lib/utils/dates.ts`, for example
`formatToday(date = new Date())`, but do not duplicate local date formatting
logic elsewhere.

Add or update `dates.test.ts` with an Anchorage boundary case:

- `process.env.TZ = 'America/Anchorage'`
- fake time `2026-05-05T02:00:00.000Z`
- expected local date `2026-05-04`

**Verify**:
`npx vitest run src/lib/utils/dates.test.ts` exits 0.

### Step 2: Fix onboarding server fallback date

Update `resolveStartedAt()` in `onboardingLifecycle.ts` so the omitted
`startedAt` fallback uses the shared local date helper. Keep explicit
`YYYY-MM-DD` validation unchanged.

Add a test in `onboardingLifecycle.test.ts` that starts onboarding without
`startedAt` under `TZ=America/Anchorage` near UTC midnight and expects the local
date.

**Verify**:
`TZ=America/Anchorage npx vitest run src/lib/server/core/useCases/onboardingLifecycle.test.ts`
exits 0.

### Step 3: Fix onboarding optimistic completion date

Update `src/features/onboarding/stores/onboarding.svelte.ts` so
`completeOnboarding()` uses the shared local date helper for the optimistic
`completedAt` date-only field.

Add a store test that:

- sets `TZ=America/Anchorage`,
- fakes time to `2026-05-05T02:00:00.000Z`,
- calls `completeOnboarding`,
- verifies the optimistic payload contains `completedAt: '2026-05-04'`.

If importing `formatDate` conflicts with an existing local `formatDate` name,
alias the import.

**Verify**:
`TZ=America/Anchorage npx vitest run src/features/onboarding/stores/onboarding.svelte.test.ts`
exits 0, then run `svelte-autofixer` on the edited store.

### Step 4: Fix CSV/XLSX date-only parsing

Update `csvParser.ts` so:

- `Date` cell values use local date parts through `formatDate(value)`,
- completed aliases in `parseTrainingStatus()` use local today,
- Excel serial-number parsing remains unchanged and timezone-independent.

Add tests under `TZ=America/Anchorage` for:

- an XLSX `Date` cell at `2026-05-05T02:00:00.000Z` parses as
  `2026-05-04`,
- `parseTrainingStatus('yes')` at that fake time returns
  `{ type: 'completed', date: '2026-05-04' }`,
- Excel serial date expectations remain the same.

**Verify**:
`TZ=America/Anchorage npx vitest run src/lib/utils/csvParser.test.ts` exits 0.

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

- Local-date helper Anchorage boundary test.
- Onboarding server fallback Anchorage boundary test.
- Onboarding optimistic completion Anchorage boundary test.
- CSV/XLSX date cell and completed alias Anchorage boundary tests.
- Regression test that Excel serial parsing is unchanged.
- Full repo gate.

## Done criteria

- [ ] No in-scope user-facing date-only default uses UTC string slicing.
- [ ] Onboarding omitted start date and optimistic completion date use local
      calendar semantics.
- [ ] CSV/XLSX Date cells and completed aliases use local calendar semantics.
- [ ] Excel serial parsing remains timezone-independent.
- [ ] Svelte autofixer is clean for edited Svelte files.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 073 is updated.

## STOP conditions

Stop and report back if:

- Product requirements say server-only onboarding fallback dates should use an
  organization timezone rather than the server/runtime local timezone.
- A CSV/XLSX parser test proves ExcelJS `Date` cells are already normalized in
  a way that makes local formatting incorrect.
- Fixing additional `toISOString().split('T')[0]` call sites would require
  changing report/export semantics outside this plan.

## Maintenance notes

Use `formatDate(new Date())` for date-only values shown to or submitted by a
user. Use `toISOString()` for timestamps and absolute instants. Reviewers
should reject future date-only UI defaults that slice ISO strings without an
explicit timezone policy.
