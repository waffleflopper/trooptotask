# Plan 029: Remove active onboarding records when step snapshot creation fails

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- src/lib/server/core/useCases/onboardingLifecycle.ts src/lib/server/core/useCases/onboardingLifecycle.test.ts`
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

Starting onboarding inserts a `personnel_onboardings` parent record, then builds
`onboarding_step_progress` rows from the selected template. If any post-parent work fails, the
soldier can be left with an active onboarding that has no checklist steps. The one-active-onboarding
guard then blocks retry and the workflow needs manual repair. After this plan, a failed step
snapshot does not leave an active parent behind.

## Current state

- `src/lib/server/core/useCases/onboardingLifecycle.ts:79-88` creates the active parent:

```ts
const now = new Date().toISOString();
const onboarding = await ctx.store.insert<{ id: string }>('personnel_onboardings', ctx.auth.orgId, {
	personnel_id: input.personnelId,
	template_id: input.templateId,
	status: 'in_progress',
	started_at: now,
	completed_at: null,
	cancelled_at: null
});
```

- `src/lib/server/core/useCases/onboardingLifecycle.ts:125-138` inserts the snapshot rows after
  the parent exists:

```ts
const steps = await ctx.store.insertMany<{
	id: string;
	onboarding_id: string;
	// ...
}>('onboarding_step_progress', ctx.auth.orgId, stepRows);
```

- `src/lib/server/core/useCases/onboardingLifecycle.test.ts` already covers normal step snapshot
  behavior and the one-active-onboarding guard.

## Commands you will need

| Purpose       | Command                                                                   | Expected on success |
| ------------- | ------------------------------------------------------------------------- | ------------------- |
| Focused tests | `npx vitest run src/lib/server/core/useCases/onboardingLifecycle.test.ts` | all pass            |
| Format        | `npm run format`                                                          | exit 0              |
| Lint          | `npm run lint`                                                            | exit 0              |
| Governance    | `npm run governance:check`                                                | exit 0              |
| Typecheck     | `npm run check`                                                           | exit 0              |
| Full tests    | `npm run test`                                                            | exit 0              |

## Scope

**In scope**:

- `src/lib/server/core/useCases/onboardingLifecycle.ts`
- `src/lib/server/core/useCases/onboardingLifecycle.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not change the onboarding UI or API payload shape in this plan. Plan 034 threads the start
  date through the UI/API after this consistency fix lands.
- Do not add or run remote database migrations.
- Do not reset or delete the local database.

## Git workflow

- Branch: `advisor/029-remove-active-onboarding-after-step-snapshot-failure`
- Commit style: short imperative subject. Suggested: `Clean up onboarding parent on snapshot failure`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a regression test for failed step snapshot

In `onboardingLifecycle.test.ts`, add a test under `describe('startOnboarding')`:

- seed a template with steps using `seedTemplateWithSteps(ctx)`,
- make `ctx.store.insertMany('onboarding_step_progress', ...)` throw after the parent insert,
- call `startOnboarding`,
- assert the call rejects,
- assert there is no `personnel_onboardings` row with `personnel_id: 'p-1'` and
  `status: 'in_progress'`.

Keep the injected failure local to this test. Do not change the in-memory adapter globally.

**Verify**: `npx vitest run src/lib/server/core/useCases/onboardingLifecycle.test.ts` -> the new
test fails before the implementation.

### Step 2: Compensate after post-parent failures

In `startOnboarding`, wrap all post-parent work that can fail in a `try/catch`. If an error occurs
after the parent onboarding row is inserted, remove the parent active row before rethrowing the
original error.

Preferred minimal shape:

- create parent,
- inside `try`, read completed training rows, insert step-progress rows, audit, and return,
- inside `catch`, best-effort delete the parent `personnel_onboardings` row by id, then rethrow.

If the store exposes a better transaction/RPC seam by the time this plan is executed, use that
instead, but keep the same externally visible result: no active parent remains after a failed
snapshot.

**Verify**: `npx vitest run src/lib/server/core/useCases/onboardingLifecycle.test.ts` -> exit 0.

### Step 3: Guard the compensation path

Add a second test for a failure after parent insert but before `insertMany`, such as forcing the
training-record lookup to throw. Assert the parent is not left active.

Do not assert that audit logs are written on failure; they should not be written for a start that
did not complete.

**Verify**: `npx vitest run src/lib/server/core/useCases/onboardingLifecycle.test.ts` -> exit 0.

### Step 4: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] Failed step-progress insertion leaves no active onboarding parent.
- [ ] Failed post-parent training lookup leaves no active onboarding parent.
- [ ] Successful onboarding start behavior and audit logging remain unchanged.
- [ ] The one-active-onboarding guard still passes existing tests.
- [ ] `plans/README.md` status row for 029 is updated.

## STOP conditions

Stop and report back if:

- The data-store API cannot delete or otherwise cancel the just-created parent without touching
  out-of-scope adapter code.
- There is already a transaction/RPC helper for this exact start workflow; the plan should be
  revised to use it instead of compensating manually.
- The failure-path implementation starts deleting unrelated onboarding rows.

## Maintenance notes

This is a consistency fix, not a performance change. Reviewers should focus on failure ordering
and ensuring the original error still reaches the caller.
