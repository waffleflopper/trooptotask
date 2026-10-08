# D30 integrated convergence

This closing [#1378](https://github.com/waffleflopper/trooptotask/issues/1378) deliverable reconciles Phase 08 on the integrated candidate. It removes the last module-boundary findings, route provider exceptions and the legacy server `core` root. It repairs the lane-denial failures found by the integrated baseline and makes governance a zero-exception gate.

## Reconciliation

Main `17229542` contains every other Phase 08 child. GitHub reports each one closed by a merged pull request into `main`. The only exception is D14 #1362, which was closed one second after its acceptance record #1435 merged. Every listed merge commit is an ancestor of `origin/main`.

| Deliverable | Closing PR | Merge      | Deliverable | Closing PR | Merge      |
| ----------- | ---------- | ---------- | ----------- | ---------- | ---------- |
| D01 #1349   | #1379      | `5c61f22b` | D16 #1364   | #1455      | `b5f6f559` |
| D02 #1350   | #1380      | `b8fedc27` | D17 #1365   | #1496      | `6436dd47` |
| D03 #1351   | #1384      | `f03a1123` | D18 #1366   | #1508      | `471bbda8` |
| D04 #1352   | #1392      | `4bd7edfa` | D19 #1367   | #1505      | `f151607f` |
| D05 #1353   | #1404      | `ee8f00a2` | D20 #1368   | #1442      | `1f659f41` |
| D06 #1354   | #1410      | `4b64b186` | D21 #1369   | #1512      | `3aebd4ee` |
| D07 #1355   | #1398      | `d66265c1` | D22 #1370   | #1516      | `93be0975` |
| D08 #1356   | #1417      | `67cfae1d` | D23 #1371   | #1513      | `c40f2ac1` |
| D09 #1357   | #1427      | `284ddcd3` | D24 #1372   | #1517      | `ad63659a` |
| D10 #1358   | #1419      | `a3be83fe` | D25 #1373   | #1521      | `fa623ed9` |
| D11 #1359   | #1429      | `d55a8f22` | D26 #1374   | #1525      | `937d8acc` |
| D12 #1360   | #1462      | `e6d46784` | D27 #1375   | #1531      | `fa562fc3` |
| D13 #1361   | #1476      | `e4080fe0` | D28 #1376   | #1573      | `6e458162` |
| D14 #1362   | #1435      | `875dd0e1` | D29 #1377   | #1577      | `2b9e50c8` |
| D15 #1363   | #1492      | `05726166` |             |            |            |

The TODO table still showed D22 and D24–D29 as unchecked, and D27's corrective 08-M15-01b and D28's 08-M15-02b were also open. Each one has the verified closing merge above. D27's reopened composition regressions close through #1531, whose exact-head CI and completed review are recorded in that PR.

At `17229542`, `node scripts/module-boundaries.ts` reports 116 findings across 2,268 source modules:

| Packet      | Findings | Mechanism                                                                                                                                                                                                                                                |
| ----------- | -------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner cycle |        1 | 15 owners are strongly connected. Calendar's workspace builder imports Delivery's `streamedWorkspace`, and two Identity tests import route pages. Every other owner already reaches Delivery's dependencies, so those two reverse edges close the cycle. |
| 08-M01      |       69 | Auth routes import `lib/components/auth/*` privately. Delivery tests import the two Identity password fixtures, and `lib/auth` tests render route pages.                                                                                                 |
| 08-M05      |       25 | Calendar routes import private components, stores, contexts and utilities. Calendar's web hydrator takes types from `server/calendarWorkspaceBootstrap.ts`, which imports Delivery and lacks recognized server placement.                                |
| 08-M15      |        8 | Four Calendar route pages and four Settings page edges reach `.server`/feature-server modules through type imports. Type-only imports count because they are real source edges.                                                                          |
| 08-M12      |       12 | Admin routes import `lib/components/admin/*` privately.                                                                                                                                                                                                  |
| 08-M04      |        1 | The Critical Tasks page test imports the Personnel store privately.                                                                                                                                                                                      |

## Changes

**Module graph (116 → 0).**

- Calendar's streamed workspace contract (lane key, hydration targets, result, restricted and route data) now lives in `calendar.types.ts` and is exported through Calendar's web and server entries. The hydration builder moves into the Calendar route's `calendarWorkspaceDelivery.server.ts`, next to the other lanes' Delivery builders; `server/calendarWorkspaceBootstrap.ts` is deleted.
- `AuthField`, `AuthNotice`, `AuthPasswordToggle` and `AuthShell` move into Identity. The two password-flow tests that render route pages move under `src/routes/auth/`, beside the existing `passwordCompletion` test. The two password fixtures are declared test support.
- The admin search, Suspend and Transfer Ownership modals and the badge helpers move to `src/features/platform-admin/components/`. Two unused color maps are deleted.
- Settings ranks and logs page-data types join `settingsSectionTypes.ts`, so Svelte pages no longer import `.server` modules for types. The Critical Tasks test reads `personnelStore` from the Personnel web entry.
- Routed page components and modals are declared as individual public files rather than re-exported from web barrels. A barrel export would make every route that imports a helper also download every page. Across all 84 client route nodes, the gzipped JavaScript closure differs from base `17229542` by under 300 B.

**Legacy root.** `src/lib/server/core/` is removed:

- Starter configuration packs become a Dashboard server operation, because Dashboard owns Getting Started and its pack contracts and may compose Training and Onboarding operations.
- The root Organization layout load moves beside its only route.
- `streamedWorkspace`, `featureLaneWorkspaceLoad` and `appShellRouteData` join the other Delivery helpers in `src/lib/server/adapters/`.

The deleted-authorization-symbol scan now covers all of `src/lib/server`, `src/lib/access` and `src/features`.

**Route provider edges (8 → 0) and no exception file.**

- Settings logs, Settings members, Deletion Request review and the three cron jobs no longer acquire or import the admin client. Delivery adapters in `src/lib/server/adapters/` bind those service-role ports after authorization: `requestContexts.server.ts` and the new `scheduledMaintenanceSources.server.ts`.
- `/suspended` uses Identity's new `readAccountSuspension`, which admission also uses. An unverifiable status now returns 500, as admission does.
- Invite finalization and email confirmation pass the request to their owned operations. `checkSessionAssurance`, `autoAcceptOrgInvites` and `confirmAuthLink` now take `{ supabase }`, like `loginIdentity`.
- `GOVERNANCE_BASELINE.json` and the allowlist code are deleted. Governance fails on any route-level Supabase usage, admin-client import or acquisition, feature permission coupling or module-boundary finding. The merge-base comparison and cycle-shrink allowance are removed because no accepted debt remains.

**Lane denial repair.** The unchanged-app baseline shows a blank page and an uncaught hydration error for Critical Tasks and Personnel. Training shows its message but still throws. In each case the member lacks the lane's view grant; the server denies correctly and leaks nothing.

- Calendar and Evals already streamed denial as a restricted result. Delivery's shared `settleWorkspaceDenial` now does the same for Critical Tasks, Training and Personnel.
- Each lane layout clears its stores for the Organization through its hydrator's `restrict` and shows the shared `WorkspaceAccessRestricted` panel; Calendar and Evals use the same panel.
- Onboarding denies synchronously through the 403 error page with no uncaught error, and stays as is.
- New layout tests fail against the previous layouts and pass on the repair.

## Inventory result

| Packet | Integrated outcome                                                                             | Findings |
| ------ | ---------------------------------------------------------------------------------------------- | -------: |
| M01    | D01, D02; D30 moves auth UI into Identity and owns the suspension read                         |        0 |
| M02    | D05, D17, D18                                                                                  |        0 |
| M03    | D26                                                                                            |        0 |
| M04    | D03, D12, D13                                                                                  |        0 |
| M05    | D04, D06; D30 removes Calendar's server-placed workspace contract and private route imports    |        0 |
| M06    | D23; D30 places starter packs under Dashboard                                                  |        0 |
| M07    | D08, D09                                                                                       |        0 |
| M08    | D10, D11                                                                                       |        0 |
| M09    | D14, D15                                                                                       |        0 |
| M10    | D16                                                                                            |        0 |
| M11    | D07                                                                                            |        0 |
| M12    | D21, D22; D30 adds the admin web entry                                                         |        0 |
| M13    | D19, D20                                                                                       |        0 |
| M14    | D24, D25                                                                                       |        0 |
| M15    | D27, D28; D30 removes every route provider edge, the exception file and the legacy `core` root |        0 |
| M16    | D29                                                                                            |        0 |
| M17    | D02; later control migration remains Phase 10                                                  |        0 |

`mixedFiles` is empty, and no owner or source cycle remains. The manifest adds no dependency direction. Its only additions are the Platform Administration web entry and two test-support declarations, each with real consumers; Identity and Calendar export more through their existing entries. It removes the `lib/auth`, `lib/components/auth` and `lib/components/admin` roots and the eight `lib/server/core` file assignments.

## Lower-level checks

Final local sequence on `0897bc3a` (Node 24.21.0, npm 11.19.0, the CI workflow's synthetic provider environment):

- `format:check` passes. `lint` reports 0 errors and the three existing `prefer-svelte-reactivity` warnings.
- `governance:check` reports 0 findings. `check` reports 0 errors and 0 warnings over 8,055 files.
- `test` passes 728 files / 7,281 tests.
- `build` passes, apart from the existing optional `@opentelemetry/api` notice.

`ac14c29d` adds store clearing on restriction, the remaining Delivery bindings and the admin-client import rule. After it, types report 0/0, governance passes, and the affected 1,488 lane/feature tests and 202 adapter/deletion-request tests pass. Current-head CI covers the full sequence for the published candidate.

No SQL, migration, RLS policy or provider function changes. The isolated database contracts last ran on D28's exact-head CI for the unchanged schema, and D30 adds no database input.

Publication preparation restores the unchanged CI-selection test's synthetic JSON filename. The test checks a path string, not the deleted file's existence. Removing that incidental rename keeps `scripts/ci/` unchanged against main, so the existing selector requires application CI and skips database CI. Focused CI-selection tests and documentation checks cover this preparation. Application code, live controls, fixtures and role/scope inputs remain unchanged from the recorded final proof and reviews.

## Live verification

All runs use the owned `verify:app` environment and native DevTools controls, with doctor passing at start and end and owned cleanup afterwards.

| Run                  | Candidate         | Archive (SHA-256)                                                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unchanged baseline   | `17229542` (main) | [d30-baseline-1722954](d30-baseline-1722954.tar.gz) `b6163623…93ed`                         | Every Calendar view, auth page, `/suspended` (including a suspended user), Platform Admin dialog, Settings logs/members/ranks, starter pack and Critical Tasks path passes. An earlier baseline run on the same commit also found the Critical Tasks denial failure; its archive was lost with its worktree, and this rerun replaces it.                                                                   |
| Lane-denial baseline | `17229542` (main) | [d30-lane-denial-baseline-1722954](d30-lane-denial-baseline-1722954.tar.gz) `96b78490…3651` | Critical Tasks and Personnel blank with an uncaught hydration error; Training shows its message but throws; Onboarding uses the 403 error page; Calendar and Evals show Access Restricted. No lane leaks data.                                                                                                                                                                                             |
| Final                | `c14ccd17`        | [d30-final-c14ccd17](d30-final-c14ccd17.tar.gz) `41b444a4…7fdc`                             | Every baseline path passes on the module/legacy-root candidate, including a suspended user, invitation lifecycle, starter pack apply/reapply/deny and resolved audit labels. Its only failure is the Critical Tasks denial already present in the baseline.                                                                                                                                                |
| Final delta          | `0897bc3a`        | [d30-final-delta-0897bc3a](d30-final-delta-0897bc3a.tar.gz) `2e15c082…be8d`                 | All three repaired lanes show Access Restricted with no uncaught error and no lane data; granted actors still hydrate; client navigation from a restricted lane renders the granted lane. Auth, admin and members paths pass. The three cron jobs return 401 without a credential and 200 with the owned one. End-to-end invite finalization is unreachable without a mail transport; partial probes pass. |
| Final `ac14c29d`     | `ac14c29d`        | [d30-final-ac14c29d](d30-final-ac14c29d.tar.gz) `beb0c888…9968`                             | Delegated GPT-6.1-Sol run on worker 2. Restricted Critical Tasks/Training/Personnel lanes followed by sidebar navigation render the granted lane; a Training deletion request is denied, resubmitted and approved, and readback confirms the resource removed and the request approved; Settings members renders, invites, shows pending and revokes. No uncaught errors.                                  |

## Review

- CodeRabbit CLI reviews `17229542..c14ccd17` (101 files) with one minor finding: `/suspended` treated an unverifiable status as active. `c0b3bf8e` fixes this. Its reviews of `c14ccd17..0897bc3a` and `0897bc3a..ac14c29d` report 0 findings.
- Independent acceptance by a separate agent first returns NO-GO at `c14ccd17` on two findings:
  - Barrel page exports grew several route bundles by up to 200 KB. Fixed with per-component public files; measured above.
  - Five route provider exceptions remained. Removed together with the exception file.
- Its minor findings are fixed: stale TODO text, builder naming, the authorization doc's allowlist sentence, the Deletion Request review binding, and restricted-lane store clearing. Two dispositions stand:
  - The Calendar hydration types stay structural; the Delivery builders' declared return types already enforce compatibility.
  - Invitation ports are still constructed eagerly. `getAdminClient()` performs no I/O, and the old route had the same ordering.
- Round two at `0897bc3a` returns Standards GO / Spec GO. It confirms the bundle and exception fixes, every changed caller, cron authorization ordering, and Personnel's organization switch, including a real-page restricted render. This is source/artifact review, not independent live execution.

## Hosted PR validation

Non-draft [#1578](https://github.com/waffleflopper/trooptotask/pull/1578) targets main `17229542`. [Depot run `6mwbf7qn8d`](https://depot.dev/orgs/rvsvvkd4rp/workflows/6mwbf7qn8d?job=m4j9c42s12&repo=waffleflopper%2Ftrooptotask) passes Select checks and Repository and application at exact head `62830a3e8d2f410730143ed9acdec21816a23456`. Database contracts are skipped by the unchanged selector. GitHub check-run readback confirms each job is completed and bound to that SHA. Vercel's preview deployment also passes; production deployment settings remain uninspected.

[Hosted CodeRabbit review `5461231179`](https://github.com/waffleflopper/trooptotask/pull/1578#pullrequestreview-5461231179) completes the intended source/prose diff at that head. It selects 144 paths, excludes the five compressed evidence archives, and reports three paths with no reviewable changes. The existing independent expanded-artifact acceptance covers the archives. Its two actionable findings are stale governance descriptions and completed-work queue pointers. Both are repaired in documentation, with formatting, local links/anchors and whitespace checked. The duplicate Dashboard import is an optional style suggestion; both imports bind the same module without changing authorization, requests or bundles, so it remains unchanged.

These corrections change no application code, live controls, fixture or role/scope input. Prior local, live and independent evidence retains its original candidate binding. Current-head CI and completed hosted review are required after record-only updates; their final readback is available in the [PR checks](https://github.com/waffleflopper/trooptotask/pull/1578/checks) and review history. Robert reviews and merges. D30 is not integrated, the phase parent remains open and Phase 09 stays inactive.

## Release obligations

D30 adds no migration or remote operation. Repository CI performs no remote migration. Push or merge may deploy through Vercel; external deployment settings remain uninspected. Earlier owner obligations stay with their [RELEASE](../RELEASE.md) entries. The agent has not inspected hosted state for any of them:

- the D12 scheduled Personnel retention RPC and the D25 Critical Tasks retention RPC still need a recorded owner-reported hosted result;
- D17 upload completion registration still needs production deployment and old-instance drain confirmation;
- the `NOT VALID` Critical Tasks task-reference and Calendar status-reference constraints still need a fresh private preflight count before any validation;
- old-instance drain and normal-operation confirmations remain recorded for the D15, D18, D21 and D28 migrations.
