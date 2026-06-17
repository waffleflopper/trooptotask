# Plan 087: Add E2E coverage for self-service acquisition

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan may edit Svelte tests and E2E fixtures; follow
> `docs/agents/svelte.md` if Svelte files are edited. If anything in the "STOP
> conditions" section occurs, stop and report. When done, update the status row
> for this plan in `plans/README.md` unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 0cafdd3e..HEAD -- docs/launch-acquisition-path.md e2e e2e/specs/auth-email-flows.spec.ts e2e/specs/access-request-auth.spec.ts e2e/specs/billing-webhook.spec.ts src/routes/auth src/routes/org/new src/routes/org/[orgId]/billing package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/083-public-account-creation-abuse-controls.md, plans/084-self-service-organization-onboarding.md, plans/085-checkout-trial-entry-billing-recovery.md, plans/086-support-admin-visibility-self-service.md
- **Category**: tests
- **Planned at**: commit `0cafdd3e`, 2026-06-15

## Why this matters

The self-service acquisition path crosses auth email confirmation,
Organization provisioning, billing checkout, payment recovery, cancellation,
and support/admin visibility. Unit tests can prove each slice, but launch
readiness needs browser-level coverage that exercises the customer path and
guards against regressions in route redirects, email links, billing gates, and
state recovery.

## Current state

- `npm run test:e2e:auth` runs `e2e/specs/auth-email-flows.spec.ts`.
- `npm run test:e2e:access-requests` runs
  `e2e/specs/access-request-auth.spec.ts`.
- `npm run test:e2e:billing` uses a separate billing Playwright config.
- `e2e/specs/dashboard-invitation-auth.spec.ts` creates authenticated browser
  contexts and checks dashboard invitation behavior.
- `e2e/fixtures/test-data.ts` has deterministic test Organization and user
  fixtures.

Current excerpts:

```json
// package.json
"test:e2e:auth": "playwright test --config=e2e/playwright.config.ts e2e/specs/auth-email-flows.spec.ts",
"test:e2e:access-requests": "playwright test --config=e2e/playwright.config.ts e2e/specs/access-request-auth.spec.ts",
"test:e2e:billing": "playwright test --config=e2e/playwright.billing.config.ts"
```

```ts
// e2e/specs/auth-email-flows.spec.ts
expectAuthConfirmLink(inviteLink, 'invite');
await continueFromAuthConfirm(page, inviteLink, 'invite');
```

```ts
// e2e/specs/dashboard-invitation-auth.spec.ts
await expect.poll(() => pagePathAndSearch(acceptPage)).toMatch(/^\/(dashboard\?show=all|org\/)/);
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Self-service E2E | new or updated npm script, for example `npm run test:e2e:self-service-acquisition` | all pass |
| Auth E2E | `npm run test:e2e:auth` | all pass |
| Access request regression E2E | `npm run test:e2e:access-requests` | all pass |
| Billing E2E | `npm run test:e2e:billing` | all pass when Stripe test-mode/local E2E config is available |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- New E2E spec(s) under `e2e/specs` for self-service signup, email
  confirmation, first Organization, checkout entry, checkout recovery, and
  cancellation.
- E2E fixture helpers for local-only test users, Organizations, and cleanup.
- A package script for the new focused E2E suite if useful.
- Minimal route test additions only when E2E exposes a missing test seam from
  Plans 083-086.
- `plans/README.md` status row only.

**Out of scope**:

- Do not implement signup, Organization creation, checkout, cancellation, or
  admin visibility in this plan. Those must already exist from Plans 083-086.
- Do not use production DB, live Stripe, live customers, live subscriptions, or
  secrets.
- Do not reset or delete the local database.
- Do not require full billing E2E to run unless local Stripe test-mode config is
  available; report that blocker explicitly if unavailable.

## Git workflow

- Branch: `codex/087-self-service-acquisition-e2e`
- Commit style: short imperative subject, for example
  `Add self-service acquisition E2E coverage`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm implementation prerequisites

Verify that Plans 083-086 have landed and that the local app has real routes
for signup, email confirmation, first Organization creation, checkout, recovery,
and support visibility.

**Verify**:
`rg -n "sign-up|signup|org/new|checkout|canceled|support|self-service" src/routes e2e docs/launch-acquisition-path.md`
shows real implemented surfaces, not only plan text.

### Step 2: Add signup-to-first-organization E2E

Create a Playwright spec that:

1. Starts from the public CTA or signup route.
2. Submits a unique test email and valid password.
3. Reads the confirmation email from Mailpit/local email fixture.
4. Confirms the email through `/auth/confirm`.
5. Creates the first Organization through `/org/new`.
6. Lands on the new Organization or first-run dashboard state.
7. Cleans up only rows/users created by the test.

**Verify**:
The new focused E2E command passes for signup through first Organization.

### Step 3: Add checkout and recovery E2E coverage

Extend the self-service E2E or billing E2E to cover:

- Team or Unit checkout entry,
- pending checkout resume/restart,
- failed or expired checkout recovery where the local/test harness can simulate
  it,
- cancellation path when the local Stripe test-mode setup supports it.

If Stripe test-mode config is unavailable locally, keep the spec gated or skip
with a clear reason, and ensure focused route tests cover the state transitions.

**Verify**:
`npm run test:e2e:billing` passes when config is available, or the final report
records the unavailable Stripe test-mode blocker.

### Step 4: Preserve reviewed access regressions

Run the existing Access Request E2E to prove self-service did not break the
billing-disabled reviewed access path.

**Verify**:
`npm run test:e2e:access-requests` exits 0.

### Step 5: Add package script and run full verification

If a new focused E2E spec is added, add a package script such as
`test:e2e:self-service-acquisition`. Then run auth E2E, access-request E2E,
billing E2E when available, and the full repo gate.

**Verify**:

- New focused E2E command exits 0.
- `npm run test:e2e:auth` exits 0.
- `npm run test:e2e:access-requests` exits 0.
- `npm run test:e2e:billing` exits 0 or has a documented local config blocker.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- Browser E2E for signup -> email confirmation -> first Organization ->
  dashboard/first-run.
- Browser E2E or billing E2E for checkout entry and recovery states.
- Existing auth and access-request E2E as regression coverage.
- Focused route/component tests for any state that cannot be safely driven
  through local Stripe test-mode E2E.

## Done criteria

- [ ] Self-service signup-to-first-Organization E2E exists and passes locally.
- [ ] Checkout entry and recovery have E2E coverage, or the final report
      explains the Stripe test-mode blocker and points to passing focused tests.
- [ ] Existing auth E2E passes.
- [ ] Existing access-request E2E passes.
- [ ] No production DB, live Stripe, live customer, or secret values are used.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- Any prerequisite plan surface is missing or only documented, not implemented.
- The E2E would require production DB, live Stripe, live subscriptions, secrets,
  or local DB reset/deletion.
- The test cannot clean up its own local-only data safely.
- Billing cancellation cannot be simulated without live Stripe or destructive
  local database operations.

## Maintenance notes

Keep this suite focused on acquisition. Do not turn it into a full app smoke
test. The value is proving the launch funnel remains intact across auth email,
Organization provisioning, billing entry, recovery, and the reviewed-access
fallback.
