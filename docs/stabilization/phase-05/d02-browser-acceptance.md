# D02 extended browser acceptance

[PR #1322](https://github.com/waffleflopper/trooptotask/pull/1322) merged as `2f65b2f449f1bf782efccc2c8135b44be5976732`. Its original browser review **failed**; subsequent N1/N2 repairs restored bounded local acceptance. This summary preserves those distinct outcomes, not production certification. [Original review](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/phase-05/d02-browser-acceptance.md) and [final repair receipt](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/phase-05/d02-calendar-navigation-repair.md) retain the detailed scenarios, commands, diagnostics and observations.

## Original findings and disposition

The September 22 review compared base `5c0662bbd37a5df478b634f72a0e4d7bef3c9e8e` with head `3a0598439a6a9d8f7e01b1f8edceecec97ffe3f6`. Source comparison established preexisting defects; no separate baseline browser run was claimed.

- **N1, repaired:** December month → quarter → Today → month returned to December. Quarter navigation now updates the owning Calendar date used by rendering, range loads, persistence and exports.
- **N2, repaired:** stale bootstrap or far-month planner navigation displayed saved slots as editable vacancies. The planner now loads the visible month through the scoped range coordinator, rejects stale responses and guards edits during unloaded/error states. An intermediate repair still requested `/org/undefined/api/calendar-range`; the connected route regression and shell-Organization mapping correction precede the final successful rerun.
- **N3, unresolved:** a search for `NoSuchPerson` on the populated Calendar says “No personnel added yet.” Empty accessible roster and zero filter matches still need distinct recovery states. This was outside the two authorized blocking repairs; compaction does not resolve it.

## Environment and retained-flow evidence

Testing used Linux T3 in-app Chromium 152 / Electron 44.4.2, Anchorage timezone, 1280×800 and 390×844 views, ordinary login and production builds. The disposable provider used API/database ports 61321/61322 with disabled legacy seeds and 136 immutable migrations through `20260922000200`. Existing local and remote databases were untouched. No runtime bypass or repository E2E suite was used.

The synthetic fixture had 48 active personnel plus an archived person, four Groups, 319 saved assignments, nine availability entries, seven assignment types, five statuses, 96 Training records, retained Duty lineage and foreign-Organization controls. Original broad checks used owner, organization-wide operator, scoped editor, scoped viewer and foreign owner; the final repair rerun used owner/editor/viewer.

The broad run established Calendar assignment and Group changes, Availability validation/persistence, bulk status review/removal, CSV rejection/mapping, configuration CRUD, five independently calculated report results, scope-denied writes and foreign-Organization access denial. Its report values apply to their recorded checkpoint, not later role-test mutations. All 64 public tables were compared: 60 unchanged, four with explicitly intended changes. Full details and exact report expectations remain in the committed original receipt.

Final repair repetition established Today, Previous/Next and year-picker date ownership; cold and far-month saved-slot loading; 23 December Quick Fill rows and confirmed Clear All; scoped editing and reload; hidden-slot rejection with safe 409; and viewer route denial. The final repair fixture returned to its complete non-audit baseline, including all 319 original assignments, nine availability rows, 14 then-retained Duty tables and foreign-Organization data; 11 expected append-only audit entries remained. Both disposable runs cleaned up their owned resources.

## Final verification and limits

The repair receipt records all seven canonical commands passing, zero Svelte/type diagnostics and 544 files / 4,872 tests. Node 24.18.0 and npm 11.12.1 were used; Supabase CLI 2.101.0 / PostgreSQL 17.6 supplied the fixture. Existing chunk-size and optional `@opentelemetry/api` build warnings remained. Non-build checks used unreachable synthetic provider values; the browser build used only the isolated provider. Exact non-secret overrides and production preview origin are in the committed repair receipt.

Earlier fixture typing/origin-wrapper failures, the intermediate route 404 and initially overconfident review are superseded only by the recorded corrections and final rerun. Login-transition, locator, logout-rate-limit and snapshot-timing diagnostics did not count as successful actions. Original N1/N2 failures remain historical failures, not retroactive passes.

Exports/native save dialogs were excluded at Robert's request. Final browser transport-fault injection, Safari/physical-device behavior, offline/reconnect, comparative performance and production capacity were not verified. Error/retry and stale-response races have lower-level regression coverage. N3 and required later release-flow evidence remain open. Hosted Actions was disabled/unavailable; Vercel/local checks do not certify production.

Historical `/tmp` directories and browser screenshot paths in the receipts are run locations, not durable raw artifacts. The committed receipts preserve observations and limitations; this maintenance did not recover or independently revalidate their screenshots or snapshots. Hosted release requirements remain in [RELEASE](../RELEASE.md#phase-05-d02-merged-implementation-boundary).
