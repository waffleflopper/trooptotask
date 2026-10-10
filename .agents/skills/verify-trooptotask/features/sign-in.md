# Sign in and sign out

An existing member signs in to the organization and signs out through the account menu. A visitor can reach the sign-in form and the reviewed access/help paths without an account.

## Sub-features

- `sign-in-gate`: the public `Sign In` link opens the email/password form.
- `member-sign-in`: a synthetic member reaches their organization through the normal form.
- `account-menu`: the signed-in menu exposes Account and Sign Out.
- `sign-out`: leaving the session returns to the public site.
- `account-profile`: the Account item opens the User Profile, whose rank list and saved rank persist independently of any Organization rank catalog.
- `sign-in-error`: an incorrect password leaves the form available with a clear error; a transport failure offers a retry.

## How to get to it (user POV)

Choose `Sign In` from the public header or footer, or follow an authenticated-page redirect to `/auth/login`. After signing in, open `Account menu` in the app sidebar and choose `Sign Out`. The sign-in form also links to password reset, setup-link renewal, and access request.

## Driving it with verify:app

Preconditions: doctor passes on the owned worker; use its origin and synthetic roles only. Keep public and signed-in pages in separate contexts.

1. Open the owned origin from `doctor` in a fresh browser context with `tool new_page`; use a fresh snapshot to choose the public `Sign In` link. The form has `Email Address`, `Password`, `Show password`, and `Sign In`; the primary button has `data-testid="login-submit"`.
2. Run `npm run --silent verify:app -- login manager --worker "$WORKER"`. This fills and submits the visible form with the private synthetic account. Record its returned page ID and organization ID, then take a snapshot. Expect an `/org/<orgId>/personnel` page, `Verification Organization A`, and a `Personnel` navigation link.
3. In that page's latest snapshot, choose the `Account menu` button and call `tool click` with its UID. Expect a menu with `Account` and `Sign Out` items.
4. Click the fresh `Sign Out` menuitem UID. Snapshot again: the URL is `/`, the public `Sign In` link returns, and the organization navigation is absent. A fresh login is needed for later feature files.
5. In a separate public tab, submit an incorrect synthetic password once. Capture the form before and after: it remains usable and says `Email or password is incorrect`; there is no Organization page. Avoid repeated attempts that consume the sign-in rate limit. If the login request fails at the transport boundary, capture the visible retry state and use the form again after recovery.

6. **Account profile rank.** Sign in again with `npm run --silent verify:app -- login viewer --worker "$WORKER"`, open `Account menu`, choose `Account` and expect `/account/profile` with `User Profile`. Snapshot the `Rank` select: after `Select rank` it offers exactly these 28 options in this order: `PV1, PV2, PFC, SPC, CPL, SGT, SSG, SFC, MSG, 1SG, SGM, CSM, WO1, CW2, CW3, CW4, CW5, 2LT, 1LT, CPT, MAJ, LTC, COL, BG, MG, LTG, GEN, CIV`. Retired codes such as `SP4` and other services' codes are absent. Record the current first name, last name and rank. Choose a different rank (for example `SFC`), fill names if empty, select `Save Profile` and capture `Profile updated`. Reload and confirm the saved rank is selected. Restore the original rank through the same form when one existed and reload again. A profile that started without a rank cannot be cleared through this form, because it requires a rank; record the saved values instead, and owned worker cleanup discards them. The select offers no invalid value, so invalid-rank rejection is covered by the profile server tests rather than this native step.

7. **Auth Shell appearance, keyboard and logout entry.** Capture Sign In at 1280x800 light and dark and 390x844 light and dark, toggling theme with the public Toggle theme. From the Email Address field, Tab reaches Password, Show password, Forgot password and Sign In in visible order with a focus ring; Show password toggles the field type and its pressed state; Enter in Password submits. A submit with both fields empty shows the required-field state without a request. After a member signs in, opening `/auth/login` redirects to the dashboard. Signed out, `/auth/logout` shows its no-session page with Sign in. MFA, recovery, invite, request access and suspension journeys live in [identity recovery and security](identity-recovery-security.md).

## Gotchas

- `login` creates an isolated browser context; a public tab in another context does not share its session.
- Use synthetic roles only. The password stays in private worker state and must not be copied into proof files.
- Access request and password recovery involve separate delivery and review paths; following their links does not prove completion.
- A provider outage can return `503` at logout; record that outcome and the recovery link instead of calling it a successful sign-out. The no-session logout page is a separate entry path.
