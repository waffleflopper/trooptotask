# Bulk status changes

A Calendar operator applies a status to selected people, imports reviewed rows, or removes matching entries with clear partial results and whole-entry warnings.

## Sub-features

- `bulk-add`: select allowed People, status, inclusive dates and note; review, apply and reread only the selected rows.
- `bulk-import-review`: invalid dates, missing or ambiguous names are explained before saving; valid selected rows show a completed result until Done.
- `bulk-remove`: review a partial overlap, back out without change, or confirm deletion of the whole saved entry.
- `bulk-partial`: if the second of two chunks fails, the first 500 remain saved, one Person remains selected, and the result says 500 of 501.

## How to get to it (user POV)

From `Calendar`, choose `Bulk Status`. Its Add, Remove and Import tabs lead to `Review & Confirm`, `Review Matching Entries`, or `Parse`/`Next` respectively. The operator must have Calendar operate and Organization scope for the selected people; the Import tab accepts pasted CSV. The seeded Able/Baker/Unassigned records belong to A, while Foreign belongs to B.

## Driving it with verify:app

Preconditions: doctor passes; `$V actor calendarOperate calendar/bulk` returns `PAGE`; `$V fixture` supplies `orgA`, `personA`, `personB`, `statusLeave`, `statusTraining`, and `dates.later/ui`. Use a unique note per mutation, capture the tab and selected Person names before confirmation, and keep helper-created rows marked for `clean-seeds`.

1. **Add:** In the Add tab, confirm Able and Baker plus `Verification Leave` are offered and Foreign is absent. Select Able and Baker, choose Leave, October 14, 2026 for start/end, and fill a unique note. `Review & Confirm` must show exactly those two People, type, dates and note before `Confirm Apply`. Capture the request/status, result, `$V rows availability_entries orgA note "$NOTE"` with exactly those two Person IDs and fields, then reload and reread. An authenticated later batch aimed at `personForeign` must be denied, save no marked row, and leave the earlier two intact. Remove only these newly created entries when done; the March historical entry stays.
2. **Invalid import:** In Import, paste `Last name,First name,Start date,End date,Status` with one `Missing,Synthetic` row and one Able row whose end precedes start. Click `Parse`; capture `Person not found`, `End date must be on or after start date`, the selected count, and a before/after readback showing no new entries for either unique note. Run `$V seed duplicate-able`, reload Import, paste an unranked Able row and Parse; expect `Multiple people with this name` and guidance to add Rank. Confirm no row saved, then run `$V clean-seeds`. A conflicting Rank for an otherwise unique name is a reviewable warning, not automatic rejection; exercise it separately when that path is affected.
3. **Valid import:** Paste one Able/`Verification Leave`/October 14 row with a unique note, Parse, and confirm `1 of 1 rows selected`. Click `Next`; keep the completion screen open and capture `Import complete`, `1 status entry imported successfully`, and the request `200` before choosing `Done`. Read back one entry for Able, Leave, that date and note; after Done and reload it remains. Capture the completion screen and second read, then remove only this created row.
4. **Removal:** In Remove, select `Verification Training`, Baker, and today's date. `Review Matching Entries` must warn that `1 partial overlap will also be removed entirely`, identify Baker, and say nothing is removed until confirmation. The seeded Baker entry spanning yesterday through tomorrow must still exist. Click `Back` and confirm it still exists. For a confirmed deletion without consuming that seed, run `$V seed overlap`, choose Able/Leave/today, review the same whole-entry warning, then `Confirm Removal`; the temporary overlap row disappears after reload while the historical March and Baker rows remain. `clean-seeds` removes only any helper residue.
5. **Partial second chunk:** Run `$V seed bulk-501`, then search the returned `MapChunk` names by appending the returned tag directly, without angle brackets, and choose `Select shown` in Add. Confirm `501 of 501 selected`; choose Leave, today's one-day range and a unique note, then Review. Arm `$V network arm-fail $PAGE availability/batch 2` immediately before `Confirm Apply`. Capture `$V network state $PAGE`: first request has 500 records and `200`, second has one and synthetic `503`, both carry the chosen note. The UI must report `Applied status to 500 of 501 people` and keep the one failed Person selected. `rows` after reload must show exactly 500 entries tied to the first 500 request IDs, none tied to the failed ID. Restore with `$V network restore $PAGE`, then `$V clean-seeds`, including after a failed iteration.

## Gotchas

- Add/Remove/Import are distinct user paths. A direct authenticated batch request can check server effects but does not demonstrate the tab's review and feedback.
- An import preview error is not enough to prove no save; compare rows before and after using the attempted unique note. Keep the completed import result visible for evidence before clicking Done.
- The partial-chunk control must see two actual batch calls. Check `network state`; if the second call never occurred, record the path as unreachable or failed rather than crediting a generic error toast. The 501 temporary People can make the roster slow; clean only the helper-owned IDs after proof.
