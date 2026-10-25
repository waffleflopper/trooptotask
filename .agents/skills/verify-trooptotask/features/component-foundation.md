# Component family interaction contracts

Members reach the shared form, selection, overlay, menu, tab, toast and loading families through ordinary Personnel,
settings, Training, Critical Tasks and admin screens. Each family's keyboard, focus, form, busy and live-region behavior
must come from its central component and hold in light and dark themes at narrow and wide widths.

## Sub-features

- `field-association`: a real form exposes its label, description and validation error to the control: the label names
  it, `aria-describedby` resolves to the visible description and error text, and `aria-invalid="true"` marks only the
  rejected control.
- `select-dismissal`: Select and Combobox popups close on Escape and on an outside click without committing a value or
  closing the enclosing dialog; focus returns to the trigger after Escape.
- `multi-select-semantics`: a multiple selection announces its selected count, each option exposes its checked state,
  every option is reachable by keyboard, and chip Backspace removes only the last chip.
- `overlay-dismissal`: a dialog closes from Escape, its close button and an outside click unless it is busy or holds an
  unsaved draft. A busy dialog sets `aria-busy="true"`, keeps focus inside and keeps every close path blocked until the
  operation settles; a draft blocks closing without `aria-busy`. While a save is pending its draft fields are disabled,
  a repeated submit sends nothing, and a failure leaves the draft editable. A confirmation stays open and busy until its
  action settles. An alert dialog requires an explicit choice. Sheets and popovers close on Escape and outside click and
  restore focus to their trigger.
- `menu-keyboard`: a dropdown menu moves focus with ArrowUp/ArrowDown, Home and End and by typeahead, and Escape closes
  it and returns focus to the trigger.
- `tabs-keyboard`: a tab set has one tab stop (roving `tabindex`), Arrow keys move between tabs and Home/End reach the
  ends, every tab's `aria-controls` resolves to a panel, and route navigation rendered as tabs remains link navigation.
- `toast-live-region`: toasts render inside a labelled polite live region, errors are announced, a keyboard-reachable
  control dismisses one toast, and several toasts stack without hiding each other's text.
- `remaining-families`: a paged table moves between pages, a search with no match shows its empty state, a tooltip's
  trigger is described by it, a date is chosen by keyboard, report date pickers are named by their labels, and a failed
  report load is announced as an alert.
- `loading-status`: a loading region that is a `role="status"` live region carries no `aria-busy`, so its text is
  announced before the region is removed; a section that stays mounted while it refreshes sets `aria-busy="true"` and
  clears it afterwards. A spinner exposes `role="status"` with an accessible name.

## How to get to it (user POV)

As a Personnel manager, Quick edit a roster row for its Rank and Group comboboxes and its ETS date popover, and use Add
Person for the Personnel dialog; use Manage Groups for Group creation; use the sidebar Switch organization menu and
account menu (the name card), Toggle theme and Send feedback. An Organization owner opens Settings, Members, the invite
strip's Role select and a row's Manage sheet with its Role radio group. A Critical Tasks operator records a completion
and opens Reports; on the matrix toolbar those controls and Import Completions fold into `More Critical Tasks controls`
as the page narrows. A Training manager opens Training Reports for the toolbar filters. A platform reviewer opens the
Admin Inbox for the Open and Done tabs. Personnel Details shows the record tabs (`Personnel detail sections`).

## Driving it with verify:app

Record each sub-feature as PASS, FAIL, UNAVAILABLE or UNRUN with the consumer, theme and width. A reproduced defect
stays FAIL until the same step passes on a later candidate.

Drive with visible controls, `press_key` and `hover`, and never change attributes. Preserve original rows with
`$V rows personnel orgA` and `$V rows groups orgA` before form work and compare afterwards.

**State reader.** Save this read-only function once as `reader.js` in the run directory and pass it to native
`evaluate_script`, with an optional element UID from the latest snapshot:

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
					pressed: n.getAttribute('aria-pressed'),
					selected: n.getAttribute('aria-selected'),
					checked: n.getAttribute('aria-checked'),
					sort: n.getAttribute('aria-sort'),
					current: n.getAttribute('aria-current'),
					disabled: n.disabled ?? null,
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
			busy: d.getAttribute('aria-busy'),
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

1. **Field association (`manager`, Personnel).** Open Able's Quick edit. Read the Rank, Last name and ETS controls: each
   needs a resolving label. Replace Last name with one space and choose Save. Require `aria-invalid="true"` on Last name
   only, an `aria-describedby` that resolves to the visible **Enter a last name.** text in a `role="alert"` message, and
   focus remaining on Save. Cancel and require unchanged rows. Then open Manage Groups, type Alpha into New group name
   and press Add. The duplicate is rejected; require the error text to be associated with the New group name input
   through `aria-describedby` and `aria-invalid="true"`, not only shown in an alert. Clear the input and choose Done;
   require unchanged Group rows. As `ictOperator`, choose Record Completion on Critical Tasks. Critical Task's **Select
   a person to narrow tasks by MOS.** and Validated By's **Optional rank and name of the validator** must resolve
   through each control's `aria-describedby`. Press Save with every field empty: each control with a visible **… is
   required** error needs `aria-invalid="true"` and an `aria-describedby` that resolves to that error. Cancel without
   saving. In a Members row's Manage sheet, the `Role` and `Preset` radio groups' visible help text must also resolve
   through each group's `aria-describedby`. As `orgOwner` on `settings/policies`, read the server HTML before hydration
   with a read-only `evaluate_script` that fetches `location.href` and parses the text with `DOMParser`: Training
   readiness goal's `aria-describedby` must resolve to its visible help text there.
2. **Combobox and Select dismissal (`manager`, `orgOwner`).** In Able's Quick edit, focus Rank and press Enter. Press
   Escape: the listbox closes, the form stays open, focus returns to Rank and the value is unchanged. Reopen Group with
   a click and click the Personnel page heading: the listbox closes, the form stays open and Group keeps its value.
   Cancel. As `orgOwner` on `settings/members`, focus the invite strip's `Role` select and press Enter, then Escape: the
   listbox closes, focus returns to `Role` and the value is unchanged. Reopen it and use ArrowDown to move between
   options without committing. The open listbox is named `Role`, never the selected value. Close it and require no
   invitation row.
3. **Multiple selection (`trainingConfigure`, Training Reports).** Open a WorkspaceToolbar multi-select filter. Require
   each option to expose its checked state and accessible name, ArrowDown/ArrowUp to reach every option, Space to toggle
   one, and the trigger's accessible name to report the selected count. Press Escape and require focus on the trigger.
   Clear the filter. Combobox chip Backspace removal needs a production `Combobox.Root multiple` consumer; when the
   source census finds none, record UNAVAILABLE with the census and keep the component test as the only proof.
4. **Dialog dismissal and busy close (`manager`, Personnel).** Open Add Person and click outside the dialog: it closes
   without saving and focus returns to Add Person. Reopen and use the close button: same result. Reopen and type a
   unique Last Name and First Name: the close button disappears and Escape and an outside click leave the dialog open,
   without `aria-busy`. Arm `$V network arm-hold PAGE personnel` and choose Add Personnel. While `network state` shows
   the held POST, press Escape, click outside and read Cancel: all close paths stay blocked, the dialog stays open and
   busy, and focus stays on the dialog rather than `body`. Release: the dialog closes, focus returns to Add Person and
   the new Person is listed; restore the control. Check the new Person's row and choose the bulk bar's `Archive…`: the
   alert dialog ignores an outside click and Escape closes it as Cancel, with focus returned to `Archive…` and the
   Person still active. Reopen it, arm `$V network arm-hold PAGE personnel/archive-batch` and choose Archive: while
   held, Escape is blocked, Cancel is disabled and focus stays on the `alertdialog` with `aria-busy="true"`. Release and
   restore the control: the Person leaves the roster and `$V rows personnel orgA last_name <name>` reads `archived_at`.
   Restore it through Settings → Archives → Restore, or `verify:app restart`, before relying on the fixture again. In
   Manage Groups, type a draft: the close button disappears and Escape is blocked, with no `aria-busy`. Arm
   `$V network arm-hold PAGE groups`, replace the draft with a unique name and press Add: while held the dialog is busy
   and focused. Release, restore, and remove the new Group through its Remove control. As `ictOperator`, choose Import
   Completions (on the row, or inside `More Critical Tasks controls` when folded; the dialog opens after the menu
   closes) and upload a CSV that repeats Able's seeded Alpha completion (same Person, task, date and method). Arm
   `$V network arm-hold PAGE personnel-ict-completions/batch` and press Import Checked Rows: while held the dialog is
   busy and focused and Escape is blocked. Release: the result reports 1 updated with the same completion ID and values.
   A dialog that is not busy must also keep focus when its focused control disables: as `onboardingOperate` on
   `onboarding`, open Start Onboarding, choose Able, arm `$V network arm-hold PAGE onboarding` and press Start
   Onboarding. While held, Start is disabled, focus is on the dialog rather than `body`, there is no `aria-busy`, and
   Escape closes the dialog. Release, then cancel Able's new packet through its visible Cancel Onboarding confirmation;
   repeat the held start and close it with Cancel instead. As `calendarConfigure` on `calendar/settings`, open Holidays
   & closures → New closure and add a unique one-day closure in a future month. Open its
   `More actions for <name>, <date>` → Edit, change Name, arm `$V network arm-hold PAGE special-days` and press Save
   Changes, then press Enter again. While held, the dialog is busy with focus on it, its fields, Cancel and Save Changes
   are disabled, Escape is blocked and `network state` shows one PUT. Release: the dialog closes and the new name is
   listed. Arm `$V network arm-fail PAGE special-days` and edit the name again: the failure toast shows, `aria-busy`
   clears and the dialog stays open with its draft and enabled fields; restore and Cancel the draft. Arm
   `$V network arm-hold PAGE special-days`, choose the closure's Remove and press Remove: while held the alert dialog is
   busy, Cancel is disabled and Escape is blocked; release and require the closure gone. The inline closure composer's
   held save is in [Special days](special-days.md).

   **Pending saves in other consumers.** For each consumer below, arm `$V network arm-hold PAGE FAMILY`, make the named
   change and submit, then submit again with Enter or a click where the control allows it. While held, require one
   matching request in `network state`, `aria-busy="true"` on the dialog or sheet (the alert dialog for a confirmation),
   focus inside it, every draft field and row action disabled and Escape blocked. Signed-scan Remove is the exception:
   only Remove and Close disable, and unrelated roster controls stay enabled. Release, require the saved result, restore
   the control and undo the change through the UI. As `trainingConfigure` on `training`, open SPC Baker's Training
   Records, choose Add on the Required training and type a unique Notes value (`personnel-trainings`); afterwards remove
   the record through Delete. Repeat with `arm-fail`: the failure toast shows and the draft stays editable; Cancel it.
   Choose Mark All Completed Today and Mark All (`personnel-trainings/batch`): the confirmation stays open and busy
   until release; afterwards remove each new Baker record. In Calendar settings → Holidays & closures → New closure, the
   two date pickers are named First day and Last day. Also hold Send feedback (`feedback`), a new Person in Add Person
   (`personnel`), a Training matrix cell's record dialog (`personnel-trainings`, where Delete and the exemption toggle
   are also disabled), Record Completion as `ictOperator` (`personnel-ict-completions`), Set Personnel Status as
   `calendarOperate` (`availability`), an Evals entry as `ratingOperate` (`rating-scheme`), Able's Data sheet
   (`personnel/ABLE_ID/data-sheet`, at 1280 width each visible field is named by its label), a new Sign-In Roster as
   `rosterManager` (`sign-in-rosters`), a signed scan's Remove (`sign-in-rosters/ROSTER_ID/upload`, Close disabled too),
   a Members row's `Manage` sheet as `orgOwner` (`settings/members/updateMemberAccess`), a Duty planner column's Clear
   month (column actions → `Clear month`) and its confirmation as `calendarConfigure` (`daily-assignments/batch`; the
   confirmation stays busy and the column actions button disabled while held), and a rank's Retire as `orgOwner` on
   `settings/ranks` (`settings/ranks/retireRank`, its row actions disabled; reactivate it afterwards).

5. **Sheet and popover dismissal (`orgOwner`, `manager`).** On `settings/members`, open a row's `Manage`. Press Escape:
   the sheet closes and focus returns to the opening button. Reopen and click the overlay outside the sheet: same
   result. As `manager`, open Able's Quick edit, open ETS and press Escape: only the popover closes, the form stays open
   and focus returns to ETS. Reopen ETS and click the Personnel page heading: only the popover closes. Cancel. The shell
   recipe owns the mobile sidebar sheet.
6. **Dropdown menu keyboard (`manager`).** Focus Switch organization and press Enter. Focus moves into the menu.
   ArrowDown and ArrowUp move between items and wrap or stop consistently, Home and End reach the first and last items,
   and typing an item's first letter moves to it. Escape closes the menu and returns focus to Switch organization.
   Record each focused item name. Repeat on the sidebar name card (`<name>, account menu`): Enter or Space opens it with
   focus on Account, the arrows wrap, typing `S` reaches Send feedback, and Escape returns focus to the card. At narrow
   width Switch organization and the name card are inside the sidebar drawer (Toggle Sidebar), where the account menu
   opens upward; the header Notifications menu has no items for this fixture.
7. **Tabs (`platformReviewer`, `manager`).** On `admin`, Tab into the Open/Done tabs. Require exactly one tab with
   `tabindex` 0, ArrowRight/ArrowLeft to move focus and selection, Home/End to reach the ends, and each tab's
   `aria-controls` to resolve to a tabpanel. A following Tab leaves the tab list for the active tabpanel, which shows an
   inset focus outline on all four sides. As `manager`, open Able's Details and read `Personnel detail sections`
   (Overview, Readiness, Log, Files, Data sheet, Archived): these are route links, so require link semantics with
   `aria-current="page"` on the current tab rather than a tab role without a tab list. Open Readiness and require
   `aria-current` to move to it.
8. **Toasts (`manager`).** Open Able's Quick edit, set MOS to `68C` and press Enter in the field. Read the toaster
   region: a labelled polite live region containing **Personnel updated**. Toasts last about four seconds, so hover the
   toast to hold it, then repeat from the focused row (E, MOS `68W`, Enter). Read both toasts: they stack, each with its
   own `Close toast`. Press Alt+T, Tab to a `Close toast` and press Enter: that toast is removed. Then open Add Person,
   type a Last Name and First Name, arm `$V network arm-fail PAGE personnel` and choose Add Personnel for an error toast
   reading **Failed to add personnel**; the dialog stays open with its draft. Restore and Cancel. Require all toasts
   readable and the error announced. Read the toaster's theme with each app theme.
9. **Loading status (`ictOperator`, `manager`).** On Critical Tasks Reports, arm
   `$V network arm-hold PAGE critical-tasks/reports/summary` and choose a Group in Filter by group. While held, require
   `aria-busy="true"` on the refreshing sections, a loading `role="status"` region with no `aria-busy`, and any spinner
   to expose `role="status"` and a name; after release require `aria-busy` cleared. Restore the control and return the
   filter to All Groups. As `manager`, open Send feedback, arm `$V network arm-hold PAGE feedback`, submit a unique
   message and read the busy submit control and spinner before release. Restore and verify one saved row.
10. **Remaining families (`manager`, `calendarView`, `ictOperator`).** Run `$V seed bulk-501` and choose A-Z on
    Personnel: the roster pages at 75, so Next moves to Page 2 of 7 and Previous returns to Page 1. Keyboard-focus Next
    (click the "Page 1 of 7" text, then Tab) and press Enter to the last page: when Next disables, focus must land on
    Previous, not `body`. Press Enter back to Page 1: when Previous disables, focus must land on Next. Search for a name
    that matches nobody and require **No personnel match your search.**; clear it by typing and deleting a character,
    since `fill` with an empty value does not refilter. Hover Toggle theme and require its `aria-describedby` to resolve
    to a `role=tooltip`; press Escape and require the tooltip and the `aria-describedby` gone. In Able's Quick edit, Tab
    from ETS's month navigation (Previous, Next, the month and year selects) into the grid, move with the arrow keys and
    press Enter: the summary reads `ETS None → <date>`, the popover closes and focus returns to ETS; Cancel. On
    `calendar/reports` the date range's Start and End pickers are named by their labels; select a Start date by keyboard
    and apply a year preset. On Critical Tasks Reports, `$V network arm-fail PAGE critical-tasks/reports/summary` and
    choose a Group: an assertive `role=alert` reports the failure. Restore and return to All Groups. A DataTable row
    detail (Settings, Ranks; Calendar Reports, Availability by day) wraps its text, never runs under a neighbouring
    column and stays inside the visible table at 390: scroll the table's `[data-slot=table-container]` to its end and
    read the `[data-slot=data-table-detail]` rect against the container's (its left edge stays at the container's plus
    8px). Every DataTable root has `container-type: inline-size`, and a table without a row detail keeps its width and
    horizontal scroll.
11. **Theme and viewport.** Run at least one consumer per family (steps 1 through 10) in the light and dark app themes
    at about 1280 by 800 and 390 by 844, using the [shared UI theme pass](shared-ui.md#theme-and-viewport) to select the
    theme and size the page. At narrow width require each popup, sheet and toast within the viewport and its controls
    usable.

A save that leaves Able's first and last names unchanged keeps the `verify-able` slug; only a name change regenerates
it.

## Gotchas

The reader's `name` approximates the accessible name; the snapshot's role and name are authoritative. Happy-dom
component tests do not prove native focus. `src/lib/components/ui/form-controls.test.ts`, `combobox/combobox.test.ts`,
`app-dialog/AppDialog.test.ts`, `confirm-dialog/ConfirmDialog.test.ts`, `overlay-teardown.test.ts`,
`sonner/sonner.test.ts`, `tabs/tabs.test.ts`, `dropdown-menu/dropdown-menu.test.ts`, `button/button.test.ts`,
`spinner/spinner.test.ts`, `tooltip/tooltip.test.ts`, `overlay-dismissal.test.ts`,
`patterns/workspace-toolbar/WorkspaceToolbar.test.ts` and `patterns/report-workspace/DateRangeField.test.ts` are the
lower-level proof. Happy-dom does not move focus on a mouse press, so only this recipe proves that pressing a dialog's
backdrop keeps focus in the dialog. Each Personnel save completes a real write; restore Able's MOS to `68W`, compare the
other fields and ignore `updated_at`. `form-controls.test.ts` renders Field descriptions and errors without caller IDs,
so it proves the Field family's own association. Manage Groups also blocks closing while its input holds text, so clear
the draft before Done. Its duplicate-name check runs before any request, so a duplicate never reaches a `groups` network
control. Feedback writes a real row; use a unique message and read it back with `$V communications manager`. Critical
Tasks Reports' Filter by group options may be absent from the snapshot; open the filter and choose a Group with
ArrowDown and Enter. With the `bulk-501` cohort the grouped roster pauses, so `login manager` and `actor` can time out
waiting for the page; the page still opens, so continue from `list_pages`.
