# Billing Operations Launch Checklist

Use this checklist before enabling paid billing broadly. It separates agent-complete code and documentation work from Stripe Dashboard and business-owner decisions that require Robert.

Do not paste API keys, webhook secrets, raw webhook payloads, card details, or Stripe signature values into GitHub issues, PRs, screenshots, or support notes.

## References

- [Billing Launch Verification](billing-launch-verification.md) covers checkout, renewal, failed renewal, portal period-end cancellation, immediate cancellation, failed payment recovery, reactivation after successful payment, plan changes, webhook processing, reconciliation, and owner/admin UI evidence. Issue #1049 is the tracker for that lifecycle verification work.
- [Billing Launch Go/No-Go Evidence Pack](billing-launch-go-no-go.md) records the latest support-safe launch rehearsal evidence and verdict.
- [Billing Customer Portal Contract](billing-customer-portal.md) defines supported portal outcomes and states that must stay support/admin handled.
- [Billing Cancellation Policy](billing-cancellation-policy.md) defines period-end portal cancellation as the default owner path and immediate cancellation as an explicit confirmed action.
- [Operational Control Evidence](security/operational-control-evidence.md) links the launch security runbooks, including [Incident Response](security/incident-response.md) and no-secret evidence handling rules for billing/support incidents.
- `npm run billing:launch-preflight` is the read-only Stripe test-mode preflight.
- `npm run billing:lifecycle` is the Stripe test-mode lifecycle helper.

## Issue #1078 Outcome

| Item | Status | Owner | Notes |
| --- | --- | --- | --- |
| Checklist document created | Complete | Agent | This file records the launch gates and manual confirmations. |
| Portal assumptions documented | Complete | Agent | See "Customer Portal Configuration". |
| Lifecycle verification reference | Complete | Agent | This checklist points to `docs/billing-launch-verification.md` and issue #1049. |
| Go/no-go evidence pack created | Complete | Agent | See `docs/billing-launch-go-no-go.md`; current verdict is blocked pending scenario evidence and Robert-owned confirmations. |
| Test-mode Stripe Dashboard confirmation | Requires Robert confirmation | Robert | Agent can run local/test helpers only when test Stripe credentials and webhook forwarding are available. |
| Live-mode Stripe Dashboard confirmation | Requires Robert confirmation | Robert | Agent must not invent live Dashboard state. Robert must confirm before enabling live paid billing. |
| Final pricing amounts | Complete | Robert/business owner | Public monthly prices are Team $4.99 and Unit $10.99. Live Stripe price IDs and Dashboard setup still require Robert confirmation. |
| Live environment variables | Requires Robert confirmation | Robert | Agent must not inspect or modify production secrets. |

## Test-Mode Verification

Complete these in Stripe test mode or an approved Stripe sandbox before any live launch step.

Manual human-only dashboard steps are marked as Robert-owned confirmations. Agent work can prepare code, documentation, tests, and preflight commands, but it cannot confirm private Stripe Dashboard state without Robert or explicit test credentials.

| Check | Status | Owner | Evidence to record |
| --- | --- | --- | --- |
| Stripe Dashboard is visibly in test mode | Requires Robert confirmation | Robert | Screenshot or note that the test/sandbox banner is visible. |
| Stripe products for Team and Unit products exist | Requires Robert confirmation | Robert | Product IDs match the configured test prices and product naming. |
| Team and Unit prices are active recurring monthly USD prices at $4.99 and $10.99 | Requires Robert confirmation | Robert/Agent with test credentials | `npm run billing:launch-preflight -- --json` output; price IDs only, no secrets. |
| Price catalog maps only supported Stripe price IDs to Team and Unit | Complete | Agent | Covered by checkout/catalog tests and preflight checks. |
| Checkout rejects arbitrary client price IDs | Complete | Agent | Covered by checkout server tests. |
| Automatic tax stays disabled unless dashboard verification is complete | Complete | Agent | Checkout fails when `STRIPE_AUTOMATIC_TAX_ENABLED=true` without `STRIPE_TAX_DASHBOARD_VERIFIED=true`. |
| Stripe Tax registration, business address, product tax behavior, and address collection are verified if automatic tax will be enabled | Requires Robert confirmation | Robert | Dashboard notes plus a test invoice showing expected tax behavior. |
| Customer Portal default configuration is active | Requires Robert confirmation | Robert/Agent with test credentials | Preflight output and Dashboard confirmation. |
| Customer Portal invoice history and receipts are enabled | Requires Robert confirmation | Robert | Dashboard confirmation. |
| Customer Portal payment method updates are enabled | Requires Robert confirmation | Robert | Dashboard confirmation and payment recovery scenario evidence. |
| Customer Portal customer information updates are enabled | Requires Robert confirmation | Robert | Dashboard confirmation, especially billing address/tax details. |
| Customer Portal cancellation mode is at period end | Requires Robert confirmation | Robert | Dashboard confirmation and portal cancellation scenario evidence. |
| Customer Portal plan switching is either disabled or restricted to Team and Unit catalog prices | Requires Robert confirmation | Robert | Dashboard confirmation; if disabled, plan changes remain support/admin handled. |
| Webhook endpoint for `/api/webhooks/stripe` is enabled in test mode | Requires Robert confirmation | Robert | Endpoint URL and enabled event list, without webhook secret. |
| Webhook secret exists and is loaded only in local/test secret storage | Requires Robert confirmation | Robert | Preflight shape check only; never copy the secret value. |
| Billing retry behavior is configured | Requires Robert confirmation | Robert | Dashboard retry schedule and terminal-payment outcome notes. |
| Customer emails for invoices, receipts, failed payments, and subscription changes are reviewed | Requires Robert confirmation | Robert | Dashboard email settings and sample test emails when available. |
| Invoice and receipt settings show usable organization/customer billing details | Requires Robert confirmation | Robert | Test invoice/receipt evidence with no card details. |
| Checkout activation scenario passes | Requires Robert confirmation | Robert/Agent with test credentials | Billing snapshot, webhook ledger, owner billing UI, admin diagnostics, reconciliation result. |
| Renewal success scenario passes | Requires Robert confirmation | Robert/Agent with test credentials | Test Clock evidence and updated paid-through date. |
| Failed renewal and payment recovery scenario passes | Requires Robert confirmation | Robert/Agent with test credentials | `invoice.payment_failed` handling, owner recovery UI, read-only policy behavior, successful payment reactivation. |
| Portal period-end cancellation scenario passes | Requires Robert confirmation | Robert/Agent with test credentials | Scheduled cancellation fields, owner/admin copy, final terminal cancellation after period end. |
| Immediate cancellation scenario passes | Requires Robert confirmation | Robert/Agent with test credentials | Explicit confirmation flow and `customer.subscription.deleted` handling. |
| Reactivation after successful payment passes | Requires Robert confirmation | Robert/Agent with test credentials | `invoice.payment_succeeded` or `invoice.paid` restores current collection status where Stripe reports payment recovery. |
| Admin billing refresh reconciles one organization and audits safe details | Complete | Agent | Covered by issue #1077 tests and Chrome verification. |

## Live-Mode Launch

Do not start these until test-mode verification is complete and Robert has made the final business decisions.

| Check | Status | Owner | Evidence to record |
| --- | --- | --- | --- |
| Final Team and Unit prices are chosen | Complete | Robert/business owner | Public monthly prices are Team $4.99 and Unit $10.99. Product and price IDs remain separate Dashboard confirmations. |
| Live Team and Unit products exist and match the customer-facing names | Requires Robert confirmation | Robert | Live product IDs and Dashboard screenshot or written confirmation. |
| Live Team and Unit prices are active recurring monthly USD prices at $4.99 and $10.99 | Requires Robert confirmation | Robert | Live price IDs only; do not expose secret keys. |
| Live price IDs are configured in deployment environment variables | Requires Robert confirmation | Robert | Deployment variable names and last-updated note, not secret values. |
| Test price IDs are not present in live deployment variables | Requires Robert confirmation | Robert | Deployment settings review. |
| Live Stripe secret key is a live key and stored only in deployment secrets | Requires Robert confirmation | Robert | Secret existence/mode confirmation only. |
| Live webhook endpoint points to the production `/api/webhooks/stripe` route | Requires Robert confirmation | Robert | Endpoint URL and enabled event list. |
| Live webhook secret is stored in deployment secrets | Requires Robert confirmation | Robert | Secret existence confirmation only. |
| `PUBLIC_BILLING_ENABLED=true` is set only when launch is approved | Requires Robert confirmation | Robert | Deployment setting confirmation. |
| `APP_PUBLIC_ORIGIN` is the official production origin | Requires Robert confirmation | Robert | Deployment setting confirmation. |
| `STRIPE_AUTOMATIC_TAX_ENABLED` and `STRIPE_TAX_DASHBOARD_VERIFIED` match the tax launch decision | Requires Robert confirmation | Robert | Tax decision record and Dashboard confirmation. |
| Customer Portal live configuration matches the supported contract | Requires Robert confirmation | Robert | Dashboard confirmation. |
| Billing retry, invoice, receipt, and customer email settings are reviewed in live mode | Requires Robert confirmation | Robert | Dashboard confirmation. |
| Support process is staffed for launch | Requires Robert/business-owner confirmation | Robert | Who handles billing tickets, where Stripe IDs are searched, and how urgent payment failures are escalated. |

## Environment Variables

| Variable | Required for launch | Mode rule |
| --- | --- | --- |
| `PUBLIC_BILLING_ENABLED` | Yes | `true` only after Robert approves paid billing. |
| `APP_PUBLIC_ORIGIN` | Yes | Must be the official public app origin for Checkout and Portal redirects. |
| `STRIPE_SECRET_KEY` | Yes | Test deployments use `sk_test_`; live deployments use `sk_live_`. Never mix modes. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Must match the webhook endpoint mode. Never copy the value into notes. |
| `STRIPE_TEAM_PRICE_ID` | Yes | Must point to the Team price for the same Stripe mode. |
| `STRIPE_UNIT_PRICE_ID` | Yes | Must point to the Unit price for the same Stripe mode. |
| `STRIPE_AUTOMATIC_TAX_ENABLED` | Decision-dependent | Keep `false` unless Robert has completed tax setup. |
| `STRIPE_TAX_DASHBOARD_VERIFIED` | Decision-dependent | Set `true` only after Robert confirms Stripe Tax dashboard state for that mode. |
| `BILLING_RECONCILIATION_SECRET` or `CRON_SECRET` | Recommended | Required to exercise scheduled reconciliation endpoints outside the admin UI. |

## Customer Portal Configuration

The Customer Portal must not create subscription states that TroopToTask cannot explain.

Allowed portal settings:

- Invoice history and receipt access.
- Payment method updates.
- Customer billing information updates.
- Cancellation at period end.
- Team and Unit plan switching only when the Portal products/prices exactly match the TroopToTask catalog.

Do not enable these as self-service portal outcomes without new product/code work:

- Immediate cancellation through a generic portal path.
- Products, prices, coupons, discounts, credits, trials, enterprise invoicing, multi-currency, or metered usage outside the current catalog.
- Portal plan switches to any price ID not known by the catalog.
- Customer states that depend on local mirror fields rather than `organization_billing_snapshots`.

If an unsupported setting is needed for a customer, treat it as support/admin handled and record the manual action in audit-safe notes.

## Paid Launch Contract

The public paid-plan contract for launch is:

- Team is $4.99/month for up to 80 personnel and 10 exports per month.
- Unit is $10.99/month for up to 500 personnel and unlimited exports.
- Plan differences are personnel capacity and export allowance only. Do not add feature-only paid entitlements without a new approved plan.
- Critical Tasks is part of the core workflow and should not carry a Beta badge.
- Duty Rosters may keep a Beta badge for paid launch. That badge means the workflow is supported but still evolving; it is not an unsupported or best-effort feature.

Acquisition remains environment-gated. While billing is disabled, keep reviewed request-access mechanics and copy. Plan 083 adds the self-service signup identity layer, and Plan 084 adds first Organization setup. New self-service Organizations start on Free; owners explicitly choose Team or Unit upgrade checkout from Billing when billing is enabled. Public acquisition copy must not imply a complete paid self-service path until checkout/recovery, support visibility, and E2E coverage have landed.

## Webhook Events

The Stripe webhook endpoint should receive the supported events used by TroopToTask's billing lifecycle:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`
- `invoice.paid`

Optional extra events, such as `customer.subscription.created`, may be enabled if Stripe requires them for Dashboard workflows, but TroopToTask should record unsupported events as ignored and support-safe.

## Support Process

Before launch, Robert should confirm:

- Which mailbox or support channel receives billing questions.
- Who can access Stripe Dashboard in test and live mode.
- Who can run admin billing refresh from TroopToTask.
- Where to record support notes without exposing secrets or payment details.
- How to respond to payment failures, failed checkout, duplicate checkout attempts, portal access denials, cancellation questions, and over-limit billing locks.
- How to correlate a ticket using Stripe customer ID, subscription ID, latest webhook event, billing snapshot, admin diagnostics, and reconciliation result.

Support should use the admin billing diagnostics and Stripe Dashboard IDs. Do not ask customers for card details, full payment method data, or screenshots containing secrets.
