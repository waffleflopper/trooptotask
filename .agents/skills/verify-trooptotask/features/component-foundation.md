# Component family interaction contracts

Members reach the shared form, selection, overlay, menu, tab, toast and loading families through ordinary Personnel, settings, Training, Critical Tasks and admin screens. Each family's keyboard, focus, form, busy and live-region behavior must come from its central component and hold in light and dark themes at narrow and wide widths.

## Sub-features

- `field-association`: a real form exposes its label, description and validation error to the control: the label names it, `aria-describedby` resolves to the visible description and error text, and `aria-invalid="true"` marks only the rejected control.
- `select-dismissal`: Select and Combobox popups close on Escape and on an outside click without committing a value or closing the enclosing dialog; focus returns to the trigger after Escape.
- `multi-select-semantics`: a multiple selection announces its selected count, each option exposes its checked state, every option is reachable by keyboard, and chip Backspace removes only the last chip.
- `overlay-dismissal`: a dialog closes from Escape, its close button and an outside click unless it is busy; a busy dialog keeps every close path blocked until the operation settles. An alert dialog requires an explicit choice. Sheets and popovers close on Escape and outside click and restore focus to their trigger.
- `menu-keyboard`: a dropdown menu moves focus with ArrowUp/ArrowDown, Home and End and by typeahead, and Escape closes it and returns focus to the trigger.
- `tabs-keyboard`: a tab set has one tab stop (roving `tabindex`), Arrow keys move between tabs and Home/End reach the ends, every tab's `aria-controls` resolves to a panel, and route navigation rendered as tabs remains link navigation.
- `toast-live-region`: toasts render inside a labelled polite live region, errors are announced, a keyboard-reachable control dismisses one toast, and several toasts stack without hiding each other's text.
- `loading-status`: a loading region sets `aria-busy="true"` while it waits and clears it afterwards, and a spinner exposes `role="status"` with an accessible name.

## How to get to it (user POV)

As a Personnel manager, Edit a roster row for the Personnel form, its Rank and Group comboboxes and its ETS date popover; use Manage Groups for Group creation; use the header Account menu, Toggle theme and Send feedback. An Organization owner opens Settings, Members and Manage role & access for the Manage Access sheet and its Membership Role select. A Critical Tasks operator records a completion and opens Reports. A Training manager opens Training Reports for the toolbar filters. A platform reviewer opens Admin Feedback for the New, Reviewed and Resolved tabs. Personnel Details shows the artifact navigation.

## Driving it with verify:app

Expected results come from [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/patterns/), the [D03 issue](https://github.com/waffleflopper/trooptotask/issues/1581) and the [foundation contract](../../../../docs/ui-foundation-provenance.md#canonical-category-mapping), not from current output. Record each sub-feature as PASS, FAIL, UNAVAILABLE or UNRUN with the consumer, theme and width. A reproduced defect stays FAIL until the same step passes on a later candidate.

Use the index's owned worker, launch, doctor and native DevTools conventions. Take a fresh snapshot before each click. Drive with visible controls, `press_key` and `hover`; never call application handlers or change attributes. Preserve original rows with `$V rows personnel orgA` and `$V rows groups orgA` before form work and compare afterwards.

**State reader.** Every step reads focus, ARIA relationships and live regions the same way. Save this read-only function once as `reader.js` in the run directory and pass it to native `evaluate_script`, with an optional element UID from the latest snapshot:

```js
(el) => {
	const text = (n) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
	const ids = (n, a) =>
		(n?.getAttribute(a) ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.map((id) => ({ id, text: document.getElementById(id) ? text(document.getElementById(id)) : null }));
	const describe = (n) =>
		!n || n === document.body
			? n && 'body'
			: {
					tag: n.tagName.toLowerCase(),
					id: n.id || null,
					role: n.getAttribute('role'),
					name:
						n.getAttribute('aria-label') ??
						(ids(n, 'aria-labelledby')
							.map((x) => x.text)
							.join(' ') ||
							(n.labels?.[0] ? text(n.labels[0]) : text(n).slice(0, 60))),
					tabindex: n.getAttribute('tabindex'),
					expanded: n.getAttribute('aria-expanded'),
					selected: n.getAttribute('aria-selected'),
					checked: n.getAttribute('aria-checked'),
					state: n.getAttribute('data-state'),
					invalid: n.getAttribute('aria-invalid'),
					busy: n.getAttribute('aria-busy'),
					describedBy: ids(n, 'aria-describedby'),
					controls: ids(n, 'aria-controls')
				};
	return {
		target: el ? describe(el) : undefined,
		active: describe(document.activeElement),
		dialogs: [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map((d) => ({
			role: d.getAttribute('role'),
			state: d.getAttribute('data-state'),
			title: ids(d, 'aria-labelledby')
				.map((x) => x.text)
				.join(' ')
		})),
		live: [...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map((n) => ({
			tag: n.tagName.toLowerCase(),
			role: n.getAttribute('role'),
			live: n.getAttribute('aria-live'),
			label: n.getAttribute('aria-label'),
			text: text(n)
		})),
		busy: [...document.querySelectorAll('[aria-busy="true"]')].map((n) => ({
			tag: n.tagName.toLowerCase(),
			label: n.getAttribute('aria-label'),
			text: text(n).slice(0, 40)
		})),
		skeletons: document.querySelectorAll('[data-slot=skeleton]').length
	};
};
```

```bash
READ=$(sed '$ s/;$//' "$RUN/reader.js")
npm run --silent verify:app -- tool evaluate_script "$(jq -nc --argjson p "$PAGE" --arg f "$READ" '{pageId:$p,function:$f}')" --worker "$WORKER"
```

Add `args:[UID]` to read one element. Save each before/action/after read with the snapshot and a screenshot.

### Steps

1. **Field association (`manager`, Personnel).** Open Able's Edit. Read the Rank, Last Name and ETS controls: each needs a resolving label. Replace Last Name with one space and press Save Changes. Require `aria-invalid="true"` on Last Name only, an `aria-describedby` that resolves to the visible **Enter a last name.** text, and focus remaining in the dialog. Cancel and require unchanged rows. Then open Manage Groups, type Alpha into Organization groups and press Add. The duplicate is rejected; require the error text to be associated with the Organization groups input through `aria-describedby` and `aria-invalid="true"`, not only shown in an alert. Clear the input and choose Done; require unchanged Group rows. As `ictOperator`, choose Record Completion on Critical Tasks. Critical Task's **Select a person to narrow tasks by MOS.** and Validated By's **Optional rank and name of the validator** must resolve through each control's `aria-describedby`. Press Save with every field empty: each control with a visible **… is required** error needs `aria-invalid="true"` and an `aria-describedby` that resolves to that error. Cancel without saving. In step 2's Manage Access sheet, Membership Role's visible help text must also resolve through its `aria-describedby`.
2. **Combobox and Select dismissal (`manager`, `orgOwner`).** In Able's Edit, focus Rank and press Enter. Press Escape: the listbox closes, the dialog stays open, focus returns to Rank and the value is unchanged. Reopen Group with a click and click the dialog heading: the listbox closes, the dialog stays open and Group keeps its value. Cancel. As `orgOwner` on `settings/members`, open Manage role & access for `orgMember` and repeat both checks on the sheet's Membership Role select (the invite form behind the sheet has its own Membership Role; take the UID inside the `Manage Access` dialog), then use ArrowDown to move between options without committing. Close without saving and require the unchanged membership row.
3. **Multiple selection (`trainingConfigure`, Training Reports).** Open a WorkspaceToolbar multi-select filter. Require each option to expose its checked state and accessible name, ArrowDown/ArrowUp to reach every option, Space to toggle one, and the trigger's accessible name to report the selected count. Press Escape and require focus on the trigger. Clear the filter. Combobox chip Backspace removal needs a production `Combobox.Root multiple` consumer; when the source census finds none, record UNAVAILABLE with the census and keep the component test as the only proof.
4. **Dialog dismissal and busy close (`manager`, Personnel).** Open Able's Edit and click outside the dialog: it closes without saving and focus returns to Able's Edit. Reopen and use the close button: same result. Reopen, arm `$V network arm-hold PAGE personnel` and press Save Changes without edits. While `network state` shows the held request, press Escape, click outside and read the close button and Cancel. All close paths stay blocked, the dialog stays open and busy, and focus stays inside the dialog rather than falling to `body`. Release, require the dialog to close with the unchanged row, then restore the control. Open Able's Archive: the alert dialog ignores an outside click and Escape closes it as Cancel, with focus returned to Archive and Able still active.
5. **Sheet and popover dismissal (`orgOwner`, `manager`).** On `settings/members`, open Manage role & access. Press Escape: the sheet closes and focus returns to the opening button. Reopen and click the overlay outside the sheet: same result. As `manager`, open Able's Edit, open ETS and press Escape: only the popover closes and focus returns to ETS. Reopen ETS and click the dialog heading: only the popover closes. Cancel. The shell recipe owns the mobile sidebar sheet.
6. **Dropdown menu keyboard (`manager`).** Focus Account menu and press Enter. Focus moves into the menu. ArrowDown and ArrowUp move between items and wrap or stop consistently, Home and End reach the first and last items, and typing an item's first letter moves to it. Escape closes the menu and returns focus to Account menu. Record each focused item name. At narrow width Account menu is inside the sidebar drawer (Toggle Sidebar); the header Notifications menu has no items for this fixture.
7. **Tabs (`platformReviewer`, `manager`).** On `admin/feedback`, Tab into the New/Reviewed/Resolved tabs. Require exactly one tab with `tabindex` 0, ArrowRight/ArrowLeft to move focus and selection, Home/End to reach the ends, and each tab's `aria-controls` to resolve to a tabpanel. A following Tab leaves the tab list. As `manager`, open Able's Details and read the artifact navigation (Dashboard, Follow-ups, Counselings, Documents, Notes, Archived): these are route links, so require link semantics with `aria-current="page"` on the current section rather than a tab role without a tab list.
8. **Toasts (`manager`).** Open Able's Edit and Save Changes without edits. Read the toaster region: a labelled polite live region containing **Personnel updated**. Toasts last about four seconds, so stack them by keyboard: with focus on Able's Edit, press Enter, Tab to Last Name and press Enter to submit, then repeat. Read both toasts, then arm `$V network arm-fail PAGE personnel` and save again for an error toast; restore. Require all toasts readable, the error announced, and a keyboard-reachable dismiss control that removes one toast. Read the toaster's theme with each app theme.
9. **Loading status (`ictOperator`, `manager`).** On Critical Tasks Reports, arm `$V network arm-hold PAGE critical-tasks/reports/summary` and choose a Group in Filter by group. While held, require `aria-busy="true"` on the waiting regions and any spinner to expose `role="status"` and a name; after release require `aria-busy` cleared. Restore the control and return the filter to All Groups. As `manager`, open Send feedback, arm `$V network arm-hold PAGE feedback`, submit a unique message and read the busy submit control and spinner before release. Restore and verify one saved row.
10. **Theme and viewport.** Run at least one consumer per family (steps 1 through 9) in the light and dark app themes at about 1280 by 800 and 390 by 844, using the [shared UI theme pass](shared-ui.md#theme-and-viewport-preparation-for-phase-09) to select the theme and size the page. At narrow width require each popup, sheet and toast within the viewport and its controls usable.

Restore every armed control, remove UI-created rows and run `clean-seeds`. Able's re-derived slug cannot be restored through the UI, because each save derives it from the name; run `verify:app restart`, `doctor` and `fixture` on this worker before another journey relies on `verify-able`. Finish doctor and owned cleanup, then package the run.

## Gotchas

The reader's `name` approximates the accessible name; the snapshot's role and name are authoritative. Happy-dom component tests do not prove native focus, so these steps supply consumer proof while `src/lib/components/ui/form-controls.test.ts`, `combobox/combobox.test.ts`, `app-dialog/AppDialog.test.ts`, `confirm-dialog/ConfirmDialog.test.ts`, `overlay-teardown.test.ts`, `sonner/sonner.test.ts`, `tabs/tabs.test.ts`, `dropdown-menu/dropdown-menu.test.ts`, `button/button.test.ts`, `spinner/spinner.test.ts` and `tooltip/tooltip.test.ts` stay the lower-level proof. Each Personnel save completes a real unchanged write and re-derives the Person's slug from the name, so the fixture's `verify-able` becomes `able-synthetic`; compare the other fields and ignore `updated_at`. `form-controls.test.ts` renders Field descriptions and errors without caller IDs, so it proves the Field family's own association. Manage Groups also blocks closing while its input holds text, so clear the draft before Done. Feedback writes a real row; use a unique message and read it back.
