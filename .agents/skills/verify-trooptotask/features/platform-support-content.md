# Platform announcements, What's New, Feedback and Audit support

The platform operator publishes global banners and What's New entries, reviews member Feedback and investigates saved
activity. Every other account is refused.

## Sub-features

- `admission`: the operator at aal2 admits Dashboard, Announcements, Feedback and full Audit; every other account,
  including the former support, billing and inactive actors, admits none, and an operator at aal1 is sent to MFA.
- `announcement-lifecycle`: create Info, Warning and Maintenance banners with a live preview, optional expiration,
  cancellation, activate/deactivate, confirmed deletion, a per-banner dismissal count, and persisted member banners and
  account-wide dismissals.
- `whats-new-publishing`: draft, reorder paragraphs, save, publish and delete a What's New entry; drafts stay invisible,
  the newest three published entries fill the member dialog, and every published entry is on the all-updates page.
- `feedback-review`: retain submitter/context/message while changing New, Reviewed and Resolved status, save or clear
  internal Notes, reload and recover from failure.
- `audit-investigation`: server pages of 50, action/severity/Organization filters, details, masking and reduced
  Dashboard activity.
- `dashboard-and-navigation`: current platform counts, pending Feedback, recent activity and retained search/navigation
  without widening disclosure.
- `failure-and-lifetime`: definite rejected writes preserve the unsaved choice and permit an explicit retry; unconfirmed
  5xx/transport results block writes until authoritative readback; late results cannot affect another page or record.

## How to get to it (user POV)

Sign in to the internal admin workspace at `/admin`. Use Dashboard, Feedback, Audit Log and Announcements in its
sidebar. Announcements has two tabs, Banners and What's New. On Banners, complete the New banner composer (Title,
Message, Type, Ends) above its live preview and choose Publish to all users. Turn off or Turn on changes a banner's
member visibility, and Live now and Ended list the banners. Delete asks for confirmation in an in-app dialog naming the
banner. Each banner reads how many accounts dismissed it. On What's New, New Entry or a list row opens the editor
(`?entry=` in the address); Save Draft keeps it hidden, Publish shows it to members and a draft offers Delete Draft.
Members open What's new from the account menu, which shows the newest three published entries and a See all updates link
to `/org/<organization>/whats-new`. Expand a Feedback card to change Status or Admin Notes, then choose Save Notes.
Audit Log provides Action and Severity controls, Previous/Next pages and View details. The global search opens the
already owned User and Organization support pages.

## Helper controls

Platform content verification uses the [announcement/Feedback/Audit recipe](platform-support-content.md). Existing
platform actors and ordinary `orgMember` may enter `admin`, `admin/announcements` and `admin/announcements/whats-new`
through normal sign-in for admission and denial. `platform-content` accepts no targets and reads only helper-recorded
communications announcements or rows created by this worker's synthetic operator. It provides privileged persistence
readback separately from native interaction and ordinary authorization. Fixed same-origin form controls
`admin-announcements/create|toggle|delete`, `admin-whats-new/save|delete` and `admin-feedback/update` bind only the
named POST action; their failure/hold modes reuse the existing SvelteKit envelopes. `arm-reject` rejects one scoped
request before dispatch. `arm-fail-400` returns the same failure envelope with status 400, a rejected save that leaves
its retry open. A 5xx or missing save reply blocks new writes until the visible read-only Reload succeeds.
`content-request PAGE announcementCreate|announcementToggle|announcementDelete|feedbackUpdate RECORDED_UUID JSON`
submits bounded ordinary HTTP actions against helper-recorded targets, separately from native UI proof.
`admin-audit-read`, `admin-dashboard-read`, `admin-users-read`, `admin-organizations-read`, `admin-feedback-read`,
`admin-announcements-read`, `admin-whats-new-read`, `admin-user-detail-read` (`orgInvitee`) and
`admin-organization-detail-read` (the `seed platform-admin` Organization) control only their exact page-data navigation
with failure, hold or observation. `arm-fail` replaces the response with a transport 503, which SvelteKit renders on the
root error page; `arm-load-error` dispatches the real read and returns its page node as a 503 server-load error, which
renders the nearest route error page. `arm-hold-regions` sends the page node at once and withholds every streamed region
until `release`, so the Banners, dismissal-count, entry-list and member What's new skeletons stay on screen;
`arm-fail-regions` rejects each streamed region of the selected read, so each region shows its own load error while the
rest of the page stays usable. Both accept `admin-announcements-read`, `admin-whats-new-read` and `org-page/whats-new`
(the member all-updates page, resolved against the `orgA` Organization). Restore hooks, original flags and UI-created
announcement rows before owned cleanup. Run
`node --test .agents/skills/verify-trooptotask/helpers/platform-network-target.test.mjs` for target isolation and
explicit retry.

## Driving it with verify:app

`$V actor platformReviewer admin|admin/announcements|admin/feedback|admin/audit` signs the operator in at aal2.
`platformSupport`, `platformBilling`, `platformInactive` and `orgMember` attempt the same destinations for the
permission matrix. Reuse [platform administration](platform-administration.md) for search, User and Organization
activity, [communications](notifications-feedback.md) for ordinary Feedback and dismissals, and
[Audit capture](audit-capture-projections.md) for the retained masking and stored-event setup. These recipes own those
expectations.

`$V seed communications` supplies exact active/inactive/expired announcement IDs and member/peer witnesses.
`$V platform-content` reads only those saved announcement IDs, rows created by this worker's synthetic super-admin and
What's New entries it saved. It accepts no supplied target. `$V communications ROLE` reads that synthetic account's
Feedback and dismissals. Provider reads are separate persistence proof, never ordinary authorization proof.
`$V seed audit` supplies 105 same-action A records plus old, excluded and B witnesses for server paging/filtering;
preserve its returned action and exact IDs.

The existing `network` helper supports same-origin form families `admin-announcements/create`,
`admin-announcements/toggle`, `admin-announcements/delete`, `admin-whats-new/save`, `admin-whats-new/delete` and
`admin-feedback/update`. Each binds the exact route, named action and POST. `arm-fail` returns one synthetic SvelteKit
503 failure before dispatch, `arm-hold` delays a real response and `arm-hold-fail` delays a synthetic failure.
`admin-audit-read` and `admin-dashboard-read` bind only their exact page-data paths and support `arm-fail`, `arm-hold`
and `arm-observe`. These are browser transport controls. They establish neither provider atomicity nor server
query-error handling. Restore each hook before another journey or cleanup.

Content form families also support `arm-reject`, which rejects one request before dispatch without an HTTP status. An
unconfirmed save requires authoritative readback before another mutation; use the visible Reload control and verify that
it sends no POST. Keep this transport evidence separate from provider rejection.
`$V content-request PAGE announcementCreate|announcementToggle|announcementDelete|feedbackUpdate RECORDED_UUID JSON`
sends ordinary authenticated same-origin form requests without applying the reply to UI. Announcement targets must be
current communications seeds or rows saved by this worker's reviewer; Feedback targets must belong to this worker's
synthetic accounts. Target IDs cannot be overridden in JSON. Use exact saved IDs to prove denied
create/toggle/delete/review requests preserve rows, separately from native controls. `announcementToggle` accepts only
`{"isActive":"true"|"false"}`, the desired state the native form posts; the recorded target `id` is added by the helper.
`platform-content` includes saved `updated_by` for actor attribution.

1. **Admission and disclosure.** Capture the operator's navigation. Directly attempt each URL as `platformSupport`,
   `platformBilling`, `platformInactive` and `orgMember` with normal login and inspect the ordinary authenticated
   page-data response. A forbidden page returns no privileged payload. Repeat User/Organization detail readbacks under
   the existing administration recipe. Anonymous attempts require authentication.
2. **Banners and member composition.** Capture the seed readback and admin statuses. Cancel a filled create form and
   verify no row. While typing, the preview beside the form follows Title, Message, Type and Ends, and shows no Dismiss
   action that works. Create a unique message through native fields, inspect its exact saved actor/type/text/expiration,
   reload and read it as an ordinary member banner. Exercise all three Types, one future expiry and one expired record.
   Capture Turn off/Turn on and reload/member visibility. Dismiss a live message as one account, reload and inspect
   peer/account-switch independence under communications, then read the banner's dismissal count on the admin page: it
   counts that account, and a banner nobody dismissed reads not dismissed yet. Cancel Delete and prove retention;
   confirm Delete and prove row/banner absence. Restore seeded active flags and delete UI-created announcements through
   the visible controls before cleanup.
3. **Announcement failure and lifetime.** Arm create failure, submit a unique draft, then capture the failure, editable
   retained fields, a blocked Publish to all users and no stored row. Use Reload Banners to read the current state
   without a POST, then explicitly retry and require one row. Repeat toggle/delete failure against a recorded witness,
   requiring unchanged provider state, readback before retry and exactly one retried write. Hold a real or failed create
   reply, cancel/reopen its editor or use a visible sidebar link, then return to Banners and fill a fresh unsent draft
   before release. Compare the current page before and after releasing the old reply. Old completions must not change
   another page's pending state, error or current draft, including after returning to the original route. A successful
   old-editor write still refreshes saved content on the current page. Other mutations remain disabled while a write or
   its readback is pending. Capture any failure as a defect rather than adopting it as intended behavior. The Banners
   list and its dismissal counts load as separate regions: each shows a skeleton while pending, then its own content or
   its own load error, and a count that cannot load never hides the banners. Arm `arm-hold-regions` on
   `admin-announcements-read`, open Banners from another tab and capture the skeletons before `release`; arm
   `arm-fail-regions` and capture the load error with Retry, then `restore` and Retry to read the list.
4. **Publish a What's New entry.** Open the What's New tab as the operator. Choose New Entry, type a unique title and
   two paragraphs, move the second above the first, remove none, and Save Draft. The entry lists as Draft, reopens from
   the list or the address with both paragraphs in the saved order, and `$V platform-content` lists the saved entry
   under `whatsNew` with `published_on` empty and `updated_by` set to the operator. As `orgMember`, open the account
   menu's What's new and the all-updates page: the draft is absent in both. Choose Publish; the row becomes Published
   with today's date and a Shown in app mark, and it is the first entry in the member dialog and on the all-updates
   page. Publish three more unique entries: only the newest three fill the dialog, the older ones remain on the
   all-updates page. Open the dialog after clearing nothing: no entry reads as unseen after the move to stored entries,
   because the last-seen key still holds the newest published id. Edit a published entry and Save Changes: its publish
   date and place in the list do not change. A published entry offers no Delete Draft; a draft deletes after the
   confirmation dialog names it. Take a keyboard pass through the list, the editor and the paragraph controls. Delete
   every UI-created draft and note that published test entries remain in provider data, so use unique titles. The 5xx
   and transport failure modes behave as on Banners: `arm-fail-400` keeps the typed text and shows the reason, an
   unconfirmed save blocks writes until Reload Entries, and a held reply that arrives after leaving the page changes
   nothing.
5. **Feedback review and persistence.** Submit a unique Bug Report through the ordinary member modal. The operator
   expands it and saves Reviewed plus Notes. Reload, select Reviewed, inspect exact saved context/message/Notes and
   clear Notes with keyboard selection/deletion. The operator resolves the same row and rereads Resolved after reload. A
   controlled failure keeps the chosen status/Notes available and produces no stored change. A 5xx or rejected transport
   requires Reload Feedback before one explicit retry; definite validation rejection permits immediate correction. Hold
   an update, navigate to another card/tab or visible page, then return to Feedback and enter fresh unsent Notes before
   release. Inspect both saved identity and the fresh UI before and after the old reply. For same-page card changes,
   fill the peer's Status/Notes before releasing a real success; the first row updates, the peer's unsent draft survives
   readback and only then can another Save dispatch. Ordinary and non-operator writes are denied without changing the
   row; test known-ID form submission separately from native proof.
6. **Audit paging, privacy and recovery.** Follow the Audit recipe's Action cohort, Next/Previous, Severity reset to
   page 1, A/B Organization filters, stored masked View details and reload. Preserve exact IDs/counts in page data and
   provider rows. Dashboard recent activity must not inherit these full details. Arm `admin-audit-read` from another
   admitted page before a visible Audit navigation, capture its failed request and recovery after restoring the hook.
   Use keyboard focus before arming to avoid prefetch consuming the one-shot fault. Provider query/writer failures
   require separate lower-level or controlled provider proof.
7. **Dashboard and retained search.** Capture visible counts and same-session page data before/after ordinary Feedback
   submission and review. Pending Feedback counts New rows, and recent activity remains reduced for every admitted role.
   Exercise a representative search result and return through visible links under the administration recipe. Record an
   `admin-dashboard-read` failed navigation and successful retry. Counts/query failure must remain distinct from a
   genuine empty platform; missing or malformed mandatory counts fail visibly, while genuine zero counts and the
   existing null signup aggregate remain valid empty results.

## Gotchas

- Global announcements and account dismissals differ from Organization-scoped private communications. An Organization
  role grants no platform privilege.
- Full Audit belongs to the operator; no other account reads it.
- A seeded masked event proves display/paging, not producer sanitization. Announcement audit events and real Feedback
  submission establish their own producer effects.
- Banners have create, toggle and delete controls, with no editing form. Feedback has no delete control. What's New
  entries edit in place and only drafts delete. Do not invent a journey for any of them.
- A published What's New entry cannot be removed from the Admin, and member views are limited to the newest three plus
  the all-updates page, so give each verification entry a unique title and keep the count of published test entries low.
- Synthetic 503s exercise browser response handling. Provider list errors must remain distinct from a genuine empty
  list. Prove first/later-page failures and tied-date completeness at the real SDK/provider boundary; browser faults
  alone cannot establish those contracts.
