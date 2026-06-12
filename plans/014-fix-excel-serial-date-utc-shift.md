# Plan 014: Fix Excel serial dates shifting one day for UTC+ timezones in import parsing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- src/lib/utils/csvParser.ts src/lib/utils/csvParser.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

Bulk imports (availability statuses, training records) parse spreadsheet cells through
`parseDateString` in `src/lib/utils/csvParser.ts`. Excel often stores dates as serial numbers
(days since the 1900 epoch). The current conversion builds the epoch with `new Date(1900, 0, 1)`
— **local time** — then formats with `toISOString()` — **UTC**. For any server/dev machine in a
positive UTC offset (Germany, Korea, Japan — exactly where deployed units run), local midnight is
the previous day in UTC, so every imported Excel serial date comes out **one day early**. The
fallback branch a few lines below explicitly avoids this trap (its comment says "use local date
parts to avoid UTC offset shifting the date"), so this branch is an acknowledged-pitfall
inconsistency, not a design choice. The fix makes the serial branch timezone-independent.

## Current state

- `src/lib/utils/csvParser.ts` — shared import parsing utilities. `parseDateString` is exported
  at line 193 and normalizes ISO, US, Excel-serial, and free-form dates to `YYYY-MM-DD`. The
  buggy branch:

```ts
// src/lib/utils/csvParser.ts:210-222 (as of 22e6e184)
	// Excel serial number
	if (/^\d+$/.test(trimmed)) {
		const serial = parseInt(trimmed, 10);
		if (serial >= 25569 && serial <= 60000) {
			// Excel epoch: Jan 1, 1900, with the leap year bug
			const excelEpoch = new Date(1900, 0, 1);            // ← local-time epoch
			const ms = excelEpoch.getTime() + (serial - 2) * 86400000;
			const d = new Date(ms);
			if (!isNaN(d.getTime())) {
				return d.toISOString().slice(0, 10);             // ← UTC formatting
			}
		}
	}
```

  The `(serial - 2)` arithmetic is correct (1-based serial plus Excel's 1900 leap-year bug);
  keep it. Only the local/UTC mismatch is wrong.

- The fallback branch immediately after (lines 224-231) shows the repo's intended convention —
  it formats from local date parts precisely to avoid offset shifting:

```ts
// src/lib/utils/csvParser.ts:224-231
	// Fallback: JS Date.parse (use local date parts to avoid UTC offset shifting the date)
	const d = new Date(trimmed);
	if (!isNaN(d.getTime())) {
		const yyyy = d.getFullYear();
		...
```

- `src/lib/utils/csvParser.test.ts` — existing vitest suite with a `describe('parseDateString')`
  block (line 59) of small input→output assertions, e.g.
  `expect(parseDateString('2026-03-13')).toBe('2026-03-13')`. There are currently **no tests for
  the Excel serial branch**. Model new tests on this block.

- Reference values for tests (true regardless of timezone once fixed):
  - serial `25569` → `1970-01-01` (the Unix epoch; also the branch's lower bound)
  - serial `45292` → `2024-01-01`
  - serial `60000` → `2064-04-08` (upper bound)
  - serial `25568` and `60001` → fall through the range check (must NOT return a serial-derived
    date; with the current code they reach the free-form fallback and return null since bare
    integers like `"25568"` don't parse as dates — assert `null`)

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted tests | `npx vitest run src/lib/utils/csvParser.test.ts` | all pass |
| Targeted tests under UTC+9 | `TZ=Asia/Seoul npx vitest run src/lib/utils/csvParser.test.ts` | all pass |
| Targeted tests under UTC-5 | `TZ=America/New_York npx vitest run src/lib/utils/csvParser.test.ts` | all pass |
| Full tests | `npm run test` | exit 0 |
| Typecheck | `npm run check` | exit 0 |
| Lint / format / governance | `npm run lint && npm run format && npm run governance:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/lib/utils/csvParser.ts` (the Excel serial branch only)
- `src/lib/utils/csvParser.test.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- The ISO, US-format, and free-form fallback branches of `parseDateString` — they are correct.
- `parseFile`, `parseDelimitedText`, `parseTrainingStatus`, `cellToString` in the same file.
- Any import feature code that calls `parseDateString` (bulk availability import, training
  import) — the fix is entirely inside the utility.
- `src/lib/utils/dates.ts` — separate date helpers; not involved.

## Git workflow

- Branch: `advisor/014-fix-excel-serial-date-utc-shift`
- Commit style: short imperative subject. Suggested: `Fix Excel serial date timezone shift in imports`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the regression tests first (they fail under TZ=Asia/Seoul on current code)

Add to the `describe('parseDateString')` block in `src/lib/utils/csvParser.test.ts`:

```ts
	it('parses Excel serial dates independent of timezone', () => {
		expect(parseDateString('25569')).toBe('1970-01-01');
		expect(parseDateString('45292')).toBe('2024-01-01');
		expect(parseDateString('60000')).toBe('2064-04-08');
	});

	it('rejects integers outside the Excel serial window', () => {
		expect(parseDateString('25568')).toBeNull();
		expect(parseDateString('60001')).toBeNull();
	});
```

**Verify**: `TZ=Asia/Seoul npx vitest run src/lib/utils/csvParser.test.ts` → the new
timezone test **fails** (dates come back one day early), proving the bug is reproduced.
(`TZ=UTC` run would pass on current code — that's the nature of the bug.)

### Step 2: Make the serial conversion UTC-based

Replace the epoch construction and formatting in the Excel serial branch of
`src/lib/utils/csvParser.ts` so both ends of the arithmetic are UTC:

```ts
	// Excel serial number
	if (/^\d+$/.test(trimmed)) {
		const serial = parseInt(trimmed, 10);
		if (serial >= 25569 && serial <= 60000) {
			// Excel epoch: Jan 1, 1900, with the leap year bug (UTC to keep imports timezone-independent)
			const ms = Date.UTC(1900, 0, 1) + (serial - 2) * 86400000;
			const d = new Date(ms);
			if (!isNaN(d.getTime())) {
				return d.toISOString().slice(0, 10);
			}
		}
	}
```

`Date.UTC(...)` + `toISOString()` are both UTC, so the round trip is exact for any process
timezone.

**Verify**: `TZ=Asia/Seoul npx vitest run src/lib/utils/csvParser.test.ts` → all pass, AND
`TZ=America/New_York npx vitest run src/lib/utils/csvParser.test.ts` → all pass, AND
`npx vitest run src/lib/utils/csvParser.test.ts` (host TZ) → all pass.

### Step 3: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` → all exit 0.

## Test plan

- New tests in `src/lib/utils/csvParser.test.ts` (pattern: existing `parseDateString` block):
  - three known serial→date pairs spanning the valid window (the regression);
  - out-of-window integers return null (pins the range guard).
- The TZ-prefixed vitest runs in Steps 1–2 are the actual regression harness: the bug only
  manifests in non-UTC, positive-offset zones, so verification must run under `TZ=Asia/Seoul`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "Date.UTC(1900, 0, 1)" src/lib/utils/csvParser.ts` returns one match
- [ ] `grep -n "new Date(1900, 0, 1)" src/lib/utils/csvParser.ts` returns no matches
- [ ] `TZ=Asia/Seoul npx vitest run src/lib/utils/csvParser.test.ts` exits 0
- [ ] `TZ=America/New_York npx vitest run src/lib/utils/csvParser.test.ts` exits 0
- [ ] `npm run test` and `npm run check` exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 014 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Excel serial branch no longer matches the "Current state" excerpt.
- Step 1's new test does NOT fail under `TZ=Asia/Seoul` on unmodified code — the bug may have
  been fixed independently or your reference values are off; report instead of adjusting
  expectations to fit.
- Any OTHER existing test changes outcome under the TZ-prefixed runs — that would reveal a
  second timezone-dependent code path; report it, fix only the serial branch.
- The fix appears to require changing callers of `parseDateString`.

## Maintenance notes

- Reviewer should scrutinize: only the epoch construction changed; `(serial - 2)` and the
  25569–60000 window are untouched.
- The serial window's lower bound (25569 = 1970-01-01) means pre-1970 Excel dates are
  intentionally not parsed; that's existing behavior, preserved.
- If imports ever need sub-day precision (datetimes from Excel), this branch must NOT be reused
  as-is — fractional serials are truncated by the `/^\d+$/` regex today.
