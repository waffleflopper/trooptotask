# Accessibility (Section 508 / WCAG 2.1 AA) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring TroopToTask to WCAG 2.1 Level AA compliance across the design system, shared components, and feature components.

**Architecture:** Three-wave approach — (1) CSS foundation fixes that cascade globally, (2) shared component ARIA/keyboard fixes that affect every page, (3) feature-specific fixes. Each task is independently committable and testable.

**Tech Stack:** SvelteKit 2.5, Svelte 5 (runes), CSS custom properties, no Tailwind.

**Governing Standard:** Section 508 (aligned to WCAG 2.1 AA). Reference: https://www.w3.org/WAI/WCAG21/quickref/?levels=aaa

---

## Chunk 1: CSS Design System Foundation

### Task 1: Fix Color Contrast Ratios (Light and Dark Mode)

**Files:**

- Modify: `src/app.css:26-28` (light mode color variables)
- Modify: `src/app.css:142-144` (dark mode color variables in `[data-theme='dark']` block)

- [ ] **Step 1: Update light mode muted/disabled text colors**

In `src/app.css`, update the `:root` CSS custom properties (~lines 26-28):

```css
/* Before */
--color-text-secondary: #757575;
--color-text-muted: #9e9e9e;
--color-text-disabled: #bdbdbd;

/* After — meet 4.5:1 on white (#fff) and surface (#fafafa) */
--color-text-secondary: #616161; /* 5.91:1 on white */
--color-text-muted: #757575; /* 4.60:1 on white */
--color-text-disabled: #9e9e9e; /* 3.21:1 — acceptable for disabled per WCAG 1.4.3 exception */
```

Note: WCAG 1.4.3 explicitly exempts "text that is part of an inactive user interface component" from contrast requirements. `--color-text-disabled` is acceptable at lower contrast.

- [ ] **Step 2: Update dark mode muted text color**

In the `[data-theme='dark']` block (~lines 142-144), the muted color fails on surface backgrounds:

- `#808080` on `--color-surface: #1e1e1e` = 4.22:1 (fails 4.5:1)

Update:

```css
/* Before */
--color-text-secondary: #b3b3b3;
--color-text-muted: #808080;
--color-text-disabled: #4d4d4d;

/* After */
--color-text-secondary: #b3b3b3; /* 7.95:1 on surface — already good */
--color-text-muted: #8c8c8c; /* 4.78:1 on #1e1e1e surface — passes AA */
--color-text-disabled: #4d4d4d; /* exempt for disabled elements per WCAG 1.4.3 */
```

- [ ] **Step 3: Verify both themes visually**

Run: `npm run dev` and spot-check pages in both light and dark mode. Toggle with the theme button in the avatar menu. Muted text should be slightly adjusted but not jarring in either mode.

Also verify: landing page hero sections, pricing page, TopHeader — these use hardcoded colors (#F0EDE6 on #0F0F0F, #8A8780 on #0F0F0F) and already pass AA (16.39:1 and 5.35:1 respectively). No changes needed for those.

- [ ] **Step 4: Commit**

```bash
git add src/app.css
git commit -m "a11y: improve text color contrast ratios for light and dark mode

Darken light mode --color-text-secondary and --color-text-muted to meet
4.5:1 on light backgrounds. Lighten dark mode --color-text-muted to meet
4.5:1 on dark surface backgrounds. Both themes now WCAG 2.1 AA compliant."
```

---

### Task 2: Add Reduced Motion Support

**Files:**

- Modify: `src/app.css` (add media query at end, before closing)
- [ ] **Step 1: Add `prefers-reduced-motion` media query to `app.css`**

Add at the end of `src/app.css`, after all existing media queries:

```css
/* Accessibility: Reduced motion */
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
		scroll-behavior: auto !important;
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app.css
git commit -m "a11y: add prefers-reduced-motion support

Disables animations and transitions for users who prefer reduced motion.
Covers spinners, modal transitions, and all CSS animations globally."
```

---

### Task 3: Add Forced Colors (High Contrast) Support

**Files:**

- Modify: `src/app.css` (add media query, fix focus styles)

- [ ] **Step 1: Fix input/select focus styles to work in forced-colors mode**

Find the `.input:focus` and `.select:focus` rules in `src/app.css` (~lines 380, 411). Add an `outline` fallback alongside the existing `box-shadow`:

```css
/* In .input:focus (around line 380) — replace outline: none with transparent outline */
.input:focus {
	outline: 2px solid transparent; /* visible in forced-colors mode */
	border-color: var(--color-primary);
	box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.15);
}

/* Same for .select:focus (around line 411) */
.select:focus {
	outline: 2px solid transparent;
	border-color: var(--color-primary);
	box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.15);
}
```

The `outline: 2px solid transparent` trick: browsers in forced-colors mode ignore box-shadow but render outlines using system colors. Transparent outline is invisible normally but becomes visible in high contrast.

- [ ] **Step 2: Add checkbox focus style**

Find the `input[type="checkbox"]` rule (~line 431) and add a focus style after it:

```css
input[type='checkbox']:focus-visible {
	outline: 2px solid var(--color-primary);
	outline-offset: 2px;
}
```

- [ ] **Step 3: Add forced-colors media query**

Add after the `prefers-reduced-motion` query at the end of `src/app.css`:

```css
/* Accessibility: Windows High Contrast Mode */
@media (forced-colors: active) {
	.btn {
		border: 1px solid ButtonText;
	}

	.btn-primary {
		background-color: Highlight;
		color: HighlightText;
	}

	.input,
	.select {
		border: 1px solid ButtonText;
	}

	.input:focus,
	.select:focus {
		outline: 2px solid Highlight;
	}
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app.css
git commit -m "a11y: add forced-colors support and fix focus indicators

Add outline fallbacks for inputs/selects visible in Windows High Contrast.
Add checkbox focus-visible style. Add forced-colors media query for buttons
and form elements."
```

---

### Task 4: Fix Touch Target Sizes

**Files:**

- Modify: `src/app.css:321` (btn-sm), `src/app.css:431` (checkbox)

- [ ] **Step 1: Increase `.btn-sm` min-height**

Find `.btn-sm` (~line 321) and update:

```css
/* Before */
.btn-sm {
	padding: 6px 16px;
	font-size: var(--font-size-sm);
	min-height: 32px;
}

/* After */
.btn-sm {
	padding: 8px 16px;
	font-size: var(--font-size-sm);
	min-height: 36px;
}
```

Note: Going to 44px would be ideal for WCAG 2.5.5 (AAA) but would be visually disruptive. 36px meets the WCAG 2.5.8 (AA) target size of 24px with spacing, and is a reasonable compromise.

- [ ] **Step 2: Increase checkbox touch target**

Update `input[type="checkbox"]` (~line 431):

```css
input[type='checkbox'] {
	width: 20px;
	height: 20px;
	accent-color: var(--color-primary);
	cursor: pointer;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app.css
git commit -m "a11y: increase touch target sizes for buttons and checkboxes

Bump .btn-sm min-height to 36px and checkbox to 20px for better
touch/pointer accessibility per WCAG 2.5.8."
```

---

## Chunk 2: Shared Component Fixes

### Task 5: Fix Modal Focus Management

**Files:**

- Modify: `src/lib/components/Modal.svelte:43,91`

- [ ] **Step 1: Focus first focusable element instead of overlay on mount**

In `Modal.svelte`, find the `onMount` block (~line 41). Change `overlayEl?.focus()` to focus the first focusable child:

```typescript
onMount(() => {
	previouslyFocused = document.activeElement as HTMLElement;
	// Focus first focusable element inside the dialog, or the overlay as fallback
	const firstFocusable = overlayEl?.querySelector<HTMLElement>(FOCUSABLE);
	if (firstFocusable) {
		firstFocusable.focus();
	} else {
		overlayEl?.focus();
	}
	return () => previouslyFocused?.focus();
});
```

- [ ] **Step 2: Fix backdrop button — hide from assistive tech**

Find the backdrop button (~line 91). Remove the `aria-label` and add `aria-hidden`:

```svelte
<!-- Before -->
<button class="modal-backdrop" onclick={handleClose} tabindex="-1" aria-label="Close dialog"></button>

<!-- After -->
<button class="modal-backdrop" onclick={handleClose} tabindex="-1" aria-hidden="true"></button>
```

The backdrop is a visual affordance only — it shouldn't be announced to screen readers since it's not focusable (`tabindex="-1"`).

- [ ] **Step 3: Verify modals still work**

Run: `npm run dev`, open any modal (e.g., add personnel), verify:

- Focus moves into the modal on open
- Tab cycles within the modal
- Escape closes it
- Focus returns to the trigger button on close

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Modal.svelte
git commit -m "a11y: fix modal focus management and backdrop semantics

Focus first focusable element on open instead of overlay div.
Hide backdrop button from assistive tech with aria-hidden."
```

---

### Task 6: Fix Spinner Accessibility

**Files:**

- Modify: `src/lib/components/ui/Spinner.svelte`

- [ ] **Step 1: Add `role="status"` and screen reader label to Spinner**

The Spinner is decorative when next to visible text like "Saving..." but informative when used alone. Add `aria-hidden` since it's always paired with visible loading text in this codebase:

```svelte
<span class="spinner" style:--spin-color={color} style:width="{size}px" style:height="{size}px" aria-hidden="true"
></span>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/ui/Spinner.svelte
git commit -m "a11y: add aria-hidden to decorative Spinner component

Spinner is always paired with visible text (e.g. 'Saving...') so it
should be hidden from screen readers to avoid duplicate announcements."
```

---

### Task 7: Fix FileUpload Keyboard Accessibility

**Files:**

- Modify: `src/lib/components/ui/FileUpload.svelte`

- [ ] **Step 1: Make drop zone keyboard accessible**

Find the drop zone div (~line 142, with the `<!-- svelte-ignore a11y_no_static_element_interactions -->` comment). Replace the static div approach with a keyboard-accessible pattern:

```svelte
<!-- Remove the svelte-ignore comment -->
<div
	class="drop-zone"
	class:drag-over={dragOver}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="button"
	tabindex="0"
	aria-label="Drop file here or press Enter to choose"
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput?.click(); }}}
>
```

- [ ] **Step 2: Add `aria-live` region for upload status**

Find the area where upload progress/errors are shown. Wrap the status area with an `aria-live` region. Add this attribute to the container that shows uploading state and error messages:

Look for the conditional block that shows the uploading state (spinner + filename) and error messages. Add `aria-live="polite"` to the parent container of those states:

```svelte
<div aria-live="polite">
	{#if uploading}
		<div class="upload-status">
			<Spinner size={14} /> Uploading {fileName}...
		</div>
	{/if}
	{#if errorMsg}
		<p class="error-msg" role="alert">{errorMsg}</p>
	{/if}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ui/FileUpload.svelte
git commit -m "a11y: make FileUpload keyboard accessible with live status

Add role/tabindex/keydown to drop zone for keyboard users.
Add aria-live region for upload status and role=alert for errors."
```

---

### Task 8: Fix SearchSelect ARIA Roles

**Files:**

- Modify: `src/lib/components/ui/SearchSelect.svelte`

- [ ] **Step 1: Add combobox ARIA pattern**

Find the main input/button wrapper. Add combobox ARIA attributes:

First, add a unique ID prop to avoid conflicts when multiple SearchSelect instances exist on one page. In the Props interface and destructuring (~line 7-15):

```typescript
interface Props {
	options: Option[];
	value: string;
	placeholder?: string;
	disabled?: boolean;
	onchange?: (value: string) => void;
	id?: string;
}

let {
	options,
	value = $bindable(),
	placeholder = 'Search...',
	disabled = false,
	onchange,
	id = `searchselect-${Math.random().toString(36).slice(2, 8)}`
}: Props = $props();
```

On the text input (~line 101), add ARIA combobox attributes. Note: the variable is `highlightIndex` (not `highlightedIndex`):

```svelte
<input
	bind:this={inputEl}
	class="input search-input"
	type="text"
	bind:value={query}
	{placeholder}
	onfocus={handleFocus}
	onblur={handleBlur}
	onkeydown={handleKeydown}
	{disabled}
	role="combobox"
	aria-expanded={open}
	aria-controls="{id}-listbox"
	aria-autocomplete="list"
	aria-activedescendant={highlightIndex >= 0 ? `${id}-option-${highlightIndex}` : undefined}
/>
```

On the dropdown `<ul>` (~line 129):

```svelte
<ul class="dropdown" bind:this={listEl} id="{id}-listbox" role="listbox">
```

The dropdown items currently use `<li>` containing `<button>`. To follow the ARIA listbox pattern correctly, replace the inner buttons with styled divs since `role="option"` elements should not contain interactive children (~lines 133-145):

```svelte
{#each filtered as opt, i (opt.value)}
	<li
		id="{id}-option-{i}"
		class="dropdown-item"
		class:highlighted={i === highlightIndex}
		class:selected={opt.value === value}
		role="option"
		aria-selected={opt.value === value}
		onmousedown={() => selectOption(opt)}
	>
		{opt.label}
	</li>
{/each}
```

Then move the `.dropdown-item` styles from targeting `button` to targeting `li` directly. Remove the nested `<button>` entirely. Add `cursor: pointer` to `.dropdown-item` if not already present.

- [ ] **Step 2: Add aria-label to clear button**

Find the clear button (~line 123) and add a label:

```svelte
<button
	...existing props...
	aria-label="Clear selection"
	type="button"
>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ui/SearchSelect.svelte
git commit -m "a11y: add combobox ARIA pattern to SearchSelect

Add role=combobox, aria-expanded, aria-controls, aria-activedescendant
to input. Add role=listbox/option to dropdown. Label clear button."
```

---

### Task 9: Add Skip Navigation Link

**Files:**

- Modify: `src/lib/components/TopHeader.svelte` (add skip link)
- Modify: `src/routes/org/[orgId]/+layout.svelte` (add landmark id to main)

- [ ] **Step 1: Add skip-to-content link as first child of TopHeader**

At the very top of the `<header>` element in `TopHeader.svelte` (~line 37), add:

```svelte
<header class="top-header">
	<a href="#main-content" class="skip-link">Skip to main content</a>
	<!-- ...rest of header... -->
```

- [ ] **Step 2: Add matching id to main element in layout**

In `src/routes/org/[orgId]/+layout.svelte`, find the `<main>` tag (~line 96) and add the id:

```svelte
<main id="main-content">
```

- [ ] **Step 3: Add skip-link CSS to TopHeader's `<style>` block**

```css
.skip-link {
	position: absolute;
	top: -100%;
	left: var(--spacing-md);
	background: var(--color-primary);
	color: white;
	padding: var(--spacing-sm) var(--spacing-md);
	border-radius: var(--radius-md);
	z-index: 200;
	font-weight: 600;
	text-decoration: none;
}

.skip-link:focus {
	top: var(--spacing-sm);
}
```

- [ ] **Step 4: Add `aria-current="page"` to active nav tabs**

Find the nav links in TopHeader. Each link that has `class:active={...}` should also get `aria-current`:

The nav links use pre-computed derived booleans (e.g., `isDashboardActive`, `isCalendarActive`). Use those same variables for `aria-current`:

```svelte
<a
	href="/org/{orgId}"
	class="nav-tab"
	class:active={isDashboardActive}
	aria-current={isDashboardActive ? 'page' : undefined}
>
	Dashboard
</a>
```

```svelte
<a
	href="/org/{orgId}/calendar"
	class="nav-tab"
	class:active={isCalendarActive}
	aria-current={isCalendarActive ? 'page' : undefined}
>
	Calendar
</a>
```

Apply this pattern to all 6 nav links: Dashboard (`isDashboardActive`), Calendar (`isCalendarActive`), Personnel (`isPersonnelActive`), Training (`isTrainingActive`), Onboarding (`isOnboardingActive`), Leaders Book (`isLeadersBookActive`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/TopHeader.svelte src/routes/org/[orgId]/+layout.svelte
git commit -m "a11y: add skip navigation link and aria-current to nav

Add visually-hidden skip link that appears on focus for keyboard users.
Mark active nav tab with aria-current=page for screen readers."
```

---

### Task 10: Fix NotificationBell Accessibility

**Files:**

- Modify: `src/lib/components/ui/NotificationBell.svelte`

- [ ] **Step 1: Update bell button with dynamic label and haspopup**

The bell button (~line 123) already has `aria-label="Notifications"` and `aria-expanded={open}`. Update the existing `aria-label` to be dynamic and add `aria-haspopup`:

```svelte
<button
	class="bell-button"
	type="button"
	onclick={toggle}
	aria-label={localUnreadCount > 0 ? `Notifications, ${localUnreadCount} unread` : 'Notifications'}
	aria-expanded={open}
	aria-haspopup="true"
>
```

The variable is `localUnreadCount` (not `unreadCount`) — see the component's internal state.

- [ ] **Step 2: Add Escape key handler to close dropdown**

Find the click-outside handler (~line 107). Add an Escape key handler nearby:

```typescript
function handleKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape' && open) {
		open = false;
	}
}
```

Add `onkeydown={handleKeydown}` to the dropdown's container div or use `svelte:window`:

```svelte
<svelte:window onkeydown={handleKeydown} />
```

- [ ] **Step 3: Add `role="region"` and `aria-label` to dropdown**

Find the dropdown div (~line 140):

```svelte
<div class="dropdown" role="region" aria-label="Notifications">
```

Note: Dismiss buttons already have `aria-label="Dismiss notification"` at line 179 — no changes needed there.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/ui/NotificationBell.svelte
git commit -m "a11y: improve NotificationBell keyboard and screen reader support

Dynamic aria-label announces unread count. Add Escape to close dropdown.
Add region role and label dismiss buttons for screen readers."
```

---

## Chunk 3: Feature Component Fixes

### Task 11: Fix StatusLegend Color-Only Information

**Files:**

- Modify: `src/features/calendar/components/StatusLegend.svelte`

- [ ] **Step 1: Add text labels alongside color swatches**

The status legend currently uses color squares only. Each legend item already shows the status name as text — verify that the text label is always present next to the color swatch. If it is, the fix is to add a semantic wrapper:

```svelte
<div class="legend" role="region" aria-label="Status color legend">
	{#each statusTypes as status}
		<div class="legend-item">
			<span class="color-swatch" style="background-color: {status.color}" aria-hidden="true"></span>
			<span>{status.name}</span>
		</div>
	{/each}
</div>
```

The key changes:

- `role="region"` + `aria-label` on wrapper
- `aria-hidden="true"` on the color swatch (decorative, the text label conveys the info)

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/StatusLegend.svelte
git commit -m "a11y: add semantic markup to StatusLegend

Add region role and aria-label. Hide decorative color swatches from
screen readers since text labels convey the same information."
```

---

### Task 12: Fix TrainingMatrix Table Semantics

**Files:**

- Modify: `src/features/training/components/TrainingMatrix.svelte:31-84`

- [ ] **Step 1: Add `scope` attributes to table headers**

Find the `<table>` and its headers (~line 31):

```svelte
<table class="matrix" aria-label="Training status matrix">
	<thead>
		<tr>
			<th scope="col">Personnel</th>
			{#each trainingTypes as type}
				<th scope="col" ...>{type.name}</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each personnel as person}
			<tr>
				<th scope="row">
					<!-- person name button -->
				</th>
				<!-- ...cells... -->
			</tr>
		{/each}
	</tbody>
</table>
```

Key changes:

- Add `aria-label` to `<table>`
- Add `scope="col"` to all column headers
- Change person name cell from `<td>` to `<th scope="row">`

- [ ] **Step 2: Add `aria-label` to status badge buttons**

Find the status badge buttons in table cells (~line 64). Each button should have a descriptive label:

The status info is computed via `getTrainingStatus()` which returns a `statusInfo` object with a `.label` property (~line 60). Use it in the button:

```svelte
<button
	class="status-badge"
	style="background-color: {statusInfo.color}"
	data-status={statusInfo.status}
	onclick={() => onCellClick(person, type, training)}
	aria-label="{person.lastName} {type.name}: {statusInfo.label}"
>
	{statusInfo.label}
</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/features/training/components/TrainingMatrix.svelte
git commit -m "a11y: add table semantics and button labels to TrainingMatrix

Add scope=col/row to headers, aria-label to table, and descriptive
aria-labels to status badge buttons for screen reader context."
```

---

### Task 13: Fix BulkStatusModal Form Accessibility

**Files:**

- Modify: `src/features/calendar/components/BulkStatusModal.svelte`

- [ ] **Step 1: Link error messages with `aria-describedby`**

The form inputs already have proper `<label for="">` / `id` associations (statusType, startDate, endDate, bulkNote). The only missing piece is linking the date validation error to the input.

Find the end date input (~line 200) and the date error (~line 210-212). Add `aria-describedby` and `aria-invalid` to the end date input, and add `role="alert"` to the error:

```svelte
<input
	id="endDate"
	type="date"
	class="input"
	bind:value={endDate}
	aria-describedby={dateError ? 'date-error' : undefined}
	aria-invalid={!!dateError}
/>
```

```svelte
{#if dateError}
	<div id="date-error" class="date-error" role="alert">{dateError}</div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/BulkStatusModal.svelte
git commit -m "a11y: link date validation error to input in BulkStatusModal

Add aria-describedby and aria-invalid to end date input, and role=alert
to error message for screen reader announcements."
```

---

### Task 14: Fix PageToolbar More Button

**Files:**

- Modify: `src/lib/components/PageToolbar.svelte:29-35`

- [ ] **Step 1: Add `aria-expanded` and `aria-haspopup` to more button**

The more button (~line 29) already has `aria-label="More actions"`. Add `aria-expanded` and `aria-haspopup`. The component already has a `showOverflow` state variable (line 15) that tracks menu visibility:

```svelte
<button
	...existing props...
	aria-label="More actions"
	aria-expanded={showOverflow}
	aria-haspopup="menu"
>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/PageToolbar.svelte
git commit -m "a11y: add aria-expanded to PageToolbar more button

Track and expose menu open state for screen readers."
```

---

## Post-Implementation

### Task 15: Manual Accessibility Smoke Test

- [ ] **Step 1: Keyboard-only navigation test**

Navigate the entire app using only Tab, Shift+Tab, Enter, Escape, and arrow keys. Verify:

- Every interactive element is reachable
- Focus is always visible
- Modals trap focus
- Menus close on Escape
- Skip link works

- [ ] **Step 2: Screen reader test (VoiceOver on macOS)**

Turn on VoiceOver (Cmd+F5) and navigate:

- Page landmarks announced (main, nav, header)
- Buttons and links have descriptive names
- Form fields announce their labels
- Dynamic content (notifications, uploads) announced
- Tables announce row/column headers

- [ ] **Step 3: Color/contrast check**

Use browser DevTools accessibility inspector or axe DevTools extension to verify:

- All text meets 4.5:1 contrast
- No information conveyed by color alone
- Focus indicators visible in all modes

- [ ] **Step 4: Reduced motion test**

In macOS System Settings > Accessibility > Display, enable "Reduce motion". Verify all animations are disabled.

- [ ] **Step 5: Update changelog**

Add entry to `src/lib/data/changelog.ts`:

```typescript
{
	date: '2026-03-15',
	title: 'Accessibility Improvements',
	description: 'Improved keyboard navigation, screen reader support, and color contrast across the app. Added skip navigation, better focus indicators, and reduced motion support for users who need it.'
}
```

- [ ] **Step 6: Final commit**

```bash
git add src/lib/data/changelog.ts
git commit -m "docs: add accessibility improvements to changelog"
```
