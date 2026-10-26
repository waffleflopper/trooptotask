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
  one toolbar view switch, with `?when=past` in the URL. A row reads `DATES`, `EVENT`, `HOST` and `TASKINGS`. The host
  reads `ORG (this organization)` or the other host's name. `TASKINGS` reads `N · M need action` in red, `N · on track`,
  or `Awareness only` when nothing is linked, with an amber triangle and a count when picks conflict. A cancelled title
  is struck through.
- `event-create`: the `Create event` sheet. `Title`, `Starts`, `Ends`, `Who is running it?` and `Coordinator` come
  first. The host is two cards, `We are hosting` and `Another organization`; the second opens a shaded panel with
  `Hosting organization` and `Source reference`. `OPTIONAL` adders `Location` and `Description` reveal and focus their
  fields. `Coordinator` searches current members by name and starts on the creator, marked `(you)`. The footer reads
  `Does not mark anyone unavailable.` beside `Cancel`, `Create and add tasking` and `Create event`.
- `event-edit`: the same sheet, filled. `Save changes` stays disabled until something changes.
- `event-cancel`: a confirmation with an optional reason. The detail then shows who cancelled it and when, and Edit and
  Cancel are gone.
- `event-activity`: the detail card's `History` list, newest first, written by the database for created, dates changed,
  coordination changed and cancelled.
- `event-access`: Group-scoped operators and Calendar viewers read Events with no controls, and the server refuses their
  writes. A member without Calendar access gets 403. Another Organization's Event is 404, and its id under the viewer's
  own Organization reads `This event is not available`.
- `event-feature-off`: the toolbar action, the list, the detail and the API all go away with the switch.
- `tasking-list`: count chips `Active`, `Overdue`, `Blocked`, `Needs people` and `Completed` that filter, plus search
  and `Event`, `Responsible`, `Status` and `Due` selects; `Status` also offers `Cancelled`. Every filter lives in the
  URL (`view`, `q`, `event`, `for`, `within`) and survives Back. A row reads `STATUS`, `TASKING · EVENT` (the Event with
  `· prep` or `· closeout`, or `Standalone · no event`), `RESPONSIBLE`, `PEOPLE` (`picked / required`, amber when
  short), `EQUIPMENT` (`Ready`, `R of T ready` in red, or `R of Q returned` for closeout work) and `NEXT DATE`
  (`Overdue N days`, `Due today`, `In N days` or `Starts DAY`, over `Due DAY`). A Tasking whose picks have a conflicting
  status adds an amber triangle and count beside `PEOPLE`, named `N people have a conflicting status`. Active views read
  `Sorted by next date`; closed views hold the 100 most recent, newest first.
- `tasking-create`: the `Create tasking` sheet. `Required outcome`, `Who is responsible?` and `Suspense` are required.
  Event is optional: a filled row with `Make standalone` when chosen, an Event select when not. Responsible is two
  cards, `A Group` with its Group select and `Organization level`. An Organization-wide operator starts on
  `Organization level`. A Group-scoped operator starts on their Group only when they manage exactly one, and
  `Organization level` is disabled for them. A hint under the cards names who may pick people. `People committed` sets
  the execution dates and report time in one range picker beside `Suspense`. `OPTIONAL` holds `People` (count and
  qualifications), `Equipment` rows (name, `×`, quantity, `Add item`) and the `Checklist` and `Instructions` adders.
  Equipment and checklist items save after the Tasking, in order. If one fails, the Tasking's detail opens with a
  lasting toast naming each item that did not save.
- `tasking-from-event`: `Create and add tasking` in the Event sheet, and `Add tasking` on Event detail, open the Tasking
  sheet with that Event chosen. The Event detail lists its Taskings.
- `tasking-edit`: the same sheet, filled, with `Make standalone` for a linked Tasking. Equipment and checklist are
  edited on the detail page, so the edit sheet has no rows for them. Rerouting, relinking and unlinking keep the
  Tasking's identity and write Activity.
- `tasking-lifecycle`: the rail's `STATUS` card follows the status, with the status select and its next moves. `Start`,
  `Unblock` and `Reopen` act at once; `Unblock` and `Reopen` also sit in the header. `Mark blocked` needs a reason and
  the Blocked banner's `Edit reason` changes it (`Save reason`). `Complete` takes an optional note and the `...` menu's
  `Cancel tasking` an optional reason, each in a confirmation. The database refuses any other move with 409. Completed
  and cancelled Taskings cannot be edited, but a Completed Tasking still counts returned equipment.
- `tasking-access`: a Group-scoped operator sees and changes only their Groups' Taskings, creates only for them, and
  cannot move responsibility. A Calendar viewer reads every Tasking with no controls. Writes outside a caller's reach
  return 403, or 404 when the Tasking is hidden from them.

## How to get to it (user POV)

Choose `Events & Taskings` under `Calendar` in the sidebar, or the Calendar toolbar action `Events & Taskings`. Both
open the Taskings list `/org/ORG/calendar/taskings`; below about 1024 px the toolbar action sits in
`More Calendar controls`. The sidebar item stays current and the breadcrumb reads `Calendar › Events & Taskings` on
every events and taskings page, including detail pages.

Every Events & Taskings page shares one header: the `CALENDAR / EVENTS & TASKINGS` eyebrow, the heading, the actions on
the right, then a row with `Calendar` (back to the month) and an `Events` / `Taskings` segmented control. The Events
list adds `Upcoming` / `Past` to that row, with `Create event` and `+ Create tasking` for an operator. A row opens
`/org/ORG/calendar/events/EVENT_ID`, whose header has the title, `Edit event` and `+ Add tasking` for an operator, and
`All events`, `Show on availability` and a `...` menu holding `Cancel event` in the row. The left card shows a countdown
(`Starts in N days`, amber), the dates, the location, `HOSTED BY`, `SOURCE`, `COORDINATOR`, the description and
`HISTORY`. The right column is `What ORG owes` with the Tasking count, a summary line (`N overdue`, `N blocked`,
`N need people`, an amber triangle with `N conflicts`, `N fully staffed and ready`) and the groups. Below about 830 px
of content the card stacks over the groups. `Show on availability` opens the Calendar on the Event's start month.

The Taskings list is `/org/ORG/calendar/taskings` with `Create event` and `+ Create tasking` for an operator. A row
opens `/org/ORG/calendar/taskings/TASKING_ID`. Its header has the outcome, `Edit` and `+ Assign people` for an operator
who owns it, then the shared row with `All taskings`, the status badge, the responsible pill and a `...` menu holding
`Cancel tasking`. A banner names who blocked, completed or cancelled it. The main column is a three-cell strip (`EVENT`,
`PEOPLE COMMITTED` over `Report HHMM`, `SUSPENSE` over a countdown), then `People`, then `Equipment` and `Checklist`
side by side. The rail holds `STATUS` (a status select and the next actions), `REST OF THE EVENT`, `INSTRUCTIONS`,
`WHO CAN PICK PEOPLE` and `ACTIVITY`. At 900 the rail stacks under the main column; at 390 everything stacks. At 900 the
list selects move into `Filters`; at 390 the view switch joins them.

Member labels use `RANK First Last` from the member profile, then membership email, then the first eight characters
of the user id and `...`. The Event list and detail provide `memberOptions` in name order and `currentUserId` for the
coordinator sheet. The same label read supplies coordinators, Activity actors and lifecycle attribution.

## Helper controls

`$V rows calendar_events orgA` and `$V rows calendar_event_activity orgA` read the stored rows; filter Activity with
`event_id ID`. `$V rows audit_logs orgA` shows `calendar_event.created`, `.updated` and `.cancelled`.
`$V network arm-observe|arm-fail PAGE calendar-events` matches only `POST /org/A/api/calendar-events`, the create. The
hook lives in the page, so arm it after the last navigation; a reload removes it. `$V rows calendar_taskings orgA` and
`$V rows calendar_tasking_activity orgA` read Taskings and their Activity; filter with `tasking_id ID` or
`responsible_group_id ID`. `$V network arm-fail PAGE calendar-taskings` fails the next Tasking create, the same way.

The toolbar's `Event`, `Responsible`, `Status` and `Due` listboxes show their options in a screenshot but not in a plain
`take_snapshot`. Take a `verbose` snapshot and click the option UIDs in order, or `navigate_page` with the filter query.

## Driving it with verify:app

Preconditions: worker 1 launched and `doctor` clean. `$V actor calendarOperate calendar` returns the operator's `PAGE`;
`calendarScoped`, `calendarView`, `calendarForeign` and `orgOwner` take the same `calendar` destination. A member with
no Calendar access comes from `npm run verify:app -- login viewer --worker 1`. The `actor` destinations do not include
`calendar/events`, so use the toolbar action or `navigate_page` with an absolute URL. Dates below assume a browser day
in late October 2026; on a later day pick later dates with the same shapes. Use unique titles.

1. **Empty and create.** As `calendarOperate` at 1440, open `Events & Taskings`. With no Events the list shows the
   `No upcoming events` empty state and a `Create event` button. Click the toolbar's `Create event`. Focus is in
   `Title`. Press `Create event` with nothing filled: no request leaves. `Title`, `Starts` and `Ends` are invalid, and
   both dates read `Choose a date.` Fill a title, pick Tuesday 10 Nov 2026 as the start (the end follows it), then pick
   12 Nov as the end. Keep `We are hosting`. Arm `$V network arm-observe PAGE calendar-events` and press `Create event`
   twice quickly. Exactly one `POST` returns 200, and the page moves to the new Event's detail with `10 – 12 Nov 2026`,
   `Starts in N days` and one `HISTORY` entry. `$V rows calendar_events orgA` shows `starts_on 2026-11-10`,
   `ends_on 2026-11-12` and `created_by` set to the operator.
2. **External host with a source.** Create a second Event, `1 – 4 Dec 2026`, `Another organization` with
   `Hosting organization` `1-1 BN`. Fill `Source reference` with `https://example.mil/opord`. Choose `Location` and
   `Description` under `OPTIONAL`; each new field takes focus. Fill a location and a two-line description. Type
   `javascript:alert(1)` as the source first and save: the field is invalid with its link message and the request does
   not leave. Restore the https link and save. The detail shows the host name, the source as a link opening a new tab,
   and the description keeping its line break.
3. **One-day awareness Event.** Create `20 Nov 2026` with start and end the same, host `2nd BDE`, source
   `BDE OPORD 27-03`. The list row and the detail read `20 Nov 2026`, and the source shows as text.
4. **Edit and reload.** On the first Event press `Edit event`. `Save changes` is disabled. Move the end to 13 Nov and
   switch the host to `Another organization` `1-1 BN`. Save. The sheet closes, focus returns to `Edit event`, the dates
   read `10 – 13 Nov 2026`, and `HISTORY` adds a dates entry and a coordination entry naming only the host. Reload: the
   dates are unchanged. Repeat the reload with the browser in a zone west of UTC; no date moves.
5. **Cancel.** On the one-day Event open the `...` menu and choose `Cancel event`. The dialog asks to confirm, with
   `Keep event` and a reason field. Enter a reason and confirm. A banner reads who cancelled it and when, with the
   reason under it. `Edit event` and `Cancel event` are gone, `HISTORY` starts with the cancellation and its reason, and
   the list shows the title struck through. `$V rows calendar_events orgA` shows `cancelled_by`, `cancelled_at` and the
   reason.
6. **Failed save.** On the list, after the last navigation, arm `$V network arm-fail PAGE calendar-events`. Create an
   Event with a location and press `Create event`. The sheet stays open with every entry kept, the inputs re-enable, and
   a `Not saved` alert appears at the top of the sheet, scrolled into view. `$V rows calendar_events orgA` has no new
   row. `network restore PAGE`, then press `Create event` again: it saves once.
7. **Widths.** Capture the list, the detail and the sheet at 1440, 900 and 390. At 900 the toolbar action moves into
   `More Calendar controls`. At 390 a list row stacks the dates over the title, with the host and `Taskings` on one
   line, and the sheet fills the screen with the footer reachable.
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
    Event's detail and the `Add tasking` sheet opens with that Event as a filled row and `Organization level` chosen;
    the URL has no `addTasking` left, and Back leaves the page with the sheet closed. Press `Add tasking` with nothing
    else filled: `Required outcome` and `Suspense` are invalid and no request leaves. Fill the outcome, choose `A Group`
    and `Alpha` (the hint names Alpha's leaders), a suspense three days ahead, `People committed` over the Event's dates
    with report time 0600 (the field reads `· report 0600`), equipment `M997 FLA ambulance` quantity 1 and
    `Litter, folding` quantity 2, and one checklist item. Press `Add tasking` twice quickly. One Tasking `POST` returns
    200, then one equipment `POST` per row and the checklist `POST`, in that order, and the Tasking appears under the
    Event's `Taskings`. `$V rows calendar_taskings orgA` shows `responsible_group_id` Alpha, the Event id, `report_time`
    06:00 and `created_by` the operator. `$V rows calendar_tasking_equipment orgA` and
    `calendar_tasking_checklist_items` hold the two rows and the item.
14. **Organization Tasking.** From the Taskings list, create a standalone Tasking owned by `Verification Organization A`
    with a suspense in the past. Its `NEXT DATE` reads `Overdue N days` over `Due DAY`, and `?view=overdue` lists it.
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
    `Responsible` and `Next 7 days` in `Due`; the URL reads `?for=ALPHA_ID&within=7` and only Alpha Taskings due within
    a week remain. Open a row and press the browser's Back: the URL, the selects and the rows return unchanged. Search
    `lmtv` writes `?q=lmtv` without a new history entry. `Event` narrows to one Event or `Standalone`.
18. **Failed Tasking save.** On the list, arm `$V network arm-fail PAGE calendar-taskings`, open `Create tasking`, fill
    the three required fields and save. The sheet keeps every entry under a `Not saved` alert and
    `$V rows calendar_taskings orgA` has no new row. Press `Create tasking` again: it saves once and opens the detail.
19. **Tasking widths.** Capture the Taskings list, a Tasking detail and the edit sheet at 1440, 900 and 390. At 390 a
    row stacks the outcome and its Event beside the status badge, then the responsible pill, `People` and `Equipment` on
    one line and the next date under them, the actions wrap under the title, and `scrollWidth` equals the viewport.
20. **Scoped Tasking operator.** As `calendarScoped` (Alpha), the list shows only Alpha Taskings and no
    Organization-owned ones. `Create tasking` starts on `A Group` with `Alpha` chosen and `Organization level` disabled.
    `Edit` on an Alpha Tasking shows both responsibility cards disabled. A Bravo Tasking's URL reads
    `This tasking is not available`. From the page, a create for Bravo or the Organization and a reroute of an Alpha
    Tasking to Bravo return 403; an edit or move of a Bravo or Organization Tasking returns 404.
    `$V rows calendar_taskings orgA` changes only for an allowed Alpha move.
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

- `staffing-people`: the `People` card reads `N of R selected` (or `N selected` with no requirement) over the
  requirement line, lists each pick as rank, `Last, First`, MOS and clinic role (with the Group on an Organization
  Tasking) and an overlap state, then a dashed `N more person needed by DAY` row with `Pick N more`, and
  `N people outside your Groups` for a Group-scoped reader. `Change` reopens the picker. It has its own skeleton and
  load error.
- `staffing-picker`: `Assign people` opens a side sheet: the outcome and execution dates, a scope banner
  (`Alpha's tasking. You can pick from Alpha's roster.` or
  `Organization-level tasking. You can pick from every Group.`), the selected bar (`x of y`, a chip per pick with
  `Remove NAME`, dashed empty slots), search, a styled `Group` select on an Organization Tasking (a locked Group label
  otherwise), an `MOS` toggle when the requirement names an MOS someone holds, and one checkbox row per candidate with
  its overlap state. Whoever was picked when the sheet opened leads the list, so ticking never moves a row. The footer
  reads `N more needed` or `x of y selected` and `Save N people`, which is disabled until something changes. A
  Group-scoped operator gets an extra `Remove N people outside your Groups` checkbox when such picks exist; left alone,
  they stay picked.
- `staffing-undo`: a save toasts `x of y selected`, who now shows a commitment and who no longer does, and `Undo` for
  ten seconds. `Undo` saves the earlier list against the revision the save returned. If someone saved since, it reads
  `Undo did not go through` and the card shows their list.
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

1. **Organization-wide picker.** At 1440 open the Organization Tasking. `People` reads `0 of 3 selected` over a dashed
   `3 more people needed by DAY` row. `Assign people` lists all three people with their Groups (`Unassigned` for SPC
   Unassigned), and Baker carries `Verification Training Sun 25 Oct – Tue 27 Oct. Overlaps 2 of 3 days.` in the warning
   colour. `Group` `Bravo` leaves only Baker; search `unass` leaves only SPC Unassigned. From the search field, Tab and
   Space pick all three and the count reads `3 of 3`. `Save 3 people` closes the sheet; `People` reads
   `3 of 3 selected`, and Activity adds
   `Picked SPC Able, Synthetic; SPC Baker, Synthetic and SPC Unassigned, Synthetic`.
2. **Group picker.** On the Alpha Tasking the picker has no `Group` select and lists only SPC Able, now carrying the
   Organization Tasking's title and `26 – 28 Oct 2026`. Pick Able and save: `1 of 2 selected`.
3. **List counts.** The Taskings list rows end `· 1 of 2 picked`, `· 3 of 3 picked` and `· 0 of 1 picked`.
4. **Retry is a no-op.** From the page, `PUT` the same list with the same `expectedRevision` twice. The first answers
   `saved`, the second `unchanged` with the same revision, and the participant rows and audit rows do not grow.
5. **Concurrent edit.** Open a second `calendarOperate` page. Open the Organization Tasking's picker in both. In the
   second, clear SPC Unassigned and save. In the first, clear Baker and save. The sheet stays open with
   `Someone else saved this list while you were choosing` listing Able and Baker, and the first page's choices (Able and
   Unassigned) still ticked. Save again: `2 of 3 selected`, and Activity holds both changes in order.
6. **Failed save.** Open the picker, run the one-shot override above, change a pick and save. The sheet keeps the choice
   under `The people were not saved…`, and `$V rows calendar_tasking_participants` is unchanged. Save again: it closes.
7. **Needs review.** Move Able to Bravo. The Alpha Tasking reads `0 of 2 selected`, Able shows `Needs review` and
   `Moved to Bravo` with only `Remove`, and a note explains reviewed picks do not count. Move Able back: the row reads
   `Eligible again` with `Keep` and `Remove`. Press `Keep`: `1 of 2 selected`, and Activity adds
   `Kept SPC Able, Synthetic after review`. Archive SPC Unassigned (picked on the Organization Tasking): `Archived`.
   Restore them: still `Needs review`, now `Eligible again`. Press `Remove`; Activity adds the removal.
8. **Group-scoped operator.** Move Able to Bravo again. As `calendarScoped`, the Alpha Tasking reads `0 of 2 selected`
   and `1 person outside your Groups` with no name and no review note; Activity reads `Picked 1 other person`. The
   picker says `Nobody on this roster is active.` and offers `Remove 1 person outside your Groups`. Tick it and save:
   `0 of 2 selected` with no outside line, Activity `Removed 1 other person`, and no participant row remains. From the
   page, `GET` and `PUT` `/org/A/api/calendar-taskings/ID/people` for the Organization and Bravo Taskings return 404; a
   `PUT` on the Alpha Tasking naming Baker or SPC Unassigned returns 409 and stores nothing.
9. **Read-only and outsiders.** As `calendarView`, a detail shows the names with no `Assign people`, `Keep` or `Remove`,
   and `GET` and `PUT` on `.../people` return 403. The `viewer` login gets 403 from both, and the detail's `__data.json`
   ends in a 403 node with neither the title nor a name. As `calendarForeign`, A's detail is 404 and both calls
   return 404.
10. **Widths.** Capture the Organization detail, the picker, the Taskings list, the scoped `People` section and a review
    row at 1440, 900 and 390. At 390 the sheet fills the screen with `Save N people` and `Cancel` reachable, review
    actions sit beside the name, and `scrollWidth` equals the viewport.
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

## Tasking detail

Seed as `calendarOperate`, with same-origin `fetch` from the page, pausing about 2.5 s between writes: the app allows 60
requests a minute per IP, shared with actor logins, so wait a minute after logging in several actors. Ranks such as
`SSG` need the Army pack first: as `orgOwner`, `POST /org/A/settings/ranks?/addServicePack` with form `service=army` and
header `x-sveltekit-action: true`. Add SSG Hale (68W, Section sergeant), SGT Ortiz (68W, Team leader), SPC Nguyen, SPC
Reyes and PFC Kim to Alpha, SFC Diaz and SPC Moore to Bravo, and SSG Park (68K) to no Group. Create the Event
`Best Medic Competition`, 29 Oct – 2 Nov 2026, and link:

- `trauma`, Alpha, `Provide 4 trauma-lane medics`, needs 4, qualifications `68W, CLS instructor preferred.`, execution
  29 Oct – 2 Nov, report `06:00`, suspense 2 Nov, instructions; picks Able, Hale and Ortiz; equipment `Aid bag, M9` x 4
  all secured and `Litter, folding` x 2 with 1 secured; two checklist items, one done; then `Start`.
- `graders`, Organization, `Provide 3 lane graders (E-6+)`, same dates; picks Hale and Diaz.
- `lane`, Alpha, blocked with a reason; `done`, Bravo, completed with a note, with equipment returned 2 of 2 and 1 of 2.
- A `Leave` for Ortiz, 30 Oct – 1 Nov, through `POST /org/A/api/availability`.

1. **In progress (Organization-wide operator).** Open `trauma` at 1440. The header reads the outcome, `Edit` and
   `+ Assign people`; the row reads `All taskings`, `In progress`, `ALPHA` and `...`. The strip reads `EVENT` with the
   Event link, `PEOPLE COMMITTED` `Thu 29 Oct – Mon 2 Nov` over `Report 0600`, and `SUSPENSE` `Mon 2 Nov` over
   `In N days`. `People` reads `3 of 4 selected` in amber over `68W, CLS instructor preferred. From Alpha.`: Able
   `No known overlap`, Hale an info line naming `Provide 3 lane graders (E-6+)`, Ortiz a warning line
   `Verification Leave Fri 30 Oct – Sun 1 Nov. Overlaps 3 of 5 days.`, then `1 more person needed by Thu 29 Oct` with
   `Pick 1 more`. The rail reads `STATUS` with `In progress`, `Mark blocked` and `Complete`, then `REST OF THE EVENT`
   listing `graders`, `INSTRUCTIONS`, `WHO CAN PICK PEOPLE` and `ACTIVITY` newest first.
2. **Scoped reader.** As `calendarScoped`, Hale's line reads `Committed elsewhere over these dates.` with no title, and
   `REST OF THE EVENT` lists the Organization Tasking only as its responsible and outcome, with no link.
3. **Blocked and completed.** `lane` shows a red `Blocked` banner with `since DAY · NAME`, the reason and `Edit reason`;
   `Unblock` replaces `+ Assign people`. `Edit reason` › change the text › `Save reason`: the banner reads the new
   reason and Activity adds it. `done` shows a green banner with the note, `Reopen` in the header, no `Edit`, and
   `Equipment` `1 of 2 returned`.
4. **Picker.** On `graders` press `+ Assign people`. The sheet reads `Assign people`, the outcome and dates, the
   `Organization-level tasking. You can pick from every Group.` banner, `2 of 3` with chips `SSG Hale · Alpha` and
   `SFC Diaz · Bravo` and one dashed slot. Hale and Diaz lead the list. `Group` › `Bravo` leaves Diaz and Moore;
   `Unassigned` leaves Park. `Save` is disabled. On `trauma` the sheet has a locked `Group Alpha`, an `MOS` toggle that
   leaves only 68W holders, `Other Groups are not listed.` and the footer `Only Alpha's roster appears…`.
   `Remove SGT Ortiz, Lena` on a chip unticks her row.
5. **Undo.** On `trauma` tick Nguyen and press `Save 4 people`. The sheet closes, `People` reads `4 of 4 selected` with
   Nguyen marked `new`, and a toast reads `4 of 4 selected`, `SPC Nguyen now shows a commitment…` and `Undo`. Press
   `Undo`: `The earlier selection is back` and `3 of 4 selected`; `$V rows calendar_tasking_participants` lists Able,
   Hale and Ortiz, and Activity holds both changes. Save Nguyen again, then from a second page `PUT` a different list
   with the revision the save returned, then press `Undo` on the first: `Undo did not go through` with
   `Someone else changed who is picked after your save.`, and `People` shows the second page's list.
6. **Load states.** After the last navigation arm one source at a time with `hold 1 30000`, reload, capture, then
   `fail-hard 1 60000`, reload, capture, and `server-source restore`. `rpc/calendar_tasking_people`: `People` shows
   skeleton rows, then `People could not be loaded` with `Retry`, and the header's `+ Assign people` goes.
   `calendar_tasking_equipment`: two skeleton cards, then `Equipment and checklist could not be loaded`.
   `rpc/read_calendar_tasking_activity`: skeleton lines under `ACTIVITY`, then `Activity could not be loaded`.
   `rpc/list_calendar_event_tasking_summaries` as `calendarScoped`: `REST OF THE EVENT` reads
   `The event's other taskings could not be loaded.` Every other region renders as usual, and nothing shifts when a held
   source arrives.
7. **Widths.** Capture `trauma`, `lane`, `done` and both pickers at 1440, 900 and 390. At 900 the rail stacks under the
   main column; at 390 the strip, the cards and the rail stack, the picker fills the screen, and `scrollWidth` equals
   the viewport.

## Event detail and shared Events

Event detail groups its Taskings under `BEFORE · PREP`, `DURING · DATES` and `AFTER · CLOSEOUT`, each a region named by
its heading. A row reads the status badge, the outcome, the responsible pill with `x of y picked`, the equipment state
and an amber conflict triangle, then the next date (`Report 0600 DAY` for execution work) over `Due DAY`. A Tasking is
in `During` when its execution dates or its suspense fall within the Event's dates, in `Before` when it is due before
the Event starts and in `After` when after it ends. A phase with nothing in it does not render. Rows sort by suspense,
then outcome.

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

23. **Groups.** The detail lists `BEFORE · PREP` (Alpha, 5 Nov), `DURING` (Bravo, 11 Nov) and `AFTER · CLOSEOUT`
    (Organization, 16 Nov), each row opening its Tasking. The standalone Bravo Tasking is absent, and no phase shows as
    an empty box.
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
27. **Load states.** `$V server-source arm calendar_events hold 1 30000` and reload: the card and the groups show
    skeletons under the header. `fail-hard` instead reads `This event could not be loaded` with `Retry`.
    `server-source restore`. Arm `calendar_event_activity` the same way: only `HISTORY` shows its skeleton, then
    `History could not be loaded` with `Retry`. Arm `rpc/calendar_tasking_workspace`: `What ORG owes` shows its skeleton
    line and rows, then `Taskings could not be loaded` with `Retry` and no counts. Restore after each. With `arm-fail`
    on the summary read the reader's own rows stay and `Other groups’ taskings could not be loaded` shows with `Retry`.
28. **Widths.** Capture the detail with all three phases, the review list and the cancel dialog at 1440, 900 and 390. At
    390 the card stacks over the groups, a row stacks the outcome and its line beside the badge with the dates under
    them, and `scrollWidth` equals the viewport.

## List facts and conflict markers

The Taskings and Events lists read their counts and row facts from the one `workspace` batch, so a failed batch fails
the region instead of reading zero. Seed a conflict: pick a Person on a Tasking with execution dates, then from the page
`POST /org/A/api/availability` for that Person with a `Leave` status inside the execution window.

1. **Chips.** On the Taskings list the chips read the active, overdue, blocked, needs-people and completed counts.
   `Completed` counts every completed Tasking. Choosing a chip writes `?view=` and the table narrows; `Needs people`
   lists the active Taskings with fewer picks than required.
2. **Conflict markers.** The picked Tasking's `PEOPLE` cell shows an amber triangle and `1`; its accessible name reads
   `1 person has a conflicting status`. Its Event's `TASKINGS` cell on the Events list and its row on Event detail carry
   the same triangle, and the detail summary line adds `1 conflict` in amber. No other row has one. Delete the Leave and
   reload: every marker goes.
3. **Load states.** `$V server-source arm rpc/calendar_tasking_workspace hold 1 30000` and open the Taskings list: the
   chips show skeleton counts and the table its skeleton rows. `fail-hard` instead: the chips show no numbers and the
   table reads `Taskings could not be loaded` with `Retry`. On the Events list a held batch shows a skeleton in each
   `TASKINGS` cell; a failed one reads `Tasking counts could not be loaded` over the rows, each `TASKINGS` cell `—`. Arm
   `calendar_taskings` or `calendar_events` for the list itself. Restore after each.

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

A Tasking's detail carries an `Equipment` card (a name, a quantity and how many are secured) and a `Checklist` card
(flat, ordered, open or done) side by side, each with its own add form. The headings read `N of M ready` (green when all
are, red on a Blocked Tasking, amber otherwise) and `D of N`. A Tasking list row repeats them as
`Equipment N of M ready · P partial` and `Checklist D/N`, and only when the Tasking has items. Neither list moves the
Tasking's status. Completed and cancelled Taskings keep both lists on record, read-only, except that a Completed Tasking
counts returned equipment.

- `equipment-edit`: `+ Add equipment` opens `Equipment` and `Quantity` with `Add` (named `Add to equipment`) and
  `Cancel`. A row is a checkbox named after the item (ticked secures all, unticked none), then `× N`, or
  `n of N secured` in amber (red when Blocked) for a partial row, and an `Actions for NAME` menu with `Edit`, `Move up`,
  `Move down` and `Remove`. `Edit` opens `Equipment`, `Quantity` and `Secured` inline with `Save` and `Cancel`.
- `equipment-return`: on a Completed Tasking the heading reads `R of N returned`, the checkbox marks an item returned in
  full, a partly returned row reads `n of N returned`, and `Actions for NAME` holds only `Count returned…`, a
  `Returned of N NAME` field with `Save`. Each sends `returnedQuantity` and nothing else.
- `checklist-edit`: `+ Add item` opens `Checklist item` with `Add` (named `Add to checklist`). A row is a checkbox named
  after the item and an `Actions for LABEL` menu with `Edit`, `Move up`, `Move down` and `Remove`. A done item is struck
  through.
- `lists-access`: a Group-scoped operator edits only their Groups' Taskings, a Calendar viewer sees both lists with no
  controls, and another Group's Tasking is `This tasking is not available`. Writes outside reach return 403, or 404 when
  the Tasking is hidden; a closed Tasking returns 409.

Helpers: `$V rows calendar_tasking_equipment orgA` and `$V rows calendar_tasking_checklist_items orgA` read the stored
rows (`position`, `secured_quantity`, `done`, `done_by`, `done_at`).
`$V network arm-fail PAGE calendar-taskings/ID/equipment` (or `/checklist`) fails the next add for that Tasking.
`rows calendar_tasking_activity` shows `equipment_*` and `checklist_*` kinds. Seed Taskings and items with a same-origin
`fetch` from the page: `POST` to `/org/A/api/calendar-taskings` with `{id, draft}`, then to `.../ID/equipment` with
`{id, draft: {name, quantity, securedQuantity}}` or `.../ID/checklist` with `{id, label}`.

1. **Add.** As `calendarOperate` at 1440, open an Alpha Tasking. `Equipment` reads `None needed` and `Checklist` reads
   `No items`. Add `Litters` x 4 and `Radios` x 2, then two checklist items. Each add appears at once, the heading reads
   `0 of 2 ready` and `0 of 2`, and the inputs clear. `$V rows` shows `position` 1 and 2 and `created_by` the operator;
   the checklist rows are `done false`. Activity gains one entry per add.
2. **Secure, tick and reorder.** Tick `Litters`: the row reads `× 4`, the heading `1 of 2 ready`. `Edit` Radios with
   `Secured` 1: the row reads `1 of 2 secured` in amber. Tick the first checklist item: it is struck through, the
   heading reads `1 of 2`, and `done_by`/`done_at` are set in the row. `Actions for Radios` › `Move up` swaps the rows
   and `position` follows. Untick: `done_by` and `done_at` clear. Reload: the order, counts and ticks are unchanged.
3. **Edit.** `Edit` a row, set `Secured` above `Quantity` and press `Save`: `Secured` is invalid with
   `Secured cannot be more than the quantity.` and no request leaves. Fix it and save: the row updates, and Activity
   gains a changed entry for a new name or quantity and a secured entry for a new secured count.
4. **Failed add.** After the last navigation arm `$V network arm-fail PAGE calendar-taskings/ID/equipment`. Add
   `Stretchers` x 3: an alert reads `The equipment was not added. Your entry is kept, so try again.`, the entry stays in
   the form and `$V rows` has no new row. `network restore PAGE`, press `Add to equipment` again: it saves once.
5. **Remove.** `Remove` a row and an item: each disappears, the heading counts fall, and Activity gains a removed entry.
   With no items left the headings read `None needed` and `No items`, and the Tasking list row loses its summary.
6. **List rows.** On the Taskings list the Alpha row reads `Equipment 1 of 3 ready · 2 partial` and
   `Checklist 1/2` in the title column, with no layout shift when it appears, and rows without items show nothing.
7. **Widths.** Capture the list, the detail and the `Equipment` and `Checklist` sections at 1440, 900 and 390;
   `scrollWidth` equals the viewport. At 390 the two cards stack and each row keeps its checkbox, name, count and menu
   on one line.
8. **Scoped operator.** As `calendarScoped` the list shows only Alpha Taskings with their summaries, and an Alpha detail
   has every control. A Bravo or Organization Tasking's detail reads `This tasking is not available`. From the page, a
   `POST` to a Bravo or Organization Tasking's `equipment` or `checklist`, a `PUT` reorder and a `PATCH` of one of its
   items return 404 and `$V rows` is unchanged.
9. **Read-only roles.** As `calendarView` both lists render with no add form and disabled checkboxes, and the same
   writes return 403 on an Alpha, Bravo and Organization Tasking. As the `viewer` login the detail is the 403 page, and
   as `calendarForeign` it is 404.
10. **Closed Tasking.** `Complete` a Tasking with items: the lists stay, with no add form and no checklist actions.
    `Equipment` reads `0 of 2 returned` and each row's menu holds only `Count returned…`. Tick `Litters`: the heading
    reads `1 of 2 returned` and its row `returned_quantity 4`. `Count returned…` on Radios: `-1` is refused in the field
    and sends nothing; `1` reads `1 of 2 returned` on the row. A `POST` to its `equipment` returns 409. `Reopen`
    restores the controls.
11. **Export and activity.** The JSON export holds `calendarTaskingEquipment` and `calendarTaskingChecklistItems`; the
    Excel `Tasking Equipment` and `Tasking Checklist` sheets name each Tasking by its outcome and each completer by
    email. Settings › Logs reads `Added equipment Litters on Provide four trauma-lane medics` and its siblings.

## Calendar markers

The Calendar shows Events, suspenses and picked execution dates beside availability, behind the `Events & Taskings`
switch. One `calendar-range` read with `collections=events` carries them with the visible range, together with the
Tasking facts the quick cards and the toolbar count use. Sub-features: `calendar-events-row`,
`calendar-header-suspense`, `calendar-commitment`, `calendar-quick-card`, `calendar-taskings-badge`,
`calendar-marker-3-month`, `calendar-marker-failure`, `calendar-marker-feature-off`.

Data (October 2026, today is 26 Oct). Seed as `calendarOperate` from the Calendar page with `POST`s to
`/org/A/api/calendar-events` and `/org/A/api/calendar-taskings`, then `.../ID/status`, `.../ID/equipment` and
`PUT .../ID/people`:

- Events `Best Medic Competition` 28 Oct-1 Nov hosted by us, `Brigade CG visit` 21 Oct hosted by `526th BSB`, and
  `Post cleanup week` 2-6 Nov hosted by `Garrison`.
- Under `Best Medic Competition`: `Submit competitor roster to BN S3` (Organization, suspense 22 Oct, needs 3, started),
  `Lane equipment ready` (Alpha, suspense 25 Oct, 4 of 6 aid bags, blocked), `Alpha trauma lane` (Alpha, suspense 1 Nov,
  execution 28 Oct-1 Nov, needs 1, Able picked, started), `Provide 2 evacuation-lane medics` (Bravo, execution 28 Oct-1
  Nov, needs 2, Baker picked), `Provide 3 lane graders (E-6+)` (Organization, execution 28 Oct-1 Nov, needs 3) and
  `Return borrowed aid bags` (Alpha, suspense 2 Nov, 0 of 2).
- `Clinic walkthrough for CG visit` (Alpha, suspense 28 Oct, needs 1, Able picked) under `Brigade CG visit`, and the
  standalone `Q1 medical readiness slides` (Organization, suspense 27 Oct).
- Verification Leave for Able 29 Oct-3 Nov.

1. **Month.** As `calendarOperate` on `/calendar` in `Month` at 1440, the `Events` row sits under the date headers and
   reads `2 this month`. `Best Medic Competition` is a dark bar from the 28th with the count `6` after its title.
   `Brigade CG visit` is a dashed outline on the 21st whose text `Brigade CG visit · 526th BSB` runs on past the chip.
   The row holds two Events per day; a day with more shows a `+N` button that lists every Event that day. A cancelled
   Event is struck through.
2. **Header suspenses.** Small diamonds sit in the top-right corner of the date headers for the 22nd and 25th (red,
   named `Overdue suspense: TITLE`) and the 27th and 28th (outlined, `Suspense: TITLE`). They clear the day name. A day
   with two suspenses opens a list.
3. **Commitments.** Baker's row has a thin solid amber underline under 28-31 Oct, named
   `Tasking: Provide 2 evacuation-lane medics, 28 Oct 2026 to 1 Nov 2026`. Able's underline breaks into amber dashes
   from the 28th with a small amber warning mark at its start, and its name ends `conflicts with availability`. Nothing
   is red. Clicking a day's `+` still opens Add availability.
4. **Legend and toolbar.** The legend adds `Tasking commitment`, `Suspense` and `Commitment conflict`. The toolbar's
   first action is `Events & Taskings` with a red count `4`, named `Events & Taskings , 4 need action`, linking to
   `/calendar/taskings`. It reads no extra request. Below 1024 the action moves into `More Calendar controls` with its
   count.
5. **Event card.** Click `Best Medic Competition`: the URL stays on `/calendar` and a card opens under the bar with
   focus inside it. It reads `Event · We host`, the title, `28 Oct – 1 Nov 2026`, `Host` `We are hosting`, `Taskings`
   `6 · 4 need action` and `1 availability conflict` with an amber icon, then `Open event` and `Add tasking`. A tracked
   Event reads `Event · Tracked` and its host. Escape closes it and focus is back on the bar. Opening another marker
   replaces the card; only one is ever open.
6. **Tasking card.** Click the 25th's red diamond: the card reads `Blocked` and `Overdue` badges,
   `Lane equipment ready`, `Responsible` `Alpha`, `Suspense` `25 Oct 2026` in red and `People` `0 picked`, with
   `Open tasking`, `Assign people` and `Unblock`. The next status action follows the status: `Start` when open,
   `Mark done` in progress, `Unblock` when blocked. On the 27th's diamond press `Start`: the badge turns `In progress`
   and the action `Mark done` after one more `collections=events` read, and the row in `calendar_taskings` reads
   `in_progress`. `Assign people` closes the card and opens the `Assign people` sheet. A reader who cannot manage that
   Tasking sees only `Open tasking`.
7. **Conflict card.** Click Able's dashed underline: `Alpha trauma lane`, `In progress`, `People` `1 of 1` and
   `SPC Able, Synthetic is not available on these dates` with an amber icon, then `Open tasking`, `Assign people` and
   `Mark done`.
8. **Keyboard.** Tab from the toolbar: the Event bars, header diamonds and underlines take focus in reading order with a
   visible ring. Enter opens the card, Tab moves through its actions and Escape returns focus to the marker. Changing
   month or view closes an open card.
9. **3-Month.** `3-Month` keeps the `Events` row and adds a compact `Suspenses` lane under it instead of header
   diamonds; underlines stay on each row. The lanes stay put while the roster scrolls vertically.
10. **Requests.** Reload: exactly one `calendar-range?rangeStart=2026-10-01&rangeEnd=2026-10-31&collections=events`
    follows, with no per-cell, per-Event, per-card or per-person request. `Next month` inside coverage sends none.
11. **Scoped.** As `calendarScoped` (Alpha only) every Event shows, and only Alpha's diamonds, underlines and card facts
    show. The toolbar count covers Alpha's work only.
12. **Load states.** In the page wrap `window.fetch` so a `calendar-range` response with `events` waits 8 s and gets
    `projection: { kind: 'failed' }`, then press `Next month`. While it waits the `Events` row holds a skeleton at its
    loaded height and the matrix does not move. Then it reads `Events could not be loaded.` with `Retry`; no diamond,
    underline or toolbar count shows, and the matrix, `+` cells and toolbar keep working. Remove the wrapper and press
    `Retry`: the row fills. `$V network arm-fail PAGE calendar-range` instead fails the whole read, so the page alert
    shows as well.
13. **Feature off.** As `orgOwner` turn `Events & Taskings` off in Settings › Features. As `calendarOperate` the
    Calendar has no `Events` row, diamond, underline, legend entry or `Events & Taskings` action, and `Next month` past
    coverage requests `collections=availability%2Cassignments` only. Turn it back on.
14. **Widths.** Capture Month and 3-Month at 1440, 900 and 390; `scrollWidth` equals the viewport. At 390 the row
    scrolls with the dates and its label stays pinned left. A card opened at 390 stays inside the viewport (320 px wide,
    8 px from the edge).

Expected values are written here, never read from a design file. `src/features/calendar/projection/` and
`src/features/calendar/components/projection/` tests cover the row layout, header suspenses, commitment runs and the
cards, and `supabase/tests/calendar_range_projection.sql` proves the read as ordinary Organization-wide and Group-scoped
users.

## Dashboard

The Dashboard request returns `attention.rows`, `attention.total` and `attention.onTrack`, plus the forecast.
Needs you receives Overdue, Blocked and Short Taskings and one Conflict row per visible Person and Tasking. A Conflict
row names the Person, status label and start, and the Tasking title. Picks under review and archived People never
conflict. Another overlapping Tasking is an advisory, not a conflict. On-track work due within seven days appears in
`attention.onTrack` with its title, responsibility, suspense, picked and required counts, and is absent from Needs you.
The source keeps its pending and failed states separate from an empty queue. Each row acts in place: Overdue offers
`Mark done`, Blocked `Unblock`, Short `Pick N` for the People still needed, and Conflict `Swap`. On duty lists
`attention.onTrack` under `Taskings due · 7 days · on track`, with an `Events & Taskings` link.

Seed as `calendarOperate` through `/org/A/api/calendar-taskings` with dates relative to the viewer day D. Create Alpha
Overdue due D-3, Alpha Blocked due D+3, Alpha needing two People executing D+3 through D+7, and on-track Alpha work due
D+4 with no staffing requirement. Add Bravo needing one Person executing D+2 through D+3 and due D+3, and an
Organization Tasking needing three executing D+7 through D+8 and due D+8. Pick Able on the Alpha executing Tasking.
Add Leave for Able on D+5 through D+7 without a Tasking reference. Keep the Alpha Tasking's equipment ready. Before
staffing Bravo, expect six Tasking attention rows and the two seeded Unfilled duty rows, eight Needs you rows total.

1. **Operator.** The eight Needs you rows include Overdue, Blocked, Short and Conflict. The Conflict reads
   `SPC Synthetic Able is on leave from WEEKDAY DAY` with `Committed to TITLE` under it, in amber with `Swap`. The
   due-D+4 Tasking is absent from `attention.rows` and present in `attention.onTrack`. The executing Tasking's picker
   reports `isConflict: true`, `overlapDays: 3`, `executionDays: 5` for the Leave row.
2. **Pick people.** Choose `Pick 1` on the Bravo Short Tasking. The row expands in place under a tint with one slot card
   per Person still needed, labelled by the role word in the title or `Person N`, each holding the first Person free
   over the execution dates in name order, then a `Suggested:` line and `Cancel` / `Confirm 1 person`. Open the slot,
   choose Baker and confirm. The PUT names the whole list with the loaded `expectedRevision`, and the row leaves Needs
   you and enters `attention.onTrack` with `picked: 1`, `required: 1`, and its D+3 suspense. Seven Needs you rows
   remain. The save refreshes `api/dashboard/taskings` once and does not reload the page. `Cancel` folds a row with no
   request.
3. **Conflict choice and stale save.** Choose `Pick 3` on the Organization row. Open the first open slot and choose
   Able: the slot turns amber and its note names the Leave and its overlap, `1 of 2 days`. From a second
   `calendarOperate` page `PUT` `{ personnelIds: [BAKER], keep: [], removeOutsideScope: false, expectedRevision: 0 }` to
   its `.../people`. Confirm on the first page: the row stays expanded with a `role="alert"` line saying someone else
   saved first, Baker shows as a `Selected` slot, Able keeps that slot, and the row refreshes to `1 of 3 picked` and
   `Pick 2`. Confirm again: the PUT carries the new revision, names Baker, Able and the Person suggested in the other
   slot, and the row leaves Needs you.
4. **Swap and keyboard.** Focus `Swap` on the Conflict row and press Enter: the row expands with the conflicting
   Person's slot open in amber, a line naming whom it replaces, and every other pick kept as `Selected`. Tab past the
   row's link to the slots and press Enter: the list opens with focus in its search. Escape closes the list only, and a
   second Escape folds the row with focus back on `Swap`. Opening another row's `Pick N` or `Swap` folds the first. At
   390 px the slots stack in one column; from 900 px they sit side by side.
5. **Failed and pending source.** `$V server-source arm rpc/calendar_tasking_dashboard fail-hard 1 60000`, then reload
   Home: `Needs you · 2` keeps the two Unfilled duty rows, `Needs you is incomplete. Tasking items could not load.` and
   `Try again` show under them, and Strength, On duty and Readiness render as usual. `server-source restore`, press
   `Try again`: one `GET api/dashboard/taskings` and the eight original rows. For the pending state arm
   `server-source arm rpc/calendar_tasking_dashboard hold 1 40000` and reload: the two duty rows show with one
   skeleton row under them and no `Nothing needs you right now.`; `release` replaces the skeleton with the rows.
6. **Group-scoped and read-only.** As `calendarScoped` the queue is six rows, with Alpha's four Taskings only (no Bravo,
   no Organization row), and `GET api/dashboard/taskings` returns those four titles. `Range safety detail` and
   `Gate guard rotation` are absent from its `__data.json`. As `calendarView` all eight original rows show with no
   action. As the `viewer` login the same `GET` answers `null` and no Tasking row shows.
7. **Switch off.** As `orgOwner`, Settings › Features, turn `Events & Taskings` off. The operator's Dashboard shows
   `Needs you · 2` with no Tasking row, no `api/dashboard/taskings` request, and `server-source arm
rpc/calendar_tasking_dashboard hold 1 60000` records `matches: 0` after a reload. Turn it back on.
8. **Widths.** Capture the queue for the operator, `calendarScoped`, `calendarView`, the failed state, the pending state
   and the switch off at 1440, 900 and 390. At 390 each action sits beside the title and the timing stays on the
   first line. `scrollWidth` equals the viewport.
9. **Mark done and Unblock.** Choose `Mark done` on the Overdue row: one `POST .../ID/status` with
   `{ action: 'complete', note: null }`, then one `GET api/dashboard/taskings`, and the row leaves without a page
   reload. `rows calendar_taskings orgA title TITLE` reads `completed`. Choose `Unblock` on the Blocked row: it leaves
   Needs you, its status reads `in_progress`, and as it has no staffing requirement it joins On track. Wrap
   `window.fetch` so the status `POST` answers 409 with a `message`: the row stays and shows that message.
10. **Swap.** Choose `Swap` on the Conflict row: the `Assign people` sheet opens for that Tasking with Able ticked and
    the Leave dates in amber under the name. Cancel leaves the row as it was.
11. **On track.** The block lists the due-D+4 Tasking as `Alpha · open` with its weekday date, each title linking to its
    detail. A Tasking with a staffing requirement reads `N / N people` in green. While the Tasking read is held the
    block shows three skeleton rows; when it fails it reads `Taskings could not be loaded.` and keeps the
    `Events & Taskings` link, and the Needs you `Try again` rereads both. The block is absent with the switch off and
    for a viewer without Calendar access.
12. **Create tasking.** Quick add's filled `+ Tasking` reads `GET api/calendar-taskings/choices` and opens the
    `Create tasking` sheet with the Organization, Groups and upcoming Events. Create one due D+3: the sheet closes, a
    toast offers `Open`, one `GET api/dashboard/taskings` follows, and the new Tasking shows in On track. When the
    choices read fails, a toast says `Create tasking` could not open and no sheet opens.

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
5. **Failed and pending.** `$V server-source arm rpc/calendar_tasking_dashboard fail-hard 1 60000` and reload: the lane
   reads `Events and suspenses could not load.` with `Try again`, at the same 83px, while the forecast, by-group strip
   and On duty render. `server-source restore` and press the lane's `Try again`: one `GET api/dashboard/taskings?asOf=D`
   and the marks. With `hold 1 40000` instead the lane holds three skeleton bars at 83px (`Loading events and suspenses`
   for screen readers) and the Strength band is not busy; `release` fills it.
6. **Switch off and widths.** With `Events & Taskings` off the lane and its legend entries are gone and no
   `api/dashboard/taskings` request leaves. Capture the lane for the operator, `calendarScoped`, `calendarView`, failed
   and pending at 1440, 900 and 390. At 390 the lane scrolls sideways with the forecast's days and `scrollWidth` equals
   the viewport.

Not covered by the harness: more than 100 rows needing attention, which the unit tests cover with
`N more Tasking items are not listed`. `supabase/tests/calendar_tasking_attention.sql` and
`supabase/tests/calendar_tasking_parity.sql` prove the ranking, scope, the
viewer's day and the switch as ordinary signed-in users, and `supabase/tests/calendar_range_projection.sql` proves that
an Event's work in scope differs for Organization-wide and Alpha readers.

## Set availability

Below `People`, a Tasking that has execution dates and at least one pick that counts offers `Set availability…`. It
opens Bulk Status Add with those people and dates filled in; the leader picks the status and saves through Bulk Status's
own validation and write. Left of it, one quiet line counts the picked people whose Availability entries do not together
cover every execution day: `N of M picked people have no Availability covering every execution day.`, or
`Availability covers every execution day for everyone picked.` It is derived on every load from one read of the
Tasking's picks and dates, using only entries whose `set_for_tasking_id` is this Tasking, never stored, and never
creates anything. Picks under review and archived people are left
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
   Leave rows for 2026-10-27 to 2026-10-29 with `set_for_tasking_id` equal to the source Tasking, and the Calendar month shows their bars on
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

## Conflict and summary data contracts

The Events list, Event detail and Taskings list stream `workspace` as an `EventRead<TaskingWorkspace>`. A failed read
is `status: failed`, never a zero-conflict answer. `workspace.taskings` holds only visible Taskings. Each value has
`eventRelation` (`standalone`, `preparation`, `execution`, `closeout`), `status`, `responsibleGroupId`, `picked`,
`required`, `equipment`, `conflicts`, `nextDate` and `suspenseOn`. Equipment has ready/total requirement counts and
returnedQuantity/totalQuantity unit counts. `workspace.counts` supplies active, overdue, blocked, needsPeople and
completed chips without additional requests. `workspace.events` includes permitted Event aggregates, even for work
outside a Group reader's scope. Need action counts each active Tasking once when overdue, blocked or short of People.
An Event with total zero is awareness only.

Tasking detail streams `pickStates`. The picker returns `states` beside `advisories`. States are `clear`, `conflict`
with Availability dates and overlap-day counts, `committed_elsewhere` with visible Tasking facts or an anonymous
commitment, or `unknown` with reason `failed` or `no_execution`. Calendar commitments carry a `conflicts` boolean.

Use `supabase/tests/calendar_tasking_parity.sql` in the disposable database checks. As ordinary Organization-wide and
Group-scoped users it proves own-Tasking and available statuses do not conflict, leave is not coverage, hidden and
foreign provenance is refused, and scoped readers do not learn hidden people or Tasking details. For five execution
days and three days of unrelated Leave, expect one conflicting pick and overlap 3 of 5. Recording the same entry for
this Tasking removes its conflict without changing it when picks change. Another overlapping Tasking stays advisory.
