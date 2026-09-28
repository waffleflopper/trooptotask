# Reports and history

A Calendar reader sees saved availability across current and historical ranges, exports status-day totals from the same authorized people, and sees today's availability on the Dashboard without foreign facts.

## Sub-features

- `saved-ranges`: September and historical March Calendar reads retain own statuses and closure, excluding B.
- `status-day-report`: the report page renders A's saved people and status totals, without foreign rows or special-day export data.
- `status-day-workbook`: the downloaded `Status Days` sheet contains independently expected counts, labels and exclusions.
- `dashboard-current`: today's Baker training projects one unavailable Person and remains Organization-scoped after reload.

## How to get to it (user POV)

Choose `Calendar` → `Reports`, choose a year, then `Run status-day report` and `Export status days`. The month/year picker and `3-Month` view expose older saved dates. The Organization's Dashboard is its overview route; its current availability card summarizes today.

## Driving it with verify:app

Preconditions: doctor passes; `$V actor calendarLane calendar` returns `PAGE`; `$V fixture` gives A/B Person and availability IDs, `dates.historical`, `dates.uiBefore/uiAfter`, and closure IDs. Use the same signed-in page for the report and Calendar reads. For the Dashboard projection, open `$V actor calendarView` in its own page: that role also has Personnel view access, which supplies the visible roster summary. Capture network status/body and UI snapshots together; preserve the actual workbook under the durable evidence directory.

1. Read `GET /org/<orgA>/api/calendar-range?rangeStart=2026-09-14&rangeEnd=2026-09-16` through authenticated `tool evaluate_script`, then a range from March 11 through October 14, 2026. The first includes Alpha, Bravo and Unassigned seeded availability; the second also includes `availabilityHistorical` and any current Baker row overlapping those dates. Both include A's Leave type and `closureA`, and neither contains B's availability/status/closure IDs. Save the request path, response status and known-ID comparison.
2. Choose September 2026 in Calendar. Capture Able's three leave day titles with `Alpha seeded leave`, Baker's training note, Unassigned's leave and the `Verification Unit Closure` date header. Switch to `3-Month`; September still shows those statuses and closure. Move twice to March–May, wait for loading to finish and capture one `Historical retained` leave day. Move forward twice and capture the restored September facts.
3. Open `Reports`, choose `2026`, and click `Run status-day report`. The rendered result includes Able and Baker (and Unassigned where listed), no Foreign Person or `Foreign Private Status`, and an `Export status days` action. The authenticated status-days response for September 14–16 includes A's saved availability IDs, excludes B's, and does not export the closure as a status row. Save the report result before exporting.
4. Run `$V export arm $PAGE`, click `Export status days`, then `$V export save $PAGE .verification/evidence/verify-trooptotask/<run>/status-days.xlsx` and `$V export restore $PAGE`. Run `$V workbook <same-path>` and inspect the `Status Days` sheet. Able has `4` Verification Leave days (March 11 plus September 14–16); Unassigned has `1` Leave day; Baker has `1 + inclusive overlap days of dates.uiBefore..uiAfter with calendar year 2026` Verification Training days. The workbook has no Foreign row, foreign status column, or Organization closure status column. A click or toast without captured workbook bytes does not prove export contents.
5. In the `calendarView` page, visit Organization A's Dashboard and capture Baker's current `Verification Training` and `1 out` summary, with no B labels or Person. Reload and confirm the same scope. If the fixture's local date no longer overlaps Baker's seeded `uiBefore..uiAfter` after a long run, check the fixture date and relaunch rather than revising the expected product rule.

## Gotchas

- The fixed September/March records and today's Baker projection use different dates. Use `$V fixture` to calculate the workbook overlap, and wait for range loading to finish before comparing cells.
- A visible report is weaker than the downloaded workbook. The helper captures the real Blob from the visible Export action and saves it outside the disposable worker; restore the capture even after failure.
- Other Calendar report types are source-mapped until their own user paths and exports are driven. Focused workbook, route and Dashboard tests remain lower-level evidence, not substitutes for this live read.
