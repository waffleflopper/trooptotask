# Sign in and sign out

An existing member signs in to the organization and signs out through the account menu. A visitor can reach the sign-in form and the reviewed access/help paths without an account.

## Sub-features

- `sign-in-gate`: the public `Sign In` link opens the email/password form.
- `member-sign-in`: a synthetic member reaches their organization through the normal form.
- `account-menu`: the signed-in menu exposes Account and Sign Out.
- `sign-out`: leaving the session returns to the public site.
- `sign-in-error`: an incorrect password leaves the form available with a clear error; a transport failure offers a retry.

## How to get to it (user POV)

Choose `Sign In` from the public header or footer, or follow an authenticated-page redirect to `/auth/login`. After signing in, open `Account menu` in the app sidebar and choose `Sign Out`. The sign-in form also links to password reset, setup-link renewal, and access request.

## Driving it with verify:app

Preconditions: doctor passes on the owned worker; use its origin and synthetic roles only. Keep public and signed-in pages in separate contexts.

1. Open the owned origin from `doctor` in a fresh browser context with `tool new_page`; use a fresh snapshot to choose the public `Sign In` link. The form has `Email Address`, `Password`, `Show password`, and `Sign In`; the primary button has `data-testid="login-submit"`.
2. Run `npm run --silent verify:app -- login manager`. This fills and submits the visible form with the private synthetic account. Record its returned page ID and organization ID, then take a snapshot. Expect an `/org/<orgId>/personnel` page, `Verification Organization A`, and a `Personnel` navigation link.
3. In that page's latest snapshot, choose the `Account menu` button and call `tool click` with its UID. Expect a menu with `Account` and `Sign Out` items.
4. Click the fresh `Sign Out` menuitem UID. Snapshot again: the URL is `/`, the public `Sign In` link returns, and the organization navigation is absent. A fresh login is needed for later feature files.
5. In a separate public tab, submit an incorrect synthetic password once. Capture the form before and after: it remains usable and says `Email or password is incorrect`; there is no Organization page. Avoid repeated attempts that consume the sign-in rate limit. If the login request fails at the transport boundary, capture the visible retry state and use the form again after recovery.

## Gotchas

- `login` creates an isolated browser context; a public tab in another context does not share its session.
- Use synthetic roles only. The password stays in private worker state and must not be copied into proof files.
- Access request and password recovery involve separate delivery and review paths; following their links does not prove completion.
- A provider outage can return `503` at logout; record that outcome and the recovery link instead of calling it a successful sign-out. The no-session logout page is a separate entry path.
