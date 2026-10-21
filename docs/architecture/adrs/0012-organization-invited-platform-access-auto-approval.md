# ADR 0012: Organization-invited platform access auto-approval

## Decision

An **Organization Invitation** to an email with no **User Account** bridges to an **Access Request** that is approved at once. The inviting owner's or admin's vouch authorizes platform entry. No platform admin acts in the invite path. This applies to every new invitee. Setup and membership acceptance stay separate ([ADR 0009](0009-beta-access-request-account-setup-links.md)).

### Authorization

- The request is born approved instead of skipping **Access Requests**, so account creation has one path. A pending public request for the same email is reused and approved.
- `reviewed_by` on an invitation-origin request is the inviting owner or admin. `access_requests.approval_basis` is `platform_review` or `organization_invitation`, and is non-null exactly when the request is `approved` or `rescinded`. Provenance reads `approval_basis`, never reviewer and inviter equality.
- Invitation-origin access is a derived grant. `access_request_setup_grant_is_live(id)` is true when the request is `approved`, setup is incomplete, and either the basis is `platform_review` or at least one linked invitation is not `revoked` or `blocked`. Invitation expiry is not withdrawal, because ADR 0009 keeps a 90-day renewal window.
- A new live invitation revives an `approved` request whose grant died. A `rescinded` request is never revived. An invitation after a rescind starts a new request.
- Every point that mints, admits or offers a credential checks the grant: `issue_account_setup_link`, the setup claim, setup-page validation, and renewal and resubmit eligibility. A dead grant reads as `access-request-not-approved`. Completion and reconciliation require only `approved`, so a claim admitted while the grant was live still finishes.
- `rescind_access_request_and_block_linked_invitations` is the platform lever for an approved incomplete request of either basis. It refuses a completed request and refuses while a claim is held on one of the request's own links. It sets `rescinded`, revokes unclaimed links as `manual` and blocks linked pending invitations. It uses reject's step-up and audits `access_request.rescinded`.

### Credential issuance

- The invite path composes Identity's `accountSetupLinkIssuance` from `setupLinks`, `setupDelivery` and an audit sink. It never calls platform `approve()`. `approve()` means "a platform admin reviewed this", and its step-up and rate limits do not apply to an Organization actor.
- `origin` (`platform_approval`, `platform_resend` or `organization_invitation`) names the audit event and never gates behavior. A caller that needs different failure handling maps the result at its own call site.
- Every invite issues a fresh link, including a reused request. The raw token is unrecoverable, so a fresh link is the only repair after a failed delivery.
- Link creation failure blocks the invitation with a 500. The approval row stays, but this invitation's vouch ends, so its grant dies unless another Organization's live invitation still vouches. No request state is flipped, so no rollback can withdraw a sibling's grant.
- `concurrent-create` is the one non-fatal creation result. A valid link exists and a sibling call is delivering it, so the invitation stands and no second setup email is sent.
- Link delivery failure is non-fatal. The 14-day link and the recovery routes still work.

### Delivery

- The invitee receives two emails: the invitation and the setup link. They stay separate because invitation-outbox retry re-renders its URL, which would rotate an unrecoverable credential on every retry.
- The invitation email links to `/auth/renew-invite?email=<invitee>` with the label `ACCOUNT_SETUP_RECOVERY_LINK_LABEL` ("Didn't get your setup link?"). The members screen quotes that label, so change both together.
- An Organization admin's **Resend invite** resends the invitation only. It never mints a setup credential, which would let any Organization admin replace a link the invitee may be using.

### Concurrency

- `link_organization_invitation_access_request` is one transaction. It takes a per-email bridge advisory lock, distinct from the claim key. It returns `already-linked` for an invitation that already has a link and refuses an invitation that is no longer pending with `invitation-not-pending`. Otherwise it reuses the newest pending or renewable approved incomplete request `FOR UPDATE`, or inserts a pending row, then links the invitation and approves it. The row is born `pending`, so `access_requests_pending_email_idx` still guards against duplicates, and two Organizations inviting one new email share one request.
- `issue_account_setup_link` locks the request `FOR SHARE`, requires a live grant, revokes unclaimed active links as `replaced` and inserts the new link in one transaction. A unique violation on the one-active index returns `concurrent-create`.
- Lock order for the bridge is bridge advisory key, request row, invitation rows. The claim locks request, claim advisory key, link. Revoke locks only the invitation and never waits on a request, so it cannot deadlock with rescind or the bridge.
- Revoking an invitation writes no **Access Request** or link row. It ends that invitation's vouch.

### Organization-side visibility

- The members screen shows one status line per pending invitation, evaluated in funnel order: `Invitation email failed`, `Setup email didn't reach them`, `Waiting on them`, `Waiting on them to accept`. The first blocking stage wins.
- Setup states group by the admin's remedy, not by cause. `delivery_failed`, `failed`, `not_sent` and `expired` all read `Setup email didn't reach them`, because the remedy for each is the invitation email's recovery link. A held claim directs the admin to Platform support, because another link cannot clear it.
- The line comes from an optional narrow service-role port bound in the Settings delivery context. It returns `Map<invitationId, AccessRequestSetupState>` and nothing else, and it checks held claims across the invited emails in one batched read. `buildMembersSettingsSection` collapses platform states to the four labels. The port's absence or failure degrades the line to invitation-email state.
- Do not show a copyable `/auth/renew-invite` URL on an Organization admin screen. The invitee submits that form about their own address.
- **Resend invite** stays enabled in every state.
- The platform reviewed-requests table marks auto-approved rows and names the inviting Organization, so they do not look personally vetted.

## Why

Before this decision, an owner who invited a new person hit a dead end. The invitee waited in a platform queue they never knowingly joined, and nobody in the Organization could see why. A row-level RLS grant on `access_requests` would expose the applicant's free-text reason and survey answers. A denormalized setup state on `organization_invitations` would drift, because at least five write paths change it. A derived grant covers every invitation writer without a state flip that a held claim or a direct update could skip.

## Accepted exposures

1. Auto-approval grants Organization creation. `/org/new` requires only a confirmed email, so an invited person can create their own Organization.
2. Withdrawal does not interrupt an admitted claim. A claim admitted while the grant was live may finish after a revoke, block or rescind, so password and account creation never stop midway. The Organization's lever ends at invitation expiry. Platform rescind covers the rest of the renewal window.
3. The members screen reveals whether an email had an account. A setup state means it did not. Probing costs a real, rate-limited, audited invitation email to the target.
