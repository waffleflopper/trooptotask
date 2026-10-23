# Manage the rank catalog

An Organization owner or admin adds branch packs and custom ranks, edits and orders them, retires and reactivates them
singly or by branch, and removes unused custom ranks; no other member can change the catalog.

## Sub-features

- `rank-coverage`: Branch coverage shows one row per built-in pack with an active/retired/missing bar, mono counts,
  `Add <n>` for missing ranks and a `More actions for <branch>` menu.
- `rank-filters`: the `All`/`Active`/`Retired` segmented control, the branch select and search narrow the Catalog table
  and name an empty result.
- `rank-in-use`: the In use lane reads `<n> people`, `<n> in training`, `<n> in history`, `Not in use`, or `Unknown`
  when the reference check failed.
- `rank-edit`: pressing a rank opens its editor in place under the row: Label, Category, Pay grade and Tie-break; the
  code stays fixed and built-in ranks show no form.
- `rank-create`: `Add custom rank` opens the same editor as a blank first row with Code; a new rank is Custom and
  Active.
- `rank-order`: ranks sort by pay grade, then tie-break, then code; there is no drag handle or move control. Every lane
  but actions has a `Sort by <lane>` header that toggles ascending and descending; ties fall back to rank order and the
  new-rank draft stays first.
- `rank-retire`: Retire hides one active rank from future selection and keeps existing Personnel, Training filters and
  history. Retire opens a confirmation first, Cancel leaves the rank active, Confirm retires it. Retire, Remove and the
  branch bulk confirmations stay open and busy until the request settles: a failure keeps the dialog open with a
  destructive Alert and Confirm retries; success closes it and moves focus (see step 6).
- `rank-reactivate`: Reactivate returns a retired rank to selection without a confirmation.
- `rank-bulk`: a branch pack's menu retires or reactivates every built-in rank of that branch after a confirmation;
  `Add <n>` installs the pack's missing ranks.
- `rank-remove`: Remove permanently deletes an unreferenced custom rank after a destructive confirmation.
- `rank-failure`: a failed or rejected save shows its error, keeps every entered value and changes no row.
- `rank-denied`: a member without Organization owner/admin access cannot reach the catalog or change a rank.

## How to get to it (user POV)

Sign in as an Organization owner or admin, choose `Settings`, then `Ranks`. **Branch coverage** lists each built-in pack
with its bar, `Add <n>` and, when the pack has ranks to retire or reactivate, `More actions for <branch>`. **Catalog**
has `Add custom rank` in its head, the `Rank filters` row and the `Organization ranks` table. Each row's rank lane is a
button (`aria-expanded`) that opens the editor; the row's `Actions for CODE` menu offers Edit, Retire, Reactivate and
Remove as the rank allows. When the table is narrower than 42rem it stacks each row's lanes under the rank, and the
editor's fields stack with it. Branch coverage rows take their one-line columns only when the coverage list is at least
36rem wide, so at 1024 they stay stacked inside the settings body. Personnel's Add Person and Edit forms read the active
catalog through their Rank select.

## Driving it with verify:app

Record each step PASS, FAIL, UNAVAILABLE or UNRUN with the width and theme.

Preconditions: `$V fixture` gives A's `rankCatalog.activeA` (`VFY-ACTIVE-A`), `retiredA` (`VFY-RETIRED-A`) and B's
`activeB` (`VFY-ONLY-B`) with IDs; preserve `$V rows organization_rank_catalog orgA` and `orgB` readbacks first and
compare them at the end. Do not retire, edit or remove a seeded rank or the PFC/SPC/SGT fixture ranks: create
`MAP-<tag>` ranks for every mutation, and install only a branch pack A does not yet have. Use
`$V actor orgOwner settings/general` (the actor destinations do not include `settings/ranks`), then open Ranks from the
settings nav or navigate to `settings/ranks`. `$V rows organization_rank_catalog orgA` takes no `code` filter: read it
unfiltered and select by `code`; an installed pack's rows carry the `service` slug (`space-force`), not the display
name. For failure steps arm `$V network arm-fail PAGE settings/ranks/ACTION` with `saveRank`, `retireRank`,
`reactivateRank`, `bulkRankState`, `deleteRank` or `addServicePack`; each returns a SvelteKit failure envelope with
`rankError` and never reaches the provider. Use `arm-observe` for the count and body of a request that should or should
not be sent. Restore every control. Dark mode is `localStorage.theme = 'dark'` and a reload; the app reads `data-theme`,
not the `dark` class.

1. **Entry and states.** Open Settings → Ranks. Capture the page header, Branch coverage with its legend, each pack row
   (bar `role=img` named `<Branch>: A active, R retired, M missing of N built-in ranks`, the count lane, amber
   `N missing` or muted `N ranks`, `Add <n>`), the Catalog head (`N active · N retired · N custom`) and the table under
   the default `All` filter. Read `$V rows organization_rank_catalog orgA`: the head counts match the rows. Capture 1440
   light and dark, and 390 light and dark. At 1440 Branch coverage sits under a 2px rule with one row per branch in the
   order Army, Navy, Air Force, Marine Corps, Coast Guard and Space Force, and each row keeps fixed lanes: the branch
   name (140 px), the bar filling the rest, the count (`N active` or `Not added`, 150 px), `N missing` in amber or
   `N ranks` muted (90 px) and `Add <n>`, followed by the pack menu once the branch is added (120 px). The bar draws
   active in `--foreground` and retired in `--muted-foreground` over an `--input` track, the legend reads `Active`,
   `Retired`, `Missing`, and the catalog's columns read Rank, Branch, Grade, Source, In use and State; at 1024 and 390
   nothing passes the body's right edge, the table container's `scrollWidth` equals its `clientWidth` and every
   `Actions for CODE` is inside the viewport. In dark the legend's `Missing` swatch and the empty bar tracks are
   visible.
2. **Filters and search.** In `Rank filters`, choose `Retired` in `Filter ranks by state` (radio items, `aria-checked`
   moves): `VFY-RETIRED-A` shows and `VFY-ACTIVE-A` does not. Choose a branch in `Filter ranks by branch` with no
   retired rank: require `No retired ranks match <branch>.`. Type in `Search ranks`: require the sr-only status
   `X of Y ranks shown` and the matching rows, then clear with focused `Control+A`/`Backspace`. Filtered-out rows stay
   mounted with `hidden`, so count rows with `tr:not([hidden])`. Press each `Sort by <lane>` header: `aria-sort` moves
   to it and the rows reorder; press it again for descending. Reload: filters reset to All (the URL carries no state).
3. **In use.** Read the In use lane: SPC `3 people`, PFC `2 in history`, the seeded custom ranks `Not in use`. A
   `Not in use` custom rank's editor names it removable; any other shows the loader's `deleteDisabledReason` as one
   sentence beside the buttons.
4. **Create and failed create.** Press `Add custom rank`: the first row is `New custom rank`, its editor opens below
   with focus on Code and the button is disabled while the draft is open. Enter Code `MAP-<tag>`, Label
   `Map Rank <tag>`, a Category, Pay grade and Tie-break `500`. Arm `arm-fail PAGE settings/ranks/saveRank`, press
   `Add rank` and capture the destructive alert, every entered value still in its field, the draft still open and
   `$V rows` with no `MAP-<tag>`. Restore and press `Add rank` again: the toast `Rank catalog updated.` with no inline
   alert, the draft closes, focus is on the new rank's row button and one row reads Custom/Active with the submitted
   fields after reload. Attempt a duplicate code: record the server message on Code (`Field.Error`, `aria-invalid`).
   Escape in the draft discards it and focus returns to `Add custom rank`.
5. **Edit and failed edit.** Press the `MAP-<tag>` row: `aria-expanded` is `true`, `aria-controls` resolves to the
   editor and focus is on Label; no Code field is shown. Change Label, Pay grade and Tie-break, arm
   `arm-fail ... saveRank`, press `Save MAP-<tag>`: the alert shows in that editor, values stay and the row is
   unchanged. Restore, retry: the toast `Rank catalog updated.`, the editor stays open with the saved values and focus
   on `Save MAP-<tag>`, and the fields persist after reload. Escape or Cancel closes without a request and returns focus
   to the row. A built-in rank's editor has no form, only its sentence and the Retire or Reactivate button. Clear
   Tie-break and save: record the server message and where it appears.
6. **Retire.** From the editor or `Actions for MAP-<tag>` choose Retire. A confirmation opens naming the rank, focus
   inside it, Escape equals Cancel. Cancel: the rank stays Active and `arm-observe ... retireRank` shows zero requests.
   Reopen, arm `arm-fail ... retireRank`, confirm: the dialog stays open with its Alert, Confirm enabled. Restore,
   Confirm again: it closes, one request, the rank reads `Retired`, and Add Person's Rank select omits it. Hold the
   confirmed request with `arm-hold`: the dialog is `aria-busy`, Cancel and Confirm are disabled, Escape does nothing
   and every `Add <n>` is disabled until release. On release focus lands on the rank's row button if still shown, else
   the row now at its index, else the previous row's, else `#rank-catalog-heading`; under the `Active` filter a retired
   rank leaves the table, so the next row is the usual destination.
7. **Reactivate.** Under `Retired`, open `MAP-<tag>` and press Reactivate (no confirmation). Fail it once with
   `arm-fail ... reactivateRank`, retry, and require the rank Active and back in Add Person's Rank.
8. **Branch pack bulk actions.** For a pack A lacks, arm `arm-fail ... addServicePack` and press `Add <n>`: failure
   alert, no new rows; restore and retry: the row shows `N active`, no missing and no Add button, and focus moves to
   `More actions for <branch>`. Open that menu, choose `Retire active ranks (n)`: Cancel sends nothing; arm
   `arm-fail ... bulkRankState`, confirm, require the dialog Alert and unchanged counts; restore and Confirm: the count
   lane reads `0 · n retired`. Reactivate through `Reactivate retired ranks (n)`. Never bulk-retire the pack that holds
   PFC/SPC/SGT. An installed pack cannot be uninstalled; restart the owned worker before relying on the original
   catalog.
9. **Remove.** In `MAP-<tag>`'s editor press Remove: the destructive confirmation names the code and says it cannot be
   undone. Cancel changes nothing. Arm `arm-fail ... deleteRank`, confirm: the dialog stays open with its Alert and the
   row stays. Restore, Confirm: the row is gone from the table and `$V rows`, and focus lands on the next row's button
   (else the previous, else `#rank-catalog-heading`).
10. **Denied access and no effect.** Sign in as `orgMember` and as `manager` and open `settings/ranks`: record the
    screen, HTTP status and that no rank data appears. From the same page `fetch` a POST to
    `<ORG_URL>/settings/ranks?/retireRank` with `code=VFY-ACTIVE-A` and the `x-sveltekit-action` header; require a
    non-success result and `$V rows` still active. The `View only` alert with no editor forms is reachable only for a
    member who passes the Settings layout but is not owner or admin; record UNAVAILABLE with the roles tried if none
    exists.
11. **Common states.** Empty: `No ranks in this catalog yet.` needs zero catalog rows and is unreachable on the A
    fixture; record UNAVAILABLE. Loading: the route has no streamed region; a client navigation shows the shell's
    navigation state, then the full page. Load failure (`Rank catalog settings are not available.`) has no control on
    this route; record UNAVAILABLE. While any rank request is pending, `Save`, `Add rank`, every `Add <n>` and the
    Retire, Reactivate, Remove and bulk menu actions are disabled; `Edit`, Cancel and Close stay available. Keyboard:
    Tab reaches each `Add <n>`, each pack menu, `Add custom rank`, the state radios (arrow keys move), the branch
    select, search, each row button and each `Actions for CODE`.
12. **Field association.** In an open editor each control has a resolving label; Tie-break `aria-describedby` resolves
    to its tie-break help, and its input has `min=-2147483648`, `max=2147483647` and `step=1` (Chrome's accessibility
    tree reports the maximum as 2147483648, a float rounding). A server error that names one field renders as
    `Field.Error` on that field with `aria-invalid`; a generic failure (the synthetic 503) stays in the editor's
    `Alert`.

Remove UI-created ranks and compare `$V rows organization_rank_catalog orgA|orgB` with the preserved original.

## Gotchas

- `arm-fail` is refused while `arm-observe` (or any other control) is armed on the page; run `network restore` between
  modes, or the next confirm runs for real.
- Rank mutations are SvelteKit form actions on `settings/ranks`, not JSON endpoints. `network` binds them by action name
  and returns the failure envelope; `arm-observe` records the request without altering it.
- Errors and successes return without naming the form, so the page attributes them to the last submitter: an error after
  Add shows in the draft, one after Save inside that row's editor.
- Only one editor is open at a time. Opening another row or `Add custom rank` closes the current one without saving.
- Built-in ranks cannot be edited or removed; only retired/active state changes. A referenced rank cannot be removed
  even when custom.
- Confirmations are not closed by their button: `ConfirmDialog` stays open and busy until the form action settles, so a
  held or failed request leaves it open. A Cancel or Escape sends no request.
- Only one rank request is in flight at a time.
- A branch pack, once added, stays in the catalog. Prefer Remove for each unreferenced row or restart the owned worker;
  do not edit rows through the provider.
