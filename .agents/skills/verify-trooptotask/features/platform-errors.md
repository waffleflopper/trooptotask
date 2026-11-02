# Platform Errors: capture, report and resolve

TroopToTask records its own failures. A server failure, a render error, a transport failure or a write the browser could
not confirm becomes one occurrence in an error group. The platform operator reads the groups under `/admin/errors`,
resolves them and sees the Feedback a member sent about one. A member on an Organization page can send that Feedback
from the failure toast.

## Sub-features

- `capture`: a response of 500 or more, an unknown exception, a render error, a transport failure and an unconfirmed
  write each record one occurrence. A 4xx answer (validation, permission, conflict, not found, rate limit) is never
  recorded.
- `reference`: the server generates the error reference and returns it in the `x-error-reference` header. A failure the
  browser alone saw gets its reference from the report endpoint. The reference is a UUID the person can read but not
  edit.
- `toast-report`: on an Organization page a failure toast with a fresh reference carries `Report error` and stays at
  least 15 seconds. The button opens Send Feedback as a Bug Report with the `Error reference` shown read-only. A toast
  without a reference has no button.
- `linked-report`: the saved Feedback carries the reference only when it belongs to the sender. A reference that is
  unknown or someone else's saves the Feedback unlinked, with no error.
- `groups`: occurrences with the same origin, kind, route, method, name, code and message share a group. The page shows
  count, people, last and first seen, the route, a `Browser` badge for browser-reported groups and a link to each linked
  report.
- `resolve`: `Resolve` moves a group to Resolved and writes `error_group.resolved` to Activity. The same failure
  recurring reopens it.
- `states`: a skeleton while the list loads, one `Unable to load Errors` alert with `Retry Errors`, an empty message
  per filter, and a failed Resolve that keeps the row.
- `retention`: occurrences older than 30 days are deleted by the scheduled cleanup, and groups with none left go with
  them.

## How to get to it (user POV)

A member never opens an error page. On an Organization page a failed save shows its usual toast; when the toast offers
`Report error` the member chooses it, adds what they were doing and submits. The operator signs in at aal2, opens Admin
and chooses `Errors` in the sidebar. The page lists Open groups from the last 30 days; `Resolved` lists the others. A
linked report opens its Inbox item.

## Helper controls

Use `calendarConfigure` on `calendar/settings` as the member and `platformReviewer` as the operator
(`$V actor platformReviewer admin`, then choose `Errors`; `actor` has no `admin/errors` destination).

- A real server 5xx on a save: `$V fault arm status-order`, then focus `Reorder Verification Leave` and press ArrowDown.
  The provider answers 503 to `set_status_type_order`, the route answers 500, and the toast reads
  `We couldn't confirm the status order change. The list shows the saved order.` with `Report error`. Restore with
  `$V fault restore`. The group is `Error`, `Server exception`, `PUT /org/[orgId]/api/status-types/order`.
- A save whose reply is lost: `$V fault arm status-order-lost-ack` commits the change and answers 503. The group is
  `RequestFailure`, `Server error`.
- A browser-reported failure: from the `calendar/settings` page, `evaluate_script` a same-origin `fetch` with
  `method: 'PUT'`, `keepalive: true` and a body of 70000 characters to `/org/ORG/api/status-types/order`. Chrome rejects
  it with `TypeError: Failed to fetch` before any request leaves, the page's own fetch wrapper reports it, and the group
  is `TypeError`, `Unconfirmed save`, `Browser`. The network control cannot produce this group: `arm-fail`,
  `arm-reject` and `arm-hold` replace `window.fetch` above the app's wrapper, so the app never sees those failures and
  their toasts carry no `Report error` (observed with `arm-reject` on a bulk Archive).
- A 4xx that must not be recorded: `evaluate_script` a same-origin `PUT` with body `{}` to the same endpoint; it answers
  400 and the Errors count does not change.
- `$V network arm-hold-regions|arm-fail-regions PAGE admin-errors-read` holds or fails the streamed list on a filter or
  page change. `$V network arm-fail PAGE admin-errors/resolve` fails the Resolve POST. Restore with `network restore`.

## Driving it with verify:app

Run each journey on a fresh worker or read the counts before and after; groups persist for 30 days.

1. **Server failure to linked report.** As `calendarConfigure` on `calendar/settings`, arm `status-order`, press ArrowDown
   on `Reorder Verification Leave`, then in the same command choose `Report error` within 15 seconds (a snapshot taken
   in a later command finds the toast gone). Expected: the toast shows `Report error`; the dialog `Send Feedback` has
   Category `Bug Report` disabled, the read-only `Error reference` holds a UUID, the message field is labelled
   `What were you doing?` and `Submit` is disabled until text is typed. Submit a unique message. Expected: the dialog
   closes and the operator's Inbox lists the Feedback.
2. **Group on the Errors page.** As `platformReviewer`, choose `Errors`. Expected: `PLATFORM · N OPEN`, one row
   `Error · Server exception` with `Synthetic verification provider fault`, `PUT /org/[orgId]/api/status-types/order`,
   count, people `1 person`, `Just now`, and a `Feedback report from <date>` link to
   `/admin?item=feedback%3AID`. Repeating step 1's failure raises the count and keeps one row.
3. **Resolve and recurrence.** Choose `Resolve Error: Synthetic verification provider fault`. Expected: Open shows
   `No open errors in the last 30 days.`, `Resolved` lists the group, and Activity reads the `error_group.resolved`
   sentence. Trigger the same failure again and reload `Errors`. Expected: the group is Open again with the count raised
   by one.
4. **Browser-reported group.** Send the oversized keepalive `PUT` described above, then reload `Errors`. Expected: a row
   `TypeError · Unconfirmed save · Browser` with `Failed to fetch` and `PUT /org/[orgId]/calendar/settings`, count 1.
   Send the 4xx `PUT` too and require no further row.
5. **Skeleton and load error.** With the page on `Resolved`, `arm-hold-regions PAGE admin-errors-read` and choose
   `Open`. Expected: the header and filter stay, `Loading errors` is announced and the table shows skeleton rows that
   keep the list's height; `release` fills the rows. `arm-fail-regions` and choose `Resolved`. Expected: the alert
   `Unable to load Errors` with `The list could not be loaded. Your filter is unchanged.` and `Retry Errors`; `restore`
   and `Retry Errors` load the list.
6. **Resolve failure.** `arm-fail PAGE admin-errors/resolve`, choose `Resolve`. Expected: the alert
   `Could not resolve this error. Reload before trying again.`, the row stays and no Activity event is written.
7. **Widths.** At 1280, 1000 and 390 the page has no horizontal scroll. At 390 each row stacks: name and badges, the
   message, the route, then `N time(s)`, `N person/people`, last seen and `Resolve`. The toast and the dialog fit the
   viewport at 390 and 900, the dialog's `Submit` above `Cancel` at 390.

## Gotchas

- The toast lasts 15 seconds. A fault armed, triggered, snapshotted and clicked in separate commands loses it; chain the
  trigger and the click.
- The Errors link and the toast button need a reference noted in the last 3 seconds. A failure whose report is still
  being sent shows `Attaching error details...` in the dialog until it settles.
- `restart` clears groups; `clean-seeds` does not touch them. Feedback sent through the UI stays until a restart.
- The operator's clock and the database share the host clock. A group seeded hours earlier reads `6 hr ago`.
- Occurrence retention is a scheduled cleanup, not a page action; the cleanup route test and the SQL test own it.
