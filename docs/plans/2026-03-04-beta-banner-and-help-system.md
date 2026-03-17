# Beta Banner & Help System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the beta tester signup prominent on the login page, and add a reusable contextual help system with slide-out panel.

**Architecture:** Two independent features. (1) A styled banner above the login card linking to request-access. (2) A help system with three parts: a centralized content file (`help-content.ts`), a store (`help.svelte.ts`) to manage open/close + active topic, a `HelpButton.svelte` trigger, and a `HelpPanel.svelte` slide-out overlay. The panel renders from a fixed position on the right edge with backdrop.

**Tech Stack:** SvelteKit, Svelte 5 runes, pure CSS variables (no Tailwind)

---

### Task 1: Beta Tester Banner on Login Page

**Files:**

- Modify: `src/routes/auth/login/+page.svelte`

**Step 1: Add banner markup above the auth-card**

Insert this block immediately after `<div class="auth-noise"></div>` and the theme-toggle button, before `<div class="auth-card">`:

```svelte
<div class="beta-banner">
	<p class="beta-headline">We're looking for beta testers!</p>
	<p class="beta-sub">Help shape the future of Army personnel management.</p>
	<a href="/auth/request-access" class="beta-cta">Request Access</a>
</div>
```

**Step 2: Add banner styles**

Add these styles inside the existing `<style>` block:

```css
.beta-banner {
	text-align: center;
	margin-bottom: var(--spacing-lg);
	padding: var(--spacing-lg) var(--spacing-xl);
	background: rgba(184, 148, 62, 0.08);
	border: 1px solid rgba(184, 148, 62, 0.25);
	border-radius: 12px;
	width: 100%;
	max-width: 400px;
	position: relative;
}

.beta-headline {
	font-family: var(--font-display);
	font-size: var(--font-size-lg);
	font-weight: 600;
	color: #b8943e;
	margin-bottom: var(--spacing-xs);
}

.beta-sub {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
	margin-bottom: var(--spacing-md);
}

.beta-cta {
	display: inline-block;
	padding: 0.5rem 1.5rem;
	background: #b8943e;
	color: #0f0f0f;
	font-weight: 600;
	font-size: var(--font-size-sm);
	border-radius: 8px;
	text-decoration: none;
	transition: background 0.15s;
}

.beta-cta:hover {
	background: #d4b15a;
}
```

**Step 3: Verify visually**

Run: `npm run dev` and visit `/auth/login`
Expected: Gold-tinted banner appears above the login card with headline, subtitle, and a "Request Access" button linking to `/auth/request-access`.

**Step 4: Commit**

```bash
git add src/routes/auth/login/+page.svelte
git commit -m "feat(auth): add beta tester banner above login card"
```

---

### Task 2: Help Store

**Files:**

- Create: `src/lib/stores/help.svelte.ts`

**Step 1: Create the help store**

```typescript
class HelpStore {
	activeTopic = $state<string | null>(null);

	open(topic: string) {
		this.activeTopic = topic;
	}

	close() {
		this.activeTopic = null;
	}
}

export const helpStore = new HelpStore();
```

**Step 2: Commit**

```bash
git add src/lib/stores/help.svelte.ts
git commit -m "feat(help): add help store for managing active topic"
```

---

### Task 3: Help Content File

**Files:**

- Create: `src/lib/help-content.ts`

**Step 1: Create the centralized help content map**

Start with a few placeholder topics. These will be filled in with real content later.

```typescript
export interface HelpTopic {
	title: string;
	content: string;
}

export const helpContent: Record<string, HelpTopic> = {
	calendar: {
		title: 'Calendar',
		content: `
			<p>The calendar shows your unit's daily schedule at a glance. Each column represents a person, and colored badges show their status or assignment for that day.</p>
			<h4>Key features</h4>
			<ul>
				<li><strong>Click a cell</strong> to assign someone to a duty or mark availability</li>
				<li><strong>Status badges</strong> show leave, TDY, appointments, etc.</li>
				<li><strong>Navigation</strong> — use arrows or click the date header to jump to a specific date</li>
			</ul>
		`
	},
	'training-records': {
		title: 'Training Records',
		content: `
			<p>Track individual and unit training requirements. Each training type can have an expiration period so you know when recertification is due.</p>
			<h4>Key features</h4>
			<ul>
				<li><strong>Training types</strong> are managed in Settings and apply to the whole organization</li>
				<li><strong>Record training</strong> by clicking on a person and adding a training entry with a completion date</li>
				<li><strong>Expiration tracking</strong> — training with expiration periods will show as overdue when past due</li>
			</ul>
		`
	},
	'leaders-book': {
		title: "Leader's Book",
		content: `
			<p>The leader's book consolidates key personnel information in one place — counseling records, training status, and personal notes.</p>
			<h4>Key features</h4>
			<ul>
				<li><strong>Counseling records</strong> — track initial, monthly, and event-based counselings</li>
				<li><strong>Development goals</strong> — set and track goals for each soldier</li>
				<li><strong>Documents</strong> — attach PDFs to counseling records</li>
			</ul>
		`
	}
};
```

**Step 2: Commit**

```bash
git add src/lib/help-content.ts
git commit -m "feat(help): add centralized help content file with initial topics"
```

---

### Task 4: HelpButton Component

**Files:**

- Create: `src/lib/components/ui/HelpButton.svelte`

**Step 1: Create the HelpButton component**

```svelte
<script lang="ts">
	import { helpStore } from '$lib/stores/help.svelte';

	let { topic }: { topic: string } = $props();
</script>

<button class="help-btn" onclick={() => helpStore.open(topic)} aria-label="Help" title="Help"> ? </button>

<style>
	.help-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		vertical-align: middle;
		margin-left: var(--spacing-xs);
		padding: 0;
		line-height: 1;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.help-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: rgba(63, 81, 181, 0.08);
	}
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/ui/HelpButton.svelte
git commit -m "feat(help): add HelpButton component"
```

---

### Task 5: HelpPanel Component

**Files:**

- Create: `src/lib/components/ui/HelpPanel.svelte`

**Step 1: Create the HelpPanel component**

```svelte
<script lang="ts">
	import { helpStore } from '$lib/stores/help.svelte';
	import { helpContent } from '$lib/help-content';

	const topic = $derived(helpStore.activeTopic ? helpContent[helpStore.activeTopic] : null);

	function handleBackdropClick() {
		helpStore.close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') helpStore.close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if topic}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="help-backdrop" onclick={handleBackdropClick}></div>
	<aside class="help-panel" role="complementary" aria-label="Help">
		<div class="help-header">
			<h2 class="help-title">{topic.title}</h2>
			<button class="help-close" onclick={() => helpStore.close()} aria-label="Close help">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
		<div class="help-body">
			{@html topic.content}
		</div>
	</aside>
{/if}

<style>
	.help-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 999;
	}

	.help-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 380px;
		max-width: 90vw;
		background: var(--color-surface);
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		animation: slideIn 0.2s ease-out;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.help-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.help-title {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.help-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		padding: 0;
	}

	.help-close:hover {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.help-close svg {
		width: 18px;
		height: 18px;
	}

	.help-body {
		padding: var(--spacing-lg);
		overflow-y: auto;
		flex: 1;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.help-body :global(h4) {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		margin: var(--spacing-md) 0 var(--spacing-sm);
	}

	.help-body :global(p) {
		margin: 0 0 var(--spacing-sm);
	}

	.help-body :global(ul) {
		margin: 0 0 var(--spacing-sm);
		padding-left: var(--spacing-lg);
	}

	.help-body :global(li) {
		margin-bottom: var(--spacing-xs);
	}
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/ui/HelpPanel.svelte
git commit -m "feat(help): add HelpPanel slide-out component"
```

---

### Task 6: Mount HelpPanel in Layout

**Files:**

- Modify: `src/routes/org/[orgId]/+layout.svelte` (or the root `+layout.svelte` — wherever the main app shell is)

**Step 1: Find the app layout**

Check `src/routes/+layout.svelte` or `src/routes/org/[orgId]/+layout.svelte` for where global UI (like ToastContainer) is mounted.

**Step 2: Add HelpPanel import and mount**

Add alongside the existing global UI components (e.g. near ToastContainer):

```svelte
<script lang="ts">
	import HelpPanel from '$lib/components/ui/HelpPanel.svelte';
	// ... existing imports
</script>

<!-- Add near other global overlays -->
<HelpPanel />
```

**Step 3: Verify visually**

Import HelpButton in any page and add `<HelpButton topic="calendar" />` temporarily. Click it and confirm the panel slides in from the right with the calendar help content. Click backdrop or press Escape to close.

**Step 4: Clean up test usage and commit**

```bash
git add src/routes/org/[orgId]/+layout.svelte
git commit -m "feat(help): mount HelpPanel in app layout"
```

---

### Task 7: Add HelpButtons to Key Pages

**Files:**

- Modify: Pages where help buttons should appear (calendar, training, leader's book headers)

**Step 1: Identify placement points**

Add `<HelpButton topic="..." />` next to section headers or page titles for the topics defined in `help-content.ts`. Exact placement depends on each page's header structure.

**Step 2: Commit**

```bash
git commit -m "feat(help): add help buttons to calendar, training, and leaders-book pages"
```

---

### Task 8: Build Check

**Step 1: Run type checking**

Run: `npm run check`
Expected: No new errors (pre-existing errors are fine per CLAUDE.md)

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Final commit if any fixes needed**
