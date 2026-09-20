# Stabilization release coordination

This is an owner-operated release record, not authorization to operate hosted services. Phase 03 D05 is incomplete. Preserve the [phase-02 deployment runbook](../migrations/phase-0-2-deployment-prompt.md); local acceptance does not certify production.

## Scheduled reconciliation retirement — 03-05a

The local candidate deletes `/api/billing-reconciliation`, its batch implementation and the snapshot-backfill command. Single-Organization checkout recovery and Stripe webhook delivery remain until later D05 leaves. No schema migration or stored-data deletion is included.

Before publishing or merging a candidate that releases this removal, Robert must:

1. Verify the actual deployment triggers and intended release commit. Existing GitHub evidence reports Vercel Production deployment from D04's main-branch merge; pushes may also create previews. Repository CI is manual. Waiting for phase 15 does not prevent an earlier deployment.
2. Arrange applicable owner notice, backups and application/schema compatibility. Retain the existing schema and phase-02 migrations; phase 04 separately owns destructive billing-schema retirement. D04's export-authority migration `20260920000100` remains required for retained exports. Its prior application is owner-confirmed, not agent-inspected.
3. Identify and stop any external scheduler, operator automation or notification that calls the retired reconciliation endpoint/backfill command before releasing its removal. External settings and outstanding work are **UNVERIFIED**. `vercel.json` contains no billing cron; its four cleanup jobs remain required.
4. Release the reviewed application through separately authorized owner actions. Confirm callers have stopped and the deployed endpoint cannot execute billing. An anonymous redirect to login is not authenticated 404 evidence.
5. Remove deployment copies of `BILLING_RECONCILIATION_SECRET`, `BACKFILL_SECRET`, `BACKFILL_APP_URL` and the backfill-only `PUBLIC_APP_URL` only after confirming no other deployed consumer needs them. Preserve `CRON_SECRET`, cleanup secrets and canonical app-origin variables.

Stripe webhook destinations, Stripe credentials, checkout configuration and other billing delivery cleanup remain pending later D05 leaves. Do not remove credentials needed by the still-deployed application. The final D05 handoff must complete their ordering and distinguish runtime retirement from phase-04 schema retirement. No external service or database was inspected or changed in 03-05a.
