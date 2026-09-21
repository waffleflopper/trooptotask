# Stabilization release coordination

This is an owner-operated release record, not authorization to operate hosted services. D05 merged through [PR #1304](https://github.com/waffleflopper/trooptotask/pull/1304) as `31b0b4f36a37ba05e95d5161f10cd02722e20258`; its [published receipt](https://github.com/waffleflopper/trooptotask/pull/1304#issuecomment-5752773154) records the separately authorized deployment and bounded live smoke. Current D06 evidence verifies Git integration and isolated local flows; no hosted access is performed. D07/D08 keyboard repairs #1305/#1302 are verified merged through #1306/#1307. D06 inventory/clean checks, isolated public/auth/scoped Calendar and admin/export flows, and final retained-contract/source reconciliation pass. D06 handoff correction and independent re-review pass with no remaining findings; D06 [PR #1308](https://github.com/waffleflopper/trooptotask/pull/1308) is verified merged into `main` at `f1ab97a29da954cb71e6bfcd5989944aa012a6c8`; integrated phase-03 PHASE_CHECK now **PASSES** on that candidate after owner-requested closeout. See [integrated acceptance](EVIDENCE.md#phase-03-integrated-phase-check). Phase 04 is activated for planning only, with D01 #1309 READY and no schema change or implementation; see [phase-04 activation](EVIDENCE.md#phase-04-activation). The earlier [blocked prerequisite check](EVIDENCE.md#phase-04-activation-prerequisite-check) and [D06 handoff](EVIDENCE.md#d06-handoff-repair-and-publication) remain historical. This is repository acceptance only: external provider/caller shutdown, financial obligations, hosted secret retirement and production cleanup remain **PENDING OWNER EXECUTION**. Preserve the [phase-02 deployment runbook](../migrations/phase-0-2-deployment-prompt.md).

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

Before a releasing publication or merge, the owner must verify deployment triggers, notice/backups and compatibility, then identify and disable external webhook destinations/retries and any operator automation targeting the retired endpoint. Confirm the disposition of outstanding events and hosted billing activity separately; deleting application code does not stop provider-side subscriptions or charges. The billing lifecycle/preflight/readiness scripts are deleted in 03-07a; retire any external copies or automation before releasing this cutover. External state remains **UNVERIFIED** and no financial/provider operation is authorized here.

Release the reviewed application through separately authorized actions. Confirm no deployed application, rollback candidate or external operator still requires the credentials before removing deployment Stripe secrets, price/tax variables and billing flags in the final D05 configuration sequence. Preserve Supabase, auth/email, canonical-origin and retained cleanup secrets. Coordinate rollback explicitly: an older application needs its old provider configuration and delivery settings. Do not remove stored billing objects before the separate phase-04 schema gate. Vercel push/merge may deploy; no automatic remote migration command is present in the inspected repository configuration.

## Public pricing retirement — 03-05d

The landing pricing section, public Pricing links, plan-selection copy and Terms paid-plan/billing section are removed. Reviewed Request Access, sign-in, authenticated Dashboard entry and support/privacy links remain. No replacement free tier or self-service signup is introduced. Existing `/#pricing` bookmarks open the landing page without a pricing target; owner-maintained links should use the reviewed-access entry.

Before releasing this removal, the owner must coordinate notice of the public pricing/Terms change, disposition any outstanding commercial commitments through the already documented provider retirement process, and verify deployment triggers, backups and application/schema compatibility. Repository removal does not cancel external charges or establish legal/production completion. Vercel push/merge may deploy automatically; external settings remain UNVERIFIED. No migration is included; preserve stored records and applied SQL. Configuration/dependency retirement is completed in 03-07a below; remaining commercial documents and final D05 acceptance stay in 03-07b.

## Final commercial configuration retirement — 03-07a

The candidate no longer imports Stripe, exposes a billing switch, validates provider credentials/tax settings, or ships billing operator commands. The example, CI and owned ignored local test configuration no longer supply commercial keys. Retained service credentials, Account Setup signing, origin validation, email and cleanup jobs remain required as before. No schema migration is included.

Before a releasing push or merge, complete the preceding notice/backups and app/schema compatibility prerequisites. Identify and stop external script copies, schedules, webhook retries and notifications; separately resolve outstanding provider activity. Removing this code does not cancel charges. Release only through separately authorized owner actions, verify the deployed retained flows without commercial configuration, and confirm the rollback plan before retiring hosted values.

Only after no deployed application, external operator or required rollback candidate needs them, remove hosted `PUBLIC_BILLING_ENABLED`, any legacy `BILLING_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEAM_PRICE_ID`, `STRIPE_UNIT_PRICE_ID`, `STRIPE_TEAM_LEGACY_PRICE_IDS`, `STRIPE_UNIT_LEGACY_PRICE_IDS`, `STRIPE_AUTOMATIC_TAX_ENABLED` and `STRIPE_TAX_DASHBOARD_VERIFIED`, plus the earlier scheduled-reconciliation variables. Preserve Supabase, auth/email, canonical origins, `CRON_SECRET` and cleanup secrets. Restoring an older application requires its corresponding provider configuration and delivery settings; do not assume code-only rollback is sufficient.

Vercel push/merge may deploy; external triggers, provider state and hosted configuration remain **UNVERIFIED** owner prerequisites. Repository CI remains manual and no automatic remote migration is introduced. Stored commercial data and applied SQL remain for phase 04. This record does not perform or authorize provider, deployment or remote database operations. Current commercial documentation and the full D05 acceptance remain unfinished under 03-07b.

## Commercial operations retirement — 03-07b-01

This sequence supersedes the deleted paid-launch, portal, cancellation and
billing-verification runbooks. Earlier sections record each leaf's removal;
references there to later leaves describe that historical order. The current
candidate has no billing delivery/provider/configuration or current commercial
product claims. Mixed documentation and full D05 acceptance passed in 03-07b-02/03;
publication and merge are recorded in the receipt above. The following sequence remains the owner retirement/rollback contract; that receipt does not certify external provider shutdown, obligations, backups or secret cleanup.

Before a publication that releases D05, Robert must complete these steps through
separately authorized owner actions:

1. Verify the actual candidate and Vercel preview/production triggers, owner and
   user notices, applicable backups, existing-schema compatibility and rollback
   requirements. Preserve the phase-02 deployment runbook and D04 export-authority
   migration. Repository CI is manual; no remote migration is automated here.
2. Identify external reconciliation schedules, copied operator scripts, webhook
   destinations/retries, billing notifications, checkout/portal links and open
   checkout sessions. Disable or retire those callers before their application
   endpoints disappear. The four retained cleanup crons and shared cleanup secrets
   stay in use.
3. Separately disposition provider subscriptions, charges, invoice/refund/tax
   obligations and outstanding events. Removing application code or runbooks
   does not cancel charges, erase records or alter existing commitments. Keep
   support at `support@trooptotask.org`; record dates, owners and artifact types
   externally without secrets, card data or raw provider payloads.
4. Release the reviewed runtime only after D05 acceptance and separately authorized
   publication/merge. Verify retained acquisition/authentication, Organization
   access and scoped workflows without commercial environment values; confirm
   retired endpoints cannot perform billing. Repository checks do not prove
   hosted completion.
5. Retire hosted flags, price/tax settings and credentials listed in the preceding
   configuration section only after deployed applications, external operators and
   the agreed rollback candidate no longer need them. Preserve auth/email,
   canonical origins and cleanup credentials. Restoring older code requires a
   compatible schema and its corresponding provider/delivery configuration.
6. Leave stored commercial objects and applied SQL intact for phase 04's separate
   schema acceptance and operator handoff. This sequence authorizes no remote
   database, provider, financial or deployment action.

External deployment settings, provider disposition, caller shutdown and hosted
verification remain **UNVERIFIED** owner prerequisites. Deleting the empty
launch-confirmation ledger creates no completion evidence.

## Public privacy and security copy — 03-07b-02

The candidate removes current payment-processing claims from Privacy and Security and the billing reference from the in-app changelog. Before releasing these pages, Robert must reconcile their effective/review dates and any required user notice with the actual release, confirm remaining provider disclosures, and account for historical payment records and outstanding obligations under the retirement sequence above. Local copy changes do not certify provider data deletion, terminate agreements, cancel charges or establish legal completion. Retained privacy, security and support contacts remain available.
