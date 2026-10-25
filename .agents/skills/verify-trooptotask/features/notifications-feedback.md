# Notifications, feedback and announcements

Members read their own Organization notifications, send feedback about the current page, and dismiss global
announcements without affecting another User Account.

## Sub-features

- `toast-theme`: success/error feedback follows the explicitly selected app theme. The
  [shared theme pass](shared-ui.md#theme-and-viewport) owns its narrow/wide and opposite-system-preference proof.
- `recipient-delivery`: current Organization owners/admins receive real membership-event notifications; the triggering
  actor, ordinary members and foreign Organizations are excluded where the producer requires it.
- `notification-lifecycle`: the bell lists the newest twenty own notifications, opens links, marks one/all read and
  deletes one; Account → Notifications lists the newest hundred with the same actions and `Delete all`; deletion
  preserves peer and foreign rows.
- `notification-recovery`: failed loads/writes remain recoverable, and delayed responses cannot populate another
  Organization's bell or choose its mutation target.
- `feedback`: blank/cancel, categories, exact saved account/Organization/page context, failure retention and retry,
  denied foreign context, and ignored completions after the submitting modal's scope retires.
- `support-review-and-export`: Platform review preserves status/notes, and both Organization export formats retain
  complete scoped communications fields.
- `announcements`: active/unexpired banners, per-account dismissal persistence across Organizations, peer isolation and
  failed dismissal recovery.

## How to get to it (user POV)

Sign in, open an Organization, and use the bell in the header. Select a notification to mark it read and follow its
link, or choose `Mark all read`. `Delete notification: <title>` beside each item deletes it without opening it.
`View all` at the foot of the menu opens Account → Notifications (`/org/ORG/account/notifications`). Use `Send feedback`
in the Organization header, or in the account menu (sidebar name card) at any width, to open its modal, choose a
category, enter a message and Submit. An active announcement appears above the workspace with
`Dismiss announcement: <title>`. Switch Organizations through the header switcher.

## Helper controls

Notifications actors are `notificationMember`, `notificationOther`, `notificationForeign` and `notificationSwitch`, with
every feature lane absent. Switch belongs to A/B; the others belong only to their named Organization. `actor ROLE home`
enters the Organization Dashboard through normal sign-in. `seed communications` creates 24 own A inbox rows,
peer/foreign/switch sentinels and active/inactive/expired global announcements. It records exact IDs before insertion;
`clean-seeds` removes only those IDs in their recorded Organization or the helper-owned global announcement IDs.
`fixture` reports public notification account IDs. `communications ROLE` reads only that synthetic account's feedback
and dismissals of helper-owned announcements. `platformReviewer` is the isolated no-Organization platform operator and
`platformSupport` an isolated no-Organization account with no operator row; `actor platformReviewer admin` signs the
operator in at aal2 for the Inbox Feedback path. Communications readback reads the stored status. See the
[communications recipe](notifications-feedback.md).

`network` also supports `notifications` at the exact A endpoint and global `feedback` and `announcements/dismiss`
endpoints. Their failure/hold controls exercise the same page's real UI response handling; they do not prove provider
delivery or automatic retry. Restore hooks before cleanup. The owned app excludes external feedback tokens, so real
GitHub mirroring is not a live-verified path.

## Driving it with verify:app

Preconditions: `doctor` passes. `$V actor notificationMember home` enters A with every feature lane absent;
`notificationOther` is a peer, `notificationForeign` belongs only to B, and `notificationSwitch` belongs to A/B with
every lane absent. `$V seed communications` creates twenty-four unread member notifications in A, peer/foreign/switch
sentinels, and one active, one inactive and one expired global announcement. Keep the returned IDs/tag and
`$V fixture`'s public notification user IDs. `$V rows notifications orgA|orgB` reads exact rows;
`$V communications ROLE` reads only that synthetic account's feedback and dismissals of helper-owned announcements.
Network controls also accept `notifications` (exact A endpoint), `feedback` and `announcements/dismiss` (exact global
endpoints).

1. **Real producer and audience.** Before mutation capture A/B notification rows and A membership roles/IDs. As
   `orgOwner` open `settings/members`, invite the confirmed `orgInvitee` as described in
   [Organization invitations](organization-invitations.md). Local email delivery may fail while the same pending
   invitation persists. Compare provider rows: exactly the current A owners/admins other than `orgOwner` receive one
   `member_invited` record; ordinary members/B receive none. As `orgAdmin`, open the bell, select the new notification
   and capture its Settings navigation, saved `read=true`, and reload. If also driving invitee Accept/Decline, compare
   the additional producer's exact audience separately; do not count seeded rows as delivery proof.
2. **Failure and scope change before bulk mutation.** As `notificationMember`, load the bell with fresh unread rows
   before arming `network arm-fail PAGE notifications`; opening an unread item must target the PUT rather than a list
   GET. Record the failed PUT, visible count and unchanged row, then reload and retry. A failed write must not present a
   saved read state; it reports failure on the destination and permits retry. The newest member item has a synthetic
   Dashboard query link: opening it follows that link while the write is pending, even if the write fails. Hold a
   single-read PUT, capture the destination before release, then release and require the badge to drop and its exact row
   to become read. Retry a failed write from the destination by reopening the bell. For list failure, use the untouched
   `notificationOther` account and arm before opening its fresh bell; capture the error/recovery message and disabled
   bulk-read button, close/reopen and observe retry without a request loop. Bulk read stays disabled during failure or
   loading and becomes available only after a successful list. For a delayed A list, use `notificationSwitch` and
   `network arm-hold PAGE notifications`, open the bell, switch visibly to B while held, release and open B's bell.
   Neither A's title nor A's ID may appear in B or choose a B write target. Also hold an A single-read response while
   switching: completion cannot change B's badge or navigate back to A's link. Keep any defect visible; restore each
   hook before further journeys. Complete these checks before marking all read or deleting any A/B witness.
3. **Own lifecycle and paging.** As `notificationMember`, open the bell and capture its newest twenty entries in reverse
   date order: items 24 through 05, with 01–04 omitted. Peer/B sentinels must be absent. Open another still-unread item,
   read its exact `read` value and reload/count. First arm a failed `Mark all read`: the badge stays unchanged and
   pending controls prevent duplicate writes. Restore the hook and retry `Mark all read`; all twenty-four own A rows,
   including the four outside the list, become read while peer/B rows remain unchanged. Use native keyboard Enter/Escape
   for a bell/menu action and capture resulting focus. Save before/action/after snapshots, screenshot and reload.
4. **Delete and the Account list.** Reseed if step 3 already marked everything read. Open the bell and choose
   `Delete notification: <title>` on item 24 with the mouse, then on the next item with ArrowDown and Enter. Expected
   each time: the menu stays open, there is no navigation, the badge drops by one for an unread item, focus lands on the
   item that took its place, and `$V rows notifications orgA title <title>` returns no row. Choose `View all`:
   `/org/ORG/account/notifications` lists the own rows newest first under `N unread of M`, each with an unread dot,
   title, message, relative time and `Delete notification: <title>`. Keep that page open and write from the bell: the
   page follows without a reload (after another bell delete of an unread item, unread and total each drop by one from
   what the page showed; after the bell's `Mark all read`, unread is `0`). Delete a row on the page: the row and its
   database row go, the bell count follows, and focus moves to the next row's delete button. The page's `Mark all read`
   marks every own A row read, including the rows beyond the bell's newest twenty. `More` → `Delete all` asks `Delete all notifications?`; Cancel keeps every row, and `Delete all`
   leaves `No notifications. Replies to your feedback and updates from your unit show up here.` with only the peer and B
   sentinels left in `rows notifications orgA|orgB`. A link stored as `/account/...` opens under the current
   Organization as `/org/ORG/account/...` from both the bell and the page. At 390 the page and the open bell have no
   horizontal scroll.
5. **Separate API authorization/deletion.** From that same authenticated page, issue direct fetches to the known
   notification endpoint for peer/foreign IDs and read back rows. Peer writes must be denied without effects; foreign
   resources remain concealed. Request single own deletion and then `deleteAll`; only the requesting account in the
   requested Organization may change. Test B through `notificationSwitch` and use known IDs to prove same-account A/B
   independence. Record HTTP status/body and persistence separately from UI proof. An anonymous page cannot list/mutate
   notifications, submit feedback or dismiss announcements.
6. **Feedback success and recovery.** Open Send Feedback, confirm blank/whitespace cannot submit and Cancel creates no
   row. Submit a unique General Feedback message and verify one row with the signed-in user, selected Organization,
   server-derived Organization name, category, exact message and normalized current page. Capture modal closure,
   rendered success and reload. Repeat a representative Bug Report/Feature Request selection. Arm
   `network arm-fail PAGE feedback`; submit a new unique message. Expected: error, retained draft, enabled retry, no
   stored row and no success message. Retry once and verify one row. Separately send foreign Organization context from
   an A-only account: 403 and no row. Forged name/user fields cannot select the stored account/Organization. Also hold a
   real A Feedback POST with `network arm-hold PAGE feedback` and observe transient toasts with `feedback arm PAGE`.
   Navigate back natively to B in the same document, require A's modal to disappear, release the real reply and require
   no late A toast in B. Saved A rows may persist because the dispatched write completed; verify its exact
   account/Organization/page rather than treating disposal as server cancellation. The helper does not support
   `arm-hold-fail` for Feedback; record that limitation without crediting a delivered native failure. `FeedbackModal`
   component tests cover late nonOK/error-body/transport continuations after unmount. Restore both controls. The owned
   app has no GitHub feedback token; live external mirroring is not proved.
7. **Announcement persistence/isolation.** Reload after seeding: only the active banner appears. Dismiss as one account,
   verify one dismissal and continued absence after reload and an A→B switch for `notificationSwitch`. A peer still sees
   it. Pending dismissal remains account-wide during an Organization refresh; late completions after account replacement
   or unmount cannot affect the new account (deferred component protection complements the live scope proof). On an
   undismissed peer arm `network arm-fail PAGE announcements/dismiss`, dismiss, capture the failure and absence/presence
   before and after reload. A failed request must retain or restore the banner and offer recovery; an optimistically
   hidden banner with no dismissal fails. Retry successfully and read back one dismissal. Repeated endpoint dismissal
   must be idempotent for that account.
8. **Support review and Organization export.** Use `$V actor platformReviewer admin` to enter the Inbox with the
   isolated operator account. Find a uniquely submitted message under the Feedback filter, open it, choose
   `Close without replying`, then reload and inspect the Done tab and exact communications readback: the saved identity
   and message remain and the status is `resolved`. `platformSupport` and an ordinary member cannot enter the admin
   page. Do not confuse Feedback admission with the narrower Platform announcement management policy. For Organization
   exports, submit distinct feedback as `orgOwner`, read its exact fields and capture A/B notification sentinels. Enter
   `settings/exports`, download JSON and Excel through visible controls using `export arm/save`, inspect their
   Notifications/Beta Feedback sections/sheets and metadata, and compare saved values/counts with provider readback.
   Only request-user-visible rows in the admitted Organization belong in these downloads; an owner does not gain another
   account's inbox or feedback. A reply to Feedback arrives as the notification `A reply to your feedback` linking
   `/account/feedback/ID`, which opens as `/org/ORG/account/feedback/ID` ([Feedback recipe](platform-feedback.md) owns
   it); exports carry no replies or staff notes. Keep outside-page/pagination proof separately in owner SDK/SQL tests.
   Exercise a real Training type create/delete through the configuring actor and compare the generated notification
   audience; a denied configure attempt must retain the saved type and create no notification in route tests.

After `clean-seeds`, read back the known seeded notification IDs' absence. Global announcement cleanup deletes only
recorded helper IDs and their dependent dismissals. Feedback has no member-facing delete control and stays in the
disposable provider until owned worker cleanup; its replies and staff notes go with the row.

9. **Ask the inviter.** The platform operator's `Ask the inviter to check the address` on a bounced setup email (see
   [Platform Inbox](platform-inbox.md), step 9) writes one `setup_email_address_check` notification per current member
   who invited the address, titled `Check an invitation address`, linking to that Organization's `Members` settings.
   After it, `$V setup-state reject` lists the row for `orgCreator`. Sign in as `orgCreator`, open the temporary
   Organization from `$V platform-state` and open the bell: the notification reads that the setup email for
   `<name> (<email>)` bounced, and following it opens Members. An inviter who has left the Organization is not notified,
   and the command then answers `No current inviter can be contacted for this item.`

## Gotchas

- Notifications combine requested Organization and signed-in User Account. Feature edit permission is unnecessary; being
  an Organization admin does not permit reading another account's inbox.
- Announcements are global; a dismissal belongs to the User Account and follows it across Organizations. A foreign
  Organization's private notification is different from a global banner.
- Twenty visible notifications do not prove bulk mutations cover all saved notifications. The larger fixture supplies an
  explicit outside-page witness.
- The maintained `feedback` control observes transient toasts; the `network ... feedback` family controls the submission
  endpoint. They serve different purposes.
- Client 503/hold controls prove UI recovery and response ordering, not actual provider delivery failures, durable
  queues or transactional rollback. Producer tests and real successful membership-event readback are separate proof.
