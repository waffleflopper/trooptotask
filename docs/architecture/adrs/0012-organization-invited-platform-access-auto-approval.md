# ADR 0012: Organization-Invited Platform Access Auto-Approval

Status: Accepted
Date: 2026-08-03

Stabilization 03-01b supersedes this decision's billing-dependent lifetime. The
reviewed invitation bridge and separate setup credential now apply to every new
invitee, regardless of commercial settings. Resend/retry use reviewed recovery for linked incomplete accounts, sign-in for
usable accounts, or Request Access for legacy unlinked recipients without a usable
account, and never issue setup credentials. The original context below records
why this boundary was introduced; it is not the current acquisition switch.
The approval-rescind exposure remains a required repair under stabilization
11-01/F01, not a permanent accepted exception.

## Context

### Original decision context (2026-08-03)

- While `PUBLIC_BILLING_ENABLED=false`, `/auth/sign-up` redirects to `/auth/request-access`. An **Organization Invitation** sent to a person with no **User Account** therefore has nowhere to send them except the platform-admin **Access Request** queue.
- `inviteOrganizationMember` already bridges such an invitation into an `access_requests` row (`shouldBridgeAccessRequest = !existingUserAccount && !isBillingEnabled`, `src/lib/server/core/useCases/orgSettingsMemberManagement.ts:287`).
- `accept_organization_invitation` returns `setup_required` until that **Access Request**'s setup completes, so the invitation cannot be accepted until a platform admin acts.
- ADR 0009 established app-owned **Account Setup Links** but assumed a single issuer: **Platform Access Request Administration** approval and resend.
- Raw setup tokens are stored as `sha256` only (`src/lib/server/accountSetupLinks.ts:188`) and are unrecoverable after issuance.
- `access_requests_pending_email_idx` is `UNIQUE (lower(email)) WHERE status = 'pending'` — the only database-level guard against two rows for one email.
- `access_requests` and `access_request_organization_invitation_links` are readable only under `is_platform_admin()`. The organization store is built from the user's RLS client (`src/lib/server/adapters/httpAdapter.ts:98`), so organization-scoped surfaces cannot see either table.
- The organization members settings screen already computes `deliveryStatus`, `deliveryStatusLabel`, and `deliveryLastError` for every pending invitation and renders none of them.

### Decision pressure

- An organization owner who invites a new person today gets a dead end: the invitee cannot create an account until a platform admin reviews a queue they never knowingly joined, and nobody in the organization can see that this is what happened.
- The bridge is already gated on `!isBillingEnabled`, so this rule self-retires when billing is enabled. It needs to be documented as a beta-period rule with a known end, not absorbed silently into ADR 0009's permanent mechanism.
- Issuing a setup credential from a second call site forces a decision about where credential issuance lives, because copying `approve()`'s body would copy its platform-admin step-up authorization and rate limits into an organization-governance flow where they are meaningless.

## Decision

### Authorization

- An **Access Request** bridged from an **Organization Invitation** is **auto-approved**. An organization owner's or admin's vouching is sufficient authorization for reviewed platform entry; no platform-admin action appears anywhere in the invite path.
- The **Access Request** row and its machinery are kept. The request is born approved rather than bypassed, so account creation does not fork into two paths.
- A pre-existing **pending** public request for the same email is reused and auto-approved on the same basis. `findReusableAccessRequestForInvitation` already reuses it.
- `reviewed_by` records the **inviting organization owner or admin**, not a platform admin. It is a nullable FK to `auth.users`. It has exactly one reader: the reviewed-requests table compares it against the invitation origins' `invited_by` to tell an auto-approved row from a hand-vetted one.

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

- Link **creation** failure is fatal: it blocks the invitation and 500s, matching the existing bridge-failure contract, because it leaves the invitee no credential and nothing in the invitation that could produce one.
- **The approval is not unwound when creation fails.** The flip has to precede issuance — link creation requires `status = 'approved'` — so a fatal creation failure leaves an approved, incomplete **Access Request** behind a blocked **Organization Invitation**, and its owner could still reach a credential through `/auth/renew-invite`. Rolling it back is not attempted: the call cannot tell whether it performed the flip or inherited an approval from a sibling Organization's invite, and reverting the latter would withdraw a grant that call legitimately made. The residue is the same shape as the missing rescind lever and is tracked with it as `D-10`. Note that no email is sent on this path, so nothing points the invitee at the renewal form.
- Link **delivery** failure is non-fatal: it leaves a valid 14-day link and working recovery routes. This matches what `approve()` already does.
- `concurrent-create` is the **single exception** to fatal creation. It means a valid link exists and a sibling call is delivering it, so the invitation stands and no second setup email is sent. The shared issuance module must therefore surface it as its own status rather than collapsing non-`created` results into failure.
- The bridged row is inserted **`pending` and then flipped to `approved`**, never inserted directly as `approved`. `access_requests_pending_email_idx` is the only serialization point that exists; inserting as `approved` discards it and silently permits two approved rows for one email. The pending state lives for milliseconds inside one use-case call.
- The 23505 recovery in `supabaseOrgSettingsMemberManagement.ts` widens from `findPendingAccessRequest` to `findReusableAccessRequestForInvitation`, so a racing loser reuses the winner's row instead of failing on a row that is sitting right there.
- Revoking an **Organization Invitation** does not touch the **Access Request** or its **Account Setup Link**. Revoke-then-re-invite is a routine correction workflow, and revoke is already non-symmetric here — it does not remove an accepted member.

### Organization-side visibility, and the boundary it crosses

- The members settings screen shows **one status line per pending invitation covering the whole invite funnel**, not a mirror of platform state. Evaluated in funnel order, first blocking stage wins: `Invitation email failed` → `Setup email didn't reach them` → `Waiting on them` → `Waiting on them to accept`. `Invitation email failed` outranks every platform state, including a successfully delivered setup link.
- **The setup states group by the admin's remedy, not by cause.** `pending`, `delivery_pending`, `claimed`, and `replaced` leave the invitee a usable **Account Setup Link** or one on its way, so they give `Waiting on them`. `delivery_failed`, `failed`, `not_sent`, and `expired` leave no credential the invitee can act on, and the remedy for all four is the same — the recovery link in the invitation email — so they give `Setup email didn't reach them`. `completed`, or no **Access Request** at all because the invitee already had a **User Account**, gives `Waiting on them to accept`. There is no blank state.
- **The `Setup email didn't reach them` label is deliberately imprecise about cause.** It also covers a link that was never issued, lapsed, or errored partway. Accepted rather than softened to something like "Setup didn't complete", which would lose the hint that the email is where to look. The remedy the label points at is correct in every case it covers.
- That line is read through a **narrow optional service-role port on `UseCaseContext`**, mirroring `signInRosterPersonnelLookup`, returning `Map<invitationId, AccessRequestSetupState>` and nothing else. Authorization is the `organization.accessGovernance` gate the page already sits behind; no new gate is added. Being optional means its absence degrades the line to invitation-email state only rather than crashing.
- **Platform vocabulary must not cross the network boundary.** The port returns the raw `AccessRequestSetupState`; the collapse to the four organization-facing labels happens in `buildMembersSettingsSection`. `SettingsInvitationRow` carries only the collapsed state and its label.
- Auto-approved rows are marked as auto-approved in the platform-admin reviewed-requests table and show their origin context — "auto-approved via invite from Bravo Company" — rather than looking personally vetted.

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
- **A new platform-admin lever over auto-approved requests.** Deferred; recorded as an exposure below.
- **An "invited account" class that cannot create Organizations.** Rejected as dwarfing the rest of this effort; recorded as an exposure below.

## Guardrails And Exceptions

- **This is a beta-period rule with a defined end.** It applies only while `PUBLIC_BILLING_ENABLED=false`. When billing is enabled, `shouldBridgeAccessRequest` is already false, the bridge stops firing, and this ADR becomes historical without further work.
- **`reviewed_by` on `access_requests` is no longer always a platform admin.** For invite-origin rows it is the inviting organization owner or admin. Do not read it as "a platform admin reviewed this", and do not build platform-admin-only inferences on it. Its one sanctioned read is the reverse test — reviewer equals inviter, therefore auto-approved — which is what marks the reviewed-requests rows. Mere presence of an invitation origin is **not** that test: a platform admin who approves an invite-origin request by hand stays its reviewer, and that row must keep reading as vetted.
- **When more than one origin matches the reviewer, the row is credited to the newest origin that pre-dates `reviewed_at`.** One person can be owner or admin of two Organizations and invite the same address from both; the approving update is `WHERE status = 'pending'`, so only the invite that found the request pending approved it and the later ones leave `reviewed_by` and `reviewed_at` untouched. Crediting the newest matching origin outright would name whichever Organization invited last. `invited_at` and `reviewed_at` come from different clocks, so a lone matching origin is credited without comparing them at all, and an undecidable comparison falls back to the oldest match.
- **The equality test has one known blind spot**, accepted rather than closed: when the same human is both a platform admin and the inviting organization owner, a request they approve by hand and then invite reads as auto-approved. `approveInvitedAccessRequest` is `WHERE status = 'pending'`, so reusing an already-approved row leaves the hand-approval's `reviewed_by` in place, and it equals the inviter. Distinguishing the two would need a persisted origin column on `access_requests`, which is more than a visibility aid warrants during the beta period. The misreading names the one person who did both things, so it misattributes nothing.
- **`approve()` keeps its meaning.** Do not add bypass flags, actor-type parameters, or origin branches to it. New issuers compose `accountSetupLinkIssuance` instead.
- **`origin` never gates behaviour.** If a future caller needs different fatality, it maps the result at its own call site. Four `switch`es across an admin console, an invite flow, and two anonymous public forms is correct: response policy is exactly what differs between them.
- **Organization-scoped surfaces read platform-owned state only through narrow, purpose-built service-role ports** that return the minimum shape the surface needs — not through RLS grants on platform tables, and not through denormalised mirrors. This is the first such port; it is a documented exception to the RLS-client default in ADR 0011, not a general licence for organization code to reach platform data.
- **Wire that port in `httpAdapter.ts` from `getAdminClient`, following `signInRosterPersonnelLookup`.** A route that builds it locally becomes route-level admin-provider usage and requires a `routeAdminProviderAllowlist` entry in `GOVERNANCE_BASELINE.json`. Keep it in the adapter and the baseline needs no entry.
- **Do not surface a copyable `/auth/renew-invite` URL on an organization admin screen.** The route is public and rate-limited, so it grants no new capability, but it is a form the invitee submits about their own address.
- **Resend stays enabled in every state**, including _Setup email didn't reach them_. It is insufficient there, not futile — the copy carries that.
- Everything ADR 0009 says about token hashing, one active link per request, 14-day expiry, 90-day renewal eligibility, and identity creation only after password entry applies unchanged to invite-origin issuance.

### Accepted exposures

Three, all deliberate:

1. **Auto-approval transitively grants Organization creation.** `/org/new` is gated only on email confirmation, so an invited person can provision their own Organization. Consistent with the retained vouching basis; billing does not change reviewed acquisition.
2. **No rescind lever between auto-approval and setup completion.** `reject` stays pending-only and `'manual'` setup-link revocation stays unimplemented, so an invite-origin request cannot have its platform access withdrawn once auto-approved. Noticing is the only tool, which is why the reviewed-requests table must mark these rows. Tracked as drift `D-10`.
3. **Account existence is inferable from the members screen.** Invite an address; a _setup_ state means no account existed, `Waiting on them to accept` immediately means one did. Probing costs a real invitation email to the target — rate-limited, audited, `notifyAdmins` fires org-wide, and the person probed receives mail. That is a loud, slow, attributable way to learn one bit that leaks through the invitee's own behaviour anyway. Closing it would mean collapsing the screen's two most actionable labels into one.

Exposure 3 is a genuinely new disclosure, not a widening of an existing one: today the only platform-access fact an organization admin learns is the terminal `blocked` history detail.

## Consequences

- Expected benefits:
  - An organization owner invites someone and that person can start working immediately. No platform-admin action in the path.
  - Credential creation, delivery, and audit live in one module instead of four hand-rolled copies, and the raw token has one fewer place to leak from.
  - The members screen tells an organization admin which of the two emails failed, which is the difference between a useful Resend and a decorative one.
  - The change self-retires on the billing switch rather than needing removal.
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
- Stabilization retains this ADR independently of billing. Close `D-10` only after the separately owned 11-01/F01 repair is verified.

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
