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

## Settings billing surface retirement — 03-05b-01

The Settings Billing tab, summary and its route actions are removed. General Settings and its authorized profile actions remain. This leaf does not retire the separate Organization checkout/portal/recovery routes or the webhook; their complete removal remains required by later D05 leaves. Stored commercial and retained records are unchanged; no migration is required for this leaf.

Before a publication or merge that releases this removal, the owner must verify deployment triggers, arrange applicable notice/backups and confirm app/schema compatibility as above. Update any externally maintained bookmarks/help that point to `/org/<organization>/settings/billing`; that route no longer exists. Do not retire Stripe credentials, webhook destinations or checkout configuration while the still-deployed delivery paths need them. External settings remain **UNVERIFIED**; no provider or remote database operation is authorized by this record.

## Organization checkout, portal and recovery retirement — 03-05b-02

All `/org/[orgId]/billing` pages and checkout, checkout/cancel, cancel, portal, success and canceled handlers are removed. Settings and reviewed acquisition remain. Notify owners that old bookmarks, checkout return URLs and external links no longer provide billing management or recovery. Before a releasing publication, the owner must inspect external links and any outstanding hosted checkout sessions and arrange their disposition outside this workflow. No agent provider operation is authorized here.

Push/merge may deploy through Vercel. Verify external triggers, notice, backups and application/schema compatibility first; external settings are UNVERIFIED. This leaf makes no schema change and preserves stored checkout, snapshot, event and Calendar data. Keep webhook/provider secrets and price configuration while the actual webhook consumer remains deployed; retire them only after 03-05c and the final D05 configuration/deployment sequence. Repository CI remains manual-only, with no automatic remote migration command identified. Phase 04 owns schema retirement.

## Webhook and application provider retirement — 03-05c

The application no longer accepts Stripe deliveries or processes billing events. `/api/webhooks/stripe`, its public-route exemption, the Stripe client and snapshot transitions are removed. CSP no longer permits Stripe scripts or frames; `frame-src 'none'` preserves a restrictive policy. Weekly cleanup retains its audit-log operation and credentials but no longer deletes webhook ledger rows. Stored records and applied SQL remain; no migration is introduced.

Before a releasing publication or merge, the owner must verify deployment triggers, notice/backups and compatibility, then identify and disable external webhook destinations/retries and any operator automation targeting the retired endpoint. Confirm the disposition of outstanding events and hosted billing activity separately; deleting application code does not stop provider-side subscriptions or charges. Do not run the remaining billing lifecycle/preflight scripts against a retired deployment; their repository removal is 03-07a. External state remains **UNVERIFIED** and no financial/provider operation is authorized here.

Release the reviewed application through separately authorized actions. Confirm no deployed application, rollback candidate or external operator still requires the credentials before removing deployment Stripe secrets, price/tax variables and billing flags in the final D05 configuration sequence. Preserve Supabase, auth/email, canonical-origin and retained cleanup secrets. Coordinate rollback explicitly: an older application needs its old provider configuration and delivery settings. Do not remove stored billing objects before the separate phase-04 schema gate. Vercel push/merge may deploy; no automatic remote migration command is present in the inspected repository configuration.

## Public pricing retirement — 03-05d

The landing pricing section, public Pricing links, plan-selection copy and Terms paid-plan/billing section are removed. Reviewed Request Access, sign-in, authenticated Dashboard entry and support/privacy links remain. No replacement free tier or self-service signup is introduced. Existing `/#pricing` bookmarks open the landing page without a pricing target; owner-maintained links should use the reviewed-access entry.

Before releasing this removal, the owner must coordinate notice of the public pricing/Terms change, disposition any outstanding commercial commitments through the already documented provider retirement process, and verify deployment triggers, backups and application/schema compatibility. Repository removal does not cancel external charges or establish legal/production completion. Vercel push/merge may deploy automatically; external settings remain UNVERIFIED. No migration is included; preserve stored records and applied SQL. Configuration/dependency retirement and remaining commercial documents remain 03-07a/b.
