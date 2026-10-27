# Manage the rank catalog

An Organization owner or admin turns ranks on and off, adds branch packs and custom ranks, renames custom ranks and
removes unused ones; no other member can change the catalog. Setup's Ranks step shows the same editor.

## Sub-features

- `rank-board`: `Your ranks` heads the page with `N on · N off · N custom` and an On/Off legend, then one tab per added
  branch reading `X of Y on`, each tab split into Officer, Warrant, Enlisted and Civilian blocks, then a Custom block.
  Every rank is a chip showing its code and pay grade.
- `rank-toggle`: a chip is a toggle button (`aria-pressed`) named by the rank's label. Pressing it turns the rank on or
  off at once and saves it; a failure puts the chip back and shows the reason under its block. When several presses
  overlap, the last one wins. Leaving the page cancels unsent changes and ignores late responses.
- `rank-bulk`: each block's `Turn all on` and `Turn all off` (named `Turn all <block> ranks on|off`) change every rank
  of the block in one write. A note under the block reads `Turned on|off N <block> ranks.`, names each held rank it
  turned off with its count, and `Undo` restores each rank's exact previous state.
- `rank-in-use`: turning off one rank people hold shows a note with `Undo`, for example
  `SPC is off. 3 people keep it on their records. New picks and imports won't offer it.` Their records keep the rank.
- `rank-branch`: `+ Add a branch` lists the branches not yet added with their rank counts; choosing one adds its ranks
  and opens its tab. A branch's built-in ranks missing from the catalog show as off chips; turning one on adds it.
- `rank-history`: built-in ranks only old records use, such as SP4, sit in their category tagged `History` and are named
  `<label> (history)`.
- `rank-create`: `+ Custom rank` opens the names editor with a `New custom rank` draft focused on Code; a new rank is
  Custom and on.
- `rank-names`: `Edit names` (`aria-expanded`) lists every rank the Organization added with grade and use, including one
  filed under a branch such as Army, which also shows as that branch's chip; a rank's button opens its editor with
  Label, Category, Pay grade and Tie-break. Saving names never changes whether a rank is on. The code stays fixed.
  `Remove` deletes an unreferenced custom rank after a destructive confirmation.
- `rank-failure`: a failed or rejected save shows its error, keeps every entered value and changes no chip.
- `rank-denied`: a member without Organization owner/admin access cannot reach the catalog or change a rank.

## How to get to it (user POV)

Sign in as an Organization owner or admin, choose `Settings`, then `Ranks`. The board sits under a 2px rule. The branch
tab row holds the tabs, `+ Add a branch` while a branch remains to add, and `Select a rank to turn it on or off.` when
the editor is wide enough. Each category block has its heading, `X of Y on` and the two Turn all links; on a narrow
editor the links take their own line. The Custom block reads `N ranks · your Organization only` with `Edit names` and
`+ Custom rank`. Personnel's Add Person and Edit forms read the on ranks through their Rank select.

## Driving it with verify:app

Record each step PASS, FAIL, UNAVAILABLE or UNRUN with the width and theme.

Preconditions: `$V fixture` gives A's `rankCatalog.activeA` (`VFY-ACTIVE-A`), `retiredA` (`VFY-RETIRED-A`) and B's
`activeB` (`VFY-ONLY-B`) with IDs; preserve `$V rows organization_rank_catalog orgA` and `orgB` readbacks first and
compare them at the end. Do not remove or rename a seeded rank. Turn PFC/SPC/SGT off only to read a note, then Undo.
Create `MAP-<tag>` ranks for names work. Do not turn on a missing Army rank or add a branch on A unless the step needs
it, because a built-in rank once in the catalog stays there. Use `$V actor orgOwner settings/general` (the actor
destinations do not include `settings/ranks`), then open Ranks from the settings nav or navigate to `settings/ranks`.
`$V rows organization_rank_catalog orgA` takes no `code` filter: read it unfiltered and select by `code`; a retired row
is a rank turned off. For failure steps arm `$V network arm-fail PAGE settings/ranks/ACTION` with `setRankStates`,
`saveRank`, `deleteRank` or `addServicePack`; each returns a SvelteKit failure envelope with `rankError` and never
reaches the provider. Use `arm-hold` and `release` to hold one. Restore every control. Dark mode is
`localStorage.theme = 'dark'` and a reload; the app reads `data-theme`, not the `dark` class.

1. **Entry and states.** Open Settings → Ranks on A. Require `4 on · 26 off · 2 custom`, one `Army 3 of 28 on` tab and
   no Civilian tab. Officer reads `0 of 10 on`, Warrant `0 of 5 on`, Enlisted `3 of 13 on` with PFC, SPC and SGT
   pressed; Custom reads `2 ranks · your Organization only` with `VFY-ACTIVE-A` pressed and `VFY-RETIRED-A` not. Read
   `$V rows organization_rank_catalog orgA`: active rows match the on count. An on chip is filled with a check; an off
   chip is dashed with no fill. Capture 1440 light and dark, 1024 and 390. At 1024 and 390 the document's `scrollWidth`
   equals its `clientWidth`; the tab row may scroll inside itself and nothing else passes the body's right edge.
2. **Toggle and reload.** Press `Sergeant`: `aria-pressed` is `false` at once, Enlisted reads `2 of 13 on` and the head
   `3 on`. Reload: still off. Press it again and reload: on, back to `4 on`. Arm `arm-fail ... setRankStates` and press
   `Sergeant`: the chip returns to pressed and an alert under Enlisted shows the failure. Restore.
3. **In use.** Press `Specialist` off: the Enlisted note reads
   `SPC is off. 3 people keep it on their records. New picks and imports won't offer it.` with `Undo`, and the row is
   retired in `$V rows`. Press `Undo` before any reload: SPC is pressed again and stays on after reload.
4. **Turn all and Undo.** On a unit created with Army in Setup (every rank on), press `CW5` off, then
   `Turn all Warrant ranks off`: the note reads `Turned off 4 Warrant ranks.` (only the ranks that moved) and Warrant
   reads `0 of 5 on` after reload. Press `Turn all Warrant ranks on`, press `CW5` off, `Turn all Warrant ranks off`
   again, then `Undo` before reloading: CW5 stays off and the other four return on, and that holds after reload. On A,
   `Turn all Enlisted ranks off` lists each held code with its count, for example `SPC (3 people)`; Undo it.
5. **Add a branch.** Press `+ Add a branch`: the menu lists each branch A lacks with its rank count. Arm
   `arm-fail ... addServicePack`, choose one: an alert under the tab row, no new tab. Restore and choose it again: its
   tab opens with every rank on. A branch cannot be removed; restart the owned worker before relying on the original
   catalog.
6. **History.** On a unit created with Army in Setup, the Enlisted block shows `SP4` tagged `History`, named
   `Specialist Four (history)`, and it toggles like any rank.
7. **Create and failed create.** Press `+ Custom rank`: `Edit names` is expanded, the first row is `New custom rank`
   with focus on Code, and `+ Custom rank` is disabled while the draft is open. Enter Code `MAP-<tag>`, Label
   `Map Rank <tag>`, a Category, Pay grade and Tie-break `500`. Arm `arm-fail ... saveRank`, press `Add rank`: the
   destructive alert, every entered value still in its field, the draft still open, and no `MAP-<tag>` in `$V rows`.
   Restore and press `Add rank`: the toast `Rank catalog updated.`, the draft closes, and a pressed `MAP-<tag>` chip
   shows in Custom after reload. A duplicate code shows the server message on Code (`aria-invalid`). Escape in the draft
   discards it and focus returns to `+ Custom rank`.
8. **Edit names.** In `Edit names`, press `MAP-<tag>`: `aria-expanded` is `true`, focus is on Label, no Code field.
   Change Label and save: the toast, the editor stays open with the saved values and the chip's name changes after
   reload. Hold `saveRank` with `arm-hold`: Save and Remove are disabled while every chip and Turn all link stays
   enabled. Turn the rank off before releasing, then release and reload. Its new name persists and its chip stays off.
   Escape or Cancel closes without a request and returns focus to the row.
9. **Remove.** In `MAP-<tag>`'s editor press Remove: the confirmation `Remove MAP-<tag>` says it cannot be undone.
   Cancel changes nothing. Arm `arm-fail ... deleteRank`, confirm: the dialog stays open with its Alert. Restore and
   confirm: the chip and the `$V rows` row are gone.
10. **Denied access and no effect.** Sign in as `orgMember` and as `manager` and open `settings/ranks`: record the
    screen, HTTP status and that no rank data appears. From the same page `fetch` a POST to
    `<ORG_URL>/settings/ranks?/setRankStates` with `code=VFY-ACTIVE-A`, `state=retired` and the `x-sveltekit-action`
    header; require a non-success result and `$V rows` still active. The `View only` alert with disabled chips and no
    Turn all, branch or names controls is reachable only for a member who passes the Settings layout but is not owner or
    admin; record UNAVAILABLE with the roles tried if none exists.
11. **Common states.** Empty: zero catalog rows is unreachable on the A fixture; record UNAVAILABLE. Loading: the route
    has no streamed region; Setup's Ranks step shows a skeleton until its data arrives. Load failure has no control on
    this route; record UNAVAILABLE. Keyboard: Tab reaches the branch tabs (arrow keys move between them),
    `+ Add a branch`, each Turn all link, each chip, `Edit names` and `+ Custom rank`; Space or Enter toggles a chip.
12. **Field association.** In an open names editor each control has a resolving label; Tie-break `aria-describedby`
    resolves to its help, and its input has `min=-2147483648`, `max=2147483647` and `step=1`. A server error that names
    one field renders on that field with `aria-invalid`; a generic failure stays in the editor's `Alert`.

13. **Queued writes and Organization switching.** Sign in as `orgSettingsSwitch`, an admin of A and B. Preserve
    `$V rows organization_rank_catalog orgB`. On A hold `setRankStates`, press Sergeant off and on, then switch to B
    with the Organization switcher before releasing. Release from the same browser page. B's rows must match the
    preserved values, and no queued `setRankStates` request may target B. Restore the control.
14. **Partial pack and overlapping intents.** A starts with PFC, SPC and SGT saved but other Army ranks missing. Turn
    SGT off, then Turn all Enlisted on. Reload and read `$V rows`: all 13 Enlisted codes are active, the original SGT ID
    and creation time are retained, and no alert appears. Hold a failing SGT-off request with
    `arm-hold-fail ... setRankStates`, then press Turn all Enlisted off. Release and require every Enlisted chip off.
    Before reloading, Undo restores the last confirmed states, including SGT. Turn all Enlisted off again, reload and
    require every Enlisted chip off. These pack additions persist for this worker; restart it before any recipe that
    requires the original partial catalog.

Remove UI-created ranks, turn back on or off every rank you changed, and compare
`$V rows organization_rank_catalog orgA|orgB` with the preserved original. Ranks added from a pack stay; restart the
owned worker to reset them.

## Gotchas

- `arm-fail` is refused while another control is armed on the page; run `network restore` between modes.
- Rank mutations are SvelteKit form actions on `settings/ranks`, not JSON endpoints, and Setup's Ranks step posts to the
  same actions. `network` binds them by action name.
- The in-use and Turn all notes live in the page, not the catalog: a reload clears them, so press `Undo` first.
- `Turn all` counts only the ranks that change state; a block already all on sends nothing for `Turn all on`.
- Built-in ranks cannot be renamed or removed, only turned on or off. A referenced custom rank cannot be removed.
- The Remove confirmation stays open and busy until the request settles; Cancel or Escape sends no request.
