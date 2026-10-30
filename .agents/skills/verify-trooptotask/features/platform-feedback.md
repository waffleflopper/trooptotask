# Platform Feedback: reply and make a GitHub issue

The platform operator answers member Feedback from the Inbox, keeps a private staff note and can turn a Feedback item
into a GitHub issue. The person who sent it reads the replies under Account → Feedback and can answer while the item is
open.

## Sub-features

- `reply`: a composer under the item with `Send reply`, `Reply and close` and `Close without replying`. A reply is
  saved, the person is notified, the audit holds `feedback.replied` and the item stays open (status `reviewed`) until
  `Reply and close` or `Close without replying` (status `resolved`).
- `thread`: replies listed oldest first, each headed `<author> · <when>` above its body, with the composer below. The
  operator sees their own as `You` and the person's as the person's email; the person sees `TroopToTask` and `You`. The
  two sides have different rule colors.
- `staff-notes`: a `Staff notes` region marked `Private`, one note per item, saved with `Save note`. Never shown to the
  person who sent the Feedback and never part of a reply.
- `github-issue`: `Make it a GitHub issue` opens a dialog with a prefilled title and description, default labels, a
  checkbox for the Organization name and `Create issue`. Once an issue exists the item shows its link instead.
- `reporter`: the person sees the notification `A reply to your feedback`, the thread at `/org/ORG/account/feedback/ID`
  and their newest 50 Feedback items at `/org/ORG/account/feedback`, without pagination. They reply from the item until
  it is closed; a closed item says so and has no composer. Old `/feedback` and `/feedback/ID` links redirect there.
- `states`: a skeleton for the replies and notes region while it loads, one `Try again` alert for that region when it
  fails, a draft kept after a failed command, and a composer locked while a command runs.

## How to get to it (user POV)

Sign in as the operator and open `/admin`; pick a Feedback row. The reply thread, composer and staff notes load below
the message. The person who sent it opens the bell, chooses the notification and lands on
`/org/ORG/account/feedback/ID`, or opens Account → Feedback from the account menu. People without an Organization have
no bell and no Feedback section: `Your account` on `/dashboard` opens `/account/profile`, and `/account/feedback`
redirects there.

## Helper controls

Use `platformReviewer` as the operator (`$V actor platformReviewer admin`) and `notificationMember` as the person who
sends (`$V actor notificationMember home`). Submit uniquely tagged items through the member's account-menu
`Send feedback` control before the journeys below. `$V seed communications` creates notifications and announcements,
but no Feedback items.
`$V communications notificationMember` reads the member's Feedback (`status`, `updated_by`, GitHub issue columns), the
replies and the staff notes. `$V network arm-fail|arm-hold|arm-hold-fail PAGE admin-feedback-command/UUID` binds the
operator's POST (reply, reply and close, note, issue) for that item; `admin-feedback-read/UUID` binds the GET for its
replies and notes. An arm is lost by a full page navigation, so arm after the page has loaded and select the item from
the list. The owned app has no `GITHUB_FEEDBACK_TOKEN`, so `Create issue` answers
`GitHub feedback integration is not configured.` and GitHub is never called; a created issue is covered by component
tests only.

## Driving it with verify:app

1. **Reply.** Open an item as `platformReviewer`. Expected: below the message a `Reply to <email>` field, `Send reply`
   and `Reply and close` disabled until text is typed, `Make it a GitHub issue`, `Close without replying`, a note that
   the person sees the reply as an in-app notification with no email, and `Staff notes` with `Private`. Type a unique
   reply and, with `arm-hold PAGE admin-feedback-command/UUID`, choose `Send reply`. Expected while held: the field is
   read-only, `Send reply` shows busy, and the other buttons do nothing. Release. Expected: the thread shows
   `You · today at HH:MM` and the text, the field clears, a status line reads
   `Reply sent. They will see it in the app.`, the item stays in Open, and `communications notificationMember` shows one
   reply row and status `reviewed` with `updated_by` set to the operator.
2. **Reply and close.** Type a reply and choose `Reply and close`. Expected: `Reply sent and the item is closed.`, a
   `Closed` badge, no composer, the row gone from Open and in Done, one reply row and status `resolved`.
3. **Close without replying.** Choose it on an untouched item. Expected: the item closes with no reply row and status
   `resolved`; the person sees `Closed` with no replies.
4. **Staff note.** Type a note and choose `Save note`. Expected: `Note saved.`, one staff note row for the item. The
   person's thread and Account → Feedback never contain its text. Clear the saved note with native Control+A and
   Backspace, then choose `Save note`; reopen the item and require an empty note field and no staff note row in
   `communications notificationMember`.
5. **Failure.** `arm-fail PAGE admin-feedback-command/UUID`, send a reply. Expected: an alert reading
   `Synthetic request failure`, the typed text still in the field, the buttons enabled again and no reply row; after
   `restore` the same text sends once. A failed reply may have been saved, so the thread reloads behind it and the Inbox
   row refreshes; with `arm-hold PAGE admin-feedback-read/UUID` also armed, `Send reply`, `Reply and close`,
   `Make it a GitHub issue` and `Save note` stay disabled until the read is released and the thread shows whether the
   reply saved. After a failed `Reply and close`, an item the server closed leaves Open at once. A reply to an item
   closed elsewhere (open the item in a second page, `Close without replying` there, then send from the first) answers
   `This feedback was closed. Reload to see it.` with `Reload`, the typed text kept and nothing refreshed until `Reload`
   is chosen; no reply row and no notification.
6. **Make it a GitHub issue.** Choose the button. Expected: the dialog `New GitHub issue` with
   `waffleflopper/trooptotask · public repository`, the title `<first line>` with no category prefix, a description of
   the message with `Category` and `Section` lines and no name, email or Organization, the labels `bug` and
   `user-feedback` (category dependent),
   `Left out because the repository is public: their name, email and Organization.`, an unchecked
   `Include the Organization name` and `Create issue`. Tick the box: the line
   `Adds "Organization: <name>" to the end of the issue.` shows. Choose `Create issue`. Expected: the alert
   `GitHub feedback integration is not configured.` in the dialog, the title, description and checkbox kept, no issue
   columns on the Feedback row and the item unchanged. Escape closes the dialog.
7. **Person's view and reply.** As `notificationMember`, the bell reads `N unread notifications` with
   `A reply to your feedback` per reply; choosing one opens `/org/ORG/account/feedback/ID` with Feedback current in the
   Account navigation: `All feedback`, `Your feedback · <category>`, `What you sent`, the status badge (`Received` while
   it waits on TroopToTask, `Replied` after an operator reply, `Closed`), the message and `Conversation` with
   `TroopToTask · <when>`. Type a unique reply and choose `Send reply`. Expected: the thread gains `You · <when>`, the
   field clears, the badge reads `Received`, `communications notificationMember` shows the reply row and status `new`,
   and the operator's thread shows it under the person's email. A failed send keeps the text and shows the error under
   the field. Close the item as the operator, then send from the person's page that still shows the composer: the server
   refuses it (409), the page reloads the item, and the composer is replaced by
   `This feedback is closed, so it takes no more replies.` with no reply row added. Account → Feedback lists the newest
   50 items with their status and reply count (`Closed`, `2 replies`); an unknown ID answers 404.
8. **Loading, errors and stale responses.** `arm-hold-fail PAGE admin-feedback-read/UUID`, then pick the item from the
   list. Expected: the message shows at once and the replies and notes region shows a skeleton
   (`Loading replies and notes`); release and the region shows
   `The replies and notes for this feedback could not be loaded.` with `Try again`, while `Close without replying`
   stays; `restore`, `Try again` loads the region. With the read of item A held, pick item B, then release: B stays
   selected and A's data never replaces it.
9. **Back and widths.** Back after opening an item returns to the list. Account → Feedback and its item have no
   horizontal scroll at 390. At 900 and 390 the item is full screen with `Inbox` as a back button, the dialog is a
   single column with `Create issue` above `Cancel` at 390, and the page has no horizontal scroll.

## Gotchas

- `clean-seeds` removes helper-created rows, not Feedback submitted through the UI. Use an owned worker restart to
  clear these temporary Feedback items, replies and notes before a journey needs the original fixture.
- `Close without replying` does not set `updated_by`; the audit row records who closed it.
