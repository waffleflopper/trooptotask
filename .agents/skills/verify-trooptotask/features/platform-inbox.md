# Platform Inbox: approve an access request

The platform operator opens `/admin` and finds one Inbox of things that wait for a decision: access requests from the
closed beta and member Feedback. They open an item, decide it and see it move to Done.

## Sub-features

- `queue`: the header (eyebrow, title, the open-count sentence and the two month figures), Open and Done tabs, the kind
  filter chips with counts, rows with a colored kind label, a sentence title, a secondary line and the age, newest
  first (Open Feedback uses last activity), "Showing the newest 50" when a kind has more, and the Done window of the last 30 days.
- `access-request`: the detail (name, email and when they asked, what they wrote as a quote, how they got here, existing
  account, same unit already here), the `Closed beta` badge, `Approve and send setup link` and `Reject` with an optional
  reason. Both commands are awaited and audited.
- `feedback`: the detail (category, first sentence of the first line as the title, truncated
  after 90 characters, person, Organization, page section and time, the full
  message and the page), the reply thread, the composer, staff notes, `Make it a GitHub issue` and
  `Close without replying`; the [Feedback recipe](platform-feedback.md) owns replies, notes and issues.
- `states`: a skeleton per region while it loads that holds its final size, one error alert with `Retry` per failed
  kind, a stale response never replacing a newer one, a failed reload after a command that keeps the item on screen, and
  the single-column layout below 1024 px where an item is full screen and Back closes it.
- `setup-email`: Bounced and Expired unused setup emails as Inbox items with their setup history and the commands
  `Ask the inviter to check the address`, `Resend setup link` and `Rescind access`.
- `legacy-routes`: `/admin/access-requests` and `/admin/feedback` redirect to the matching Inbox filter;
  `/admin/access-requests?tab=reviewed` redirects to `/admin/people?filter=notSetUp`.

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
Setup mail goes to the private sink (`mail state`, `mail fail setup`). Setup emails use
`$V setup-bounce|setup-expire|setup-state REQUEST_KEY` (`approve|reject|completed`; `setup-bounce` takes an optional
reason) and `network arm-fail|arm-hold|arm-observe PAGE admin-inbox/resendSetup|rescindAccess|askInviter`.

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
   (`2h`, `3d`) at the right; Feedback rows read `Feedback · <category>` in blue over the first sentence of the
   first line, truncated after 90 characters, then the person's name (their email when they never set one), Organization
   and page section. Open sorts Feedback by last activity and other items by received time, newest first. At 1440 the list
   and detail sit side by side with a rule above them and `Choose an item to see it here.` until one is picked; the
   selected row has an accent bar at its left and a muted background. At 900 and 390 only the list shows, one column; at
   390 the eyebrow reads `Platform · N open`, the sentence and figures are hidden, the chips wrap and each row's kind
   label is a tinted pill.
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
4. **Feedback.** Select a Feedback row. Expected: `Feedback · <category>` in blue, the first sentence of its first
   line as the heading, truncated after 90 characters, `<person> · <Organization> · on <section> · <when>` in mono, the
   full message when it differs from the heading, and a `Page` line with the recorded path; below it a reply thread, a
   composer and `Staff notes` load in their
   own region ([Feedback recipe](platform-feedback.md)). `Close without replying` moves it to Done and the stored status
   is `resolved`; the audit holds a `feedback.closed_without_reply` row, which Activity shows under `All` as
   `You closed Feedback <first 8 of the ID> without replying`. Closing it from a second stale page answers that the item
   was already closed and changes nothing.
5. **Done.** Choose the Done tab. Expected: only items closed in the last 30 days, newest closed first (the closed
   Feedback, then the rejected, then the approved request); URL `tab=done`; any open item is dropped from the URL; access
   decision and reply/close controls are absent, but closed Feedback retains GitHub issue controls and editable Staff
   notes (see the [Feedback recipe](platform-feedback.md)); the chips count Done items while the header sentence keeps the open count. The seeded
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

9. **Setup emails.** Run `$V seed platform-admin`, approve the `approve` request (step 2) and read
   `$V setup-state approve`: one link whose `resend_email_id` is `synthetic-mail-N` and no `bounced_at`.
   - **Bounced.** `$V setup-bounce approve "Mailbox does not exist"` answers 200 `{"received":true}`. It posts a freshly
     Svix-signed bounce for that synthetic mail ID to `/api/webhooks/resend` of the owned app and never contacts Resend.
     `setup-state` now holds `bounced_at` and the reason; a second `setup-bounce` leaves the first reason. Reload the
     Inbox. Expected: the chips gain `Setup emails · 1`, the header sentence counts the item, and the row reads
     `Setup email · Bounced` titled `Setup email for <name>`. Select it: the heading `<name> never got a setup link`,
     the eyebrow `Setup email · Bounced`, `<email> · bounced <when>`, a `Setup email history` list (`Setup link sent.`
     with `Delivered to <email>`, `Delivery failed.` with `The mail server said: Mailbox does not exist`, then
     `Has not finished setup.` only while the link is live), `Ask the inviter to check the address`, `Resend setup link`
     and `Rescind access`, the sentence that resending usually bounces again, and `Open <name>'s page`. Ask the inviter
     is the dark button and is disabled when no current member invited the address (the seeded `approve` request has
     none).
   - **Resend.** Press `Resend setup link`. Expected: the pressed button shows busy and a second press sends nothing;
     the item turns `Resolved` with `A newer setup link was sent.` and the transient confirmation is not visible;
     `mail state` holds a second `account-setup` message to that address; `setup-state` shows the first link revoked as
     replaced and a new live link; the audit holds the resend row. After the reload the item is closed: `Resolved`, no
     buttons, and it is listed in Done.
   - **Ask the inviter.** Approve the `reject` request (it carries a pending Organization invitation from `orgCreator`)
     and bounce it. Expected: the ask button is enabled; press it:
     `The inviter was notified. This item stays open until the address is fixed.`; the item stays in Open;
     `setup-state reject` holds one `setup_email_address_check` notification for `orgCreator` in the temporary
     Organization and an `access_request.inviter_address_check_requested` audit row. The notification itself is read in
     [Notifications](notifications-feedback.md).
   - **Rescind.** `Rescind access` opens `Rescind access?` naming the person; `Cancel` closes it with no request;
     confirming shows `Access was rescinded.`, the item is `Resolved`, `setup-state` shows the request `rescinded` with
     `rescinded_at`, the link revoked as manual, and the audit holds the rescission.
   - **Expired unused.** With a live link (a fresh resend), `$V setup-expire approve` then reload. Expected: the row
     reads `Setup email · Expired unused` titled `Setup email for <name>`; the heading is
     `<name> has not used their setup link`, `Resend setup link` is the dark button, and the history lists
     `The link expired unused.` (the helper backdates the expiry, so it sorts first)
   - **Failure and lifetime.** `$V network arm-fail PAGE admin-inbox/resendSetup` (also `rescindAccess`, `askInviter`),
     press the command: a destructive `Alert`, the item and `setup-state` unchanged; after `restore` the retry works.
     `$V mail fail setup` then `Resend setup link` shows
     `The new setup link was created, but the email could not be delivered.`. `arm-hold` the command, pick another item
     and release: the answer never changes the other item. A setup email that went out while its required audit write
     failed (`email_sent_audit_failed`) reads
     `The setup email was sent, but the required audit could not be recorded. Reload before sending again.` as a notice
     that also stays as a warning toast until dismissed, never as a failed send; it is not reachable from the browser
     and is proven in `src/routes/admin/setupEmailActions.server.test.ts` and `inboxActions.svelte.test.ts`.

## Gotchas

- Re-seeding `platform-admin` needs `$V clean-seeds` first; bulk Feedback rows beyond 50 show the `newest 50` note and a
  scroll inside the list at 1024 px and wider.
- The header date follows the browser's local date; month labels and figures use UTC. `/admin/users` and
  `/admin/users/ID` redirect (308) to People and the person page; `/admin/audit` redirects to Activity.
- Requests auto-approved through an Organization invitation never appear in the Inbox.
- Setup email can be arranged to fail with `mail fail setup`; the approval is then recorded and the detail says so.
