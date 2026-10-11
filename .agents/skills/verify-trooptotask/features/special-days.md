# Special days

A Calendar configurator adds and edits Organization closures, removes a selected closure, and resets federal holidays while preserving custom closures and the other Organization's days.

## Sub-features

- `closure-lifecycle`: add on the displayed local date, reload, edit without changing identity/date/type, then confirmed removal of only that closure.
- `closure-failed-edit`: a lost configuration grant leaves the edit open with an error and the saved row unchanged.
- `federal-reset`: confirmation distinguishes closures from federal holidays; reset replaces custom federal rows with observed defaults for the supported year window.
- `special-day-scope`: A's Calendar shows A's closure, excludes B's; an A actor cannot write B's closure.

## How to get to it (user POV)

With Organization-wide Calendar configuration access, choose `Calendar` → `Settings` → `Closures`. Use `Add new`, a closure row's `Edit <name>, <date>`/`Delete <name>, <date>` action, or `Reset Federal Holidays`. The Calendar month grid also shows a closure label on its date.

## Driving it with verify:app

Preconditions: doctor passes; `$V actor calendarConfigure calendar/settings` returns `PAGE`. `$V fixture` gives today's `dates.ui`, `closureA`, `closureB`, and `holidayCustom` IDs. Use unique closure names. Capture Settings and exact synthetic row readback before each mutation. Restore grants even after an unsuccessful request.

1. Open `Closures`, click `Add new`, read the displayed default date, fill `Name`, and choose `Add Closure`. `$V rows special_days orgA name "$NAME"` must show one `org-closure` with that displayed local date. Reload Settings and confirm the name remains. This proves default-date creation; selecting another date is a distinct source-mapped path until driven.
2. Open the new row's `Edit <name>, <date>`, fill a different name, and run `$V calendar-grant calendarConfigure view` while the form stays open. Click `Save Changes`. Require the denied request, visible actionable failure feedback such as `Failed to save closure`, the retained edit dialog/draft, and readback showing the old name under the same ID. Capture these together before restoring access. Missing visible feedback is a failed user-facing result even when the server correctly denied the write; retain that defect and identify its owner. Restore with `$V calendar-grant calendarConfigure restore`, reload, edit and save normally. Confirm the new name with the original ID, date and `org-closure` type. Delete it through its named action and confirmation; after reload it is absent while `closureA` remains.
3. Reload `/calendar` with `navigate_page`, choose September 2026, and confirm `Verification Unit Closure` appears, while `Foreign Private Closure` does not. From the A configurator's signed-in page send an authenticated `POST /org/<orgB>/api/special-days` with `{name: 'UNIQUE_MARKER', date: '2026-09-23', type: 'org-closure'}` using the authenticated `tool evaluate_script` request shape in [Calendar catalogs](calendar-catalogs.md). Expect `403` or `404` and `$V rows special_days orgB name ...` with zero rows; the seeded B closure remains intact.
4. Run the federal reset last. Before reset, capture A's custom federal row and A/B closure rows with `$V rows special_days`. Click `Reset Federal Holidays`; the dialog must say custom closures will be preserved. Confirm Reset, reload, and compare saved A federal rows against independently calculated observed dates for each supported year: New Year's Day Jan 1, MLK third Monday Jan, Presidents third Monday Feb, Memorial last Monday May, Juneteenth Jun 19, Independence Day Jul 4, Labor first Monday Sep, Columbus second Monday Oct, Veterans Nov 11, Thanksgiving fourth Thursday Nov, Christmas Dec 25. Observe a fixed-date holiday on Friday when it falls Saturday and Monday when it falls Sunday. The custom `holidayCustom` row is replaced; `closureA` and B's `closureB` keep their IDs. For 2026, Independence Day is observed July 3. Capture the complete 2026 list and the supported year bounds, not just a Reset toast. Before another journey needs `holidayCustom`, run `npm run --silent verify:app -- restart --worker "$WORKER"`, then `doctor` and `$V fixture` again; set `WORKER` to the worker selected at launch and refresh page/fixture IDs.

5. **Held save.** Run this before the reset in step 4. Open `Add new` in `Closures`, fill a unique `Name`, arm `$V network arm-hold $PAGE special-days` and click `Add Closure`. While held, capture the busy submit button and that Escape leaves the dialog open. Release with `$V network release $PAGE`; the dialog closes and the closure appears. Restore the hook, then delete the closure through its named action and confirm its row is absent. Capture at 1280 light and 390 dark.

## Gotchas

- Reset intentionally replaces custom federal holidays but preserves Organization closures. A current-month view may not include the fixed September 2026 closure; choose the seeded month before judging it absent.
- A failed edit can leave an optimistic draft. Compare the saved row and keep the error dialog in evidence before restoring the grant. A hidden Add button alone is not server authorization proof.
- Calendar component/store tests cover failed reset and late response/Organization switching separately; exercise those paths live only when the change affects them. Direct catalog SQL policy remains a separate check.
- `clean-seeds` does not restore the custom federal fixture after Reset or remove a closure created through Settings; remove your new closure in step 2 and restart the owned worker after Reset when another journey needs the original fixture.
