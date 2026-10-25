# Platform access, accounts and Organizations

The platform operator investigates accounts, Organization membership and reviewed access, suspends targets and
transfers Organization ownership, without granting ordinary users platform authority. One operator row replaces the old
roles; the admin is entered only at MFA level aal2.

## Sub-features

- `admission`: the operator at aal2 enters Users, Organizations and Access Requests; an operator at aal1 is sent to MFA;
  any other signed-in account is refused.
- `directory`: search, paging, account and Organization detail, current membership, setup/activation and suspension
  state.
- `reviewed-access`: pending approval/rejection, rescind of approved incomplete access, invitation origin and approval
  basis, blocked linked invitations, setup delivery/replacement and completed-setup protection.
- `administration`: operator suspension/recovery with MFA step-up, the disabled own-account Suspend, confirmed ownership
  transfer and denial without mutation.
- `recovery`: retained drafts, failed requests, explicit retry, persistence and correct target after navigation.

## How to get to it (user POV)

Sign in as the platform operator, enter the authenticator code and open Admin. Choose Users, Organizations or Access
Requests in the sidebar. Search the directory and follow a record link to inspect its detail. The operator uses
Suspend/Unsuspend (in `More User controls` and `More Organization controls`) and Transfer Ownership. A suspension asks
for the authenticator code again when the last one is older than 10 minutes, then returns to the same page. On the
operator's own account Suspend is disabled and says why.

## Helper controls

Platform administration uses the [access/account/Organization recipe](platform-administration.md), the `platformReviewer`
operator (aal2 by default, `--aal1` and `--stale-mfa` for the MFA states in
[platform admin states](platform-admin-states.md)) and the `platformSupport`, `platformBilling` and `platformInactive`
denial actors, which hold no operator row. `actor` accepts
`admin/users`, `admin/organizations` and `admin/access-requests`. `seed platform-admin` records temporary review/origin
and Organization membership witnesses before writes; `platform-state` returns exact recorded rows without setup secrets.
`platform-request` sends bounded ordinary same-origin actions; its families/target keys and separate HTTP boundary are
documented in the recipe. `network arm-fail|arm-hold|arm-observe PAGE admin-suspend` matches only `/admin/api/suspend`
POST. `admin-search` observes/holds the actual `/admin/api/search` response for query lifetime proof.
`network arm-drop PAGE admin-suspend|admin-transfer` dispatches the real scoped request, records its actual transport
status, then rejects the browser response to prove unconfirmed-save reconciliation; it does not establish an actual
provider outage. Transfer controls bind the recorded temporary Organization and exact transfer action, leaving other
Organizations/actions untouched. A 503/lost reply requires a fresh authoritative read before any new explicit
confirmation; observing the current state does not identify who changed it. Restore User suspension visibly before
`clean-seeds`; cleanup refuses remaining suspensions and verifies tracked dependent absence.

## Driving it with verify:app

Reuse `platformReviewer` (the only operator, enrolled with a verified authenticator), ordinary `viewer` and `orgOwner`;
`platformSupport`, `platformBilling` and `platformInactive` have no operator row.
`$V actor ROLE admin/users|admin/organizations|admin/access-requests` signs the operator in at aal2 through the provider
and accepts denial as an observable outcome for every other role, without changing authority.

Run `$V seed platform-admin` once. It creates a temporary Organization, three memberships for
`orgCreator`/`orgInvitee`/`orgMember`, two pending requests, a completed approved request and one unconfirmed account
`platform-pending-TAG@example.test` (`pendingUser`), the only account whose User detail offers Resend Invite. The
rejection request has a real pending Organization invitation and recorded origin. `$V platform-state` reads only these
recorded targets and public fixture User IDs/emails, exact roles, suspension records, review/setup/delivery metadata and
Organization audit references. It omits setup tokens and delivery payloads.

1. **Admission and investigation.** As the operator, capture the sidebar, Users and Organizations directories,
   search/paging and a temporary Organization detail. Open the recorded `orgInvitee` account through its visible record
   link. Reload and inspect membership and suspension. Repeat all three starting destinations as ordinary `viewer`,
   `platformSupport`, `platformBilling` and `platformInactive`: preserve actual denial/redirect and ordinary page-data
   responses, which must disclose no directory or request records. Then `$V actor --aal1 platformReviewer admin/users`
   must land on `Enter your code` with the Users path in `next`, and entering the code
   (`$V mfa-code PAGE platformReviewer "Verification Code"`) must land on Users. Platform navigation does not follow
   active Organization authority.
2. **Search lifetime.** Use the visible global search for the unique temporary Organization name and account email.
   Clear with native Control+A/Backspace, or shorten the query, while a real search response is held with
   `$V network arm-hold PAGE admin-search`, then release it; results must remain consistent with the current input. An
   empty-value fill control may change the visible value without the effective input transition; preserve that control
   limitation and use actual keyboard clearing for the accepted user action. Source inspection alone is not
   stale-response proof.
3. **Reviewed access.** As the operator, capture both pending names and the linked invitation origin. Reject the linked
   request via its visible button; reload and compare request `rejected`, linked invitation `blocked` and unchanged
   membership. Approve the other pending request; preserve the actual setup/delivery status and reload. Setup mail is
   delivered to the private sink by default; arm `$V mail fail setup` before Approve or Resend to observe the
   delivery-failed state. Approval must not masquerade as completed account setup or accepted Organization membership.
   Resend creates a replacement link while preserving the request and truthful delivery state. Then press that request's
   `Rescind`; reload and require the `Rescinded` badge with
   `Platform access was rescinded before account setup finished`, no further actions, and `platform-state` showing
   `rescinded`, the kept `approval_basis` and its unused setup link revoked `manual`. The rejection request's pattern
   applies to any linked pending invitation, which becomes `blocked`. The completed request offers neither another setup
   link nor Rescind. A held claim refuses Rescind with `A setup attempt holds a claim on this request`, leaving the
   request approved. An invitation approval whose invitations were all revoked or blocked shows `Invitation withdrawn`
   with Rescind and no setup send; [Organization invitations](organization-invitations.md#invitation-grant-liveness)
   produces that state through real invites. Capture normal step-up if requested, actual failures/rate limits and
   unchanged denied targets. This journey proves the administrator caller only; setup completion and claim concurrency
   need separate evidence.
4. **Non-operator write denial.** From normally signed-in `platformSupport` and ordinary pages,
   `$V platform-request PAGE suspend organization '{"type":"org","action":"suspend","reason":"Synthetic reason"}'`, or the ownership request below,
   submit bounded ordinary HTTP and capture 403 plus unchanged `$V platform-state`. A visible button or missing button
   is not server proof. As the operator, `$V platform-request PAGE suspend platformReviewer '{"type":"user","action":"suspend"}'`
   must be refused with no `user_suspensions` row for the operator, whatever the page shows.
5. **Suspension and retry.** Start with `$V actor --stale-mfa platformReviewer admin/organizations` and press `Suspend`
   once on the temporary Organization: the dialog says `Nothing has been changed yet.`, the browser lands on
   `Enter your code` with the Organization's path in `next`, and `platform-state` shows no suspension. Enter the code with
   `mfa-code`; the page returns to the Organization and Suspend now succeeds, with its audit row in Activity. For every
   later case below use `$V actor platformReviewer ...` (a fresh aal2 session). As the operator, open the temporary Organization's Suspend dialog from
   `More Organization controls`. `Suspend` stays disabled until a reason is typed. Fill a unique reason; `$V network arm-fail PAGE admin-suspend` fails one exact POST
   before provider dispatch. Submit visibly: keep the dialog/reason, show failure, and leave rows unchanged. A
   503/transport/unreadable outcome requires Reload details before another write; preserve the draft through that read,
   and explicitly confirm again only after verified no-effect/current authority. Record real success, refreshed detail
   and persisted suspension after reload plus the actual affected Organization access outcome. An ordinary owner already
   on Settings must reload into the canonical Organization home suspension notice, rather than a nonexistent
   `/suspended` child route; cover Settings index and a nested section. Unsuspend visibly and verify Settings recovery.
   Repeat with `orgInvitee` account, inspecting `user_suspensions` and normal sign-in denial/recovery. The refreshed
   User detail must offer Unsuspend immediately; no hard reload is required to correct its visible state. An
   acknowledged save with failed refresh offers Reload details instead of repeating the mutation. A failed suspension
   read must never become a verified unsuspended state. Use `$V network arm-drop PAGE admin-suspend` for a real
   dispatched save whose response is deliberately lost. Preserve real status/provider persistence plus the read-only
   dialog, then Reload details: current suspended truth closes quietly without announcing inferred operation success or
   a second write. Navigate to another record or route while a response is held and verify the old completion cannot
   refresh or announce the new target, including disposal and A→B→A. Restore every network hook; do not silently repair
   original fixture User suspension with privileged setup.
6. **Ownership.** Organization member promotion is gone: `?/makeAdmin` answers 404 as no action. Attempt transfer to `orgInvitee` with an incorrect name
   through the action control, proving no effect; the visible confirmation requires the exact untrimmed Organization
   name. Native exact-name transfer must decode the action result and refresh the actual owner. HTTP 200/action failure
   is failure and retains its draft; preserve actual Identity step-up fields. Expected success preserves exactly one
   owner, stable membership IDs and canonical editor/empty-overrides/Organization scope fields for elevated roles,
   exposed by `platform-state`. Exercise affected [ordinary Member settings](organization-member-access.md) and the
   [owner's Danger transfer journey](organization-settings-destruction.md), with normal sign-in as the current synthetic
   owner. Restore ownership through the same UI. A transfer with uncertain provider/transport outcome remains read-only
   until fresh owner/target facts establish whether a new explicit confirmation is safe.
   `network arm-drop PAGE admin-transfer` loses the real temporary-Organization action response after dispatch; require
   exactly one saved transfer, no second write, and fresh owner read that closes quietly. Readback observing the
   requested state is current truth, not an inferred success event. Ordinary update/removal must use the looked-up
   nonowner role and acknowledge its exact ID; a target becoming owner cannot be overwritten or removed by a pending
   command.

7. **Suspend an Organization.** As `platformReviewer` (a fresh aal2 session from `$V actor platformReviewer
admin/organizations`), open `Organizations`, search the unique temporary Organization name and press its link. Capture
   the status badge `Active`, the facts block, the member rows and `Recent activity`. Open `More Organization controls`
   and `Suspend`: the dialog's `Reason` is required and `Suspend` is disabled while it is empty or only spaces. Type a
   unique reason and `Suspend`. Require the dialog to close, the destructive `This Organization is suspended.` alert to
   show exactly that reason with the date and `operator` email, the badge and `Status` to read `Suspended`, and
   `More Organization controls` to offer `Unsuspend`. Reload and read the same alert. `$V platform-state` shows
   `suspended_at` set, and `rows` on `organization_suspensions` shows the reason and `platformReviewer` as
   `suspended_by`. Open `Organizations`: the row reads `Suspended` and `Suspended` in `Show` lists it. The Platform
   audit entry for the suspension carries the same reason in its details. Then sign in as the Organization's owner and
   require the suspension notice, not the reason. Unsuspend visibly and require the alert gone and the
   `organization_suspensions` row removed. Repeat once from `$V actor --stale-mfa platformReviewer admin/organizations`
   to prove the step-up: nothing changes until `mfa-code`; the dialog closes after the step-up, so type the reason again.

`platform-request PAGE FAMILY TARGET_KEY JSON` supports `approve|reject|resend` with keys `approve|reject|completed`;
`transferOwnership` with target `organization` and a seeded member UUID (`targetUserId`, plus `confirmName`);
`suspend` for `organization` with `type:org`, or `orgCreator|orgInvitee|orgMember|platformReviewer` with `type:user`
(`platformReviewer` is the server's self-suspension refusal control), and `action`/`reason` (required to suspend an Organization, at most 500 characters; optional otherwise); `resetPassword|resendInvite` for those User keys. It sends one ordinary same-origin POST,
returns the full transport/action envelope and never applies it to the UI. `invalidSuspension` with a recorded User key
accepts only `case:null-body|non-string-reason|array-target`; it sends that fixed malformed JSON, requiring 400 and
unchanged suspension/audit rows. This is separate ordinary HTTP validation proof; no textarea can create these payloads.
It grants no privilege and targets no arbitrary IDs. Label these direct action/API observations separately from native
interaction.

Account and review response lifetime uses
`network arm-hold|arm-fail|arm-hold-fail|arm-observe PAGE admin-account/orgInvitee/resetPassword` (also
`orgCreator|orgMember|pendingUser` and `resendInvite`) or `admin-access/approve/approve` (recorded keys
`approve|reject|completed`, actions `approve|reject|resend`). These controls bind the exact User/action or recorded
Access Request form ID. A different request, action or User remains untouched. Hold a real account-support reply,
navigate through a visible User link or Back, then release: the old result must not apply feedback or busy state to the
new page. A failed account refresh must release its busy control. For reviewed access, a failed response may follow a
saved approval or setup-link replacement; reread current request/setup state before allowing a new mutation, retain the
actual failure and never automatically resend. Failed rereads keep write controls disabled and offer a read-only Reload
requests action. `network arm-fail|arm-hold|arm-observe PAGE admin-access-read` matches only the same-origin
reviewed-access page-data reread and leaves form POSTs untouched. Preserve the actual framework failure/recovery page if
a failed reread replaces the page; it offers no review mutation. Capture real unconfigured-email outcomes separately
from lower-level successful email-delivery proof. Restore controls before cleanup.

Capture `$V platform-state` alongside each before/after read. After each actual Platform operation on a reused fixture
User, record only its observed audit UUID with `$V platform-audit '["OBSERVED_AUDIT_UUID"]'`. The control validates a
current Platform User event and persists that explicit ID before cleanup. Never record unrelated history merely because
its User or action matches. Cleanup discovers events on the unique temporary Organization/requests, but deletes
reused-User events only from this explicit ledger; other User history is retained until the entire owned environment is
disposed. `clean-seeds` refuses any remaining seeded User suspension; restore it visibly first. It removes only recorded
requests and the temporary Organization, checks dependent absence before dropping its ledger, and reports final rows.

## Gotchas

- The owned app delivers setup email to a private synthetic mail sink (`mail state`, `mail fail`; see
  [Organization invitations](organization-invitations.md)), so an unconfigured-delivery outcome is unreachable and a
  delivery failure needs `mail fail`. Approval, link issuance, outbox delivery, setup completion and invitation
  acceptance are different effects; capture the actual state.
- Only the operator can use any admin page or endpoint. There is no role to check, no inactive row and no support or
  billing tier; a non-operator gets 403 and an operator at aal1 is sent to MFA. Suspend and unsuspend need an MFA
  verification from the last 10 minutes, and refresh or password sign-in does not renew it.
- User suspension uses `user_suspensions`, not provider bans. Organization suspension uses `organizations.suspended_at`
  and keeps its reason, operator and time in `organization_suspensions`, which only the service role reads, so members
  never see the reason. An Organization suspended before reasons were kept shows `No reason recorded`;
  preserve the actual restricted shell and denial of writes. Both suspensions also deny page data loads and members'
  direct table and Storage access, while the Organization row and own membership stay readable for the shell.
  `organization_suspension_rls.sql` owns the direct SQL proof.
- Provider/SQL failures and concurrent transfer guarantees need separate lower-level proof. The owned app's fresh chain
  is not a substitute for an affected isolated SQL contract run.
