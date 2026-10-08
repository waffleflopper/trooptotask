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
- Routed page components and modals are declared as individual public files rather than re-exported from web barrels. A barrel export would make every route that imports a helper also download every page. At `0897bc3a`, all 84 client route nodes were measured within 300 B of base `17229542`. The final complete candidate compared with that main has maximum growth of 692 B (about 0.16% of the Critical Tasks layout closure); its complete 84-node comparison is preserved with the Calendar readiness proof below.

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

[Hosted CodeRabbit review `5461231179`](https://github.com/waffleflopper/trooptotask/pull/1578#pullrequestreview-5461231179) completes the intended source/prose diff at that head. It selects 144 paths, excludes the five compressed evidence archives, and reports three paths with no reviewable changes. Round-two source/artifact acceptance is bound to `0897bc3a`. The later `ac14c29d` archive records the separate delegated live run, with focused tests and a zero-finding CLI delta review; it was not part of that acceptance round. The hosted review's two actionable findings are stale governance descriptions and completed-work queue pointers. Both are repaired in documentation, with formatting, local links/anchors and whitespace checked. The duplicate Dashboard import is an optional style suggestion; both imports bind the same module without changing authorization, requests or bundles, so it remains unchanged.

Those hosted documentation corrections change no application code, live controls, fixture or role/scope input. Prior local, live and independent evidence retains its original candidate binding. Current-head CI and completed hosted review are required after record-only updates; their final readback is available in the [PR checks](https://github.com/waffleflopper/trooptotask/pull/1578/checks) and review history. Robert reviews and merges. D30 is not integrated, the phase parent remains open and Phase 09 stays inactive.

### Shared-store repair after independent acceptance

[Depot run `8rrmqq41m6`](https://depot.dev/orgs/rvsvvkd4rp/workflows/8rrmqq41m6?job=bjzplz8vbc&repo=waffleflopper%2Ftrooptotask) subsequently passes selection and Repository and application at exact `5f221a1cf0abe101af7e12a3eea4b3cdd688f3e6`, with Database contracts skipped. [Hosted CodeRabbit review `5461311453`](https://github.com/waffleflopper/trooptotask/pull/1578#pullrequestreview-5461311453) approves that head; both actionable threads are resolved. The docstring-coverage advisory is inconclusive and optional, with no repository quota. Main remains `17229542`.

A further independent review expands and verifies the previously unaccepted `ac14c29d` archive, then finds a consequential shared-store defect. Clearing a denied lane with the current Organization ID leaves another lane's cached snapshot marked applied. Returning with the same snapshot can therefore leave an allowed roster empty. The same mechanism exists in Calendar and in replacement by a different allowed lane, so the repair groups those consumers in D30.

Authoritative loads now carry a version through their owning hydration ports. The shared hydrator checks that version alongside the Organization and snapshot key, and identifies each pending request by its own object. Denial clears to the existing unhydrated Organization sentinel, which also drops optimistic changes and late writes. Delayed streams cannot repopulate a cleared store, including on its first load. The same-key regression fails for all three denied lanes before the repair and passes afterward; tests additionally cover different allowed rosters and reset/restarted delayed requests. The unchanged native navigation happens to pass with fresh route data and is retained honestly as such.

Focused final checks pass 14 files / 142 tests, types 0/0, governance 0 and lint 0 errors / three existing warnings. The owned Node-24 production build passes. CLI reviews all 25 changed text files with zero findings. Native Back/sidebar navigation passes for ICTLs → denied Personnel → ICTLs, Calendar → denied Training → Calendar and Training → denied Calendar → Training, preserving admitted rows and restricted screens. Start/end doctors and owned cleanup pass. No mutation or remote operation occurs. Prior unrelated app, provider, export and security proof retains its original binding; no full manual repeat occurs.

| Follow-up                                                  | Tested candidate                                            | Archive SHA-256                                                    | Payloads | Outcome                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Shared-store baseline](d30-denial-return-baseline.tar.gz) | `5f221a1c`, digest `3428ad72…a193`                          | `2ebee81684444f62cc1b06a31eb92c8927f71a1507ad5e4b1d712baf250ffa5e` |       21 | Native path passes with fresh data; unchanged-key state regression fails. Node-26 launch failure and its cleanup remain explicit.                |
| [Shared-store final](d30-denial-return-final.tar.gz)       | `5f221a1c` plus captured patch/test, digest `e3b02141…54ce` | `1f0158cce5452ffe874dd31ad969c473a5c53629c380743cc4857f289cdb6a86` |       98 | Three focused native returns and state/adjacent checks pass. Complete 84-node gzip comparison records maximum growth 693 B and adds no requests. |

Both archives preserve sanitized payloads without redaction and pass fresh exact-set/SHA-256 verification. Extract each into fresh ignored scratch, change into `.verification/evidence/verify-trooptotask/d30-denial-return/baseline` or `final` inside that extraction, then run `sha256sum -c INVENTORY.sha256`. Each `RUN-NOTE.md` identifies outcomes, tested inputs and limitations. Archive/record publication does not claim fresh live execution.

Independent round four accepts the two shared-store archives, their source binding, denied returns and cache-version mechanism, but rejects a Calendar ordering defect: an early range load can invalidate its delayed bootstrap streams. The accepted observations retain their original bindings; the following grouped repair closes that remaining objection. No SQL, migration or provider-function change is introduced; Database contracts remain a selector skip.

### Calendar workspace readiness

[Depot run `2h2sxsrwlq`](https://depot.dev/orgs/rvsvvkd4rp/workflows/2h2sxsrwlq?job=czlkdhqtrr&repo=waffleflopper%2Ftrooptotask) tests head `ed4758185d0cf720c86fda625ef5fa1e6dddfde0` through merge checkout `1c31f518`. It completes the build but fails four stale denial assertions (7,285 tests pass): Calendar, Personnel and Training expect the retired restriction arguments, and Critical Tasks expects a cleared store to retain its Organization. Those incidental expectations are removed; denied screens, absent children and no denied hydration remain asserted. The Critical Tasks case now starts with a saved completion and proves it is cleared.

Calendar children now mount only after successful completion of every workspace hydration stream. This prevents their range loads and bulk actions from racing the bootstrap, preserves existing authoritative range replacement (including empty results), and leaves strict shared-store version guards intact. Replacement workspace identity closes the old child immediately; cleanup cancels ownership, and page data retaining the same workspace preserves unsaved input. A proposed same-Organization merge exception was rejected because it could overwrite newer overlapping data; it is absent from the final source.

Focused checks pass nine files / 34 tests, types 0/0, governance zero and touched-file lint/formatting. CLI completes all eight changed text paths with zero findings. The official Svelte autofixer reports zero issues; its generic effect suggestions do not apply to asynchronous provider completion/cancellation. The owned Node-24 production build and start/end doctors pass at digest `df611da1…af3f8` on `ed475818` plus the captured patch/test. Native proof holds a real successful bootstrap read, observes loading with no child controls or range request, releases it, then observes a completed additional-range request and the saved September statuses/closure twice. The driver timing and description-wait failures are preserved with their successful focused recovery. Controls are restored and owned cleanup passes; no mutation or remote operation occurs.

[Calendar readiness archive](d30-calendar-readiness.tar.gz), SHA-256 `e9157e1b011e2461f39b41b7c29e6d3a1396b83888d8ef3008a10aedf4203d2d`, contains 120 payloads (822,637 expanded bytes). Fresh safe extraction verifies the exact inventory and every hash. It preserves the failed direct adapter probe, old-layout failure, rejected merge proposal, failed Depot assertions and final source/native/check receipts. Credential-pattern scanning finds zero matches and makes no redactions. The new non-Markdown archive changes candidate-fingerprint inputs after cleanup as packaging-only drift; omitting only that archive reconstructs the tested digest from unchanged executable source and recipe. The final whole-candidate 84-node gzip comparison against main `17229542` records maximum growth 692 B; Calendar layout is +608 B. No request is added, and no executable 300-B budget exists. Unaffected prior proof is reused with its original binding; no full manual repeat occurs.

Fresh GPT-6.1-Sol independent round five returns Standards GO / Spec GO with no consequential finding. It inspects all final source/consumer changes, fresh-extracts and verifies all 120 payloads and views both final PNGs, reconstructs the tested digest from 5,198 inputs, and reuses round-four acceptance of the unchanged denial archives. This is source/artifact acceptance, not an independent live run or model-family diversity. The final note/hash clarification changes only packaging metadata; executable and native proof bytes remain exact.

[Hosted review `5461755281`](https://github.com/waffleflopper/trooptotask/pull/1578#pullrequestreview-5461755281) finishes the shared-store delta at `ed475818` and identifies one remaining stale architecture description outside the diff. The architecture record now describes provider-backed port construction through owning factories and adapters, including lazy account-setup admin binding, rather than claiming direct provider access in route files. Local prose formatting, links/anchors and contract inspection cover that correction. Optional freshness-token hardening and docstring quota suggestions remain outside the required gates.

[Depot run `r15fc2w7j4`](https://depot.dev/orgs/rvsvvkd4rp/workflows/r15fc2w7j4?job=kl05gcr27c&repo=waffleflopper%2Ftrooptotask) passes Select checks and Repository and application at final application-source head `ebd29cd0d6d9277e32fdfe2620a89e62f88320c7`, completed 2026-10-08 at 19:48:55 UTC. GitHub check-run readback confirms the exact head; Database contracts are skipped, and Vercel succeeds. Main remains `172295422a6b97838ad6cd9c3b4d5f079a1245aa`. Hosted review is still processing that head. The prose/evidence follow-up also requires its own exact-head CI and completed hosted disposition before handoff. Robert reviews and merges; the Phase 08 parent remains open and Phase 09 remains inactive.

## Release obligations

D30 adds no migration or remote operation. Repository CI performs no remote migration. Push or merge may deploy through Vercel; external deployment settings remain uninspected. Earlier owner obligations stay with their [RELEASE](../RELEASE.md) entries. The agent has not inspected hosted state for any of them:

- the D12 scheduled Personnel retention RPC and the D25 Critical Tasks retention RPC still need a recorded owner-reported hosted result;
- D17 upload completion registration still needs production deployment and old-instance drain confirmation;
- the `NOT VALID` Critical Tasks task-reference and Calendar status-reference constraints still need a fresh private preflight count before any validation;
- old-instance drain and normal-operation confirmations remain recorded for the D15, D18, D21 and D28 migrations.
