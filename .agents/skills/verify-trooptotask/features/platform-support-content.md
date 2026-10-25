# Platform announcements and Feedback support

The platform operator publishes global messages, reviews member Feedback. Every other account is refused.

## Sub-features

- `admission`: the operator at aal2 admits the Inbox, Announcements and Activity; every other account, including the
  former support, billing and inactive actors, admits none, and an operator at aal1 is sent to MFA.
- `announcement-lifecycle`: create Info, Warning and Maintenance messages, optional expiration, cancellation,
  activate/deactivate, confirmed deletion, and persisted member banners and account-wide dismissals.
- `feedback-review`: retain submitter/context/message while closing Feedback from the Inbox without a reply, reload and
  recover from failure ([Platform Inbox](platform-inbox.md) owns the journey); replies, staff notes and GitHub issues
  belong to the [Feedback recipe](platform-feedback.md).
- `navigation`: the five-section sidebar and retained search/navigation without widening disclosure.
- `failure-and-lifetime`: definite rejected writes preserve the unsaved choice and permit an explicit retry; unconfirmed
  5xx/transport results block writes until authoritative readback; late results cannot affect another page or record.

## How to get to it (user POV)

Sign in to the internal admin workspace at `/admin`. Use Inbox, Activity and Announcements in its sidebar. Select Create
Announcement in the Announcements controls toolbar, complete its fields and Save. Deactivate or Activate changes its
member visibility. Delete asks for confirmation in an in-app dialog naming the announcement. Open a Feedback item in the
Inbox and choose Close without replying. The global search opens the already owned User and Organization support pages.

## Helper controls

Platform content verification uses the [announcement/Feedback recipe](platform-support-content.md). Existing platform
actors and ordinary `orgMember` may enter `admin` and `admin/announcements` through normal sign-in for admission and
denial. `platform-content` accepts no targets and reads only helper-recorded communications announcements or rows
created by this worker's synthetic operator. It provides privileged persistence readback separately from native
interaction and ordinary authorization. Fixed same-origin form controls `admin-announcements/create|toggle|delete` and
`admin-inbox/close` bind only the named POST action; their failure/hold modes reuse the existing SvelteKit envelopes.
`arm-reject` rejects one scoped request before dispatch. `arm-fail-400` returns the same failure envelope with status
400, a rejected save that leaves its retry open. A 5xx or missing save reply blocks new writes until the visible
read-only Reload succeeds.
`content-request PAGE announcementCreate|announcementToggle|announcementDelete|feedbackClose RECORDED_UUID JSON` submits
bounded ordinary HTTP actions against helper-recorded targets, separately from native UI proof. `admin-inbox-read`,
`admin-users-read`, `admin-organizations-read`, `admin-announcements-read`, `admin-user-detail-read` (`orgInvitee`) and
`admin-organization-detail-read` (the `seed platform-admin` Organization) control only their exact page-data navigation
with failure, hold or observation. `arm-fail` replaces the response with a transport 503, which SvelteKit renders on the
root error page; `arm-load-error` dispatches the real read and returns its page node as a 503 server-load error, which
renders the nearest route error page. Restore hooks, original flags and UI-created announcement rows before owned
cleanup. Run `node --test .agents/skills/verify-trooptotask/helpers/platform-network-target.test.mjs` for target
isolation and explicit retry.

## Driving it with verify:app

`$V actor platformReviewer admin|admin/announcements|admin/activity` signs the operator in at aal2. `platformSupport`,
`platformBilling`, `platformInactive` and `orgMember` attempt the same destinations for the permission matrix. Reuse
[platform administration](platform-administration.md) for search, User and Organization activity,
[communications](notifications-feedback.md) for ordinary Feedback and dismissals, and
[Audit capture](audit-capture-projections.md) for the retained masking and stored-event setup, and
[platform admin states](platform-admin-states.md) for the platform Activity page. These recipes own those expectations.

`$V seed communications` supplies exact active/inactive/expired announcement IDs and member/peer witnesses.
`$V platform-content` reads only those saved announcement IDs and rows created by this worker's synthetic super-admin.
It accepts no supplied target. `$V communications ROLE` reads that synthetic account's Feedback and dismissals. Provider
reads are separate persistence proof, never ordinary authorization proof.

The existing `network` helper supports same-origin form families `admin-announcements/create`,
`admin-announcements/toggle`, `admin-announcements/delete` and `admin-inbox/close`. Each binds the exact route, named
action and POST. `arm-fail` returns one synthetic SvelteKit 503 failure before dispatch, `arm-hold` delays a real
response and `arm-hold-fail` delays a synthetic failure. `admin-inbox-read` binds only its exact page-data path and
supports `arm-fail`, `arm-hold` and `arm-observe`. These are browser transport controls. They establish neither provider
atomicity nor server query-error handling. Restore each hook before another journey or cleanup.

Content form families also support `arm-reject`, which rejects one request before dispatch without an HTTP status. An
unconfirmed save requires authoritative readback before another mutation; use the visible Reload control and verify that
it sends no POST. Keep this transport evidence separate from provider rejection.
`$V content-request PAGE announcementCreate|announcementToggle|announcementDelete|feedbackClose RECORDED_UUID JSON`
sends ordinary authenticated same-origin form requests without applying the reply to UI. Announcement targets must be
current communications seeds or rows saved by this worker's reviewer; Feedback targets must belong to this worker's
synthetic accounts. Target IDs cannot be overridden in JSON. Use exact saved IDs to prove denied
create/toggle/delete/close requests preserve rows, separately from native controls. `announcementToggle` accepts only
`{"isActive":"true"|"false"}`, the desired state the native form posts; the recorded target `id` is added by the helper.
`platform-content` includes saved `updated_by` for actor attribution.

1. **Admission and disclosure.** Capture the operator's navigation. Directly attempt each URL as `platformSupport`,
   `platformBilling`, `platformInactive` and `orgMember` with normal login and inspect the ordinary authenticated
   page-data response. A forbidden page returns no privileged payload. Repeat User/Organization detail readbacks under
   the existing administration recipe. Anonymous attempts require authentication.
2. **Announcements and member composition.** Capture the seed readback and admin statuses. Cancel a filled create form
   and verify no row. Create a unique message through native fields, inspect its exact saved actor/type/text/expiration,
   reload and read it as an ordinary member banner. Exercise all three Types, one future expiry and one expired record.
   Capture Deactivate/Activate and reload/member visibility. Dismiss a live message as one account, reload and inspect
   peer/account-switch independence under communications. Cancel Delete and prove retention; confirm Delete and prove
   row/banner absence. Restore seeded active flags and delete UI-created announcements through the visible controls
   before cleanup.
3. **Announcement failure and lifetime.** Arm create failure, submit a unique draft, then capture the failure, editable
   retained fields, blocked Save and no stored row. Use Reload Announcements to read the current state without a POST,
   then explicitly retry and require one row. Repeat toggle/delete failure against a recorded witness, requiring
   unchanged provider state, readback before retry and exactly one retried write. Hold a real or failed create reply,
   cancel/reopen its editor or use a visible sidebar link, then return to Announcements and fill a fresh unsent draft
   before release. Compare the current page before and after releasing the old reply. Old completions must not change
   another page's pending state, error or current draft, including after returning to the original route. A successful
   old-editor write still refreshes saved content on the current page. Other mutations remain disabled while a write or
   its readback is pending. Capture any failure as a defect rather than adopting it as intended behavior.
4. **Feedback review and persistence.** Submit a unique Bug Report through the ordinary member modal. The operator opens
   it in the Inbox and closes it without replying; reload, choose Done and inspect exact saved context and message. A
   controlled failure (`admin-inbox/close`) keeps the item open and produces no stored change; a 5xx or rejected
   transport tells the operator to reload before another attempt. Ordinary and non-operator writes are denied without
   changing the row; test known-ID form submission separately from native proof.
5. **Activity.** The platform Activity page and its recovery are covered in
   [platform admin states](platform-admin-states.md). The Inbox must not inherit the full Activity details.
6. **Retained search.** Exercise a representative search result and return through visible links under the
   administration recipe. Record an `admin-inbox-read` failed navigation and successful retry.

## Gotchas

- Global announcements and account dismissals differ from Organization-scoped private communications. An Organization
  role grants no platform privilege.
- Announcement audit events and real Feedback submission establish their own producer effects.
- Announcements have create, toggle and delete controls, with no editing form. Feedback has no delete control; replies
  and issues are in the [Feedback recipe](platform-feedback.md). Do not invent a delete journey for either.
- Synthetic 503s exercise browser response handling. Provider list errors must remain distinct from a genuine empty
  list. Prove first/later-page failures and tied-date completeness at the real SDK/provider boundary; browser faults
  alone cannot establish those contracts.
