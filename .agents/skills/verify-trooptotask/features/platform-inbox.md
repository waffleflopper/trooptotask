# Platform Inbox: approve an access request

The platform operator opens `/admin` and finds one Inbox of things that wait for a decision: access requests from the
closed beta and member Feedback. They open an item, decide it and see it move to Done.

## Sub-features

- `queue`: the header (eyebrow, title, the open-count sentence and the two month figures), Open and Done tabs, the kind
  filter chips with counts, rows with a colored kind label, a sentence title, a secondary line and the age, newest
  first, "Showing the newest 50" when a kind has more, and the Done window of the last 30 days.
- `access-request`: the detail (name, email and when they asked, what they wrote as a quote, how they got here, existing
  account, same unit already here), the `Closed beta` badge, `Approve and send setup link` and `Reject` with an optional
  reason. Both commands are awaited and audited.
- `feedback`: the detail (category, first line as the title, person, Organization, page section and time, the full
  message and the page), the reply thread, the composer, staff notes, `Make it a GitHub issue` and
  `Close without replying`; the [Feedback recipe](platform-feedback.md) owns replies, notes and issues.
- `states`: a skeleton per region while it loads that holds its final size, one error alert with `Retry` per failed
  kind, a stale response never replacing a newer one, a failed reload after a command that keeps the item on screen, and
  the single-column layout below 1024 px where an item is full screen and Back closes it.
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
the item detail request (`/admin/api/inbox/item`). `admin-feedback-read/UUID` and `admin-feedback-command/UUID` bind one
Feedback item's replies and notes read and its reply, note and issue POST. `arm-load-error` works on `admin-inbox-read`.
Setup mail goes to the private sink (`mail state`, `mail fail setup`).

## Driving it with verify:app

1. **Queue.** As `platformReviewer`, open `$V actor platformReviewer admin` at 1440, 900 and 390. Expected: the sidebar
   lists Inbox, Organizations, People, Activity and Announcements with Inbox current and a badge equal to the open
   items; the top bar reads `Platform › Inbox`. The header shows the eyebrow `Platform · <today>`, `Inbox`, a sentence
   that names the open count in words up to ten
   (`Two things are waiting on you. Everything else is running on its own.`, or
   `Nothing is waiting on you. Everything is running on its own.` with none) and the figures `New people · <month>` and
   `New Organizations · <month>` at the right. The chips read `All · N`, `Access · N` and `Feedback · N` with N equal to
   the listed rows, and `Open` is the underlined tab. Each access request row reads `Access request · Closed beta` in
   the accent color over `<name> wants to start an Organization`, then the email and how they found us, with the age
   (`2h`, `3d`) at the right; Feedback rows read `Feedback · <category>` in blue over the message's first line, then the
   person, Organization and page section. Newest first. At 1440 the list and detail sit side by side with a rule above
   them and `Choose an item to see it here.` until one is picked; the selected row has an accent bar at its left and a
   muted background. At 900 and 390 only the list shows, one column; at 390 the eyebrow reads `Platform · N open`, the
   sentence and figures are hidden, the chips wrap and each row's kind label is a tinted pill.
2. **Approve an access request.** Select the `approve` request. Expected: URL gains `item=accessRequest:ID`; the detail
   shows `Access request` with the `Closed beta` badge, the name as a large heading, `<email> · asked today at HH:MM`,
   what they wrote as an italic quote with a rule at its left, the rows `How they got here`, `Existing account`
   (`None with this email` for the seed) and `Same unit already here`, then `Approve and send setup link` and `Reject`
   with
   `The setup link is good for 14 days. Approving does not create an Organization. They do that after setting up their account.`
   under them. Choose `Approve and send setup link`. Expected: the button shows busy and a second press sends nothing;
   afterwards the detail shows the Approved badge with no buttons, the row is gone from Open, and Done lists it with the
   outcome Approved. `$V platform-state` shows `approved`; `mail state` shows one setup email to that address;
   `$V platform-state` audit holds `access_request.approved` and `access_request.account_setup_link_sent` rows for the
   operator (the Activity page is a later slice).
3. **Reject with a reason.** Select the `reject` request, choose `Reject`, type a unique reason and choose
   `Reject request`. Expected: the dialog closes only after the result; the request is `rejected`, its linked
   Organization invitation is `blocked`, and the audit holds an `access_request.rejected` row whose details carry the
   reason as `rejectionReason` (read it from the provider database; `platform-state` omits details). Failure:
   `$V network arm-fail PAGE admin-access/reject/reject`, reject again. Expected: while the request runs the reason
   field is disabled and cannot be edited; the dialog stays open with an alert and the typed reason; `$V platform-state`
   is unchanged; after `restore` the retry succeeds.
4. **Feedback.** Select a Feedback row. Expected: `Feedback · <category>` in blue, the message's first line as the
   heading, `<person> · <Organization> · on <section> · <when>` in mono, the full message when it runs past the first
   line, and a `Page` line with the recorded path; below it a reply thread, a composer and `Staff notes` load in their
   own region ([Feedback recipe](platform-feedback.md)). `Close without replying` moves it to Done and the stored status
   is `resolved`; the audit holds a `feedback.closed_without_reply` row, which Activity shows under `All` as
   `You closed Feedback <first 8 of the ID> without replying`. Closing it from a second stale page answers that the item
   was already closed and changes nothing.
5. **Done.** Choose the Done tab. Expected: only items closed in the last 30 days, newest closed first (the closed
   Feedback, then the rejected, then the approved request); URL `tab=done`; any open item is dropped from the URL; no
   buttons on any detail; the chips count Done items while the header sentence keeps the open count. The seeded
   `completed` request has no review time, so it is not in Done. With the read held (`arm-hold PAGE admin-inbox-read`,
   then choose Done) the list shows its skeleton at once, never the Open rows.
6. **Back and reload.** Open an item, press the browser Back: the item closes and the list stays. At 390, scrolled down
   the list, the list returns at the same scroll position with focus on the row. At 390 the item is full screen with
   `Inbox` as a back button that does the same. Reload with an item in the URL: the same item opens.
7. **Loading and errors.** `$V network arm-hold PAGE admin-inbox-item-read`, then pick a row: the detail region shows
   its skeleton while the list stays interactive; pick a second row and release: only the second row's detail shows.
   `arm-fail` on the item read shows a `Try again` button that recovers after `restore`. With a Feedback item open, arm
   only `admin-inbox-item-read` to fail, then choose `Close without replying`: the close succeeds, the item stays on
   screen with `This item could not be reloaded, so it may be out of date.` and `Try again`; after `restore`,
   `Try again` shows the `Closed` badge and no Close button. `arm-load-error` on `admin-inbox-read`, then choose Done,
   shows the admin error page (503) with `Try again` and `Back to Inbox`; `Try again` returns to the Inbox. Only the
   route's own data request is armed; the per-kind failure below is not reachable from the browser and is proven in the
   page test. A failed kind inside a working page shows its own `Retry` alert while the other kind still lists; the chip
   counts for a failed kind are absent, not zero.
8. **Denial.** A signed-in non-operator (`$V actor manager home`, then open `/admin`) gets the 403 page, a 403 on
   `/admin/api/inbox/item` and an error node, not data, from `/admin/__data.json`; an operator at aal1 is sent to
   `Enter your code`. Direct POSTs to `/admin?/approve`, `/admin?/reject` and `/admin?/close` from a non-operator answer
   403 and change nothing in `platform-state`.

## Gotchas

- Re-seeding `platform-admin` needs `$V clean-seeds` first; bulk Feedback rows beyond 50 show the `newest 50` note and a
  scroll inside the list at 1024 px and wider.
- `/admin/people`, `/admin/activity` and the other new sections are separate slices; until they land their sidebar
  links 404. The header date and month labels follow the browser's clock; the figures count the UTC month. The old
  `admin/users`, `admin/audit` pages still answer.
- Requests auto-approved through an Organization invitation never appear in the Inbox.
- Setup email can be arranged to fail with `mail fail setup`; the approval is then recorded and the detail says so.
