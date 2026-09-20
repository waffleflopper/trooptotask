# Billing Launch Verification

This runbook verifies the Stripe-backed billing-state subsystem before paid billing is enabled broadly. Use Stripe test mode or a Stripe sandbox only. Do not run these scenarios against live-mode customers, live-mode subscriptions, or the production database.

Organization detail billing diagnostics and reconciliation actions have been retired under phase 03 D04. These remaining billing-delivery scenarios do not validate that retired surface or establish stabilization acceptance; billing delivery and this runbook remain owned by D05.

## Scope

Issue #1049 covers launch verification for checkout, renewal, failed renewal, cancellation, Customer Portal changes, plan changes, webhook processing, reconciliation, and owner/admin visibility.

The broader launch go/no-go checklist is documented in [Billing Operations Launch Checklist](billing-operations-launch-checklist.md). That checklist separates test-mode verification, live-mode launch steps, environment variables, support process, and Robert-owned Stripe Dashboard confirmations.

The public paid-plan contract is Team at $4.99/month and Unit at $10.99/month. Those prices are the customer-facing contract; Stripe product/price IDs, live Dashboard setup, tax setup, and support staffing remain Robert-owned launch confirmations. Plan differences are personnel capacity and export allowance only.

Duty Rosters may carry a Beta label during paid launch. That label means the workflow is supported but still evolving. Critical Tasks is not Beta-labeled for launch.

Cancellation behavior is documented in [Billing Cancellation Policy](billing-cancellation-policy.md). Customer Portal cancellation is the default owner path and should be configured for cancellation at period end. Immediate cancellation is limited to TroopToTask's confirmed Cancel Now path or platform-admin/support action.

Customer Portal behavior is constrained by [Billing Customer Portal Contract](billing-customer-portal.md). Use that contract as the source of truth for supported portal outcomes and support/admin-handled states.

The verification target is not just "Stripe changed state." Each scenario must confirm all four TroopToTask surfaces:

- `organization_billing_snapshots` has the expected billing snapshot.
- `stripe_webhook_events` has the expected processing state and result.
- Billing reconciliation reports `matched` or repairs intentional drift.
- Owner and platform-admin billing screens show the expected state.

## Preflight

Run the local preflight from the repo root:

```bash
npm run billing:launch-preflight
```

The helper is read-only. It loads `.env` and `.env.local`, requires a Stripe test secret key, retrieves the configured Team and Unit prices, checks that they match the public $4.99 and $10.99 monthly USD contract, checks the default Customer Portal configuration, and checks the enabled Stripe webhook events.

Warnings do not automatically block launch verification, but they identify manual setup that must be handled in the Stripe Dashboard.

## Semi-Automated Stripe Helpers

Use the lifecycle helper only with Stripe test mode and a real TroopToTask test organization ID:

```bash
npm run billing:lifecycle -- create-fixture --org-id <org-id> --tier team --email billing-test@example.com --name "Billing Launch Test"
npm run billing:lifecycle -- advance-clock --clock-id <clock-id> --days 32
npm run billing:lifecycle -- switch-plan --subscription-id <subscription-id> --tier unit
npm run billing:lifecycle -- cancel-at-period-end --subscription-id <subscription-id>
npm run billing:lifecycle -- cancel-now --subscription-id <subscription-id>
npm run billing:lifecycle -- finish-clock --clock-id <clock-id>
```

The helper refuses to run with live Stripe keys. It creates and mutates Stripe test-mode objects only; it does not write directly to Supabase. TroopToTask state changes still depend on Stripe webhook delivery to the configured `/api/webhooks/stripe` endpoint.

Use app checkout for the checkout-specific scenario because the helper-created subscription does not emit `checkout.session.completed`.

## Stripe Test Setup

Use the Stripe Dashboard in test mode:

- Confirm the blue test/sandbox banner is visible before changing settings.
- Confirm `STRIPE_TEAM_PRICE_ID` and `STRIPE_UNIT_PRICE_ID` point to active recurring monthly USD prices with unit amounts of 499 and 1099 cents.
- Confirm `STRIPE_AUTOMATIC_TAX_ENABLED` is `false` unless Robert has completed the Stripe Tax launch review.
- If `STRIPE_AUTOMATIC_TAX_ENABLED=true`, confirm `STRIPE_TAX_DASHBOARD_VERIFIED=true` only after checking Stripe Tax registrations, product tax behavior, and required customer address behavior in the Stripe Dashboard.
- Confirm the webhook endpoint for `/api/webhooks/stripe` is enabled for the handled events listed below.
- Confirm the Customer Portal supports invoice history, payment method updates, customer information updates, and subscription cancellation.
- For portal-driven plan changes, enable Customer Portal subscription updates and make the Team and Unit products eligible. If this is not enabled, plan changes must be verified through the Stripe Dashboard or API instead of the portal.

Useful Stripe docs:

- [Test clocks overview](https://docs.stripe.com/billing/testing/test-clocks)
- [Simulate subscriptions](https://docs.stripe.com/billing/testing/test-clocks/simulate-subscriptions)
- [API and advanced Test Clock usage](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage)
- [Billing integration testing](https://docs.stripe.com/billing/testing)

## Tax Launch Decision

TroopToTask checkout now always sends explicit Stripe Checkout tax and address options. Tax-disabled checkout is the default launch-safe state: `automatic_tax.enabled=false`, `billing_address_collection=auto`, and customer address/name updates are saved automatically when Checkout collects them.

Automatic tax is a human launch decision. Do not set `STRIPE_TAX_DASHBOARD_VERIFIED=true` until Robert has confirmed all of these in the Stripe Dashboard:

- Stripe Tax is enabled for the correct test or live account mode.
- The business address and tax registrations are configured for the jurisdictions Robert intends to support.
- Team and Unit products have the intended tax behavior.
- Checkout address collection has been tested in Stripe test mode for a real TroopToTask organization.
- The first test invoice shows the expected tax behavior before live billing is enabled.

If `STRIPE_AUTOMATIC_TAX_ENABLED=true` without `STRIPE_TAX_DASHBOARD_VERIFIED=true`, checkout must fail before creating a Stripe session. This is intentional; it prevents automatic tax from being silently enabled based on incomplete dashboard state.

## Expected Webhook Events

TroopToTask intentionally processes only these Stripe events:

| Stripe event                    | Expected TroopToTask behavior                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`    | Record pending activation with Stripe customer and subscription IDs.                                                                                                                                |
| `customer.subscription.updated` | Map Stripe price to the internal commercial plan, update subscription status, cancellation timing, paid-through dates, and effective tier.                                                          |
| `customer.subscription.deleted` | Revoke paid access, retain support-visible cancellation timing in the billing snapshot, and clear the legacy subscription mirror.                                                                   |
| `invoice.payment_failed`        | Move the snapshot into payment-failed grace state and surface billing recovery UI.                                                                                                                  |
| `invoice.payment_succeeded`     | Restore billing to current when a previously failed payment succeeds and Stripe still links the subscription to the organization.                                                                   |
| `invoice.paid`                  | Restore billing to current when an invoice is marked paid. This can appear during regular renewals and failed-payment recovery; the handler is idempotent for snapshots already in a current state. |

Unsupported events should remain ignored, not failed. If the Stripe webhook endpoint also sends events such as `customer.subscription.created`, verify they create ledger rows with `processing_state = ignored` and a support-safe `processing_result`.

## Stripe Subscription ID Retention Policy

`organization_billing_snapshots` is the exact Stripe-facing support and reconciliation record. A non-null `stripe_subscription_id` there does not grant paid access by itself; access comes from the effective billing policy, subscription status, and collection status.

| Stripe subscription state         | Billing snapshot subscription ID                                                                        | Legacy organization mirror                                                                                                                                         | Access policy                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `paused`                          | Retain the Stripe subscription ID.                                                                      | Retain the Stripe subscription ID and paid tier, using the compatibility status that keeps existing portal and support actions available.                          | Treat as paid/current unless a later product decision changes paused access.               |
| `unpaid`                          | Retain the Stripe subscription ID for support, reconciliation, and recovery.                            | Retain the Stripe subscription ID, but downgrade the legacy tier to `free` and use a non-active compatibility status so old access paths do not grant paid access. | No paid access; show payment recovery.                                                     |
| `incomplete_expired`              | Retain the expired Stripe subscription ID for audit/support correlation.                                | Clear the legacy `stripe_subscription_id`, set the legacy tier to `free`, and leave the compatibility status non-active/null.                                      | No paid access; start a new checkout instead of trying to resume the expired subscription. |
| `canceled` / subscription deleted | Clear the billing snapshot subscription ID. Retain support-visible cancellation timing where available. | Clear the legacy subscription mirror.                                                                                                                              | No paid access; start a new checkout unless another access source applies.                 |

The legacy organization mirror is not the source of truth for exact Stripe lifecycle state. It exists only for older compatibility paths until those paths fully read billing snapshots.

## Scenario Matrix

Record evidence for every scenario in this table. Use one fresh test organization when possible so the organization, Stripe customer, subscription, and event ledger are easy to correlate.

| Scenario                            | Stripe/Test Clock action                                                                                                                                 | Expected snapshot                                                                                                                                                                                                                                                                                                                                                                                                                 | Expected ledger                                                                                                                                                                                                                                      | UI/reconciliation checks                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free-first checkout entry           | Confirmed owner creates a new Organization, reaches the owner dashboard, then opens Billing with billing enabled; checkout does not start automatically. | No paid billing snapshot is required for the new Organization; effective plan is Free until checkout completes.                                                                                                                                                                                                                                                                                                                   | No Stripe checkout event is emitted until the owner explicitly chooses Team or Unit.                                                                                                                                                                 | Billing page shows Free as current with Team and Unit upgrade actions.                                                                                                       |
| Billing-disabled fallback           | Open Billing for the same kind of new Organization with `PUBLIC_BILLING_ENABLED=false`.                                                                  | No paid billing snapshot is required; effective plan remains Free.                                                                                                                                                                                                                                                                                                                                                                | No Stripe checkout event is emitted and no Checkout session is created.                                                                                                                                                                              | Billing page keeps Free as current and shows billing-unavailable fallback instead of upgrade checkout actions.                                                               |
| Checkout activation                 | Owner chooses Team checkout and completes payment with a successful test card.                                                                           | `source = stripe`, `commercial_plan = team`, `subscription_status = active`, `collection_status = current`, Stripe customer/subscription/price IDs present.                                                                                                                                                                                                                                                                       | `checkout.session.completed` then `customer.subscription.updated` processed.                                                                                                                                                                         | Owner billing page shows active Team plan. Reconciliation returns `matched`.                                                                                                 |
| Renewal success                     | Advance the Test Clock past the next billing date.                                                                                                       | Plan remains paid, status remains active, period dates move forward.                                                                                                                                                                                                                                                                                                                                                              | Renewal-related `customer.subscription.updated` is processed. `invoice.paid` is also processed by the payment-success handler and should produce a `processed`, not ignored, ledger row. `invoice.payment_succeeded` may also fire and be processed. | Owner paid-through date updates. Admin subscription diagnostics are retired. Reconciliation returns `matched`.                                                               |
| Failed renewal                      | Attach a failing payment method or use the documented Test Clock failure path, then advance through renewal.                                             | `subscription_status = past_due`, `collection_status = payment_failed_grace`, commercial plan retained for grace policy.                                                                                                                                                                                                                                                                                                          | `invoice.payment_failed` processed. Later terminal subscription events processed if Stripe moves to `unpaid` or `canceled`.                                                                                                                          | Owner billing page shows payment recovery/read-only messaging. Server-side paid write gates respect billing-state policy. Reconciliation returns `matched` or repairs drift. |
| Portal period-end cancellation      | Open the Customer Portal from TroopToTask and cancel at period end.                                                                                      | `cancel_at_period_end = true`, `current_period_end` populated, paid access remains through paid-through date.                                                                                                                                                                                                                                                                                                                     | `customer.subscription.updated` processed.                                                                                                                                                                                                           | Owner screen shows scheduled cancellation timing; admin subscription diagnostics are retired. Reconciliation returns `matched`.                                              |
| Immediate cancellation              | Use TroopToTask's Cancel Subscription action or cancel immediately in Stripe test mode.                                                                  | `commercial_plan = free`, `subscription_status = canceled`, `collection_status = canceled`, `cancel_at_period_end = false`.                                                                                                                                                                                                                                                                                                       | `customer.subscription.deleted` processed.                                                                                                                                                                                                           | Owner page shows canceled/free state. Reconciliation does not restore paid access unless Stripe still reports an active subscription.                                        |
| End-of-period terminal cancellation | After portal period-end cancellation, advance the Test Clock beyond `current_period_end`.                                                                | Paid access is revoked when Stripe emits the terminal cancellation.                                                                                                                                                                                                                                                                                                                                                               | Final `customer.subscription.deleted` processed.                                                                                                                                                                                                     | Owner page moves from scheduled cancellation to canceled/free. Admin subscription diagnostics are retired.                                                                   |
| Payment recovery and reactivation   | After failed renewal, attach a successful payment method and pay the open invoice or advance the Test Clock through recovery.                            | `subscription_status = active`, `collection_status = current`, commercial plan remains paid. If the subscription already had `cancel_at_period_end = true` before payment failed, the snapshot should retain `cancel_at_period_end = true`, `current_period_end`, `cancellation_reason`, and `cancellation_feedback` after recovery; confirm the Stripe subscription and local snapshot agree on the scheduled cancellation date. | `invoice.payment_succeeded` or `invoice.paid` processed.                                                                                                                                                                                             | Owner recovery banner clears, paid write gates reopen, admin subscription diagnostics are retired.                                                                           |
| Plan change                         | Change from Team to Unit or Unit to Team through Customer Portal if enabled; otherwise use Stripe Dashboard/API.                                         | `commercial_plan`, `stripe_price_id`, and `stripe_product_id` match the new price catalog entry.                                                                                                                                                                                                                                                                                                                                  | `customer.subscription.updated` processed.                                                                                                                                                                                                           | Owner billing plan updates. Reconciliation returns `matched`.                                                                                                                |
| Unsupported event                   | Trigger or resend an enabled but unsupported event such as `customer.subscription.created`.                                                              | No entitlement change.                                                                                                                                                                                                                                                                                                                                                                                                            | Ledger row is `ignored`, not failed.                                                                                                                                                                                                                 | The former admin event diagnostics route is retired; provider-event verification requires separately authorized operator evidence.                                           |

## Manual Verification Steps

1. Start the app with billing enabled and the local/test Stripe environment loaded.
2. Make the app reachable by Stripe webhooks. Use a deployed test environment, Stripe CLI forwarding, or an approved tunnel. The local machine currently does not include Stripe CLI or a tunnel tool by default.
3. In Stripe test mode, create or identify a test organization owner who can open `/org/[orgId]/billing`.
4. Run `npm run billing:launch-preflight` and attach the output to the issue or PR notes.
5. Complete each scenario in the matrix.
6. For each scenario, capture the Stripe customer ID, subscription ID, latest Stripe event IDs, billing snapshot fields, owner billing page state, and reconciliation result from separately authorized operator evidence.
7. Confirm no Stripe secrets, webhook secrets, payment details, or raw sensitive payloads are copied into issue comments or PR descriptions.

## Dashboard Findings From Initial Setup

> **Not yet confirmed for launch.** The items below reflect an initial inspection snapshot. Every item in this section is still listed as **Requires Robert confirmation** in the [Billing Operations Launch Checklist](billing-operations-launch-checklist.md). Robert must re-verify against current Dashboard state before live launch.

The first test-mode inspection found:

- Team and Unit Stripe prices were active monthly test prices.
- The default Customer Portal configuration was active.
- Invoice history, payment method updates, customer information updates, and subscription cancellation were enabled.
- Customer Portal cancellation mode was set to `at_period_end`.
- Customer Portal subscription updates were enabled for price changes in test mode. Confirm the Team and Unit products remain eligible in the Dashboard before portal-driven plan-change verification.
- The test webhook endpoint included all handled events and also sent optional events that TroopToTask should record as ignored.

Re-run the preflight after changing Stripe Dashboard settings; this section is a snapshot, not a substitute for current verification evidence.
