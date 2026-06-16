# Plan 078: Produce a billing launch rehearsal and go/no-go evidence pack

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 03af64cb..HEAD -- docs/billing-operations-launch-checklist.md docs/billing-launch-verification.md docs/billing-customer-portal.md docs/billing-cancellation-policy.md scripts/billing-launch-preflight.mjs scripts/billing-lifecycle-simulate.mjs e2e/specs/billing-webhook.spec.ts 'src/routes/org/[orgId]/billing'`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `03af64cb`, 2026-06-15

## Why this matters

TroopToTask has substantial Stripe billing code, test-mode helpers, owner/admin
UI, and launch docs. What is still missing is a single support-safe evidence
pack that proves the launch path has been rehearsed end to end before paid
billing is enabled. This plan does not touch production data and does not
declare live readiness without Robert-owned Stripe Dashboard and business
confirmations.

## Current state

- `docs/billing-operations-launch-checklist.md` says the checklist must be used
  before enabling paid billing broadly and separates agent-complete work from
  Robert-owned Dashboard/business decisions.
- `docs/billing-launch-verification.md` defines the test-mode scenario matrix:
  checkout activation, renewal, failed renewal, cancellation, recovery, plan
  change, unsupported events, owner UI, admin diagnostics, and reconciliation.
- `scripts/billing-launch-preflight.mjs` reads `.env` and `.env.local`, checks
  required Stripe test-mode env, Team/Unit prices, Customer Portal settings, and
  webhook events. It supports `--json` and `--offline`.
- `scripts/billing-lifecycle-simulate.mjs` refuses live Stripe keys and can
  create test-clock fixtures, advance clocks, switch plans, set payment methods,
  deliver signed events to `/api/webhooks/stripe`, and cancel subscriptions.
- `e2e/specs/billing-webhook.spec.ts` covers local signed webhook ingestion with
  placeholder test env in the billing Playwright config.

Important current excerpts:

```md
docs/billing-operations-launch-checklist.md:3
Use this checklist before enabling paid billing broadly. It separates
agent-complete code and documentation work from Stripe Dashboard and
business-owner decisions that require Robert.
```

```md
docs/billing-launch-verification.md:15
The verification target is not just "Stripe changed state." Each scenario must
confirm all four TroopToTask surfaces:
```

```js
scripts/billing-lifecycle-simulate.mjs
function assertTestKey(env) {
	if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
		throw new Error('Refusing to run lifecycle simulation because STRIPE_SECRET_KEY is not a test key.');
	}
}
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Offline preflight | `npm run billing:launch-preflight -- --offline --json` | exit 0; JSON contains no secret values |
| Test Stripe preflight | `npm run billing:launch-preflight -- --json` | exit 0; only test-mode keys and price IDs are used |
| Lifecycle helper | `npm run billing:lifecycle -- help` | exit 0; lists commands |
| Billing E2E | `npm run test:e2e:billing` | all pass |
| Billing unit tests | `npx vitest run src/routes/org/[orgId]/billing/page.server.test.ts src/routes/org/[orgId]/billing/page.svelte.test.ts src/routes/org/[orgId]/billing/checkout/server.test.ts src/routes/org/[orgId]/billing/portal/server.test.ts src/routes/org/[orgId]/billing/cancel/server.test.ts` | all pass |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- `docs/billing-launch-go-no-go.md` (create)
- `docs/billing-operations-launch-checklist.md`
- `docs/billing-launch-verification.md`
- `docs/billing-customer-portal.md`
- `docs/billing-cancellation-policy.md`
- `scripts/billing-launch-preflight.mjs` only if the evidence run reveals a
  support-safe output gap
- `scripts/billing-lifecycle-simulate.mjs` only if the evidence run reveals a
  support-safe helper gap
- Billing tests listed above if helper behavior changes
- `plans/README.md` status row only

**Out of scope**:

- No production database access.
- No remote production migrations.
- No local database reset or table deletion without Robert's explicit
  permission.
- No live Stripe object mutations.
- No secrets, raw webhook payloads, card details, or Stripe signature values in
  docs, issue comments, PR descriptions, screenshots, or test output.
- No pricing, copy, or beta-label changes. Those belong to plan 079.

## Git workflow

- Branch: `codex/078-billing-launch-rehearsal`
- Commit style: short imperative subject, for example
  `Document billing launch rehearsal evidence`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm external launch-rehearsal prerequisites

Before running live-adjacent billing commands, confirm the local/test setup:

1. `.env.local` or the shell has Stripe **test** credentials only:
   `STRIPE_SECRET_KEY` starts with `sk_test_`, `STRIPE_WEBHOOK_SECRET` starts
   with `whsec_`, and Team/Unit test price IDs are present.
2. There is a way to deliver webhooks to the app: local Stripe CLI forwarding,
   an approved tunnel, or a deployed test environment. If none exists, this plan
   is BLOCKED at scenario execution.
3. Robert confirms whether Stripe Tax should remain disabled for launch or
   whether a tax-dashboard verification branch is required.

Do not copy any secret values into the plan, docs, terminal transcript, or PR.

**Verify**:
`npm run billing:launch-preflight -- --offline --json` -> exit 0 and the JSON
summary has no secret values.

### Step 1: Create the go/no-go evidence document

Create `docs/billing-launch-go-no-go.md` with these sections:

- Purpose and date of the rehearsal.
- Environment and safety rules: test mode only, no production DB, no secret
  values captured.
- Preflight evidence summary: command, result counts, warnings/failures, and
  follow-up owner.
- Scenario evidence table matching `docs/billing-launch-verification.md`:
  checkout activation, renewal success, failed renewal, portal period-end
  cancellation, immediate cancellation, terminal cancellation, payment recovery,
  plan change, unsupported event.
- Robert-owned confirmations: test Dashboard, live Dashboard, final prices,
  live env vars, tax decision, support owner/channel.
- Go/no-go verdict: `go`, `no-go`, or `blocked`, with explicit reasons.

Use only support-safe identifiers: Stripe customer/subscription/event IDs are
acceptable; secrets, payment method details, raw payloads, and signatures are
not.

**Verify**:
`rg -n "sk_live_|sk_test_|whsec_|card_|pm_|payment_method|signature|raw payload" docs/billing-launch-go-no-go.md`
returns no matches except safe explanatory text such as `sk_test_` shape checks.

### Step 2: Run and record preflight

Run:

```bash
npm run billing:launch-preflight -- --json
```

Record the support-safe summary in `docs/billing-launch-go-no-go.md`. If the
command fails because credentials are missing, mark the evidence pack `blocked`
and explain which variable shape is missing without exposing values.

If the command produces warnings about portal plan switching, optional webhook
events, or automatic tax, record them as launch decisions rather than silently
accepting them.

**Verify**:
`npm run billing:launch-preflight -- --json` -> exit 0, or the evidence pack
records a BLOCKED reason that names only variable names and dashboard decisions.

### Step 3: Rehearse the lifecycle scenarios in Stripe test mode

Use the existing runbook and helper commands. Prefer one fresh local/test
Organization so the owner billing page, platform admin diagnostics, Stripe
customer, Stripe subscription, webhook events, and reconciliation result are
easy to correlate.

At minimum, attempt and record:

- App checkout activation through `/org/[orgId]/billing`.
- Test-clock renewal success.
- Failed renewal with payment recovery.
- Period-end cancellation through the supported portal path or Dashboard/API
  equivalent if portal plan switching is not enabled.
- Immediate cancellation through TroopToTask's confirmed Cancel Now path or the
  helper.
- Team-to-Unit or Unit-to-Team plan change if portal/API support is available.
- Unsupported event handling remains ignored/support-safe.

Use `npm run billing:lifecycle -- deliver-events ...` when local webhook
delivery is needed. Do not run this helper with live keys; it already refuses
them, but the executor must still verify the key mode before starting.

**Verify**:
For each scenario, the evidence pack has all four surfaces from the runbook:
snapshot state, webhook ledger state, reconciliation result, and owner/admin UI
state. If a scenario cannot be executed, the row says `blocked` with a concrete
external blocker.

### Step 4: Update checklist statuses without overstating Robert-owned work

Update `docs/billing-operations-launch-checklist.md` only for evidence actually
captured. Keep Robert-owned live/test Dashboard confirmations as
`Requires Robert confirmation` unless Robert directly confirms them during this
execution. Link the new evidence document from the checklist references.

If the rehearsal finds a real product/code defect, do not patch it in this plan.
Record the defect as a follow-up in the go/no-go document and leave the verdict
as `no-go` or `blocked`.

**Verify**:
`rg -n "Requires Robert confirmation" docs/billing-operations-launch-checklist.md`
still shows live-mode and business-owner confirmations unless Robert explicitly
confirmed them.

### Step 5: Run the billing and repo verification gates

Run the focused tests first, then the full required repo gate.

**Verify**:

- `npm run test:e2e:billing` -> all pass, or record why the billing E2E could
  not run.
- `npx vitest run src/routes/org/[orgId]/billing/page.server.test.ts src/routes/org/[orgId]/billing/page.svelte.test.ts src/routes/org/[orgId]/billing/checkout/server.test.ts src/routes/org/[orgId]/billing/portal/server.test.ts src/routes/org/[orgId]/billing/cancel/server.test.ts` -> all pass.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Test plan

- This plan primarily produces operational evidence. If scripts are changed,
  add or update unit tests around support-safe output and live-key refusal.
- Use the billing E2E and billing route tests above as the regression suite.
- If a browser verification is run manually, cover owner billing page state,
  admin organization billing diagnostics, and admin billing event diagnostics.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `docs/billing-launch-go-no-go.md` exists and has a verdict of `go`,
      `no-go`, or `blocked`.
- [ ] The evidence doc contains no secrets, raw webhook payloads, card details,
      or Stripe signatures.
- [ ] `docs/billing-operations-launch-checklist.md` links to the evidence doc.
- [ ] Any checklist status changed to Complete has matching support-safe
      evidence.
- [ ] Robert-owned live-mode/business confirmations remain clearly marked unless
      Robert confirmed them.
- [ ] Billing E2E and focused billing tests passed, or every unrunnable command
      is recorded as a blocker.
- [ ] `npm run format`, `npm run lint`, `npm run governance:check`,
      `npm run check`, and `npm run test` exit 0.
- [ ] No production database or live Stripe mutation was performed.
- [ ] `plans/README.md` status row for 078 updated.

## STOP conditions

Stop and report back if:

- Any configured Stripe key is live mode.
- Scenario execution requires production database access or live Stripe
  mutation.
- Local database reset or table deletion appears necessary.
- Webhook delivery cannot be made available after one reasonable setup attempt.
- The code or docs have drifted so the runbook no longer matches the billing
  implementation.
- A real billing defect is found. Record it; do not fix it inside this plan.

## Maintenance notes

- Treat `docs/billing-launch-go-no-go.md` as an append/update artifact for the
  final launch rehearsal, not as a replacement for Robert-owned live Dashboard
  confirmations.
- Re-run `npm run billing:launch-preflight -- --json` after any Stripe Dashboard
  or env-var change.
- Future billing features such as trials, coupons, discounts, metered usage, or
  enterprise invoicing require new product/code work and should not be accepted
  as portal settings during this launch.
