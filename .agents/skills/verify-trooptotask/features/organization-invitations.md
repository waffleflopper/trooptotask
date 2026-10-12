# Invite and accept Organization members

An owner invites an existing account or a new person, sees the pending invitation, and the invitee joins through the correct account and invitation steps.

## Sub-features

- `invite-existing`: an existing account receives a pending invitation with the selected role, preset and Group scope.
- `accept-existing`: the invited account accepts on Dashboard; membership appears only after acceptance.
- `invite-new`: account setup and Organization invitation are separate; setup alone does not grant membership.
- `invitation-lifecycle`: duplicate, resend, revoke, expired/replayed, denial and delivery failure keep the correct pending/history state.

## How to get to it (user POV)

Sign in as the Organization owner, open `Settings` → `Members`, and use `Invite Member`. Choose `Membership Role` (owner only), `Member Preset`, and `All groups` or `Selected groups`; the form's `Invite` button submits. `Pending Invitations` has `Resend` and `Revoke`. An existing invited account signs in and opens `/dashboard`, where its pending Organization card has `Accept` and `Decline`. A new account uses the private Account Setup Link first, signs in, then accepts the separate Organization invitation.

## Driving it with verify:app

Preconditions: `doctor` passes; `$V fixture` identifies Organization A, Alpha/Bravo, `orgOwner`, and `orgInvitee` (an existing confirmed account with no A membership). Use `$V actor orgOwner settings/members` and `$V actor orgInvitee dashboard` in separate browser contexts. Keep one unique invitee email per state-changing case. The helper provides invitation and membership readback for A/B. The owned app's outbound mail is captured privately (`mail state|fail|restore`, `mail-link`) and named provider writes can fail once (`fault arm|state|restore`); see [SKILL.md](../SKILL.md). Restore both controls between cases.

1. As `orgOwner`, capture the `Access Management` and `Invite Member` sections. Enter `orgInvitee`'s synthetic email, choose member access and `Selected groups` → `Alpha`, then click `Invite`. Save the result and a reload of `Pending Invitations`, including email, access label, scope and funnel status. Confirm the invitee is absent from `Organization members` and from the owned A membership readback before acceptance. A duplicate pending invite must show a visible error and leave one pending invitation.
2. As `orgInvitee`, open `/dashboard`; save a before snapshot with A under `Pending Invitations` and no A workspace. Click that card's `Accept`, capture the response and resulting `Joined <Organization>` feedback, then reload. A must now appear once under `Organizations`; the invitation must leave Pending and appear in the owner's history. Open A and verify Alpha access without Bravo access using a retained Personnel or Calendar view; Organization B stays absent. Record the exact A membership/access snapshot and invitation state from the owned provider.
3. On a separate fresh invitation, choose `Decline` from the invitee's Dashboard. Reload both Dashboard and owner Members; no membership is created and the owner sees the closed invitation. A revoked invitation likewise cannot grant membership after reload. Keep each case on its own synthetic email or restart the worker; an accepted invitation cannot be reused as a pending fixture.
4. For a new-account email with no User Account, create the invitation and capture the owner-facing pending funnel. `$V mail state` must list two delivered messages for that address, one `account-setup` and one `invitation`, with the setup path shown as `[redacted]`. In a fresh public context run `$V mail-link PAGE EMAIL setup` and complete `/auth/setup-account` as `setup-link` does, then sign in and confirm that setup alone leaves A absent from the account's Organizations. Open the invitation email's recovery link with `$V mail-link PAGE EMAIL invitation` and require `/auth/renew-invite`. Accept the A invitation afterward, then reload and read the membership. `$V access-request EMAIL` shows the request, setup link, bridge row and invitation status at each step. Do not use a token-bearing URL in evidence.
5. Exercise one denied owner action as `orgMember` and one foreign-Organization invitation ID against the current form action using that signed-in actor's request context. Record the action failure status and no new invitation/membership rows; a SvelteKit form action can return HTTP 200 with a `failure` envelope carrying status 403. The missing `Invite Member` form is only an affordance observation. Invitation persistence can succeed while mail delivery fails: run `$V mail fail invitation` before `Invite`, capture the visible `Invitation created, but email delivery failed` state and `$V mail state` showing the `failed` message, `$V mail restore`, then use `Resend`. Verify the original invitation ID remains pending and no new invitation or membership is created. Record expiry/replay as unverified unless the fixture can safely make those states.

## F01 baseline (11-01)

Record these on the current candidate before the repair and again after it. Use a unique synthetic new email per case, `$V access-request EMAIL` after each step, and restore `mail` and `fault` controls afterward. Intended behavior (issue #1639): a withdrawn or failed invitation-origin acquisition leaves no mintable credential, while an independent platform approval, a live sibling Organization invitation and a completed account survive. Invitation expiry alone does not withdraw anything. A fault is a controlled failure, not approved behavior: the current outcome is a baseline observation.

- (a) New email, `$V fault arm setup-link-create`, then `Invite` as `orgOwner`. Today expect a 500 failure and a `blocked` invitation, with the Access Request left `approved`. `$V fault state` must show the match. Restore, open `/auth/renew-invite` for that email, submit it, and `mail-link PAGE EMAIL setup`. A captured setup link here is the residue the repair must remove.
- (b) Invite a new email so setup mail is delivered, `Revoke` the invitation, then `mail-link` the earlier setup link and renew-invite. Record whether setup still completes and whether the request stays approved.
- (c) As Org A's and Org B's owners invite the same new email, then revoke A's invitation. B's invitation, the request and the setup link must keep working; record each.
- (d) As a public visitor request access with that email (`pending`), invite it as `orgOwner`, then arm `fault arm setup-link-create` or `invitation-access-link` and observe the fatal issuance. Record request status, bridge rows and invitation status.
- (e) Approve a public request through platform review first, then run a failing invite for the same email (`fault arm invitation-access-link` or `invitation-block`). The independent approval must survive.
- (f) Complete setup for a new email, then revoke or block its invitation. The completed account and its request history must stay.
- (g) As `platformReviewer`, open `admin/access-requests` on a request approved through an invitation. Record whether any rescind action exists; today there is none.

## Gotchas

- Invitations and delivery attempts load all pages in descending creation-time order, with ascending ID breaking timestamp ties. The first delivery for an invitation supplies its status. Preserve newest-first behavior and compare complete saved IDs; an empty native list does not establish populated or large-page completeness.

- A new person's approved Access Request and setup link are distinct from their Organization Invitation. Preserve their separate delivery and state; do not count account activation as membership.
- An `Admin` invitation is a sensitive action. After more than 15 minutes since the owner's sign-in, `Invite` returns a 403 failure carrying `requiresStepUp`/`stepUpPath` and the page moves to `/auth/login?reauth=1&next=...settings/members` with no invitation row. A duplicate pending email is rejected before that check. The `Membership Role` options appear only in a `"verbose":true` snapshot.
- Pending invitation creation may succeed when email delivery fails. `Resend` retries that invitation and does not mint a new setup credential.
- Keep private email links and credentials out of snapshots, logs and committed evidence. F01 approval-provenance repair belongs to 11-01; this recipe records the current behavior without treating that defect as accepted.
- The captured mail is a synthetic sink, not a delivery proof. Supabase auth emails such as password recovery post to the same provider URL and are recorded as `auth`.
