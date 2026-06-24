# Billing Cancellation Policy

Owner cancellation has two supported paths:

- Default paid-launch path: the owner opens Stripe Customer Portal and cancels at period end. Paid access remains active through the paid-through date, and TroopToTask updates local billing state from Stripe webhooks.
- Immediate cancellation path: the owner uses TroopToTask's confirmed Cancel Now action, or a platform admin handles the request. This ends paid access immediately and moves the organization to the Free plan.

Monthly subscriptions are not automatically prorated or refunded after use. Robert may issue discretionary refunds for duplicate charges, billing errors, or service-access failures.

Immediate cancellation must not be presented as generic portal cancellation. The app requires an explicit confirmation before calling Stripe, and it may pass safe structured cancellation feedback such as `too_expensive` or `unused`. Freeform provider comments are not stored in TroopToTask billing snapshots.

When Stripe sends cancellation details on subscription events, TroopToTask stores only the structured reason and feedback fields on the organization billing snapshot. If the direct local organization update after immediate cancellation fails, the request can still return success because the Stripe webhook remains the source of truth for reconciling local billing state.
