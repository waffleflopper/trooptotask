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

Preconditions: `doctor` passes; `$V fixture` identifies Organization A, Alpha/Bravo, `orgOwner`, and `orgInvitee` (an existing confirmed account with no A membership). Use `$V actor orgOwner settings/members` and `$V actor orgInvitee dashboard` in separate browser contexts. Keep one unique invitee email per state-changing case. The helper provides invitation and membership readback for A/B; a safe private setup-link capture is still needed before the new-account completion path can be marked live-verified.

1. As `orgOwner`, capture the `Access Management` and `Invite Member` sections. Enter `orgInvitee`'s synthetic email, choose member access and `Selected groups` → `Alpha`, then click `Invite`. Save the result and a reload of `Pending Invitations`, including email, access label, scope and funnel status. Confirm the invitee is absent from `Organization members` and from the owned A membership readback before acceptance. A duplicate pending invite must show a visible error and leave one pending invitation.
2. As `orgInvitee`, open `/dashboard`; save a before snapshot with A under `Pending Invitations` and no A workspace. Click that card's `Accept`, capture the response and resulting `Joined <Organization>` feedback, then reload. A must now appear once under `Organizations`; the invitation must leave Pending and appear in the owner's history. Open A and verify Alpha access without Bravo access using a retained Personnel or Calendar view; Organization B stays absent. Record the exact A membership/access snapshot and invitation state from the owned provider.
3. On a separate fresh invitation, choose `Decline` from the invitee's Dashboard. Reload both Dashboard and owner Members; no membership is created and the owner sees the closed invitation. A revoked invitation likewise cannot grant membership after reload. Keep each case on its own synthetic email or restart the worker; an accepted invitation cannot be reused as a pending fixture.
4. For a new-account email with no User Account, create the invitation and capture both the owner-facing pending funnel and the separate setup and invitation deliveries through a safe private-link control. Complete `/auth/setup-account`, sign in, and confirm that setup alone leaves A absent from the account's Organizations. Accept the A invitation afterward, then reload and read the membership. The current worker has no mail transport or token-bearing link capture, so creation, failed delivery, resend and revoke can be observed, while setup completion remains unreachable until a safe control exists. Do not use a token-bearing URL in evidence.
5. Exercise one denied owner action as `orgMember` and one foreign-Organization invitation ID against the current form action using that signed-in actor's request context. Record the action failure status and no new invitation/membership rows; a SvelteKit form action can return HTTP 200 with a `failure` envelope carrying status 403. The missing `Invite Member` form is only an affordance observation. In the current worker, invitation persistence can succeed while mail delivery fails; capture the visible `Invitation created, but email delivery failed` state, then use `Resend`. Verify the original invitation ID remains pending and no new invitation or membership is created. Record expiry/replay as unverified unless the fixture can safely make those states.

## Gotchas

- A new person's approved Access Request and setup link are distinct from their Organization Invitation. Preserve their separate delivery and state; do not count account activation as membership.
- An `Admin` invitation is a sensitive action. After more than 15 minutes since the owner's sign-in, `Invite` returns a 403 failure carrying `requiresStepUp`/`stepUpPath` and the page moves to `/auth/login?reauth=1&next=...settings/members` with no invitation row. A duplicate pending email is rejected before that check. The `Membership Role` options appear only in a `"verbose":true` snapshot.
- Pending invitation creation may succeed when email delivery fails. `Resend` retries that invitation and does not mint a new setup credential.
- Keep private email links and credentials out of snapshots, logs and committed evidence. F01 approval-provenance repair belongs to 11-01; this recipe records the current behavior without treating that defect as accepted.
