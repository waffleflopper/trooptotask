# Plan 091: Add billing health and support workflow visibility

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan touches Platform Administration and billing support
> behavior; follow `docs/agents/architecture-governance.md` before adding or
> changing admin/provider seams. If Svelte files are edited, follow
> `docs/agents/svelte.md` and run `svelte-autofixer` until clean. If anything
> in the "STOP conditions" section occurs, stop and report. When done, update
> the status row for this plan in `plans/README.md` unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d485cdc5..HEAD -- docs/billing-operations-launch-checklist.md docs/security/incident-response.md docs/security/operational-control-evidence.md src/routes/admin/billing-events src/routes/admin/subscriptions src/routes/admin/organizations src/lib/server/admin.ts src/lib/server/adapters/supabasePlatformBillingEvents.ts src/lib/server/core/useCases/platformBillingEvents.ts src/lib/server/core/useCases/billingReconciliationBatch.ts src/routes/api/billing-reconciliation`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: plans/085-checkout-trial-entry-billing-recovery.md, plans/086-support-admin-visibility-self-service.md
- **Category**: direction
- **Planned at**: commit `d485cdc5`, 2026-06-16 (reconciled; originally planned at `c6760c16`)

## Reconciliation note

On 2026-06-16, this plan was refreshed at `d485cdc5`. No in-scope files changed
since the original `c6760c16` stamp. The current state remains valid: billing
events still load the latest 50 diagnostics, and subscription drift is still
summarized on the current admin subscriptions page.

## Why this matters

After paid launch, failed webhooks, billing drift, failed checkout recovery, and
payment failures should not depend on Robert manually opening several admin
pages at the right time. The app already has billing event diagnostics,
subscription ledgers, reconciliation, and support-safe incident guidance. This
plan turns those pieces into an operational health/support workflow so billing
issues are visible, triageable, and safe to communicate about.

## Current state

- `src/routes/admin/billing-events/+page.server.ts:6-10` loads only the 50 most
  recent billing events.
- `src/routes/admin/billing-events/+page.svelte:45-51` shows retryable failures
  only inside the current result set.
- `src/routes/admin/subscriptions/+page.svelte:23` computes billing drift only
  for the current page of subscriptions.
- `docs/security/incident-response.md:22-27` says to monitor Stripe webhook
  failures or unexpected subscription changes.
- `docs/security/incident-response.md:74-83` lists support-safe billing
  identifiers and forbidden sensitive data.
- `docs/billing-operations-launch-checklist.md:145-156` lists support process
  questions and failure modes Robert must be able to handle.

Current excerpts:

```ts
// src/routes/admin/billing-events/+page.server.ts:6
const RECENT_EVENT_LIMIT = 50;
```

```svelte
<!-- src/routes/admin/billing-events/+page.svelte:51 -->
<PageShell.Metric label="Retryable Failures" value={retryableCount} detail="Events eligible for a guarded retry." />
```

```svelte
<!-- src/routes/admin/subscriptions/+page.svelte:23 -->
const currentPageDriftCount = $derived(data.subscriptions.filter((sub) => sub.billingSnapshot?.driftDetected).length);
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Architecture docs | Read `docs/agents/architecture-governance.md` plus relevant ADR 0011 docs if adding admin seams | docs read before seam changes |
| Svelte docs | Svelte MCP docs flow if editing `.svelte` files | docs read before Svelte edits |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions remain |
| Admin billing tests | `npx vitest run src/routes/admin/billing-events/page.server.test.ts src/routes/admin/billing-events/page.svelte.test.ts src/routes/admin/subscriptions/page.server.test.ts` | all pass |
| Security docs/tests | `npx vitest run src/tests/security-posture.test.ts` | all pass when file exists |
| Governance | `npm run governance:check` | exits 0 |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- A billing health read model behind Platform Administration that summarizes:
  retryable/permanent webhook failures, stale failed events, recent payment
  failures, drifted paid Organizations, stale reconciliation, and support
  attention states.
- Admin billing-events/subscriptions/organization detail UI only as needed to
  surface the summary and copy a support-safe case bundle.
- Support-safe case bundle content: Organization ID/name, Stripe customer ID,
  subscription ID, latest event IDs, snapshot state, reconciliation result,
  and next-step labels. No card data, raw payloads, API keys, or webhook
  signatures.
- Docs updates to billing launch checklist and incident response.
- Governance baseline/drift docs only if current governance requires them for
  new admin provider seams.
- `plans/README.md` status row only.

**Out of scope**:

- Do not send external email, Slack, SMS, or pager notifications unless Robert
  explicitly chooses and configures a real channel.
- Do not create a new platform-admin role. Use existing `super_admin`,
  `support`, and `billing` semantics unless they cannot express the workflow;
  if they cannot, stop.
- Do not expose raw Stripe webhook payloads, card details, payment method data,
  customer secrets, API keys, webhook secrets, or provider screenshots.
- Do not run production reconciliation or modify live Stripe.
- Do not reset or delete local or production data.

## Git workflow

- Branch: `codex/091-billing-health-support-workflow`
- Commit style: short imperative subject, for example
  `Add billing health support workflow`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define billing health states

Inventory existing billing event, subscription, and reconciliation read models.
Define a small set of support states such as:

- `healthy`;
- `needs_retry`;
- `permanent_failure`;
- `drift_detected`;
- `payment_recovery_attention`;
- `reconciliation_stale`;
- `diagnostics_unavailable`.

Keep the states support-facing and conservative.

**Verify**:
Add a test fixture or documented type that maps raw billing facts to these
states without exposing secrets.

### Step 2: Add the Platform Administration read model

Implement the smallest admin read model needed to compute billing health beyond
the current page of billing events/subscriptions. Keep provider-specific reads
inside app-owned adapters/use cases, matching ADR 0011 and existing
Platform Administration patterns.

**Verify**:
Focused server tests assert counts/states for retryable failure, permanent
failure, drifted Organization, and diagnostics failure.

### Step 3: Surface health and support actions in admin UI

Add an admin health banner, metrics, or compact panel where Robert already
looks for billing support. Include a "copy support bundle" or equivalent
support-safe details block if the UI pattern exists; otherwise document the
bundle shape and expose it as structured data for the admin page.

**Verify**:
Svelte/admin component tests assert the health state, role visibility, and
support bundle redaction. Run Svelte autofixer until clean.

### Step 4: Update runbooks

Update `docs/billing-operations-launch-checklist.md` and
`docs/security/incident-response.md` with the health workflow:

- where to check billing health;
- which identifiers are safe to copy;
- what not to ask customers for;
- when to retry, reconcile, escalate, or mark as support-handled.

**Verify**:
`rg -n "billing health|support bundle|retryable|reconciliation|card details|webhook secret|customer ID|subscription ID" docs/billing-operations-launch-checklist.md docs/security/incident-response.md`
shows the workflow and no-secret rules.

### Step 5: Run governance and verification

Run focused admin tests, governance, security posture tests if present, and the
full repo gate.

**Verify**:

- Focused admin billing tests exit 0.
- `npm run governance:check` exits 0.
- `npx vitest run src/tests/security-posture.test.ts` exits 0 if present.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- Use-case/adapter tests for billing health state classification.
- Admin server tests for role access and diagnostic failure handling.
- Admin Svelte tests for health banner/metrics and support bundle redaction.
- Security posture/docs test if the repo tracks required no-secret language.

## Done criteria

- [ ] Billing health summary covers failures, drift, payment recovery attention,
      and diagnostics-unavailable states beyond the current visible page.
- [ ] Support-safe billing case bundle exists or is documented in structured
      admin data.
- [ ] Role gates match Platform Administration boundaries.
- [ ] Docs explain triage, safe identifiers, and forbidden evidence.
- [ ] No raw provider payloads, card data, or secrets are exposed.
- [ ] Focused tests, governance, and full repo gate pass.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- The work requires a new platform-admin role or authorization model.
- The only useful support view would require raw webhook payloads, card details,
  payment method data, or production-only dashboard state.
- The admin provider seam cannot be extended without violating governance.
- The change requires production DB, live Stripe, secrets, or database reset.

## Maintenance notes

This is the operational counterpart to checkout and support visibility. If
future billing states are added, update the health state mapper and support
bundle at the same time so Robert does not have to reverse-engineer incidents
from raw ledgers.
