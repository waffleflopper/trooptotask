# Shared composition equivalence

Members meet the shared type-management workspace, import flow, readiness band, report chart, requirement status badge,
route tabs and workspace toolbar through ordinary Training, Onboarding, Critical Tasks, Personnel, Calendar, settings
and account screens. A styling or markup migration of one of these compositions leaves every consumer's computed
appearance, structure and keyboard behavior unchanged unless the issue's acceptance changes it.

## Sub-features

- `type-management`: Onboarding Templates render a keyboard `grid` of `row` elements, a detail form with `Collapsible`
  disclosures (a trigger `button` with `aria-expanded`, not `details`/`summary`) and a color field, and per-row action
  toolbars.
- `import-flow`: Personnel, Training, Calendar status and the Critical Tasks task library and completion import pages
  render the shared File, Columns, Review and Done steps, fix rail, review list and receipt.
- `readiness-band`: Training Reports and Critical Tasks Reports render ramp and semantic tiles, drop markers and a
  legend.
- `report-chart`: Critical Tasks Reports render Bar, Line and ChartTable charts, Training Reports renders the Forecast
  chart. Platform `/admin` renders Inbox rather than a report chart.
- `requirement-status-badge`: the Training matrix, record modal and Critical Tasks screens render Current, Expiring,
  Expiring Soon, Expired, Exempt, N/A, Not Done and Not Required.
- `route-tabs`: Organization settings, Personnel detail and Account pages render link navigation as tabs, including
  count badges.
- `workspace-toolbar`: Critical Tasks renders one fitted row at every width, folding its least important controls into
  `More Critical Tasks controls` and its search into an icon last. Calendar, Personnel and Training fold their least
  important controls into `More <toolbar label> controls` as the container narrows. Calendar and Personnel keep one
  fitted row; Training's search takes its own row below a 480px toolbar width.
- `shared-defects`: empty-state titles are headings, an Organization page has one `main` landmark, a dialog has one
  Close control, and the type-management grid moves between rows with arrow keys.

## How to get to it (user POV)

Use Organization navigation to reach Training (Types, Views, Reports, the matrix and its import page), Onboarding
(Templates), Critical Tasks (Library and its import page, Reports, Completions import page), Personnel (import page,
detail), Calendar (Bulk, Reports) and settings (General, Members, Ranks). Account Profile and Security and platform
`admin` use the same shell. Switch the theme with `Toggle theme`, and the width with `resize_page`.

## Driving it with verify:app

### Helper controls

Styling-migration equivalence uses the [shared composition recipe](shared-compositions.md).
`style-probe PAGE FILE.json [SELECTOR ...]` writes a new evidence-root `.json` of tag, role, text, attributes, size and
computed styles for the default shared-composition selectors and any extras, without events, attribute writes or
scrolling. `style-diff BEFORE.json AFTER.json` lists every difference between two such files. Run
`node --test .agents/skills/verify-trooptotask/helpers/style-probe.test.mjs` for its boundaries.

### Journeys

The [component contracts](component-foundation.md) apply. Record each step PASS, FAIL, UNREACHABLE or UNRUN with actor,
width and theme. A FAIL stays FAIL until the same step passes on a later candidate. Never edit the application while a
run holds a candidate: edit, commit and relaunch first.

1. Launch and `doctor`. Use `$V actor ROLE ROUTE` for `orgOwner` (settings, Personnel, Training), `onboardingConfigure`
   (Templates), `ratingConfigure` (Evals), `ictConfigurator` (Critical Tasks Library), `ictOperator` (denied Library)
   and `ictEmpty`/`trainingEmpty` (empty states). Record the returned page and Organization IDs.
2. Seed the states a screen needs: `$V seed training-print` (112 Personnel, 24 types, readiness drops, tiles, Expiring
   and Not Required) for the readiness band, charts and badges, and `$V seed personnel-lifecycle` for the Archives tab
   badge. A pending invitation made through Members supplies its badge. Remove UI-created rows through the UI and run
   `$V clean-seeds` last.
3. Capture a read-only computed-style probe at each page, width and theme. `style-probe` accepts the evidence-root
   `.json` paths of this worker only and refuses to overwrite:

   ```bash
   $V style-probe PAGE .verification/evidence/verify-trooptotask/RUN/probe/training-types_1280-light.json
   $V style-probe PAGE FILE.json 'EXTRA SELECTOR' ...      # extra selectors append to the defaults
   ```

   The defaults cover the type-management, readiness-band, chart (and its SVG children), badge, route-tabs, toolbar,
   empty-state, listbox, radio, details/summary, heading, dialog and alert selectors. Each element records tag, role,
   text, attributes, size and 28 computed properties (colors, borders, radius, shadow, size, display, spacing, type,
   outline, SVG paint). Pair it with `take_snapshot` and `take_screenshot` `filePath` captures.

4. After the candidate runs the same pages, diff each pair. A `0` count is equivalence; every listed difference needs an
   expected-change reason from the issue:

   ```bash
   $V style-diff BASELINE.json CANDIDATE.json
   ```

   Rerun a probe against the same page to prove the read is deterministic; a reload and a second read must also give
   `0`. State the matched counts, because a selector that matches nothing proves nothing.

5. Keyboard, from a real `focus()` on a control followed by native `press_key`. Onboarding Templates: Tab order,
   ArrowDown/ArrowUp/Home/End and the disclosure trigger `button` with Enter and Space, reading its `aria-expanded`
   after each key. Record the focused element's tag, role and name, and the `aria-selected` of its `row`, after each key.
   Right moves from a row to its actions, Left back, and Enter selects the row. After a successful create,
   `document.activeElement` is the new row. At 390 wide the list and detail take turns: selecting a row leaves
   `document.activeElement` on the detail heading (`tabindex="-1"`), Back leaves it on the selected row, and a successful
   create leaves it on the new item's detail heading. Training Types instead uses a reorderable list: focus a grip and
   use Alt+ArrowUp/ArrowDown, then restore the order. Enter/Space on a type name opens its edit sheet; closing returns
   focus to the opener, and successful creation returns to the new type's name. Manage views uses list buttons inside
   a sheet: Enter/Space opens an editor, and `Back to all views` returns to the list. Route tabs are links: Tab and
   Shift+Tab move focus, Enter navigates and the active link carries `aria-current="page"`. They have no arrow-key
   selection contract.
6. Shared defects: count `main` and nested `main` on an Organization page and an admin page; read the tag of each
   `[data-slot="empty-title"]` in the empty states; read the Close controls of the Training roster dialog.
7. Toolbar: read the `workspace-toolbar`, its select trigger, input group and action label at 1280, 820 and 390 widths.
   The Critical Tasks toolbar is one row at all three widths (no action labels to hide); read its row buttons and More
   button through the default `[data-toolbar-item]`/`[data-toolbar-more]` selectors, which skip the hidden measuring
   copies, and prove the folding with `toolbar-sweep`. Calendar, Personnel and Training expose the same row and More
   selectors, with no action labels to hide. Training's search stacks above the row below a 480px toolbar width;
   compare that state separately from controls folding into More.
8. Failure states: `network arm-fail` for the Types and Templates create, then `network restore`.

Run `node --test .agents/skills/verify-trooptotask/helpers/style-probe.test.mjs` for the probe and diff boundaries.

## Gotchas

- The probe measures the page it is on. Identical pages need identical state: the same seeds, rows, theme, width and
  open dialogs.
- The theme belongs to the browser context. Account pages have no Toggle theme control; set the theme on an Organization
  page first and read `html[data-theme]`.
- Every page, including Account and the Organization suspended and session-unavailable states, has exactly one `main`. A
  nested `main#main-content` inside the shell `main`, or an Account page with none, is a FAIL.
- The Critical Tasks Library denies `ictOperator`; use `ictConfigurator` for the library itself and keep the denial as
  its own state.
- At 390 wide the Personnel and Training `Import` actions are in `More Personnel controls` and `More Training controls`.
  Calendar's `Import CSV` is always under the pinned `Bulk Status` menu. Critical Tasks uses
  `More Critical Tasks controls`, which also holds its view, filters and Reports.
- The probe caps each selector at 200 elements. Large readiness sets compare the first 200; state the count.
