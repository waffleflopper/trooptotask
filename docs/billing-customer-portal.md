# Billing Customer Portal Contract

TroopToTask opens Stripe Customer Portal only for the Stripe Customer ID stored in the current Organization billing snapshot. The app never accepts a customer ID from the browser, and it blocks portal access when local customer records are missing, mirror-only, legacy-seeded for review, or disagree until support reviews the billing state.

## Supported Outcomes

The Customer Portal may be used for:

- Invoice history and receipt access for the current Organization customer.
- Payment method updates for renewals and payment recovery.
- Customer billing information updates, including billing address and tax details when Stripe is configured for them. Launch keeps automatic tax disabled unless Robert explicitly verifies tax setup later; public prices exclude applicable taxes where required.
- Subscription cancellation at period end. This is the default owner path for paid launch; paid access should remain available through the paid-through date until Stripe sends the terminal cancellation event.
- Plan switches between Team and Unit only when Stripe Customer Portal subscription updates are enabled and the configured products/prices match the TroopToTask price catalog.

## Unsupported Or Support-Handled States

The Customer Portal must not silently create states the app cannot explain. Treat these as support/admin handled:

- A portal request with no local Stripe Customer ID for the current Organization.
- A legacy Organization mirror customer that does not have a current billing snapshot.
- A legacy-seeded billing snapshot that still needs Stripe reconciliation.
- A local billing-state mismatch where the Organization mirror and billing snapshot point at different Stripe Customers.
- Portal product or price options that are not present in the TroopToTask price catalog.
- Immediate cancellation, custom discounts, coupons, credits, enterprise invoicing, multi-currency billing, or metered usage changes.
- Portal-driven plan changes when Stripe Dashboard settings do not explicitly allow Team and Unit subscription updates.

## Dashboard Configuration Expectations

Before launch, confirm the Stripe Dashboard Customer Portal configuration supports invoices, payment methods, customer information updates, at-period-end cancellation, and only the supported Team/Unit product switches. If any of those settings are not enabled, the corresponding customer workflow must be treated as manual support/admin work instead of assumed safe in TroopToTask.
