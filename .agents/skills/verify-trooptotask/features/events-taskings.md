# Events & Taskings

An Event is something the unit runs, supports or needs to know about, on one date or a range of dates. An
Organization-wide Calendar operator creates, edits and cancels Events. Every Calendar reader lists them and opens their
detail. There is no delete: a cancelled Event stays on record with who cancelled it, when and why.

A Tasking is an outcome the unit owes by a suspense date. It is owned by one Group or by the Organization, and it is
standalone or linked to one Event. A Calendar operator creates, edits, links, unlinks and moves Taskings through `Open`,
`In progress`, `Blocked`, `Completed` and `Cancelled`; a Group-scoped operator does so only for their Groups. Settings ›
Features `Events & Taskings` turns the whole feature off.

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
- `tasking-list`: `Active`, `Overdue`, `Blocked`, `Completed` and `Cancelled` under one view switch, plus search and
  `Event`, `Responsible` and `Dates` selects. Every filter lives in the URL (`view`, `q`, `event`, `for`, `within`) and
  survives Back. A row reads `Starts` or `Due` with that date, the outcome, the owner and the Event or `Standalone`,
  then the status badge and an attention badge `Overdue`, `Due today` or `Due soon`. Closed views hold the 100 most
  recent.
- `tasking-create`: the `Create tasking` sheet. Outcome, Responsible and Suspense are required and come first;
  Responsible starts empty for an Organization-wide operator. Event is optional. Execution dates, report time, people
  needed, qualifications and instructions sit behind `Add execution dates, staffing and instructions`.
- `tasking-from-event`: `Create and add tasking` in the Event sheet, and `Add tasking` on Event detail, open the Tasking
  sheet with that Event chosen. The Event detail lists its Taskings.
- `tasking-edit`: the same sheet, filled, with `Make standalone` for a linked Tasking. Rerouting, relinking and
  unlinking keep the Tasking's identity and write Activity.
- `tasking-lifecycle`: header actions follow the status. `Start`, `Unblock` and `Reopen` act at once. `Block` needs a
  reason, `Complete` takes an optional note and `Cancel tasking` an optional reason, each in a confirmation. The
  database refuses any other move with 409. Completed and cancelled Taskings cannot be edited.
- `tasking-access`: a Group-scoped operator sees and changes only their Groups' Taskings, creates only for them, and
  cannot move responsibility. A Calendar viewer reads every Tasking with no controls. Writes outside a caller's reach
  return 403, or 404 when the Tasking is hidden from them.

## How to get to it (user POV)

Choose `Events & Taskings` under `Calendar` in the sidebar, or the Calendar toolbar action `Events & Taskings`. Both
open the Taskings list `/org/ORG/calendar/taskings`; below about 1024 px the toolbar action sits in
`More Calendar controls`. The sidebar item stays current and the breadcrumb reads `Calendar › Events & Taskings` on
every events and taskings page, including detail pages.

The list has `Upcoming` / `Past`, a `Calendar` action back to the month, and `Create event`
for an operator. A row opens `/org/ORG/calendar/events/EVENT_ID`, whose header has `Back to Events`, the title, the
status badge and, for an operator, `Edit` and `Cancel event`. Facts follow (Dates, Host, Coordinator, Location, Source,
Description), then `Activity`.

`Events` and `Taskings` tabs sit under the heading of both lists. The Taskings list is `/org/ORG/calendar/taskings` with
`Create tasking` for an operator. A row opens `/org/ORG/calendar/taskings/TASKING_ID`, whose header has
`Back to Taskings`, the outcome, the badges and, for an operator who owns it, the lifecycle actions and `Edit`. A banner
names who blocked, completed or cancelled it. Facts follow (Responsible, Event, Suspense, Execution, Report time,
Requirement, Instructions), then `Activity`. At 900 the selects move into `Filters`; at 390 the view switch joins them.

Member labels are the membership email, or the first eight characters of the user id and `...` when the email is empty.
Fixture memberships have no email, so labels read like `4bdb4963...`.

## Helper controls

`$V rows calendar_events orgA` and `$V rows calendar_event_activity orgA` read the stored rows; filter Activity with
`event_id ID`. `$V rows audit_logs orgA` shows `calendar_event.created`, `.updated` and `.cancelled`.
`$V network arm-observe|arm-fail PAGE calendar-events` matches only `POST /org/A/api/calendar-events`, the create. The
hook lives in the page, so arm it after the last navigation; a reload removes it. `$V rows calendar_taskings orgA` and
`$V rows calendar_tasking_activity orgA` read Taskings and their Activity; filter with `tasking_id ID` or
`responsible_group_id ID`. `$V network arm-fail PAGE calendar-taskings` fails the next Tasking create, the same way.

The toolbar's `Event`, `Responsible` and `Dates` listboxes show their options in a screenshot but not in a plain
`take_snapshot`. Take a `verbose` snapshot and click the option UIDs in order, or `navigate_page` with the filter query.

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
    `$V rows organizations orgA` lists `eventsAndTaskings` in `disabled_features`. As the operator, the sidebar and the
    Calendar toolbar have no `Events & Taskings`, the list and detail URLs show `Events & Taskings is off`, and the
    three writes return 403. Turn it back on and read `disabled_features` empty again.
12. **Export.** As `orgOwner` on `settings/exports`, export JSON as in [Organization exports](organization-exports.md).
    `calendarEvents` and `calendarEventActivity` hold A's Events and Activity, and the Excel `Events` sheet lists each
    Event with its host and coordinator. With the switch off, both sections are absent.

13. **Tasking from an Event.** As the operator, create an Event with `Create and add tasking`. The page moves to the
    Event's detail and the Tasking sheet opens with that Event chosen; the URL has no `addTasking` left. Press
    `Create tasking` with nothing else filled: `Outcome`, `Responsible` and `Suspense` are invalid and no request
    leaves. Fill them with `Alpha` and a suspense three days ahead, then press `Create tasking` twice quickly. One
    `POST` returns 200 and the Tasking appears under the Event's `Taskings`. `$V rows calendar_taskings orgA` shows
    `responsible_group_id` Alpha, the Event id and `created_by` the operator.
14. **Organization Tasking.** From the Taskings list, create a standalone Tasking owned by `Verification Organization A`
    with a suspense in the past. Its row reads `Due`, the date and `Overdue`, and `?view=overdue` lists it.
15. **Lifecycle.** On that Tasking press `Start`, then `Block`: `Block` in the dialog stays disabled until a reason is
    filled. Then `Unblock`, `Complete` with a note, `Reopen` and `Cancel tasking` with a reason. Each move changes the
    badge and the actions, the banners name the actor, and Activity gains started, blocked, unblocked, completed,
    reopened and cancelled in order. From the page, a `POST` of `start`, `complete` or `reopen` to
    `/org/A/api/calendar-taskings/ID/status`, and a `PATCH` of the cancelled Tasking, each return 409.
16. **Edit and reload.** On the linked Tasking press `Edit`, move it to `Bravo`, `Make standalone`, change the suspense
    and set `People needed`. Save. Responsible, Event and Suspense update, and Activity reads the responsibility,
    unlink, dates and requirement changes. Reload: the facts are unchanged. Relink it to the Event and move it back to
    Alpha.
17. **Filters and Back.** With Taskings across both Groups, the Organization and every status, choose `Alpha` in
    `Responsible` and `Next 7 days` in `Dates`; the URL reads `?for=ALPHA_ID&within=7` and only Alpha Taskings due
    within a week remain. Open a row and press the browser's Back: the URL, the selects and the rows return unchanged.
    Search `lmtv` writes `?q=lmtv` without a new history entry. `Event` narrows to one Event or `Standalone`.
18. **Failed Tasking save.** On the list, arm `$V network arm-fail PAGE calendar-taskings`, open `Create tasking`, fill
    the three required fields and save. The sheet keeps every entry under a `Not saved` alert and
    `$V rows calendar_taskings orgA` has no new row. Press `Create tasking` again: it saves once and opens the detail.
19. **Tasking widths.** Capture the Taskings list, a Tasking detail and the edit sheet at 1440, 900 and 390. At 390 a
    row stacks the date over the outcome and the badges, the actions wrap under the title, and `scrollWidth` equals the
    viewport.
20. **Scoped Tasking operator.** As `calendarScoped` (Alpha), the list shows only Alpha Taskings and no
    Organization-owned ones. `Create tasking` offers only `Alpha`, already chosen. `Edit` on an Alpha Tasking shows
    `Responsible` disabled. A Bravo Tasking's URL reads `This tasking is not available`. From the page, a create for
    Bravo or the Organization and a reroute of an Alpha Tasking to Bravo return 403; an edit or move of a Bravo or
    Organization Tasking returns 404. `$V rows calendar_taskings orgA` changes only for an allowed Alpha move.
21. **Tasking read-only and outsiders.** As `calendarView` the list and detail render with no `Create tasking`, actions
    or `Edit`, and the three writes return 403. As the `viewer` login the list and detail are the 403 page and the
    writes return 403. As `calendarForeign` A's Taskings URLs are 404 and the writes return 404. No row changes.
22. **Taskings off and exported.** With `Events & Taskings` off, the Taskings list and detail show
    `Events & Taskings is off` and the writes return 403. With it on, the JSON export holds `calendarTaskings` and
    `calendarTaskingActivity`, and the Excel `Taskings` sheet lists each outcome with its Event or `Standalone` and its
    owner or `This organization`.

Restore network hooks, then run `$V clean-seeds` before `verify:app cleanup`. Events and Taskings created by the drive
stay in the disposable database until `verify:app restart`.

## Staffing

A Calendar operator picks the people for a Tasking from its detail page. A Group Tasking draws on the responsible
Group's active roster and an Organization Tasking on the whole active roster, ungrouped people included. The picker
shows each person's overlapping availability and other Taskings as advisories that never block a pick. One save replaces
the whole selection against the revision the picker loaded. A picked person who is archived or leaves the responsible
Group stays on the list as `Needs review`, drops out of the count and waits for an explicit `Keep` or `Remove`.

- `staffing-people`: the `People` section below the facts reads `N of R picked` (or `N picked` with no requirement),
  lists each pick with its Group on an Organization Tasking, and ends with `N people outside your Groups` for a
  Group-scoped reader. It has its own skeleton and load error.
- `staffing-picker`: `Assign people` opens a sheet with search, a `Group` select on an Organization Tasking only, a live
  `N selected of R needed` count and one checkbox row per candidate with its advisories. A Group-scoped operator gets an
  extra `Remove N people outside your Groups` checkbox when such picks exist; left alone, they stay picked.
- `staffing-save`: a stale revision returns 409 with the stored list. The sheet keeps the operator's choices under an
  alert naming who is saved now, and the next save replaces it. A failed save keeps the draft. Resending a saved list
  answers `unchanged` and writes nothing.
- `staffing-review`: archive or a Group move flags a pick `Needs review` with `Archived`, `Moved to GROUP` or
  `No longer in a Group`. Restoring or moving back reads `Eligible again` and adds `Keep`; the flag stays until someone
  acts. A Completed or Cancelled Tasking keeps its picks as they stood; reopening flags whoever changed meanwhile.
- `staffing-counts`: the Taskings list row's muted line ends `· N of R picked`. Picks under review never count.
- `staffing-delete-guard`: permanently deleting a picked Person, or deleting a Group responsible for a Tasking, is
  refused with 409 and a message naming the Taskings.

### Helper controls

`$V rows calendar_tasking_participants orgA tasking_id ID` reads the stored picks with `selected_by`, `selected_at` and
`review_since`; `$V rows calendar_taskings orgA` shows `staffing_revision`, and `$V rows audit_logs orgA` shows
`calendar_tasking.staffed` once per change. No `network` family matches the people endpoint. To fail one save, run this
with `tool evaluate_script` after the last navigation; it answers the next `PUT .../people` with 503 and then removes
itself:

```js
() => {
	const real = window.fetch;
	window.fetch = (input, init) => {
		if (init?.method === 'PUT' && String(input).endsWith('/people')) {
			window.fetch = real;
			return Promise.resolve(new Response('{"message":"Service unavailable"}', { status: 503 }));
		}
		return real(input, init);
	};
};
```

The fixture has SPC Able in Alpha, SPC Baker in Bravo with `Verification Training` over 25 – 27 Oct 2026, and SPC
Unassigned. Group moves go through `POST /org/A/api/personnel/group-membership` with `{ personnelIds, groupId }` from
the `orgOwner` page; archive with `$V personnel-archive-batch PAGE orgA '["ID"]'` and restore with a `PATCH` of
`{ action: 'restore', id }` to `/org/A/api/personnel`.

### Driving it

Create, as `calendarOperate`, an Alpha Tasking needing 2, an Organization Tasking needing 3 and a Bravo Tasking needing
1, each executing 26 – 28 Oct 2026, through `Create tasking` or a `POST` to `/org/A/api/calendar-taskings`.

1. **Organization-wide picker.** At 1440 open the Organization Tasking. `People` reads `0 of 3 picked` with an empty
   state. `Assign people` lists all three people with their Groups (`Unassigned` for SPC Unassigned), and Baker carries
   `Verification Training · 25 – 27 Oct 2026` in the warning colour. `Group` `Bravo` leaves only Baker; search `unass`
   leaves only SPC Unassigned. From the search field, Tab and Space pick all three and the count reads
   `3 selected of 3 needed`. `Save people` closes the sheet; `People` reads `3 of 3 picked`, and Activity adds
   `Picked SPC Able, Synthetic; SPC Baker, Synthetic and SPC Unassigned, Synthetic`.
2. **Group picker.** On the Alpha Tasking the picker has no `Group` select and lists only SPC Able, now carrying the
   Organization Tasking's title and `26 – 28 Oct 2026`. Pick Able and save: `1 of 2 picked`.
3. **List counts.** The Taskings list rows end `· 1 of 2 picked`, `· 3 of 3 picked` and `· 0 of 1 picked`.
4. **Retry is a no-op.** From the page, `PUT` the same list with the same `expectedRevision` twice. The first answers
   `saved`, the second `unchanged` with the same revision, and the participant rows and audit rows do not grow.
5. **Concurrent edit.** Open a second `calendarOperate` page. Open the Organization Tasking's picker in both. In the
   second, clear SPC Unassigned and save. In the first, clear Baker and save. The sheet stays open with
   `Someone else saved this list while you were choosing` listing Able and Baker, and the first page's choices (Able and
   Unassigned) still ticked. Save again: `2 of 3 picked`, and Activity holds both changes in order.
6. **Failed save.** Open the picker, run the one-shot override above, change a pick and save. The sheet keeps the choice
   under `The people were not saved…`, and `$V rows calendar_tasking_participants` is unchanged. Save again: it closes.
7. **Needs review.** Move Able to Bravo. The Alpha Tasking reads `0 of 2 picked`, Able shows `Needs review` and
   `Moved to Bravo` with only `Remove`, and a note explains reviewed picks do not count. Move Able back: the row reads
   `Eligible again` with `Keep` and `Remove`. Press `Keep`: `1 of 2 picked`, and Activity adds
   `Kept SPC Able, Synthetic after review`. Archive SPC Unassigned (picked on the Organization Tasking): `Archived`.
   Restore them: still `Needs review`, now `Eligible again`. Press `Remove`; Activity adds the removal.
8. **Group-scoped operator.** Move Able to Bravo again. As `calendarScoped`, the Alpha Tasking reads `0 of 2 picked` and
   `1 person outside your Groups` with no name and no review note; Activity reads `Picked 1 other person`. The picker
   says `Nobody on this roster is active.` and offers `Remove 1 person outside your Groups`. Tick it and save:
   `Nobody is picked yet`, Activity `Removed 1 other person`, and no participant row remains. From the page, `GET` and
   `PUT` `/org/A/api/calendar-taskings/ID/people` for the Organization and Bravo Taskings return 404; a `PUT` on the
   Alpha Tasking naming Baker or SPC Unassigned returns 409 and stores nothing.
9. **Read-only and outsiders.** As `calendarView`, a detail shows the names with no `Assign people`, `Keep` or `Remove`,
   and `GET` and `PUT` on `.../people` return 403. The `viewer` login gets 403 from both, and the detail's `__data.json`
   ends in a 403 node with neither the title nor a name. As `calendarForeign`, A's detail is 404 and both calls
   return 404.
10. **Widths.** Capture the Organization detail, the picker, the Taskings list, the scoped `People` section and a review
    row at 1440, 900 and 390. At 390 the sheet fills the screen with `Save people` and `Cancel` stacked and reachable,
    review actions sit beside the name, and `scrollWidth` equals the viewport.
11. **Delete guards.** Archive Able while picked. As `orgOwner`, Settings › Archives › `Delete SPC Able, Synthetic`,
    type the name and press `Delete permanently`: the dialog stays and a toast reads
    `SPC Able, Synthetic is picked for “…”. Remove them from that tasking before deleting.` The person row remains. In
    Personnel › `Manage Groups`, `Delete Alpha…` › `Delete` while the Alpha Tasking exists shows an alert
    `This Group is responsible for “…”. Move that tasking to another Group or the organization before deleting.`
12. **Export.** As `orgOwner`, the JSON export holds `calendarTaskingParticipants` with `review_since` set on reviewed
    picks, and the Excel `Tasking People` sheet lists each Tasking and person.

`src/features/calendar/taskings/staffing/` tests cover the operations, review derivation and the picker's conflict and
failed-save handling; `supabase/tests/calendar_tasking_staffing.sql` covers candidates, concealment, refused writes,
revisions, review flags and the delete guards as ordinary signed-in users.

## Event detail and shared Events

Event detail groups its Taskings under `Preparation`, `Execution` and `Closeout`. A Tasking is in `Execution` when its
execution dates or its suspense fall within the Event's dates, in `Preparation` when it is due before the Event starts
and in `Closeout` when after it ends. A phase with nothing in it does not render. Rows sort by suspense, then outcome.

A Group-scoped reader sees their Groups' Taskings as the usual rows that open, and every other Tasking linked to the
Event, Organization-level ones included, as a dashed one-line row that does not open: the Group or Organization, the
outcome, the status badge, `Due` with the suspense and `N of R picked` when a count is required. `Blocked` shows with no
reason. Another Group's standalone Tasking appears nowhere. An Organization-wide reader sees every Tasking as an opening
row.

Saving new Event dates opens `Review taskings` above `Taskings`: the Event's active Taskings that moved phase or sit
outside the new dates, each with a note and a link to `/org/ORG/calendar/taskings/ID?edit`, which opens that Tasking's
edit. Nothing about a Tasking changes. `Dismiss` closes the list. `Cancel event` lists the Event's active Taskings in
the dialog under `These taskings stay active and linked to the cancelled event`, and cancels none of them. The cancelled
Event's detail keeps them, with a notice that they stay open.

`$V rows calendar_taskings orgA` before and after a date edit or a cancel must be identical.

Drive it as `calendarOperate` unless noted, with the Event dated 10 – 12 Nov 2026 and an Alpha Tasking due 5 Nov, a
Bravo Tasking due 11 Nov with `People needed` 6 and then blocked with a reason, and an Organization Tasking due 16 Nov,
all linked to it; add a standalone Bravo Tasking.

23. **Groups.** The detail lists `Preparation` (Alpha, 5 Nov), `Execution` (Bravo, 11 Nov) and `Closeout` (Organization,
    16 Nov), each row opening its Tasking. The standalone Bravo Tasking is absent, and no phase shows as an empty box.
24. **Scoped reader.** As `calendarScoped` (Alpha), the Alpha row opens. The Bravo and Organization rows are dashed rows
    with no link: Bravo shows `Blocked` and `N of 6 picked`, with no reason, people or instructions anywhere in the page
    text. From the page, `fetch` the Bravo Tasking's `/org/A/api/calendar-taskings/ID` PATCH and its status POST: 404.
    `/org/A/calendar/taskings/BRAVO_ID` reads `This tasking is not available`. As `calendarView` the same rows show.
25. **Date review.** On the Event press `Edit`, move the dates to 17 – 19 Nov and save. `Review taskings` lists the
    Alpha, Bravo and Organization Taskings with notes, and the Event's rows regroup. Open the Alpha link: its edit sheet
    opens on arrival and the URL has no `edit` left. Back returns to the Event with the list still there, without
    reopening the edit. Edit only the title of the Event and
    save: no review list appears.
26. **Cancel review.** Press `Cancel event`. The dialog lists the three active Taskings as links; complete one first and
    it drops off the list. Confirm. The detail shows the cancellation banner and the notice that the Taskings stay open,
    with every Tasking still `Open`, `In progress` or `Blocked`.
27. **Load states.** Reload the detail with the network slowed: the `Taskings` region shows its skeleton rows, then the
    groups, with no shift of the Activity section beyond the groups themselves. With `arm-fail` on the summary read the
    reader's own rows stay and `Other groups’ taskings could not be loaded` shows with `Retry`.
28. **Widths.** Capture the detail with all three phases, the review list and the cancel dialog at 1440, 900 and 390. At
    390 a row stacks the outcome over its line and the badge, and `scrollWidth` equals the viewport.

## Lower-level checks

`src/features/calendar/events/eventModel.test.ts`, `eventOperations.server.test.ts`,
`components/EventDialog.svelte.test.ts` and `components/eventLabels.test.ts` cover the draft rules, the operations and
the dialog below the UI. The Tasking counterparts live under `src/features/calendar/taskings/`, and
`supabase/tests/calendar_taskings.sql` covers Tasking access, attribution, Activity and the transition function.
`supabase/tests/calendar_event_tasking_summaries.sql` proves, as ordinary Organization-wide and Group-scoped users, that
the summary read returns only its eight summary fields and conceals everything else.
`supabase/tests/calendar_events.sql` proves the RLS, the database-written attribution and Activity, and the cancel
function as ordinary signed-in users; run it with the disposable database procedure in the Definition of Done.

## Equipment and checklist

A Tasking's detail carries an `Equipment` list (a name, a quantity and how many are secured) and a `Checklist` (flat,
ordered, open or done), each with its own add form. The headings read `N of M ready · P partial` and `D of N done`. A
Tasking list row repeats them as `Equipment N of M ready · P partial` and `Checklist D/N`, and only when the Tasking has
items. Neither list moves the Tasking's status. Completed and cancelled Taskings keep both lists on record, read-only.

- `equipment-edit`: `Add equipment` and `Quantity` with `Add to equipment`; per row `Secure one fewer`,
  `Secure one more` and `All secured` (each named after the item), `Move up`, `Move down`, `Edit` and `Remove`.
  `Edit` opens `Equipment`, `Quantity` and `Secured` inline with `Save` and `Cancel`. A row reads `Ready`, `Partial` or
  `Not secured` and `Secured n of N`.
- `checklist-edit`: `Add checklist item` with `Add to checklist`; per row a checkbox named after the item, then
  `Move up`, `Move down`, `Edit` and `Remove`. A done item is struck through with `Done by` and the time.
- `lists-access`: a Group-scoped operator edits only their Groups' Taskings, a Calendar viewer sees both lists with no
  controls, and another Group's Tasking is `This tasking is not available`. Writes outside reach return 403, or 404 when
  the Tasking is hidden; a closed Tasking returns 409.

Helpers: `$V rows calendar_tasking_equipment orgA` and `$V rows calendar_tasking_checklist_items orgA` read the stored
rows (`position`, `secured_quantity`, `done`, `done_by`, `done_at`).
`$V network arm-fail PAGE calendar-taskings/ID/equipment` (or `/checklist`) fails the next add for that Tasking.
`rows calendar_tasking_activity` shows `equipment_*` and `checklist_*` kinds. Seed Taskings and items with a same-origin
`fetch` from the page: `POST` to `/org/A/api/calendar-taskings` with `{id, draft}`, then to `.../ID/equipment` with
`{id, draft: {name, quantity, securedQuantity}}` or `.../ID/checklist` with `{id, label}`.

1. **Add.** As `calendarOperate` at 1440, open an Alpha Tasking. `Equipment` reads `None required` and `Checklist` reads
   `No items`. Add `Litters` x 4 and `Radios` x 2, then two checklist items. Each add appears at once, the heading reads
   `0 of 2 ready` and `0 of 2 done`, and the inputs clear. `$V rows` shows `position` 1 and 2 and `created_by` the
   operator; the checklist rows are `done false`. Activity gains one entry per add.
2. **Secure, tick and reorder.** `All secured: Litters`: the row reads `Ready`, `Secured 4 of 4`, the heading
   `1 of 2 ready`. `Secure one more Radios`: `Partial`, `1 of 2 ready · 1 partial`. Tick the first checklist item: it is
   struck through with `Done by` and the time, the heading reads `1 of 2 done`, and `done_by`/`done_at` are set in the
   row. `Move Radios up` swaps the rows and `position` follows. Untick: `done_by` and `done_at` clear. Reload: the
   order, counts and ticks are unchanged.
3. **Edit.** `Edit` a row, set `Secured` above `Quantity` and press `Save`: `Secured` is invalid with
   `Secured cannot be more than the quantity.` and no request leaves. Fix it and save: the row updates, and Activity
   gains a changed entry for a new name or quantity and a secured entry for a new secured count.
4. **Failed add.** After the last navigation arm `$V network arm-fail PAGE calendar-taskings/ID/equipment`. Add
   `Stretchers` x 3: an alert reads `The equipment was not added. Your entry is kept, so try again.`, the entry stays in
   the form and `$V rows` has no new row. `network restore PAGE`, press `Add to equipment` again: it saves once.
5. **Remove.** `Remove` a row and an item: each disappears, the heading counts fall, and Activity gains a removed entry.
   With no items left the summary goes, the list reads `None required` or `No items`, and the Tasking list row loses
   its summary.
6. **List rows.** On the Taskings list the Alpha row reads `Equipment 1 of 3 ready · 2 partial` and
   `Checklist 1/2` in the title column, with no layout shift when it appears, and rows without items show nothing.
7. **Widths.** Capture the list, the detail and the `Equipment` and `Checklist` sections at 1440, 900 and 390;
   `scrollWidth` equals the viewport. At 390 the row actions wrap under the item and the add forms stack with a full
   width `Add`.
8. **Scoped operator.** As `calendarScoped` the list shows only Alpha Taskings with their summaries, and an Alpha detail
   has every control. A Bravo or Organization Tasking's detail reads `This tasking is not available`. From the page, a
   `POST` to a Bravo or Organization Tasking's `equipment` or `checklist`, a `PUT` reorder and a `PATCH` of one of its
   items return 404 and `$V rows` is unchanged.
9. **Read-only roles.** As `calendarView` both lists render with no add form and disabled checkboxes, and the same
   writes return 403 on an Alpha, Bravo and Organization Tasking. As the `viewer` login the detail is the 403 page, and
   as `calendarForeign` it is 404.
10. **Closed Tasking.** `Complete` a Tasking with items: the lists stay, with no add form or row actions. A `POST` to
    its `equipment` returns 409. `Reopen` restores the controls.
11. **Export and activity.** The JSON export holds `calendarTaskingEquipment` and `calendarTaskingChecklistItems`; the
    Excel `Tasking Equipment` and `Tasking Checklist` sheets name each Tasking by its outcome and each completer by
    email. Settings › Logs reads `Added equipment Litters on Provide four trauma-lane medics` and its siblings.

## Calendar markers

The Calendar shows Events, Suspenses and picked execution dates beside availability, behind the `Events & Taskings`
switch. One `calendar-range` read with `collections=events` carries them with the visible range. Sub-features:
`calendar-events-lane`, `calendar-suspense-lane`, `calendar-commitment`, `calendar-marker-overflow`,
`calendar-marker-3-month`, `calendar-marker-failure`, `calendar-marker-feature-off`.

Data (October 2026, today is 26 Oct): Events `Field exercise` 27-29 Oct, `Range day` 28 Oct, `Quarterly inspection`
28-30 Oct, `Block leave` 20 Oct-4 Nov. Taskings `Submit roster` (Alpha, suspense 30 Oct, execution 27-29 Oct, SPC Able
picked), `Inventory` (Organization, suspense 30 Oct, execution 28-31 Oct, Able and Baker picked), `Weapons qual`
(Bravo, suspense 3 Nov, execution 3-5 Nov, Baker picked). Create them as `calendarOperate` with the forms in steps 1-3
and the Staffing steps, or `PUT` the picks to `calendar-taskings/ID/people`.

1. **Month.** As `calendarOperate` on `/calendar` in `Month`: below the date headers `Events` reads `4` and `Suspenses`
   reads `2 due`. `Block leave` is one span from the 20th. Days with more Events than fit show a count; its button
   opens a list of every Event that day, each linking to its detail. `Suspense: Submit roster` is a diamond on the
   30th with a `+1` button listing the second Suspense. Able's row has a hatched rail under 27-31 Oct and Baker's under
   28 Oct-5 Nov, each labelled `Tasking: TITLE, DATES`; days two picks share read `2 Taskings` and open a list. The
   rails sit apart from availability fills and `+` cells: clicking a day's `+` still opens Add availability, and the
   daily-assignment header action is unchanged.
2. **Requests.** Reload: exactly one `calendar-range?rangeStart=2026-10-01&rangeEnd=2026-10-31&collections=events`
   follows, with no per-cell, per-Event or per-person request. `Next month` inside coverage sends none.
3. **Keyboard.** Tab from the toolbar: the Event links, diamonds, rails and `+N` buttons take focus in reading order
   with a visible ring (`:focus-visible` matches). Enter on `Suspense: Inventory` opens that Tasking's detail; Escape
   closes an open overflow list and returns focus to its button.
4. **3-Month.** `3-Month` shows the same Events and Suspenses as lanes under the date row (`Events`, `Suspenses`), and
   the same rails on each row. The lanes stay put while the roster scrolls vertically.
5. **Scoped.** As `calendarScoped` (Alpha only) all four Events show, only `Suspense: Submit roster` and its rail show,
   and Baker's row and the Bravo and Organization Taskings are absent. As `calendarView` the Organization Tasking
   `Inventory` shows with its rails and the Alpha and Bravo Taskings are absent.
6. **Save and return.** From a marker open an Event, `Edit`, rename it, `Save changes`, then press `Calendar` in the
   sidebar: the lane and the labels carry the new title, after one more `collections=events` read.
7. **Projection failure.** The server answers a failed projection in band, so only the Events region fails. In the
   page, wrap `window.fetch` so a `calendar-range` response gets `projection: { kind: 'failed' }`, then press
   `Next month`: `Events` reads `Events could not be loaded.` with `Retry`, `Suspenses` reads `Suspenses could not be
loaded.`, the matrix, `+` cells and toolbar keep working and no page alert shows. Remove the wrapper and press
   `Retry`: the lanes fill. While the read is in flight both lanes hold a skeleton at the loaded height, and the
   matrix does not move. `$V network arm-fail PAGE calendar-range` instead fails the whole read, so the page alert
   shows as well as the lane errors.
8. **Feature off.** As `orgOwner` turn `Events & Taskings` off in Settings › Features. As `calendarOperate` the
   Calendar has no `Events`, `Suspenses` lane, rail or legend entry, no `Events & Taskings` action, and `Next month`
   past coverage requests `collections=availability%2Cassignments` only, never `events`. Turn it back on.
9. **Widths.** Capture Month and 3-Month at 1440, 900 and 390; `scrollWidth` equals the viewport. At 390 the lanes
   scroll with the dates and their labels stay pinned left; markers are never smaller text and never stack.

Expected values are written here, never read from a design file. `src/features/calendar/projection/` and
`src/features/calendar/components/projection/` tests cover the lane layout, overflow lists and commitment runs, and
`supabase/tests/calendar_range_projection.sql` proves the read as ordinary Organization-wide and Group-scoped users.

## Dashboard

The Dashboard's Needs you queue lists each active Tasking once, under its most urgent kind: `Overdue` (past suspense,
most days late first), `Blocked` (status Blocked, suspense soonest), `Short` (still executing or starting within 14
days with fewer picked than needed, or an equipment item not ready; execution start soonest) and `Due soon` (suspense
within 7 days). `Overdue` ranks with Overdue evaluations, `Blocked` after Expired, `Short` with Unfilled and `Due soon`
after Stalled. The subtitle names the owner, the Event, `N of R picked` and `N equipment items not ready`. Picks under
review never count. Short rows offer `Pick people`; the others link to the Tasking. It is a separate source with its
own pending row, `Needs you is incomplete. Tasking items could not load.` with `Try again`, and a header count.

Seed as `calendarOperate` from the page with one `POST` each to `/org/A/api/calendar-taskings` (body `{ id, draft }`)
and `.../status` (`{ action: 'block', reason }`, `start`, `complete`), dates relative to the browser day D: Alpha
`Overdue` due D-3 and Organization `Overdue` due D-6; Alpha due D+3, then `block` it; Alpha needing 2 executing D+3 to
D+4 due D+5 with one `Aid bag` (quantity 2, secured 1) at `.../equipment`; Bravo needing 1 executing D+2; an
Organization Tasking needing 3 executing D+7; Alpha due D+4 with no requirement; a completed one due D-4; and one
executing next month. Nine rows show.

1. **Operator.** As `calendarOperate` at 1440, `Needs you · 9` lists, in order, Overdue (D-6, `6 days late`), Overdue
   (D-3), Blocked, the two Unfilled duty rows, Short Bravo (`starts in 2 days`), Short Alpha
   (`Alpha · 0 of 2 picked · 1 equipment item not ready`, `starts in 3 days`), Short Organization (`0 of 3 picked`) and
   Due soon. The completed Tasking and the next-month one are absent. Overdue, Blocked and Due soon rows have a link and
   no button. Each row's link opens `/org/A/calendar/taskings/ID`.
2. **Pick people.** Press `Pick people` on the Alpha Short row. `Assign people` opens in place with only SPC Able; the
   page's requests are one `GET` and one `PUT` of `.../people`, then one `GET api/dashboard/taskings`, and no
   `__data.json`. Pick Able and save: the sheet closes, the row reads `1 of 2 picked` and focus returns to its button.
   Pick SPC Baker on the Bravo row: the row leaves Short and reads `Due soon` with `1 of 1 picked`, and focus moves to
   its link. The count stays 9.
3. **Stale save.** Open the Organization row's picker and tick Able without saving. From a second `calendarOperate` page
   `PUT` `{ personnelIds: [BAKER], keep: [], removeOutsideScope: false, expectedRevision: 0 }` to its `.../people`.
   Save the first page: the sheet stays open under `Someone else saved this list while you were choosing` with
   `Saved now: SPC Baker, Synthetic.` and Able still ticked. Save again: it closes and the row reads `1 of 3 picked`.
4. **Keyboard.** Focus a `Pick people` button and press Enter: the sheet opens with focus on `Cancel`. Escape closes it
   and focus is back on the button.
5. **Failed and pending source.** `$V server-source arm rpc/calendar_tasking_attention fail-hard 1 60000`, then reload
   Home: `Needs you · 2` keeps the two Unfilled duty rows, `Needs you is incomplete. Tasking items could not load.` and
   `Try again` show under them, and Strength, On duty and Readiness render as usual. `server-source restore`, press
   `Try again`: one `GET api/dashboard/taskings` and nine rows. For the pending state arm
   `server-source arm rpc/calendar_tasking_attention hold 1 40000` and reload: the two duty rows show with one
   skeleton row under them and no `Nothing needs you right now.`; `release` replaces the skeleton with the rows.
6. **Group-scoped and read-only.** As `calendarScoped` the queue is six rows, with Alpha's four Taskings only (no Bravo,
   no Organization row), and `GET api/dashboard/taskings` returns those four titles. `Range safety detail` and
   `Gate guard rotation` are absent from its `__data.json`. As `calendarView` all nine rows show with no `Pick people`.
   As the `viewer` login the same `GET` answers `null` and no Tasking row shows.
7. **Switch off.** As `orgOwner`, Settings › Features, turn `Events & Taskings` off. The operator's Dashboard shows
   `Needs you · 2` with no Tasking row, no `api/dashboard/taskings` request, and `server-source arm
rpc/calendar_tasking_attention hold 1 60000` records `matches: 0` after a reload. Turn it back on.
8. **Widths.** Capture the queue for the operator, `calendarScoped`, `calendarView`, the failed state, the pending state
   and the switch off at 1440, 900 and 390. At 390 `Pick people` sits beside the title and the timing stays on the
   first line. `scrollWidth` equals the viewport.

### Forecast lane

The strength forecast has one `Events and suspenses` lane under its day labels, read by the same
`GET api/dashboard/taskings` as the Tasking rows, so it shares their pending, failed and retry state. Each Event the
viewer can read that overlaps the 14 days is a span over its dates: filled when a Tasking on it that is not cancelled is
in the viewer's scope, outlined in italics when it is for awareness only, dashed and struck through when cancelled. A
span of one or two days with free days after it shows its title beside the box. Each active suspense in scope is a
diamond on its due day. The lane is always two rows of spans and one of diamonds, 83px tall whatever arrives: an Event
with no free row is listed behind the lower Event it overlaps, and a day's later suspenses behind its first diamond,
each under a dashed `+N` that opens a list of every mark it stands for, with a one-day Event showing the count alone.
The legend adds `Event` and `Suspense`. The forecast's numbers never change.

Seed as `calendarOperate` from the page with one `POST` each to `/org/A/api/calendar-events` (`{ id, draft }`, host
`{ kind: 'organization' }`) and `/org/A/api/calendar-taskings` (no execution or requirement), dates relative to the
browser day D: Event `Best Medic Competition` D+1 to D+4 with an Alpha Tasking due D+2; `Brigade CG visit` on D+3 with a
Bravo Tasking due D+3; `Post cleanup week` D+7 to D+11 with no Tasking; `Range closure` on D+9, then
`POST .../ID/cancel` with `{ reason }`; and standalone Taskings due D+4 for Alpha, Bravo and the Organization.

1. **Operator.** As `calendarOperate` at 1440 the lane shows `Best Medic Competition` filled over D+1 to D+4,
   `Brigade CG visit` filled on D+3 with its title beside it, `Post cleanup week` outlined over D+7 to D+11 and
   `Range closure` dashed and struck through on D+9. Diamonds show on D+2, D+3 and D+4, where `+2` opens a list of the
   three suspenses due that day, each a link to its detail. Every mark is a link whose name gives the kind, title, dates
   and standing, such as `Event Best Medic Competition, 27 Oct to 30 Oct, with Taskings for you` or
   `Suspense TITLE, due 30 Oct`.
2. **Open.** Tab from `Open calendar`: focus moves to the first Event with a visible ring. Enter opens
   `/org/A/calendar/events/ID`; Enter on a diamond opens `/org/A/calendar/taskings/ID`, and on `+2` the list, where Tab
   reaches each Tasking.
3. **Scoped and read-only.** As `calendarScoped` (Alpha) every Event shows, but `Brigade CG visit` is outlined because
   its only work is Bravo's, and only the two Alpha diamonds show: no Bravo or Organization suspense. The lane is 83px.
   As `calendarView` the lane matches the operator's.
4. **Overlap.** Add `Ammo draw` D+2 to D+3 and reload: it takes the lower row with `+1`, which lists it with
   `Brigade CG visit`, and the lane stays 83px. Its title is cut short in the box; the link name keeps it whole.
5. **Failed and pending.** `$V server-source arm rpc/calendar_tasking_attention fail-hard 1 60000` and reload: the lane
   reads `Events and suspenses could not load.` with `Try again`, at the same 83px, while the forecast, by-group strip
   and On duty render. `server-source restore` and press the lane's `Try again`: one `GET api/dashboard/taskings?asOf=D`
   and the marks. With `hold 1 40000` instead the lane holds three skeleton bars at 83px (`Loading events and suspenses`
   for screen readers) and the Strength band is not busy; `release` fills it.
6. **Switch off and widths.** With `Events & Taskings` off the lane and its legend entries are gone and no
   `api/dashboard/taskings` request leaves. Capture the lane for the operator, `calendarScoped`, `calendarView`, failed
   and pending at 1440, 900 and 390. At 390 the lane scrolls sideways with the forecast's days and `scrollWidth` equals
   the viewport.

Not covered by the harness: more than 100 rows needing attention, which the unit tests cover with
`N more Tasking items are not listed`. `supabase/tests/calendar_tasking_attention.sql` proves the ranking, scope, the
viewer's day and the switch as ordinary signed-in users, and `supabase/tests/calendar_range_projection.sql` proves that
an Event's work in scope differs for Organization-wide and Alpha readers.

## Set availability

Below `People`, a Tasking that has execution dates and at least one pick that counts offers `Set availability…`. It
opens Bulk Status Add with those people and dates filled in; the leader picks the status and saves through Bulk Status's
own validation and write. Left of it, one quiet line counts the picked people whose Availability entries do not together
cover every execution day: `N of M picked people have no Availability covering every execution day.`, or
`Availability covers every execution day for everyone picked.` It is derived on every load from one read of the
Tasking's picks and dates, never stored, and never creates anything. Picks under review and archived people are left
out. Only people the reader may write Availability for are counted and prefilled, so a viewer sees neither the line nor
the action, and a Group-scoped operator is told only about their Groups. A completed or cancelled Tasking offers
neither. The line has its own skeleton and load error with `Retry`, and `People` stays usable when it fails.

### Driving it

As `calendarOperate`, create an Organization Tasking executing 27 – 29 Oct 2026 and an Alpha Tasking, then `PUT` picks
to `/org/A/api/calendar-taskings/ID/people` with `{ personnelIds, keep: [], removeOutsideScope: false,
expectedRevision: 0 }`: SPC Able, SPC Baker and SPC Unassigned on the Organization Tasking, Able on the Alpha one. The
fixture's Baker has `Verification Training` 25 – 27 Oct, which covers one day only.

1. **Action and advisory.** At 1440 the Organization Tasking's `People` section ends with
   `3 of 3 picked people have no Availability covering every execution day.` and `Set availability…`. The link carries
   `tab=add`, `tasking`, `people` (the three ids) and `from=2026-10-27&to=2026-10-29`.
2. **Prefill.** Following it opens `Bulk status` with the note above the steps, `Back to tasking`, the dates
   `Oct 27, 2026` to `Oct 29, 2026` and all three people ticked (`3 of 3 selected`); Baker carries
   `VERIFICATION TRAINING 25–27 OCT OVERLAPS`. With `Verification Leave` chosen press `Add to 3 people`.
3. **Return and clearing.** The page lands on the Tasking and the line reads
   `Availability covers every execution day for everyone picked.` `$V rows availability_entries orgA` has three new
   Leave rows for 2026-10-27 to 2026-10-29 with no Tasking reference, and the Calendar month shows their bars on
   27 – 29 Oct. Editing the picks afterwards changes none of them.
4. **Part covered.** Create a Tasking executing 27 – 31 Oct with the same three picks. The line reads
   `3 of 3 …`. Open Set availability, choose `Verification Training` (Baker is disabled as already on it), save: back on
   the Tasking the line reads `1 of 3 picked people have no Availability covering every execution day.`
5. **Failed check.** In the disposable database only, rename `public.calendar_tasking_availability_gaps` and load the
   Tasking. `Availability could not be checked.` with `Retry` replaces the line, `People` still lists everyone and
   `Set availability…` still works. Rename it back and press `Retry`: the line returns. To see the skeleton, wrap the
   function in one that sleeps four seconds, open the Tasking from the list and sample at 100 ms: the loading region
   stays until it settles, and the row height and the `Equipment` heading's top do not move.
6. **Widths.** Capture the Tasking and the prefilled Bulk Status at 1440, 900 and 390. At 390 the line wraps over two
   lines and `Set availability…` sits under it, in the same place as the skeleton; `scrollWidth` equals the viewport.
   Focus the link with the keyboard and press Enter: it opens the same prefilled page.
7. **Scoped operator.** As `calendarScoped` the Alpha Tasking offers the action for Able only (`people=` holds one id)
   and the Organization Tasking reads `This tasking is not available`. Opening Bulk Status with Able, Baker, Unassigned
   and a junk id in `people` ticks only Able (`1 of 1 selected`) and ignores the rest.
8. **Read-only.** As `calendarView` the Organization Tasking shows `People` with no line and no action, and Bulk Status
   with a prefill link reads `Access restricted.`
9. **No dates, closed.** A Tasking without execution dates, a completed one and one whose picks are all under review
   show neither the line nor the action.

`src/features/calendar/taskings/staffing/` tests cover the link, the prefill parser and the action's states;
`supabase/tests/calendar_tasking_availability_gaps.sql` covers coverage across adjacent, overlapping and nested entries,
review exclusion, scope and the feature switch as ordinary signed-in users.
