# Invite and accept Organization members

An owner or admin invites an existing account or a new person, sees the pending invitation, and the invitee joins
through the
correct account and invitation steps.

## Sub-features

- `invite-existing`: an existing account receives a pending invitation with the selected role, preset and Group scope.
- `invite-many`: one submission of up to 50 pasted addresses shares one role, preset and Group scope and reports each
  address on its own line.
- `accept-existing`: the invited account accepts on Dashboard; membership appears only after acceptance.
- `invite-new`: account setup and Organization invitation are separate; setup alone does not grant membership.
- `invitation-lifecycle`: duplicate, resend, revoke, expired/replayed, denial and delivery failure keep the correct
  pending/history state.

## How to get to it (user POV)

Sign in as the Organization owner or admin, open `Settings` → `Members`, and use the `Invite members` strip at the top:
the `Invite` box takes one or more addresses, one per line or separated by commas (Ctrl/Cmd+Enter sends), then `Role`
(owner only), `Preset`, and `Groups` (a tree picker headed by `Whole unit`; checking Groups clears `Whole unit`, a squad
covers its teams, and clearing the last Group returns to `Whole unit`), then the send button. It reads `Send invite` for
one address and `Send <n> invites` for several, and `Sending...` or `Sending <n> invites...` while pending. More than 50
addresses mark the box invalid, put `That's <n> addresses. Send up to 50 at a time.` in the line under it and hold the
send. The line under the strip restates the preset's helper; with `Role` set to `Admin`, `Preset` reads
`Uses Admin authority` and the line describes admin authority. A member invite also shows a table, `What <preset>
allows`, with one row per area the unit has on and `Area`, `View` and `Change` columns: `View` reads `Yes`, and
`Change` reads `No` for Viewer, `Day to day` for Operator and `Everything` for Editor. An admin invite has no table.
After a send, one address answers in the line under the strip (an address that was not invited answers as an alert,
`<email>: <reason>`). Several addresses put a summary there, such as `2 invited. 1 already invited. 1 not invited.`,
and list each address with its outcome under `Invitation results`. Invalid and refused addresses stay in the box with
the same role, preset and Groups, and the line adds `The addresses that weren't invited are still in the box.`
Already-invited addresses read `Already invited. Resend it from Waiting on them.` and leave the box. `Waiting on them` appears above `Members` only while invitations are pending. Each row shows the email,
`<preset> · sent <date> · expires in <n> days` (`expires tomorrow`, `expires today`), the funnel status and its detail
(failed delivery in the destructive color), `Resend` and `Revoke`. `Revoke` opens one confirm dialog, `Revoke the
invitation for <email>?`, with `Cancel` and `Revoke invitation`; Cancel changes nothing. Closed invitations fold into
`Invitation history · <n> closed` at the foot of the members list; that read streams after first paint behind a
skeleton. An expired row there reads `Expired <when>` and carries `Invite again`, which posts the `?/invite` action for
the same email, role, preset and Groups and, on success, adds a new pending row and the toast `Invited. The email is on
its way.`; a revoked or accepted row has no button, and neither does an expired row once its email is
pending again. The Members link in the Settings nav carries a badge counting only pending, unexpired invitations; an
expired one never counts. An existing invited account signs in and opens `/dashboard`, where the
Organizations list shows each pending invitation first, under `Invitations`, with `Decline` and `Accept` on its row. A
new account uses the private Account Setup Link first, signs in, then accepts the separate Organization invitation.

### Helper controls

```bash
$V actor orgInvitee dashboard # confirmed account without a membership
$V rows organization_invitations orgA status pending
```

`fixture` exposes synthetic invitation emails without passwords or tokens.

`$V seed invitation-attention` journals and inserts five Org A invitations for one cohort tag, created nine days ago by
`orgOwner`: `failed` (latest delivery `failed`, expires in 10 days), `soon` (delivered, 48 hours left),
`soonAndFailed` (failed, 20 hours left), `later` (delivered, 10 days left) and `lapsed` (expired yesterday). Only one
cohort may exist; run `clean-seeds` before seeding again. App-created invitations, such as an `Invite again` result,
are not journaled and stay until worker cleanup.

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
   acceptance. A duplicate pending invite must answer `<email>: Already invited. Resend it from Waiting on them.` and
   leave one pending invitation.
2. As `orgInvitee`, open `/dashboard`; save a before snapshot with A under `Invitations` and `Nothing yet.` under
   `Member of`. Click that row's `Accept`: the page stays on `/dashboard?show=all`, the row leaves `Invitations`,
   `Joined <Organization>. It's now in your list.` shows above the list and A appears under `Member of` with its role.
   Reload: A must still appear once under `Member of`; the invitation must leave Pending and appear in the owner's
   history. Open A and verify Alpha access without Bravo access using a retained Personnel or Calendar view;
   Organization B stays absent. Record the exact A membership/access snapshot and invitation state from the owned
   provider.
3. A sub-group invitation is its own case: restart the worker so `orgInvitee` has no A membership or pending
   invitation, and build the [Group tree](manage-groups.md#group-tree). As `orgOwner`, enter `orgInvitee`'s email,
   choose `Operator` and check `Alpha Team` under `2nd Platoon › 1st Squad` (search `alpha team`; rows read
   `<name> <subtree count>`). The trigger reads `Groups: 2nd Platoon › 1st Squad › Alpha Team` and the helper line
   `Sees everything and keeps it up to date day to day, but can't change how an area is set up. Sees 2nd Platoon › 1st
Squad › Alpha Team: 2 people. Not Unassigned. They accept the invite after signing in.` The table caption reads
   `What Operator allows in the chosen Groups`. The pending row stores `member_preset: operator`, `access_scope_kind: groups` and
   only Alpha Team's ID. Accept it as in step 2. The invitee's Personnel shows `Group: Alpha Team 2` and only Alpha
   Team's People, Calendar and Training list only them, and a Quick edit of one saves; their `Group` field is the
   static `Alpha Team`. A person moved out of Alpha Team leaves their roster on reload. A grant covers its sub-groups,
   not its ancestors, so the invitee sees neither 1st Squad's other People nor top-level Alpha.
4. On a separate fresh invitation, choose `Decline` from the invitee's Dashboard. Reload both Dashboard and owner
   Members; no membership is created and the owner sees the closed invitation after expanding `Invitation history`. A
   revoked invitation likewise cannot grant membership after reload. Keep each case on its own synthetic email or
   restart the worker; an accepted invitation cannot be reused as a pending fixture.
5. For a new-account email with no User Account, create the invitation and capture the owner-facing pending funnel.
   `$V mail state` must list two delivered messages for that address, one `account-setup` and one `invitation`, with the
   setup path shown as `[redacted]`. In a fresh public context run `$V mail-link PAGE EMAIL setup` and require the page
   to read `Unit invitation` with `<Organization> invited you.`, `Invitation sent` as step one and no `Request access`
   link, then complete `/auth/setup-account` as `setup-link` does, then sign in and confirm that setup alone leaves A
   absent from the account's Organizations. In a separate signed-out owned context, open the invitation email's
   recovery link with `$V mail-link PUBLIC_PAGE EMAIL invitation` and require `/auth/renew-invite`, whose lede and
   email hint name the invitation
   as well as the approval. Return to the original signed-in context and accept the A invitation afterward, then
   reload and read the membership.
   `$V access-request EMAIL` shows the request, setup link, bridge row and invitation status at each step. Do not use a
   token-bearing URL in evidence.

   In a separate case as `orgAdmin`, invite a unique synthetic email with role `member` and verify one pending
   invitation with no membership. Revoke it through the visible row and read back its closed state. From the same
   admin context, submit an Admin invitation with the command below; require the denied action status and no invitation
   for that email. Only an owner may grant Admin.

   ```bash
   $V settings-request PAGE orgA settings/members/invite '{"emails":"admin-denial-MARKER@example.test","membershipRole":"admin","memberPreset":"viewer"}'
   ```

6. Exercise one denied owner action as `orgMember` with
   `$V settings-request PAGE orgA settings/members/invite '{"emails":"…@example.test","membershipRole":"member","memberPreset":"viewer"}'`,
   and one foreign-Organization invitation ID against the current form action using that signed-in actor's request
   context. Record the action failure status and no new invitation rows or `$V rows organization_memberships orgA`
   changes; a SvelteKit form action can return HTTP 200 with a `failure` envelope carrying status 403. The missing
   invite strip is only an affordance observation. Invitation persistence can succeed while mail delivery fails: run
   `$V mail fail invitation` before `Send invite`, capture the visible `Invited, but the email failed. Resend it from Waiting on them.`
   state and `$V mail state` showing the `failed` message, `$V mail restore`, then use `Resend` on that row in
   `Waiting on them`. Verify the original invitation ID remains pending and no new invitation or membership is created.
   Record expiry/replay as unverified unless the fixture can safely make those states.

7. **Expiry, Revoke confirm, Invite again and the badge.** Run `$V seed invitation-attention`, then as `orgOwner` open
   `Settings` → `Members` at 1280 and 390. Require four pending rows, each with `expires …` text counting calendar
   days in the browser zone from today to the seed time plus its `hoursToExpiry` (48, 240, 240 and 20), two rows in the
   failed color, the Members nav badge at `4` and
   `Invitation history · 1 closed`; the `lapsed` invitation is in history and not in the badge. Choose `Revoke` on the
   `failed` row, `Cancel`, and confirm the four rows remain and `$V rows organization_invitations orgA status pending`
   is unchanged; choose `Revoke` again and `Revoke invitation`: the row leaves, the badge reads `3` and history reads
   `2 closed` with `Revoked today` and no button. Expand history and choose `Invite again` on the expired row once the
   panel has stopped moving and confirm in the network list that one `POST ?/invite` returns, the email shows as a pending row `sent today · expires in 14 days`, the toast reads as
   above and its history row now reads `Expired today` with no button. A failed `Invite again` shows its error on that
   row and keeps `Invite again` available; the browser drive does not reproduce it, so the component test owns it.
   Evidence: `.verification/evidence/verify-trooptotask/safer-invites/`. Finish with `clean-seeds`.

8. **In-app notice for an existing account.** An invitation to an email that already has an account also sends that
   account one notification with no Organization, so it shows in the bell of every Organization the person opens. The
   server tests own the cases that send none (a new email, a failed create, `Resend`) and the invite that still
   succeeds when the notification fails. Use an A member as the invitee and the B owner as the inviter: `orgMember`
   (or `orgAdmin` for a second pass) and `orgSettingsPeer`. Read each invitee's synthetic email from `orgOwner`'s
   `settings/members` snapshot, since `orgMember` has no stored membership email. Run once at 390 and once at 1280
   (`tool emulate '{"pageId":PAGE,"viewport":"390x844x1"}'`, then `1280x900x1`; `resize_page` did not apply here),
   each with a different A member, because acceptance makes the invitee a B member.
   1. As `orgSettingsPeer` open `settings/members`, enter the invitee's email and `Send invite`; require
      `Invited. The email is on its way.` and one pending B invitation. Then open
      `$V actor orgMember home`: A's bell reads `1 unread notifications`. Open it: one item reading
      `Invitation to join Verification Organization B` with the message
      `You've been invited to join Verification Organization B. Open your invitations to accept or decline.`, a delete
      button and `View all`, and neither the inviter's email nor `orgSettingsPeer` anywhere in the item. At 390 the title
      and message clamp with an ellipsis, so read the full text from the snapshot; the menu has no horizontal scroll.
   2. Choose the item. The page navigates to `/dashboard?show=all`; `Invitations` shows `Verification Organization B`
      with `Decline` and `Accept`, and `Member of` lists only A. `$V rows notifications orgA|orgB` filters on
      Organization and never returns this row, so the bell is the readback.
   3. Choose `Accept invitation to Verification Organization B`. The page stays on `/dashboard?show=all`,
      `Joined Verification Organization B. It's now in your list.` shows, B appears under `Member of` as a member and
      `Invitations` is gone.
   4. Open B (or A) from `Member of` and open the bell again: the same notice is still listed, already read, because
      accepting does not delete it. Choose it: the page lands on `/dashboard?show=all` and renders `Member of` with A and
      B, no `Invitations` section and no error. Browser console errors are limited to the local `_vercel/insights` and
      `_vercel/speed-insights` script 404s, which are not part of the journey.

### Invitation grant liveness

Use a unique synthetic new email per case, `$V access-request EMAIL` after each step, and restore `mail` and `fault`
controls afterward. For invitation-origin platform access, `setup_grant_live` stays true only while the request is
approved and incomplete and either `approval_basis` is `platform_review` or a linked invitation is neither `revoked` nor
`blocked`. A withdrawn or failed invitation-origin acquisition leaves no mintable credential, while an independent
platform approval, a live sibling Organization invitation and a completed account survive. Invitation expiry alone
withdraws nothing.

- (a) New email, `$V fault arm setup-link-create`, then `Send invite` as `orgOwner`. Expect the alert
  `<email>: Invitation could not be created because the account setup link could not be issued`, a `blocked`
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
  `Invited. The email is on its way.`, the funnel shows `Setup email didn't reach them`, the invitation
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

- Foreign invitation denial: as `orgOwner` in A, `$V settings-request PAGE orgA settings/members/revokeInvite
'{"inviteId":"B_INVITE_ID"}'` returns a `failure` envelope with status 404 and leaves B's invitation unchanged.
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
- An invitation whose `member.invite` audit write fails is revoked before any setup link, notice or email, and the
  address answers as one that was never created, so sending it again works. No fault control fails the audit store, so
  the server tests own this case.
- Keep private email links and credentials out of snapshots, logs and committed evidence.
- The captured mail is a synthetic sink, not a delivery proof. Supabase auth emails such as password recovery post to
  the same provider URL and are recorded as `auth`.
