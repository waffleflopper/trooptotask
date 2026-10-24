# Performance measurement on seeded workloads

A leader opens the Calendar, Personnel, the Organization Dashboard, a report or an export for a platoon-, company- or
battalion-sized unit, works in it, and waits for each step to be usable. This recipe measures those waits reproducibly:
three deterministic synthetic Organizations, an Organization-wide actor, a Group-scoped operator and a Group-scoped
editor, one journey registry, a fixed cold/warm protocol, and request, byte, main-thread, server-timing and query
evidence for every sample. It measures; it does not classify or fix.

Run this recipe only when Robert asks for a measurement. Ordinary verification, review, audit and release work does not
include it; changes are reviewed against the
[regression budgets](../../../../docs/architecture/DEFINITION_OF_DONE.md#regression-budgets) instead.

## Sub-features

- `workloads`: `seed workload small|typical|large` creates one synthetic Organization of 20, 100 or 400 active People
  from the declarative table in `helpers/perf-workloads.mjs`, journaled before any write. `clean-seeds` removes exactly
  those rows, plus the rows the app wrote while the workload was driven (audit rows survive Organization deletion, so
  they are journaled and removed by ID first), and reads every ID back.
- `load`: repeated page loads, each timed to three points. `firstUsefulRenderMs` is the journey's milestone.
  `settledIncludingReloadsMs` is the latest of that, the end of the last app document or data response, and the start of
  the first frame after the page's last DOM change, read once the app origin is idle. A re-render that an invalidated
  load's data drives therefore counts toward settled. `documentCompleteMs` is when the page's own document response
  ended (navigation `responseEnd`); a streamed document can end long after the render. Each sample records a Resource
  Timing manifest grouped document/JS/CSS/data/provider/other. The manifest counts resource entries, network requests
  (entries that transferred bytes) and cache hits separately, with transfer, encoded and decoded bytes, each entry's
  response status and `x-sveltekit-invalidated` bits. Failed requests come from the native network list. Each sample
  also records navigation, paint and LCP (loads only: an interaction sample omits them, because they describe the
  preparation page load), long tasks, the matching server timing lines per load and its own pg_stat_statements window.
- `journeys`: one declarative registry in `helpers/perf-journeys.mjs`. Each journey names its page, the actors it
  applies to (with the reason for any it does not), load or interaction, read or write, its untimed preparation steps,
  its one timed trigger and the milestones the observer waits for. A milestone can wait for texts, selectors, the text
  inside an element, an exact element count and a file download. The last milestone is the first useful render; earlier
  ones, such as the Dashboard's band skeletons or the Personnel detail header, are reported as their own points.
- `interaction`: an input-to-settled timer with the same two points. It opens the journey page, waits for its ready
  milestone and idle, runs the preparation steps, waits for idle again, then arms the observer and runs the trigger. The
  observer starts at the first trusted input event. A milestone's time is `performance.now()` read inside the first
  animation-frame callback that finds the milestone in the page, minus that event's `timeStamp`, on one timeline. A
  useful point is therefore when a frame that already holds the result begins its work, and that frame paints it next.
  The callback's own frame timestamp is not used: it is the frame's start, which can precede the input the frame handles
  and, when a long task holds the main thread, can be hundreds of milliseconds before the callback runs. A load reads
  the same clock, measured from navigation start. Every step is a native click, hover, fill, type, key press or file
  upload on a control named in the accessibility snapshot, never an app handler. The query window opens just before the
  trigger, after the page's document has ended. Its `documentCompleteMs` is that document's end, measured from its
  navigation, before the input.
- `trace`: one cold traced load to network idle, the raw `.json.gz`, the native insight text and a compact summary
  (first useful render, idle, failed requests, FCP, LCP, main-thread busy, scripting, style/layout/paint, long tasks and
  blocking time after first paint). Hydration is reported as not identifiable because the app emits no hydration mark.
  The trace is written straight to the run directory: the cold page's session is an httpOnly cookie set through
  DevTools, so no password or token reaches page script or the trace. A trace that fails after it started is stopped and
  its partial file removed.
- `statements`: reset or read the owned database's pg_stat_statements, top N by total time and by calls, plus a per-role
  total. Each role total also counts `plannableCalls` (every statement but `BEGIN`, `SET` and `COMMIT`) and `plans`.
  PostgREST plans its `set_config` preamble as `authenticator` and runs it as the request role, so those plans land on
  an `authenticator` row with no calls. Under the pinned regime the plans of the request roles plus `authenticator`
  equal their plannable calls; fewer plans there means some executions reused a generic plan.
- `prepare`: waits 11 s for the seed's row counts to reach the cumulative statistics, then runs `VACUUM (ANALYZE)` on
  exactly the 20 tables a workload seed writes (`PERF_PREPARED_TABLES` in `scripts/verification/environment.py`): the
  Auth users and identities, the Organization and the workload tables. It then pins the plan regime. It sets
  `plan_cache_mode = force_custom_plan` on the `authenticator` role that PostgREST logs in as and turns on
  `pg_stat_statements.track_planning`. It restarts the owned PostgREST container, so every pooled connection logs in
  after the setting, and waits for its schema cache. `seed workload` runs it after its inserts, reports its time as
  `timingsMs.prepare` and returns the readback as `planCache`. `perf tables` reads those tables' live and dead rows,
  visible pages and vacuum/analyze counters, plus the plan regime. The regime readback takes three facts from the
  database: the role setting, a fresh login as `authenticator` switched to `authenticated` as PostgREST switches it, and
  how many PostgREST connections (`pg_stat_activity`, application `PostgREST 14.10`) opened before the pin. It is
  `pinned` only when the setting and the login read `force_custom_plan` and no connection predates the pin. Every run
  records both reads before its warm-up and after its last sample. It lists in `tables.maintenance` each table a vacuum
  or analyze touched in between, and in `tables.planCache` both regime readbacks. A run does not start on an unpinned
  regime.
- `explain`: `EXPLAIN (ANALYZE, BUFFERS)` for one named statement from the fixed registry in
  `scripts/verification/environment.py`, run as the workload actor with RLS applied, in a transaction that is rolled
  back. There is no arbitrary SQL. The registry binds literal values, so PostgreSQL plans each explain for those values,
  the same plan the pinned regime gives a parameterized request. `assignment-replace-check` and `assignment-replace`
  explain the `assignment-save` journey's write of its slot to the seeded holder: the authorization check alone, then
  the whole RPC. The rollback leaves the workload as seeded.
- `summarize`: one Markdown and JSON table over every run file in a run directory, plus a table of statements per
  request-path category (Auth, PostgREST setup, session RPC, suspension RPC, `organizations` identity and admission
  reads, memberships, the page's own reads).

## How to get to it (user POV)

A member signs in, chooses the Organization and lands on its Dashboard, or opens Calendar or Personnel from the sidebar.
The Organization owner sees every Group; the scoped member sees only the first Group. The interactions are the ones a
leader repeats: changing the Calendar range, searching, saving an assignment, opening and editing a Person, importing a
roster, switching Organization and exporting.

## Helper controls

Performance measurement uses the [performance recipe](performance.md) and runs only when Robert asks for it
([Definition of Done](../../../../docs/architecture/DEFINITION_OF_DONE.md#reproducible-performance-evidence)); no other
verification includes it. `seed workload small|typical|large` journals one deterministic synthetic Organization;
`actor perfWide|perfScoped DESTINATION WORKLOAD` signs in its Organization-wide or Group-scoped actor; `perf --help`
lists the load, interaction, trace, statements, explain and summarize controls. Statements and explain run only on the
owned database and accept only named, bounded inputs. `clean-seeds` removes each workload and reads back its absence.

## Driving it with verify:app

Launch and drive under Node 24 (`mise exec node@24 --`); the adapter refuses newer Node. Set
`V="mise exec node@24 -- node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"` and
`RUN=.verification/evidence/verify-trooptotask/<run>`. `$V perf --help` prints every command.

1. Seed: `$V seed workload small`, then `typical`, then `large`. Record the returned counts and `timingsMs`; they are
   the seed timings, and `prepare` is the vacuum and analyze that ends each seed. The workloads share tables, so the
   last seed's preparation covers every workload. The returned `actors`, `sentinels` and `searchTerms` are what the
   observer waits for.
2. Sign in once per actor: `$V actor perfWide personnel large`, `$V actor perfScoped personnel large`,
   `$V actor perfScopedLeader personnel large` and, for `admin-users`, `$V actor platformReviewer admin/users`. Each
   perf actor is a member of every seeded workload, so the same page drives all three. Keep the returned page IDs. The
   control records which actor each page was signed in as; a warm `perf load` or a `perf interaction` rejects a page
   whose actor differs from the ACTOR argument, so a scoped label cannot record a wide page. Cold samples create their
   own page for the named actor.
3. Load: `$V perf load PAGE WORKLOAD JOURNEY ACTOR --mode cold|warm --out $RUN`. `--out` is checked before any sample
   and `--reps` must be at least 1. Warm defaults are one warm-up and five repetitions, unthrottled; cold defaults are
   no warm-up and three repetitions, for any load journey. Run warm before cold so the server is warm. Add
   `--profile slow-cpu` for a 4x CPU slowdown.
4. Interaction: `$V perf interaction PAGE WORKLOAD JOURNEY ACTOR --out $RUN`. `organization-switch` needs a second
   seeded workload to switch from.
5. Trace: `$V perf trace PAGE WORKLOAD JOURNEY ACTOR --out $RUN`.
6. Queries: every measured sample of `perf load` and `perf interaction` resets pg_stat_statements and reads it back. A
   load resets after its setup (a cold sample's new signed-in context) and immediately before navigation. An interaction
   resets after the page is ready, idle and its document has ended, immediately before input. Each read happens at
   network idle and after the sample's document has ended, so a streamed document's server work lands in its own window.
   The run keeps each sample's per-role totals and the top 15 statements summed over the measured windows, with calls
   per window. Warm-ups open no window. `$V perf statements reset|read --top N --out FILE` does the same by hand.
   `$V perf explain NAME WORKLOAD wide|scoped --out FILE` explains one registry statement as that actor.
7. `$V perf summarize $RUN` writes `summary.md` and `summary.json`. It reads every run file below `$RUN` except
   `superseded/` and its own `summary.json`; the superseded runs it finds are listed apart as diagnostics, never in the
   run tables. Redirect its console output outside `$RUN`; an empty output file inside it fails the parse.
8. Close out in this order. Run `$V clean-seeds` and save its readback, which must show 0 remaining rows and accounts
   for every workload. Save a final `npm run verify:app -- doctor`. Run owned cleanup with
   `npm run verify:app -- cleanup` and confirm the run directory survived. Report the summary's numbers in the PR body.

### Workload shape

| Workload | Groups x People | Archived | Window | Status / duty (Calendar lanes) / Training types | Critical Tasks | Onboarding active / done | Extra members admin / member |
| -------- | --------------- | -------- | ------ | ----------------------------------------------- | -------------- | ------------------------ | ---------------------------- |
| small    | 2 x 10          | 10%      | ±90 d  | 4 / 2 (2) / 8                                   | 10             | 2 / 2                    | 1 / 2                        |
| typical  | 5 x 20          | 10%      | ±90 d  | 6 / 4 (3) / 15                                  | 25             | 5 / 10                   | 2 / 8                        |
| large    | 16 x 25         | 10%      | ±90 d  | 8 / 6 (4) / 25                                  | 40             | 20 / 40                  | 4 / 30                       |

Every workload has about one availability entry per Soldier per 30 days, one daily assignment per duty type per day, 85%
Training completion, and 60% Critical Task completion with 25% older history. Groups are platoons or sections, so no
workload puts one giant Group in front of the roster. The roster carries about a tenth archived history. Members are the
unit's leaders and admin staff, not every Soldier. The anchor is the fixture's operational day, so dates move with the
run while IDs, names and proportions stay identical.

The Calendar reads a few more rows per Organization. Every status type carries the short label the Calendar shows. The
first duty types are Calendar lanes, the duties a unit watches on the month (Staff Duty and CQ, then Runner, then Detail
Group), and the others stay planner-only. Every workload has the same 105 special days, because a unit's holidays do not
scale with its size: the 11 federal holidays of each year from the anchor year minus 1 to plus 2 (the years the Calendar
reads), a training holiday on the Friday beside each Monday or Thursday holiday, and ten weekdays of holiday block leave
from 22 December. About 17 of them fall inside the ±90-day window.

### Journeys

| Journey                       | Page                          | Kind, effect       | Actors           | Timed step and useful render                                                              |
| ----------------------------- | ----------------------------- | ------------------ | ---------------- | ----------------------------------------------------------------------------------------- |
| `calendar-initial`            | Calendar                      | load, read         | both             | Month label, date cells, no loading text or skeleton                                      |
| `calendar-range`              | Calendar in 3-Month           | interaction, read  | both             | `Next 3 months` to the next quarter's label with Person rows                              |
| `calendar-search`             | Calendar in 3-Month           | interaction, read  | both             | Search fill to exactly one Person row                                                     |
| `calendar-month-next`         | Calendar in Month             | interaction, read  | both             | `Next month` to the next month's label and date cells, nothing loading                    |
| `calendar-month-previous`     | Calendar in Month             | interaction, read  | both             | `Previous month` to the previous month's label and date cells, nothing loading            |
| `calendar-month-search`       | Calendar in Month             | interaction, read  | both             | Search fill to exactly one Person row                                                     |
| `calendar-month-group-filter` | Calendar in Month             | interaction, read  | perfWide         | Enter on `Bravo` in the group filter to Bravo's band as the only group band               |
| `calendar-group-filter`       | Calendar in 3-Month           | interaction, read  | perfWide         | Enter on `Bravo` in the group filter to Bravo's band as the first row                     |
| `assignment-save`             | Duty planner                  | interaction, write | both             | Enter on the picked assignee to the slot showing that Person and the picker closed        |
| `personnel-list`              | Personnel                     | load, read         | both             | Sentinel row or paused-roster notice, no skeleton                                         |
| `personnel-search`            | Personnel                     | interaction, read  | both             | Search fill to the term's row with the sentinel gone                                      |
| `personnel-filter`            | Personnel                     | interaction, read  | both             | Search fill `68W` to exactly the matching row count                                       |
| `personnel-large-table`       | Personnel A-Z                 | interaction, read  | both             | `Sort by Name` to the descending table                                                    |
| `personnel-detail`            | Personnel to detail           | interaction, read  | wide, leader     | `Details` to the record tabs (`header`), then `Needs attention` with nothing loading      |
| `personnel-detail-direct`     | Personnel detail URL          | load, read         | wide, leader     | The record tabs (`header`), then `Needs attention` with nothing loading                   |
| `personnel-detail-tab`        | Personnel detail tabs         | interaction, read  | wide, leader     | The `Log` tab, unhovered, to that tab current with nothing loading                        |
| `personnel-detail-tab-hover`  | Personnel detail tabs         | interaction, read  | wide, leader     | The same click after a hover has preloaded the tab                                        |
| `personnel-edit`              | Personnel roster dialog       | interaction, write | both             | `Save Changes` to the row showing the new MOS                                             |
| `personnel-detail-edit`       | Personnel detail              | interaction, write | wide, leader     | `Save changes` to the Data sheet tab with the refreshed header MOS badge                  |
| `personnel-import`            | Personnel import              | interaction, write | both             | `Import N changes` to `N changes saved.` with every row added                             |
| `dashboard`                   | Dashboard                     | load, read         | both             | Band skeletons below a header (`pending`), then settled bands and panels with no skeleton |
| `training-report`             | Training Reports              | load, read         | both             | Briefing not busy with the actor's soldier count                                          |
| `critical-tasks-report`       | Critical Tasks Reports        | load, read         | both             | Metrics with the actor's population, nothing busy                                         |
| `members-list`                | Settings Members              | load, read         | perfWide         | Member count shown                                                                        |
| `admin-users`                 | Platform Users                | load, read         | platformReviewer | Directory size and first page of users                                                    |
| `workbook-export`             | Training Reports              | interaction, read  | both             | `Export Excel` to the workbook download                                                   |
| `organization-export`         | Settings Exports              | interaction, write | perfWide         | `Export JSON` to the download and its success text                                        |
| `sidebar-navigation`          | Calendar to Personnel         | interaction, read  | both             | Sidebar `Personnel` link to the roster                                                    |
| `dashboard-navigation`        | Dashboard to Personnel        | interaction, read  | both             | Sidebar `Personnel` link to the roster under the `Personnel` breadcrumb                   |
| `organization-switch`         | Personnel of another workload | interaction, read  | both             | Switcher item to the destination roster and breadcrumb                                    |
| `briefing-detail`             | Training Reports              | interaction, read  | both             | `Total, Workload Training 01` cell to the affected-soldiers table, not busy               |
| `briefing-detail-page`        | Training Reports detail       | interaction, read  | perfWide         | Pager `Next` to `Page 2 of` and `Rows 26–50 of`                                           |
| `calendar-report`             | Calendar Reports              | interaction, read  | both             | `Run status-day report` (current year) to the table with the actor's personnel count      |
| `calendar-report-export`      | Calendar Reports              | interaction, read  | both             | `Export status days` to the workbook download                                             |

`dashboard-navigation` is the Dashboard's measured input: the Dashboard's own Needs you links and `+N more` toggles
depend on each workload's data, so the sidebar link is the one control present in every cell. The Dashboard's lists
already name roster People, so the roster text alone is met before the route changes; the breadcrumb is what only the
Personnel page shows. Its load-to-usable total is the `dashboard` load's `useful` plus this interaction, which starts
only after the Dashboard is useful and idle.

The Month journeys open on the anchor month. The bootstrap holds the month after it, so `calendar-month-next` renders
without a read, and `calendar-month-previous` reads the missing collections of the month before. Both move the anchor
cookie, so each sample ends with `Today`, as `calendar-range` does. The group filter's options are not in the
accessibility snapshot, so its preparation opens `Calendar group filter` and presses ArrowDown twice from `Group: All`
to `Bravo`, and the timed step is Enter. Bravo is every workload's second Group, so the first band is Alpha's until the
filter lands. `perfScoped` sees one Group, so the group filter has nothing to narrow for it. The listbox leaves the page
about 110 ms after Enter and the page's scroll lock is released about 20 ms later, so the filter's settled time includes
that exit while its useful time is the filtered grid.

`perf --help` lists the registry with each journey's kind, effect and actors. The ordinary page GET of the request path
is the `personnel-list` warm load; `sidebar-navigation` is its client navigation.

Writes leave the workload as seeded. `assignment-save`, `personnel-edit` and `personnel-detail-edit` alternate between
the seeded value and one alternate on each sample, so the default six samples end where they started. `personnel-import`
uploads a fixed CSV of a quarter of the active roster (5, 25 or 100 rows, the size of a reflag or an incoming company),
all into the scoped Group so both actors import the same file. After every import sample the control journals the added
People, deletes them and reads back their absence. The file is written under the run's `inputs/` directory. Every export
writes a `data_exports` history row, and the workload journals it for `clean-seeds`.

`perfScopedLeader` is an Editor scoped to the same Group as `perfScoped`, a role Settings Members can assign. It holds
personnel configure, so it opens a Person's detail in its Group, and it measures only the two detail journeys. It adds
one membership to each workload (6, 13 and 37).

The Training briefing detail is the affected-soldiers section below the report. Each open and each page is one
`/api/training-reports/detail` request. A scoped Group holds at most 25 soldiers, so its widest cell has one page; the
page change is measured for the wide actor on typical and large. The Calendar report UI caps no range: its date pickers
accept any span. The longest preset that holds workload data is the current calendar year, the Status days default, so
`calendar-report` measures that. Rows outside the ±90-day workload window are empty, so a longer custom range adds no
server rows; only the two by-day modes expand per day in the browser.

`members-list` and `organization-export` need Organization settings, which the Group-scoped operator cannot open (403).
`admin-users` is the platform user directory, the largest list the product shows: it spans every Organization, so its
size is the whole owned Auth directory at the time of the sample. Seed the workloads one at a time and measure it after
each seed to see it grow.

### Protocol

- `cold`: each sample opens a new isolated browser context on a static image, which runs no app code, and stores the
  actor's provider session there as the app's auth cookie, as `actor` does. It then navigates to the journey and closes
  the context once the sample is read. Route chunks, page data and the document are uncached. The shared entry CSS and
  JS are cached, as for any visitor who arrives through sign-in; the manifest counts them as cache hits. Defaults: no
  warm-up, three repetitions.
- `warm`: each sample navigates the signed-in actor page to the journey URL after the warm-up. It is a new document with
  the HTTP cache kept.
- Each journey's milestones are in the table above and in the registry. The Dashboard renders its header at once, so
  `pending` is when the band skeletons appear and `useful` is when the bands and panels have settled with no skeleton
  left.
- Every sample then waits for app-origin network idle: no request pending in the native network list, no answered fetch
  still streaming its body, and no new request or Resource Timing entry for 500 ms. The manifest and settled time are
  read there. The sample then waits for its document to end, and only then are server lines and statements read and a
  cold context closed. One cap of 120 s bounds each wait: the useful render, idle, the document's end and each
  preparation `wait`. A sample that never idles reports `networkIdle: false` with the paths still running, and no
  settled time. A document still open at the cap is reported as `documentOpen: true` with `documentOpenMs`, and the next
  sample starts only after it ends (or the run stops after a second cap).
- Order: seed every workload the run measures, each seed ending with its preparation, before the first sample. Then run
  each journey as one warm-up and its samples. Run read journeys before write journeys, and `personnel-import` last,
  because writes leave dead rows and modified-row counts that can start autovacuum or autoanalyze. `organization-export`
  may run among the reads: it writes only export history and audit rows, which no other journey reads. After
  `clean-seeds`, reseed in the same order. A read journey whose run lists `tables.maintenance` is rerun after
  `perf prepare`.
- Plan regime: every comparison run uses custom plans (`perf prepare` pins them). PostgREST sends each read as a
  parameterized prepared statement on a pooled connection. In PostgreSQL's default `auto` mode the first five executions
  on a connection use custom plans; then PostgreSQL may switch the statement to a generic plan when that plan's
  estimated cost is not much higher than the average custom-plan cost (PostgreSQL 17 `PREPARE`). Which plan a sample got
  would then depend on the history of the connection it landed on. Custom is deterministic, and it is what every
  production connection uses for a statement's first five executions. A long-lived production connection may move a
  statement to a generic plan, which this protocol does not measure.
- Host gate: each measured sample starts only on a clear host and is watched while it runs (`helpers/perf-host.mjs`). It
  reads the 1-minute load every 2 s, and the CPU time of every build, test or verification process (Vite, Vitest,
  `node --test`, `python3 -m unittest`, svelte-check, Playwright, ESLint, Prettier, tsc, another verification daemon or
  browser) whose command line and working directory lie outside this checkout and its verification state. A sample is
  contaminated if the load exceeds 4 at any reading, or those processes use 25% of one core in any tick. A contaminated
  sample is kept out of the distribution, recorded in the run's `rejected` list with its verdict and measured again.
  More than five stop the run, and the error names every rejected attempt with its reasons. Another checkout running its
  full check and verify app stops a run this way; measure again once the host has stayed clean for 10 minutes. Each kept
  sample records its `host` verdict with its wall-clock span. A write journey that alternates on the sample index
  (`toggles`) runs one more unmeasured sample when rejections leave an odd count, so it still ends as seeded, also when
  the run stops.
- Host build: each run file and trace summary records `host` with the running browser's build and DevTools protocol,
  read from the owned browser's `/json/version` (the HTTP form of `Browser.getVersion`), and the kernel release.
  `perf summarize` repeats it on every row. The doctor's `browser.version` is the binary's version at launch, so it
  misses a package upgrade under a live browser.
- Comparison rule: a baseline cell is dated classification evidence for the browser build and kernel it ran on. A repair
  compares a before and an after measured on one recorded environment: the same browser build and kernel, on the repair
  branch's merge base, prepared and pinned the same way. A baseline cell serves as the before value only when it ran on
  that same build and kernel and the merge base leaves its journey's code paths unchanged; otherwise the repair measures
  its before first. A bridge, a few cells remeasured on a new build, does not make two environments equivalent: a page
  can hold steady while single SQL paths move. Bridged cells classify; they are not before values on the new build.
- Report min, median, max and every sample. With five samples, a p95 would be a guess; do not report one.

## Gotchas

- Settled counts the first frame after the last DOM change seen before the read at idle, so a page that changes the DOM
  on a timer would carry that change into settled when it lands before the read. The Calendar journeys have none; a
  toast that dismisses itself does, and its dismissal usually lands after the read.

- A reload never gives a cold load. Chrome serves the content-hashed `/_app/immutable` assets from cache on every
  reload, including `navigate_page` with `ignoreCache`, and the native tools have no cache-disable control. That is why
  `cold` uses a fresh context. The fresh context cannot start with an empty cache either: the image page requests
  `/favicon.ico`, the app redirects it to `/auth/login`, and Chrome follows that page's `Link` preload headers for the
  shared entry assets.
- The app rate-limits by IP (`src/lib/access/rateLimit.server.ts`): 10 `/auth/` POSTs per 15 minutes, 10 Organization
  exports per hour, 30 Organization API writes per minute and 60 other requests per minute. Cold and `actor` sign-ins
  send no `/auth/` request, so they never wait. Every sample comes from loopback, so samples start at least 6 seconds
  apart per worker to stay under the 60 per minute, and an export sample waits for one of 10 slots in any hour. Six
  export samples per workload therefore span about two hours over three workloads; run other journeys meanwhile on
  another page. When the 60 per minute runs out anyway, doctor reports `APP_ENDPOINT_UNAVAILABLE`, because its
  `/auth/login` probe gets a 429. Sending a captured session as a request header does not work: the first post-hydration
  invalidation is answered signed-out. A session cookie stays signed in through hydration, client navigation,
  invalidation and reload.
- Above 250 People the By Group roster shows `Grouped roster paused` instead of rows. A large wide `personnel-list`
  sample therefore settles on that notice and renders no Person rows; compare it with large scoped and typical wide, not
  as a like-for-like row count.
- `$V server-source arm TABLE hold` matches only a GET to `/rest/v1/TABLE` whose query carries exactly one
  `organization_id=eq.<Organization>` filter; other parameters are allowed. A read without that one filter is not held
  and reports `matches: 0`, so the lane resolves unheld. Read `matches` in `server-source state` before counting a hold
  as a delay. The deadline runs from the arm, so a lane resolves earlier than `HOLD_MS` after the click by the seconds
  between arm and click (5.0 s after the click for an 8 s hold clicked about 3 s after arming); `server-source release`
  resolves it on demand.
- Only Calendar, Dashboard and Training emit `[*-load]` server timing lines. A Personnel sample has none; use its
  statements and `responseStartMs` for the server side.
- pg_stat_statements covers the whole owned database for the window, including auth and PostgREST setup statements. Read
  `byRole` before attributing time to the app.
- The explain registry is shaped like the app's reads, not copied from them. Use pg_stat_statements for what the app
  actually ran and explain for why one statement costs what it does.
- The two Critical Tasks read-model statements (`critical-task-latest-completions`, `critical-task-completion-trend`)
  call SECURITY DEFINER functions, which PostgreSQL does not inline. Their plan is one Function Scan, so explain gives
  the function's whole execution time and rows, not its inner plan. One call returns every row; the app pages the
  latest-completions function 1000 rows at a time and re-runs it per page. The two assignment-save statements are the
  same: the check is one Result and the RPC one Function Scan, so explain gives each one's total time, and the RPC's
  time less the check's is the rest of the save.
- Restart recreates fixtures and loses workloads. Reseed and sign in again after every helper edit, because doctor
  reports `STALE_CANDIDATE` until restart.
- Local unthrottled numbers show relative cost and request shape, not field latency. Record the host's CPU and load
  alongside them.
- There is no network emulation. Chrome refuses network throttling while the daemon's owned-origin URL allowlist is set,
  and that allowlist stays. Field network latency is not measured here.
- A first visit has no viewer time zone cookie, so the root layout sets it on mount and reruns only the loads that
  declare `app:viewer-day`: the Dashboard, onboarding, Personnel detail and the Training and Critical Tasks reports,
  which read the viewer's day. A cold Dashboard sample therefore reruns its summary load right after the first render,
  at the same time as the document's, and a cold Calendar sample loads its workspace once. Server timing reports each
  load and the loads per sample; never add them up as one wait. `settledIncludingReloadsMs` is where that reload and the
  render it drives end.
- The native network list shows a status as soon as response headers arrive, and a streamed `__data.json` keeps its body
  open after that. Idle therefore also compares answered fetches with finished Resource Timing entries.
- Idle does not see a document that is still streaming, because an open document adds no Resource Timing entry; its
  navigation `responseEnd` stays 0 until it ends. The server keeps running a stream after the browser navigates away, so
  each sample waits for `documentCompleteMs` before its window closes and before the next one opens. A perf navigation
  returns at the page's load event within the cap, so a load sample is read after its document ends: the manifest holds
  the whole document, and `settledIncludingReloadsMs` includes its end.
- `vite preview` compresses every response with `@polka/compression` (`node_modules/vite/dist/node/chunks/node.js`, Vite
  8.0.16), and it never flushes a streamed write, so a streamed document or `__data.json` would reach the browser only
  once about 16 KB of compressed output existed or the stream ended. The owned preview loads
  `scripts/verification/preview-streaming.mjs`, which asks app responses for identity encoding, so they stream as
  production does; `/_app/immutable/` assets stay compressed. Document and data transfer bytes are therefore
  uncompressed sizes. Production delivery is not measured here.
- A page document's Resource Timing `transferSize` is usually 300 B, its headers, as for the Training and Critical Tasks
  reports. A document whose layout streams counts its body plus 300 B; why is not traced. `Transfer bytes` and
  `Document bytes` in `perf summarize` therefore omit most document bodies. Compare document size by
  `summary.groups.document.decodedBytes` in the run file.
- `navigate_page` keeps its `initScript` only until the call returns, and its default navigation timeout is 10 s. A
  document that commits later would load without the observer and report nothing useful. Perf navigations and
  preparation `wait_for` calls therefore pass the 120 s cap as their own `timeout`; the daemon gives a call that names a
  timeout 5 s more than it, and 45 s otherwise. A timed-out `wait_for` reaches the control as an error, not as text.
  Page evaluations cannot name a timeout, so the settled reads poll in 20 s calls.
- Fresh rows have no planner statistics and no visibility-map bits until autovacuum reaches them, at a time no run
  controls. A backend reports its insert counts up to 10 s after it goes idle, so an analyze that runs at once still
  leaves an autoanalyze about 40 s later; `prepare` waits for those counts first. Compare before and after runs only
  when both were prepared and neither run lists `tables.maintenance`. Write journeys start autoanalyze on the tables
  they write (import on `personnel`), so they run after the reads.
- `perf explain` sets `request.jwt.claim.sub`, so its per-row RLS cost is about 11% below what a PostgREST request pays.
- Every page requests the Vercel analytics scripts after idle, and the owned origin answers 404 or a redirect. They show
  up as failed requests in every sample; they are not app failures.
- Some labels are styled upper case. The accessibility snapshot shows `READY TODAY` while the document text is
  `Ready today`; milestones match document text.
- Native `wait_for` matches one accessibility text node. The import's commit bar reads `N changes ready` as one node, so
  preparation waits on it before the trigger.
- Document text keeps markup indentation, so the members count reads `5`, a newline, tabs and `members`. Milestones
  collapse whitespace runs to one space before matching.
- The 3-Month view renders its own virtual rows, not the month grid's. A Person row is the `[data-person-id]` element
  inside `.roster-rows`; Group bands have none.
- The Calendar writes the month it shows to the `ttt-calendar-anchor-date` cookie, the server reads its first window
  around that anchor, and the page opens on that month. A `calendar-range` sample would leave the next visit a later
  anchor, so its `calendar-today` reset clicks `Today` and records the cookie it leaves.
- The Duty planner's slot shows the picked Person before the write returns, and its picker closes only after it does.
  `assignment-save` waits for both, so its useful render is the confirmed save.
- The roster dialog's save updates the open roster in place with only `PUT /api/personnel`, and the detail page's Data
  sheet save patches the roster store from the response and reruns only the header and Data sheet loads:
  `<slug>/data-sheet/__data.json` with `x-sveltekit-invalidated=00011` and no `/api/app-shell-chrome` request. Roster
  and bulk archive rerun only the Personnel layout (`0010`), and an import commit reruns it under the import page.
  Measure each; they are different costs. The
  [Personnel recipe](personnel-records-lifecycle.md#detail-data-sheet-and-loss-baseline) maps every mutation's bits.
- A Group-scoped actor must give every new Person a permitted Group, so the import file only names the scoped Group.
- The roster shows `Details` only to an actor who may read sensitive Personnel records unscoped, so the scoped operator
  `perfScoped` sees `Edit` and no `Details` (its direct detail URL is the 403 page); `perfScopedLeader` measures the
  Group-scoped detail.
- A summary written before `perf summarize` excluded `superseded/` lists superseded runs as current. Regenerate an older
  archive's summaries before citing them.
- The owned supervisor and its browser can die between two samples while the app and provider keep running. Start
  `verify:app launch` in its own user scope
  (`systemd-run --user --scope mise exec node@24 -- npm run -s verify:app -- launch`) and long drivers and samplers as
  user services, then run owned `cleanup` and launch again if control calls answer
  `Owned supervisor is unavailable or replaced`.
