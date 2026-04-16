# App-Domain Auth Email Flow

## Problem

Supabase Auth invite and recovery emails currently send users through Supabase-hosted verification URLs before they reach TroopToTask:

```text
https://<project-ref>.supabase.co/auth/v1/verify?token=...
```

Those links do not match the visible sender domain used by Resend/Supabase SMTP. Strict recipients, especially `.mil` mail systems, can treat that mismatch as suspicious even when SMTP delivery, SPF, DKIM, and DMARC pass.

## Goal

Make auth email links start on the TroopToTask app domain, then let TroopToTask verify the Supabase token server-side and continue into the existing invite or password-reset pages.

Desired local invite link shape:

```text
http://localhost:5173/auth/confirm?token_hash=...&type=invite&next=/auth/accept-invite
```

Desired production invite link shape:

```text
https://trooptotask.org/auth/confirm?token_hash=...&type=invite&next=/auth/accept-invite
```

## Current State

- Local Supabase `site_url` is already `http://localhost:5173`.
- Local Supabase invite template exists at `supabase/templates/invite.html`.
- The invite template currently uses `{{ .ConfirmationURL }}` for the primary link and fallback text.
- Recovery emails currently use Supabase's default template.
- App routes currently support the post-Supabase PKCE callback flow by reading `code` on:
  - `/auth/accept-invite`
  - `/auth/reset-password`
- E2E auth tests currently assert that email links include `redirect_to=<app route>`, which confirms the old Supabase-hosted link shape.

## Proposed Design

Add an app-owned confirmation page:

```text
GET /auth/confirm?token_hash=<hash>&type=<email-otp-type>&next=<safe-app-path>
```

The GET request will:

1. Validate `token_hash`.
2. Validate `type` against the Supabase email OTP types this app supports.
3. Validate `next` against a small allow-list of internal auth destinations.
4. Render a minimal TroopToTask confirmation page with a single action button.
5. Avoid calling Supabase verification from GET so mail scanners cannot consume the token just by prefetching the link.

The POST action will:

1. Re-validate `token_hash`, `type`, and `next`.
2. Call `locals.supabase.auth.verifyOtp({ token_hash, type })`.
3. Set the existing pending auth-flow cookie based on the confirmed type.
4. Redirect to the intended app page.
5. Redirect to login with a generic error for invalid, expired, or unsupported links.

Supported initial types:

```text
invite -> /auth/accept-invite
recovery -> /auth/reset-password
```

The existing `code` exchange handling in `/auth/accept-invite` and `/auth/reset-password` should stay in place during rollout so older emails remain usable until they expire.

## Code Changes

1. Add `/auth/confirm` route.
   - Use Supabase SSR client from `locals.supabase`.
   - Import `EmailOtpType` from `@supabase/supabase-js` for type safety.
   - Use a destination allow-list to prevent open redirects.
   - Keep GET side-effect free.
   - Set the same pending auth-flow cookie from the POST action that is currently set by the existing route loaders.

2. Add focused unit tests for confirmation behavior.
   - GET with valid invite params renders a confirmation page and does not call `verifyOtp`.
   - GET with valid recovery params renders a confirmation page and does not call `verifyOtp`.
   - POST with valid invite token redirects to `/auth/accept-invite` and marks pending flow as `invite`.
   - POST with valid recovery token redirects to `/auth/reset-password` and marks pending flow as `recovery`.
   - Missing token redirects to login or renders a safe invalid-link state.
   - Unsupported `type` redirects to login or renders a safe invalid-link state.
   - Unsafe `next` values do not redirect off-site.
   - Supabase verification errors redirect to login without leaking token details.

3. Update local Supabase invite template.
   - Replace `{{ .ConfirmationURL }}` with:

     ```html
     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/accept-invite
     ```

   - Replace fallback copy/paste URL with the same app-domain URL.

4. Add local Supabase recovery template.
   - Add `supabase/templates/recovery.html`.
   - Add `[auth.email.template.recovery]` to `supabase/config.toml`.
   - Use:

     ```html
     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password
     ```

5. Update E2E auth tests.
   - Assert extracted invite and recovery links start with `appBaseUrl`.
   - Assert links include `/auth/confirm`.
   - Assert links include `token_hash=`.
   - Assert links do not include `/auth/v1/verify`.
   - Keep end-to-end password setup and password reset behavior unchanged.

6. Update access-request E2E tests.
   - Replace old `redirect_to=` assertions with app-domain confirm-link assertions.
   - Keep the approve, resend, and completed-setup behavior unchanged.

7. Update docs.
   - Extend `docs/local-auth-testing.md` with the new local template behavior.
   - Add production dashboard checklist:
     - Update Supabase Auth site URL if needed.
     - Update Invite template to use `TokenHash`.
     - Update Recovery template to use `TokenHash`.
     - Keep redirect allow-list entries for app auth pages.
     - Send a production test to non-military and `.mil` addresses.

## Local Verification Plan

Use local Supabase and Mailpit.

1. Restart local Supabase after template/config changes:

   ```bash
   supabase stop
   supabase start
   ```

2. Run focused auth email flows:

   ```bash
   npm run test:e2e:auth
   npm run test:e2e:access-requests
   ```

3. Run required repo verification:

   ```bash
   npm run format
   npm run lint
   npm run check
   npm run test
   ```

4. Manually inspect Mailpit for one invite and one recovery email:
   - Link starts with local app origin.
   - Link path is `/auth/confirm`.
   - Link has `token_hash=`.
   - Link does not expose `supabase.co` or local `/auth/v1/verify` in the visible URL.

## Production Rollout Checklist

Do not touch the production database for this change.

After merge and deploy:

1. Confirm deployed `/auth/confirm` responds on the production app domain.
2. In Supabase production dashboard, update auth email templates to match the committed local templates.
3. Confirm Supabase production `Site URL` is the production app origin.
4. Confirm redirect allow-list includes:

   ```text
   https://trooptotask.org/auth/accept-invite
   https://trooptotask.org/auth/reset-password
   https://trooptotask.org/auth/confirm
   ```

   Use the actual production host if different.

5. Send test invite and recovery emails to:
   - A normal personal inbox.
   - `@health.mil`.
   - `@army.mil`.

6. In received headers, confirm authentication passes:
   - `dkim=pass`
   - `dmarc=pass`

7. In Resend insights, confirm URL-domain warning clears or is reduced.

## Risks

- Supabase local template support for `{{ .TokenHash }}` needs to be verified with current CLI/runtime behavior.
- Email clients or security gateways may prefetch links. The proposed two-step flow keeps GET side-effect free so prefetching cannot consume the token. The remaining risk is scanners that submit forms, which is uncommon but should be monitored during `.mil` testing.
- Older emails using `{{ .ConfirmationURL }}` should remain valid until expiration because existing `code` handling is preserved.
- Production dashboard templates must be updated manually at merge/deploy time; committed local templates do not automatically change hosted Supabase.

## Open Questions

- What is the final production app origin: `https://trooptotask.org`, `https://www.trooptotask.org`, or another host?
- Should signup confirmation templates be updated now, or only invite/recovery since those are the active access-request flows?
