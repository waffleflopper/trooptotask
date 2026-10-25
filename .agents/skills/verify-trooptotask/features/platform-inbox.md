# Platform Inbox: approve an access request

The platform operator opens `/admin` and finds one Inbox of things that wait for a decision: access requests from the
closed beta and member Feedback. They open an item, decide it and see it move to Done.

## Sub-features

- `queue`: Open and Done tabs, the kind filter chips with counts, newest first, "Showing the newest 50" when a kind has
  more, and the Done window of the last 30 days.
- `access-request`: the detail (email, what the person wrote, how they found us, account, similar Organization), the
  `Closed beta` badge, `Approve and send setup link` and `Reject` with an optional reason. Both commands are awaited and
  audited.
- `feedback`: the detail (message, category, page, person) and `Close without replying`.
- `states`: a skeleton per region while it loads, one error row with `Retry` per failed kind, a stale response never
  replacing a newer one, and the phone layout where an item is full screen and Back closes it.
- `legacy-routes`: `/admin/access-requests` and `/admin/feedback` redirect to the matching Inbox filter.

## How to get to it (user POV)

Sign in as the platform operator, enter the authenticator code and open Admin. The Inbox is the first sidebar item and
the page `/admin` opens. Pick an item in the list; its detail opens beside the list (or full screen on a phone). The URL
holds the tab (`tab=done`), the filter (`kind=accessRequest|feedback`) and the open item (`item=KIND:ID`), so reload and
Back return to the same view.

## Helper controls

Use `platformReviewer` (the only operator row) through `$V actor platformReviewer admin`. `$V seed platform-admin`
records two pending requests (`approve`, `reject`, the second with a pending Organization invitation) and a completed
one; `$V seed communications` or `notificationMember`'s `Send Feedback` creates Feedback rows. `$V platform-state` reads
the recorded request rows. `$V platform-request PAGE approve|reject TARGET_KEY JSON` posts to `/admin?/approve` or
`/admin?/reject` (`reject` accepts `reason`); `$V content-request PAGE feedbackClose UUID {}` posts `/admin?/close`.
`$V network arm-fail|arm-hold|arm-observe PAGE admin-access/approve/approve` (or `reject/reject`) and
`admin-inbox/close` bind one exact action; `admin-inbox-read` matches the Inbox page data and `admin-inbox-item-read`
the item detail request (`/admin/api/inbox/item`). `arm-load-error` works on `admin-inbox-read`. Setup mail goes to the
private sink (`mail state`, `mail fail setup`).

## Driving it with verify:app

1. **Queue.** As `platformReviewer`, open `$V actor platformReviewer admin` at 1440, 900 and 390. Expected: the sidebar
   lists Inbox, Organizations, People, Activity and Announcements with Inbox current; the Open tab lists both seeded
   pending requests (kind `Access request`, badge `Closed beta`), newest first with any Feedback; the chips read
   `All · N`, `Access requests · N` and `Feedback · N` with N equal to the listed rows. At 1440 and 900 the list and
   detail sit side by side; at 390 only the list shows.
2. **Approve an access request.** Select the `approve` request. Expected: URL gains `item=accessRequest:ID`; the detail
   shows its email, the `Closed beta` badge and both buttons. Choose `Approve and send setup link`. Expected: the button
   shows busy and a second press sends nothing; afterwards the detail shows the Approved badge with no buttons, the row
   is gone from Open, and Done lists it with the outcome Approved. `$V platform-state` shows `approved`; `mail state`
   shows one setup email to that address; Activity holds an `access_request.approved` row for the operator.
3. **Reject with a reason.** Select the `reject` request, choose `Reject`, type a unique reason and choose
   `Reject request`. Expected: the dialog closes only after the result; the request is `rejected`, its linked
   Organization invitation is `blocked`, and Activity holds an `access_request.rejected` row whose details include the
   reason. Failure: `$V network arm-fail PAGE admin-access/reject/reject`, reject again. Expected: the dialog stays open
   with an alert and the typed reason; `$V platform-state` is unchanged; after `restore` the retry succeeds.
4. **Feedback.** Select a Feedback row. Expected: the message, category, page and person; `Close without replying` moves
   it to Done and the stored status is `resolved`; Activity holds a `feedback.closed_without_reply` row. Closing it from
   a second stale page answers that the item was already closed and changes nothing.
5. **Done.** Choose the Done tab. Expected: only items closed in the last 30 days, newest closed first; URL `tab=done`;
   no buttons on any detail; the chips count Done items.
6. **Back and reload.** Open an item, press the browser Back: the item closes and the list stays. At 390 the item is
   full screen with `Inbox` as a back button that does the same. Reload with an item in the URL: the same item opens.
7. **Loading and errors.** `$V network arm-hold PAGE admin-inbox-item-read`, then pick a row: the detail region shows
   its skeleton while the list stays interactive; pick a second row and release: only the second row's detail shows.
   `arm-fail` on the item read shows a `Try again` button that recovers after `restore`. `arm-load-error` on
   `admin-inbox-read` from Organizations, then the Inbox link, shows the admin error page with `Back to Inbox`. A failed
   kind inside a working page shows its own `Retry` row while the other kind still lists; the chip counts for a failed
   kind are absent, not zero.
8. **Denial.** `platformSupport`, `platformBilling`, `platformInactive` and `orgMember` get the 403 page on `admin` and
   on `/admin/api/inbox/item`; an operator at aal1 is sent to `Enter your code`. Direct POSTs to `/admin?/approve`,
   `/admin?/reject` and `/admin?/close` from a non-operator answer 403 and change nothing in `platform-state`.

## Gotchas

- `/admin/people`, `/admin/activity` and the other new sections are separate slices; until they land their sidebar
  links 404. The old `admin/users`, `admin/audit` pages still answer.
- Requests auto-approved through an Organization invitation never appear in the Inbox.
- Setup email can be arranged to fail with `mail fail setup`; the approval is then recorded and the detail says so.
