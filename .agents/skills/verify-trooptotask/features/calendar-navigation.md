# Calendar navigation

A member moves through the availability calendar, narrows the people shown, and switches between the month and long-range views.

## Sub-features

- `calendar-entry`: enter Calendar from organization navigation.
- `calendar-month`: move with `Prev`, `Next`, month picker, and `Today`.
- `calendar-range`: switch to and from `3-Month` view.
- `calendar-filter`: narrow the grid with the group filter or searchbox.
- `calendar-saved-range`: the fixed September statuses and closure render in month and long range, and the historical March status remains reachable.
- `calendar-picker-keyboard`: ArrowLeft changes focused month and Escape dismisses the picker.
- `calendar-workspace-reuse`: moving between Calendar, Assignments, Bulk Status and Settings keeps the loaded workspace and sends no page-data request.
- `calendar-range-retry`: an additional-range failure shows a retry and a later successful load restores local data.
- `calendar-stream-range`: pages wait for initial streamed data before loading additional ranges or accepting workspace actions.

## How to get to it (user POV)

Sign in with Calendar access and choose `Calendar` in the sidebar. The toolbar holds `Calendar group filter`, the personnel searchbox, `Bulk Status`, `Planning`, `Reports`, and more actions. The Calendar header holds `Prev`, the month/year button, `Next`, `3-Month`, and `Today`.

## Driving it with verify:app

Preconditions: doctor passes; `$V fixture` supplies fixed September/March records and the local current date. Restore filters and request controls between cases.

1. Run `$V actor calendarOperate personnel`; keep its page ID as `PAGE`. From the fresh snapshot, click the sidebar `Calendar` link, then confirm the `/calendar` route and visible `Alpha`, `Bravo`, and `Unassigned` personnel groups. This proves the navigation entry as well as the Calendar landing.
2. Capture the current month label. Click `Next` from a new snapshot and confirm the month advances. Click `Today` and confirm the label returns to the current month; test `Prev` similarly. Use the month/year button to inspect the picker and dismiss it without changing the month when testing cancel.
3. Click `3-Month` and confirm the long-range view appears. Snapshot its return control and switch back to the month view.
4. Open `Calendar group filter` and select `Alpha`; confirm Able remains while Baker is absent. Clear the filter and confirm both groups return. Fill the searchbox with `Able`, confirm Baker is absent, then focus it and press `Control+A` followed by `Backspace` with `tool press_key`. Confirm all groups return; an empty native `fill` can leave the previous filter applied.
5. With the filter clear, click the month/year label, choose September 2026, and capture the named Able, Baker and Unassigned rows plus `Verification Unit Closure`. Able's `Verification Leave - Alpha seeded leave` covers September 14–16; Baker has `Verification Training - Bravo seeded training` on September 15; Unassigned has leave that day. Click `3-Month` and confirm these saved status labels and closure in the September–November view. Move `Prev 3 Months` twice: March–May shows the one `Historical retained` leave day. Move forward twice and confirm the September facts return. Wait for the range to settle; a loading label is not proof.
6. Open the `Month and year picker`; record the focused month, press `ArrowLeft` through `tool press_key`, confirm focus moves, then press `Escape` and confirm the dialog closes without changing the selected month. Capture before/after snapshots.
7. On an uncovered long-range request, arm `$V network arm-fail $PAGE calendar-range`, then use `3-Month` or `Next 3 Months`. Capture `Additional calendar data is temporarily unavailable.` and `Retry calendar load`, plus `$V network state $PAGE` showing the synthetic `503`. Click `Retry calendar load`; expect a real `200`, local statuses and no foreign labels. Restore with `$V network restore $PAGE` even if the drive fails, and run doctor before continuing after an unexpected result.
8. For workspace reuse, as `calendarConfigure` on a settled `/calendar`, clear resource timings, then use visible controls to visit `Planning` → `Assignment Planner`, the `Calendar` link, `Bulk Status` → `Add Bulk`, the `Calendar` link, and `Settings`. Read the page-data probe from the skill's Drive section after each stop: expect no `__data.json` entry. Then click `Reports` and expect one `calendar/reports/__data.json` whose Calendar layout digit is `0`. Separate `calendar-range` requests are range loads, not workspace reloads.
9. For streamed workspace readiness, start `calendarOperate` on Personnel and arm `$V server-source arm availability_entries hold 1 120000` before choosing Calendar. Confirm `server-source state` reports the real bootstrap read held. Capture `Loading Calendar data`, absent workspace controls and no new `calendar-range` request while the source is held. Release with `$V server-source release`, wait for the workspace controls, then choose `3-Month` and capture the completed additional-range response. Switch back to month view, select September 2026 and confirm the saved Able, Baker and Unassigned statuses and closure from step 5, with a second visible read. Restore with `$V server-source restore`. This controls response order in the owned app; it does not simulate a production outage. Delivery tests gate each delayed stream and cover cancellation after denial; Calendar range tests cover authoritative replacement and empty results.

## Gotchas

- Month labels depend on the test date; compare before and after instead of hardcoding September 2026.
- The grid contains many unnamed day cells. Use named toolbar controls for navigation and use the latest snapshot for any cell interaction.
- If the Group select's options are absent from the accessibility snapshot, open the named filter and use native `press_key` with `ArrowDown`/`ArrowUp` and `Enter`. Confirm the selected label and resulting Person rows after it settles; a DOM `.click()` on its custom option does not reliably select it.
- Use `$V fixture` for the fixed dates and today's local date; a current-month screenshot does not establish the September or March records.
- Arm the range failure before requesting an uncovered range. A cached range may not call the endpoint, so record `network state` before claiming a failure was exercised. Range coverage restarts each time `/calendar` mounts, including a return from another Calendar page.
- `calendarOperate` is a synthetic fixture role accepted by `login`; it has Calendar access that the ordinary `manager` fixture does not.
