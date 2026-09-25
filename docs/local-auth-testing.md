# Local Auth Testing

Use the [verification contract](architecture/DEFINITION_OF_DONE.md#verification-contract) for required commands and evidence. This guide covers retained Account Setup Links, Organization Invitations, legacy provider invite compatibility and password recovery. Repository browser suites, scripts and runtime test bypasses have been removed.

## Focused lower-level checks

Run the existing route and workflow tests without starting Supabase or an email provider:

```bash
npm run test -- src/features/identity src/routes/auth src/routes/api/auth src/routes/account src/lib/server/accountSetup
```

These filters exercise the current auth routes, setup-link/session/completion workflows and API auth boundaries. Run adjacent invitation, authorization and rate-limit tests when those seams change, then the full required command sequence. A passing filtered run proves only its tested outcomes, not email delivery, browser interactions or complete retained-flow coverage. Task 02-02 owns gaps in the reviewed-acquisition safety net.

## Disposable local environment

Computer-use auth flows write auth state even when only signing in. Use a disposable local Supabase project with synthetic users and a local Mailpit inbox; do not reuse existing local stacks or live data. Follow the [database isolation contract](architecture/DEFINITION_OF_DONE.md#isolated-database-checks) before starting services or applying migrations. Existing authorization for isolated verification is sufficient.

1. Inspect lifecycle/seed configuration, allocate a unique project ID and unused ports outside 543xx/553xx/563xx, and disable legacy seed loading in the disposable configuration. Start services only from that isolated project context and record the exact commands. Never run an unqualified repository-root `supabase start` for these checks.
2. Configure the app process to use that project's loopback `PUBLIC_SUPABASE_URL`, synthetic project's `PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, a local-only `ACCOUNT_SETUP_SESSION_SECRET`, and an `APP_PUBLIC_ORIGIN` matching the chosen unused app port. Keep keys and sessions out of committed files, logs and screenshots. Provider-generated auth emails use the disposable Supabase SMTP inbox. App-owned Account Setup Link and Organization Invitation emails use Resend; there is no app Mailpit switch. For those computer-use flows, supply an externally managed, isolated transport capture that cannot send real mail. If unavailable, record delivery-dependent flows as not run. Lower-level tests inject a fake fetch or email sender. Keep abuse limits enabled.
3. Build with `npm run build`, then serve with `npm run preview -- --host 127.0.0.1 --port <app-port>` using the same isolated configuration. Record the actual origin and versions. Use a new browser session and synthetic fixtures for each role/scope needed by the flow.
4. Open Mailpit at the allocated inbox port. If disposable auth configuration or templates change, restart only that disposable stack. Clean up only the resources created for this verification.

This guide does not provision that environment or establish that it is available. If the safe fixture, provider configuration or computer-use tool is missing, record the flow as **not run**, with the blocker. Do not substitute an existing stack or call missing evidence passed.

## Auth workflow database contracts

Storage authorization checks live in `supabase/tests/auth_workflow_authorization.sql`; retained sensitive-RPC and personnel-artifact scope checks are adjacent in `supabase/tests/`. They use synthetic transactional fixtures, but rollback does not make an existing database an acceptable target.

After fresh replay and upgrade preparation in the disposable project, run the focused contract with `supabase test db supabase/tests/auth_workflow_authorization.sql` and all retained SQL contracts with `npm run db:test`. Resolve both commands' working directory/configuration to the disposable project, with the candidate's SQL tests and package script present there. Record exact paths/commands and positive/negative RLS results under the shared database contract. Do not run these commands against the repository's configured existing stack or a remote database.

## Computer-use auth flows

Capture candidate, environment, synthetic roles/scopes, steps, expected/observed outcomes and redacted screenshots or recordings as specified by the verification contract. These are flows to observe, not claims of coverage or a new browser harness. Select affected flows for each task; release verification covers all retained journeys.

### Reviewed acquisition and Account Setup Links

1. Confirm anonymous GET and POST `/auth/sign-up` continue to reviewed `/auth/request-access` acquisition. Authenticated continuation must still respect authentication/MFA.
2. Submit an Access Request with a synthetic email and approve it through `/admin/access-requests` using an authorized synthetic admin. Confirm an unauthorized user cannot approve it.
3. Inspect the isolated app-email capture for an Account Setup Link to `/auth/setup-account?token=...`. Links last 14 days; raw tokens/hashes and token-bearing URLs must not appear in evidence artifacts.
4. Open the link and confirm the token-bearing URL is exchanged for a 10-minute setup session before entering a password. Complete setup and confirm the browser lands on `/dashboard`.
5. Through an authorized disposable fixture inspection, confirm `access_requests.setup_completed_at` is set and setup created only a Supabase **User Account**, not an **Organization Member**.
6. Request access again with that completed email. Confirm no new pending request or fresh setup path is created.
7. For an approved incomplete request, use `/auth/renew-invite` to obtain a new link. Confirm the newest link works and old unused, expired and replayed links produce the appropriate recovery/error outcome. Construct expiry cases through synthetic fixtures, without changing production duration or bypassing rate limits.
8. Check failure/recovery states owned by the changed task. Failed or stuck-pending delivery recovery must create a fresh replacement link; it cannot reconstruct the old raw token or setup URL. Keep deterministic race and failed-after-claim coverage at the lower-level seam as well.

### Organization Invitations and access boundaries

- Exercise both new and existing synthetic invitees. A new invitee receives a separate Account Setup Link and Organization Invitation; setup alone grants no membership. Existing accounts retain invitation acceptance.
- Confirm invitation resend does not mint a setup credential. Invitation messages lead to sign-in/access-request pages without bearer tokens.
- Check normalized email matching, expiration/replay rejection, authorized acceptance and Organization/Group scope. Include a denied user or mismatched email and confirm another Organization's access remains unchanged.
- For affected security flows, verify MFA, suspension, sensitive-action step-up, safe redirects and failure handling using the normal controls. Retain abuse limits; repeated attempts must not require a bypass to finish a check.

### Legacy provider invitation and password recovery

Using only synthetic users and the disposable provider/inbox:

1. Issue the legacy provider invitation needed by the compatibility check, and request password recovery through the app.
2. Inspect each email's visible link: it uses the active app origin and `/auth/confirm`, includes `token_hash=`, and does not expose the provider `/auth/v1/verify` URL. Recovery templates use `{{ .RedirectTo }}` and `{{ .TokenHash }}`; Account Setup Links use the separate route above.
3. Open each link and confirm the page waits for an explicit button press before verifying the token and continuing to `/auth/accept-invite` or `/auth/reset-password`.
4. Complete the password flow, verify sign-in with the new password and check relevant invalid/replayed-link and password-policy errors. Preserve entered values and usable keyboard/focus behavior on failure.

### Setup-link cleanup

When cleanup behavior changes, invoke `/api/cleanup-account-setup-links` only on the disposable app using its local bearer secret. Record redacted outcomes: expired unused links receive `revoked_at`, already revoked stale links are reported, and used links remain available for history/audit. Access Requests and User Accounts are not deleted by this cleanup. Lower-level tests must cover authorization and retained-row outcomes.

## Evidence limits

Lower-level tests and observed local flows provide different evidence. Neither proves real-world delivery to military email domains or hosted-provider capacity. Local Mailpit observations prove only provider-generated auth delivery; an isolated app-email capture proves only the captured transport path. Mark each required scenario passed, failed or not run; record missing provider/browser/performance evidence with its owning task before program closure.
