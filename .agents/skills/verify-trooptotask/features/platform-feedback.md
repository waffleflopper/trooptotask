# Platform Feedback: reply and make a GitHub issue

The platform operator answers member Feedback from the Inbox, keeps a private staff note and can turn a Feedback item
into a GitHub issue. The person who sent it reads the replies in the app.

## Sub-features

- `reply`: a composer under the item with `Send reply`, `Reply and close` and `Close without replying`. A reply is
  saved, the person is notified, the audit holds `feedback.replied` and the item stays open (status `reviewed`) until
  `Reply and close` or `Close without replying` (status `resolved`).
- `thread`: replies listed oldest first as `You · <when>` with the body, above the composer.
- `staff-notes`: a `Staff notes` region marked `Private`, one note per item, saved with `Save note`. Never shown to the
  person who sent the Feedback and never part of a reply.
- `github-issue`: `Make it a GitHub issue` opens a dialog with a prefilled title and description, default labels, a
  checkbox for the Organization name and `Create issue`. Once an issue exists the item shows its link instead.
- `reporter`: the person sees the notification `A reply to your feedback`, the thread at `/feedback/ID` and every
  Feedback they sent at `/feedback`.
- `states`: a skeleton for the replies and notes region while it loads, one `Try again` alert for that region when it
  fails, a draft kept after a failed command, and a composer locked while a command runs.

## How to get to it (user POV)

Sign in as the operator and open `/admin`; pick a Feedback row. The reply thread, composer and staff notes load below
the message. The person who sent it opens the bell, chooses the notification and lands on `/feedback/ID`; account-only
people without an Organization (no bell) reach `/feedback` from `Your feedback` on `/dashboard`.

## Helper controls

Use `platformReviewer` as the operator (`$V actor platformReviewer admin`) and `notificationMember` as the person who
sends (`$V actor notificationMember home`). `$V seed communications` or the member's `Send Feedback` creates rows.
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
   person's thread and `/feedback` never contain its text.
5. **Failure.** `arm-fail PAGE admin-feedback-command/UUID`, send a reply. Expected: an alert reading
   `Synthetic request failure`, the typed text still in the field, the buttons enabled again and no reply row; after
   `restore` the same text sends once. A failed reply may have been saved, so the thread reloads behind it and the Inbox
   row refreshes; with `arm-hold PAGE admin-feedback-read/UUID` also armed, `Send reply`, `Reply and close`,
   `Make it a GitHub issue` and `Save note` stay disabled until the read is released and the thread shows whether the
   reply saved. After a failed `Reply and close`, an item the server closed leaves Open at once.
   A reply to an item closed elsewhere (open the item in a second page, `Close without replying` there, then send from
   the first) answers `This feedback was closed. Reload to see it.` with `Reload`, the typed text kept and nothing
   refreshed until `Reload` is chosen; no reply row and no notification.
6. **Make it a GitHub issue.** Choose the button. Expected: the dialog `New GitHub issue` with
   `waffleflopper/trooptotask · public repository`, the title `<first line>` with no category prefix, a description of the message
   with `Category` and `Section` lines and no name, email or Organization, the labels `bug` and `user-feedback`
   (category dependent), `Left out because the repository is public: their name, email and Organization.`, an unchecked
   `Include the Organization name` and `Create issue`. Tick the box: the line
   `Adds "Organization: <name>" to the end of the issue.` shows. Choose `Create issue`. Expected: the alert
   `GitHub feedback integration is not configured.` in the dialog, the title, description and checkbox kept, no issue
   columns on the Feedback row and the item unchanged. Escape closes the dialog.
7. **Person's view.** As `notificationMember`, the bell reads `N unread notifications` with `A reply to your feedback`
   per reply; choosing one opens `/feedback/ID`: `What you sent`, the status badge (`In review`, `Closed`), the message
   and `Replies` with `TroopToTask · <date>`. `/feedback` lists every item with its status and reply count; an unknown
   ID answers 404.
8. **Loading, errors and stale responses.** `arm-hold-fail PAGE admin-feedback-read/UUID`, then pick the item from the
   list. Expected: the message shows at once and the replies and notes region shows a skeleton
   (`Loading replies and notes`); release and the region shows
   `The replies and notes for this feedback could not be loaded.` with `Try again`, while `Close without replying`
   stays; `restore`, `Try again` loads the region. With the read of item A held, pick item B, then release: B stays
   selected and A's data never replaces it.
9. **Back and widths.** Back after opening an item returns to the list. At 900 and 390 the item is full screen with
   `Inbox` as a back button, the dialog is a single column with `Create issue` above `Cancel` at 390, and the page has
   no horizontal scroll.

## Gotchas

- Clean the Feedback rows, replies and notes with `clean-seeds`; replies and notes go with their row.
- `Close without replying` does not set `updated_by`; the audit row records who closed it.
