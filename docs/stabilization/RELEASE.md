# Owner release obligations

Stabilization is complete. These external actions were still open in the release record when the process retired. Only the owner can perform or confirm them; the repository cannot. Record outcomes outside Git with no secrets, raw payloads or personal data. Run a migration only through the ordered owner procedure. Delete a line when it is done, and delete this file when it is empty.

## Migrations

- [ ] Apply `20261021000100_organization_feature_switches.sql` (SHA-256 `ccab7bde…5a95`) if it is not already applied. It merged in #1796, and without it no Organization page loads.
- [ ] Check the hosted migration ledger for the migrations no owner report confirms: `20260923000000_retire_duty_schema`, `20260926000200`, `20260926000300`, `20260928000100`, `20260929000100`, `20260929000200`, `20260930000100`, `20261001000100_personnel_archive_retention` (SHA-256 `8681e85f…54e8`), `20261004000200_critical_task_archive_retention` (SHA-256 `0f6a4e55…9c3b`), `20261004100618` and `20261012000100` through `20261012000700`.
- [ ] Before ever running `VALIDATE CONSTRAINT` on the `NOT VALID` composite foreign keys (Critical Tasks completions, availability status, Training type references, Personnel Group), run the private read-only mismatch counts and settle each nonzero row.

## Stripe and billing shutdown

- [ ] Disable every Stripe webhook destination, and its pending retries, that targets the retired `/api/webhooks/stripe` endpoint, along with any operator automation aimed at it.
- [ ] Stop any external scheduler, notification or copied script that calls `/api/billing-reconciliation`, the snapshot backfill or the deleted billing lifecycle, preflight and readiness scripts.
- [ ] Dispose of open Stripe Checkout sessions and external checkout and billing-portal links, and retire the Stripe checkout, portal, product and price configuration.
- [ ] Settle every outstanding Stripe subscription, charge, invoice, refund, tax obligation and undelivered event, and decide retention of historical customer and payment records held by Stripe.
- [ ] Delete the hosted `PUBLIC_BILLING_ENABLED`, `BILLING_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEAM_PRICE_ID`, `STRIPE_UNIT_PRICE_ID`, `STRIPE_TEAM_LEGACY_PRICE_IDS`, `STRIPE_UNIT_LEGACY_PRICE_IDS`, `STRIPE_AUTOMATIC_TAX_ENABLED`, `STRIPE_TAX_DASHBOARD_VERIFIED`, `BILLING_RECONCILIATION_SECRET`, `BACKFILL_SECRET`, `BACKFILL_APP_URL` and backfill-only `PUBLIC_APP_URL` values once no deployment or rollback candidate needs them. Keep `CRON_SECRET`, cleanup, Supabase, auth, email and canonical-origin values.
- [ ] Revoke the Stripe API key and webhook signing secret last.
- [ ] Reconcile the Privacy and Security pages' effective and review dates and provider disclosures with the release, and send any required user notice.
- [ ] Tell owners and users that billing, pricing and the paid-plan Terms are gone, and point external bookmarks, help and links for `/org/<org>/settings/billing`, `/org/<org>/billing`, checkout return URLs and `/#pricing` to Request Access.

## Hosted configuration

- [ ] Confirm old Duty-dependent instances, workers and external jobs are drained, and retire any external job or configuration that addresses Duty-only paths or objects.
- [ ] Find external callers of the dropped two-argument Calendar assignment helpers, the Rating Scheme lookup RPC, the removed Personnel cleanup alias and direct readers of Personnel sensitive data.
- [ ] Confirm the production serving revision and that pre-cutover instances have drained, including the Document, Counseling Record and Sign-in Roster upload consumers.
- [ ] Settle unresolved upload registrations after proving each provider call finished and its file was attached or cleaned up.
- [ ] Confirm the hosted Supabase new-user sign-up setting is still disabled and its email-confirmation settings match the invitation and Account Setup contract.
- [ ] Confirm the canonical public origin, setup and session signing secrets, secure-cookie and proxy behavior, provider rate limits, real mail delivery, GitHub Feedback mirroring, and the four cleanup cron paths, schedules and secrets.
- [ ] Inspect Vercel's preview and production triggers and deployment configuration, which no release entry has inspected.

## Production checks

Confirm each through ordinary authorized use, for an Organization-wide member and a Group-scoped member where scope applies.

- [ ] With no commercial environment values, sign-in, Request Access, Organization access and scoped workflows work, and the retired reconciliation, checkout, portal and webhook endpoints cannot perform billing. An anonymous redirect to login is not proof.
- [ ] Calendar assignment and type IDs, dates, assignees, labels, exports and allowed and denied create, edit and delete are unchanged after the Duty schema retirement.
- [ ] Calendar, its assignment planner and the status-day report show the same data as before; a Group-scoped operator can save a slot but is refused one held by a Person it cannot see.
- [ ] Calendar reads and writes for unassigned Personnel and bulk availability removal work in scope.
- [ ] A configurator can toggle and reorder Calendar lanes (Days last), set a one-day status label and drag status order, reset federal holidays, and add a weekday closure range that skips existing holidays and closures; a non-configurator is denied each.
- [ ] Personnel reads and writes on unassigned records, Group changes and unassignment, independent-lane reads and Group deletion work for Group, empty-Group and Organization-wide members.
- [ ] A Group-scoped member sees only its Groups in Personnel and Calendar, and an Organization-wide Personnel configurer can create, rename and delete a Group.
- [ ] Personnel sensitive data denies viewers and operators, allows configure-level reads and downloads in scope, and keeps operator create, archive and file cleanup, member-manager export and Training file access. Group and empty-Group members cannot read or write counseling files directly.
- [ ] An archive request and its approval, direct archive, bulk archive and restore, archive then permanent delete, and an operator edit work through their normal roles.
- [ ] An authorized upload, an archived deletion, one counseling deletion approval, one failed-write retry and scheduled pending file cleanup work, and deleted file keys are never reused.
- [ ] Counseling uploads save the typed conductor and rows show "Conducted by" or "Uploaded by"; the Data sheet shows the marital status date and the saving member and time; follow-up "completed by", leader-note edit time and the Archived tab's archiver display.
- [ ] Rating Scheme lookups, reads and writes respect Group, empty-Group, Organization-wide and denied-lane access.
- [ ] Training type deletion works and Group-scoped or operator-level catalog writes are denied. A Training operator can log a completion with a PDF certificate, open it and correct the replaced completion in History; only a configurator can mark an item exempt.
- [ ] The Dashboard summary, Training page, Critical Tasks matrix and a Person's Training and Critical Tasks lanes show the same records and latest completions as before.
- [ ] Onboarding Active, History and Templates load; a Paperwork stage move saves; template assignment, switch, resync, copy, reorder, delete and pending-copy retry work; a packet completed late in the evening west of UTC shows the same local start and finish day.
- [ ] A Sign-in Roster scan uploads, downloads, replaces, removes and deletes, and a viewer sees none of those controls.
- [ ] No approved `access_requests` row lacks `approval_basis`; one new-person invitation, one platform approval, one Organization creation, an owner invite and member-access save, a member deletion request, platform promotion and a confirmed ownership transfer work, each Organization keeps exactly one owner and unrelated memberships are unchanged.
- [ ] After a password change, a fresh sign-in's Account Security shows the password form, and an active Organization loads its data.
- [ ] Every feature shows in the sidebar for an existing unit, and the dashboard availability figure uses the success color at or above 80 percent and the warning color below.
