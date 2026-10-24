# Identity recovery, MFA and account security

A member completes a second-factor challenge, recovers a forgotten password, activates an invited account, changes their
password and authenticator from Account Security, and a visitor requests access. A suspended account sees only the
suspension screen.

## Sub-features

- `mfa-challenge`: an account with a verified authenticator signs in and lands on Two-Factor Authentication with focus
  already in the code field. The sixth digit, typed or pasted, submits. A wrong code is rejected in place and the next
  digit starts a fresh code; the current code is admitted to the `next` path. Its `Sign out` link leaves the pending
  session. Codes are limited per account.
- `password-recovery`: Forgot Password accepts any well-formed address with the same confirmation; the browser blocks a
  malformed one. A recovery link opens the passive `/auth/confirm` review page; continuing sets a new password on Reset
  Password, and the new password signs in.
- `invite-activation`: an invite link continues to Accept Invite, which sets the first password. Renew Invite validates
  and accepts a setup-link request.
- `account-setup`: Account Setup without a valid setup link shows its unavailable state and recovery links. A valid
  setup link opens Choose your password, and completion activates the User Account and signs in. A used link shows
  Account setup complete. Expired, replaced, failed and unapproved links show their unavailable messages. A link whose
  access was withdrawn (a revoked or blocked invitation, or a platform rescind) shows the withdrawn message, and a
  claimed link offers Check setup status.
- `request-access`: Sign Up redirects to Request Access. Submit stays disabled until the required fields are set, and a
  submission stores one pending Access Request.
- `account-security`: a signed-in member requests an email change and sees it pending, is rejected for an incorrect
  current password with the draft kept, changes their password, and sets up a TOTP authenticator on the full-page MFA
  setup (`/auth/mfa-setup`) then removes it. Its inline authenticator challenge for a session lacking the second factor
  has no normal-use route (step 8).
- `suspended`: a suspended account reaches only Account Suspended, with Sign out.
- `logout-page`: a GET of `/auth/logout` returns to `/`. Its page renders only after a sign-out POST. Signing out in a
  second tab that has no remaining session shows `Signed out on this browser.` with a Sign in link (step 10). The failed
  sign-out state (`Try signing out again.`, 503) has no normal-use route.
- `web-boundary`: the CSP allows no provider origin and blocks no app request; page data carries no session tokens;
  encoded paths share their request limits (step 12).
- `link-errors`: an incomplete or used confirmation link shows Link unavailable; Reset Password and Accept Invite
  without their flow show their unavailable states.

## How to get to it (user POV)

From Sign In, follow Forgot password, Request access or Request a fresh setup link. Recovery and invite emails open
`/auth/confirm`, which waits for an explicit Continue button. A signed-in member opens Account menu → Account, then
Security for password and Two-Factor Authentication. Enable MFA on Security opens MFA setup at `/auth/mfa-setup`. An
account with a verified authenticator sees Two-Factor Authentication after the password step.

## Helper controls

Identity verification uses the [identity recovery and security recipe](identity-recovery-security.md) and its dedicated
`identityMfa`, `identityRecovery`, `identitySecurity` and `identitySuspended` actors. The disposable provider enables
Supabase TOTP for these journeys; seeding gives `identityMfa` a verified factor and `identitySuspended` a
`user_suspensions` row. `mfa-code PAGE ROLE LABEL [N]` fills the named textbox with the role's current TOTP code (labels
match whatever their rendered case, since Auth Shell labels are styled upper case); the factor secret stays inside the
owned provider control. `password PAGE ROLE current|next LABEL [N]` fills the current or a privately generated
replacement password, and `password-commit ROLE` adopts the replacement for later `actor` sign-ins after a visible save.
`auth-link PAGE recovery ROLE` or `auth-link PAGE invite` navigates the owned page to the app's `/auth/confirm` link
from the provider admin API and prints a token-redacted snapshot; it proves link handling, not email delivery.
`access-request EMAIL` reads stored Access Requests and their Account Setup Links for one `@example.test` address.
`seed account-setup` stores one synthetic Access Request and setup link per page state, keeping raw tokens in private
worker state. `setup-link PAGE CLASS` navigates the owned page to that class's `/auth/setup-account` link and prints a
token-redacted snapshot. `fixture` lists the identity actors' addresses under `identityEmails`. The `network` control's
`auth/mfa/enroll` family holds or fails MFA setup's enroll request, and its `access-requests` family fails Request
Access's submission at the server (`arm-fail`) or the transport (`arm-reject`).

The disposable provider also runs its local Mailpit capture, so the provider's own email-change mail succeeds without
leaving the worker. Run `node --test .agents/skills/verify-trooptotask/helpers/identity-controls.test.mjs` and
`python3 -m unittest scripts.verification.test_environment` for these boundaries, and
`node --test .agents/skills/verify-trooptotask/helpers/busy-control.test.mjs` for the busy observer.

The [identity recipe](identity-recovery-security.md) owns the identity faults: `password-update` (`PUT /auth/v1/user`
with a `password` field, before commit), `password-reconcile` (the `password_change_attempt` RPC with `p_action`
`reconcile`), `password-revocation` (`POST /auth/v1/logout?scope=others`), `setup-password`
(`POST /auth/v1/admin/users`), `setup-reconcile` (`rpc/reconcile_account_setup_claim`) and `setup-finalize` /
`setup-finalize-lost-ack` (`rpc/complete_account_setup_recovery`).

`session-age IDENTITY_ROLE HOURS` (1–48) moves only that synthetic account's provider session starts back so the real
24-hour check runs, and read-only `session-count IDENTITY_ROLE` reports how many provider sessions it holds.
`admission-probe ROLE OTHER_ROLE` signs ROLE in through the provider privately, sends the owned app its genuine session
cookie as a control plus malformed, bad-signature, subject-swapped and `alg: none` variants on Account Security and
`/api/auth/mfa/status`, prints statuses and the forged tokens with the genuine signature withheld, and revokes only that
probe session; `node --test .agents/skills/verify-trooptotask/helpers/admission-probe.test.mjs` covers it.

`access-request EMAIL` also returns `reviewed_by`, the invitation bridge rows with each linked invitation's `status`,
`approval_basis` and `setup_grant_live`, which reports whether the derived invitation or platform grant can still mint
and admit setup credentials.

## Driving it with verify:app

Preconditions: doctor passes on the owned worker. `$V fixture` lists the dedicated Organization A members, with their
synthetic addresses under `identityEmails`: `identityMfa` (verified TOTP factor from seeding), `identityRecovery`,
`identitySecurity` and `identitySuspended` (a `user_suspensions` row). These accounts exist only for this recipe because
their credentials, factors or suspension change; never reuse them for another feature's journey. Use
`$V actor --form ROLE dashboard` for their sign-in, because this recipe verifies the form, its challenge and the
limiter, and a fresh `tool new_page` context for public pages.

The private-credential controls fill visible fields without printing values:

- `$V mfa-code PAGE ROLE LABEL [OCCURRENCE]` fills the role's current six-digit code from its newest TOTP factor into
  the named textbox.
- `$V password PAGE ROLE current|next LABEL [OCCURRENCE]` fills the role's current password, or one generated
  replacement kept in private worker state. `$V password-commit ROLE` adopts the replacement after the visible save
  succeeds. The daemon's `login` command keeps the launch credentials, so use `actor` for these roles.
- `$V auth-link PAGE recovery ROLE` (or `auth-link PAGE invite` for a new synthetic address) navigates the named owned
  page to the app's `/auth/confirm` URL and prints a snapshot with the token redacted. Do not `take_snapshot` or
  `list_pages` while that page is still on `/auth/confirm`, including after a failed Continue; native screenshots carry
  no URL. Redact any snapshot that captured it before packaging.
- `$V access-request EMAIL` reads stored Access Requests for one lowercase `@example.test` address, with their Account
  Setup Links (no token hashes).
- `$V seed account-setup` stores one approved synthetic Access Request and Account Setup Link per class: `valid`,
  `claimed`, `expired`, `replaced`, `failed`, and `not-approved` (its request is still pending). It prints each class's
  address and link state.
- `$V mail-link PAGE EMAIL setup|auth|invitation [N]` opens a link the owned app actually sent (setup email from an
  approval or Organization invite, or the invitation email's `/auth/renew-invite` recovery link) with a token-redacted
  snapshot. Use it for renew-invite results and setup completion, and `$V mail state` to see what was sent. Controls are
  in [Organization invitations](organization-invitations.md).
- `$V setup-link PAGE CLASS` navigates the named owned page to the class's `/auth/setup-account?token=` link and prints
  a snapshot with the token redacted. It proves link handling, not approval-email delivery. Valid and claimed links
  redirect to the bare `/auth/setup-account`. The other classes stay on the token URL, so use the printed snapshot and
  native screenshots until the page navigates away.

1. **MFA challenge.** Run `$V actor --form identityMfa dashboard`; the helper stops on `/auth/mfa-verify` with
   `Enter your code` and the eyebrow `Two-factor · ADDRESS`. Focus is already in Verification Code
   (`document.activeElement.id` is `mfa-code`), and a reload keeps it there. Capture the page. Type a wrong code with
   native `type_text` and press nothing: the sixth digit sends `POST /api/auth/mfa/verify` (401), the cells turn red
   under `That code didn't match. Try the next one.`, the `Code rejected` step turns amber, and focus returns with the
   code selected. Type one digit: it replaces the code and clears the error. Paste a wrong code (`evaluate_script`
   `navigator.clipboard.writeText`, then `press_key` `Control+V`): it submits without Verify. Run
   `$V mfa-code PAGE identityMfa "Verification Code"` and press nothing: the filled code submits and the page lands on
   the `next` path (`/dashboard?show=all`). In a second `actor --form identityMfa dashboard` context, choose the
   `Sign out` link instead: require the public page, and navigating to `/dashboard` must return to sign-in rather than
   the challenge.
   - Code limit. Codes for a verified factor are limited to 10 per account in 15 minutes, whatever the address. In
     another `actor --form identityMfa dashboard` context, type wrong codes with `type_text` (each sixth digit submits).
     The 11th submission in the window must show the alert
     `Too many authenticator codes. Please wait before trying again.` and stay on the challenge; a response with status
     429 and `Retry-After` appears in `list_network_requests`. Then `mfa-code` with the current code is refused with the
     same message. The limit is stored in the provider, so it also blocks this actor's next sign-in until the window
     passes: run it last for `identityMfa`, or restart the worker. Disable MFA on Account Security shares the same
     per-account budget.
2. **Forgot password request.** In a public context open Sign In → Forgot password. Submit `not-an-email`: the native
   email check blocks it, so the server's `Enter a valid email address` is not reachable from this form. Submit
   `identityRecovery`'s address (`identityEmails` in `$V fixture`) and then an unknown `nobody-RUN@example.test`: each
   shows `Check your email` with `If an account exists for` and the entered address. The visible confirmation must not
   reveal whether the account exists. `$V mail state` shows whether an `auth` message was produced for each address, and
   `$V mail fail auth` exercises a delivery failure.
3. **Recovery link and new password.** In a fresh public context run `$V auth-link PAGE recovery identityRecovery`. Its
   redacted snapshot shows `Confirm your password reset` and `Continue to Password Reset`; capture a native screenshot.
   Click Continue with the printed UID. Require `/auth/reset-password` with New Password and Confirm New Password. Fill
   mismatched values first (one field via `password ... next`, the other by native `fill`): Update Password must stay
   disabled; record whether any message explains the mismatch. Then fill both with
   `$V password PAGE identityRecovery next "New Password"` and `... "Confirm New Password"`, submit and require the
   `Password updated` panel. It shows for about 3 seconds before the page navigates to `/dashboard`, so capture it with
   a snapshot taken right after the press. Run `$V password-commit identityRecovery`, sign out, and prove persistence
   with `$V actor --form identityRecovery dashboard`. Re-running the same link is impossible because the token was
   consumed; a second `auth-link` produces a new link. For an account with a verified authenticator (`identitySecurity`
   after step 8), Continue first shows `Verify your authenticator` with focus already in Authenticator Code;
   `mfa-code PAGE identitySecurity "Authenticator Code"` submits on the sixth digit and moves focus to New Password.
4. **Invite activation and renewal.** In a fresh public context run `$V auth-link PAGE invite`; continue with
   `Continue to Invite Setup` and require Accept Invite's Password and Confirm Password. Native `fill` may use a
   run-local synthetic password here because the new address has no fixture credentials; keep it out of notes. Submit
   and require `Account activated`, then the dashboard without any Organization membership. Separately open Request a
   fresh setup link (`/auth/renew-invite`): submit an empty and malformed email for validation, then a synthetic
   address, and capture `Check your email`. The reply is the same for an address whose invitation grant was withdrawn,
   but `$V mail state` then shows no new `account-setup` message.
5. **Account setup.** Open `/auth/setup-account` without a link and capture `Setup link unavailable` with its recovery
   links. Run `$V seed account-setup`. In a fresh public context run `$V setup-link PAGE valid`: require
   `Choose your password` for the class's address, with Email Address disabled. Fill a short Password by native `fill`
   and capture the requirement list. Fill a different Confirm Password and require `Passwords do not match` with Set Up
   Account disabled. Press Check setup status and require `This setup link is ready. You can choose a password now.`
   with the form kept. Fill both fields with one run-local synthetic password (keep it out of notes) and submit with Set
   Up Account. Require `/dashboard`, which sends an account without membership to `/org/new`. `$V access-request EMAIL`
   must show `setup_completed_at`, `setup_user_id` and the link's `used_at`. In a fresh public context run
   `setup-link PAGE valid` again and require `Account setup complete` with Sign in and Reset your password. Open each
   remaining class in a fresh public context and capture it. `expired` (`has expired`), `replaced` (`was replaced`),
   `failed` (`could not finish setup`) and `not-approved` (`access it was sent for was withdrawn`) show Setup link
   unavailable with Request a fresh setup link. The withdrawn copy also covers a link revoked by a platform rescind and
   an unclaimed link whose invitation grant died;
   [Organization invitations](organization-invitations.md#invitation-grant-liveness) drives those through real issuance.
   `claimed` shows `Check your setup status`. Check setup status leads to `Setup needs support` with a support request
   ID, and a reload keeps Setup needs support. Interrupted attempts use `$V fault arm NAME` before Set Up Account, with
   a fresh `seed account-setup` link each time. `setup-reconcile` shows Setup needs support with a support request ID;
   reopening the same link offers Check setup status, which finishes the committed setup as Account setup complete.
   `setup-finalize` shows Check your setup status, and Check setup status after `fault restore` shows Account setup
   complete. `setup-finalize-lost-ack` commits and shows Account setup complete with
   `This setup link has already been used`. `setup-password` fails the provider account write and shows the
   fresh-link-required message. Read `$V access-request EMAIL` after each for `setup_completed_at` and the link's
   `used_at`. Completion and Check setup status are `/auth/*` POSTs and count toward the shared limit.
   [Platform administration](platform-administration.md) owns approval and real setup-link issuance.
6. **Request access.** Open `/auth/sign-up` and require a redirect to `/auth/request-access`. Submit Request stays
   disabled until First Name, Last Name, Email Address and the source are set. Fill First Name, Last Name, a unique
   `access-RUN@example.test`, open `How did you hear about us?` and choose a source with ArrowDown and Enter, and fill
   Unit and role. Arm `$V network arm-fail PAGE access-requests` and submit: the endpoint's failure shows in an alert
   with every field kept. Restore, arm `network arm-reject PAGE access-requests` and submit:
   `Something went wrong. Please try again.` with the fields kept. Restore; `$V access-request EMAIL` returns no row.
   Submit again and require `Request submitted` with the name, email and submitted time (`24 Oct 2026 · 1432` form, from
   the browser clock), `The link works for 14 days`, Back to sign in, and the steps Submitted (done), Under review
   (current) and Setup link arrives. `$V access-request access-RUN@example.test` must return one `pending` row with the
   submitted name and reason. Submitting the same address again shows the app's retained duplicate behavior; record it
   and the row count.
7. **Account security email and password.** `$V actor --form identitySecurity dashboard`, then Account menu → Account →
   Security.
   - Email. Fill New email address with a unique `security-RUN@example.test` and Current password (occurrence 1) with a
     wrong value by native `fill`. Send Confirmation must show `Email request not confirmed` with
     `Current password is incorrect`, keep the typed address and move focus to Current password. Fill Current password
     with `$V password PAGE identitySecurity current "Current password" 1` and send again. Require `Confirmation sent`
     and a `Pending email` row with the new address, while Current email is unchanged. Reload and require the same
     pending row. The confirmation link is not followed, so sign-ins keep the fixture address.
   - Password. Fill Current password (occurrence 2) with a wrong value, then New password and Confirm new password with
     `next`. Update Password must show `Password update not confirmed` with the app's incorrect-password message, keep
     the new-password drafts and focus the first field. Replace Current password with
     `$V password PAGE identitySecurity current "Current password" 2`. Fill a wrong-length New password by native `fill`
     and capture the requirement list. Fill New password and Confirm new password with `next` again, submit and require
     `Your password is updated and other sessions have been signed out.` Run `password-commit`, then
     `actor --form identitySecurity dashboard` in a new context and open Security. Require the Current password, New
     password and Confirm new password fields with Update Password, and no
     `This attempt expired or belongs to another session` notice: a completed change from an earlier session is history,
     not a blocker. The completing session itself still shows the completed state with Change password again.
   - Interrupted updates. Each uses a fresh `next` password and `password-commit` only after a visible success; the
     durable limit allows 5 update requests per account per 15 minutes, counting restarts and checks. With a second
     `actor --form identitySecurity` context open, `$V fault arm password-revocation` before Update Password: require
     `Your password changed. Finish signing out other sessions to complete this update.` with Finish password update.
     The provider ends the other context's session on its own: `$V session-count identitySecurity` drops from 2 to 1 at
     the commit and the other context's next navigation lands on Sign In. `fault restore`, then Finish password update
     must show the completed message. `password-reconcile` returns 503 with the saved state unavailable: require
     `Saved password status is temporarily unavailable. Check again before continuing.`; Check password update after
     restore completes it. `password-update` fails before the provider commits: require
     `This attempt did not commit. Start a new password update to try again.` on the first reply, with Start new
     password update.
   - Session age. `$V session-age identitySecurity HOURS` moves that account's provider session starts back by HOURS
     each call. Run `session-age identitySecurity 23`: a reload stays signed in. Then run
     `session-age identitySecurity 2` (25 hours in total, not another 25): the next request lands on Sign In and
     `$V session-count identitySecurity` reports 0. This proves the hook's 24-hour exit, not elapsed wall-clock time.
8. **Account security MFA.** On Security, Enable MFA opens `/auth/mfa-setup` (`Scan the code`). The QR image and the
   typed setup key both encode the TOTP secret: never keep a screenshot that shows either. Hide them first with
   `evaluate_script` (`style.visibility = 'hidden'` on `img[alt^=QR]` and `[data-setup-key]`), and redact the image's
   `data:` URL and the key from any saved snapshot before packaging. Arm `$V network arm-hold PAGE auth/mfa/enroll` on
   Security, then choose Enable MFA: skeletons hold the QR code and key while the code field stays disabled.
   `network release PAGE` shows them without moving the code field, and focus lands in `6-digit code from the app`. A
   fresh attempt with `network arm-fail PAGE auth/mfa/enroll` shows `Unable to start MFA setup. Try again.`, and Try
   again starts a new enrollment. Type a wrong code: the sixth digit submits and shows the rejected-code state from
   step 1. Leave the page and choose Enable MFA again: a different setup key appears, because starting again replaces
   the abandoned unverified factor. Cancel setup returns to Security with MFA Disabled, and `mfa-code` into any Security
   textbox then fails with `No readable TOTP factor exists`. Open setup again, keep a second
   `$V actor identitySecurity dashboard` context open, and run
   `$V mfa-code PAGE identitySecurity "6-digit code from the app"`: it submits on the sixth digit, returns to Security
   and shows Enabled. `$V session-count identitySecurity` drops from 2 to 1, and the other context's next navigation
   lands on Sign In. Opening `/auth/mfa-setup` again shows `MFA is on` with Back to security, its three steps done. Sign
   in again with `actor --form identitySecurity dashboard` in a new context: the challenge appears, and
   `mfa-code ... "Verification Code"` admits the session. Back on Security, choose Disable MFA, fill Authenticator code
   with `mfa-code`, Confirm and Disable, and require Disabled. Removal shares the account's 10 codes per 15 minutes with
   the sign-in challenge: after 10 wrong codes the 11th shows
   `Too many authenticator codes. Please wait before trying again.` and a reload still shows Enabled. Cancel and Keep
   MFA Enabled paths must leave the status unchanged.
   - Protected change challenge. The inline `Verify your authenticator code before changing your email.` challenge is
     unreachable through normal use. The admission gate sends any session with a verified factor and only password
     assurance to `/auth/mfa-verify` before an action runs. Enabling MFA in another session revokes the other sessions
     (provider `token_revoked`), so an open Security page returns to sign-in on its next submit. Record it as
     unreachable unless the gate changes.
9. **Suspended.** `$V actor --form identitySuspended dashboard` lands on `/suspended` with `Account Suspended`. Navigate
   to `/dashboard`, `/` and `/org/ORG_A/personnel`: each returns to `/suspended`. The page has no theme control; for
   dark, run `evaluate_script` `localStorage.setItem('theme', 'dark')` and reload. Use Sign out and require the public
   page.
10. **Logout and link errors.**
    - Local-only sign-out. Run `$V actor --form identityRecovery dashboard` (any identity actor works) and keep its
      Organization page open in this tab (A). Open a second tab in the same cookie jar with native `new_page` using the
      actor's `browserContext` value as `isolatedContext`, load the same Organization page and leave it unreloaded (B).
      In A choose Account menu → Sign Out and require `/`. In B, still rendered as signed in, choose Account menu → Sign
      Out (at 390 wide, Toggle Sidebar first) and require `/auth/logout`, status 200 for the POST, the title
      `Signed out on this browser.`, the notice
      `There is no active session on this browser. Sign-out on other devices has not been confirmed. Sign in again to retry signing out everywhere.`
      and a `Sign in` link to `/auth/login`, with no Try again form. Focus stays on the document body on arrival. Tab
      reaches `← TroopToTask.com`, Sign in, Privacy, Terms and Security, each with a visible 3px focus ring. Enter on
      Sign in opens the Sign In page. Bring each page to the front before resizing or capturing it; a background page
      keeps its old size. The failed sign-out state needs a provider error from the session read or the global
      revocation, which no control reaches: record it as unreachable. The step costs one sign-in and two sign-outs per
      viewport against the shared `/auth/*` limit.
    - Link errors. Signed out, open `/auth/logout` and require `/`. Open `/auth/confirm` with no query and
      `/auth/confirm?type=recovery&next=/auth/reset-password&token_hash=used-synthetic` and capture `Link unavailable`
      for the first and the invalid-link sign-in error after Continue for the second. Signed out, open
      `/auth/reset-password` and `/auth/accept-invite` and capture `Reset link unavailable` and `Invite unavailable`.
11. **Failure, busy and keyboard states.**
    - Failed save keeps the draft. On Profile, change Last name and Rank, fill First name with spaces only (the native
      `required` check admits it) and save. Require `Profile not saved` with `First name is required`, the other drafts
      kept, and unchanged values after reload. Step 7's incorrect-password submits cover Account Security. A transport
      or provider failure is unreachable: the owned browser's origin allowlist makes native `emulate` refuse network
      conditions (`Network throttling is not supported when network blocking … is configured`), and no `network` or
      `server-source` family targets Profile, `?/updateEmail` or `/api/auth/update-password`.
    - Busy state. Run `$V busy arm PAGE` before one submit in each form family: Sign In, Forgot Password, Confirm
      Continue, Set Up Account, and Profile or Account Security. Press the submit, then save `$V busy state PAGE` and
      `$V busy restore PAGE`. The observer records every distinct submit label, `disabled` and `aria-busy` state, so a
      busy label shorter than a screenshot still appears. A full-page navigation discards it; record that as unobserved.
    - MFA status failure. Account Security reads factors through the provider auth API, which no `server-source` (tables
      only) or `network` (same-origin) control reaches. Record `MFA status unavailable` and Retry MFA status as
      unreachable.
    - Profile Rank. With no saved rank, Rank is not invalid at load. Save with Rank empty: `Select a rank.` appears as
      its field error, Rank becomes invalid and no request is sent; choosing a rank clears it.
    - Keyboard. Plain links (Terms of Use, Privacy Policy, inline auth links) show the app's 3px focus ring, not the
      browser outline. Tab through Confirm (`← TroopToTask.com`, `Continue to …`), Renew Invite (`← TroopToTask.com`,
      Email Address, Email Me a Fresh Setup Link, Sign in, Reset your password, Request access) and Profile (First name,
      Last name, Rank, Save Profile). Each stop needs a visible focus ring, and Enter or Space on the focused submit
      must act; Renew Invite's own limit is 5 per hour. For logout, Tab to the Account menu, move to Sign Out with the
      arrow keys and press Enter; require the public page. The `/auth/logout` page's own tab order is part of step 10's
      local-only check.
12. **Web boundary.** Run signed-in as any actor (for example `manager`).
    - Headers. `curl -sI ORIGIN/auth/login` must show the Content-Security-Policy with
      `connect-src 'self' https://vitals.vercel-insights.com` and no provider or loopback origin, plus
      `X-Frame-Options: DENY`, `nosniff` and HSTS. The browser has no provider client: Storage files open as navigations
      through `window.open`, and the MFA QR code is a `data:` image.
    - Blocked requests. Navigate each page with `navigate_page` and an `initScript` that appends each
      `securitypolicyviolation` event's `violatedDirective`, `blockedURI` and `sourceFile` to `sessionStorage`; read it
      with `evaluate_script` after the page settles. Cover Dashboard, Organization home, Personnel, Calendar, Training,
      Critical Tasks, Onboarding, Settings General and Members, Account Profile and Security. Require no `connect-src`,
      `img-src`, `frame-src` or `font-src` violation. One `script-src` report with blocked URI `eval` per Organization
      document is Zod's capability probe (`Function('')` inside `try`), which falls back to its non-eval parser and is
      expected.
    - Page data. With `evaluate_script`, fetch `location.pathname + '/__data.json'` and read
      `document.documentElement.outerHTML`. Neither may contain `access_token` or `refresh_token`, and `document.cookie`
      lists no auth cookie: the session stays in HttpOnly cookies. Save only field names and booleans, never values.
    - Unverified identity. Run `$V admission-probe notificationMember notificationOther`. The genuine session cookie
      must be admitted (200 on both paths) and every malformed or forged variant must get 303 to `/auth/login`; save its
      JSON, which withholds the genuine signature.
    - Encoded paths. From a signed-in page, POST the sign-in form to `/%61uth/login?/login` with a nonexistent
      `@example.test` address. It shares the `/auth/*` budget with `/auth/login`: once the window's ten POSTs are spent,
      it returns 429 like the plain path. Run this last, because it spends the shared `/auth/*` budget that this
      recipe's form sign-ins also use.
13. **Appearance.** For the MFA challenge, Forgot Password, Reset Password, Accept Invite, Request Access, Account
    Setup, Suspended and Account Security screens, capture 1280x800 light and 390x844 dark, plus 1280x800 dark and
    390x844 light for one Auth Shell page. Auth Shell pages have no theme control: set the theme with `evaluate_script`
    `localStorage.setItem('theme', 'dark')` and reload, which clears in-page states such as a rejected code, so capture
    light first. Below 1024 px the shell stacks the chrome band, the form, then its steps or legal links; capture one
    Auth Shell page at 1023x900 too. Account pages take the theme chosen in the app frame. An emulated system color
    scheme does not change the app theme. Tab through each form: every field is reachable in order with a visible focus
    ring, Enter submits, and record whether each error is announced and associated with its field. Record any state
    captured in only one combination as such; 1280x800 light and 390x844 dark per screen is the required split.

Record provider-visible effects (Access Request rows, factor status through the Security page, suspension) separately
from visible UI. Owned worker cleanup discards the changed identity accounts.

## Gotchas

- Supabase TOTP is enabled only in the disposable verify provider's generated config; the repository
  `supabase/config.toml` leaves it off for local development. Every other auth, signup, password and rate-limit setting
  stays as configured.
- Form sign-ins (including `actor --form`), sign-outs and `/auth/confirm` Continue count against the shared `/auth/*`
  limit, including percent-encoded spellings of those paths; `/api/*` calls and Renew Invite (its own 5 per hour) do
  not. Authenticator codes have a separate durable limit of 10 per account per 15 minutes. A limited Continue shows
  `Too many requests. Please wait and try again.` before the action runs, so the link is not consumed. Budget the run
  across windows and record the 429 rather than retrying in a loop. Provider limits apply separately.
- Native `get_network_request` prints request bodies, including filled passwords and codes. Never save its output for
  identity forms; use `list_network_requests` for status.
- `/auth/confirm` intentionally waits for an explicit button; a link prefetch does not consume the token. A used or
  expired token redirects to sign-in with an invalid-link error.
- A recovery or invite session is restricted to its password page until the password is set. Leaving through
  `Need to exit?` ends it.
- `identitySuspended` keeps its suspension for the worker's lifetime. Platform administration's suspension journey uses
  its own seeded accounts and restores them through the UI.
