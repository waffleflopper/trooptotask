# Invite and accept Organization members

An owner invites an existing account or a new person, sees the pending invitation, and the invitee joins through the
correct account and invitation steps.

## Sub-features

- `invite-existing`: an existing account receives a pending invitation with the selected role, preset and Group scope.
- `accept-existing`: the invited account accepts on Dashboard; membership appears only after acceptance.
- `invite-new`: account setup and Organization invitation are separate; setup alone does not grant membership.
- `invitation-lifecycle`: duplicate, resend, revoke, expired/replayed, denial and delivery failure keep the correct
  pending/history state.

## How to get to it (user POV)

Sign in as the Organization owner, open `Settings` → `Members`, and use the invite strip at the top: the `Invite` email
field, `Role` (owner only), `Preset`, and `Groups` (`All groups` or one or more groups in a multi-select; clearing the
last group returns to `All groups`), then `Send invite` (`Sending...` while pending). The line under the strip restates
the preset's helper; with `Role` set to `Admin`, `Preset` reads `Uses Admin authority` and the line describes admin
authority. `Waiting on them` appears above `Members` only while invitations are pending. Each row shows the email,
`<preset> · sent <relative>`, the funnel status and its detail (failed delivery in the destructive color), `Resend` and
`Revoke`. Closed invitations fold into `Invitation history · <n> closed` at the foot of the members list; that read
streams after first paint behind a skeleton. An existing invited account signs in and opens `/dashboard`, where its
pending Organization card has `Accept` and `Decline`. A new account uses the private Account Setup Link first, signs in,
then accepts the separate Organization invitation.

## Helper controls

```bash
$V actor orgInvitee dashboard # confirmed account without a membership
$V rows organization_invitations orgA status pending
```

`fixture` exposes synthetic invitation emails without passwords or tokens.

`rows` also permits `email`, `status`, and `invitation_id` filters for the allowlisted invitation and outbox tables.
Query stored email values in lowercase.

Real app-issued mail and provider-write faults use the [Organization invitations recipe](organization-invitations.md).
The owned app is given a synthetic `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, and its private Node preload answers only
that bearer's `POST https://api.resend.com/emails`: every other request passes through, and no message leaves the
worker. `mail state` lists captured messages by sequence, recipient, subject, `kind` (`account-setup` when the body
carries an `/auth/setup-account?token=` link, `auth` for an `/auth/confirm` link, otherwise `invitation`),
`delivered|failed` and link paths with every token replaced by `[redacted]`; bodies and raw links stay in preload
memory. `mail fail [setup|auth|invitation] [COUNT]` makes the next 1–10 matching sends return a synthetic 503 (the app
sees a delivery failure and the message is recorded `failed`); `mail restore` disarms it.
`mail-link PAGE EMAIL setup|auth|invitation [N]` opens the Nth newest delivered link of that kind for one synthetic
recipient in the named owned page and prints a token-redacted snapshot, as `setup-link` does for seeded tokens. The
supervisor checks the link's origin against the owned app, refuses to print if the token survives and never returns the
raw link. A setup link that stays on its token URL is token-bearing, so do not `take_snapshot` or `list_pages` it until
it navigates away.

Each name matches only its allowlisted method and path on the owned provider: `setup-link-create` is
`POST rpc/issue_account_setup_link`, `invitation-access-link` is `POST rpc/link_organization_invitation_access_request`,
and `invitation-block` is a `PATCH organization_invitations` setting `status` to `blocked`.

If DevTools fails while `mail-link` opens a link, the error text is withheld because it may carry the token.

## Driving it with verify:app

Preconditions: `doctor` passes; `$V fixture` identifies Organization A, Alpha/Bravo, `orgOwner`, and `orgInvitee` (an
existing confirmed account with no A membership). Use `$V actor orgOwner settings/members` and
`$V actor orgInvitee dashboard` in separate browser contexts. Keep one unique invitee email per state-changing case. The
helper provides invitation and membership readback for A/B. The owned app's outbound mail is captured privately
(`mail state|fail|restore`, `mail-link`) and named provider writes can fail once (`fault arm|state|restore`); see
[helper controls](#helper-controls). Restore both controls between cases.

1. As `orgOwner`, capture the invite strip. Enter `orgInvitee`'s synthetic email, choose member access and `Groups` →
   `Alpha`, then click `Send invite`. Save the result and a reload of `Waiting on them`, including email, access label
   and funnel status. Confirm the invitee is absent from `Members` and from the owned A membership readback before
   acceptance. A duplicate pending invite must show a visible error and leave one pending invitation.
2. As `orgInvitee`, open `/dashboard`; save a before snapshot with A under `Pending Invitations` and no A workspace.
   Click that card's `Accept`, capture the response and resulting `Joined <Organization>` feedback, then reload. A must
   now appear once under `Organizations`; the invitation must leave Pending and appear in the owner's history. Open A
   and verify Alpha access without Bravo access using a retained Personnel or Calendar view; Organization B stays
   absent. Record the exact A membership/access snapshot and invitation state from the owned provider.
3. On a separate fresh invitation, choose `Decline` from the invitee's Dashboard. Reload both Dashboard and owner
   Members; no membership is created and the owner sees the closed invitation after expanding `Invitation history`. A
   revoked invitation likewise cannot grant membership after reload. Keep each case on its own synthetic email or
   restart the worker; an accepted invitation cannot be reused as a pending fixture.
4. For a new-account email with no User Account, create the invitation and capture the owner-facing pending funnel.
   `$V mail state` must list two delivered messages for that address, one `account-setup` and one `invitation`, with the
   setup path shown as `[redacted]`. In a fresh public context run `$V mail-link PAGE EMAIL setup` and complete
   `/auth/setup-account` as `setup-link` does, then sign in and confirm that setup alone leaves A absent from the
   account's Organizations. Open the invitation email's recovery link with `$V mail-link PAGE EMAIL invitation` and
   require `/auth/renew-invite`. Accept the A invitation afterward, then reload and read the membership.
   `$V access-request EMAIL` shows the request, setup link, bridge row and invitation status at each step. Do not use a
   token-bearing URL in evidence.
5. Exercise one denied owner action as `orgMember` with
   `$V settings-request PAGE orgA settings/members/invite '{"email":"…@example.test","membershipRole":"member","memberPreset":"viewer"}'`,
   and one foreign-Organization invitation ID against the current form action using that signed-in actor's request
   context. Record the action failure status and no new invitation rows or `$V rows organization_memberships orgA`
   changes; a SvelteKit form action can return HTTP 200 with a `failure` envelope carrying status 403. The missing
   invite strip is only an affordance observation. Invitation persistence can succeed while mail delivery fails: run
   `$V mail fail invitation` before `Send invite`, capture the visible `Invitation created, but email delivery failed`
   state and `$V mail state` showing the `failed` message, `$V mail restore`, then use `Resend` on that row in
   `Waiting on them`. Verify the original invitation ID remains pending and no new invitation or membership is created.
   Record expiry/replay as unverified unless the fixture can safely make those states.

## Invitation grant liveness

Use a unique synthetic new email per case, `$V access-request EMAIL` after each step, and restore `mail` and `fault`
controls afterward. For invitation-origin platform access, `setup_grant_live` stays true only while the request is
approved and incomplete and either `approval_basis` is `platform_review` or a linked invitation is neither `revoked` nor
`blocked`. A withdrawn or failed invitation-origin acquisition leaves no mintable credential, while an independent
platform approval, a live sibling Organization invitation and a completed account survive. Invitation expiry alone
withdraws nothing.

- (a) New email, `$V fault arm setup-link-create`, then `Send invite` as `orgOwner`. Expect a 500 failure whose visible
  message is `Invitation could not be created because the account setup link could not be issued`, a `blocked`
  invitation, and a request still `approved` with `approval_basis` `organization_invitation` and `setup_grant_live`
  false. `$V fault state` must show the `rpc/issue_account_setup_link` match. Restore, submit `/auth/renew-invite` for
  that email and expect `Check your email` with no new `account-setup` message in `$V mail state`.
- (b) Invite a new email so setup mail is delivered, then `Revoke` the invitation. `mail-link PAGE EMAIL setup` must
  show Setup link unavailable with `access it was sent for was withdrawn`, renew-invite must send no setup mail, and the
  request stays `approved` with `setup_grant_live` false. Invite the same email again: the same request id returns with
  `setup_grant_live` true and a fresh setup link that completes setup.
- (c) As Org A's and Org B's owners invite the same new email, then revoke A's invitation. B's invitation stays pending,
  the request keeps `setup_grant_live` true and the newest setup link completes setup.
- (d) As a public visitor request access with that email (`pending`), arm `fault arm setup-link-create`, then invite it
  as `orgOwner` and observe the fatal issuance. The reused request reads `approved`, `organization_invitation`,
  `setup_grant_live` false behind a `blocked` invitation, and renew-invite sends nothing. A fresh public Request Access
  for that email creates a new `pending` request for platform review. With `fault arm invitation-access-link` instead,
  the bridge transaction never runs, so the public request stays `pending` with no bridge row and the invitation is
  `blocked`.
- (e) Approve a public request through platform review first (setup mail delivered), then run a failing invite for the
  same email with `fault arm setup-link-create`. The request keeps `approval_basis` `platform_review` and
  `setup_grant_live` true, the approval's setup link is still unused and unrevoked because the failed issuance rolled
  back its replacement, and renew-invite still delivers a working link.
- (f) Invite a completed account from another Organization and revoke it. `setup_completed_at`, `setup_user_id`,
  memberships and the account's sign-in stay unchanged.
- (g) As `platformReviewer`, open `admin` (the Inbox). An approved incomplete invitation request does not appear in the
  Inbox or Done: invitation auto-approvals were never in the queue, and the admin UI no longer offers Rescind. Check the
  request row and its linked invitation with `$V platform-state` instead.
- (h) `$V mail fail setup 1`, then invite a new email. The owner sees
  `Invitation created and email delivery was queued.`, the funnel shows `Setup email didn't reach them`, the invitation
  stays pending with `setup_grant_live` true and renew-invite delivers a working link.
- (i) Failure during cleanup: arm both `fault arm setup-link-create` and `fault arm invitation-block`, then invite a new
  email. The block fails too, so the invitation stays `pending` and is a live vouch the owner can see and revoke. The
  owner sees a 500 whose visible message is
  `The account setup link could not be issued. Check Waiting on them and revoke the invitation if it is still listed.`
  Revoking it then leaves `setup_grant_live` false. With `fault arm invitation-access-link` and
  `fault arm invitation-block` instead, the message is
  `Platform access setup could not be linked. Check Waiting on them and revoke the invitation if it is still listed.` If
  the invitation already left `pending` before the cleanup block ran, the owner sees a 409
  `This invitation was withdrawn while it was being created.` instead; that interleaving is not deterministic from the
  UI, so operation tests cover it.
- Competing issuance (two simultaneous invites or renewals for one request) is a race the UI cannot make deterministic.
  Operation tests cover `concurrent-create`; two-session SQL suites prove the issuance and bridge transactions.

## Gotchas

- `/auth/renew-invite` allows three requests per hour per client IP across all emails, and every owned-worker request
  shares one IP. Budget renewals across cases or wait out the window; a `Too many fresh-link requests` response is the
  app's rate limit, not a grant result.
- Invitations and delivery attempts load all pages in descending creation-time order, with ascending ID breaking
  timestamp ties. The first delivery for an invitation supplies its status. Preserve newest-first behavior and compare
  complete saved IDs; an empty native list does not establish populated or large-page completeness.
- A new person's approved Access Request and setup link are distinct from their Organization Invitation. Preserve their
  separate delivery and state; do not count account activation as membership.
- An `Admin` invitation is a sensitive action. After more than 15 minutes since the owner's sign-in, `Send invite`
  returns a 403 failure carrying `requiresStepUp`/`stepUpPath` and the page moves to
  `/auth/login?reauth=1&next=...settings/members` with no invitation row. A duplicate pending email is rejected before
  that check. The `Role` select's options appear only in a `"verbose":true` snapshot.
- Pending invitation creation may succeed when email delivery fails. `Resend` retries that invitation and does not mint
  a new setup credential.
- Keep private email links and credentials out of snapshots, logs and committed evidence.
- The captured mail is a synthetic sink, not a delivery proof. Supabase auth emails such as password recovery post to
  the same provider URL and are recorded as `auth`.
