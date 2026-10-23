# Bulk status changes

A Calendar operator applies a status to selected people, imports a spreadsheet of statuses, or removes matching entries
with clear partial results and whole-entry warnings.

## Sub-features

- `bulk-add`: choose a status chip, inclusive dates and note, then select allowed People. Each row shows that person's
  existing entries for the chosen dates; a person already on the same status is disabled, a person on another status
  stays selectable and is counted. Save from the summary bar and reread only the saved rows. While a save is in flight
  the draft and the roster selection are locked, so a retry resubmits exactly what was sent. A range longer than 366
  days reads in bounded chunks and becomes ready once every chunk returns.
- `status-import`: upload a workbook with several tabs and a header below a title, map the columns, answer an unknown
  status or a shared name once for many rows, fix an end date before its start inline, choose once whether rows that
  overlap saved entries are skipped, kept beside them or replace them, commit and download the rows not imported. A
  replay shows every saved row as Unchanged.
- `bulk-remove`: review a partial overlap, back out without change, or confirm deletion of the whole saved entry; the
  success message reports how many entries the server actually deleted. Removal is sent in chunks of at most 500 IDs and
  stops at the first failed chunk; the completed entries leave the review, the result says
  `Removed N of M status entries — K remain`, and confirming again sends only the remaining IDs.
- `bulk-partial`: if the second of two chunks fails, the first 500 remain saved, one Person and the submitted draft
  remain ready for retry, and the result says 500 of 501. The 500 saved people now show as `Already on …` and are
  disabled, so only the failed Person stays selected. Retry saves only that Person with the original status, dates and
  note.

## How to get to it (user POV)

From `Calendar`, the `Bulk Status` menu offers `Add Bulk`, `Remove Bulk` and `Import CSV`. Add and Remove open
`/calendar/bulk` with the `Bulk status` heading (eyebrow `Calendar · Bulk status`). Beside the title, the
`Bulk status sections` switch offers `Add` and `Remove` as radios, which keep the choice in the `tab` query
(`?tab=import` falls back to Add), and `Back to calendar` leaves. On a narrow viewport both wrap onto their own line
under the title. Add saves from its summary bar (`Add to N people`) with no confirmation step; Remove leads to
`Review Matching Entries`. `Import CSV` opens `/calendar/import` (`Import statuses`, eyebrow `Calendar · Import`), which
steps through File, Columns, Review and Done. The operator needs Calendar operate access and a scope that includes the
selected people; creating a status type from the import also needs Calendar configure access. The seeded
Able/Baker/Unassigned records belong to A, while Foreign belongs to B.

## Helper controls

```bash
$V seed duplicate-able # or overlap, bulk-501, availability-volume, training-pages; returns a tag
$V network arm-fail 2 availability/batch 2 # second matching batch request fails
$V export save 2 .verification/evidence/verify-trooptotask/RUN/status-days.xlsx
$V workbook .verification/evidence/verify-trooptotask/RUN/status-days.xlsx
```

## Driving it with verify:app

Preconditions: doctor passes; `$V actor calendarOperate calendar/bulk` returns `PAGE` (it lands on the Add tab; the
Calendar > Bulk Status menu works too); `$V fixture` supplies `orgA`, `personA`, `personB`, `statusLeave`,
`statusTraining`, and `dates.later/ui`. Use a unique note per mutation, capture the tab and selected Person names before
saving, and keep helper-created rows marked for `clean-seeds`.

1. **Add:** In the Add tab, confirm Step 1 `What and when` offers the status chips (`Verification Leave`,
   `Verification Training`, ...) as radios, one `Dates` label over the `Start date` and `End date` pickers, a day count,
   `Note` and a bar `Preview`, and Step 2 `Who` lists Able, Baker and Unassigned with Foreign absent. Run
   `$V seed overlap` and reload so Able has a Leave entry spanning today. With Leave and today's date, Able must be
   disabled with `Already on Verification Leave <dates>` and Baker (whose seeded Training entry spans yesterday through
   tomorrow, so 16–18 Oct on 17 Oct) selectable with `Verification Training <dates> overlaps`, taking each date span
   from `$V fixture` and the seed output rather than a fixed day; both show a bar in the day strip and Unassigned shows
   none. `Select available` selects only Unassigned (neither overlap kind) and the picker reads `1 of 3 selected`.
   Select Baker too: the summary bar reads `Add Verification Leave to 2 people · …` with
   `1 person overlaps existing Verification Training`. Fill a unique note, observe `availability/batch` with
   `$V network arm-observe $PAGE availability/batch`, and click `Add to 2 people`. Require one POST `200` with the Baker
   and Unassigned IDs, `$V rows availability_entries orgA note "$NOTE"` returning exactly those two rows with the chosen
   status and dates and none for Able, and after the save every saved person disabled as `Already on …`. Change the end
   date and require the strip and hints to follow (`5 days` for October 16–20). An authenticated later batch aimed at
   `personForeign` must be denied, save no marked row, and leave the earlier rows intact. Remove only the entries you
   created when done; the March historical entry stays.
2. **Status import: sheets, columns, review and commit.** Build a synthetic workbook with exceljs. A `Cover` sheet holds
   prose. Sheets `Sep-Nov` and `Dec` each have a title row and an `UNCLASSIFIED // FOR TRAINING USE ONLY` banner above a
   header on row 3: `Soldier, Status, Start, End, Approved by, Details`, with Soldier written `Last, First`. A hidden
   `Lookups` sheet lists statuses. `Sep-Nov` holds Able, Baker and Unassigned on `TDY - NTC` from 14 November to 10
   December 2026, written `2026-11-14`, `11/14/2026` and `14NOV26`; Able on `Verification Leave` 2026-09-15 to
   2026-09-20 (the seeded Able Leave is 14 to 16 September); Baker on `Verification Training` 2026-10-28 to 2026-10-25;
   and Unassigned on `Verification Leave` 2026-09-15 to 2026-09-15, which is already saved. `Dec` holds Baker on
   `Verification Leave` 2026-12-20 to 2026-12-31. Copy it under `.verification/evidence/` and upload it as
   `calendarConfigure` on `Drop a spreadsheet here`.

   Columns: `Read sheets` checks `Sep-Nov` (6 rows) and `Dec` (1 row); `Cover` reads
   `No recognizable header in the first 15 rows` and `Lookups` reads `Hidden in Excel`, both unchecked; the summary
   reads `2 sheets read · 7 rows`. Row 3 is marked `Header` with the two rows above it hatched, and Soldier maps to
   `Last, First`, Status to Status, Start to From, End to To, and both `Approved by` and `Details` to `Don't import`.
   Set `Import Details as` to `Note`; the footer reads `5 of 6 columns used · Approved by not imported`, and `Dec` shows
   the same mapping.

   Review (`Review 7 rows`) has a `Person` column and reads `All · 7`, `Needs a fix · 5`, `New · 1` and `Unchanged · 1`
   with `1 row already matches. Nothing to save.` The rail asks `Unknown status` for `"TDY - NTC"` (3 rows) with the
   status types and `Create "TDY - NTC"`, and `Rows overlap the calendar` (`Dates already on the calendar · 1 row`) with
   `Keep both`, `Replace the calendar entries` and `Keep the calendar, skip these rows`. The overlap row's From and To
   cells are described by `Overlaps 2026-09-14 → 2026-09-16 Verification Leave. Choose what happens in the fix rail.`
   and Baker's To cell by `To is before From.` Choose `Create "TDY - NTC"`, then `Create status`: one `status_types` row
   named `TDY - NTC` with color `#4a5568` and text `#ffffff`, the three rows turn New and focus moves to the overlap
   question. Fill Baker's To with `2026-10-31` and press Enter; the row turns New. Choose
   `Keep the calendar, skip these rows`; the row reads Skipped with `Change skip for Able, Synthetic in the fix rail`.

   `Import 5 changes` (`5 added · 0 updated`) sends one `POST api/availability/import`. Done reads `5 changes saved.`
   with Added 5, Unchanged 1 and Skipped 1, and lists `Sep-Nov · row 7` with `Skipped: Dates already on the calendar`.
   Capture `Download these rows (.xlsx)` with `$V export`: one sheet `Sep-Nov` with the original six columns,
   `Approved by` included, plus `Reason`. Read `availability_entries` back: one `TDY - NTC` entry from 2026-11-14 to
   2026-12-10 for each of the three people with note `NTC rotation 27-02`, Baker's 2026-10-28 to 2026-10-31 and
   2026-12-20 to 2026-12-31, and the seeded Able Leave unchanged.

   Re-import the same file with the same mapping. `TDY - NTC` now matches without a question and five rows read
   Unchanged. Fix Baker's To again (it reads Unchanged), then answer `Replace the calendar entries` and
   `Apply to 1 row`: Able's row reads Update with `Replaces` over a struck-through
   `2026-09-14 → 2026-09-16 Verification Leave`, and the bar reads `0 added · 1 updated`. At 900 and 390 the card shows
   the incoming `2026-09-15 · 2026-09-20 · Verification Leave` line above `Replaces` and the struck-through entry, with
   both of its dates in full at 390. Import: Done reads Updated 1 and Unchanged 6. The seeded 14 to 16 September entry
   is gone and Able has one Leave entry from 2026-09-15 to 2026-09-20; Calendar › September 2026 shows the bar from 15
   to 20 with nothing on the 14th. Import the same file a third time: after the same fix all seven rows read Unchanged,
   `Import 0 changes` stays disabled and the rows match the previous read exactly.

   Import `Rank, Last name, First name, Status, From, To, Note` with Baker on `Verification Leave` 2026-10-22 to
   2026-10-22, inside Baker's seeded Training of 21 to 23 October. Answer `Keep both`: both entries are saved.

   Two rows for one Person whose dates overlap each other, such as Able on `Verification Leave` 2027-04-01 to 2027-04-05
   and `Verification Training` 2027-04-04 to 2027-04-08, both read Needs a fix with
   `Overlaps row 3 on <sheet>. Keep both in the fix rail, or skip one of these rows.` (and row 2 on the other). The rail
   asks `Rows overlap each other` (`One person, overlapping dates in this file · 2 rows`) with `Keep both` and
   `Skip the later rows`; skipping either row clears the other. `Keep both` saves both entries, including when they fall
   in different 500-row requests.

   A replace never removes an entry another row keeps. Import Able on `Verification Leave` 2027-11-05 to 2027-11-12,
   Baker on `Verification Leave` 2027-11-03 to 2027-11-06 and `Verification Training` 2027-11-10 to 2027-11-10, creating
   a long status `Temporary Duty - National Training Center Rotation 27-01` for Unassigned on 2027-10-01. Then upload
   Able's same Leave (Unchanged), Able on the long status 2027-11-10 to 2027-11-15, and Baker on it 2027-11-01 to
   2027-11-30, and answer `Replace the calendar entries`. Able's two rows read Needs a fix with
   `Row 3 on <sheet> would remove this saved record. Skip one of these rows.` and
   `Would remove the saved record that row 2 on <sheet> keeps. Skip one of these rows.`, and Import counts only Baker.
   Baker's row lists `Replaces` twice, earliest first: `2027-11-03 → 2027-11-06 Verification Leave` and
   `2027-11-10 → 2027-11-10 Verification Training`. At 900 and 390 the cards read
   `2027-11-01 · 2027-11-30 · Temporary Duty…` with both dates in full and one struck line per replaced entry. Each held
   card shows its whole message: one line at 900 (card heights 108, 108 and 136 px) and two at 390 (124, 124 and 136
   px), with no overflow. Skipping Able's long-status row leaves the Leave Unchanged; Import saves Baker's entry,
   removes Baker's two, and Able's Leave keeps its ID. Skipping the Leave row instead turns the other row into an Update
   that replaces it.

   A corrected date reads the calendar it adds before Import. Upload Able on `Verification Training` 2027-06-01 to
   2027-05-30 beside a saved Able Leave of 2027-06-10 to 2027-06-15 and reload first. Review reads `calendar-range`
   2027-05-30 to 2027-06-01. Fill To with `2027-06-12` and press Enter: one more `calendar-range` request reads only
   2027-06-02 to 2027-06-12, the row asks `Rows overlap the calendar` and Import stays disabled. Filling `2027-06-11`
   reads nothing more.

   A replace whose saved entry changes after Review is refused. Answer `Replace the calendar entries` for Baker on
   `Verification Training` 2027-08-12 to 2027-08-20 over a saved Leave of 2027-08-10 to 2027-08-15, then change that
   Leave's end date in a second signed-in tab (`PUT api/availability`) and Import: Done reads `0 changes saved.` with
   Failed 1 and `An entry this row replaces changed since you reviewed it. Import the file again.`, the Leave keeps its
   new end date and no Training row is saved. Repeat with only the saved Leave's note changed after Review, including
   adding a note to an empty note and clearing a note. Each import refuses the replacement and preserves the saved ID
   and latest note. An unchanged empty note still permits replacement.

   For a Person with 501 saved entries inside the incoming row's dates, answer `Replace the calendar entries`. That row
   stays Needs a fix with `This row overlaps too many saved entries to replace in one import. Choose Keep both or Skip.`
   and cannot be imported. `Keep both` makes it New; `Skip` leaves every saved entry alone. With exactly 500 saved
   entries, Replace remains an Update and replaces all 500 in one request. A single row's replacement is never divided
   across requests.

   After `$V seed duplicate-able`, an unranked Able row asks `Which person?`
   with only `SPC Able, Synthetic` and `PFC Able, Synthetic` and no Create; picking SPC saves to the fixture Able. Run
   `$V clean-seeds` afterward.

   As `calendarOperate`, `Import CSV` is in the Bulk Status menu, and an unknown status offers the status types with no
   Create. As `calendarView` there is no `Bulk Status`, `/calendar/import` shows the 403 page and a direct
   `POST api/availability/import` returns 403. The server rechecks scope and overlap per Person: a row whose Person left
   the actor's scope or whose dates now overlap a newer saved entry comes back as not imported with its reason.

   As a Group-scoped Calendar operator with Personnel set to `none`, upload a row that overlaps a saved status for an
   in-scope Person. Review must ask `Rows overlap the calendar`. An exact re-import reads Unchanged. The
   `calendar-range` response includes that Person's saved entries and excludes other Groups and Organizations.

3. **Import loading, failure, widths and size.** Start on Personnel, arm
   `$V server-source arm availability_entries hold 1 120000` and follow an in-app link to `/calendar/import`: the header
   and stepper stay and a `Loading import` skeleton holds the drop zone and the column list at their loaded size.
   Release and restore; the File step arrives without a shift. With `server-source arm availability_entries fail-hard 1`
   the page shows the Calendar layout's `Unable to load Calendar` with `Retry Calendar`, and Retry recovers. On Columns,
   the same failure on `Review` keeps Columns with `The calendar for these dates could not be loaded. Try again.` and a
   later Review reaches Review. Review reads saved entries over the file's dates in `calendar-range` requests of at most
   366 days that skip years the file never mentions. At 900 the rail sits above the rows; at 390 Review shows cards and
   `scrollWidth` equals `innerWidth`. Tab from `Find a status` reaches the rail's radios, its Skip, each problem cell
   and row Skip in order, then `Back to columns`, each with a visible focus ring. For size, a 3,000-row workbook of
   one-day rows from 2028 (every tenth row on an unknown status) reaches Review in about 0.3 s from the drop, and
   answering the 300-row status question takes under 20 ms. Its commit sends six `api/availability/import` requests of
   500 and a replay reads `Unchanged · 3000`.

   Replacement-heavy chunks split into requests of at most 500 replaced entries. With 251 rows each replacing two
   entries, let the first request confirm 250 updates and fail the second with 503. Done must retain Updated 250 and
   Not confirmed 1; the retry workbook contains only the last row. A 403 instead counts that last row as Failed with
   its refusal reason. After either failure, unsent rows in the current chunk and later chunks count as Not attempted.

4. **Removal:** In Remove, select `Verification Training` and Baker, keeping the default today dates; choosing today
   again in a date picker clears that date. Observe the range request with
   `$V network arm-observe $PAGE calendar-range`: it records the GET and its status (`200`) but no IDs or counts
   (`count` stays 0), and the canonical fixture Organization ID is read from the page URL; a malformed Organization path
   is a failed review, not an authorization denial. `Review Matching Entries` must warn that the partial overlap will be
   removed entirely, identify Baker and the whole saved date span, and say nothing is removed until confirmation. The
   seeded Baker entry spanning yesterday through tomorrow must still exist. Click `Back` and compare the complete A/B
   rows to their pre-review values. Choose a status with no entry for the selected Person and range; review must say
   `No matching status entries were found` and offer only `Back`. For a confirmed deletion without consuming that seed,
   run `$V seed overlap`, reload `/calendar/bulk`, choose Able/Leave/today, review the same whole-entry warning, then
   `Confirm Removal`; the temporary overlap row disappears after reload while the historical March and Baker rows
   remain. For the real count, arm `$V feedback arm $PAGE`, review two matching entries in one tab, then in a second
   `$V actor calendarOperate calendar/bulk` page review and confirm removal of one of them. Confirm the first tab: the
   success message must read `Removed 1 status entry; 1 was already gone` and `availability_entries` loses only the
   entry that was still present. A removal that matches nothing says `Removed 0 status entries; 2 were already gone`.
   Finish every comparison that depends on seeds before `clean-seeds`, which removes all journaled cohorts. When the
   range-loading boundary is affected, arm `$V network arm-fail $PAGE calendar-range` before Review Matching Entries.
   Require actionable failure, no deletion and the retained selection; restore the hook and retry natively to a real
   `200` review. With `calendarSwitch`, separately hold an actual A range response, navigate visibly to B with the
   Organization menu or schema-supported native `navigate_page` Back, then release. Confirm B's admitted route and
   unchanged rows before and after release; old A results must not populate B or produce stale feedback. Preserve the
   actual navigation receipt and distinguish a script-based history observation from a native Back action.
5. **Zero-save recovery and partial retry:** Run `$V seed bulk-501`, reload `/calendar/bulk` so the new People join the
   loaded roster, and retain the returned tag and Person IDs for both checks. Use a nondefault status, a nondefault
   valid date range and separate unique notes for each check. Record the exact submitted values and zero marked A/B rows
   before each save. First select exactly one temporary Person through Add's native controls; the summary bar must read
   `Add <Status> to 1 person · <dates>`. Arm `$V network arm-fail $PAGE availability/batch 1`, then click
   `Add to 1 person`. Require one actual one-record request with synthetic `503`, zero marked A/B rows, and the same
   one-Person draft with `Add to 1 person` enabled again. Restore the hook before retry. Observe the next native save;
   require one one-record `200`, one exact A row, B zero effects and the form returning to its empty state. Retain that
   separate-note row unchanged throughout the following check. For the partial check, search the returned `MapChunk`
   names by appending the tag directly (`2b1e98e5`, no angle brackets; a two-word search such as `MapChunk… Synthetic`
   matches nothing) and choose `Select available`. Confirm exactly 501 selected People. Choose the nondefault fields and
   second unique note. Arm `$V network arm-fail $PAGE availability/batch 2` immediately before `Add to 501 people`.
   Capture `$V network state $PAGE`: first request has 500 records and `200`, second has one and synthetic `503`, both
   carry the chosen note. The toast must read `Applied status to 500 of 501 people — …` and the picker must read
   `1 of 501 selected`: the 500 saved people are disabled with `Already on <Status> <date>` and only the failed Person
   remains selected and enabled. Dismiss the toast with `Close toast` before clicking, because the toast covers the
   summary bar's save button. Exact A rows must match the first 500 request IDs and submitted values, with no row for
   the failed ID and no marked B rows. Restore with `$V network restore $PAGE`, then click `Add to 1 person`. Capture
   the single retry request for only the failed Person and its `200`. Expect 501 unique A Person IDs for the
   partial-check note, the earlier separate-note row unchanged, and B zero effects. Reload and reread the saved rows.
   Complete every seed-dependent comparison before `$V clean-seeds`, which removes all journaled seed cohorts. **Range
   read failure:** with `$V network arm-fail $PAGE calendar-range`, pick an end date beyond the loaded months (for
   example December 4 from October 16). Require the alert
   `Could not read the existing entries for these dates, so overlaps are unknown.` with `Retry`, and a selected Person's
   `Add to 1 person` disabled. Restore the hook, click `Retry`, require a real `calendar-range` `200` and the save
   re-enabled, then save and read the saved row back after reload. Dates inside the already loaded range make no
   `calendar-range` request. **Range coverage:** with the default span loaded, choose an end date in December, then a
   start date more than 366 days earlier (for example 1 January 2025), observing `calendar-range` with `arm-observe`.
   Require each recorded request to span at most 366 days, the `Checking existing entries…` note to clear and a selected
   Person's `Add to 1 person` to enable; pick a status nobody already has so the Person stays selectable. Then arm
   `$V network arm-hold $PAGE calendar-range`, choose a start far beyond the loaded span (pick the start first so an
   inverted range makes no request) and the matching end. While the read is held, return both dates to today's covered
   week, release and restore. Require no `Checking existing entries…`, `Add` enabled and no new `calendar-range` request
   for further covered dates.

6. **Provider-sized removal:** Use a fresh `bulk-501` cohort and unique notes. Through Add, search the returned
   `MapChunk` tag, `Select available`, then uncheck the first temporary Person. The summary must read
   `Add Verification Leave to 500 people`; click it with Leave and a single explicit date. Require 500 saved A entries
   with that note and no B effects; the unselected Person has no marked entry. In Remove, use the same search,
   `Select shown`, status and date. Review 501 selected People and exactly 500 matching entries. Save the complete A/B
   rows and matching IDs. Click Back and require exact unchanged rows, then review again. Observe with
   `$V network arm-observe $PAGE availability/batch` and confirm: exactly one JSON DELETE with those 500 IDs, `200`.
   Require `Removed 500 status entries`, all 500 marked entries absent after reload, the temporary Personnel cohort
   retained and unrelated original A/B rows unchanged. **Failure of the only request:** arm
   `$V network arm-fail $PAGE availability/batch 1` before the first Confirm Removal. A synthetic failure must show
   `Failed to remove status entries`, leave the review (and its 500-entry count) available and delete nothing; restore
   the control and retry natively to a real `200`. Never treat an unchanged 500-row failure as passing. **501 entries:**
   Through Add, add all 501 People again with a new unique note (the previous 500 were removed, so adding only the
   Person left out would create one entry) or use a fresh cohort, so all 501 `bulk-501` People have one marked Leave
   entry: search the tag, `Select available` (two POST chunks, 500 then 1). In Remove, search the same tag,
   `Select shown`, choose Leave and the date, review `501` matching entries and save the complete A/B rows. Observe
   `availability/batch`, then `Confirm Removal`. Require two DELETEs of 500 and 1 IDs in review order
   (`$V network state $PAGE`), both `200`, `Removed 501 status entries` and zero marked entries after reload. The toast
   is transient: arm `$V feedback arm $PAGE` before confirming and wait natively for the expected text, or poll the
   armed feedback observer, before navigating or reading rows. **Failure after the first chunk:** repeat the 501-entry
   setup with a fresh note, then arm `$V network arm-fail $PAGE availability/batch 2` and confirm. Require DELETEs of
   500 (`200`) and 1 (synthetic failure), the toast
   `Removed 500 of 501 status entries — 1 remains; confirm again to retry`, the review still open showing `1` total
   entry and `Confirm Removal` enabled, and exactly the 500 first-request IDs absent from `availability_entries` with
   the one remaining row present. Dismiss the toast with `Close toast` if it covers the button. Restore with
   `$V network restore $PAGE`, then confirm again: require one DELETE carrying only the remaining ID (`200`), the
   success toast `Removed 501 status entries` (each entry counted once, no `already gone`), and zero marked entries
   after reload. Finish all cohort comparisons before `clean-seeds`.

7. **Appearance.** As `calendarOperate` on `/calendar/bulk`, use `resize_page` for 1440x900 and the visible **Toggle
   theme** for light (it cycles, so read `document.documentElement.dataset.theme`). In Add capture the header (title
   with the section switch and `Back to calendar` beside it), Step 1 (`Status` chips, the `Dates` label over both
   pickers, day count, `Note`, `Preview`), Step 2 (`Who`, the selected count, the `Roster picker controls` toolbar with
   its search, `Clear` and `Select available`, each Group header with its `N of M` count, and the Person rows with their
   hints and day strip; `Already on …` reads in the danger tone and `… overlaps` in the warning tone) and the sticky
   summary bar on the dark chrome surface in both themes, once with the seeded overlaps from step 1 and once after a
   save that makes a row show two entries (the hint wraps to two lines and stays inside the table). Capture the Remove
   tab's review. Repeat at 390x844 dark. At each capture read `document.documentElement.scrollWidth` against
   `innerWidth`; the picker's own scroll region scrolls horizontally at 390 and the availability column and hints sit at
   its far end, so scroll `[data-slot="table-container"]` to read them.
8. **Validation and selection.** In Add, choose an `End date` before `Start date`. The date error must be announced
   (`role="alert"`, `End date must be on or after start date`) in Step 1 beside the dates whether or not a Person is
   selected, and the summary bar repeats it, `Preview` must ask for valid dates, the hints and strip must drop out, and
   `Add to N people` must be disabled; restore the dates. In Remove, with a Person selected, clear `Start Date` (choose
   its current day again), then restore it and clear `End Date`: the alert and summary must name the missing date, no
   `Invalid Date` may appear and Review stays disabled. Using the keyboard, Tab to a `Select <Group> group` checkbox and
   press Space: every enabled Person in it becomes selected and the count updates (a Group whose people are all disabled
   has a disabled checkbox, and a disabled Person is never selected through it). Press Enter on `Collapse <Group> <N>`:
   its rows hide while the selection count stays; press Enter again. Search `Able` and choose `Select available`, then
   `Clear` empties the selection. In Remove choose `Select shown` instead. Record the focused element after each action
   and a visible focus indicator.
9. **Busy, loading, empty and denied.** Select Unassigned, choose `Verification Leave`, a later date and a unique note,
   arm `$V network arm-hold $PAGE availability/batch` and click `Add to 1 person`. While held capture the busy state:
   the save button reads `Applying...` and the status chips, both date pickers, `Note`, every roster and Group checkbox,
   `Select available` and `Clear` are disabled. Release, require the success message and the emptied form, then restore
   the hook and remove the created entry. For the workspace loading state start `calendarOperate` on Personnel, arm
   `$V server-source arm availability_entries hold 1 120000`, follow an in-app link to `/calendar/bulk` (a native
   `navigate_page` waits on the held document and stalls the page) and capture the Calendar layout's
   `Loading Calendar data` skeleton before `$V server-source release` and `restore`. As `calendarEmpty` capture Add with
   `No personnel available` (Step 2 table empty); as `calendarScoped` the roster holds Alpha only; as `calendarView`
   capture the `Access restricted.` card without section buttons. Capture each at 1280 light and 390 dark.
10. **Large roster.** Run `$V seed bulk-501`, reload `/calendar/bulk` at 1280 light, then read the rendered roster row
    count (`[data-slot="data-table"] tbody tr` or the table's rows), the Person total and
    `performance.getEntriesByType('resource')` grouped by `__data.json`, `calendar-range` and other. Measure five
    reloads from navigation start to the first Roster row and the main-thread long tasks. Mark `performance.mark` just
    before native clicks on `Select available` (Add) and `Select shown` (Remove), and measure to the next settled frame
    after the count changes. Run `clean-seeds` afterward.

## Gotchas

- An import cell with an impossible calendar day, such as `2026-02-30`, is an inline fix in Review and is never sent.
  See [Invalid input](invalid-input.md).
- Add, Remove and Import are distinct user paths. A direct authenticated batch or import request can check server
  effects but does not demonstrate the review and feedback.
- Import answers apply to one file. Re-importing asks the same overlap question. A replace whose saved entry changed
  since Review comes back as not imported with
  `An entry this row replaces changed since you reviewed it. Import the file again.`, and a row whose dates now overlap
  a newer saved entry with `This row now overlaps the calendar. Import the file again to choose what happens.`
- Review reads each date range once per page visit. A second Review of the same dates, or a correction inside them,
  sends no `calendar-range` request; reload to read them fresh.
- Replace deletes each overlapped saved entry whole, in the same transaction as the insert, and at most 500 replaced
  entries go in one request; read rows back rather than trusting the Done counts.
- The partial-chunk control must see two actual batch calls. Check `network state`; if the second call never occurred,
  record the path as unreachable or failed rather than crediting a generic error toast. The 501 temporary People can
  make the roster slow; clean only the helper-owned IDs after proof.
- `network arm-observe` or `arm-fail` refuses to arm while an earlier control is still installed
  (`Restore the existing map network control first`); run `$V network restore $PAGE` between the Add seeding and each
  Remove case, and read request counts from `network state` before restoring. `arm-fail` already matches DELETE and
  reports the `ids` of each `availability/batch` call; its ordinal counts requests since arming. A Remove toast is
  transient and a retry can finish after the click returns: arm `$V feedback arm $PAGE` first and wait natively for the
  expected text or poll the observer, rather than snapshotting a fixed second after `Confirm Removal`.
