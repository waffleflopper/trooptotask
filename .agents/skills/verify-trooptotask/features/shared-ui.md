# Shared dialogs, date selection and tooltips

Members use shared controls through Personnel forms, import previews and navigation. Their keyboard actions, selected
values, accessible descriptions and focus restoration must survive changes to the shared component implementation.

## Sub-features

- `theme-and-viewport`: representative shell, form/error, dialog, toast, readiness and table consumers remain usable in
  light/dark at narrow/wide widths. Toasts follow the app selection even when the emulated system preference differs.
- `tooltip-description`: pointer hover and keyboard focus expose a tooltip with a nonempty unique ID and
  `role="tooltip"`; the trigger's `aria-describedby` resolves to that content. Escape, blur and activation dismiss
  according to the existing trigger behavior.
- `dialog-focus`: a real dialog opens with its title, contains keyboard focus, cancels without saving and restores focus
  to its opening control.
- `confirmation-cancel`: an archive confirmation identifies the actual Person and cancels without archiving or losing
  the opening control's focus.
- `date-selection`: calendar navigation and date activation update the caller's draft; canceling the enclosing form
  preserves stored dates.

## How to get to it (user POV)

In Personnel, use a named row's Edit or Archive button. Edit contains ETS and PCS / DEROS date pickers. Import opens the
file preview with validation hints. Toggle Sidebar collapses desktop navigation; its icon links and the header theme
button expose tooltip labels. An admitted platform administrator uses the same sidebar on Admin screens.

## Helper controls

Toolbar folding verification uses
`toolbar-sweep PAGE "TOOLBAR_LABEL" RUN_DIR (--expect ID,ID,... | --no-fold (--pinned ID,ID,... | --search) | --more-always --pinned ID,ID,...) [--pinned ID,ID,...] [--search] [--more-always] [--from 1440] [--to 390] [--step 2] [--height 900] [--record NAME]`,
for example
`$V toolbar-sweep "$PAGE" "Critical Tasks controls" .verification/evidence/verify-trooptotask/RUN --expect export-excel,import-completions,task-library,reports,gaps,group,matrix-view --pinned record-completion --search --record sweep-light`.
`RUN_DIR` must lie under the skill evidence directory, with no `..` segment or symlink below it, and may not already
hold `toolbar-sweep.json` or the named video. The page must already show the toolbar, whose root is the single
`[role=toolbar]` with that `aria-label`. `--expect` lists the toolbar item ids in the order they must fold, first folded
first; `--no-fold` replaces it for a toolbar with nothing to fold, such as one that holds only its primary or only
search, and then requires `--pinned`, `--search` or both, fails if More appears or if any id on the first row leaves it
at any read or hold, and refuses `--more-always`; `--more-always` with `--pinned` and no `--expect` is for a toolbar
that never folds but whose More holds only `menuOnly` items, such as an organization's Suspend, and then requires More
at every read and fails if any id on the first row leaves it; `--pinned` lists the ids that must stay on the row, and
`--search` says the toolbar must have search; both are required at every read, hold reads included, so a control that is
missing for the whole run fails instead of defining itself away. Without them nothing is pinned and search is optional,
and the trace records what was required. `--more-always` is for a toolbar with `menuOnly` items, such as Calendar's
Settings, Export to Excel and Print / PDF (its `Display` is a row action that folds): More must then be present at every
read instead of only while something is folded. The helper reads the live row (`[data-toolbar-row] [data-toolbar-item]`,
ignoring `[data-toolbar-measure]`), `[data-toolbar-more]`, the search control (any other child of the row: the field,
the icon, or the open field and Close), `data-toolbar-search` and `data-toolbar-ready`, row and root `scrollWidth`
against `clientWidth`, every part's edges against the row's content box on both sides, and keeps one MutationObserver on
the toolbar that counts per-id membership changes between reads. It resizes from `--from` down to `--to` and back in
`--step` pixels at `--height`, waits two animation frames per step, and holds 250 ms with three more reads when the
membership changed. `checkSweep` then requires one row without horizontal overflow, one id folded per step in `--expect`
order with the exact reverse going up, More only while something is folded (at every read with `--more-always`), search
an icon only after every listed id has folded, identical state at equal content widths down and up and at a held width,
and at most one membership change per id per step. Direction (nothing returns while the row narrows, nothing leaves
while it widens) is judged by the row's content width, because the shell docks its sidebar at 768px and the row is
narrower just above it than just below; a step across that change may move several ids. A step that removes two ids is
reported with both ids, never hidden; rerun with `--step 1` before blaming the toolbar. A toolbar without
`data-toolbar-row` is reported as `toolbar has no data-toolbar-row; not a fitted toolbar` and the sweep still runs, so
`--record` captures the old layout. `finally` always stops the recording, restores 1280x800 and writes
`RUN_DIR/toolbar-sweep.json` (`down`, `up`, `verdict` with `foldedAt` and `restoredAt` widths); the command exits 1 when
the verdict fails. The sweep takes minutes at `--step 2` and prints progress to stderr. Run it once per theme after
choosing the theme with the visible **Toggle theme** control, and restore the theme afterward. Run
`node --test .agents/skills/verify-trooptotask/helpers/toolbar-sweep.test.mjs` for its accepted and rejected traces. To
find one control on the row or in More, follow the
[shared UI recipe](shared-ui.md#find-a-toolbar-control-on-the-row-or-in-more).

A full `--step 2` sweep records about 26 minutes and 75 MB. `toolbar-sweep` reads observable layout; it does not prove
frame-level absence of flicker by itself. Play or step through the recording, and keep the trace and video together as
the evidence.

## Driving it with verify:app

Sign in normally as `manager` and retain its page/Organization IDs. Preserve the original Personnel rows with
`$V rows personnel orgA` before any form interaction and compare them after canceling.

1. **App navigation tooltip.** On desktop, collapse Toggle Sidebar. Hover Home and capture the tooltip, then use
   Tab/Shift+Tab to focus an icon link and inspect the focused element. Record the visible label, content ID/role, the
   trigger's `aria-describedby` and the element it resolves to. The ID must be nonempty and unique within the document.
   Press Escape and require dismissal without losing trigger focus. Follow an allowed link and require the new page
   without retained tooltip content. Expand the sidebar and confirm ordinary labeled navigation remains usable. A
   collapsed sidebar link's tooltip repeats the link's own name: Home reads `Home`, not `Dashboard`.
2. **Header tooltip.** Reach Toggle theme with Tab, preserving the fresh focus snapshot. Apply the same semantic checks.
   Escape must dismiss while preserving button focus. Move the pointer away, blur and refocus through Tab/Shift+Tab, and
   require an open tooltip before activating with Enter. Repeat with Space. Each activation must dismiss the tooltip,
   retain button focus and change the theme exactly once. Read the actual `html[data-theme]` value, then restore the
   original theme with the same control. Also check hover followed by pointer activation. A tooltip appearing visually
   does not establish its accessible relationship.
3. **Import problem cells.** Follow Import and upload the workbook from the
   [Personnel lifecycle recipe](personnel-records-lifecycle.md#driving-it-with-verifyapp), then choose `Review 11 rows`.
   A problem cell is a textbox with `aria-invalid="true"` and an `aria-describedby` that resolves to its row's visible
   message line in the grid, or to the message under the field on a 390 px card. Hover and keyboard focus show no
   tooltip; the message is always visible. Choose `Leave import` from a link out and require unchanged original rows.
4. **Dialog and date picker.** Open Able's Edit button and require Edit Personnel plus usable focus inside the dialog.
   Use Tab and Shift+Tab at its boundaries to check focus containment. Open ETS, move to the previous month and back,
   and select a literal named date from the grid. Record the selected-date announcement and the draft value through
   read-only DOM inspection. Keyboard date movement/activation must retain usable grid focus until selection closes the
   popover. Cancel with Escape and require the original Edit button focused, no remaining modal and unchanged stored
   ETS/DEROS. Reopen to confirm the canceled draft is absent.
5. **Confirmation.** Open Able's Archive button. Require an alertdialog naming Able with the retained-history
   explanation and Cancel/Archive actions. Choose Cancel, require focus restored to the same Archive button and verify
   Able remains active with unchanged dates. This cancel probe supplies no archive-mutation or server-authorization
   proof.
6. **Platform navigation.** Use `$V actor platformReviewer admin/users` through normal sign-in. Inspect actual admitted
   Users content, collapse Toggle Sidebar and repeat the Users link's tooltip semantics/dismissal. On mobile, select the
   current Users link and require the drawer to close. Reopen and follow Dashboard; require the new screen and a closed
   drawer. Reopen, focus a navigation link and press Escape; require closure and focus restored to Toggle Sidebar.
   Repeat ordinary/current-link closure and Escape on the app sidebar under the
   [shell recipe](shell-preferences.md#driving-it-with-verifyapp). Modified new-tab activation must preserve the drawer.
   Desktop tooltip proof alone does not establish mobile drawer behavior.

Native `evaluate_script` may read `document.activeElement`, tooltip/trigger attributes and `document.getElementById`
results. Use visible controls for actions; do not call application handlers or alter attributes to manufacture a pass.

### Theme and viewport

Before another token/theme or dependency cutover, collect a separate baseline on the unchanged worker. A source
comparison does not establish it. Native `emulate` sets `colorScheme` and `resize_page` sets the viewport; `emulate` has
no print-media option.

1. Read `verify:app tools` on the owned worker. Confirm native `emulate` can set the preferred color scheme and
   `resize_page` can set the viewport. Use their returned schemas and capture actual viewport dimensions and
   `matchMedia` results. Record a failed or unavailable control instead of borrowing another browser.
2. At about 1280 by 800, capture the app shell as `manager`. Use the visible **Toggle theme** control to choose light,
   then dark. Read the rendered `data-theme`, saved `localStorage.theme` and a second visible read after reload. Select
   the opposite emulated system color preference to prove that an explicit app selection wins. Do not call theme-store
   methods or change DOM attributes directly.
3. For each app-selected theme, repeat representative captures at about 1280 by 800 and 390 by 844. At narrow width
   inspect the mobile drawer and content overflow. Use the wide control before resizing if a theme control is
   unavailable at narrow width. The same source, fixtures and role/scope must drive baseline and final captures.
4. As `manager`, open a Personnel row's Edit dialog and retain its original Last Name. Replace that field with one space
   and press Save: the native required check permits nonempty whitespace, while the app rejects the trimmed name before
   writing. Read the real `#lastName[aria-invalid="true"]` and its resolving `aria-describedby` error, **Enter a last
   name.** Capture unfocused and Tab-focused states, then Cancel and verify the original row is unchanged. Keep the
   invalid Personnel import preview capture separately: its labelled `Row <n> <column>` error/warning inputs use
   explicit status classes and do not prove the primitive Input's own invalid variant. Record labels, error
   associations, focus and cancellation; do not import invalid rows.
5. Capture a real success toast through the [Feedback journey](notifications-feedback.md#driving-it-with-verifyapp),
   with the app theme opposite the emulated system preference. Preserve the action and transient rendered toast before
   dismissal. An in-app SvelteKit navigation keeps the feedback observer; save `feedback state`, then run
   `feedback restore` before arming it again. A reload or full navigation discards it. Read the toaster's
   `data-sonner-theme` alongside the toast colors. Repeat in the other app theme. Provider persistence and toast
   appearance are distinct observations.
6. As `ictOperator`, use the
   [Critical Tasks readiness recipe](critical-tasks-completions-readiness.md#driving-it-with-verifyapp) to capture the
   Reports readiness band and data table with the unchanged seeded values. Readiness green/amber/red semantics, active
   controls and readable content must survive both themes and widths. Do not credit unrelated feature writes or
   all-feature access to `manager`.
7. Capture the app header's ghost **Toggle theme** button and actual semantic badges: the Personnel record header's
   warning badge (`<status> today`, for a Person with a Calendar status today); baseline/final must match. Read computed
   foreground, background, font size and weight, including the underlying card when colors have transparency. Resolve
   the effective colors to sRGB, record the method and compare text contrast with
   [WCAG 2.2's minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): normal text requires at
   least 4.5:1. Repeat for the import warning cell and affected light-mode status text. Preserve failures.
8. In a signed-out owned context, inspect `/` with its visible **Toggle theme** control and `/auth/login`, which has no
   theme control and follows the saved preference. Also inspect the authenticated Organization chooser
   `/dashboard?show=all`; it redirects signed-out callers to login. For both themes and widths, capture the
   public/Identity frame and brand, the rendered `data-theme`, saved preference, computed body background and reload
   persistence against the opposite system preference. Read the served HTML to confirm the retained pre-paint theme
   script and baseline/final inline-palette difference. This readback does not prove first paint.
   `performance_start_trace` writes only inside the checkout (for example `.verification/evidence/...`); its trace
   includes `disabled-by-default-devtools.screenshot` frames usable for early-frame readback. Frames before first paint
   show the browser canvas, so a trace is a readback, not a no-flash pass; record missing capability rather than
   switching browsers.
9. Use the ordinary three-Person briefing (no `seed training-print`) unless the Dense case is required. As the
   [Training report-print recipe](training-completions-reports.md#driving-it-with-verifyapp) specifies, select dark with
   the visible toggle, arm the print observer, choose native **Print brief**, retain pre-capture event counts, and save
   baseline/final PDFs with the documented `print state`/`print save` helpers. Compare retained content and appearance.
   The light-warning rule applies to the Training print override; other print paths retain their current theme behavior.
   If returned native controls support print-media emulation, read the resolved warning token there. The current
   Training print has no rendered warning consumer, so PDF parity alone cannot prove its color. Without print-media
   support record source-only token parity and unavailable live color proof, not a pass.
10. Compare the unchanged and final captures for these affected surfaces and states. Only changes the task approves may
    differ. Restore any UI-created data, then package baseline and final archives separately.

### Find a toolbar control on the row or in More

A workspace toolbar folds its least important controls into a `More <toolbar aria-label>` menu as the page narrows, so
the same control sits on the row at one width and in the menu at another. Take a fresh `take_snapshot` and look for the
control by its accessible name. If it is on the row, use it there. If it is not, open the `More <toolbar aria-label>`
button (for example `More Critical Tasks controls`), take a fresh snapshot of the open menu and choose the control from
it. A menu choice that opens a dialog runs after the menu finishes closing, so wait for the dialog in the next snapshot.
Record in the notes which side the control was on and at what viewport width. A row action with its own menu (Calendar
`Display`) opens that menu on the row, with a heading and checkbox toggles that keep it open after each choice; folded
into More it becomes a submenu, so open the submenu before its toggles appear. Do not resize only to make a control
reachable unless the recipe row asks for that width. `toolbar-sweep` in the [helper controls](#helper-controls) proves
the folding itself across widths.

## Native recording

Record with native `screencast_start`
`{"pageId":N,"filePath":".verification/evidence/verify-trooptotask/RUN/NAME.webm"}` and `screencast_stop`, exposed by
owned DevTools through `--experimentalScreencast` at 30 fps. They require ffmpeg on the clean PATH; info/doctor report
`recording.available` and its path/missing reason. `toolbar-sweep --record` stops before driving if absent. Paths must
be beneath `.verification/evidence/`, without `..`/symlinks below it, and end in `.webm`/`.mp4`. Cleanup stops running
recordings, but stop explicitly before ending a drive: unstopped files may be unplayable, and pages without painted
frames (e.g. about:blank) produce empty files. Frames keep the initial viewport size; smaller viewports are cropped into
the black frame's top left.

## Gotchas

Run
`npm run test -- src/lib/components/ui/tooltip/tooltip.test.ts src/lib/components/ui/sidebar/sidebar-menu-button.test.ts`
under the required Node/npm versions. These render the public barrels and assert caller-visible values, keyboard focus
and selected semantics. Tooltip checks cover generated and caller IDs, resolving descriptions, dismissal, custom child
rendering, references and Escape callbacks. Unconsumed components need this proof rather than a new test route.

Sidebar MenuButton checks cover current/ordinary destination closure, caller cancellation, modified/nonprimary
activation, non-navigation controls and the desktop preference. Retain AppDialog, ConfirmDialog and AppShellHeader
interaction tests alongside affected consumer tests. Text-only assertions cannot detect an empty ID or a broken
description.
