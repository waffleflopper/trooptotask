# Shared dialogs, date selection and tooltips

Members use shared controls through Personnel forms, import previews and navigation. Their keyboard actions, selected values, accessible descriptions and focus restoration must survive changes to the shared component implementation.

## Sub-features

- `tooltip-description`: pointer hover and keyboard focus expose a tooltip with a nonempty unique ID and `role="tooltip"`; the trigger's `aria-describedby` resolves to that content. Escape, blur and activation dismiss according to the existing trigger behavior.
- `dialog-focus`: a real dialog opens with its title, contains keyboard focus, cancels without saving and restores focus to its opening control.
- `confirmation-cancel`: an archive confirmation identifies the actual Person and cancels without archiving or losing the opening control's focus.
- `date-selection`: calendar navigation and date activation update the caller's draft; canceling the enclosing form preserves stored dates.
- `range-selection`: keyboard selection across a month boundary returns the exact start/end dates and retains usable focus. Caller date bounds prevent selection outside the allowed interval.
- `pagination-selection`: public page controls update the caller's page and record range; disabled controls cannot change it. Previous/Next page wrappers use supplied destinations, while PrevButton/NextButton provide adjacent-page and end-boundary behavior.

## How to get to it (user POV)

In Personnel, use a named row's Edit or Archive button. Edit contains ETS and PCS / DEROS date pickers. Import opens the file preview with validation hints. Toggle Sidebar collapses desktop navigation; its icon links and the header theme button expose tooltip labels. An admitted platform administrator uses the same sidebar on Admin screens.

Range-calendar and pagination currently have no production callers. Their public component tests establish their interactions separately; a DataTable or Admin directory's unrelated paging buttons do not exercise the shared Pagination family. Recheck the source-aware consumer census before relying on this scope after future application changes.

## Driving it with verify:app

Preparation status: **source-mapped**. These are expected results, not a passing run. Keep baseline failures and final observations separate under the [evidence contract](../../../../docs/architecture/DEFINITION_OF_DONE.md#packaging-durable-artifacts).

Use the index's owned worker, Node runtime, launch, doctor and native DevTools conventions. Sign in normally as `manager` and retain its page/Organization IDs. The existing actors, upload control and read-only DOM inspection suffice; no additional browser service is required. Preserve the original Personnel rows with `$V rows personnel orgA` before any form interaction and compare them after canceling.

1. **App navigation tooltip.** On desktop, collapse Toggle Sidebar. Hover Home and capture the tooltip, then use Tab/Shift+Tab to focus an icon link and inspect the focused element. Record the visible label, content ID/role, the trigger's `aria-describedby` and the element it resolves to. The ID must be nonempty and unique within the document. Press Escape and require dismissal without losing trigger focus. Follow an allowed link and require the new page without retained tooltip content. Expand the sidebar and confirm ordinary labeled navigation remains usable.
2. **Header tooltip.** Reach Toggle theme with Tab, preserving the fresh focus snapshot. Apply the same semantic checks. Escape must dismiss while preserving button focus. Hover and activate it, verify dismissal, and restore the original theme with the same control. A tooltip appearing visually does not establish its accessible relationship.
3. **Import validation tooltip.** Follow Import and upload a local synthetic CSV through Upload personnel file. Use the [Personnel lifecycle recipe](personnel-records-lifecycle.md#driving-it-with-verifyapp)'s invalid rank/date row. Wait for Preview Rows to become enabled, open the preview and inspect the actual Row N Rank and ETS fields. Hover and keyboard-focus a field with a validation issue. Its visible tooltip must carry the same issue, a unique ID, the tooltip role and a resolving `aria-describedby`. The invalid row stays unselectable and its field remains editable. Cancel without importing and require unchanged original rows.
4. **Dialog and date picker.** Open Able's Edit button and require Edit Personnel plus usable focus inside the dialog. Use Tab and Shift+Tab at its boundaries to check focus containment. Open ETS, move to the previous month and back, and select a literal named date from the grid. Record the selected-date announcement and the draft value through read-only DOM inspection. Keyboard date movement/activation must retain usable grid focus until selection closes the popover. Cancel with Escape and require the original Edit button focused, no remaining modal and unchanged stored ETS/DEROS. Reopen to confirm the canceled draft is absent.
5. **Confirmation.** Open Able's Archive button. Require an alertdialog naming Able with the retained-history explanation and Cancel/Archive actions. Choose Cancel, require focus restored to the same Archive button and verify Able remains active with unchanged dates. This cancel probe supplies no archive-mutation or server-authorization proof.
6. **Platform navigation.** Use `$V actor platformReviewer admin/users` through normal sign-in. Inspect actual admitted Users content, collapse Toggle Sidebar and repeat the Users link's tooltip semantics/dismissal. Recheck shared mobile navigation under the [shell recipe](shell-preferences.md#driving-it-with-verifyapp) when changing Tooltip layering or visibility rules; desktop tooltip proof alone does not establish mobile drawer behavior.

Native `evaluate_script` may read `document.activeElement`, tooltip/trigger attributes and `document.getElementById` results. Use visible controls for actions; do not call application handlers or alter attributes to manufacture a pass. Save before/action/after snapshots and screenshots. Restore controls, finish doctor and dispose only the owned worker before packaging or adopting updated instructions.

## Gotchas

Run `npm run test -- src/lib/components/ui/tooltip/tooltip.test.ts src/lib/components/ui/range-calendar/range-calendar.test.ts src/lib/components/ui/pagination/pagination.test.ts` under the required Node/npm versions. These render the public barrels, use literal expected dates/pages and assert caller-visible values, disabled selection, keyboard focus and selected semantics. Tooltip checks cover generated and caller IDs, resolving descriptions, dismissal, custom child rendering, references and Escape callbacks. Unconsumed components need this proof rather than a new test route.

Retain AppDialog, ConfirmDialog and AppShellHeader interaction tests alongside affected consumer tests. Text-only assertions cannot detect an empty ID or a broken description. A source-aware import scan establishes cycle removal and reverse consumers separately from these user interactions. Full required checks and production build remain candidate gates.

The audited Bits UI patch keeps RangeCalendar's placeholder synchronized with changes to the start date. Completing an end date must preserve keyboard focus even when that date lies beyond the start month's trailing week. Caller-driven start-date changes still update the displayed month.

Known unchanged baselines must remain failures until reproduced repairs pass. Completing a cross-month range must not strand focus on the document body; a disabled pagination destination must not change the caller's page through Enter. Record any unreachable consumer or unavailable native probe explicitly. This recipe does not activate Phase 09 or verify D29's mixed-owner utility/provider work.
