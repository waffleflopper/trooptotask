# Onboarding Row Shading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a subtle brass background tint to empty calendar cells for onboarding personnel, with a toggle in the toolbar.

**Architecture:** Pass a new `highlightOnboarding` boolean down through Calendar → PersonnelRow → DateCell. DateCell applies a brass tint when the cell has no status and the person is onboarding. Toggle state is stored in localStorage and managed in the calendar page.

**Tech Stack:** Svelte 5 (runes), CSS custom properties for dark/light mode, localStorage

---

### Task 1: Add `isOnboarding` prop to DateCell

**Files:**

- Modify: `src/lib/components/DateCell.svelte`

**Step 1: Add prop and background logic**

In the Props interface, add `isOnboarding`:

```typescript
interface Props {
	// ... existing props ...
	isOnboarding?: boolean;
}
```

In the destructured props, add:

```typescript
isOnboarding = false,
```

Modify the `getBackground()` function to return onboarding tint when no status:

```typescript
function getBackground(): string {
	if (statusColors.length === 0) {
		if (isOnboarding) {
			return 'var(--color-onboarding-tint)';
		}
		return '';
	}
	// ... rest unchanged
}
```

**Step 2: Add CSS variable for onboarding tint**

In `src/app.css`, add to the `:root` block (light mode):

```css
--color-onboarding-tint: rgba(184, 148, 62, 0.12);
```

In the `[data-theme='dark']` block:

```css
--color-onboarding-tint: rgba(184, 148, 62, 0.15);
```

**Step 3: Commit**

```
feat: add onboarding tint to empty DateCell backgrounds
```

---

### Task 2: Pass `isOnboarding` from PersonnelRow to DateCell

**Files:**

- Modify: `src/lib/components/PersonnelRow.svelte`

**Step 1: Pass the existing `isOnboarding` prop through to DateCell**

In the DateCell usage (around line 108-119), add the `isOnboarding` prop:

```svelte
<DateCell
	{date}
	isWeekend={isWeekend(date)}
	isToday={isToday(date)}
	isHoliday={!!specialDay}
	holidayName={specialDay?.name}
	entries={availabilityByDate.get(dateStr) ?? []}
	{statusTypeMap}
	assignments={assignmentsByDate.get(dateStr) ?? []}
	{showStatusText}
	{isOnboarding}
	onclick={() => handleCellClick(date)}
/>
```

PersonnelRow already has `isOnboarding` as a prop (line 16, default false). No other changes needed.

**Step 2: Commit**

```
feat: pass isOnboarding prop from PersonnelRow to DateCell
```

---

### Task 3: Add highlight toggle to Calendar page

**Files:**

- Modify: `src/routes/org/[orgId]/calendar/+page.svelte`

**Step 1: Add toggle state with localStorage persistence**

In the `<script>` block, add state and persistence:

```typescript
// Onboarding highlight toggle (persisted per user)
const highlightKey = $derived(`calendar-highlight-onboarding-${data.userId}`);
let highlightOnboarding = $state(true); // default ON

$effect(() => {
	if (browser) {
		const stored = localStorage.getItem(highlightKey);
		if (stored !== null) {
			highlightOnboarding = stored !== 'false';
		}
	}
});

function toggleHighlightOnboarding() {
	highlightOnboarding = !highlightOnboarding;
	if (browser) {
		localStorage.setItem(highlightKey, String(highlightOnboarding));
	}
}
```

**Step 2: Add toggle button in PageToolbar**

Inside `<PageToolbar>`, add a toggle button (before the "Today's Breakdown" button):

```svelte
<button
	class="toolbar-toggle"
	class:active={highlightOnboarding}
	onclick={toggleHighlightOnboarding}
	title={highlightOnboarding ? 'Hide onboarding highlighting' : 'Show onboarding highlighting'}
>
	<span class="toggle-dot"></span>
	Onboarding
</button>
```

**Step 3: Add CSS for the toggle button**

In the `<style>` block:

```css
.toolbar-toggle {
	display: flex;
	align-items: center;
	gap: var(--spacing-xs);
	padding: var(--spacing-xs) var(--spacing-sm);
	font-size: var(--font-size-sm);
	font-weight: 500;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);
	background: var(--color-surface);
	color: var(--color-text-muted);
	cursor: pointer;
	transition: all 0.15s ease;
}

.toolbar-toggle:hover {
	border-color: var(--color-primary);
	color: var(--color-text);
}

.toolbar-toggle.active {
	border-color: #b8943e;
	color: #b8943e;
	background: var(--color-onboarding-tint);
}

.toggle-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--color-border);
	transition: background 0.15s ease;
}

.toolbar-toggle.active .toggle-dot {
	background: #b8943e;
}
```

**Step 4: Commit**

```
feat: add onboarding highlight toggle to calendar toolbar
```

---

### Task 4: Wire toggle through Calendar → PersonnelRow → DateCell

**Files:**

- Modify: `src/lib/components/Calendar.svelte`
- Modify: `src/routes/org/[orgId]/calendar/+page.svelte`

**Step 1: Add `highlightOnboarding` prop to Calendar.svelte**

In the Calendar Props interface, add:

```typescript
highlightOnboarding?: boolean;
```

In the destructured props:

```typescript
highlightOnboarding = true,
```

Update the PersonnelRow usage to conditionally pass `isOnboarding`:

```svelte
<PersonnelRow
	{person}
	{dates}
	personAvailability={availabilityByPerson.get(person.id) ?? []}
	{statusTypeMap}
	{specialDays}
	{assignmentTypes}
	personAssignments={assignmentsByPerson.get(person.id) ?? []}
	{showStatusText}
	isOnboarding={highlightOnboarding && onboardingSet.has(person.id)}
	onCellClick={canEdit ? onCellClick : undefined}
	{onPersonClick}
/>
```

The key change: `isOnboarding` is now `highlightOnboarding && onboardingSet.has(person.id)`. When the toggle is off, `isOnboarding` is always false, so no tint is applied. The onboarding dot in PersonnelRow is unaffected because it uses its own `isOnboarding` prop for the dot — wait, this would also hide the dot.

**Important:** We need to keep the dot visible regardless of the toggle. Split the prop:

Instead, add a separate `highlightOnboarding` prop to PersonnelRow and pass both:

In PersonnelRow Props:

```typescript
highlightOnboarding?: boolean;
```

Destructure with default `true`.

Pass `isOnboarding` unchanged (always based on onboardingSet), and pass `highlightOnboarding` as a new prop.

PersonnelRow passes to DateCell:

```svelte
isOnboarding={isOnboarding && highlightOnboarding}
```

Calendar passes to PersonnelRow:

```svelte
isOnboarding={onboardingSet.has(person.id)}
highlightOnboarding={highlightOnboarding}
```

This way the dot always shows, but the cell tint is controlled by the toggle.

**Step 2: Pass `highlightOnboarding` from calendar page to Calendar component**

Find where `<Calendar>` is used in the calendar page and add the prop:

```svelte
highlightOnboarding={highlightOnboarding}
```

**Step 3: Commit**

```
feat: wire onboarding highlight toggle through component chain
```

---

### Task 5: Build & Type Check

**Step 1: Run type check**

```bash
npm run check
```

**Step 2: Run build**

```bash
npm run build
```

**Step 3: Fix any issues, commit if needed**
