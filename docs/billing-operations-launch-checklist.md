# Billing Operations Launch Checklist

Use this checklist before enabling paid billing broadly. It separates agent-complete code and documentation work from Stripe Dashboard and business-owner decisions that require Robert.

Do not paste API keys, webhook secrets, raw webhook payloads, card details, Stripe signature values, screenshots, or detailed private provider artifacts into GitHub issues, PRs, repo docs, or support notes.

## References

- [Billing Launch Verification](billing-launch-verification.md) covers checkout, renewal, failed renewal, portal period-end cancellation, immediate cancellation, failed payment recovery, reactivation after successful payment, plan changes, webhook processing, reconciliation, and owner/admin UI evidence. Issue #1049 is the tracker for that lifecycle verification work.
- [Billing Launch Go/No-Go Evidence Pack](billing-launch-go-no-go.md) records the latest support-safe launch rehearsal evidence and verdict.
- [Billing Customer Portal Contract](billing-customer-portal.md) defines supported portal outcomes and states that must stay support/admin handled.
- [Billing Cancellation Policy](billing-cancellation-policy.md) defines period-end portal cancellation as the default owner path and immediate cancellation as an explicit confirmed action.
- [Operational Control Evidence](security/operational-control-evidence.md) links the launch security runbooks, including [Incident Response](security/incident-response.md) and no-secret evidence handling rules for billing/support incidents.
- `npm run billing:launch-preflight` is the read-only Stripe test-mode preflight.
- `npm --silent run billing:launch-readiness -- --offline --json` is the parseable read-only launch gate invocation for operators and automation. It aggregates preflight, scenario rows, support-channel decisions, and Robert-owned confirmation artifacts into top-level and per-check `go`, `blocked`, or `needs_confirmation` statuses. Any non-`go` status is not launch-ready. The commercial write-denial gate and its recovery exceptions were retired under stabilization D03; remaining billing launch checks do not establish stabilization acceptance.
- `npm run billing:lifecycle` is the Stripe test-mode lifecycle helper.

## Issue #1078 Outcome

| Item                                    | Status                       | Owner                 | Notes                                                                                                                              |
| --------------------------------------- | ---------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Checklist document created              | Complete                     | Agent                 | This file records the launch gates and manual confirmations.                                                                       |
| Portal assumptions documented           | Complete                     | Agent                 | See "Customer Portal Configuration".                                                                                               |
| Lifecycle verification reference        | Complete                     | Agent                 | This checklist points to `docs/billing-launch-verification.md` and issue #1049.                                                    |
| Go/no-go evidence pack created          | Complete                     | Agent                 | See `docs/billing-launch-go-no-go.md`; current verdict is blocked pending scenario evidence and Robert-owned confirmations.        |
| Test-mode Stripe Dashboard confirmation | Requires Robert confirmation | Robert                | Agent can run local/test helpers only when test Stripe credentials and webhook forwarding are available.                           |
| Live-mode Stripe Dashboard confirmation | Requires Robert confirmation | Robert                | Agent must not invent live Dashboard state. Robert must confirm before enabling live paid billing.                                 |
| Final pricing amounts                   | Complete                     | Robert/business owner | Public monthly prices are Team $4.99 and Unit $10.99. Live Stripe price IDs and Dashboard setup still require Robert confirmation. |
| Live environment variables              | Requires Robert confirmation | Robert                | Agent must not inspect or modify production secrets.                                                                               |

## Readiness Gate

Run the readiness gate before any paid launch rehearsal handoff:

```sh
npm --silent run billing:launch-readiness -- --offline --json
```

Use `npm --silent` when automation consumes stdout; plain `npm run` prints npm lifecycle banners before the script output. The JSON result is support-safe by design. Each check has `id`, `label`, `status`, `owner`, `evidenceSource`, and `reason`. Top-level and check status values are exactly `go`, `blocked`, and `needs_confirmation`; any non-`go` status is not launch-ready, and the top-level result must not become `go` while any required Robert confirmation, scenario evidence row, or machine check is missing.

Shell exit 0 only means the command produced a support-safe readiness report. Operators and automation must inspect the JSON `status`; anything other than `go` is not launch-ready and must not be treated as approval to enable paid billing.

Robert-owned confirmations live in `docs/billing-launch-confirmations.md`. That file is intentionally limited to dates, owners, and artifact names. Do not store secrets, screenshots, Stripe keys, raw provider payloads, deployment probing evidence, or production environment values in repo docs.

Repository launch docs may record only dates, owners, artifact names, safe IDs, and brief safe notes. Screenshots, detailed Dashboard views, test invoices, emails, and other private evidence artifacts must stay outside repo docs; repo records should name that an artifact exists without embedding or describing private contents.

Required confirmation artifact names:

- `test-stripe-dashboard-confirmation`
- `live-stripe-dashboard-confirmation`
- `final-live-price-ids-confirmation`
- `live-deployment-variables-confirmation`
- `stripe-tax-launch-decision`
- `support-staffing-confirmation`
- `final-paid-billing-launch-approval`

## Test-Mode Verification

Complete these in Stripe test mode or an approved Stripe sandbox before any live launch step.

Manual human-only dashboard steps are marked as Robert-owned confirmations. Agent work can prepare code, documentation, tests, and preflight commands, but it cannot confirm private Stripe Dashboard state without Robert or explicit test credentials.

| Check                                                                                                                                 | Status                       | Owner                              | Repo-safe evidence to record                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe Dashboard is visibly in test mode                                                                                              | Requires Robert confirmation | Robert                             | Confirmation date, owner, artifact name, and a safe note that the test/sandbox mode check was completed. Keep any screenshot outside repo docs.                         |
| Stripe products for Team and Unit products exist                                                                                      | Requires Robert confirmation | Robert                             | Product IDs match the configured test prices and product naming.                                                                                                        |
| Team and Unit prices are active recurring monthly USD prices at $4.99 and $10.99                                                      | Requires Robert confirmation | Robert/Agent with test credentials | `npm run billing:launch-preflight -- --json` output; price IDs only, no secrets.                                                                                        |
| Price catalog maps only supported Stripe price IDs to Team and Unit                                                                   | Complete                     | Agent                              | Covered by checkout/catalog tests and preflight checks.                                                                                                                 |
| Checkout rejects arbitrary client price IDs                                                                                           | Complete                     | Agent                              | Covered by checkout server tests.                                                                                                                                       |
| Automatic tax stays disabled unless dashboard verification is complete                                                                | Complete                     | Agent                              | Checkout fails when `STRIPE_AUTOMATIC_TAX_ENABLED=true` without `STRIPE_TAX_DASHBOARD_VERIFIED=true`.                                                                   |
| Stripe Tax registration, business address, product tax behavior, and address collection are verified if automatic tax will be enabled | Requires Robert confirmation | Robert                             | Confirmation date, owner, artifact name, safe IDs, and a safe note that tax behavior was verified. Keep Dashboard details and test invoice artifacts outside repo docs. |
| Customer Portal default configuration is active                                                                                       | Requires Robert confirmation | Robert/Agent with test credentials | Preflight output and Dashboard confirmation.                                                                                                                            |
| Customer Portal invoice history and receipts are enabled                                                                              | Requires Robert confirmation | Robert                             | Dashboard confirmation.                                                                                                                                                 |
| Customer Portal payment method updates are enabled                                                                                    | Requires Robert confirmation | Robert                             | Dashboard confirmation and payment recovery scenario evidence.                                                                                                          |
| Customer Portal customer information updates are enabled                                                                              | Requires Robert confirmation | Robert                             | Dashboard confirmation, especially billing address/tax details.                                                                                                         |
| Customer Portal cancellation mode is at period end                                                                                    | Requires Robert confirmation | Robert                             | Dashboard confirmation and portal cancellation scenario evidence.                                                                                                       |
| Customer Portal plan switching is either disabled or restricted to Team and Unit catalog prices                                       | Requires Robert confirmation | Robert                             | Dashboard confirmation; if disabled, plan changes remain support/admin handled.                                                                                         |
| Webhook endpoint for `/api/webhooks/stripe` is enabled in test mode                                                                   | Requires Robert confirmation | Robert                             | Endpoint URL and enabled event list, without webhook secret.                                                                                                            |
| Webhook secret exists and is loaded only in local/test secret storage                                                                 | Requires Robert confirmation | Robert                             | Preflight shape check only; never copy the secret value.                                                                                                                |
| Billing retry behavior is configured                                                                                                  | Requires Robert confirmation | Robert                             | Dashboard retry schedule and terminal-payment outcome notes.                                                                                                            |
| Customer emails for invoices, receipts, failed payments, and subscription changes are reviewed                                        | Requires Robert confirmation | Robert                             | Dashboard email settings and sample test emails when available.                                                                                                         |
| Invoice and receipt settings show usable organization/customer billing details                                                        | Requires Robert confirmation | Robert                             | Test invoice/receipt evidence with no card details.                                                                                                                     |
| Checkout activation scenario passes                                                                                                   | Requires Robert confirmation | Robert/Agent with test credentials | Billing snapshot, webhook ledger, owner billing UI, admin diagnostics, reconciliation result.                                                                           |
| Renewal success scenario passes                                                                                                       | Requires Robert confirmation | Robert/Agent with test credentials | Test Clock evidence and updated paid-through date.                                                                                                                      |
| Failed renewal and payment recovery scenario passes                                                                                   | Requires Robert confirmation | Robert/Agent with test credentials | `invoice.payment_failed` handling, owner recovery UI, successful payment reactivation.                                                                                  |
| Portal period-end cancellation scenario passes                                                                                        | Requires Robert confirmation | Robert/Agent with test credentials | Scheduled cancellation fields, owner/admin copy, final terminal cancellation after period end.                                                                          |
| Immediate cancellation scenario passes                                                                                                | Requires Robert confirmation | Robert/Agent with test credentials | Explicit confirmation flow and `customer.subscription.deleted` handling.                                                                                                |
| Reactivation after successful payment passes                                                                                          | Requires Robert confirmation | Robert/Agent with test credentials | `invoice.payment_succeeded` or `invoice.paid` restores current collection status where Stripe reports payment recovery.                                                 |
| Admin billing refresh reconciles one organization and audits safe details                                                             | Complete                     | Agent                              | Covered by issue #1077 tests and Chrome verification.                                                                                                                   |

## Live-Mode Launch

Do not start these until test-mode verification is complete and Robert has made the final business decisions.

| Check                                                                                            | Status                                      | Owner                 | Repo-safe evidence to record                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Final Team and Unit prices are chosen                                                            | Complete                                    | Robert/business owner | Public monthly prices are Team $4.99 and Unit $10.99. Product and price IDs remain separate Dashboard confirmations.                                         |
| Live Team and Unit products exist and match the customer-facing names                            | Requires Robert confirmation                | Robert                | Live product IDs, confirmation date, owner, artifact name, and safe note only. Keep any Dashboard screenshot or detailed private artifact outside repo docs. |
| Live Team and Unit prices are active recurring monthly USD prices at $4.99 and $10.99            | Requires Robert confirmation                | Robert                | Live price IDs only; do not expose secret keys.                                                                                                              |
| Live price IDs are configured in deployment environment variables                                | Requires Robert confirmation                | Robert                | Deployment variable names and last-updated note, not secret values.                                                                                          |
| Test price IDs are not present in live deployment variables                                      | Requires Robert confirmation                | Robert                | Deployment settings review.                                                                                                                                  |
| Live Stripe secret key is a live key and stored only in deployment secrets                       | Requires Robert confirmation                | Robert                | Secret existence/mode confirmation only.                                                                                                                     |
| Live webhook endpoint points to the production `/api/webhooks/stripe` route                      | Requires Robert confirmation                | Robert                | Endpoint URL and enabled event list.                                                                                                                         |
| Live webhook secret is stored in deployment secrets                                              | Requires Robert confirmation                | Robert                | Secret existence confirmation only.                                                                                                                          |
| `PUBLIC_BILLING_ENABLED=true` is set only when launch is approved                                | Requires Robert confirmation                | Robert                | Deployment setting confirmation.                                                                                                                             |
| `APP_PUBLIC_ORIGIN` is the official production origin                                            | Requires Robert confirmation                | Robert                | Deployment setting confirmation.                                                                                                                             |
| `STRIPE_AUTOMATIC_TAX_ENABLED` and `STRIPE_TAX_DASHBOARD_VERIFIED` match the tax launch decision | Requires Robert confirmation                | Robert                | Tax decision record and Dashboard confirmation.                                                                                                              |
| Customer Portal live configuration matches the supported contract                                | Requires Robert confirmation                | Robert                | Dashboard confirmation.                                                                                                                                      |
| Billing retry, invoice, receipt, and customer email settings are reviewed in live mode           | Requires Robert confirmation                | Robert                | Dashboard confirmation.                                                                                                                                      |
| Support process is staffed for launch                                                            | Requires Robert/business-owner confirmation | Robert                | Who handles billing tickets, where Stripe IDs are searched, where reviewed account setup state is checked, and how urgent payment failures are escalated.    |

## Environment Variables

| Variable                                         | Required for launch | Mode rule                                                                          |
| ------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------- |
| `PUBLIC_BILLING_ENABLED`                         | Yes                 | `true` only after Robert approves paid billing.                                    |
| `APP_PUBLIC_ORIGIN`                              | Yes                 | Must be the official public app origin for Checkout and Portal redirects.          |
| `STRIPE_SECRET_KEY`                              | Yes                 | Test deployments use `sk_test_`; live deployments use `sk_live_`. Never mix modes. |
| `STRIPE_WEBHOOK_SECRET`                          | Yes                 | Must match the webhook endpoint mode. Never copy the value into notes.             |
| `STRIPE_TEAM_PRICE_ID`                           | Yes                 | Must point to the Team price for the same Stripe mode.                             |
| `STRIPE_UNIT_PRICE_ID`                           | Yes                 | Must point to the Unit price for the same Stripe mode.                             |
| `STRIPE_AUTOMATIC_TAX_ENABLED`                   | Decision-dependent  | Launch with `false` unless Robert has completed and verified tax setup.            |
| `STRIPE_TAX_DASHBOARD_VERIFIED`                  | Decision-dependent  | Set `true` only after Robert confirms Stripe Tax dashboard state for that mode.    |
| `BILLING_RECONCILIATION_SECRET` or `CRON_SECRET` | Recommended         | Required to exercise scheduled reconciliation endpoints outside the admin UI.      |

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
- Prices exclude applicable taxes where required. Launch keeps automatic tax disabled unless Robert explicitly verifies tax setup later.
- Monthly subscriptions are not automatically prorated or refunded after use. Robert may issue discretionary refunds for duplicate charges, billing errors, or service-access failures.
- Plan differences are personnel capacity and export allowance only. Do not add feature-only paid entitlements without a new approved plan.
- Critical Tasks is part of the core workflow and should not carry a Beta badge.
- Duty Rosters may keep a Beta badge for paid launch. That badge means the workflow is supported but still evolving; it is not an unsupported or best-effort feature.
- Public Terms should not describe the paid service itself as beta-only.

Acquisition uses reviewed Access Requests and invitation-authorized setup regardless of billing. Historical plans 083–087 do not activate public signup. See the [current acquisition path](launch-acquisition-path.md) and [verification contract](architecture/DEFINITION_OF_DONE.md#verification-contract). Remaining checkout/Free-plan operations below are unfinished commercial-removal scope under stabilization 03-05/03-07.

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

Robert has confirmed the public support channels for paid launch:

- Billing and account support: `support@trooptotask.org`.
- Privacy: `privacy@trooptotask.org`.
- Security: `security@trooptotask.org`.

After launch, use the runtime billing health surfaces before opening Stripe:

- Admin -> Subscriptions shows Billing Health across paid Organizations, including retryable webhook failures, permanent failures, payment recovery attention, billing drift, and stale reconciliation. The Billing Drift metric comes from the health scan rather than the current table page.
- Each Billing Health item exposes a support bundle with Organization ID/name, safe Stripe customer ID or subscription ID when the admin role is allowed to see it, latest webhook event IDs, billing state, reconciliation result, and next-step labels.
- Copy the support bundle into support notes only when it does not include secrets. It must not include card details, payment method data, raw webhook payloads, API keys, webhook secrets, session cookies, or Stripe signature values.

Billing health triage:

- `needs_retry`: the in-app webhook retry tool has been retired. Escalate to Robert with support-safe context before any separately authorized provider action.
- `permanent_failure`: do not retry blindly. Escalate with the support bundle and inspect the support-safe billing snapshot/reconciliation result.
- `payment_recovery_attention`: confirm whether the Organization is in payment failed grace or terminal collection state. Ask the customer to update payment through the supported portal path; do not ask for card details or payment method screenshots.
- `drift_detected`: use the Organization detail admin billing reconciliation action and record the support-safe reconciliation result.
- `reconciliation_stale`: refresh reconciliation from the admin surface or scheduled reconciliation path before making customer-impacting statements.
- `diagnostics_unavailable`: reload or investigate the admin health read before copying a bundle or communicating a billing conclusion.

Before launch, Robert should still confirm:

- Who can access Stripe Dashboard in test and live mode.
- Who can run admin billing refresh from TroopToTask.
- Where to record support notes without exposing secrets or payment details.
- How to respond to payment failures, failed checkout, duplicate checkout attempts, portal access denials, cancellation questions, and over-limit billing locks.
- How to correlate a ticket using Stripe customer ID, subscription ID, latest webhook event, billing snapshot, admin diagnostics, and reconciliation result.

Support should use the admin billing diagnostics and Stripe Dashboard IDs. Do not ask customers for card details, full payment method data, or screenshots to place in repo docs.

Self-service acquisition support should start in the app before Stripe:

- Admin -> Access Requests shows whether the user came through reviewed access.
- Admin -> Users shows the account creation date, email confirmation status,
  suspension state, and Organization memberships for signup and first-run
  questions.
- Admin -> Organizations shows whether the first Organization exists, who owns
  it, and which plan or gift tier is active.
- Admin -> Subscriptions show support-safe checkout,
  payment recovery, cancellation, and webhook state.

Safe correlation identifier types are Organization ID, user ID, Stripe customer
ID, subscription ID, invoice ID, webhook event ID, and app audit-log ID. Do not
record raw webhook payloads, card details, API keys, webhook secrets, session
cookies, screenshots, or detailed private provider artifacts in support notes,
issues, PRs, or repo docs.
