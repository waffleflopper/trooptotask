# Plan 035: Use local calendar dates for sign-in roster defaults

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- src/features/sign-in-rosters/components/SignInRosterModal.svelte src/features/sign-in-rosters/components/SignInRosterModal.test.ts src/lib/utils/dates.ts src/lib/utils/dates.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

The sign-in roster create form defaults "today" with `new Date().toISOString().split('T')[0]`.
In negative UTC offsets such as America/Anchorage, local afternoon/evening can become tomorrow's
UTC date. That means generated PDFs and saved roster records can carry the wrong local calendar
day. The repo already has a local date helper; this plan uses it consistently.

## Current state

- `src/features/sign-in-rosters/components/SignInRosterModal.svelte:57`:

```ts
let rosterDate = $state(new Date().toISOString().split('T')[0]);
```

- `src/features/sign-in-rosters/components/SignInRosterModal.svelte:292` resets with the same UTC
  expression after a successful create.
- `src/lib/utils/dates.ts:34-39` already has the correct helper:

```ts
export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
```

- Existing component tests live in
  `src/features/sign-in-rosters/components/SignInRosterModal.test.ts`.
- Timezone helper examples exist in duty roster tests, e.g.
  `src/features/duty-roster/run/dutyRosterRun.test.ts:145`.

## Commands you will need

| Purpose                 | Command                                                                            | Expected on success |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| Focused component tests | `npx vitest run src/features/sign-in-rosters/components/SignInRosterModal.test.ts` | all pass            |
| Date helper tests       | `npx vitest run src/lib/utils/dates.test.ts`                                       | all pass            |
| Format                  | `npm run format`                                                                   | exit 0              |
| Lint                    | `npm run lint`                                                                     | exit 0              |
| Governance              | `npm run governance:check`                                                         | exit 0              |
| Typecheck               | `npm run check`                                                                    | exit 0              |
| Full tests              | `npm run test`                                                                     | exit 0              |

## Suggested executor toolkit

- If Svelte MCP tooling is available, follow the repo instruction and run `svelte-autofixer` after
  changing the Svelte component.

## Scope

**In scope**:

- `src/features/sign-in-rosters/components/SignInRosterModal.svelte`
- `src/features/sign-in-rosters/components/SignInRosterModal.test.ts`
- `src/lib/utils/dates.test.ts` only if a helper regression test is useful
- `plans/README.md` status row only

**Out of scope**:

- Do not change saved roster schema or API validation.
- Do not change display formatting for existing roster dates.
- Do not alter Duty Roster date semantics; those tests intentionally use UTC in some flows.

## Git workflow

- Branch: `advisor/035-use-local-date-for-sign-in-roster-defaults`
- Commit style: short imperative subject. Suggested: `Use local dates for sign-in roster defaults`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace UTC date defaults

Import `formatDate` from `$lib/utils/dates` in `SignInRosterModal.svelte`.

Replace both `new Date().toISOString().split('T')[0]` occurrences with:

```ts
formatDate(new Date());
```

Use a small local helper like `todayDateValue()` only if it makes the component clearer.

**Verify**: `npm run check` -> exit 0.

### Step 2: Add regression coverage

In `SignInRosterModal.test.ts`, add a test that sets system time to a UTC instant where
America/Anchorage is still the prior local calendar day. Example:

```ts
process.env.TZ = 'America/Anchorage';
vi.setSystemTime(new Date('2026-05-05T02:00:00.000Z'));
```

Render the modal, open `New Roster`, submit a title, and assert the POST body uses the local date
(`2026-05-04` in this example), not the UTC date (`2026-05-05`). Restore `process.env.TZ` in a
`finally` block or helper modeled after duty roster tests.

Also assert reset behavior if it is straightforward: after a successful create, opening a new form
again should default to the same local date.

**Verify**: `npx vitest run src/features/sign-in-rosters/components/SignInRosterModal.test.ts` -> exit 0.

### Step 3: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] No `toISOString().split('T')[0]` remains in `SignInRosterModal.svelte`.
- [ ] The create payload uses the local date in America/Anchorage at the UTC boundary.
- [ ] Existing sign-in roster create/edit tests still pass.
- [ ] `plans/README.md` status row for 035 is updated.

## STOP conditions

Stop and report back if:

- The component has moved date initialization into a shared screen model.
- The product explicitly wants UTC date defaults for sign-in rosters.
- Timezone-dependent component tests are flaky in this environment; report the evidence and keep
  the helper-level test instead of hiding the failure.

## Maintenance notes

Prefer `formatDate(new Date())` for date-only form defaults in user-facing workflows unless a
specific domain model documents UTC semantics.
