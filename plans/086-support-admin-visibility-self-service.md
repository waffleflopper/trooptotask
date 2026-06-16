# Plan 086: Add support and admin visibility for self-service customers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`
> unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 0cafdd3e..HEAD -- docs/launch-acquisition-path.md docs/security docs/billing-operations-launch-checklist.md src/routes/admin src/lib/server/admin.ts src/lib/server/platformAccessRequestRateLimit.ts src/lib/server/core/useCases/billingState.ts src/routes/admin/billing-events`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: plans/083-public-account-creation-abuse-controls.md, plans/084-self-service-organization-onboarding.md, plans/085-checkout-trial-entry-billing-recovery.md, plan 082
- **Category**: direction
- **Planned at**: commit `0cafdd3e`, 2026-06-15

## Why this matters

Manual reviewed access gives support an explicit queue. Self-service paid
acquisition removes that queue, so support and platform admins need visibility
into signup, email confirmation, first Organization creation, checkout status,
payment recovery, cancellation, and abuse controls. Without that visibility,
Robert would have less operational control after turning billing on than during
reviewed access.

## Current state

- `docs/launch-acquisition-path.md` names Robert as support owner and says
  support must see reviewed access, email confirmation, Organization, checkout,
  and billing recovery states.
- `docs/security/operational-control-evidence.md` and
  `docs/billing-operations-launch-checklist.md` define support-safe evidence
  and no-secret billing notes.
- `docs/architecture/adrs/0011-platform-administration-boundary.md` says
  Platform Administration owns app-wide support across User Accounts,
  Organizations, beta queues, billing support, announcements, audit visibility,
  and suspension controls.
- Current admin routes already include platform access request and billing
  event visibility, but they may not show self-service signup/confirmation
  state.

Current excerpts:

```md
docs/security/operational-control-evidence.md
| billing/support security | Support-safe billing operations, no-secret notes, payment incident escalation, and Stripe evidence handling |
```

```md
docs/billing-operations-launch-checklist.md
Support should use the admin billing diagnostics and Stripe Dashboard IDs. Do not ask customers for card details, full payment method data, or screenshots containing secrets.
```

```md
docs/architecture/adrs/0011-platform-administration-boundary.md
Treat Platform Administration as its own product boundary for TroopToTask-wide support and operational workflows.
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Admin tests | `npx vitest run src/routes/admin/page.server.test.ts src/routes/admin/billing-events/page.server.test.ts src/routes/admin/billing-events/page.svelte.test.ts` | all pass when files exist |
| Security posture tests | `npx vitest run src/tests/security-posture.test.ts` | all pass |
| Governance | `npm run governance:check` | exit 0 |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- Platform-admin read model/routes needed to see self-service signup,
  confirmation, first Organization, checkout, and recovery state.
- Support-safe docs for self-service acquisition support.
- Admin route tests for role access and safe field display.
- Audit/governance updates if a new platform-admin provider seam is added.
- `docs/billing-operations-launch-checklist.md` and
  `docs/security/operational-control-evidence.md` cross-links if needed.
- `plans/README.md` status row only.

**Out of scope**:

- No customer-facing signup, Organization creation, or checkout implementation.
  Those are Plans 083-085.
- No live Stripe Dashboard changes or production support operations.
- No raw webhook payload display, card details, API keys, webhook secrets, or
  secret values in docs/tests/UI.
- No new platform-admin role model unless existing `super_admin`, `support`,
  and `billing` roles cannot express the support need. If a new role is needed,
  stop for a separate authorization plan.

## Git workflow

- Branch: `codex/086-self-service-support-admin`
- Commit style: short imperative subject, for example
  `Add self-service acquisition support visibility`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Inventory support questions and existing admin data

List the exact support questions from `docs/launch-acquisition-path.md` and map
each to an existing admin surface or missing field:

- email confirmed or pending,
- Organization created or not,
- current Organization owner,
- checkout pending/expired/failed/canceled/active,
- Stripe customer/subscription/event IDs,
- rate-limited or suspicious signup attempts.

**Verify**:
`rg -n "support must|self-service|checkout|email confirmation|Organization" docs/launch-acquisition-path.md docs/billing-operations-launch-checklist.md docs/security/operational-control-evidence.md`
shows the support scope.

### Step 2: Add missing support visibility behind Platform Administration

Implement the smallest support/admin read model needed for missing states. Keep
provider-specific access behind app-owned admin modules. Match ADR 0011 and
the current admin role gate patterns in `src/lib/server/admin.ts`.

Do not expose secret values or raw payloads.

**Verify**:
Focused admin route tests pass and assert allowed roles can see support-safe
state while disallowed roles cannot.

### Step 3: Add audit-safe support docs

Update launch/security/billing docs so support staff know where to find
self-service acquisition state and what not to collect from customers. Include
safe identifiers such as Organization ID, Stripe customer ID, subscription ID,
invoice ID, and webhook event ID only as identifier types, not real values.

**Verify**:
`rg -n "card details|secret|webhook|customer ID|subscription ID|self-service|support" docs/security docs/billing-operations-launch-checklist.md docs/launch-acquisition-path.md`
shows no-secret guidance and self-service support coverage.

### Step 4: Run governance and repo verification

If new admin provider seams are added, update governance baselines or drift docs
only when the current governance instructions require it.

**Verify**:

- `npm run governance:check` exits 0.
- `npx vitest run src/tests/security-posture.test.ts` exits 0.
- Focused admin tests pass.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- Add admin server tests for visibility of self-service support state.
- Add Svelte/admin component tests if new UI is added.
- Extend security posture tests only for new required docs or no-secret claims.
- Keep tests textual and support-safe; do not use real customer or Stripe
  values.

## Done criteria

- [ ] Support can determine self-service signup, confirmation, Organization,
      checkout, and billing recovery state from admin/support surfaces.
- [ ] Role gates match Platform Administration boundaries.
- [ ] Docs explain support-safe identifiers and no-secret handling.
- [ ] Governance checks pass.
- [ ] Focused admin/security tests and full repo gate pass.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- The work requires a new platform-admin role or authorization model.
- Support visibility would require displaying raw secrets, raw webhook payloads,
  card details, or production-only data.
- The current admin provider seam cannot be extended without violating
  governance rules.
- Any step requires production DB, live Stripe, secrets, or local DB
  reset/deletion.

## Maintenance notes

This plan is the operational counterpart to self-service acquisition. If future
signup, checkout, or cancellation states are added, support visibility should be
updated in the same feature slice so Robert is never blind to a public customer
state.
