# Plan 034: Thread the onboarding start date through the API

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- src/features/onboarding src/lib/server/core/useCases/onboardingLifecycle.ts src/lib/server/core/useCases/onboardingLifecycle.test.ts "src/routes/org/[orgId]/api/onboarding/+server.ts"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 029
- **Category**: bug
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

The Start Onboarding modal asks the user to confirm a start date, but the parent component drops
that value and the server always stores `new Date().toISOString()`. Backdated or future-dated
starts are silently recorded as "now," making onboarding history and visible started dates wrong.
After this plan, the selected date reaches the API and the use case persists it intentionally.

## Current state

- `src/features/onboarding/components/StartOnboardingModal.svelte:21` declares
  `onSubmit(personnelId, startedAt, templateId)`.
- `StartOnboardingModal.svelte:57-63` passes the selected `startDate` to `onSubmit`.
- `src/features/onboarding/components/OnboardingModals.svelte:33` discards it:

```svelte
onSubmit={(personnelId, _startedAt, templateId) => ctx.handleStartOnboarding(personnelId, templateId)}
```

- `src/features/onboarding/contexts/OnboardingPageContext.svelte.ts:300-302` accepts only
  `personnelId` and `templateId`.
- `src/features/onboarding/stores/onboarding.svelte.ts:101-107` POSTs only `{ personnelId, templateId }`.
- `src/routes/org/[orgId]/api/onboarding/+server.ts:12-17` calls `startOnboarding` without a date.
- `src/lib/server/core/useCases/onboardingLifecycle.ts:80-85` uses `new Date().toISOString()` for
  `started_at`.
- Existing tests: `StartOnboardingModal.test.ts`, `OnboardingPageContext.svelte.test.ts`,
  `onboarding.svelte.test.ts`, and `onboardingLifecycle.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused UI/store tests | `npx vitest run src/features/onboarding` | all pass |
| Focused server tests | `npx vitest run src/lib/server/core/useCases/onboardingLifecycle.test.ts` | all pass |
| Format | `npm run format` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Governance | `npm run governance:check` | exit 0 |
| Typecheck | `npm run check` | exit 0 |
| Full tests | `npm run test` | exit 0 |

## Suggested executor toolkit

- If Svelte MCP tooling is available, follow the repo instruction: read relevant Svelte docs and
  run `svelte-autofixer` on changed Svelte components until clean.

## Scope

**In scope**:

- `src/features/onboarding/components/OnboardingModals.svelte`
- `src/features/onboarding/contexts/OnboardingPageContext.svelte.ts`
- `src/features/onboarding/stores/onboarding.svelte.ts`
- `src/routes/org/[orgId]/api/onboarding/+server.ts`
- `src/lib/server/core/useCases/onboardingLifecycle.ts`
- Relevant existing onboarding tests listed above
- `plans/README.md` status row only

**Out of scope**:

- Do not change onboarding query/read models.
- Do not change the modal design beyond plumbing the existing field.
- Do not implement the failure compensation from plan 029 here; that plan should land first.

## Git workflow

- Branch: `advisor/034-thread-onboarding-start-date-through-api`
- Commit style: short imperative subject. Suggested: `Persist selected onboarding start date`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add server use-case support for `startedAt`

Extend the `startOnboarding` input type to accept optional `startedAt`. Validate that supplied
values are date-only strings in `YYYY-MM-DD` format. Convert valid date-only input to the stored
timestamp consistently, for example local/UTC start-of-day with an explicit implementation comment.

Fallback behavior: if `startedAt` is missing, preserve current behavior and use `new Date().toISOString()`.

Add `onboardingLifecycle.test.ts` coverage proving a supplied non-today date is persisted as
`startedAt` in the returned object and `started_at` in the stored row.

**Verify**: `npx vitest run src/lib/server/core/useCases/onboardingLifecycle.test.ts` -> exit 0.

### Step 2: Thread `startedAt` through the route and store

Update:

- `src/routes/org/[orgId]/api/onboarding/+server.ts` to pass `startedAt: input.startedAt as string | undefined`,
- `src/features/onboarding/stores/onboarding.svelte.ts` so `startOnboarding(personnelId, startedAt, templateId)` POSTs `{ personnelId, templateId, startedAt }`.

Add or update store tests to assert the POST body includes the selected `startedAt`.

**Verify**: `npx vitest run src/features/onboarding/stores/onboarding.svelte.test.ts` -> exit 0.

### Step 3: Thread `startedAt` through the context and modal parent

Update:

- `OnboardingPageContext.handleStartOnboarding(personnelId, startedAt, templateId)`,
- `OnboardingModals.svelte` so it passes the modal's `startedAt` argument instead of discarding it.

Add or update tests:

- `StartOnboardingModal.test.ts` should assert the selected date is passed to `onSubmit`,
- `OnboardingPageContext.svelte.test.ts` should assert context calls the store with the selected date.

**Verify**: `npx vitest run src/features/onboarding` -> all pass.

### Step 4: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] A user-selected onboarding start date reaches the API request body.
- [ ] `startOnboarding` persists the selected date instead of always using now.
- [ ] Missing `startedAt` remains backward compatible.
- [ ] Invalid date strings return a 400 or use-case failure; they are not silently stored.
- [ ] `plans/README.md` status row for 034 is updated.

## STOP conditions

Stop and report back if:

- Plan 029 has not landed and the `startOnboarding` code has drifted significantly.
- Product requirements are unclear on whether `startedAt` should be date-only or an exact timestamp.
- Fixing this requires changing onboarding read model contracts broadly.

## Maintenance notes

Date-only fields are easy to regress with UTC/local conversions. Reviewers should check the chosen
conversion and make sure visible date formatting still displays the intended calendar day.
