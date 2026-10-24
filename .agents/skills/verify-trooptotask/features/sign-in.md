# Sign in and sign out

An existing member signs in to the organization and signs out from their account pages. A visitor can reach the sign-in
form and the reviewed access/help paths without an account.

## Sub-features

- `sign-in-gate`: the public `Sign In` link opens the email/password form.
- `member-sign-in`: a synthetic member reaches their organization through the normal form.
- `account-entry`: the signed-in person's name at the foot of the sidebar opens Account, whose nav holds Sign out.
- `sign-out`: leaving the session returns to the public site.
- `account-profile`: Account opens Profile inside the Organization frame; its rank list and saved rank persist
  independently of any Organization rank catalog.
- `sign-in-error`: an incorrect password leaves the form available with a clear error; a transport failure offers a
  retry.

## How to get to it (user POV)

Choose `Sign In` from the public header or footer, or follow an authenticated-page redirect to `/auth/login`. After
signing in, choose your name at the foot of the app sidebar (`Your account`) and then `Sign out` in the account nav. The
sign-in form also links to password reset, setup-link renewal, and access request.

## Driving it with verify:app

Keep public and signed-in pages in separate contexts.

1. Open the owned origin from `doctor` in a fresh browser context with `tool new_page`; use a fresh snapshot to choose
   the public `Sign In` link. The form has `Email Address`, `Password` with `Show password` and `Forgot password?` on
   its label row, and `Sign In`; the primary button has `data-testid="login-submit"`. Under the rule,
   `Setup link expired?` offers `Request a fresh one` (`/auth/renew-invite`) and `Unit not on TroopToTask?` offers
   `Request access`.
2. Run `$V actor --form manager personnel` (with `V` from the [feature map](README.md)). This fills and submits the
   visible form with the private synthetic account. Record its returned page ID and organization ID, then take a
   snapshot. Expect an `/org/<orgId>/personnel` page, `Verification Organization A`, and a `Personnel` navigation link.
3. In that page's latest snapshot, choose the sidebar link whose name ends in `Your account` and call `tool click` with
   its UID. Expect `/org/<orgId>/account/profile` with the Account nav: Profile, Sign-in & security, What's new, Send
   feedback and Sign out.
4. Click the fresh `Sign out` button UID. Snapshot again: the URL is `/`, the public `Sign In` link returns, and the
   organization navigation is absent. A fresh login is needed for later feature files.
5. In a separate public tab, submit an incorrect synthetic password once. Capture the form before and after: it remains
   usable and says `Email or password is incorrect`; there is no Organization page. Avoid repeated attempts that consume
   the sign-in rate limit. If the login request fails at the transport boundary, capture the visible retry state and use
   the form again after recovery.

6. **Account profile rank.** Sign in again with `npm run --silent verify:app -- login viewer --worker "$WORKER"`, open
   Organization A and choose the sidebar name card. Expect `/org/<orgId>/account/profile` with the `Profile` heading and
   the breadcrumb `Account › Profile`; the Organization frame stays. Choose Edit (or Add with no saved name) and
   snapshot the `Rank` select: after `Rank` it offers exactly these 28 options in this order:
   `PV1, PV2, PFC, SPC, CPL, SGT, SSG, SFC, MSG, 1SG, SGM, CSM, WO1, CW2, CW3, CW4, CW5, 2LT, 1LT, CPT, MAJ, LTC, COL, BG, MG, LTG, GEN, CIV`.
   Retired codes such as `SP4` and other services' codes are absent. Record the current first name, last name and rank.
   Choose a different rank (for example `SFC`), fill names if empty, select `Save` and capture `Profile updated.`; the
   sidebar name card shows the new rank and name without a reload. Reload and confirm the saved rank is selected after
   Edit. Restore the original rank through the same form when one existed and reload again. The form requires a rank, so
   a profile that started without one cannot be cleared; record the saved values instead, and owned worker cleanup
   discards them. The select offers no invalid value; the profile server tests cover invalid-rank rejection.

7. **Auth Shell appearance, keyboard and logout entry.** Capture Sign In at 1280x800 light and dark, 1023x900 light, and
   390x844 light and dark. Auth Shell pages have no theme control: run `evaluate_script`
   `localStorage.setItem('theme', 'dark')` and reload. From the Email Address field, Tab reaches Password, Show
   password, Forgot password and Sign In in visible order with a focus ring; Show password switches the field to text
   and renames itself Hide password; Enter in Password submits. A submit with both fields empty shows the required-field
   state without a request. After a member signs in, opening `/auth/login` redirects to the dashboard. A GET of
   `/auth/logout` returns to `/`; its page renders only after a sign-out POST that fails or completes locally, which no
   visible signed-out control reaches. MFA, recovery, invite, request access and suspension journeys live in
   [identity recovery and security](identity-recovery-security.md).

## Gotchas

- `actor --form` and `login` create an isolated browser context; a public tab in another context does not share its
  session.
- The password stays in private worker state and must not be copied into proof files.
- Auth Shell labels and buttons are styled upper case, and Chromium's accessible names follow the rendered case
  (`textbox "EMAIL ADDRESS"`, `button "SIGN IN"`). Match names case-insensitively; the helpers do.
- Access request and password recovery involve separate delivery and review paths; following their links does not prove
  completion.
- A provider outage can return `503` at logout; record that outcome and the recovery link instead of calling it a
  successful sign-out. The no-session logout page is a separate entry path.
