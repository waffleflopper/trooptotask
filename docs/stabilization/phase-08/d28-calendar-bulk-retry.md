# D28 Calendar bulk Add retry repair

Phase 08 [#1376](https://github.com/waffleflopper/trooptotask/issues/1376), task `08-M15-02`, continues from [#1543](https://github.com/waffleflopper/trooptotask/pull/1543), integrated at `51e4a9eb78ac4541b1a323dfbceeb9f3f36523cc`. The issue remains open.

## Declared outcome and boundary

Preserve the failed Person selection and submitted status, dates and note after a partial bulk Add. Retry must submit only failed People, preserve acknowledged saved rows and allow the normal completion refresh after every remaining Person succeeds. Keep zero-save failure and complete-success behavior. The maintained [bulk recipe](../../../.agents/skills/verify-trooptotask/features/bulk-status.md) owns the actual driving steps.

This is an independently useful baseline repair before Calendar's ordinary persistence cutover. Its unchanged native 501-Person path failed the approved retry contract. The broader refactor cannot claim a passing affected baseline until this repair and its remaining feature checks pass. Rating Scheme continues independently. Complete Calendar provider/caller removal, other domain concerns, generic request/store/scope removal and final integrated acceptance remain D28 work. This PR uses `Refs #1376`.

## Reproduction and supported cause

The unchanged worker-2 run tested revision `51e4a9eb`, tree `bf8944d2046584aa91b9d4a81e6ab46bb218c8ff`, candidate `4291aca5871f0d0a9eaf313f5d670658826fa68af2a2ff91f57b1ced6792a92b`. All 5,021 executable/driving input hashes match through final doctor and owned disposal. Its isolated origin was `http://127.0.0.1:43487`, session `53c17ba0-d827-4900-b97f-4b09f9f1ae9d`, with Chromium 152.0.7977.82, Node 24.21.0, npm 11.19.0 and browser date October 5, 2026 in America/Anchorage.

Calendar-only operator selected 501 temporary Alpha People, Leave, today's one-day range and a unique note through native controls. The first actual POST acknowledged 500 rows with 200; the second one-Person request received a controlled, undispatched 503. Exact provider readbacks match the first request's 500 Person IDs and submitted values. The failed Person has no row; B has no marked effects. The toast promises that the failed Person remains selected, but the settled screenshot shows zero selected, a disabled Review & Confirm and a cleared note/search. No reload preceded that failure. This is client recovery proof, not a real provider outage or atomicity claim.

The coordinator inspected the actual screenshot, network captures and exact saved rows and independently recomputed the ID/effect and input comparisons. `BulkStatusAdd` reconstructs the failed selection correctly, then calls completion after a partial result. `BulkStatusPage` maps completion to Calendar data invalidation. The streamed bulk route replaces the page with its pending branch during refresh, remounting the form and losing its local draft. The shared selection hook does not clear because a roster array changes.

Fix Root Causes led to changing Add's completion point rather than shared selection or route-state machinery. Remove invokes completion after its acknowledged successful removal. Import retains its result screen and refreshes on Done. Source inspection establishes that those nearby paths do not share the unconditional partial-Add refresh; it supplies no new native Remove/Import acceptance.

## Durable failing baseline

[Baseline archive](d28-calendar-bulk-retry-baseline.tar.gz) preserves 109 payloads plus `inventory.json`, three actual PNGs and no workbooks. Its SHA-256 is `bbba27ac7735fbc03aa53a5175052e7e75b88435dadb75626b046e5ef2422db3`; size is 1,016,333 bytes. It includes the original scratch SHA inventory, corrected checkpoint report, actual native captures/provider readbacks and complete input manifest. The report's reference to existing Add tests was corrected to existing chunk and neighboring component checks after disposal; this is provenance prose, not new live proof. No credential redactions were needed. Standalone launch stdout is unavailable; actual launch completion and doctor are separately identified in the report.

Extract into a fresh ignored directory. Compare the exact expanded file set against `inventory.json`, excluding that inventory itself, then verify every payload's expanded SHA-256 and byte count. Coordinator fresh safe extraction passes all 109 payloads. Packaging integrity does not establish repaired behavior or independent acceptance.

## Coverage and current gates

The real Add component interaction covers partial draft/selection, retry of the failed subset and final completion. A fresh native run must also observe zero-save draft recovery before the partial-save attempt. The existing store chunk checks and fresh native 501-Person run cover actual batching and persisted effects separately. Expected results come from the retained retry contract, not private implementation structure or copied calculations.

The broader unchanged checkpoint also observes valid empty-Group single/batch HTTP 403 with zero A/B effects, native status create/edit/reload/restore/delete and temporary Planner Person/Group save/reload/clear. Those observations retain their precise scope. Reports/workbooks, remaining availability/catalog/access/lifetime paths and Personnel reverse consumers are unrun. They remain obligations for the later Calendar persistence wave. No SQL, RLS, provider or permission behavior changes in this repair; no new database replay is claimed.

The new real Add interaction fails on original code at the premature completion callback and passes the repaired partial-selection/draft/subset retry. Focused Add/Remove/Import/store checks pass four files and 23 tests; explicit source formatting/lint/diff checks pass. Final frozen native retry/effects/cleanup, required full checks/build, independent complete source/expanded acceptance and intended CodeRabbit review remain pending. Current state is implementation after an accepted failing reproduction, not a verified or merged repair.

Local Svelte/types passes with zero errors and warnings. The first isolated-checkout check had ten missing static-public environment exports across six unchanged files. A bounded rerun supplies `PUBLIC_SUPABASE_URL=https://offline.invalid`, `PUBLIC_SUPABASE_ANON_KEY=synthetic-offline-anon-key` and `SUPABASE_SERVICE_ROLE_KEY=synthetic-offline-service-role-key`; no source repair or service access is needed. Preserve both logs as separate environment failure and passing type evidence. Documentation checks pass eight selected Markdown files and 228 linked documents; full candidate CI still remains required.

Independent scoped Comment Sicko review recommends deleting two `handleSubmit` comments already expressed by the code and test. Both are removed. The executable Vitest environment directive remains, with no scoped lint or type suppression. The completion condition itself expresses the domain rule, so no additional abstraction or route redesign is needed. The direct Deslop cleanup fallback finds no dead code, speculative layer or unrelated application change. This read-only same-model review supplies comment acceptance, not independent live execution or complete release acceptance.

## Parallel ownership and release

The Calendar worker owns only Add's component and meaningful interaction test in its isolated checkout. The coordinator owns recipe, records, packaging, integration, acceptance and publication. Rating uses a separate unchanged worker-1 environment. Heavy checks and production builds are staggered; frozen inputs stay unchanged during each run. No source/test/proof gate is reduced for throughput.

Repository `vercel.json` uses `npm run build` and does not disable branch deployment. Push or merge may trigger Vercel deployment; external project settings remain uninspected. This repair has no migration or manual database operation. Robert authorizes publication and non-migration merge after current-head CI and completed bots contain no actionable feedback. A migration-containing PR stops before merge for his manual operation. No other issue or phase is authorized.
