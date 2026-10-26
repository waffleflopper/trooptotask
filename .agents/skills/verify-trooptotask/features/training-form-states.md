# Dashboard and Training: raw controls, failed saves, field errors and screen states

A member whose Training save fails keeps every value they entered and sees where the error belongs (an Alert inside a
dialog, a `Field.Error` on a form field). Every Dashboard and Training screen has a clear loading, empty, error, denied,
disabled, narrow and dark state, and each hand-built control exposes its name and state.

## Sub-features

- `raw-control-states`: the Dashboard expanders, the matrix sort and person buttons and the applicability chips are
  canonical `Button`s that expose a name, a role, keyboard operation, a visible app focus ring and a state
  (`aria-expanded` and `aria-controls`, `aria-sort`, focus handed to a neighbor chip).
- `record-sheet`: a name or the popover's `Open record` opens the Soldier's record sheet at `?person=<id>`. It reads
  `N of M ready` and `N to record` from the Soldier's required types, groups the types as Needs action, Current, Not
  required and Exempt, and records Today or a card date in place. Up and down arrows step through the matrix's row
  order.
- `matrix-quick-record`: a matrix cell opens a popover anchored to it, with one date field, a live preview, optional
  notes and certificate link, and `Open record`. Enter saves, Escape closes, and focus returns to the cell.
- `failed-save-keeps-values`: a rejected save leaves the form open with every value, selection and chip in place, the
  saved row unchanged and an explicit retry that saves once.
- `field-error-association`: a validation or save error on a field is rendered by `Field.Error`, the control is
  `aria-invalid="true"` and its `aria-describedby` resolves to the message (an import review cell resolves to its
  problem text). A dialog save failure is an Alert titled `Training record was not saved` inside the dialog. A raw
  `<p>`, a toast or text inside a row status is a failure.
- `screen-states`: loading, empty, error, denied, disabled, 1280x800 light, 390x844 dark, keyboard and focus, and URL
  state for the Dashboard and the Training screens.
- `data-color`: a Training type color is stored data. A literal hex in source is a style default and must not replace
  the stored color.
- `table-semantics-and-print`: the Type risk table (`Table`, with readable `Records` text) and the three named print
  tables expose headers, and print preview renders them.
- `workspace-load-error`: a rejected streamed workspace source shows one `WorkspaceLoadError`
  (`Unable to load <subject>` with `Retry <subject>`) on the Dashboard, the Training matrix, Types and Views, never a
  stuck skeleton or a render throw.

## How to get to it (user POV)

Dashboard: sign in, enter an Organization and choose **Home**. Training: **Training** in the sidebar, then **Reports**,
or **More** (`Import`, `Manage views`, `Manage types`), a Person's name (the record sheet, at `?person=<id>`) or a
matrix cell (the `Record · <type>` popover, whose `Open record` opens the same sheet).

## Driving it with verify:app

Record each cell PASS, FAIL, UNAVAILABLE or UNRUN with the actor, width and theme. A defect stays FAIL until the same
step passes on a later candidate. This recipe adds what the [Dashboard](dashboard.md),
[Training catalog and views](training-catalog-views.md) and [Training completions](training-completions-reports.md)
recipes do not state. Their data, permission and scope steps stay authoritative.

Preconditions: save `component-foundation.md`'s state reader as `reader.js`. Run `$V seed dashboard-overflow` for the
Dashboard buttons and clean it with `clean-seeds` before the Training steps. Use unique `Baseline<tag>` names for every
draft. Starting a keyboard step with `focus()` on the control and then pressing real keys is faster than counting Tab
presses. The key names are `Enter`, `Space` and `Escape`. Failed saves and the Reports refresh use a synthetic
undispatched 503 from `$V network arm-fail`, which proves client recovery only. Run `$V network restore PAGE` after each
of those cases: an armed hook that has already matched does not re-arm, and the next save then succeeds. Streamed-source
failures and loading use the `$V server-source arm` hooks named in steps 1 and 5; release them with
`$V server-source restore`.

1. **Dashboard expanders, loading and error.** As `dashboardView` after `$V seed dashboard` and
   `$V seed dashboard-overflow`, the Dashboard has two `Button` expanders. Bottom line names every Person out at that
   size, so it has no toggle. Record name, size, state, Tab, Enter and Space results, focus and ring at both widths. The
   expected list sizes are in the overflow seed's `expected` text.

   | Control (source)                              | Accessible name and state                                                                                                                                                                                              | Expected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
   | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Needs you fold (`NeedsYouQueue`)              | `Show all 11` in the `+4 more` row, which names the folded titles; 7 then 11 rows                                                                                                                                      | 73.3x32 at both widths. Enter and Space expand in place, the fold row leaves and focus moves to the eighth row's link; app ring (3px) on `:focus-visible`                                                                                                                                                                                                                                                                                                                                                                                                         |
   | Coming and going (`ComingAndGoing`)           | `All 8 changes`, 4 then 8 rows                                                                                                                                                                                         | 32 tall at both widths. Enter and Space expand, the button leaves and focus moves to the fifth change                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
   | Dashboard loading frame (`DashboardPageView`) | The header and title render at once. Regions `Strength`, `Action` and `Readiness` carry `aria-busy="true"` and hold skeletons shaped like their content; one visually hidden `role="status"` reads `Loading Dashboard` | With `server-source arm availability_entries hold 1 120000` at 1440: 54, 46 and 28 skeletons. The right-hand column stacks under the left below 1024; no overflow at 390. After release every region reads `aria-busy="false"` and no skeleton remains                                                                                                                                                                                                                                                                                                            |
   | `WorkspaceLoadError`                          | `role="alert"` `Unable to load Dashboard` with `Retry Dashboard` (outline, `window.location.reload`, 128x32)                                                                                                           | PASS at both widths with the sidebar and header usable. A failed summary source (`server-source arm personnel_trainings fail-hard`, then reload) keeps the bands and adds one `Retry Dashboard` alert; the failure copy is in the [Dashboard page layout](dashboard.md#page-layout). A failed workspace source (`rating_scheme_entries` or `availability_entries`) is caught by the Dashboard layout, which replaces the whole page. Retry recovers after `restore`. The console keeps two framework `Uncaught (in promise)` rejections (`Internal server error`) |

2. **GroupSelector and TrainingMatrix controls.** As `trainingConfigure` at 1280 light, then 390 dark.

   | Control                                       | Accessible name and state                                                                                                                           | Expected                                                                                                                                                                                                                                       |
   | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | GroupSelector chip remove (in the Types form) | `Remove Medic`, `Remove NCO`, `Remove 68W`                                                                                                          | `Button` `icon-sm`, 28x28 at 1280 and 40x40 at 390. Enter removes the chip and moves focus to the neighbor chip's remove, then to the `Search roles` or `Search mos` field; never `body`                                                       |
   | Matrix person button                          | `SPC Able, Synthetic`, 310x20 at 1280 and 111x20 at 390                                                                                             | Enter and Space open the record sheet and add `?person=<id>` as one history entry. Focus lands on `Record all N today` (on `Open profile` while the sheet loads). Escape or Back closes it, removes the param and returns focus to this button |
   | Matrix `Personnel ▲ 12` sort button           | The left-aligned header reads `Personnel` plus the direction glyph and the person count; the `th` carries `aria-sort` (`ascending` or `descending`) | Enter and Space toggle the direction and keep focus; the other headers read `none`                                                                                                                                                             |
   | Matrix type header buttons                    | `Verification Targeted Training 12 MO` (then with `▲` or `▼`); the color square is `aria-hidden`                                                    | 210.3x55 at 1280 and 99x55 at 390. `aria-sort` follows the active column; Enter and Space toggle and keep focus                                                                                                                                |

   The matrix `table` is named `Training status matrix`. Matrix view mode (`A–Z`, `Groups`), `Training view filter` and
   `Training group filter` leave the URL empty and survive a reload. Reset them to `Groups`, `All trainings` and
   `Group: All` afterward. The `Training controls` toolbar stays on one row: `scrollWidth` equals `clientWidth`, and the
   controls that do not fit move into `More Training controls`, which is 32x32 at 390. `Manage types` lives only in
   More.

   Matrix headings and cells, on `Groups` with the seeded fixture: the corner header is left-aligned and reads
   `Personnel` and the person count (`Personnel ▲ 3`). A Group band shows its readiness as bare tone text with no chip
   (`100%` in the success tone, `50%` in the warning tone, below that in the danger tone) and drops the count at 390.
   The rank before each name is quiet mono muted text, `SPC` at the same tone for every row. A header count that is `0`
   reads in the muted tone; non-zero counts keep their tone, and the thin separators between counts stay. A current cell
   of a type with no expiry shows the completion month (`Nov ’25`); its popover status line reads `Never expires`.

   In the cell popover the date control is the shared date picker (a button named `Completion date`, not a native
   date input). Opening a cell that already has a record fills the notes and the certificate URL from it; saving only
   the date keeps both, and saving a card-date type keeps its stored completion date. The note link
   `Add a note or certificate link…` is underlined. At 390 the search field in `Training controls` takes its own full
   row above the other controls; at 1024 and 1440 it stays on the row.

3. **Failed save keeps entered values.** For every form fill every field with a distinct value, arm the named family,
   submit, then capture the open form, every value, the visible error and where it renders, `network state` with one 503
   and the unchanged row. Restore, retry once, reload and read back. Run `$V network restore PAGE` after every case.

   | Form                              | Entry (actor `trainingConfigure`)                                                                          | Family armed                | Expected                                                                                                                                                                                                                                                                                                 |
   | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Types create (with Applicability) | Manage Types, `+ New Type`: name, description, color, 18 months, Targeted, a role chip, an MOS chip        | `training-types`            | Retention (chips, Targeted, custom color, description, 18), zero rows, `Field.Error` `Failed to save training type.` on Name, focus on `Create`. Create is disabled while Name is blank                                                                                                                  |
   | Types edit                        | Select a type, `Edit`: change name, description and color                                                  | `training-types`            | Retention including the custom color; row unchanged; focus on `Save`; the retry saves the same ID                                                                                                                                                                                                        |
   | Views create                      | Manage Views, `New View`: name, two selected types in an order                                             | `training-views`            | Retention (name, selection, order), zero rows, `Field.Error` `Failed to save view.` on View Name, focus on `Save`                                                                                                                                                                                        |
   | Views edit                        | Select the view, `Edit`: rename and reverse the two columns                                                | `training-views`            | Retention (the reversed order is kept); row unchanged; same ID after the retry                                                                                                                                                                                                                           |
   | Cell popover create and edit      | Matrix cell: date, `Add a note or certificate link…`, Notes, Certificate URL                               | `personnel-trainings`       | Retention (date, Notes, URL). An Alert (`role="alert"`) titled `Training record was not saved` with the request message renders inside the popover, which stays open; the cell and the header numbers are unchanged. Saving again after `restore` writes once and closes it                              |
   | Record sheet edit and add         | Person name, a row's `More actions for <type>`, `Edit` or `Add record`                                     | `personnel-trainings`       | Retention (date, Notes, URL). The same inside-sheet Alert titled `Training record was not saved` (it names the type), focus on `Save`, Escape blocked while dirty. `Today` failures show the Alert at the top of the sheet; `Record all N today` failures show a toast and leave the confirm dialog open |
   | Import page                       | `Import`, upload the tracker from training-completions-reports step 4, answer the rail, `Import 2 changes` | `personnel-trainings/batch` | Done reads `0 changes saved.` with `Not confirmed 2` and the warning `The last batch was not confirmed`; no row is written. `Import another file` and the same answers save each completion once. While held (`arm-hold`), the bar reads `Saving 0 of 2 changes` and Import is disabled                  |

   Retry once after each failure and read the row back. Remove every temporary record through the visible controls
   (`Remove <type> record`, then `Delete`) and read the original rows back before cleanup.

4. **Field error association.** Read `aria-invalid` and the resolved `aria-describedby` for the field the message
   belongs to.

   | Form                       | Trigger                                   | Expected                                                                                                                                          |
   | -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Types name                 | a failed save                             | `Field.Error`, `role="alert"`, `aria-invalid="true"` on Name, `aria-describedby` resolves                                                         |
   | Types blank name           | Create with an empty Name                 | UNREACHABLE. The button is disabled, so no message exists                                                                                         |
   | Views name                 | Save with a blank name, and a failed save | `Name is required.` and `Failed to save view.` are associated. Focus stays on `Save`. Typing a name clears `Name is required.`                    |
   | Cell popover, record sheet | a failed save                             | An Alert inside the popover or sheet, not a field association; the fields stay valid and keep their values                                        |
   | Import page                | `2025-11-31` in a training cell           | The Review cell editor (`Completed, Alpha · row 4`) has `aria-invalid="true"` and `aria-describedby` resolving to `Enter a date like 2026-03-11.` |

5. **Screen states.** Capture at 1280x800 light and 390x844 dark with the actors named. Use native `resize_page` and
   `emulate` with `colorScheme`, and toggle the theme with `Toggle theme` (it does not follow `emulate`).

   | State                   | How to reach it                                                                                   | Expected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
   | ----------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Dashboard scope         | `dashboardScoped`, `dashboardEmpty`, `dashboardNone`, `dashboardForeign` on `seed dashboard`      | Alpha-only, 0/0, Training omitted, B only at both widths. `dashboardForeign` opening A's address gets a 404 `Page not found`                                                                                                                                                                                                                                                                                                                                                                         |
   | Training loading        | `server-source arm personnel_trainings hold 1 120000`, then choose Training from Calendar or Home | Toolbar over a 54-skeleton grid inside `role="status"` `aria-live="polite"` (no `aria-busy`) `aria-label="Loading training matrix"`. `Export unavailable while loading.` shows and `Export` is disabled (a disabled menu item at 390). The header readiness shows skeletons while the reporting day is still pending. Release with `server-source restore`                                                                                                                                           |
   | Training error          | `server-source arm personnel_trainings fail-hard 1`, then choose Training from Calendar or Home   | `WorkspaceLoadError`: `role="alert"` `Unable to load Training` with `Retry Training`. Types and Views show the same on a full load of `/training/types` or `/training/views` (SPA navigation inside the layout does not reload the source). Retry recovers after `restore`. Console: `Uncaught (in promise)` and `[training-hydration] Failed to load personnelTrainings` only                                                                                                                       |
   | Import loading          | `server-source arm personnel_trainings hold 1 120000`, then a full load of `/training/import`     | The page header and stepper over a skeleton the size of the drop zone (792x256 at 1440); no layout shift after release                                                                                                                                                                                                                                                                                                                                                                               |
   | Import error            | `server-source arm personnel_trainings fail-hard 1`, then a full load of `/training/import`       | `Unable to load Training` with `Retry Training`; Retry recovers after `restore`                                                                                                                                                                                                                                                                                                                                                                                                                      |
   | Empty                   | `trainingEmpty`: matrix and Reports                                                               | Matrix `No personnel found.` with `Export` disabled and `No personnel to export.` as its description (`No training types to export.` for an empty catalog). Reports `No applicable requirements.`                                                                                                                                                                                                                                                                                                    |
   | Denied (app card)       | `viewer` on `/training`                                                                           | `Access Restricted`, `You don't have permission to view training.`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
   | Denied (Reports)        | an actor whose Training was revoked while the page was open, then Reports                         | A 403 page, `You don't have permission to view this page.`, with `Back to Dashboard`                                                                                                                                                                                                                                                                                                                                                                                                                 |
   | Reports refresh failure | `network arm-fail PAGE training-reports`, choose `180 days`                                       | `Unable to update the briefing` alert with `Retry`, the last briefing shown, focus returns to `Training readiness briefing` after Retry                                                                                                                                                                                                                                                                                                                                                              |
   | Disabled                | forms open, empty roster, list ends                                                               | `+ New Type` carries `Finish the current edit first`; Move up and down disable at the ends. `Export` states its reason                                                                                                                                                                                                                                                                                                                                                                               |
   | Toolbar width           | 1280 light, `trainingConfigure`                                                                   | `Training controls` `scrollWidth` equals `clientWidth` and `Manage Types` ends inside the viewport. At 390 light and dark the Reports toolbar keeps `Print brief` on the row and folds the rest into `More Training report controls`. The Types and Views toolbars have nothing to fold: `toolbar-sweep --no-fold` from 1800 down to 390 never shows More on either, or on their detail toolbars. `+ New Type` and `Edit` stay on the row, and Views keeps `Back to Matrix` beside `New View` at 390 |
   | Narrow                  | 390 dark: Types form, Views, Reports, matrix, cell popover                                        | No page overflow. The `Hot-spot grid` region scrolls inside its 358 column; the matrix viewport scrolls sideways inside the page and the cell popover stays inside the 390 viewport                                                                                                                                                                                                                                                                                                                  |

6. **URL and query state.** On Reports choose `180 days`, `Rows by` MOS and `Filter by group` Alpha (open the filter and
   use ArrowDown and Enter). The address becomes `?group=<id>&horizon=180&rowsBy=mos`; a reload restores the same
   pressed `180 days` and `MOS` buttons, the group and a `Clear filters` button. Choosing a cell does not change the
   address. Training has no tabs.

7. **Dialog focus.** Record where focus lands when each dialog opens and where it returns.

   | Dialog                                      | Open lands on                    | Escape or close returns to                                                 |
   | ------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
   | Record sheet (`?person=<id>`)               | `Record all N today`             | the matrix person button, or the cell that opened it through `Open record` |
   | `Record · <type>` (cell popover)            | the date field's month segment   | the matrix cell button after a save, an Escape or `Open record` closes it  |
   | `Delete Training Type`, `Delete Saved View` | the alertdialog container itself | the opening `Delete Type` or `Delete View` button                          |

   Import is a page, not a dialog; training-completions-reports step 4 records its Tab order.

8. **Color is data.** In Manage Types create a type with a custom color through the native color input (set `#cc3366`,
   dispatch `input` and `change`). Read back `training_types.color`. The list swatch and the matrix column square both
   render that stored color; the three seeded types store `#6b7280` and render `rgb(107, 114, 128)`. `#6b7280` is also
   the new-type form default, which is saved as data. Delete the temporary type through `Delete Type` and read back
   absence.

9. **Tables and print.** On Reports the Type risk table is
   `table[aria-label="Not ready and lapsing requirements by training type"]` (a `Table`) with column headers Type,
   Records, Not ready and By <date> (`scope="col"`) and `th scope="row"` per type. Each Records cell holds an
   `aria-hidden` bar and an sr-only `N not ready, M lapsing by <date>`. Arm `$V print arm PAGE`, choose `Print brief`,
   read `$V print state PAGE`, then run `$V print save PAGE <exact reports URL> FILE.pdf letter on` and
   `$V print restore PAGE`. The print DOM then holds two print-only tables named
   `Training types with the most requirements not ready or lapsing` (with `Share` as a screen-reader column) and
   `Training status of each training type by <noun>`; open a cell first to add the third,
   `Affected soldiers by requirement` (`#`, Rank, Name, Group, Training type, Status today, Expiration date, Lapses by
   <date>). All use `th scope`. Extract the PDF with `pdftotext -layout` and `pdftoppm` for the evidence. The ordinary
   three-Person fixture prints 2 pages, and 3 with the detail table.

10. **Access Restricted.** The app-level `WorkspaceAccessRestricted` card (step 5, `viewer`) is the only denial on
    `/training` itself; there is no in-page Access Restricted branch. Reports keeps its separate 403 page (step 5).
    Measured for that card: 1280x800 column `[256,56,1024,744]`; 390x844 column `[0,56,390,788]`.

## Gotchas

- The shadcn `Select` options do not appear in the accessibility snapshot. Open the control and use ArrowDown and Enter.
- A PDF capture from the print helper counts its own `beforeprint` and `afterprint` events. Read `print state` after the
  button click and before the save.
- `seed dashboard-overflow` and `seed dashboard` change the Training matrix and Reports. Clean seeds before reading the
  unchanged Training numbers.
