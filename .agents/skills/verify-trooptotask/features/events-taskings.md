# Events & Taskings

An Event is something the unit runs, supports or needs to know about, on one date or a range of dates. An
Organization-wide Calendar operator creates, edits and cancels Events. Every Calendar reader lists them and opens their
detail. There is no delete: a cancelled Event stays on record with who cancelled it, when and why. Settings › Features
`Events & Taskings` turns the whole feature off. Taskings arrive in a later slice.

## Sub-features

- `event-list`: `Upcoming` (ends today or later, earliest first) and `Past` (latest first, the 100 most recent) under
  one toolbar view switch, with `?when=past` in the URL. A row reads the date range, the title, the host and the
  coordinator, and a status badge `Upcoming`, `Ongoing`, `Past` or `Cancelled`. A cancelled title is struck through.
- `event-create`: the `Create event` sheet. Title, dates and host are required and come first. Location, source
  reference and description sit behind `Add location, source and notes`. The coordinator defaults to the creator.
- `event-edit`: the same sheet, filled. `Save changes` stays disabled until something changes.
- `event-cancel`: a confirmation with an optional reason. The detail then shows who cancelled it and when, and Edit and
  Cancel are gone.
- `event-activity`: the detail's `Activity` list, oldest first, written by the database for created, dates changed,
  coordination changed and cancelled.
- `event-access`: Group-scoped operators and Calendar viewers read Events with no controls, and the server refuses their
  writes. A member without Calendar access gets 403. Another Organization's Event is 404, and its id under the viewer's
  own Organization reads `This event is not available`.
- `event-feature-off`: the toolbar action, the list, the detail and the API all go away with the switch.

## How to get to it (user POV)

Open `Calendar`. The toolbar action `Events & Taskings` opens `/org/ORG/calendar/events`; below about 1024 px it sits in
`More Calendar controls`. The list has `Upcoming` / `Past`, a `Calendar` action back to the month, and `Create event`
for an operator. A row opens `/org/ORG/calendar/events/EVENT_ID`, whose header has `Back to Events`, the title, the
status badge and, for an operator, `Edit` and `Cancel event`. Facts follow (Dates, Host, Coordinator, Location, Source,
Description), then `Activity`.

Member labels are the membership email, or the first eight characters of the user id and `...` when the email is empty.
Fixture memberships have no email, so labels read like `4bdb4963...`.

## Helper controls

`$V rows calendar_events orgA` and `$V rows calendar_event_activity orgA` read the stored rows; filter Activity with
`event_id ID`. `$V rows audit_logs orgA` shows `calendar_event.created`, `.updated` and `.cancelled`.
`$V network arm-observe|arm-fail PAGE calendar-events` matches only `POST /org/A/api/calendar-events`, the create. The
hook lives in the page, so arm it after the last navigation; a reload removes it.

## Driving it with verify:app

Preconditions: worker 1 launched and `doctor` clean. `$V actor calendarOperate calendar` returns the operator's `PAGE`;
`calendarScoped`, `calendarView`, `calendarForeign` and `orgOwner` take the same `calendar` destination. A member with
no Calendar access comes from `npm run verify:app -- login viewer --worker 1`. The `actor` destinations do not include
`calendar/events`, so use the toolbar action or `navigate_page` with an absolute URL. Dates below assume a browser day
in late October 2026; on a later day pick later dates with the same shapes. Use unique titles.

1. **Empty and create.** As `calendarOperate` at 1440, open `Events & Taskings`. With no Events the list shows the
   `No upcoming events` empty state and a `Create event` button. Click the toolbar's `Create event`. Focus is in
   `Title`. Press `Create event` with nothing filled: no request leaves, and `Title`, `Start date` and `End date` are
   invalid. Fill a title, pick Tuesday 10 Nov 2026 as the start (the end follows it), then pick 12 Nov as the end. Keep
   `This organization`. Arm `$V network arm-observe PAGE calendar-events` and press `Create event` twice quickly.
   Exactly one `POST` returns 200, and the page moves to the new Event's detail with `10 – 12 Nov 2026`, the badge
   `Upcoming` and one Activity entry. `$V rows calendar_events orgA` shows `starts_on 2026-11-10`, `ends_on 2026-11-12`
   and `created_by` set to the operator.
2. **External host with a source.** Create a second Event, `1 – 4 Dec 2026`, `Another host` named `1-1 BN`. Open
   `Add location, source and notes` (its chevron turns) and fill a location, `https://example.mil/opord` and a two-line
   description. Type `javascript:alert(1)` as the source first and save: the field is invalid with its link message and
   the request does not leave. Restore the https link and save. The detail shows the host name, the source as a link
   opening a new tab, and the description keeping its line break.
3. **One-day awareness Event.** Create `20 Nov 2026` with start and end the same, host `2nd BDE`, source
   `BDE OPORD 27-03`. The list row and the detail read `20 Nov 2026`, and the source shows as text.
4. **Edit and reload.** On the first Event press `Edit`. `Save changes` is disabled. Move the end to 13 Nov and switch
   the host to `Another host` `1-1 BN`. Save. The sheet closes, focus returns to `Edit`, the dates read
   `10 – 13 Nov 2026`, and Activity adds a dates entry and a coordination entry naming only the host. Reload: the dates
   are unchanged. Repeat the reload with the browser in a zone west of UTC; no date moves.
5. **Cancel.** On the one-day Event press `Cancel event`. The dialog asks to confirm, with `Keep event` and a reason
   field. Enter a reason and confirm. A banner reads who cancelled it and when, with the reason under it. Edit and
   Cancel are gone, Activity ends with the cancellation and its reason, and the list shows the row struck through with
   `Cancelled`. `$V rows calendar_events orgA` shows `cancelled_by`, `cancelled_at` and the reason.
6. **Failed save.** On the list, after the last navigation, arm `$V network arm-fail PAGE calendar-events`. Create an
   Event with a location and press `Create event`. The sheet stays open with every entry kept, the inputs re-enable, and
   a `Not saved` alert appears at the top of the sheet, scrolled into view. `$V rows calendar_events orgA` has no new
   row. `network restore PAGE`, then press `Create event` again: it saves once.
7. **Widths.** Capture the list, the detail and the sheet at 1440, 900 and 390. At 900 the toolbar action moves into
   `More Calendar controls`. At 390 a list row stacks the dates over the title and the badge, and the sheet fills the
   screen with the footer reachable.
8. **Read-only roles.** As `calendarScoped` and `calendarView`, open the list and a detail. Every Event shows, with no
   `Create event`, `Edit` or `Cancel event`. From the page, `fetch` a `POST` to `/org/A/api/calendar-events`, a `PATCH`
   to `/org/A/api/calendar-events/ID` and a `POST` to `/org/A/api/calendar-events/ID/cancel`: each returns 403 and
   `$V rows calendar_events orgA` is unchanged.
9. **No Calendar access.** As the `viewer` login, open the detail URL. The page is the 403 error, and
   `/org/A/calendar/events/__data.json` ends in a 403 error node with no Event title in the body. The create `POST`
   returns 403.
10. **Another Organization.** As `calendarForeign`, open A's detail URL: 404. Open B's events path with A's Event id:
    `This event is not available` with `Back to Events`, and no Activity section. The three writes against A, and an
    edit or cancel of A's id under B, all return 404.
11. **Feature off.** As `orgOwner`, open Settings › Features and turn `Events & Taskings` off.
    `$V rows organizations orgA` lists `eventsAndTaskings` in `disabled_features`. As the operator, the Calendar toolbar
    has no `Events & Taskings` action, the list and detail URLs show `Events & Taskings is off`, and the three writes
    return 403. Turn it back on and read `disabled_features` empty again.
12. **Export.** As `orgOwner` on `settings/exports`, export JSON as in [Organization exports](organization-exports.md).
    `calendarEvents` and `calendarEventActivity` hold A's Events and Activity, and the Excel `Events` sheet lists each
    Event with its host and coordinator. With the switch off, both sections are absent.

Restore network hooks, then run `$V clean-seeds` before `verify:app cleanup`. Events created by the drive stay in the
disposable database until `verify:app restart`.

## Lower-level checks

`src/features/calendar/events/eventModel.test.ts`, `eventOperations.server.test.ts`,
`components/EventDialog.svelte.test.ts` and `components/eventLabels.test.ts` cover the draft rules, the operations and
the dialog below the UI. `supabase/tests/calendar_events.sql` proves the RLS, the database-written attribution and
Activity, and the cancel function as ordinary signed-in users; run it with the disposable database procedure in the
Definition of Done.
