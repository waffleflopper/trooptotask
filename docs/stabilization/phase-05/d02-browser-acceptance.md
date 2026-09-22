# D02 extended browser acceptance

**FAIL — local acceptance reopened; PR checkpoint BLOCKED.** The extended production-browser test found two reproducible retained Calendar failures. Both predate this PR according to the base/head source comparison; neither receives a waiver. Earlier deletion, security and verification evidence remains valid within its tested scope. This is deliverable acceptance, not whole-phase acceptance or production certification.

## Candidate and environment

Reviewed [PR #1322](https://github.com/waffleflopper/trooptotask/pull/1322), active child [#1317](https://github.com/waffleflopper/trooptotask/issues/1317), parent #1278 and workflow #1275. Base `5c0662bbd37a5df478b634f72a0e4d7bef3c9e8e`; head `3a0598439a6a9d8f7e01b1f8edceecec97ffe3f6`. The exact range contains four commits: `74732101`, `ea6edd88`, `a62b66d5`, `3a059843`. The working tree was clean throughout browser testing. Only review documentation changes follow this test; no application repairs were implemented. PR and child remain OPEN and unmerged.

On September 22, 2026, testing used the Linux T3 in-app browser accepted by Robert: T3Code Nightly `0.0.43-nightly.20260922.2096`, Chromium 152 / Electron 44.4.2, Anchorage timezone. Desktop 1280×800 and phone-width 390×844 views were exercised. This is not a Safari or physical Mac/iPhone test. The private preview URL was `https://omarchy.tail930090.ts.net:18015`; its owned supervisor was stopped after testing.

Fresh disposable project `t3-calendar-user-test-1322`, directory `/tmp/t3-calendar-user-test-1322`, used API 61321, database 61322 and separately allocated 6132x service ports. All 136 immutable migrations replayed through `20260922000200`; legacy seeds were disabled. Provider URL `http://calendar1322.localhost:61321` gave this session its own authentication cookie namespace. Private credentials remained outside Git. Existing local stacks and remote/production databases were not used. This PR changes no schema; this is fresh-fixture evidence, not a claimed schema-upgrade verification.

The synthetic Northwind Troop Clinic has 48 active personnel, four groups of 12, one archived person, 319 saved assignments, nine initial availability entries, seven assignment types, five statuses, 96 training records and retained sign-in data. Dates cover July–October and December/January boundaries. Historical Duty lineage, a genuine computed blocker/cooldown, duplicate names, mixed statuses and a hidden cross-group assignment create meaningful counterexamples. Five accounts cover owner, organization-wide Calendar operator, Primary Care editor, Primary Care viewer and a different organization's owner.

The dev server first passed rendering/HMR checks; the main journeys ran against a freshly built production preview. Browser clicks, typing, keyboard interaction and normal login performed mutations. One explicitly identified supplemental authenticated request tested server denial. No repository browser suite, runtime bypass or application-state injection was used. Exports and native save dialogs were skipped at Robert's explicit request.

## Findings requiring repair

### N1 — Three-month Today does not update the owning Calendar date

**Reproduction:** choose December 2026 in month view → 3-Month → Today → wait for September–November 2026 → switch to month. The page returns to December, although Today just selected September. Reproduced with a pause between actions; no mutation was needed.

**Paths:** [LongRangeView.svelte](../../../src/features/calendar/components/LongRangeView.svelte), lines 59 and 183–196, changes its private `viewStartDate`; [CalendarPageView.svelte](../../../src/features/calendar/components/CalendarPageView.svelte), line 170, supplies the store date one-way. [CalendarPageContext.svelte.ts](../../../src/features/calendar/contexts/CalendarPageContext.svelte.ts), line 261, only toggles the view mode. The [Calendar route](../../../src/routes/org/[orgId]/calendar/+page.svelte), lines 79–84 and 115–117, loads ranges and persists the anchor using the unchanged store date.

**Consequence:** navigation can leave users on the wrong dates. Source inspection also shows quarter navigation does not notify the range loader, risking missing out-of-window records. That additional quarter missing-data scenario was not independently completed in the browser and is not claimed as a browser pass or reproduced loss.

**Smallest complete repair:** make Previous/Next/picker/Today update the Calendar-owned date through a narrow callback. Use that date consistently for display, range loading, anchor persistence and exports. Verify all navigation paths, out-of-window saved data, error/retry and stale responses; fixing only the toggle is incomplete.

### N2 — Assignment Planner presents unloaded saved slots as editable vacancies

**Reproduction A:** after visiting December in Calendar, fully load `/calendar/assignments`. Its heading says September, but September 22 Staff Duty and the other saved slots display `-`. No Calendar range request follows. Returning to Calendar → Today writes a September anchor; a full planner reload then shows the saved Turner assignment. This isolates the cookie/bootstrap mismatch.

**Reproduction B:** from that correctly loaded September planner, click Next month three times. December 31 Staff Duty displays `-`, although the independent fixture snapshot and main Calendar show SPC Hayes assigned there. No Calendar range request occurs. No real assignment was overwritten during these reproductions.

**Paths:** [MonthlyAssignmentPlanner.svelte](../../../src/features/calendar/components/MonthlyAssignmentPlanner.svelte), lines 41, 63–65, 73–82 and 279/299, navigates a local date and looks only in already loaded assignments. [AssignmentPlannerPage.svelte](../../../src/features/calendar/components/AssignmentPlannerPage.svelte), lines 64–71, provides those rows without a range-loading callback. The [planner route](../../../src/routes/org/[orgId]/calendar/assignments/+page.svelte) hydrates bootstrap only. [calendarWorkspaceBootstrap.ts](../../../src/features/calendar/server/calendarWorkspaceBootstrap.ts), lines 142–148, reads the anchor cookie and loads its month ±1 through [calendarRange.ts](../../../src/features/calendar/utils/calendarRange.ts). The [Calendar store](../../../src/features/calendar/stores/calendar.svelte.ts), line 13, starts at today's date. Same-organization merge hydration can conceal the failure during SPA navigation.

**Consequence:** an operator can unknowingly replace a saved assignment through individual selection or Quick Fill because it looks vacant. This is distinct from F02's atomic-replacement issue: an atomic write would still replace a misleadingly empty slot.

**Smallest complete repair:** load the planner's actual visible month on initial mount and every navigation, using the existing scoped range coordinator and cancellation/retry rules. Align initial date/bootstrap coverage and prevent unloaded slots from appearing as editable emptiness. Verify stale-anchor cold load, far-month person/group slots, reload, Quick Fill, Clear All and denied scopes. Resetting the cookie alone cannot repair reproduction B.

The relevant planner routes/components, bootstrap/range/store and main Calendar route are byte-identical at base/head. Quarter navigation handlers are also unchanged. This establishes preexisting source provenance; no separate baseline browser run is claimed.

### N3 — Search miss claims the populated roster has no personnel

Searching `NoSuchPerson` on the 48-person Calendar shows “No personnel added yet” and directs the user to add personnel. [Calendar.svelte](../../../src/features/calendar/components/Calendar.svelte), lines 155 and 239–247, uses the filtered population for the true empty-roster branch; filtered groups originate in `CalendarPageContext.svelte.ts:187` and are passed by `CalendarPageView.svelte:187`.

This is a lower-severity, preexisting recovery/copy defect. Distinguish an empty accessible roster from zero filter matches, and offer clear-filter recovery for the latter.

## Observed journeys and data checks

| Journey                               | Observed result                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner Dashboard and Calendar          | Dashboard initially reports 48 active personnel and 42 present/available; four groups; saved assignments visible; archived person omitted; no computed duty overlay or Workspace Setup checklist.                                                                                                                             |
| Filter/search and layout              | Primary Care filter and Quinn search work; clear restores rows; collapse/expand works. Role display preference survives reload. Month/quarter headers and status dialog fit the tested phone width. Pin persistence was not independently established. No-match copy fails as N3.                                             |
| Date navigation                       | Month picker, Today and December/January quarter rendering work within loaded data. Cross-view date ownership and planner range loading fail as N1/N2.                                                                                                                                                                        |
| Historical and group assignments      | September 22 Staff Duty Ortiz → Turner succeeds despite retained computed duty blocker/cooldown; native response has no Duty lineage. Clinic Coverage Primary Care → Readiness persists after full reload.                                                                                                                    |
| Planner Quick Fill / Clear All        | Empty Practice Coverage filled for exactly all 22 September weekdays, all Nelson; independent intermediate snapshot verifies dates. Confirmed Clear All removes these rows without changing other types/months. Far-month visibility fails as N2.                                                                             |
| Availability                          | Reversed dates show validation; Quinn September 30–October 2 saves, editing/cancel and saved-note reload work. Phone dialog removes that temporary entry after confirmation. Quinn's original September 20–25 leave remains unchanged.                                                                                        |
| Bulk status                           | Review lists exactly Nelson and Turner before applying September 22 Administrative Appointment. Removal review warns of full-entry deletion on partial overlap; Back preserves Quinn's original leave. Confirmed removal deletes only Nelson's temporary September 22 entry.                                                  |
| CSV paste                             | Ambiguous Adams name, unknown person and reversed dates rejected; rank disambiguates SPC Adams; unknown status requires mapping/skip. Choosing skip imports only Nelson Administrative Appointment and SPC Adams Leave on September 24. Preview makes no import writes.                                                       |
| Configuration                         | Temporary status create/rename/delete; temporary assignment type create, actual saved assignment, then warned dependent deletion; custom closure create/rename/delete. Original status/type/closure rows return exactly to baseline. Dependent status-type deletion and assignment-type rename were not separately exercised. |
| All five reports                      | Status days 66; personnel assignments 251, rounded mean 5.2, Reed 33; away days June 24–September 22 total 22; September 22 availability 41/48 and September 24 peak unavailable 8; Primary Care September 24 7/12. All match independently computed database expectations at that checkpoint. No export download.            |
| Scoped editor                         | Only Primary Care personnel; hidden Readiness Front Desk slot save returns 409 without exposing Scott. Allowed Practice Coverage Nelson September 23 saves/reloads; settings restricted; foreign organization URL returns 404.                                                                                                |
| Viewer                                | Verified normal login; only Primary Care's 12 people, no edit dialog, no Bulk/Planning navigation; direct planner/bulk/settings routes restrict access. Supplemental authenticated POST returns 403.                                                                                                                          |
| Organization operator / foreign owner | Operator sees all 48 and saves/reloads Brooks September 24. Foreign owner sees only Lakeside's one-person Dashboard and receives 404 for Northwind Calendar. Normal signout/login used between actors.                                                                                                                        |

Independent final comparison covers all 64 public tables: **60 unchanged**, including all 14 retired Duty tables, original configuration, personnel, training and sign-in data. Only intended assignment replacements/additions, three availability additions, one preferences row and audit additions remain. The original 317 other assignment rows, hidden Scott slot and all nine original availability rows remain identical. Replaced original slot IDs legitimately change through the existing UI clear/create operation; no blanket ID-preservation claim applies to those deliberate replacements. All foreign-organization public rows remain unchanged.

Report values above describe the saved report checkpoint before the later two role-test assignments and removal of Quinn's temporary three-day span. They are not incorrectly compared to the later final snapshot.

## Diagnostics, evidence and limits

One editor login after switching dev → production displayed a client 500 while the server Dashboard load succeeded. Requests referenced obsolete `/.svelte-kit/generated/client/nodes/*.js`; fresh production login serves hashed assets. Full-document production login then succeeded for viewer, operator, foreign owner and owner, and the editor Dashboard itself loaded normally. This is retained as a preview-transition diagnostic, not a reproduced application regression. An attempted viewer transition initially raced signout; provider evidence identified the actor as editor, so those observations were excluded from viewer acceptance and the viewer flow was repeated after confirmed login.

After the final data snapshot, repeated role-switch testing reached the existing logout rate limit: the last logout request added a `security.rate_limit_exceeded` audit row. The initial exact-live-freeze comparison failed on this additional audit only and is preserved; `pre-cleanup-final.json` includes it, and all 63 non-audit tables remained identical. This final logout is not counted as a successful signout. The owned preview was stopped afterward.

Local Vercel telemetry-script 404s and optional build advisories were observed. They do not establish a Calendar failure. Failed locator/native-select tool receipts are preserved and do not count as passing actions; persisted state and independent snapshots establish successful outcomes.

Raw evidence remains in `/tmp/t3-calendar-user-test-1322/`: `browser-evidence.json` contains 42 named snapshots/diagnostics with synthetic passwords redacted; `navigation-findings.md`, `before.json`, `planner-weekday-fill.json`, `user-test-checkpoint3-report-expectations.json`, `independent-secondary-report-expectations.json`, `final-browser-data.json`, `final-browser-data-diff.json` and `final-preservation-review.json` preserve counterexamples and independent calculations. Build/setup/migration and cleanup logs are in the same directory. Cleanup exits 0 and restores the exact prior Docker container/volume/network sets; no owned resources remain. Ports 19015/18015 are closed and the private Serve session is gone. Screenshot files are under `/home/waffleflops/.t3/userdata/browser-artifacts/`:

- N1: `browser-screenshot-omarchy-tail930090-ts-net-muctcko8-95044f20.png`.
- N2 cold load: `browser-screenshot-omarchy-tail930090-ts-net-muctcufl-37f341ef.png`; far month: `browser-screenshot-omarchy-tail930090-ts-net-muctgy69-9f23a23f.png`.
- CSV errors: `browser-screenshot-omarchy-tail930090-ts-net-muctjenb-e0aa49f2.png`.
- Viewer denial: `browser-screenshot-omarchy-tail930090-ts-net-muctvn7w-a141eedf.png`.
- Phone status dialog: `browser-screenshot-omarchy-tail930090-ts-net-muctznls-6510aa48.png`.

This run adds a successful production build and browser/data evidence to the previously verified full canonical checks (543 files / 4,864 tests). No runtime changed, so recording results requires documentation checks rather than another unchanged full test run. No comparative performance experiment, production capacity, Safari behavior, offline/reconnect or browser fault-injection acceptance is claimed. Exports remain explicitly excluded from this supplemental run; earlier export evidence is preserved.

## Next owner action

Keep #1317 open and PR #1322 unmerged. Request the bounded N1/N2 repair and N3 filtered-state correction against this work record; preserve the existing duty deletion and security/data contracts. After implementation, run meaningful loading/navigation regressions, required final checks and the exact browser counterexamples, then obtain independent review. No later child or phase may start through this blocked checkpoint.

Continuation: “Repair and re-review PR #1322 using `docs/stabilization/phase-05/d02-browser-acceptance.md`; preserve evidence and the D02 checkpoint, and do not merge.”
