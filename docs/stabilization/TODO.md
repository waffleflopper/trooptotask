# V1 stabilization execution queue

## Current checkpoint

Phase **07: Architecture foundation**, parent [#1280](https://github.com/waffleflopper/trooptotask/issues/1280), milestone **5**. D01 [#1335](https://github.com/waffleflopper/trooptotask/issues/1335) merged through [PR #1339](https://github.com/waffleflopper/trooptotask/pull/1339); D02 [#1336](https://github.com/waffleflopper/trooptotask/issues/1336) merged through [PR #1341](https://github.com/waffleflopper/trooptotask/pull/1341). Verified integrated implementation: `dbd501301df350ef4e6cebb6bc1238283b24d9c9`.

State: **READY for D03 [#1337](https://github.com/waffleflopper/trooptotask/issues/1337)**, followed by D04 [#1338](https://github.com/waffleflopper/trooptotask/issues/1338). D03 has not been implemented by this documentation-maintenance change. Establish its actual branch and live PR state before work. The maintenance branch is not a D03 branch. Phase 07 and phase 08 are not accepted or newly activated by this edit.

## Execution rules

- Follow the CURRENT parent and [workflow #1275](https://github.com/waffleflopper/trooptotask/issues/1275), relevant comments, and [local checkpoints](../agents/stabilization-workflow.md). Reconcile live PR state before selecting a task. Complete one ready leaf for the active child; stop at its PR and verified-merge checkpoint. A checked task or closed issue alone does not establish integration.
- [BASELINE](BASELINE.md) owns retained contracts R1–R8, inventory M01–M17, initial defects F01–F11 and the UC/AD/EN/ORG path abbreviations. Preserve reviewed acquisition, Organization/Group access, current authentication/MFA, current identifiers, ordinary Calendar facts, Personnel Duty Role and independent Sign-In Rosters.
- Every cutover includes its owned implementation, all current consumers, meaningful tests and deletion of replaced internal paths. Keep intentional current provider/SQL adapters and supported retained interfaces; no abandoned shims, new exceptions, skipped assertions, inflated budgets or hidden scan paths.
- **G** means the applicable [Definition of Done](../architecture/DEFINITION_OF_DONE.md#required-commands): final application changes require formatting, lint, governance, Svelte/types, retained tests and production build. Documentation-only edits use documentation checks and affected executable consumers. Existing valid evidence may be reused with its applicability stated; missing required evidence is not a pass.
- **DB** means the [isolated database contract](../architecture/DEFINITION_OF_DONE.md#isolated-database-checks): disposable local project, synthetic fixtures, fresh/upgrade and allowed/denied SQL/RLS checks, distinct verified unused ports outside existing 543xx/553xx/563xx stacks, inspected lifecycle/seed configuration, and no legacy seed. Existing authorization for those isolated checks is sufficient. Never access remote databases or reset existing local data; clean up only resources created for the check.
- Expand distant packets into suffix tasks immediately before execution. Preserve packet IDs, prerequisites, exact ownership, all acceptance requirements and issue mappings. All inventory rows must finish. A representative example is not phase completion.
- Current Clerk/native/billing/offline/API-platform work is excluded as specified by the revised parents. Future functionality is not a missing gate; broken current boundaries still block. Data uncertainty blocks only the affected destructive operation, not independent safe work. Applied migration history remains append-only.
- Keep this file a current queue, not a diary. Consolidate completed leaf details into their final evidence record and remove obsolete handoffs once integration is verified. Keep unresolved findings and still-needed verification/release obligations visible. Preserve history by committed references, not repeated tables or an archive directory.
- This maintenance request does not change ordinary publishing permissions. Phase activation authorizes bounded tracker maintenance; commit/push/PR/merge, deployment, remote/provider operations and live-data changes retain their separate authorization requirements. Do not force-reset, discard or silently stash unrelated work.

## Completed phases

The compact index replaces completed execution instructions, not their evidence or remaining obligations. The [pre-compaction queue](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/TODO.md) preserves original task IDs, dispositions and linked records. Historical checkpoints are not current instructions.

- **01: Rules.** Completed instruction and verification-contract work. [Original records](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/TODO.md#01--rules).
- **02: Safety tests / E2E.** Completed retained safety work and E2E removal. The broad residual assertion-quality audit remains **13-03**, not silently completed. Required final browser/release evidence remains with its owning tasks. [Original records](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/TODO.md#02--safety-tests--e2e).
- **03: Billing runtime.** Acceptance and integration: [#1276](https://github.com/waffleflopper/trooptotask/issues/1276). Removed commercial behavior does not waive retained access or security defects.
- **04: Billing schema.** Acceptance and local target evidence: [#1277](https://github.com/waffleflopper/trooptotask/issues/1277). Preserve [catalog evidence](phase-04/catalog-inventory.md), generated/schema artifacts and owner release preflights. The noncommercial catalog follow-up remains **13-01**.
- **05: Duty runtime.** Acceptance and retained-flow evidence: [#1278](https://github.com/waffleflopper/trooptotask/issues/1278). Preserve corrected acceptance and retained Calendar, Onboarding and Dashboard contracts, not earlier superseded handoffs.
- **06: Duty schema.** [#1279](https://github.com/waffleflopper/trooptotask/issues/1279) accepted on `805d4927092a4624279d4dfd77223a3a2f463561`, following PRs #1331, #1333 and #1334. Preserve [phase-06 artifacts](phase-06/README.md), retained types and all pending hosted migration/app-parity checks in [RELEASE](RELEASE.md). Local acceptance is not deployment evidence.

## 07: Architecture foundation

The current [parent #1280](https://github.com/waffleflopper/trooptotask/issues/1280) and [module conventions](../architecture/MODULE_CONVENTIONS.md) govern the exact current/target contract. Current Supabase Auth, membership, identifiers, provider SQL and supported interfaces remain; no future-provider/native implementation is required.

- [x] **07-01 V1 ownership and public-boundary contract**, D01 #1335, merged PR #1339. The capability/consumer census, effective-schema and operational ownership, trusted identity/access, module/delivery contract and canonical guidance were accepted. Leaves 07-01a–e and prior review resolutions remain in the [committed execution record](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/TODO.md). This is not acceptance of all later module migrations.
- [x] **07-02 Executable import boundaries**, D02 #1336, merged PR #1341. Source graph, ownership/dependency, portable/web/server rules and their review repairs are integrated. Preserve the actual checker, fixtures, prior governance controls and explicit remaining phase-08 violations. Leaves 07-02a–c and their acceptance remain in the [committed record](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/TODO.md). Do not treat observation of unmigrated scopes as whole-repository compliance.
- [ ] **07-03 Narrow request composition**, D03 #1337. Prerequisite: verified D02 merge. Own Personnel leader-note use cases, provider mapping, `core/ports.ts`, `AD/httpAdapter.ts` and route callers. Give operations only trusted request-local actor, explicit Organization/resource access and typed collaborators. Retire replaced broad-context/old paths after reverse-consumer inspection; broader generic contexts remain phase-08 work. Preserve R1/R5, current session admission, membership, Personnel/Group policy, SQL/RLS and identifiers. Verify real admission, denied-scope/failure behavior, focused tests and G/build. The feature interface must not expose provider sessions, request objects or arbitrary query capability.
- [ ] **07-04 Complete current-feature pilot**, D03 #1337, same deliverable after 07-03. Cut over note list/create/archive/restore/delete, detail/notes loads, current JSON endpoints, Svelte, archived artifacts, Personnel single/bulk archive and timestamp-linked restore, deletion-approval cascade, Data Export and archive retention. Preserve each distinct delivery/effect and the exact acceptance below. Delete old note paths only after every consumer moves. Verify R1–R8, shared authorized operations without self-HTTP, real current admission, isolated SQL/RLS, affected flows, portable/web/server graphs and production build. Synthetic trusted-actor tests alone are not authentication proof.
- [ ] **07-05 Integrated phase verification and handoff**, D04 #1338. Prerequisite: verified D01–D03 merges. Inspect the integrated candidate, ownership/import/pilot evidence and remaining phase-08 inventory. Verify parent acceptance and R1–R8, current admission/SQL checks and no completed-scope violations. Record candidate, results, residual migration obligations and release caveats. Necessary runtime repairs use bounded children and normal PR checkpoints. Close the parent/milestone only after actual integrated acceptance; stop before phase 08.

### D03 consumer acceptance

The [current JSON/page contract](../architecture/MODULE_CONVENTIONS.md#current-json-and-page-contract-to-preserve-in-the-personnel-pilot) remains authoritative. Include `PERSONNEL_LEADER_NOTE_SPEC.ownedArchive` through `personnelOwnedArchiveSpecs()` into Personnel archive/bulk archive/restore and Resource Deletion Requests approval. Preserve prior archive timestamps and restore only notes archived with their parent. Retain meaningful coverage in `personnelArchivedArtifacts.test.ts`, `personnel.test.ts` and `deletionRequests.test.ts`.

Cut over real note exports and expired-note retention separately from page DTOs. Replace the two stale `personnel_extended_info.leader_notes` reads with explicit blank outputs, not sensitive note text. Preserve malformed-JSON 500, Organization admission 403/404/503 and successful already-active restore. Deliberately fix tied-timestamp traversal using stable bounded reads while retaining the unpaged GET array. Other artifact helpers and the broader deletion-request cycle remain live until their complete phase-08 cutovers.

## 08: All-module migration

Prerequisite: phase 07 and removed features. Preserve R1–R7. These are inventory packets, not one implementation task each. Each owns its matching baseline M row, adapters/entities/routes/tests and reverse consumers. Expand before execution. Common exit: all routes call owned server operations; cross-feature use goes through public contracts; raw provider clients/rows remain in owned infrastructure; meaningful tests pass; replaced global/deep-import/shim paths are deleted; G/build pass. Keep intentional provider SQL and supported interfaces. Complete every row and the residual all-source import/cycle scan.

- **08-M01:** Acquisition/setup issuance; session/MFA; account profile/security. Remove route-owned provider orchestration and duplicate helpers after all callers move.
- **08-M02:** Provisioning; invitations/acceptance; member access; Organization profile/destruction; settings models. Delete former route/global business implementations, preserving URLs/contracts.
- **08-M03:** First-paint shell; deferred chrome; preferences. Remove feature hydration knowledge and global business-store imports from shell.
- **08-M04:** Roster read; Groups; rank catalog; import/archive/merge; each Personnel artifact. Retire old `lib/stores/roster` and global Personnel ownership only with all consumers.
- **08-M05:** Availability; assignment types/manual slots; special days; range workspace; reports/export. Remove feature-to-server-internal type imports and former global implementations.
- **08-M06:** Dashboard source reads and projection/hydration. Replace private imports in `dashboardWorkspaceHydration` and `dashboardScreenModel`, not retained calculations.
- **08-M07:** Training catalog/applicability, completions, matrix, summaries/reports/export. Remove duplicate model/validator and server-global policy ownership.
- **08-M08:** Critical Tasks library/configuration, completions, matrix/readiness and reports. Remove `criticalTasksWorkspaceQuery`/bootstrap type cycle and private consumers.
- **08-M09:** Onboarding templates, packet/start/resync, step completion and history. Replace deep Personnel-create and Training-store dependencies with public seams.
- **08-M10:** Rating Scheme editing, Personnel lookup and export. Remove generic global ownership paths; preserve Evals.
- **08-M11:** Sign-In Roster snapshot/candidates, upload/download and Training composition. Remove Training imports of its private modal and replaced global use cases.
- **08-M12:** Platform access requests, users, Organizations, announcements, feedback, audit/support. Remove route admin-client construction and wide provider exports.
- **08-M13:** Audit capture/projection, notification delivery, feedback/dismissals. Repair evidenced duplicated/unsafe logging and error translation, not a new event framework.
- **08-M14:** Export execution/manifest, workbook formatting and retention jobs. Remove `archiveRetention`/`retentionSupport` type cycle and foreign-table policy from generic helpers.
- **08-M15:** Authorization evaluator/projections, scoped persistence, request/provider adapters. Finish legacy allowlist entries; remove unused entity/provider facades while retaining pure policy ownership.
- **08-M16:** Neutral dates/import/workbook/store mechanics. Return feature models/validators to owners; remove old barrels, duplicates and false shared homes.
- **08-M17:** Public route composition and legal/security copy ownership. Remove reusable behavior/styles trapped in pages; preserve reviewed access.

### Required cross-packet decisions

**08-M13/M15:** Audit delivery composes Organization actor emails and Personnel/Training/Calendar labels while retaining masking; Audit must not import producers. Organization/delivery resolves notification recipients; Notifications retains delivery/self policy without reverse Organization/Platform Administration imports. The injected Access Platform audit sink must not create an Access/Audit cycle. Classify process-local limiter Map/timer separately from durable throttling. Provider Infrastructure owns both private bucket configurations; shared-bucket changes require both Personnel and Sign-In Roster scope checks.

**08-M14:** `/api/cleanup-archived-personnel` re-exports the archived-records GET, is not a configured cron, and its anonymous cron-secret requests currently redirect before dispatch because the route is absent from `publicRoutes.ts`. No maintained caller was found; external callers are unverified. Confirm and retire the old alias without changing configured `/api/cleanup-archived-records` behavior.

**08-M02/M04/M07/M10:** Follow the [chosen graph](../architecture/MODULE_CONVENTIONS.md#chosen-module-and-delivery-contract-07-01d) for Resource Deletion Requests. Server delivery owns Personnel bulk-archive approval submission and aggregation. Preserve both permission checks, missing-capability-only fallback, already-pending 409 and per-record errors. Source UI receives its request callback from delivery. Deletion Requests consumes Personnel/Training/Rating Scheme approved effects; preserve effect-before-status ordering without claiming atomicity.

`/api/units` uses `personnel.manageUnits` against a `units` relation absent from the phase-06 local target; no maintained caller was found outside route/tests. Confirm effective schema/consumer status and remove the orphan route/policy if confirmed. Its name alone does not make it supported.

## 09: UI foundation

- **09-01 Primitive contract and internal cycles.** Prerequisite: phase-07 contract. Own `components.json`, `src/app.css` and generated button/input/select/dialog/alert-dialog/calendar/range-calendar/pagination families. Verify registry and actual source; remove circular barrel self-imports/competing styles at their owner. Preserve tokens/theme/accessibility. R5/R7; appropriate Svelte tooling, interaction tests and G/build. One foundation, no value cycle in the five identified families; no new framework.
- **09-02 Composition ownership and alias retirement.** After 09-01, inspect app-dialog/ConfirmDialog/combobox/multi-select/type-manager/type-workspace/type-management-workspace/onboarding-packet-list/calendar-status-badge and reverse imports. Move domain compositions to owners; finish alias-consumer migrations before deletion. Evaluate type-manager against retained behavior; keep justified primitive-based compositions. Expand by composition, preserve R6/R7 and keyboard/save/error behavior, run G. No aliases, lost contracts or parallel primitive system.

## 10: All-UI consumers

Prerequisite: phase 09 and each affected phase-08 module. Expand each packet into a bounded control/workflow seam. Own the matching M row's Svelte/components/styles and reverse consumers. Use canonical primitives, neutral shared compositions and owner-held domain UI; remove old custom primitive/CSS/control families and imports after all consumers move. Preserve R1–R7, accessibility, busy/error/empty behavior, responsive WEB flows and reviewed acquisition. Use meaningful component checks, available Svelte tooling, G/build and required computer-use evidence; unavailable checks are not passes. Native screens and future identity migration are not required.

- **10-01:** M03 shell, M01 auth/account/setup/MFA, root errors/suspension. Every current control classified and migrated or justified as semantic HTML.
- **10-02:** M04 Personnel list/detail/import/artifacts, Groups/ranks settings. No alternate dialog/field/table family; failed saves retain values.
- **10-03:** M05 Calendar month/long range, planner, bulk availability, catalog/settings/reports. No Duty UI; ordinary interactions and virtualized cells remain usable.
- **10-04:** M06 Dashboard and M07 Training matrix/types/views/reports/edit/import. Include every tab and lazy surface.
- **10-05:** M08 Critical Tasks library/person detail/matrix/reports and M10 Evals. Account for all filters/forms/status/report controls.
- **10-06:** M09 Onboarding templates/packet/history and M11 Sign-In Roster modal/upload/download. Owner-held compositions use primitives.
- **10-07:** M02 all settings, M13/M14 audit/export/notifications/feedback and M12 all admin pages/modals. Admin is not excluded.
- **10-08:** M17 home/about/security/privacy/terms and public components. Remove commercial/Duty claims; migrate relevant navigation/forms, retain semantic prose.
- **10-09:** Residual shared components and every native-control/custom-CSS candidate. Reconcile the entire tracked Svelte/import inventory with 10-01–08. No unclassified consumer, obsolete alias or second foundation; semantic-native decisions need behavioral reasons, not an allowlist.

## 11: Security / reliability

Expand against post-migration paths. Prerequisites: phase-02 safety tests, affected phase-08 module and parent ordering. Retain R1–R7, use G and defect-specific regressions; DB follows its isolated authorization. Remove the faulty implementation after complete repair, not a selectable alternative.

- **11-01 F01:** Invitation-origin approval/rescind, setup issuance/renewal and SQL transitions. Preserve independent approvals, existing accounts and sibling Organization grants. Define deliberate provenance/state rules; test clocks, concurrency and failures. A blocked invitation must not unintentionally retain revocable platform entry.
- **11-02 F02:** Manual assignment replacement (`daily-assignment-slots` and owner persistence). Prove atomic replacement with scope/constraint rechecks under concurrent writers and failed inserts; no missing/partial assignments. Retire compensating delete/insert only after real DB evidence.
- **11-03 F06:** Organization bootstrap. Faults at owner-email and every seed boundary need explicit recoverable outcomes; retry must not duplicate Organizations, owners or defaults. Existing adapter-error tests do not make logged partial success or fail-after-create desirable. Replace those paths after deliberate contract tests.
- **11-04 F03/F07:** CI triggers and local CSP. Validate actual PR workflow triggers without changing remote settings. Allow the correct local synthetic preview origin narrowly without loosening production CSP. Remove obsolete manual-only assurance and wrong-port assumptions.
- **11-05 F08/F09:** Mapping/error and state-lifecycle seams. Reproduce malformed-provider, raw-error and user/Organization-switch failures first. Fail safely, avoid credential/provider leakage, preserve optional-chrome degradation and SSR/request isolation. Remove casts/defaults only when behavior evidence justifies it.

## 12: Performance

Prerequisites: removed features and affected architecture/UI tasks. Preserve R1/R5/R6/R7. Expand measured bottlenecks into suffix tasks with actual workload and budget before fixes. G and comparable production-mode evidence are required. No inferred speed from fewer files or another framework; no security shortcut, silent truncation, inflated budget, forced server self-HTTP or hypothetical native benchmark.

- **12-01 M05 Calendar:** Date ranges, month/long range, availability/assignment interactions, query/coordinator/render state. Use documented small/representative/large synthetic Organizations. Separate server, payload, transferred JS, hydration/main-thread, request count and interaction metrics. Retain scope/stale-request protections; remove only measured redundant work.
- **12-02 M04 Personnel:** List/import/bootstrap, including `fetchPersonnelBootstrap`. Measure duplicate reads before replacing the redundant read with an authorized projection. Preserve lookup/sorting; record dataset, requests and list/filter/import timing.
- **12-03 M06 Dashboard:** Initial/deferred source/hydration timing and duplicate data. Compact authorized projections only when demonstrated; no stale/cross-scope cache or changed readiness meaning.
- **12-04 M07/M08/M12/M14:** Training/Critical Tasks reports, large admin list and workbook export. Separate query/aggregation, response size, browser work and optional export JS. Remove unbounded/eager work only with evidence; no hidden data loss or arbitrary chunk-budget change.

Original unavailable measurements and build-only diagnostics remain in [historical performance evidence](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/EVIDENCE.md#performance-evidence). Preserve their method and limitations. Choose realistic concrete sizes during authorized execution and repeat equivalent scenarios; source-audit estimates are not measured targets.

## 13: Final cleanup

- **13-01 Residual code/dependency/config sweep.** After 03–12, enumerate maintained source, package/lock/scripts/CI and ignored configuration NAMES. Remove orphan imports/exports, obsolete paths, removed-feature dependencies and schema consumers. Verify the optional OpenTelemetry warning rather than adding a dependency speculatively. R1–R8, G/build, graph and authorized active-catalog evidence; all M/UI rows complete and no removed-feature consumer/shim.
- **13-02 Current docs and historical artifacts.** After 13-01, remove obsolete billing/Duty/E2E plans and superseded instructions; update mixed current docs, links and environment guidance without weakening safety or rewriting applied migrations. Use `CONTEXT.md#language` for missing glossary references. Resolve tracked legacy-seed provenance without exposing data; replacement/removal needs its bounded data decision. Compact completed receipts and duplicate prose, retain current rationale, active obligations and necessary verification artifacts. Do not recreate an archive or mandatory work diary.
- **13-03 Residual retained-test audit.** After 13-01/02, finish the broad assertion review transferred from 02-04-04 across current feature/lib/route/tests. Inspect toolbar density/class/layout/snapshots, getters/mock delegation, production-derived expectations and residual source/prose detectors. Assign actual paths/assertion dispositions; delete weak cases or replace only demonstrated missing retained protection and owned unused helpers. R1–R7, Testing strategy and G. Every candidate resolved; authorization/import/secret-boundary/RLS controls remain. No deferral beyond phase 14.

**13-01 catalog obligation:** Classify/remove or repair unused effective `public.is_full_editor_for_org(uuid)`, whose body references absent legacy membership columns. No retained source/body caller was found; invocation validity remains UNVERIFIED. Preserve current capability/Group access. Resolve before phase 14; see [retained operations and consumers](phase-04/catalog-inventory.md#retained-operations-and-consumers). This is noncommercial work, not an unfinished billing dependency.

## 14: Independent audit

- **14-01 Independent retained-contract and boundary review.** After 13-01–03, an independent reviewer checks the integrated source, schema and complete M/UI inventories against R1–R8, current acquisition/auth/RLS, Calendar retention, ownership and actual primitives. Reproduce required checks and inspect negative fixtures/call graphs. No prose-only or implementation self-report acceptance; missing current evidence is not waived. No runtime repair in an audit invocation.
- **14-02 Resolve audit findings.** Scope one suffix task per evidenced finding after 14-01 and explicit repair authorization. Correct the full failed boundary, remove its superseded implementation and verify relevant regressions/G/DB/build. Independently recheck all blocking findings; no generic cleanup bundle or hidden deferral.

## 15: Release handoff

- **15-01 Reproducible release candidate evidence.** After phase 14, record actual candidate, complete canonical verification/build, synthetic fresh/upgrade SQL, retained computer-use flows and comparable performance. Preserve R1–R8 and exact provenance/limitations. Reuse valid records; remove stale baseline-as-current assertions without inventing passes or repeating unchanged work solely to write its result.
- **15-02 Human-operated rollout/recovery handoff.** After 15-01, finish [RELEASE](RELEASE.md): app/schema ordering, backup/recovery, explicit destructive objects, retained-data checks, rollback compatibility and unresolved row-disposition blockers. Current identity/contract ownership is referenced, not a Clerk/native roadmap. R5/R6/R8. Commands are for separately authorized owner execution; no deployment, remote/provider/payment action or automatic publication. Unknown destructive facts block their specific steps.

## Next executable task

Following this maintenance PR's merge, use the normal driver for **D03 #1337 / 07-03**, after checking the actual current repository/PR state. Do not rerun D02, reopen accepted phases to reproduce paperwork, or mistake this documentation cleanup for the Personnel pilot or phase closeout.
