# ADR 0012: Organization-Invited Platform Access Auto-Approval

Status: Accepted
Date: 2026-08-03

Stabilization 03-01b supersedes this decision's billing-dependent lifetime. The
reviewed invitation bridge and separate setup credential now apply to every new
invitee, regardless of commercial settings. Resend/retry use reviewed recovery for linked incomplete accounts, sign-in for
usable accounts, or Request Access for legacy unlinked recipients without a usable
account, and never issue setup credentials. The original context below records
why this boundary was introduced; it is not the current acquisition switch.
The 2026-10-12 F01 amendment (#1639) closes the approval-rescind exposure:
invitation-origin platform access is a grant derived from live invitations,
recorded by `approval_basis`, and platform staff can rescind any approved
incomplete request. The amended sections below state the current contract.

## Context

### Original decision context (2026-08-03)

- While `PUBLIC_BILLING_ENABLED=false`, `/auth/sign-up` redirects to `/auth/request-access`. An **Organization Invitation** sent to a person with no **User Account** therefore has nowhere to send them except the platform-admin **Access Request** queue.
- `inviteOrganizationMember` already bridges such an invitation into an `access_requests` row (`shouldBridgeAccessRequest = !existingUserAccount && !isBillingEnabled`, `src/lib/server/core/useCases/orgSettingsMemberManagement.ts:287`).
- `accept_organization_invitation` returns `setup_required` until that **Access Request**'s setup completes, so the invitation cannot be accepted until a platform admin acts.
- ADR 0009 established app-owned **Account Setup Links** but assumed a single issuer: **Platform Access Request Administration** approval and resend.
- Raw setup tokens are stored as `sha256` only (originally `src/lib/server/accountSetupLinks.ts:188`; now `src/features/identity/accountSetupLinks.server.ts:hashSetupToken`) and are unrecoverable after issuance.
- `access_requests_pending_email_idx` is `UNIQUE (lower(email)) WHERE status = 'pending'` — the only database-level guard against two rows for one email.
- `access_requests` and `access_request_organization_invitation_links` are readable only under `is_platform_admin()`. The organization store is built from the user's RLS client (`src/lib/server/adapters/httpAdapter.ts:98`), so organization-scoped surfaces cannot see either table.
- The organization members settings screen already computes `deliveryStatus`, `deliveryStatusLabel`, and `deliveryLastError` for every pending invitation and renders none of them.

### Original decision pressure (2026-08-03)

- An organization owner who invites a new person today gets a dead end: the invitee cannot create an account until a platform admin reviews a queue they never knowingly joined, and nobody in the organization can see that this is what happened.
- The bridge is already gated on `!isBillingEnabled`, so this rule self-retires when billing is enabled. It needs to be documented as a beta-period rule with a known end, not absorbed silently into ADR 0009's permanent mechanism.
- Issuing a setup credential from a second call site forces a decision about where credential issuance lives, because copying `approve()`'s body would copy its platform-admin step-up authorization and rate limits into an organization-governance flow where they are meaningless.

## Decision

### Authorization

- An **Access Request** bridged from an **Organization Invitation** is **auto-approved**. An organization owner's or admin's vouching is sufficient authorization for reviewed platform entry; no platform-admin action appears anywhere in the invite path.
- The **Access Request** row and its machinery are kept. The request is born approved rather than bypassed, so account creation does not fork into two paths.
- A pre-existing **pending** public request for the same email is reused and auto-approved on the same basis. The `link_organization_invitation_access_request` RPC reuses it.
- `reviewed_by` records the **inviting organization owner or admin**, not a platform admin. It is a nullable FK to `auth.users`. Amended 2026-10-12: `access_requests.approval_basis` (`platform_review` or `organization_invitation`) records how an approval was granted. It is non-null exactly when the request is `approved` or `rescinded`. Platform approve writes `platform_review`; the invite bridge writes `organization_invitation`.
- Amended 2026-10-12: **invitation-origin platform access is a derived grant.** `access_request_setup_grant_is_live(id)` is true when the request is `approved`, setup is incomplete, and either the basis is `platform_review` or at least one linked **Organization Invitation** is not `revoked` or `blocked`. Expiry is not withdrawal, because ADR 0009 keeps a 90-day renewal window beyond the 14-day invitation. A new live invitation linked to a dead request revives it, which is revoke-then-re-invite.

### Credential issuance

- Setup-link issuance is extracted into a shared module, `src/lib/server/accountSetupLinkIssuance.ts`, taking exactly three dependencies — `setupLinks`, `setupDelivery`, and an `audit` sink — and exposing `issue({ accessRequestId, email, publicOrigin, origin, context })`.
- The module owns the whole credential lifecycle: create, deliver, and the complete audit trail, including one `account_setup.link_revoked` event per revoked sibling. That loop is duplicated verbatim in three call sites today; the module retires all three.
- `origin` (`'platform_approval' | 'platform_resend' | 'organization_invitation'`) names the audit event and nothing else. It must never branch a guard. This retires the `input.action === 'approval'` collapse in `platformAccessRequestAdministration.ts` rather than adding a third arm to it.
- The invitation origin does **not** get a fourth audit action name. The three existing names — `account_setup_link_sent`, `_resent`, `_delivery_failed` — describe what happened to the credential, which is what the audit query asks. The organization lane stays filterable through the auto-stamped `org_id`.
- Both use cases **compose** the module from ports they already hold. It is not injected as a port: there is one implementation and no prospect of a second, and a stub point there would rewrite passing behaviour tests into call-shape assertions.
- **Do not call `platformAccessRequestAdministration.approve` from the invite path.** Its step-up authorization and admin-scoped rate limits are meaningless for an organization-owner actor, and a bypass flag on the function guarding platform account issuance is a footgun. `approve` keeps meaning exactly "a platform admin reviewed this".
- A fresh setup link is issued on **every** invite, including when an existing **Access Request** was reused. The raw token is unrecoverable, so always-issue is the only repair path when an earlier delivery failed.

### Delivery

- The invitee receives **two** emails: the invitation (trust signal — who invited you, which unit) and the setup link (the credential). They are not merged. Invitation-outbox retry re-renders its URL from static rules, so embedding the setup link would rotate the credential on every SMTP retry.
- The invitation email carries a recovery link to `/auth/renew-invite?email=<invitee>`, framed as recovery and labelled **"Didn't get your setup link?"**. The label is fixed, not stylistic: the members-screen status copy quotes it by name.
- The organization admin's **Resend invite** resends the invitation email only. The organization admin owns the invitation; the invitee and the platform admin own the credential. Resending both would hand every organization admin a credential-minting button that clobbers a link the invitee may be mid-way through using.

### Failure and concurrency semantics

- Link **creation** failure is fatal: it blocks the invitation and 500s, matching the existing bridge-failure contract, because it leaves the invitee no credential and nothing in the invitation that could produce one. The owner sees the action's own message; a 5xx `RequestFailure` raised with `publicMessage` keeps its text through the HTTP adapter.
- Amended 2026-10-12: **the approval row is not unwound when creation fails, but its grant dies.** The block withdraws this invitation's vouch, so the grant derived from it ends unless a sibling Organization's invitation still vouches. `/auth/renew-invite`, public resubmission and any later claim then meet the dead grant. No request state is flipped, so no rollback can withdraw a sibling's legitimate grant.
- Amended 2026-10-12: **every point that mints, admits or offers a new credential checks the grant.** Setup-link issuance (`issue_account_setup_link`), the setup claim, setup-page validation, and renewal and resubmit eligibility all require it. A dead grant reads as `access-request-not-approved`. Completion and reconciliation keep requiring only `approved`, so a claim admitted while the grant was live finishes and no completed account is stranded.
- Link **delivery** failure is non-fatal: it leaves a valid 14-day link and working recovery routes. This matches what `approve()` already does.
- `concurrent-create` is the **single exception** to fatal creation. It means a valid link exists and a sibling call is delivering it, so the invitation stands and no second setup email is sent. The shared issuance module must therefore surface it as its own status rather than collapsing non-`created` results into failure.
- Amended 2026-10-12: **the bridge is one transaction.** `link_organization_invitation_access_request` first takes a per-email bridge advisory lock distinct from the claim key, so a concurrent retry for the same invitation waits and then finds the committed link. Under it the RPC returns an existing link for the invitation untouched (`already-linked`), refuses an invitation that is no longer pending (`invitation-not-pending`, a visible 409 with nothing to block), and reuses the newest pending or renewable approved incomplete request `FOR UPDATE`, or inserts a pending row, links the invitation and flips pending to approved with `approval_basis = 'organization_invitation'`. The row is still born `pending`, so `access_requests_pending_email_idx` stays a backstop, and two Organizations inviting a new email at once share one request.
- Amended 2026-10-12: **issuance revokes and inserts in one transaction.** `issue_account_setup_link` locks the request `FOR SHARE`, requires the live grant, revokes unclaimed active links as `replaced` and inserts the new link. A unique violation on the one-active index still returns `concurrent-create`; any other failure rolls back the revocation. It returns the revoked sibling ids for the audit trail.
- Lock order is bridge advisory key, then request row, then invitation rows. The claim's request, claim advisory key, link order is unchanged. Revoke locks only the invitation and never waits on a request, so it cannot deadlock with rescind or the bridge. A revoke that commits just after issuance leaves a link the claim then refuses; a revoke that commits just after a claim lets that admitted claim finish.
- Revoking an **Organization Invitation** does not write the **Access Request** or its **Account Setup Link** rows. Amended 2026-10-12: it does end that invitation's vouch, so an unclaimed setup link stops working and renewal stops sending links unless another live invitation or a platform review still grants access. Revoke-then-re-invite revives the same request with a fresh link. Revoke remains non-symmetric here and does not remove an accepted member.
- The Organization's own withdrawal lever ends when its invitation expires, because revoke then reports `expired`. Platform rescind covers the rest of the 90-day renewal window. Shortening renewal for invite-origin requests would change reviewed acquisition, so it is stated rather than changed.

### Organization-side visibility, and the boundary it crosses

- The members settings screen shows **one status line per pending invitation covering the whole invite funnel**, not a mirror of platform state. Evaluated in funnel order, first blocking stage wins: `Invitation email failed` → `Setup email didn't reach them` → `Waiting on them` → `Waiting on them to accept`. `Invitation email failed` outranks every platform state, including a successfully delivered setup link.
- **The setup states group by the admin's remedy, not by cause.** `pending`, `delivery_pending`, and `replaced` show `Waiting on them` while setup delivery or use is expected. `claimed` also shows that stage, but its detail directs the admin to Platform support if setup stalls: another link cannot clear an unresolved claim. `delivery_failed`, `failed`, `not_sent`, and `expired` give `Setup email didn't reach them` and point to the invitation email's recovery link when no claim is held. `completed`, or no **Access Request** at all because the invitee already had a **User Account**, gives `Waiting on them to accept`. There is no blank state.
- **The `Setup email didn't reach them` label is deliberately imprecise about cause.** It also covers a link that was never issued, lapsed, or errored partway. Accepted rather than softened to something like "Setup didn't complete", which would lose the hint that the email is where to look. The remedy the label points at is correct in every case it covers.
- That line is read through a **narrow optional service-role port bound by the selected Settings delivery context**, returning `Map<invitationId, AccessRequestSetupState>` and nothing else. The adapter checks unresolved claims across the invited emails in one batched lookup, including claims on an older or separate **Access Request**; a held claim overrides an incomplete request's delivery state with support guidance. A completed request still proceeds to separate invitation acceptance. Authorization is the `organization.accessGovernance` gate the page already sits behind; no new gate is added. Being optional means its absence degrades the line to invitation-email state only rather than crashing.
- **Platform vocabulary must not cross the network boundary.** The port returns the raw `AccessRequestSetupState`; the collapse to the four organization-facing labels happens in `buildMembersSettingsSection`. `SettingsInvitationRow` carries only the collapsed state and its label.
- Auto-approved rows are marked as auto-approved in the platform-admin reviewed-requests table and show their origin context — "auto-approved via invite from Bravo Company" — rather than looking personally vetted.
- The September 25 claim correction in [ADR 0009](0009-beta-access-request-account-setup-links.md#held-claims-and-recovery-2026-09-25) permits fresh invitation setup delivery while holding password mutation behind an email-scoped claim. The September 26 follow-up lets the invited person reconcile a witnessed claim with a valid setup link; invitation resend alone cannot unlock it. Unverifiable and legacy claims follow the [Account Setup claim runbook](../../operations/account-setup-claim-recovery.md).

## Rejected Or Deferred Alternatives

- **Enable billing so `/auth/sign-up` becomes public.** Rejected by stabilization: public acquisition remains reviewed and billing no longer retires this ADR.
- **Bypass Access Requests entirely for invited people.** Rejected because it forks account creation into two paths that must both stay correct.
- **Leave pre-existing pending public requests for a platform admin.** Rejected because it would leave the keenest invitees — the ones who already applied — waiting.
- **One email carrying both the invitation and the setup link.** Rejected on a fact, not a preference: invitation-outbox retry re-renders the URL, which would rotate an unrecoverable credential on every retry.
- **Call `approve()` with a bypass flag.** Rejected; see Decision.
- **Add `'organization_invitation'` to `PlatformAccessRequestSetupAction`.** Rejected because that type is rate-limit vocabulary — it names buckets and picks rate-limit messages — so a third value would name a bucket nobody checks and tell an organization admin about a platform-admin approval limit.
- **Inject the issuance module as a port.** Rejected; see Decision.
- **A new RLS policy granting organization admins access to `access_requests`.** Rejected because RLS is row-level: it hands over the applicant's free-text `reason`, `name`, `heard_about`, and `heard_about_details`. Column-constraining means a view plus grants plus a policy — more machinery than the port, for a worse boundary.
- **Denormalise a coarse setup state onto `organization_invitations`.** Rejected because that state changes on at least five independent write paths; the first one that forgets to update the mirror produces a members screen that confidently states something false. A read-time join cannot drift.
- **Mirror all nine `AccessRequestSetupState` values on the members screen.** Rejected because the organization admin's remedy is identical across `delivery_failed`, `failed`, and `not_sent`, and it pushes platform vocabulary onto a tenant screen.
- **A backfill for existing queued requests.** Rejected: the queue was empty on 2026-08-03, and a backfill means a throwaway script reimplementing the delivery path with no dry-run for email sends. Stragglers are approved by hand.
- **A new platform-admin lever over auto-approved requests.** Built on 2026-10-12 as platform rescind; see Guardrails.
- **Withdrawal as an event that flips request state** (rejected 2026-10-12). Direct invitation updates bypass a release RPC, a held claim defers release forever, existing residue is never withdrawn, and a revoke before the bridge links escapes release. Deriving the grant covers every invitation writer without a state flip.
- **An "invited account" class that cannot create Organizations.** Rejected as dwarfing the rest of this effort; recorded as an exposure below.

## Guardrails And Exceptions

- **The reviewed invitation bridge applies to every new invitee.** Stabilization 03-01b supersedes the original commercial-switch lifetime. Account setup and membership acceptance remain separate.
- **`reviewed_by` on `access_requests` is no longer always a platform admin.** For invite-origin rows it is the inviting organization owner or admin. Do not read it as "a platform admin reviewed this", and do not build inferences on it. Amended 2026-10-12: provenance reads `approval_basis`, never reviewer-inviter equality. A platform admin who approves an invite-origin request by hand writes `platform_review`, and that row keeps reading as vetted.
- **An `organization_invitation` approval names the Organization whose invitation approved it.** Among origins whose inviter equals `reviewed_by`, the row is credited to the newest one that pre-dates `reviewed_at`. Only the invite that found the request pending approved it; later invites leave `reviewed_by` and `reviewed_at` untouched. `invited_at` and `reviewed_at` come from different clocks, so a lone matching origin is credited without comparing them, and an undecidable comparison falls back to the oldest match. When no origin remains on record, the row still reads auto-approved with no Organization named. This credit picks display text only; it never decides basis.
- Amended 2026-10-12: **the former equality blind spot is closed.** A person who is both a platform admin and an inviting owner, and who hand-approves a request before inviting the address, now reads as `platform_review`. The migration backfills existing approved rows. An `access_request.approved` audit event means `platform_review`. Otherwise a linked origin whose `invited_by` equals `reviewed_by` with `invited_at` no later than five minutes after `reviewed_at` means `organization_invitation`. Anything else is `platform_review`. The one remaining misclassification is a hand approval followed within five minutes by the same person's invite, and it is recorded here rather than hidden.
- **Platform rescind is the platform lever for approved incomplete requests of either basis.** `rescind_access_request_and_block_linked_invitations` mirrors reject. It refuses a completed request, refuses while a claim is held on one of the request's own links (follow the claim runbook), sets `rescinded`, keeps `approval_basis` and `reviewed_by/at` legible, revokes unclaimed links as `manual` and blocks linked pending invitations with reject's audit shape. Platform Access Request Administration authorizes it with reject's step-up and audits `access_request.rescinded`.
- **Platform rescind, like reject, withdraws the current grant only.** A later Organization Invitation for the same email is a new vouch: the bridge creates a new auto-approved request instead of reviving the rescinded one, and platform staff see it as auto-approved.
- **`approve()` keeps its meaning.** Do not add bypass flags, actor-type parameters, or origin branches to it. New issuers compose `accountSetupLinkIssuance` instead.
- **`origin` never gates behaviour.** If a future caller needs different fatality, it maps the result at its own call site. Four `switch`es across an admin console, an invite flow, and two anonymous public forms is correct: response policy is exactly what differs between them.
- **Organization-scoped surfaces read platform-owned state only through narrow, purpose-built service-role ports** that return the minimum shape the surface needs — not through RLS grants on platform tables, and not through denormalised mirrors. This is the first such port; it is a documented exception to the RLS-client default in ADR 0011, not a general licence for organization code to reach platform data.
- **Bind that port in `settingsRequestContexts.server.ts` using the lazy `getAdminClient` callback.** Direct route-level admin client acquisition requires a `routeAdminProviderAllowlist` entry in `GOVERNANCE_BASELINE.json`. The selected builder adds no such acquisition.
- **Do not surface a copyable `/auth/renew-invite` URL on an organization admin screen.** The route is public and rate-limited, so it grants no new capability, but it is a form the invitee submits about their own address.
- **Resend stays enabled in every state**, including _Setup email didn't reach them_. It is insufficient there, not futile — the copy carries that.
- Everything ADR 0009 says about token hashing, one active link per request, 14-day expiry, 90-day renewal eligibility, and identity creation only after password entry applies unchanged to invite-origin issuance.

### Accepted exposures

Three, all deliberate:

1. **Auto-approval transitively grants Organization creation.** `/org/new` is gated only on email confirmation, so an invited person can provision their own Organization. Consistent with the retained vouching basis; billing does not change reviewed acquisition.
2. **Withdrawal does not interrupt an admitted claim.** Amended 2026-10-12: the original exposure, no rescind lever between auto-approval and setup completion, is closed by the derived grant and platform rescind. What remains is deliberate. A setup claim admitted while the grant was live may finish after a revoke or block commits, so password and account creation are never cut off midway. Rescind refuses while such a claim is held. The Organization's lever ends at invitation expiry and platform rescind covers the rest of the renewal window.
3. **Account existence is inferable from the members screen.** Invite an address; a _setup_ state means no account existed, `Waiting on them to accept` immediately means one did. Probing costs a real invitation email to the target — rate-limited, audited, `notifyAdmins` fires org-wide, and the person probed receives mail. That is a loud, slow, attributable way to learn one bit that leaks through the invitee's own behaviour anyway. Closing it would mean collapsing the screen's two most actionable labels into one.

Exposure 3 is a genuinely new disclosure, not a widening of an existing one: today the only platform-access fact an organization admin learns is the terminal `blocked` history detail.

## Consequences

- Expected benefits:
  - An organization owner invites someone and that person can start working immediately. No platform-admin action in the path.
  - Credential creation, delivery, and audit live in one module instead of four hand-rolled copies, and the raw token has one fewer place to leak from.
  - The members screen tells an organization admin which of the two emails failed, which is the difference between a useful Resend and a decorative one.
  - Stabilization retains this reviewed-entry path; the original billing-switch retirement assumption no longer applies.
- Tradeoffs:
  - Platform entry for invited people is now authorized by organization owners, whose incentives are not the platform's cost-control incentives.
  - `access_requests.reviewed_by` loses a uniform meaning.
  - Organization-scoped code now has one sanctioned service-role read path, which is a boundary that must be defended per-port rather than by the blanket "org code uses the RLS client" rule.
- New risks or migration costs:
  - The three exposures above.
  - Extracting issuance touches the platform-admin approval path. `platformAccessRequestAdministration.test.ts` stays **unchanged** on purpose: its passing is the evidence the extraction preserved behaviour.
  - The invitation email's recovery-link label and the members-screen copy are coupled. Changing one without the other points an admin's instruction at something the invitee cannot find.

## Rollout And Follow-Up

- Build the extraction and auto-approval together; the invite path cannot issue a credential before the module exists.
- `bridgeInvitationToAccessRequest` currently discards the `accessRequestId` its port already returns on every non-failed status. It must propagate it.
- Correction, 2026-08-04: `accountSetupLinkIssuance` gets **no dedicated test suite**. Its only behaviour of its own is that `origin` names the audit event, and that is observable through its callers, so a suite here would re-assert the same thing at a lower altitude. `platformAccessRequestAdministration.test.ts` passing **unchanged** is the evidence the extraction preserved behaviour. `orgSettingsMemberManagement.test.ts` covers invite outcomes only — fatal issuance blocks the invitation and 500s; `concurrent_create` and `delivery_failed` each leave it standing. No suite asserts on another's internals; nothing asserts call shapes. This replaces the original line calling for a new `accountSetupLinkIssuance.test.ts` module, which contradicted the build spec (#1264) and the extraction ticket (#1266).
- Correction, 2026-08-04: the funnel section previously gave only an order — `Invitation email failed` → `Waiting on them` → `Setup email didn't reach them` → `Waiting on them to accept` — and no per-state mapping. Two artifacts then disagreed about what that order meant. The order itself is the one in #1264 and #1269: `Setup email didn't reach them` is evaluated second. The per-state mapping is the one in #1261, which groups by the admin's remedy and puts `failed` and `not_sent` under `Setup email didn't reach them`; #1264's enumeration flattened all seven incomplete states into `Waiting on them`, which contradicts the rationale this ADR already records under _Mirror all nine `AccessRequestSetupState` values_ and would have printed "both emails went out" on a row where no setup email was ever sent. #1264 is a build handoff that states it makes no new design decisions, so #1261 governs where they diverge. `expired` was listed by neither; it joins the no-usable-credential group, which is where the remedy rule puts it. Both are now written out above so they cannot drift apart again.
- The two public setup-link callers — `/auth/renew-invite` and `/api/access-requests` — migrate onto the shared module **separately**, so their enumeration-resistant collapse of every non-`created` status gets its own reviewed change. Tracked in issue #1263.
- Email copy for both messages is build work, constrained only by the fixed **"Didn't get your setup link?"** label.
- Docs updated with this ADR: `docs/architecture/ADR_INDEX.md`, `docs/architecture/DRIFT_LEDGER.md` (new `D-10`, plus a `D-02` current-state bullet), `CONTEXT.md` (`## Language`), `docs/architecture/adrs/0009-beta-access-request-account-setup-links.md`, `docs/architecture/adrs/0011-platform-administration-boundary.md`.
- `GOVERNANCE_BASELINE.json` requires no change, conditional on the port-wiring guardrail above.
- Stabilization retains this ADR independently of billing. The 11-01/F01 repair (#1639) implements the derived grant, the atomic bridge and issuance RPCs, `approval_basis` and platform rescind. `D-10` is resolved pending its live verification.

## Links

- Related PRD:
- Related issue:
  - Map: auto-approve platform access for org-invited people — #1258
  - Concurrency: simultaneous invites to one new email — #1259
  - Seam for shared setup-link issuance — #1260
  - Org admin visibility of platform setup state — #1261
  - ADR and governance record for auto-approval — #1262
  - Migrate public setup-link paths onto the shared issuance module — #1263
- Related drift IDs:
  - `D-02`
  - `D-10`
- Related ADRs:
  - [ADR 0004: V1 Provider Boundary Contract](0004-v1-provider-boundary-contract.md)
  - [ADR 0009: Beta Access Request Account Setup Links](0009-beta-access-request-account-setup-links.md)
  - [ADR 0011: Platform Administration Boundary](0011-platform-administration-boundary.md)
- Related docs:
  - `CONTEXT.md`
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/ADR_INDEX.md`
