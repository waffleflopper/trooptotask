# Billing Launch Verification

This runbook verifies the Stripe-backed billing-state subsystem before paid billing is enabled broadly. Use Stripe test mode or a Stripe sandbox only. Do not run these scenarios against live-mode customers, live-mode subscriptions, or the production database.

## Scope

Issue #1049 covers launch verification for checkout, renewal, failed renewal, cancellation, Customer Portal changes, plan changes, webhook processing, reconciliation, and owner/admin visibility.

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

The helper is read-only. It loads `.env` and `.env.local`, requires a Stripe test secret key, retrieves the configured Team and Unit prices, checks the default Customer Portal configuration, and checks the enabled Stripe webhook events.

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
- Confirm `STRIPE_TEAM_PRICE_ID` and `STRIPE_UNIT_PRICE_ID` point to active recurring monthly prices.
- Confirm the webhook endpoint for `/api/webhooks/stripe` is enabled for the handled events listed below.
- Confirm the Customer Portal supports invoice history, payment method updates, customer information updates, and subscription cancellation.
- For portal-driven plan changes, enable Customer Portal subscription updates and make the Team and Unit products eligible. If this is not enabled, plan changes must be verified through the Stripe Dashboard or API instead of the portal.

Useful Stripe docs:

- [Test clocks overview](https://docs.stripe.com/billing/testing/test-clocks)
- [Simulate subscriptions](https://docs.stripe.com/billing/testing/test-clocks/simulate-subscriptions)
- [API and advanced Test Clock usage](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage)
- [Billing integration testing](https://docs.stripe.com/billing/testing)

## Expected Webhook Events

TroopToTask intentionally processes only these Stripe events:

| Stripe event | Expected TroopToTask behavior |
| --- | --- |
| `checkout.session.completed` | Record pending activation with Stripe customer and subscription IDs. |
| `customer.subscription.updated` | Map Stripe price to the internal commercial plan, update subscription status, cancellation timing, paid-through dates, and effective tier. |
| `customer.subscription.deleted` | Revoke paid access, retain support-visible cancellation timing in the billing snapshot, and clear the legacy subscription mirror. |
| `invoice.payment_failed` | Move the snapshot into payment-failed grace state and surface billing recovery UI. |

Unsupported events should remain ignored, not failed. If the Stripe webhook endpoint also sends events such as `customer.subscription.created` or `invoice.paid`, verify they create ledger rows with `processing_state = ignored` and a support-safe `processing_result`.

## Scenario Matrix

Record evidence for every scenario in this table. Use one fresh test organization when possible so the organization, Stripe customer, subscription, event ledger, and admin diagnostics are easy to correlate.

| Scenario | Stripe/Test Clock action | Expected snapshot | Expected ledger | UI/reconciliation checks |
| --- | --- | --- | --- | --- |
| Checkout activation | Owner starts Team checkout and completes payment with a successful test card. | `source = stripe`, `commercial_plan = team`, `subscription_status = active`, `collection_status = current`, Stripe customer/subscription/price IDs present. | `checkout.session.completed` then `customer.subscription.updated` processed. | Owner billing page shows active Team plan. Admin org diagnostics show synced snapshot. Reconciliation returns `matched`. |
| Renewal success | Advance the Test Clock past the next billing date. | Plan remains paid, status remains active, period dates move forward. | Renewal-related `customer.subscription.updated` is processed. Optional invoice events are ignored unless supported later. | Owner paid-through date updates. Admin subscriptions page remains current. Reconciliation returns `matched`. |
| Failed renewal | Attach a failing payment method or use the documented Test Clock failure path, then advance through renewal. | `subscription_status = past_due`, `collection_status = payment_failed_grace`, commercial plan retained for grace policy. | `invoice.payment_failed` processed. Later terminal subscription events processed if Stripe moves to `unpaid` or `canceled`. | Owner billing page shows payment recovery/read-only messaging. Server-side paid write gates respect billing-state policy. Reconciliation returns `matched` or repairs drift. |
| Portal period-end cancellation | Open the Customer Portal from TroopToTask and cancel at period end. | `cancel_at_period_end = true`, `current_period_end` populated, paid access remains through paid-through date. | `customer.subscription.updated` processed. | Owner and admin screens show scheduled cancellation timing. Reconciliation returns `matched`. |
| Immediate cancellation | Use TroopToTask's Cancel Subscription action or cancel immediately in Stripe test mode. | `commercial_plan = free`, `subscription_status = canceled`, `collection_status = canceled`, `cancel_at_period_end = false`. | `customer.subscription.deleted` processed. | Owner page shows canceled/free state. Admin diagnostics show canceled snapshot. Reconciliation does not restore paid access unless Stripe still reports an active subscription. |
| End-of-period terminal cancellation | After portal period-end cancellation, advance the Test Clock beyond `current_period_end`. | Paid access is revoked when Stripe emits the terminal cancellation. | Final `customer.subscription.deleted` processed. | Owner page moves from scheduled cancellation to canceled/free. Admin diagnostics retain cancellation timing. |
| Plan change | Change from Team to Unit or Unit to Team through Customer Portal if enabled; otherwise use Stripe Dashboard/API. | `commercial_plan`, `stripe_price_id`, and `stripe_product_id` match the new price catalog entry. | `customer.subscription.updated` processed. | Owner plan and personnel cap update. Admin diagnostics show the new price/product. Reconciliation returns `matched`. |
| Unsupported event | Trigger or resend an enabled but unsupported event such as `invoice.paid`. | No entitlement change. | Ledger row is `ignored`, not failed. | Admin billing events page shows ignored/support-safe diagnostics. |

## Manual Verification Steps

1. Start the app with billing enabled and the local/test Stripe environment loaded.
2. Make the app reachable by Stripe webhooks. Use a deployed test environment, Stripe CLI forwarding, or an approved tunnel. The local machine currently does not include Stripe CLI or a tunnel tool by default.
3. In Stripe test mode, create or identify a test organization owner who can open `/org/[orgId]/billing`.
4. Run `npm run billing:launch-preflight` and attach the output to the issue or PR notes.
5. Complete each scenario in the matrix.
6. For each scenario, capture the Stripe customer ID, subscription ID, latest Stripe event IDs, billing snapshot fields, owner billing page state, admin organization diagnostics, and reconciliation result.
7. Confirm no Stripe secrets, webhook secrets, payment details, or raw sensitive payloads are copied into issue comments or PR descriptions.

## Dashboard Findings From Initial Setup

The first test-mode inspection found:

- Team and Unit Stripe prices were active monthly test prices.
- The default Customer Portal configuration was active.
- Invoice history, payment method updates, customer information updates, and subscription cancellation were enabled.
- Customer Portal cancellation mode was set to `at_period_end`.
- Customer Portal subscription updates were enabled for price changes in test mode. Confirm the Team and Unit products remain eligible in the Dashboard before portal-driven plan-change verification.
- The test webhook endpoint included all handled events and also sent optional events that TroopToTask should record as ignored.

Re-run the preflight after changing Stripe Dashboard settings; this section is a snapshot, not a substitute for current verification evidence.
