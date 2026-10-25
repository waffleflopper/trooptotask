# Platform access, accounts and Organizations

The platform operator investigates accounts, Organization membership and reviewed access, suspends targets and transfers
Organization ownership, without granting ordinary users platform authority. One operator row replaces the old roles; the
admin is entered only at MFA level aal2.

## Sub-features

- `admission`: the operator at aal2 enters the Inbox, People and Organizations; an operator at aal1 is sent to MFA; any
  other signed-in account is refused.
- `directory`: the People list (search, All / Not set up / Suspended, paging), the person page, the Not set up person
  page, Organization detail, current membership, setup/activation and suspension state.
- `reviewed-access`: pending approval/rejection (decided in the Inbox, see [Platform Inbox](platform-inbox.md)), blocked
  linked invitations and setup delivery. A bounced or expired setup email is resent, rescinded or raised with the
  inviter from the Inbox or the Not set up person page.
- `administration`: operator suspension/recovery with MFA step-up, the disabled own-account Suspend, confirmed ownership
  transfer and denial without mutation.
- `activity`: each platform command writes an event naming the operator's email and the target, which Activity reads as
  a sentence that calls the signed-in operator `You` (the states recipe owns the page itself).
- `recovery`: retained drafts, failed requests, explicit retry, persistence and correct target after navigation.

## How to get to it (user POV)

Sign in as the platform operator, enter the authenticator code and open Admin. Choose People or Organizations in the
sidebar; access requests are decided in the Inbox. Search People and follow a name to open the person page. The operator
uses `Send password reset` and `Suspend account` on a person, and `Suspend organization` and Transfer ownership on an
Organization page. A suspension asks for the authenticator code again when the last one is older than 10 minutes, then
returns to the same page. On the operator's own account Suspend is disabled and says why.

## Helper controls

Platform administration uses the [access/account/Organization recipe](platform-administration.md), the
`platformReviewer` operator (aal2 by default, `--aal1` and `--stale-mfa` for the MFA states in
[platform admin states](platform-admin-states.md)) and the `platformSupport`, `platformBilling` and `platformInactive`
denial actors, which hold no operator row. `actor` accepts `admin`, `admin/people`, `admin/organizations` and
`admin/activity` (`admin/access-requests`, `admin/feedback` and `admin/users` redirect). `setup-bounce`, `setup-expire`
and `setup-state` arrange and read setup-email facts (see [Platform Inbox](platform-inbox.md)). `seed platform-admin`
records temporary review/origin and Organization membership witnesses before writes; `platform-state` returns exact
recorded rows without setup secrets. `platform-request` sends bounded ordinary same-origin actions; its families/target
keys and separate HTTP boundary are documented in the recipe. `network arm-fail|arm-hold|arm-observe PAGE admin-suspend`
matches only `/admin/api/suspend` POST. `admin-search` observes/holds the actual `/admin/api/search` response for query
lifetime proof, and `admin-activity` does the same for the `/admin/api/activity` read.
`network arm-drop PAGE admin-suspend|admin-transfer` dispatches the real scoped request, records its actual transport
status, then rejects the browser response to prove unconfirmed-save reconciliation; it does not establish an actual
provider outage. Transfer controls bind the recorded temporary Organization and exact transfer action, leaving other
Organizations/actions untouched. A 503/lost reply requires a fresh authoritative read before any new explicit
confirmation; observing the current state does not identify who changed it. Restore User suspension visibly before
`clean-seeds`; cleanup refuses remaining suspensions and verifies tracked dependent absence.

## Driving it with verify:app

Reuse `platformReviewer` (the only operator, enrolled with a verified authenticator), ordinary `viewer` and `orgOwner`;
`platformSupport`, `platformBilling` and `platformInactive` have no operator row.
`$V actor ROLE admin|admin/people|admin/organizations|admin/activity` signs the operator in at aal2 through the provider
and accepts denial as an observable outcome for every other role, without changing authority.

Run `$V seed platform-admin` once. It creates a temporary Organization, three memberships for
`orgCreator`/`orgInvitee`/`orgMember`, two pending requests, a completed approved request and one unconfirmed account
`platform-pending-TAG@example.test` (`pendingUser`). The rejection request has a real pending Organization invitation
and recorded origin. `$V platform-state` reads only these recorded targets and public fixture User IDs/emails, exact
roles, suspension records, review/setup/delivery metadata and Organization audit references. It omits setup tokens and
delivery payloads.

1. **Admission and investigation.** As the operator, capture the sidebar, People and Organizations directories,
   search/paging and a temporary Organization detail. Open the recorded `orgInvitee` account through its visible record
   link. Reload and inspect membership and suspension. Repeat all three starting destinations as ordinary `viewer`,
   `platformSupport`, `platformBilling` and `platformInactive`: preserve actual denial/redirect and ordinary page-data
   responses, which must disclose no directory or request records. Then `$V actor --aal1 platformReviewer admin/people`
   must land on `Enter your code` with the People path in `next`, and entering the code
   (`$V mfa-code PAGE platformReviewer "Verification Code"`) must land on People. Platform navigation does not follow
   active Organization authority.
2. **Search lifetime.** Use the visible global search for the unique temporary Organization name and account email.
   Clear with native Control+A/Backspace, or shorten the query, while a real search response is held with
   `$V network arm-hold PAGE admin-search`, then release it; results must remain consistent with the current input. An
   empty-value fill control may change the visible value without the effective input transition; preserve that control
   limitation and use actual keyboard clearing for the accepted user action. Source inspection alone is not
   stale-response proof.
3. **Reviewed access.** Approve and reject journeys, their setup mail, blocked linked invitation and audit rows are
   owned by [Platform Inbox](platform-inbox.md). Setup mail is delivered to the private sink by default; arm
   `$V mail fail setup` before Approve to observe the delivery-failed state. Approval must not masquerade as completed
   account setup or accepted Organization membership. The seeded completed request has no review time, so it appears in
   neither Open nor Done. Resend setup link and Rescind access run from the Inbox (step 9 there) and from the Not set up
   person page (step 8 below).
4. **Non-operator write denial.** From normally signed-in `platformSupport` and ordinary pages,
   `$V platform-request PAGE suspend organization '{"type":"org","action":"suspend","reason":"Synthetic reason"}'`, or
   the ownership request below, submit bounded ordinary HTTP and capture 403 plus unchanged `$V platform-state`. A
   visible button or missing button is not server proof. As the operator,
   `$V platform-request PAGE suspend platformReviewer '{"type":"user","action":"suspend"}'` must be refused with no
   `user_suspensions` row for the operator, whatever the page shows.
5. **Suspension and retry.** Start with `$V actor --stale-mfa platformReviewer admin/organizations` and press
   `Suspend organization` once on the temporary Organization: the dialog says `Nothing has been changed yet.`, the
   browser lands on `Enter your code` with the Organization's path in `next`, and `platform-state` shows no suspension.
   Enter the code with `mfa-code`; the page returns to the Organization and Suspend now succeeds, with its event in
   Activity: open `$V actor platformReviewer admin/activity`, and the newest row reads
   `You suspended <Organization name>`. An Organization's owners can read their own audit rows, so the typed reason is
   not stored in Organization audit details. Activity joins the current private suspension note at read time and shows
   `Reason: <typed reason>` below the sentence; the operator email is also looked up when read. Lifted and older
   suspensions have no retained reason, and must not inherit a later suspension's note. For
   every later case below use `$V actor platformReviewer ...` (a fresh aal2 session). As the operator, open the
   temporary Organization's Suspend dialog from `Suspend organization` in the page header. `Suspend` stays disabled
   until a reason is typed. Fill a unique reason; `$V network arm-fail PAGE admin-suspend` fails one exact POST before
   provider dispatch. Submit visibly: keep the dialog/reason, show failure, and leave rows unchanged. A
   503/transport/unreadable outcome requires Reload details before another write; preserve the draft through that read,
   and explicitly confirm again only after verified no-effect/current authority. Record real success, refreshed detail
   and persisted suspension after reload plus the actual affected Organization access outcome. An ordinary owner already
   on Settings must reload into the canonical Organization home suspension notice, rather than a nonexistent
   `/suspended` child route; cover Settings index and a nested section. Unsuspend visibly and verify Settings recovery.
   Repeat with the `orgInvitee` person page, inspecting `user_suspensions` and normal sign-in denial/recovery. The
   refreshed person page must offer `Unsuspend account` immediately; no hard reload is required to correct its visible
   state. An acknowledged save with failed refresh offers Reload details instead of repeating the mutation. A failed
   suspension read must never become a verified unsuspended state. Use `$V network arm-drop PAGE admin-suspend` for a
   real dispatched save whose response is deliberately lost. Preserve real status/provider persistence plus the
   read-only dialog, then Reload details: current suspended truth closes quietly without announcing inferred operation
   success or a second write. Navigate to another record or route while a response is held and verify the old completion
   cannot refresh or announce the new target, including disposal and A→B→A. Restore every network hook; do not silently
   repair original fixture User suspension with privileged setup.
6. **Ownership.** Organization member promotion is gone: `?/makeAdmin` answers 404 as no action. Attempt transfer to
   `orgInvitee` with an incorrect name through the action control, proving no effect; the visible confirmation requires
   the exact untrimmed Organization name. Native exact-name transfer must decode the action result and refresh the
   actual owner. HTTP 200/action failure is failure and retains its draft; preserve actual Identity step-up fields.
   Expected success preserves exactly one owner, stable membership IDs and canonical editor/empty-overrides/Organization
   scope fields for elevated roles, exposed by `platform-state`. Exercise affected
   [ordinary Member settings](organization-member-access.md) and the
   [owner's Danger transfer journey](organization-settings-destruction.md), with normal sign-in as the current synthetic
   owner. Restore ownership through the same UI. A transfer with uncertain provider/transport outcome remains read-only
   until fresh owner/target facts establish whether a new explicit confirmation is safe.
   `network arm-drop PAGE admin-transfer` loses the real temporary-Organization action response after dispatch; require
   exactly one saved transfer, no second write, and fresh owner read that closes quietly. Readback observing the
   requested state is current truth, not an inferred success event. Ordinary update/removal must use the looked-up
   nonowner role and acknowledge its exact ID; a target becoming owner cannot be overwritten or removed by a pending
   command.
7. **People.** As the operator open `$V actor platformReviewer admin/people`. Approve the `approve` request in the Inbox
   first so it is a Not set up person. Search part of `orgInvitee`'s email and a name: the list filters on the server
   and the URL keeps `search`; the `Not set up` filter lists only the approved request with `None yet` Organizations and
   the state `Not set up`; `Suspended` lists suspended accounts. Open `orgInvitee` through its name. The person page
   shows the Organizations and roles sentence under the name, `Organizations`, `Access history`, `Recent activity`
   (sentences, newest first, `Open in Activity →`) and the `Account` facts (email, last sign-in, MFA On or Off, signed
   up, ID). `Send password reset` shows a confirmation and `mail state` holds one `auth` message; the audit holds
   `admin.user.password_reset`. On the operator's own page (`platformReviewer` from `$V fixture`) `Suspend account` is
   disabled and `You cannot suspend your own account.` is visible beside it.
8. **Not set up person.** Open the approved request's person page from the list. Expected: eyebrow
   `Person · Not set up · Closed beta`, the request quote, the setup timeline, `Link expires` from the live link,
   `Resend setup link` and `Rescind access`. Resend shows `A new setup link was sent.` and the timeline gains the new
   send; Rescind confirms, then leaves for the `Not set up` list, where the person is gone. The old `/admin/users` and
   `/admin/users/ID` URLs answer 308 to People and to the person page.

9. **Suspend an Organization.** As `platformReviewer` (a fresh aal2 session from
   `$V actor platformReviewer admin/organizations`), open `Organizations`, search the unique temporary Organization name
   and press its link. Capture the status badge `Active`, the `At a glance` card, the member rows and `Recent activity`.
   Press `Suspend organization` in the header: the dialog's `Reason` is required and `Suspend` is disabled while it is
   empty or only spaces. Type a unique reason and `Suspend`. Require the dialog to close, the destructive
   `This Organization is suspended.` alert to show exactly that reason with the date and `operator` email, the badge and
   `Status` to read `Suspended`, and the header button to read `Unsuspend organization`. Reload and read the same alert.
   `$V platform-state` shows `suspended_at` set, and `rows` on `organization_suspensions` shows the reason and
   `platformReviewer` as `suspended_by`. Open `Organizations`: the row reads `Suspended` and `Suspended` in `Show` lists
   it. The Platform audit entry for the suspension must not carry the reason in its details. Open Activity and require
   `You suspended <Organization name>` with `Reason: <typed reason>` below it, including after reload. Then sign in as the
   Organization's owner and require the suspension notice, not the reason. Unsuspend visibly and require the alert gone
   and the `organization_suspensions` row removed. Before the first suspension, open the same Organization in a second
   tab; once the first tab has suspended it, submit `Suspend` with a different reason in the second tab: the dialog
   reads `Another operator already suspended this    organization`, offers only `Reload details`, and the reloaded alert
   still shows the first reason, time and operator. Repeat once from
   `$V actor --stale-mfa platformReviewer admin/organizations` to prove the step-up: nothing changes until `mfa-code`;
   the dialog closes after the step-up, so type the reason again.

`platform-request PAGE FAMILY TARGET_KEY JSON` supports `approve|reject` (`reject` accepts an optional `reason`) with
keys `approve|reject|completed`; `transferOwnership` with target `organization` and a seeded member UUID
(`targetUserId`, plus `confirmName`); `suspend` for `organization` with `type:org`, or
`orgCreator|orgInvitee|orgMember|platformReviewer` with `type:user` (`platformReviewer` is the server's self-suspension
refusal control), and `action`/`reason` (required to suspend an Organization, at most 500 characters; optional
otherwise); `resetPassword` for those User keys. It sends one ordinary same-origin POST, returns the full
transport/action envelope and never applies it to the UI. `invalidSuspension` with a recorded User key accepts only
`case:null-body|non-string-reason|array-target`; it sends that fixed malformed JSON, requiring 400 and unchanged
suspension/audit rows. This is separate ordinary HTTP validation proof; no textarea can create these payloads. It grants
no privilege and targets no arbitrary IDs. Label these direct action/API observations separately from native
interaction.

Account and review response lifetime uses
`network arm-hold|arm-fail|arm-hold-fail|arm-observe PAGE admin-account/orgInvitee/resetPassword` (also
`orgCreator|orgMember`) or `admin-access/approve/approve` (recorded keys `approve|reject|completed`, actions
`approve|reject`), and `admin-request/approve/resendSetup|rescindAccess` and `admin-request-read/approve` for the Not
set up person page. These controls bind the exact User/action or recorded Access Request form ID. A different request,
action or User remains untouched. Hold a real account-support reply, navigate through a visible person link or Back,
then release: the old result must not apply feedback or busy state to the new page. A failed account refresh must
release its busy control. For reviewed access, a failed response may follow a saved approval or setup-link replacement;
reread current request/setup state before allowing a new mutation, retain the actual failure and never automatically
resend. A failed queue reread shows that kind's own `Retry` row and a failed item reread shows `Try again`.
`network arm-fail|arm-hold|arm-observe PAGE admin-inbox-read` matches only the same-origin Inbox page-data reread and
leaves form POSTs untouched. Preserve the actual framework failure/recovery page if a failed reread replaces the page;
it offers no review mutation. Capture real unconfigured-email outcomes separately from lower-level successful
email-delivery proof. Restore controls before cleanup.

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
  never see the reason. An Organization suspended before reasons were kept shows `No reason recorded`; preserve the
  actual restricted shell and denial of writes. Both suspensions also deny page data loads and members' direct table and
  Storage access, while the Organization row and own membership stay readable for the shell.
  `organization_suspension_rls.sql` owns the direct SQL proof.
- Provider/SQL failures and concurrent transfer guarantees need separate lower-level proof. The owned app's fresh chain
  is not a substitute for an affected isolated SQL contract run.
