# D29 shared homes

This closing [#1377](https://github.com/waffleflopper/trooptotask/issues/1377) deliverable finishes the mixed-owner utility, model and validator work that waited for D28. The shared-UI cycle and accessibility outcome is already integrated through [#1529](https://github.com/waffleflopper/trooptotask/pull/1529) and [#1533](https://github.com/waffleflopper/trooptotask/pull/1533); its [receipt](d29-ui-contracts.md) remains the evidence for those five families and is not repeated here.

## Reconciliation and scope

D28 [#1573](https://github.com/waffleflopper/trooptotask/pull/1573) merges at `6e458162` from approved head `3422104f`, with green exact-head Depot application and database checks, and closes #1376. Its merged tree equals that head. A read-only census at `ad0cea51`, refreshed against PR head `3740fe6f` and again against the merge, found no change to the D29 contracts: Personnel still exports the same rank catalog, the counseling and roster writers still pass their own scope literals to `sensitiveFiles`, and `calendarScope` only lost an unused filter helper. The candidate branches from current main `303058d2`, which adds Dashboard-only #1574.

Shared and Web UI files imported no product owner before this change, and no shared file cycle remained. The remaining debt was false shared homes, duplicate definitions and two mixed-owner manifest entries:

| Path or concern                 | Disposition                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/types.ts`              | Deleted. Its Organization member/invitation types had no consumers. `ARMY_RANKS`/`ALL_RANKS` repeated Personnel's catalog: Personnel now exports `BUILT_IN_ARMY_RANK_OPTIONS` (the same 28 codes in the same order), Rating Scheme maps OER/WOER from the catalog's exact Army officer and warrant codes, and delivery supplies the list to Identity's profile parser on the account page and invite finalization. |
| `lib/utils/columnMapping.ts`    | Keeps neutral mapping algorithms. Calendar's `STATUS_IMPORT_COLUMNS` joins `availabilityImport`, like the other importers' column definitions.                                                                                                                                                                                                                                                                     |
| `lib/domain/readinessRollup.ts` | Moves to Critical Tasks, its only consumer.                                                                                                                                                                                                                                                                                                                                                                        |
| Two `downloadBlob` functions    | One `lib/utils/downloadBlob.ts`. It removes the anchor even when click throws and revokes the URL after the click task. Settings exports and Archives previously revoked synchronously; this is the only intended behavior change.                                                                                                                                                                                 |
| `lib/storage/sensitiveFiles.ts` | The path builder accepts the owner's scope segment instead of naming both product scopes; it leaves the mixed list. Path format, bucket and storage policies are unchanged.                                                                                                                                                                                                                                        |
| Calendar files in `lib`         | GroupHeader, policy, scope and timing move into Calendar. The status-days route calls Calendar's new `fetchCalendarStatusDaysReport` instead of its policy/scope internals. The delivery-shaped bootstrap test moves beside the Calendar route.                                                                                                                                                                    |
| Identity leaves in `lib/server` | `publicAppOrigin` and `userEmailIdentities` move into Identity.                                                                                                                                                                                                                                                                                                                                                    |
| Orphans and duplicates          | `BrandMark.svelte` (replaced by `BrandWordmark` in D02) and the shared `DatePickerInputStub` copy are deleted; the Calendar-only load-range stub moves to Calendar test-support.                                                                                                                                                                                                                                   |
| Web UI surfaces                 | The theme store and `app.css` become Web UI public files; `lib/utils.ts` (Tailwind `cn`) moves from Shared Utilities to Web UI; `VisibleStub` and `chartLayout` become declared test support, so a production import is still reported.                                                                                                                                                                            |

Excluded with their owners: `lib/components/{auth,admin,public}` (10-01, 10-07, 10-08), store-core barrel pruning and unused exports (13-01), `ui/calendar-status-badge` (09-02), delivery files under `lib/server/**` and the whole-app owner cycle (D30), and UI primitive redesign (Phase 09).

Governance at `303058d2` reports 139 findings, 18 of them D29 (two mixed-owner entries and 16 private Web UI imports). The candidate reports 116 and none for M16, Web UI or Shared targets; `mixedFiles` is empty. No allowance, exception or skipped check is added.

## Verification selection

The selection covers each changed runtime path, not one browser case per moved file. Pure moves of policy, scope, timing and pure modules rely on lower-level checks plus one Calendar access pass.

- **Pins before the move.** Literal tests on the unchanged code cover the 28-code profile list and its validation, evaluation type by rank with exact matching, and the Sign-in Roster fallback list. All pass before and after the move. A later independent review found that the evaluation pin had overwritten the existing Rating Scheme cases; `47b9435a` restores all 13 alongside the new ones.
- **New recipe coverage.** [Sign in](../../../.agents/skills/verify-trooptotask/features/sign-in.md) step 6 adds the account profile rank; [Personnel lifecycle](../../../.agents/skills/verify-trooptotask/features/personnel-records-lifecycle.md) step 9 adds the Archives records export, one of the two former synchronous-revoke consumers.
- **Live cases (baseline and final):** account profile rank; Evals type for seeded Officer/Warrant/NCO; Sign-in Roster create, signed scan path/bytes and delete; counseling PDF failure, retry path/bytes and removal; Bulk Status invalid, ambiguous and valid import; Settings JSON/Excel export, Archives records export and Training report workbook; Calendar scoped reads and denied single/batch/foreign writes.

## Unchanged baseline

Frozen `1466dac0` (application code identical to `303058d2`), digest `ca6c4827…`, worker 1, Chromium 152.0.7977.82, 2026-10-07 21:24–22:03 AKDT. All cases pass. The coordinator re-read the rank-option snapshot, the signed-scan SHA-256 against the stored object and both workbooks' sheet lists.

- ISSUE: the viewer profile starts without a rank, and the form cannot clear one, so the saved SFC remained until owned cleanup. The recipe now says so (`6ca044ee`).
- UNRUN: counseling cards offer no Open action; stored bytes are checked through the owned provider instead.

Archive: [d29-shared-homes-baseline-1466dac0.tar.gz](d29-shared-homes-baseline-1466dac0.tar.gz), 185 payloads, SHA-256 `e86da68b50f799e69f29756d0443457165f879649cd1163b3e29b052089ec073`.

## Final candidate

Frozen `6ca044ee`, the complete source candidate (later commits add only this record and its archives), digest `fc9a91d5…`, worker 1, Chromium 152.0.7977.82, 2026-10-07 22:05–22:41 AKDT. Every case matches the baseline:

- The profile offers the same 28 ranks in the same order and saves and reloads SFC. Evals selects OER, WOER and NCOER for the seeded Officer, Warrant and NCO, and Cancel leaves all nine entry rows unchanged.
- Roster scans and counseling PDFs are stored at the same `<org>/sign-in-rosters/<roster>/…` and `<org>/counseling-records/<person>/…` paths in the private `counseling-files` bucket, with matching SHA-256. The forced counseling 503 keeps the draft and saves nothing; removal deletes rows and objects.
- Bulk import reports the same three row errors and saves one valid row.
- With the deferred revoke, the Settings JSON (42 keys / 38 sections) and Excel (57 sheets, 38 inventory rows) downloads, two completed lifecycle rows, the Archives records workbook and the Training report workbook are all correct. The Training workbook is cell-for-cell identical to the baseline; the Archives workbook matches once the seed tag is normalized.
- Calendar scoped reads and all six denied single/batch/foreign write pairs return the baseline statuses and bodies with no saved rows.

Two ISSUE observations are not regressions. The roster Group chips (Bravo before Alpha) and two assignment badges in one Calendar cell appear in the opposite order from the baseline. Fixture UUIDs are regenerated per launch, and in both runs the lower UUID sorts first among otherwise tied rows (baseline Alpha `36f5…` < Bravo `6c5e…`; final Alpha `d11e…` > Bravo `73e0…`). The candidate changes only import paths in those components and reads. The counseling Open step stays UNRUN for the same reason as the baseline.

Archive: [d29-shared-homes-final-6ca044ee.tar.gz](d29-shared-homes-final-6ca044ee.tar.gz), 198 payloads, SHA-256 `a99a72e7044c3b49947408957b43abc7a8afb047ca67e50b8e0b746d8ac4be77`.

## Lower-level checks and review

On the tree of `4a965029` (identical to the checked tree): format, lint (0 errors; three pre-existing warnings in untouched files), governance, types (0/0) and the production build with CI's synthetic environment pass. The full suite passes 7,263 of 7,264 tests. The real-repository boundary test timed out at 6.3 s against its 5 s limit at load average 17 while the baseline app ran; it passes alone in 3.4 s. CI owns the clean full-suite result. After `47b9435a`, the restored Rating Scheme file passes 28 tests. A test-count comparison against the base reports only `workbook.test.ts` 6 → 5, whose download case moved to `downloadBlob.test.ts` (2 cases).

CodeRabbit CLI reviews all 68 committed files at `4a965029` against `303058d2` and reports zero findings. Independent GPT-6.1-Sol source acceptance finds the overwritten Rating Scheme cases (fixed above) and no runtime regression or missed consumer: rank order and exact matching, both parser callers, status-days behavior and audit, the deferred revoke and the manifest classifications are confirmed.

Independent expanded-artifact acceptance of both archives and the changed material since `4a965029` is pending.

## Verify the archives

```bash
mkdir -p .verification
D29_DIR=$(mktemp -d .verification/d29-shared-homes.XXXXXX)
for archive in docs/stabilization/phase-08/d29-shared-homes-*.tar.gz; do
	sha256sum "$archive"
	tar -xzf "$archive" -C "$D29_DIR"
done
for run in "$D29_DIR"/*/; do (cd "$run" && sha256sum --quiet -c INVENTORY.sha256); done
```
