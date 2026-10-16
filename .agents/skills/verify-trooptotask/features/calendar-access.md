# Calendar access

A member reads only the Calendar people and statuses allowed by their Organization and Group scope, and the server rejects writes outside that authority.

## Sub-features

- `calendar-organization-read`: a Calendar-only Organization member sees Alpha, Bravo and unassigned statuses, but no foreign record.
- `calendar-group-read`: an Alpha-scoped member sees Able and only the Alpha Group; an empty Group scope sees no saved availability and no Group.
- `calendar-write-denial`: view-only, no-Calendar, out-of-Group, unassigned and foreign Person writes fail through both single and batch paths.
- `calendar-foreign-status`: an Organization A operator cannot attach Organization B's status to Able.
- `calendar-foreign-read`: an A member cannot fetch B's Calendar range or its private IDs.

## How to get to it (user POV)

Sign in as a Calendar member and choose `Calendar`. A member's Organization and Group grants determine which Person rows and status bars appear. `calendarLane` has Calendar access without Personnel access; `calendarScoped` has Alpha, while `calendarEmpty` has an empty Group grant. The modal and `Bulk Status` are write entry points for an operator. The owned browser may also inspect authenticated Calendar responses to prove server behavior beyond the visible controls.

## Driving it with verify:app

Preconditions: doctor passes; `$V fixture` gives `orgA`, `orgB`, known Person/availability/status IDs, and September 14–16, 2026. Keep each role in its own page and record the page ID. Use `$V actor ROLE calendar` because the public login command's Personnel landing page cannot settle for every Calendar actor; use `$V actor manager personnel` for the no-Calendar member's authenticated server probes.

1. With `calendarLane`, choose September 2026 with the month picker (the month title button in the title row). Capture Able/`Alpha seeded leave`, Baker/`Bravo seeded training`, Unassigned/`Unassigned seeded leave`, and absence of `Foreign Private Status`. An authenticated `GET /org/<orgA>/api/calendar-range?rangeStart=2026-09-14&rangeEnd=2026-09-16` on that page must contain the three A availability IDs and no foreign ID. Repeat with `calendarScoped`: only Able/Alpha's ID may be present, and the Calendar's Group headings, Group filter and page data name Alpha but not Bravo. Repeat with `calendarEmpty`: no A availability ID and no A Group may be present. `calendarLane` keeps both Alpha and Bravo without Personnel access. For all three roles, require `200` and absence of `personForeign`, `availabilityForeign`, `statusForeign`, and `Foreign Private Status` from the response. Capture the page and response body/status for each role.
2. For server write checks, use the currently signed-in page's `tool evaluate_script` to call `fetch('/org/<TARGET_ORG_ID>/api/availability', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({personnelId:PERSON_ID,statusTypeId:STATUS_ID,startDate:'2026-09-14',endDate:'2026-09-14',note:MARKER})})` and return `{status,body:await response.text()}`. Repeat the same payload against `/org/<TARGET_ORG_ID>/api/availability/batch` wrapped as `{records:[payload]}`. Substitute the target Organization from the next step, not the actor's landing Organization. Use unique markers and run both `$V rows availability_entries orgA note MARKER` and `$V rows availability_entries orgB note MARKER` after each pair; denied writes must have `403` or concealment `404` and zero saved rows in either Organization.
3. Run the paired single/batch attempts with `calendarView` on Able (view is insufficient), `manager` on Able (no Calendar grant), `calendarScoped` on Baker and on Unassigned (outside Alpha), `calendarEmpty` on Able (empty Group scope), using A endpoints and A's `statusLeave` for each. Then as `calendarLane`, target **B endpoints** with B's `personForeign` and `statusForeign`; this is a foreign-Organization request, not a foreign ID sent to A. Record the actor, target Person and Organization beside each response. A hidden button or inaccessible modal does not replace these server checks.
4. With `calendarOperate`, send one single and one batch A request targeting Able but using B's `statusForeign` ID. Both must be denied and their unique markers absent from A rows. With `calendarLane`, request B's September range; expect `403` or `404`, with no `availabilityForeign` or `Foreign Private Status` in the body. Capture the denied response and a B readback using `$V rows availability_entries orgB id <availabilityForeign>` to confirm the protected fixture still exists.

## Gotchas

- `calendarLane` and `calendarEmpty` cannot be reliably reached with the public `login ROLE` command's Personnel landing page; use `$V actor` with the Calendar path.
- Calendar range response IDs come from the explicit synthetic fixture, not from whichever rows the app happened to return. A `200` with an empty or mixed response can still be wrong.
- The browser's authenticated `fetch` proves application endpoint policy. Run `supabase/tests/calendar_lane_unassigned_scope.sql`, `calendar_catalog_scope.sql` and `group_catalog_scope.sql` separately under the approved disposable database procedure for direct row-policy and foreign-reference protection.
