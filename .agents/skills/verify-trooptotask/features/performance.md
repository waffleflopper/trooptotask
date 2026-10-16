# Performance measurement on seeded workloads

A leader opens the Personnel list or the Organization Dashboard for a platoon-, company- or battalion-sized unit and waits for the page to be usable. This recipe measures that wait reproducibly: three deterministic synthetic Organizations, an Organization-wide and a Group-scoped actor, a fixed cold/warm protocol, and request, byte, main-thread, server-timing and query evidence for every sample. It measures; it does not classify or fix.

## Sub-features

- `workloads`: `seed workload small|typical|large` creates one synthetic Organization of 20, 100 or 400 active People from the declarative table in `helpers/perf-workloads.mjs`, journaled before any write. `clean-seeds` removes exactly those rows, plus the rows the app wrote while the workload was driven (audit rows survive Organization deletion, so they are journaled and removed by ID first), and reads every ID back.
- `load`: repeated page loads, each timed to two points. `firstUsefulRenderMs` is the journey's milestone. `settledIncludingReloadsMs` is the later of that and the end of the last app document or data response, read once the app origin is idle. Each sample records a Resource Timing manifest grouped document/JS/CSS/data/provider/other. The manifest counts resource entries, network requests (entries that transferred bytes) and cache hits separately, with transfer, encoded and decoded bytes, each entry's response status and `x-sveltekit-invalidated` bits. Failed requests come from the native network list. Each sample also records navigation, paint and LCP (loads only: an interaction sample omits them, because they describe the preparation page load), long tasks, the matching server timing lines per load and its own pg_stat_statements window.
- `interaction`: a read-only input-to-settled timer with the same two points. The observer starts at the first trusted input event; the input is native `fill`, never an app handler. The query window opens after the page is ready and idle, just before the input.
- `trace`: one cold traced load to network idle, the raw `.json.gz`, the native insight text and a compact summary (first useful render, idle, failed requests, FCP, LCP, main-thread busy, scripting, style/layout/paint, long tasks and blocking time after first paint). Hydration is reported as not identifiable because the app emits no hydration mark. V8 keeps the cold sign-in script's source, so the raw trace is written to the worker's private session directory, the actor's password is replaced with `<redacted>` in the copy saved under the evidence root, and the raw file is deleted even when the trace fails. A trace that fails after it started is stopped.
- `statements`: reset or read the owned database's pg_stat_statements, top N by total time and by calls, plus a per-role total.
- `explain`: `EXPLAIN (ANALYZE, BUFFERS)` for one named statement from the fixed registry in `scripts/verification/environment.py`, run as the workload actor with RLS applied. There is no arbitrary SQL.
- `summarize`: one Markdown and JSON table over every run file in a run directory.

## How to get to it (user POV)

A member signs in, chooses the Organization and lands on its Dashboard, or opens Personnel from the sidebar. The Organization owner sees every Group; the scoped member sees only the first Group. Searching the roster by last name is the measured interaction.

## Driving it with verify:app

Launch and drive under Node 24 (`mise exec node@24 --`); the adapter refuses newer Node. Set `V="mise exec node@24 -- node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"` and `RUN=.verification/evidence/verify-trooptotask/<run>`. `$V perf --help` prints every command.

1. Seed: `$V seed workload small`, then `typical`, then `large`. Record the returned counts and `timingsMs`; they are the seed timings. The returned `actors`, `sentinels` and `searchTerms` are what the observer waits for.
2. Sign in once per actor: `$V actor perfWide personnel large` and `$V actor perfScoped personnel large`. Each actor is a member of every seeded workload, so the same page drives all three. Keep the returned page IDs. The control records which actor each page was signed in as; a warm `perf load` or a `perf interaction` rejects a page whose actor differs from the ACTOR argument, so a scoped label cannot record a wide page. Cold samples create their own page for the named actor.
3. Load: `$V perf load PAGE WORKLOAD personnel-list|dashboard perfWide|perfScoped --mode cold|warm --out $RUN`. `--out` is checked before any sample and `--reps` must be at least 1. Warm defaults are one warm-up and five repetitions, unthrottled; cold defaults are three repetitions. Run warm before cold so the server is warm. Add `--profile slow-cpu` for a 4x CPU slowdown.
4. Interaction: `$V perf interaction PAGE WORKLOAD personnel-search ACTOR --out $RUN`.
5. Trace: `$V perf trace PAGE WORKLOAD JOURNEY ACTOR --out $RUN`.
6. Queries: every measured sample of `perf load` and `perf interaction` resets pg_stat_statements and reads it back. A load resets after its setup (a cold sample's sign-in) and immediately before navigation. An interaction resets after the page is ready and idle, immediately before input. Each read happens at network idle. The run keeps each sample's per-role totals and the top 15 statements summed over the measured windows, with calls per window. Warm-ups open no window. `$V perf statements reset|read --top N --out FILE` does the same by hand. `$V perf explain NAME WORKLOAD wide|scoped --out FILE` explains one registry statement as that actor.
7. `$V perf summarize $RUN` writes `summary.md` and `summary.json`.
8. Close out in this order. Run `$V clean-seeds` and save its readback, which must show 0 remaining rows and accounts for every workload. Save a final `npm run verify:app -- doctor`. Run owned cleanup with `npm run verify:app -- cleanup` and confirm the run directory survived. Then package the run as one archive by the [artifact packaging](../../../../docs/architecture/DEFINITION_OF_DONE.md#packaging-durable-artifacts) rule, re-extract it into empty scratch space and verify the inventory. The coordinator uploads it.

### Workload shape

| Workload | Groups x People | Archived | Window | Status / duty / Training types | Critical Tasks | Onboarding active / done | Extra members admin / member |
| -------- | --------------- | -------- | ------ | ------------------------------ | -------------- | ------------------------ | ---------------------------- |
| small    | 2 x 10          | 10%      | ±90 d  | 4 / 2 / 8                      | 10             | 2 / 2                    | 1 / 2                        |
| typical  | 5 x 20          | 10%      | ±90 d  | 6 / 4 / 15                     | 25             | 5 / 10                   | 2 / 8                        |
| large    | 16 x 25         | 10%      | ±90 d  | 8 / 6 / 25                     | 40             | 20 / 40                  | 4 / 30                       |

Every workload has about one availability entry per Soldier per 30 days, one daily assignment per duty type per day, 85% Training completion, and 60% Critical Task completion with 25% older history. The sizes come from Robert's 20/100/400 Personnel decision. Groups are platoons or sections, so no workload puts one giant Group in front of the roster. The roster carries about a tenth archived history. Members are the unit's leaders and admin staff, not every Soldier. The anchor is the fixture's operational day, so dates move with the run while IDs, names and proportions stay identical.

### Protocol

- `cold`: each sample opens a new isolated browser context on a static image and signs in by posting the real login form action, which runs no app code. It then navigates to the journey and closes the context once the sample is read. Route chunks, page data and the document are uncached. The shared entry CSS and JS are cached, as for any visitor who arrives through sign-in; the manifest counts them as cache hits. Defaults: no warm-up, three repetitions.
- `warm`: each sample navigates the signed-in actor page to the journey URL after the warm-up. It is a new document with the HTTP cache kept.
- The first useful render for Personnel is the actor's sentinel row, or the paused-roster notice for a large wide roster, with no skeleton. For the Dashboard it is the `Upcoming Changes` and `Requires Attention` panels with no skeleton. For search it is the search term's row with the sentinel gone.
- Every sample then waits for app-origin network idle: no request pending in the native network list, no answered fetch still streaming its body, and no new request or Resource Timing entry for 500 ms, within 120 s. Only then are the manifest, timings, server lines and statements read and a cold context closed. A sample that never idles reports `networkIdle: false` with the paths still running, and no settled time.
- Report min, median, max and every sample. With five samples, a p95 would be a guess; do not report one.

## Gotchas

- A reload never gives a cold load. Chrome serves the content-hashed `/_app/immutable` assets from cache on every reload, including `navigate_page` with `ignoreCache`, and the native tools have no cache-disable control. That is why `cold` uses a fresh context. The fresh context cannot start with an empty cache either: the image page requests `/favicon.ico`, the app redirects it to `/auth/login`, and Chrome follows that page's `Link` preload headers for the shared entry assets.
- The app rate-limits by IP in `hooks.server.ts`: 10 `/auth/` POSTs per 15 minutes and 60 other requests per minute. Every sample comes from loopback, so samples start at least 6 seconds apart per worker, and cold sign-ins wait for a slot (8 in any 15 minutes), roughly two minutes per cold sample once the budget is spent. When a budget runs out anyway, doctor reports `APP_ENDPOINT_UNAVAILABLE`, because its `/auth/login` probe gets a 429, or a cold sample reports `Cold sign-in returned failure`. Sending a captured session as a request header does not work: the first post-hydration invalidation is answered signed-out.
- Above 250 People the By Group roster shows `Grouped roster paused` instead of rows. A large wide `personnel-list` sample therefore settles on that notice and renders no Person rows; compare it with large scoped and typical wide, not as a like-for-like row count.
- Only Calendar, Dashboard and Training emit `[*-load]` server timing lines. A Personnel sample has none; use its statements and `responseStartMs` for the server side.
- pg_stat_statements covers the whole owned database for the window, including auth and PostgREST setup statements. Read `byRole` before attributing time to the app.
- The explain registry is shaped like the app's reads, not copied from them. Use pg_stat_statements for what the app actually ran and explain for why one statement costs what it does.
- Restart recreates fixtures and loses workloads. Reseed and sign in again after every helper edit, because doctor reports `STALE_CANDIDATE` until restart.
- Local unthrottled numbers show relative cost and request shape, not field latency. Record the host's CPU and load alongside them.
- There is no network emulation. Chrome refuses network throttling while the daemon's owned-origin URL allowlist is set, and that allowlist stays. Field network latency is not measured here.
- A first visit has no viewer time zone cookie, so the root layout sets it and calls `invalidateAll()` on mount. Every cold sample therefore reloads all page data right after the first render; on a Dashboard that reruns the summary load at the same time as the document's. Server timing reports each load and the loads per sample; never add them up as one wait. `settledIncludingReloadsMs` is where that reload ends.
- The native network list shows a status as soon as response headers arrive, and a streamed `__data.json` keeps its body open after that. Idle therefore also compares answered fetches with finished Resource Timing entries.
- Every page requests the Vercel analytics scripts after idle, and the owned origin answers 404 or a redirect. They show up as failed requests in every sample; they are not app failures.
