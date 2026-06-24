# Plan 090: Add a billing launch readiness gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan is a launch tooling/design slice; do not modify live
> Stripe, production deployment variables, or production data. If anything in
> the "STOP conditions" section occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md` unless a reviewer dispatched
> you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 0f69c5bc..HEAD -- docs/billing-launch-go-no-go.md docs/billing-operations-launch-checklist.md docs/billing-launch-verification.md docs/billing-customer-portal.md docs/billing-cancellation-policy.md docs/launch-acquisition-path.md scripts/billing-launch-preflight.mjs scripts/billing-lifecycle-simulate.mjs package.json src/routes/admin src/lib/server/billing src/lib/server/core/useCases`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: plans/083-public-account-creation-abuse-controls.md, plans/084-self-service-organization-onboarding.md, plans/085-checkout-trial-entry-billing-recovery.md, plans/086-support-admin-visibility-self-service.md, plans/087-self-service-acquisition-e2e-coverage.md
- **Category**: direction
- **Planned at**: commit `0f69c5bc`, 2026-06-24 (reconciled; originally planned at `c6760c16`)

## Reconciliation note

On 2026-06-16, this plan was refreshed at `d485cdc5`. The read-only billing
gate landed after the original plan and added `src/lib/server/core/useCases/readOnlyMode.ts`
plus route-authorization read-only-mode exceptions. The readiness gate should
include that gate as launch evidence, especially the `billing-recovery`
exception that keeps payment recovery available while ordinary paid writes can
be blocked.

On 2026-06-24, this plan was refreshed at `0f69c5bc`. Plans 083-089 have
landed and the launch docs now contain the Free-first checkout entry,
billing-disabled fallback, paid launch pricing/tax/refund posture, canonical
support/privacy/security mailboxes, and admin support lookup surfaces. The
finding still stands because `package.json` exposes `billing:launch-preflight`
and `billing:lifecycle`, but no single `billing:launch-readiness` command or
equivalent machine-readable launch gate exists.

## Why this matters

The current billing evidence pack is intentionally blocked. It lists many
manual confirmations, scenario rows, and support-safe evidence requirements,
but there is no single machine-readable gate that tells Robert whether paid
billing is ready, blocked, or waiting on human confirmations. Before live
billing is enabled, the codebase should have one boring launch gate that
aggregates preflight checks, scenario evidence, self-service acquisition
status, support staffing, and Robert-owned confirmations without creating false
confidence.

## Current state

- `docs/billing-launch-go-no-go.md:7-13` records the current verdict as
  blocked because full lifecycle scenarios and Robert-owned confirmations are
  incomplete.
- `docs/billing-launch-go-no-go.md:58-68` has blocked scenario rows for
  checkout, renewal, failed renewal, cancellation, recovery, plan change, and
  unsupported events.
- `docs/billing-operations-launch-checklist.md:14-15` lists the existing
  billing commands as `billing:launch-preflight` and `billing:lifecycle`; there
  is still no readiness gate command.
- `docs/billing-operations-launch-checklist.md:64-83` lists live-mode launch
  checks that require Robert confirmation, including final live Stripe setup,
  deployment variables, tax posture, and staffed billing support.
- `docs/billing-operations-launch-checklist.md:120-133` records the current
  paid launch contract: Team at $4.99/month, Unit at $10.99/month, taxes
  excluded where required, no automatic prorated refunds, no paid-service beta
  framing, and Free-first self-service checkout.
- `docs/billing-operations-launch-checklist.md:148-180` records the canonical
  support/privacy/security mailboxes and support-safe identifier boundaries.
- `docs/billing-launch-verification.md:120-132` now includes Free-first
  checkout entry and billing-disabled fallback in the scenario matrix.
- `docs/launch-acquisition-path.md:85-111` records Robert as support owner,
  the canonical support channels, admin lookup surfaces, and no-secret support
  note rules.
- `scripts/billing-launch-preflight.mjs:69-78` requires a test key shape and is
  test-mode oriented by design.
- `scripts/billing-lifecycle-simulate.mjs:69-72` refuses non-test Stripe keys.
- `src/lib/server/core/useCases/readOnlyMode.ts` now maps billing policy
  failures into Organization read-only mode.
- `src/lib/server/core/useCases/routeAuthorization.ts` includes the
  `billing-recovery` read-only-mode exception.
- `package.json:37-39` exposes the preflight and lifecycle helpers but no
  readiness command.

Current excerpts:

```md
<!-- docs/billing-launch-go-no-go.md:7 -->
Verdict: **blocked**
```

```js
// scripts/billing-launch-preflight.mjs:69
env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
```

```js
// scripts/billing-lifecycle-simulate.mjs:69-72
if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
	throw new Error('Refusing to run lifecycle simulation because STRIPE_SECRET_KEY is not a test key.');
}
```

```ts
// src/lib/server/core/useCases/routeAuthorization.ts
export type ReadOnlyModeException = 'billing-recovery' | 'identity-owned-preference' | 'identity-owned-data-request';
```

```json
// package.json:37-39
"billing:launch-preflight": "node ./scripts/billing-launch-preflight.mjs",
"billing:snapshot-backfill": "node ./scripts/billing-snapshot-backfill.mjs",
"billing:lifecycle": "node ./scripts/billing-lifecycle-simulate.mjs"
```

```md
<!-- docs/billing-operations-launch-checklist.md:150-154 -->
Robert has confirmed the public support channels for paid launch:

- Billing and account support: `support@trooptotask.org`.
- Privacy: `privacy@trooptotask.org`.
- Security: `security@trooptotask.org`.
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Existing preflight | `npm run billing:launch-preflight -- --offline --json` | exits 0 and emits JSON without secrets |
| New readiness gate | `npm run billing:launch-readiness -- --offline --json` or the command name chosen in this plan | exits 0 with `status: "blocked"` until all confirmations are present |
| Script tests | `npx vitest run <new-readiness-script-test>` if script tests are added | all pass |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- A read-only readiness command such as `scripts/billing-launch-readiness.mjs`
  plus an npm script.
- Reuse or wrap `scripts/billing-launch-preflight.mjs` output rather than
  duplicating Stripe checks.
- A support-safe schema for readiness results:
  `go`, `blocked`, or `needs_confirmation`; reasons; owner; evidence source;
  and no-secret identifiers.
- Docs updates to the billing launch checklist/go-no-go pack explaining how to
  use the command and what remains Robert-owned.
- Optional admin-only display only if the existing admin structure makes it
  small; prefer the CLI first if a UI would broaden scope.
- Tests for readiness result classification if helpers are factored into
  testable modules.
- `plans/README.md` status row only.

**Out of scope**:

- Do not inspect or modify production deployment variables.
- Do not use live Stripe keys, live customers, or live subscriptions.
- Do not make the command capable of approving launch solely from code.
- Do not rerun full billing lifecycle scenarios unless Robert provides explicit
  local/test credentials and asks for that execution.
- Do not reset or delete local or production data.

## Git workflow

- Branch: `codex/090-billing-launch-readiness-gate`
- Commit style: short imperative subject, for example
  `Add billing launch readiness gate`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define the readiness result contract

Create a small result model for the launch gate. It should distinguish:

- code/tooling checks that can pass locally;
- the billing read-only gate and its recovery exception;
- scenario evidence that must be present in
  `docs/billing-launch-go-no-go.md` or a support-safe evidence input;
- Robert-owned confirmations for Dashboard, live env vars, tax, support, and
  final approval.
- already-confirmed support channel decisions from
  `docs/billing-operations-launch-checklist.md` and
  `docs/launch-acquisition-path.md` without re-blocking those exact mailbox
  choices.

The result must be blocked unless all required launch gates are satisfied.

**Verify**:
Document the result fields in the new script header or billing checklist, and
ensure they contain no secret values.

### Step 2: Add the read-only readiness command

Implement a command such as `scripts/billing-launch-readiness.mjs` and add an
npm script. It may call or import shared logic from the existing preflight, but
it must keep offline mode available so agents can run it without Stripe
network access.

Expected behavior:

- offline/local incomplete state returns a support-safe blocked result;
- missing confirmations are reported with owner `Robert`;
- test-key preflight remains test-mode only;
- live launch checks are placeholders unless Robert supplies sanitized
  confirmation records.

**Verify**:
`npm run billing:launch-readiness -- --offline --json` exits 0 and returns
`"status":"blocked"` or equivalent blocked JSON while required confirmations
are absent.

### Step 3: Add classification tests if logic is factored

If readiness classification is implemented as testable functions, add tests for
all result classes:

- missing preflight data -> blocked;
- preflight warning only -> needs confirmation or blocked depending on the
  configured rule;
- all machine checks pass but Robert confirmations absent -> needs
  confirmation/blocked;
- all checks and confirmations represented by sanitized fixtures -> go.

**Verify**:
`npx vitest run <new-readiness-script-test>` exits 0.

### Step 4: Update launch docs

Update `docs/billing-operations-launch-checklist.md` and
`docs/billing-launch-go-no-go.md` so future launch rehearsals use the new
readiness gate. Preserve the current blocked evidence unless a real rehearsal
has been run; do not rewrite history as passed.

**Verify**:
`rg -n "billing:launch-readiness|go|blocked|Robert confirmation|no-secret|offline" docs/billing-operations-launch-checklist.md docs/billing-launch-go-no-go.md`
shows the gate and its owner boundaries.

### Step 5: Run verification

Run the existing offline preflight, new readiness command, focused tests if
added, and full repo gate.

**Verify**:

- `npm run billing:launch-preflight -- --offline --json` exits 0.
- New readiness command exits 0 and does not print secrets.
- Focused tests pass if added.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- Command-level tests or fixture-driven unit tests for readiness classification.
- CLI smoke run in offline mode.
- Existing preflight offline run to prove compatibility.
- Full repo gate.

## Done criteria

- [ ] A single read-only billing launch readiness command exists.
- [ ] The command reports blocked/needs-confirmation/go with support-safe
      reasons and owners.
- [ ] It cannot approve live launch without Robert-owned confirmations.
- [ ] Existing billing preflight remains usable and test-mode safe.
- [ ] Launch docs explain how to use the gate.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- The readiness gate would need live Stripe keys or production env access.
- The only feasible design requires storing secrets, raw provider payloads, or
  screenshots in repo docs.
- The command would produce a false `go` without human confirmations.
- The implementation requires resetting/deleting any database.

## Maintenance notes

This gate should be conservative. A false block is annoying; a false go is a
paid-launch risk. If self-service acquisition changes after Plans 083-087,
update the readiness gate in the same slice.
