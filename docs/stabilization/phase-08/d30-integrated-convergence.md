# D30 integrated convergence

This closing [#1378](https://github.com/waffleflopper/trooptotask/issues/1378) deliverable reconciles Phase 08 on the integrated candidate. It removes the last module-boundary findings, retires the legacy server `core` root, and turns governance from a merge-base ratchet into a zero-finding gate.

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

| Packet       | Findings | Mechanism                                                                                                                                                                                                                                                |
| ------------ | -------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner cycle  |        1 | 15 owners are strongly connected. Calendar's workspace builder imports Delivery's `streamedWorkspace`, and two Identity tests import route pages. Every other owner already reaches Delivery's dependencies, so those two reverse edges close the cycle. |
| 08-M01       |       69 | Auth routes import `lib/components/auth/*` privately. Delivery tests import the two Identity password fixtures, and `lib/auth` tests render route pages.                                                                                                  |
| 08-M05       |       25 | Calendar routes import private components, stores, contexts and utilities. Calendar's web hydrator takes types from `server/calendarWorkspaceBootstrap.ts`, which imports Delivery and lacks recognized server placement.                              |
| 08-M15       |        8 | Four Calendar route pages and four Settings page edges reach `.server`/feature-server modules through type imports. Type-only imports count because they are real source edges.                                                                         |
| 08-M12       |       12 | Admin routes import `lib/components/admin/*` privately.                                                                                                                                                                                                  |
| 08-M04       |        1 | The Critical Tasks page test imports the Personnel store privately.                                                                                                                                                                                      |

## Changes

**Module graph (116 → 0).**

- Calendar's streamed workspace contract (lane key, hydration targets, result, restricted and route data) now lives in `calendar.types.ts`. Calendar exports it through its web and server entries. The hydration builder moves into the Calendar route's `calendarWorkspaceDelivery.server.ts`, next to the other lanes' Delivery builders. `server/calendarWorkspaceBootstrap.ts` is deleted. Calendar routes and their tests consume the page views, range coordinator, hydrator, stores and anchor cookie through `$features/calendar`.
- `AuthField`, `AuthNotice`, `AuthPasswordToggle` and `AuthShell` move into Identity and are exported from its web entry. The two password-flow tests that render route pages move under `src/routes/auth/`, beside the existing `passwordCompletion` test. The `lib/auth` and `lib/components/auth` roots are removed from the manifest. The two password fixtures are declared test support.
- The admin search, Suspend and Transfer Ownership modals and the badge helpers move to `src/features/platform-admin/components/`. A new Platform Administration web entry exports them. Two unused color maps are deleted.
- Settings ranks and logs page-data types join `settingsSectionTypes.ts`. Svelte pages no longer import `.server` modules for types.
- The Critical Tasks test reads `personnelStore` from the Personnel web entry.

**Legacy root.** `src/lib/server/core/` is removed. Starter configuration packs become a Dashboard server operation, because Dashboard owns Getting Started and its pack contracts and may compose Training and Onboarding operations. The root Organization layout load moves beside its only route. `streamedWorkspace`, `featureLaneWorkspaceLoad` and `appShellRouteData` join the other Delivery helpers in `src/lib/server/adapters/`. The deleted-authorization-symbol scan now covers all of `src/lib/server`, `src/lib/access` and `src/features`, so moving files out of the old root does not shrink coverage.

**Provider edges (8 → 5).**

- The Settings logs and members routes no longer acquire a service-role client. As ADR 0012 requires, `requestContexts.server.ts` now wires the audit-log readers and the invitation delivery, rate-limit and setup-link ports.
- `/suspended` no longer issues its own `is_user_suspended` RPC. Identity's new `readAccountSuspension` serves both admission and that page; admission keeps its unavailable result for an unverifiable status.
- The remaining entries are intentional current edges. Invite finalization and email confirmation are Identity `auth-edge` routes. The three admitted cron jobs are `cron-edge` routes that bind service-role retention sources in Delivery, as accepted by D25.

**Governance.** Every module-boundary finding now fails `npm run governance:check`. The merge-base comparison, cycle-shrink allowance and their tests are removed because no accepted debt remains to compare against. The governance and CI documentation describe the new contract.

## Inventory result

| Packet | Integrated outcome                                                                                                                              | Findings |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------: |
| M01    | D01, D02; D30 moves auth UI into Identity and owns the suspension read                                                                          |        0 |
| M02    | D05, D17, D18                                                                                                                                   |        0 |
| M03    | D26                                                                                                                                             |        0 |
| M04    | D03, D12, D13                                                                                                                                   |        0 |
| M05    | D04, D06; D30 removes Calendar's server-placed workspace contract and private route imports                                                    |        0 |
| M06    | D23; D30 places starter packs under Dashboard                                                                                                   |        0 |
| M07    | D08, D09                                                                                                                                        |        0 |
| M08    | D10, D11                                                                                                                                        |        0 |
| M09    | D14, D15                                                                                                                                        |        0 |
| M10    | D16                                                                                                                                             |        0 |
| M11    | D07                                                                                                                                             |        0 |
| M12    | D21, D22; D30 adds the admin web entry                                                                                                          |        0 |
| M13    | D19, D20                                                                                                                                        |        0 |
| M14    | D24, D25                                                                                                                                        |        0 |
| M15    | D27, D28; D30 removes two route admin-provider edges and the legacy `core` root                                                                 |        0 |
| M16    | D29                                                                                                                                             |        0 |
| M17    | D02; later control migration remains Phase 10                                                                                                   |        0 |

`mixedFiles` is empty, and no owner or source cycle remains. The manifest adds no dependency direction. Its only additions are the Platform Administration web entry and two test-support declarations, each with real consumers; Identity and Calendar export more through their existing entries. It removes the `lib/auth`, `lib/components/auth` and `lib/components/admin` roots and the eight `lib/server/core` file assignments.

## Lower-level checks

Initial candidate `3d8385da` (Node 24.21.0, npm 11.19.0, the CI workflow's synthetic provider environment, `VITEST_MAX_WORKERS=4`):

- `format:check` passes. `lint` reports 0 errors and four warnings: three existing `prefer-svelte-reactivity` warnings, plus an unused import introduced by the Settings type move. `533321d7` removes that import.
- `governance:check` passes with 0 findings. `check` reports 0 errors and 0 warnings over 8,052 files.
- `test` passes 726 files / 7,278 tests.
- `build` passes with `APP_PUBLIC_ORIGIN=http://127.0.0.1:4173`, apart from the existing optional `@opentelemetry/api` notice.

After the legacy-root move, the following pass: types 0/0, governance 0, 152 Dashboard/adapter/route files / 1,022 tests, and all 923 `src/routes/org` + hooks tests. The final candidate's complete sequence is recorded below.

No SQL, migration, RLS policy or provider function changes. The isolated database contracts last ran on D28's exact-head CI for the unchanged schema. D30 adds no database input, so the database CI job correctly does not apply.

## Live verification

Pending: unchanged-app baseline and final affected proof.

## Review

Pending.

## Release obligations

D30 adds no migration or remote operation. Repository CI performs no remote migration. Push or merge may deploy through Vercel; external deployment settings remain uninspected. Earlier owner obligations stay with their [RELEASE](../RELEASE.md) entries. The agent has not inspected hosted state for any of them:

- the D12 scheduled Personnel retention RPC and the D25 Critical Tasks retention RPC still need a recorded owner-reported hosted result;
- D17 upload completion registration still needs production deployment and old-instance drain confirmation;
- the `NOT VALID` Critical Tasks task-reference and Calendar status-reference constraints still need a fresh private preflight count before any validation;
- old-instance drain and normal-operation confirmations remain recorded for the D15, D18, D21 and D28 migrations.
