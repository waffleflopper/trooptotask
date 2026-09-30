# D12 Personnel CSV creation and date backfill

Intermediate scope for [#1360](https://github.com/waffleflopper/trooptotask/issues/1360), from accepted main `480e1e5142beb3b3a3667b6f956cef78a99a70d6`. This is preparation and baseline work, not final acceptance.

## Scope and retained behavior

Own CSV creation and ETS/DEROS backfill with both delivery callers, portable input/results, tests and Personnel column definitions. Remove replaced central implementations without facades. Keep maximum 500 rows, request-relative error indices, active rank validation for creation, catalog/legacy rank matching for backfill, Group permissions and unknown-Group handling, literal valid dates, blank-date preservation, active-only matching and stable IDs/references. Backfill does not merge identities. Healthy creation remains one bulk insert; ordinary request-user reads remain scoped.

Restore scoped Import for operate/configure separately from the configure-only single-record Add Person action. Explicit empty scope and missing capability remain denied. Reuse prior import correction and matching evidence only for unchanged behavior, with fresh proof of affected entry, failure, persistence and replay.

The implementation decision for repeated backfill rows is sequential file order against acknowledged dates: equal values skip, blank fields preserve the latest acknowledged value and later supplied dates apply afterward. This is stated explicitly as a routine consistency choice, not a historical live observation or a previously specified winner contract. No extra provider read or concurrent write is needed.

## Baseline preparation and observations

Application source is unchanged from `480e1e51`. Additive preparation supplies `personnelScopedOperate` (Personnel operate, Alpha only, every other lane absent) and affected instructions in the maintained [lifecycle recipe](../../../.agents/skills/verify-trooptotask/features/personnel-records-lifecycle.md).

The real policy/context regression cases expect scoped operate/configure Import while operate still lacks Add Person. Before repair, the focused suite fails both nonempty permitted-scope cases and passes the other 39 tests, including explicit empty/view denial. This proves an affordance defect at its cheapest stable boundary; native entry proof is pending.

Source tracing identifies three hypotheses requiring separate reproduction: bulk creation reads only visible slugs and inserts once, so a hidden canonical collision may reject the bulk; sequential date updates may persist earlier rows before a later provider failure loses their response; a real provider returns fresh rows while the in-memory store mutates the initial matching snapshot. These are not claimed as observed provider/UI failures yet. Browser pre-request 503 evidence cannot establish a provider failure after partial persistence.

## Acceptance and remainder

Final repaired live proof, focused/security/replay checks, complete Definition of Done checks, proportional bot review and independent full-diff/source-artifact acceptance remain pending. No independent live execution, production parity or remote provider setting is claimed. No migration is planned; a new migration would stop for Robert's manual operation. Existing Vercel Git deployment settings remain external.

Lifecycle/archive/restore/approved deletion, remaining detail/header/readiness/bootstrap consumers/removals, affected Organization/shared-tab response ordering, exports and final integrated whole-issue acceptance remain with #1360. D15 PersonnelOnboarding ownership and other issues/phases remain separate.
