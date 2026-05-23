# Local Auth Testing

Use local Supabase plus Mailpit to test Account Setup Link delivery, legacy invite compatibility, and password recovery without touching production auth limits or real email delivery.

## One-time local setup

1. Start Supabase:

   ```bash
   supabase start
   ```

2. Confirm local service URLs and keys:

   ```bash
   supabase status -o env
   ```

3. Make sure `.env.local` points at local Supabase:

   ```bash
   PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ACCOUNT_SETUP_SESSION_SECRET=local-dev-only-secret
   APP_PUBLIC_ORIGIN=http://localhost:5173
   ```

   Production must set `ACCOUNT_SETUP_SESSION_SECRET` and one official public origin variable:
   `APP_PUBLIC_ORIGIN`, `PUBLIC_APP_ORIGIN`, or `PUBLIC_SITE_URL`. Preview and local-like hosts can
   be listed in `APP_PUBLIC_ORIGIN_ALLOWLIST`.

4. Start the app:

   ```bash
   npm run dev
   ```

## Local email inbox

- Supabase local auth emails are captured by Mailpit at [http://127.0.0.1:54324](http://127.0.0.1:54324).
- Beta approval emails are app-owned Account Setup Link emails. They point directly at `/auth/setup-account?token=...`, expire after 14 days, and should never expose raw token hashes in storage.
- Account Setup Link failed or stuck-pending delivery recovery creates a fresh replacement setup link. It does not retry, store, or reconstruct the old raw token or token-bearing setup URL.
- Organization Invitation emails can be retried safely because they point to sign-in or access-request pages and do not contain bearer tokens.
- Supabase invite and recovery templates are legacy/provider emails. Recovery still builds app-owned confirmation links with `{{ .RedirectTo }}` and `{{ .TokenHash }}`.
- The visible email link should start with the active app origin, land on `/auth/confirm`, include `token_hash=`, and never expose `/auth/v1/verify`.
- After opening the email link, the browser should stop on the confirmation page until you press the button to continue into invite setup or password reset.
- Account Setup Link email links remain valid for 14 days, but the token-bearing URL is exchanged for a 10-minute setup session before the password form is shown.
- Public renewal and setup attempt rate limits use shared Supabase-backed buckets for email, setup-link/access-request, and IP dimensions.
- The Playwright auth suites use their own isolated app server on `127.0.0.1:4173` so they do not inherit whatever state or rate-limiting conditions your normal dev server might already have.
- If you change `supabase/config.toml` or `supabase/templates/*.html`, restart Supabase so GoTrue reloads the auth config.
- CI may be manual-only in private or solo-dev mode while GitHub Actions quota is constrained. Do not re-enable push or pull-request triggers only to run these local auth checks.

## Run the auth smoke tests

The legacy Supabase auth email spec still validates provider compatibility:

- creates an invited user via the local admin API
- reads the invite email from Mailpit
- completes the `/auth/accept-invite` password flow
- requests a password reset
- reads the recovery email from Mailpit
- completes the `/auth/reset-password` flow
- verifies the user can sign in with the new password

Run the base auth email flow with:

```bash
npm run test:e2e:auth
```

Run the access-request approval and resend flow with:

```bash
npm run test:e2e:access-requests
```

That suite is the focused Account Setup Link regression suite. It runs against local Supabase and Mailpit only, sets `APP_PUBLIC_ORIGIN` to the Playwright app origin, and covers approval delivery, tokenless setup, newest-link-only replacement, setup races, failed-after-claim recovery, and outbox retry support states.

These two focused suites are more reliable than a single giant auth run because local Supabase auth can get temperamental when many invite and recovery emails are created back to back in one process.

## Run the auth workflow database authorization contract

The auth workflow storage authorization checks live in `supabase/tests/auth_workflow_authorization.sql`.
They use pgTAP against local Supabase and wrap all fixture rows in a transaction that rolls back at the
end. They do not reset, delete, or migrate local tables.

Run them with:

```bash
supabase start
supabase test db supabase/tests/auth_workflow_authorization.sql
```

Use only a local or disposable database URL for this contract. Do not run it against production.

## Manual Account Setup Link check

Use this when validating the beta setup path from approval through first sign-in:

1. Submit `/auth/request-access` with a new email.
2. Approve the pending request from `/admin/access-requests`.
3. Confirm the sent email contains an Account Setup Link for `/auth/setup-account?token=...`.
4. Open the setup link, choose a password, and confirm the browser lands on `/dashboard`.
5. Confirm `access_requests.setup_completed_at` is set and only a Supabase **User Account** was created. Beta setup must not create an **Organization Member**.
6. Use the same email on `/auth/request-access` again. Completed setup should not create a new pending request or a fresh setup path.
7. For an approved incomplete request, use `/auth/renew-invite` to request a fresh setup link. The newest link should work and older unused links should report replaced/invalid states.
8. For an expired setup link, confirm `/auth/setup-account` points the user to fresh-link recovery.

## Account Setup Link cleanup

Account Setup Link cleanup uses the same bearer-secret pattern as the other cleanup endpoints:

```bash
curl -H "Authorization: Bearer $CLEANUP_SECRET" http://localhost:5173/api/cleanup-account-setup-links
```

The cleanup revokes expired unused setup-link records by setting `revoked_at`, reports already revoked stale links, and preserves used setup-link rows so completed setup history remains available for admin support and audit review. It intentionally does not delete **Access Requests** or Supabase **User Accounts** by default.

## What this does and does not validate

- This validates your app logic, redirect handling, password policy, and Supabase local email links end to end.
- This validates that Account Setup Link setup creates a **User Account** only, not an **Organization Member**.
- This validates that legacy invite and recovery emails round-trip through the app-owned `/auth/confirm` page before the token is verified.
- This does not validate real-world deliverability to `@army.mil` or `@health.mil`.
- Hosted Supabase's built-in email sender is still limited to 2 emails per hour project-wide. Local Mailpit avoids that limitation for development, but production will still need a delivery strategy that those domains actually accept.

## Manual Mailpit check

After restarting local Supabase and sending one invite plus one recovery email:

- confirm the visible link starts with your active app origin (`localhost:5173`, `127.0.0.1:5173`, or the Playwright host on `127.0.0.1:4173`)
- confirm the link path is `/auth/confirm`
- confirm the link includes `token_hash=`
- confirm the link does not expose `supabase.co` or `/auth/v1/verify`
