# D28 Personnel, Group and self-pin persistence

This intermediate #1376 deliverable replaces generic Personnel/Group/pin persistence with four owned interfaces and migrates every current direct and reverse caller. Supported user behavior, permissions, historical values and partial effects remain the contract. Candidate acceptance is in progress; no merge or final native pass is claimed here.

## Scope and retained behavior

`PersonnelRosterReader` supplies admitted lists and archive counts. `PersonnelRecordPersistence` supplies records, slug references, import/backfill, lifecycle and metadata. `GroupPersistence` supplies catalog/reference/name reads and Group writes. `SelfPinPersistence` captures the current member and Organization for names, toggle and ordered replacement. Operations consume narrow method selections. Providers capture the ordinary request client, canonical Organization and copied read scope. Existing independently admitted Calendar, Training, ICT, Onboarding and Rating roster authorities remain separate.

The complete caller wave includes record CRUD/import/backfill, lifecycle and approval, roster/detail/workspace, ranks, sensitive-sheet/award/artifact/export metadata, Calendar, Training, ICT, Onboarding, Dashboard, Settings and Sign-in. Delivery retains unchanged neighboring row-family providers. Organization's existing settings reader owns contributor-label lookup. Concurrent workspace reads remain concurrent.

The Personnel and Group entities, their replaced mapping test, the generic batch context and unused record-based scope callback are removed. Global Entity/DataStore/query facades remain for their still-consumed Training, Onboarding and settings paths. No new migration, transaction, raw-mode flag, compatibility fallback or broader privilege is introduced.

Preserved contracts include complete stable pages/counts, nullable dates and Group joins, ordinary detail/history reads, scoped lists/import/backfill, named slug conflict metadata and bounded allocation, uncertain acknowledgements without automatic resubmission, nonjoined date-backfill acknowledgements, archive acknowledgement and cascade ordering, and self-pin delete followed by ordered insertion with its retained partial failure. Rank summaries continue counting all existing Person statuses.

## Baseline and affected verification

The [closed Personnel baseline and UI repair](d28-personnel-ui-repair.md) preserve their actual versions and observations. Group/pin implementations at private `52a8a036` match accepted main `15f6787b` before this cutover. Their native baseline passes remain unchanged-app proof. The two historical UI ISSUES and second-tab UNRUN are retained; #1552 separately accepts the repaired detail/editor/shared-session behavior. None is relabeled as a fresh persistence pass.

New SDK tests pass four suites and fourteen tests. Existing operation/detail/purpose-roster checks pass twelve suites and 168 tests; after a redundant parse removal only the affected 32-case record suite repeats and passes. Seven reverse-query suites pass 83 tests. Root composition exposes genuine integration gaps before repair; the failing detail/artifact suites and affected request tests pass afterward. Ten unaffected root suites retain their original passing proof. Two Calendar/Dashboard composition suites pass five tests, and the ICT request composition passes both cases. Toolkit controls pass 43 checks. Types report zero errors/warnings; changed lint/format pass. Governance passes with 157 retained findings and zero new regressions.

Initial fixture count-header omission, missing-provider import during incomplete integration, root composition failures, initial type errors and rejected test-support dependency shapes remain failed observations in the work record. They do not establish product regressions. The final source/behavior acceptance must cover their actual corrections. Two deliberate provider faults fail their specified checks before original bytes are restored.

Final native selection covers normal roster/scope, Group CRUD/retry/unassignment, self-pin persistence/recovery and one real held response through B, Person CRUD/date/null/slug, small import/backfill, lifecycle, shared Onboarding Add Person and representative reverse reads/workbook. Dense page/slug/uncertain-write/pin replacement cases remain lower-boundary proof. Unchanged #1552 UI behavior and undispatched pin-failure isolation retain matching historical evidence. This is a bounded affected selection, not another full historical matrix. Any repair repeats its failing case and justified adjacent behavior under the [verification contract](../../architecture/DEFINITION_OF_DONE.md#verification-after-a-fix).

Native execution, complete independent source/comment/behavior acceptance, CodeRabbit, packaged durable artifacts and exact-head CI/build remain pending. Source proof alone does not establish UI persistence, hosted RLS or deployment parity. No database migration checks are indicated because SQL is unchanged.

## Remaining D28 work

Training retains eight failing lower-boundary cases and twelve unrun native families. Onboarding, residual settings and final generic facade removal follow their current owned designs and affected verification. Final integrated acceptance still owns complete consumer/removal and retained security/provider evidence. #1376 stays open; D29/D30 and other issues remain outside this continuation.

The preserved private Calendar, Personnel and Training worktrees remain clean at `67fa5713`, `52a8a036` and `7d6c0a5c`. A new isolated Personnel source tree supplies the owned implementation; current-main integration never adopts their inherited Calendar patches blindly. No remote database is accessed and no existing local database is reset.
