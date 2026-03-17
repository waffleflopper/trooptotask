# Platform Guide Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `/help` page with a feature-organized platform guide with role callouts, and add a dismissable welcome banner to the org dashboard.

**Architecture:** Rewrite the existing `/help` page content (same route, same page shell) with 11 sections and inline role callouts. Add a welcome banner component to the org dashboard that uses localStorage for dismissal tracking.

**Tech Stack:** SvelteKit, Svelte 5 runes, CSS variables (no Tailwind)

---

### Task 1: Add role callout styling to the help page

**Files:**

- Modify: `src/routes/help/+page.svelte` (style block, ~line 358-607)

**Step 1: Add role callout CSS**

Add these styles inside the existing `<style>` block, after the `.help-item p` rule (~line 521):

```css
/* Role callouts */
.role-callout {
	padding: var(--spacing-md) var(--spacing-lg);
	background: var(--color-surface-variant);
	border-radius: var(--radius-lg);
	border-left: 3px solid var(--color-primary);
	display: flex;
	gap: var(--spacing-sm);
	align-items: flex-start;
}

.role-callout--admin {
	border-left-color: var(--color-primary);
}

.role-callout--team-leader {
	border-left-color: #b8943e;
}

.role-callout--viewer {
	border-left-color: var(--color-text-muted);
}

.role-callout-label {
	font-size: var(--font-size-xs);
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	white-space: nowrap;
	padding-top: 1px;
}

.role-callout--admin .role-callout-label {
	color: var(--color-primary);
}

.role-callout--team-leader .role-callout-label {
	color: #b8943e;
}

.role-callout--viewer .role-callout-label {
	color: var(--color-text-muted);
}

.role-callout-text {
	font-size: var(--font-size-sm);
	color: var(--color-text-secondary);
	line-height: 1.7;
}
```

**Step 2: Run build check**

Run: `npm run check`
Expected: passes (no new errors)

**Step 3: Commit**

```
git add src/routes/help/+page.svelte
git commit -m "style: add role callout CSS to help page"
```

---

### Task 2: Rewrite help page content — sections 1-6

**Files:**

- Modify: `src/routes/help/+page.svelte` (script block, sections array ~line 10-265)

Replace the `sections` array with updated content. This task covers the first 6 sections. The section data structure stays the same (`id`, `title`, `icon`, `items[]`) but items now include an optional `role` field for callouts.

**Step 1: Update the section item type and rendering**

Change the items type to support role callouts. In the script block, add a type:

```typescript
type HelpItem = {
	title: string;
	content: string;
	role?: 'admin' | 'team-leader' | 'viewer';
};
```

Update the `sections` type to use `items: HelpItem[]`.

In the template, update the `{#each section.items as item}` block (~line 335-340) to conditionally render role callouts:

```svelte
{#each section.items as item}
	{#if item.role}
		<div class="role-callout role-callout--{item.role}">
			<span class="role-callout-label">
				{item.role === 'admin' ? 'Admin/Owner' : item.role === 'team-leader' ? 'Team Leader' : 'Viewer'}
			</span>
			<span class="role-callout-text">{item.content}</span>
		</div>
	{:else}
		<div class="help-item">
			<h3>{item.title}</h3>
			<p>{item.content}</p>
		</div>
	{/if}
{/each}
```

**Step 2: Replace sections 1-6 content**

Replace the first 6 sections in the `sections` array with:

```typescript
{
	id: 'getting-started',
	title: 'Getting Started',
	icon: 'M13 10V3L4 14h7v7l9-11h-7z',
	items: [
		{
			title: 'What is Troop to Task?',
			content: 'Troop to Task is a unit management platform for tracking personnel availability, training certifications, duty assignments, onboarding checklists, and counseling records. It gives leaders a real-time picture of their unit\'s readiness.'
		},
		{
			title: 'Dashboard',
			content: 'The Dashboard is your home base inside an organization. It shows today\'s strength, duty assignments, training status, upcoming changes, and active onboardings at a glance. Click "Customize" to show, hide, or reorder dashboard cards.'
		},
		{
			title: 'Navigation',
			content: 'Use the top navigation bar to move between Dashboard, Calendar, Personnel, Training, Onboarding, and Leaders Book. On mobile, the bottom tab bar provides the same navigation. The avatar menu in the top-right gives access to Settings, Billing, Help, and Admin (if you have access).'
		},
		{
			title: 'Multiple Organizations',
			content: 'You can belong to multiple organizations. Click the organization name in the top-left header to switch between them, or go to the main Dashboard to see all your organizations and pending invitations.'
		},
		{
			title: 'Theme Toggle',
			content: 'Switch between light and dark mode from the avatar menu or the sun/moon icon on standalone pages. Your preference is saved automatically.'
		}
	]
},
{
	id: 'dashboard',
	title: 'Dashboard',
	icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zm-11 11h7v7H3v-7zm11 0h7v7h-7v-7z',
	items: [
		{
			title: 'Dashboard Cards',
			content: 'The dashboard shows cards for: Today\'s Strength (available vs. total personnel), Duty Assignments, Training Status, Upcoming Changes (next 7 days), Rating Scheme status, Active Onboardings, and Per-Group Breakdown.'
		},
		{
			title: 'Customization',
			content: 'Click "Customize" in the toolbar to show, hide, or reorder dashboard cards. Your preferences are saved in the browser.'
		},
		{
			title: 'Per-Group Breakdown',
			content: 'The group breakdown table shows each group\'s total personnel, present count, per-status counts, and availability percentage. Pinned groups appear at the top.'
		},
		{
			title: '',
			content: 'If you are scoped to a specific group, your dashboard only reflects personnel in that group.',
			role: 'team-leader'
		}
	]
},
{
	id: 'calendar',
	title: 'Calendar',
	icon: 'M3 4h18v16H3V4zm0 6h18M8 2v4m8-4v4',
	items: [
		{
			title: 'Monthly View',
			content: 'The Calendar shows a monthly grid with personnel as rows and days as columns. Each cell is color-coded by status. Weekends and holidays have distinct background colors for easy identification.'
		},
		{
			title: 'Adding Status Entries',
			content: 'Click any cell to add or modify a status entry (Leave, TDY, School, Sick, etc.). Select a date range if the status spans multiple days. The status color appears on the calendar immediately.'
		},
		{
			title: '3-Month View',
			content: 'For long-range planning, open "3-Month View" from the toolbar overflow menu. This displays three months at once so you can spot coverage gaps and plan ahead.'
		},
		{
			title: 'Daily Assignments',
			content: 'Use "Assignments" from the toolbar to assign personnel to daily duties (MOD, Front Desk, CQ, etc.). The monthly planner lets you fill assignments quickly across the month.'
		},
		{
			title: 'Duty Roster Generator',
			content: 'The Duty Roster tool automatically distributes assignments fairly across eligible personnel, taking into account availability and previous assignment counts.'
		},
		{
			title: 'Bulk Status',
			content: 'Apply the same status to multiple people at once via "Bulk Status" in the toolbar. Select personnel, choose a status, set the date range, and apply.'
		},
		{
			title: 'Export',
			content: 'Export the calendar to Excel or print/save as PDF from the toolbar overflow menu.'
		},
		{
			title: 'Show Status Text',
			content: 'Toggle "Show Status Text" in the toolbar to show abbreviated status names on calendar cells alongside the color coding.'
		},
		{
			title: '',
			content: 'You can see the full calendar for org-wide visibility, but can only edit entries for personnel in your assigned group.',
			role: 'team-leader'
		},
		{
			title: '',
			content: 'Bulk Status, Duty Roster Generator, and Export require full-editor, admin, or owner access.',
			role: 'admin'
		}
	]
},
{
	id: 'personnel',
	title: 'Personnel Management',
	icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m22 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
	items: [
		{
			title: 'View Modes',
			content: 'Toggle between "By Group" (personnel organized under collapsible group headings) and "A-Z" (single alphabetical list with group badges) using the buttons in the filter bar.'
		},
		{
			title: 'Adding Personnel',
			content: 'Click "Add Person" in the toolbar to add a new team member. Enter their name, rank, MOS, role, and assign them to a group.'
		},
		{
			title: 'Editing Personnel',
			content: 'Click on any person in the list to view and edit their information, including extended info like phone, email, and emergency contacts.'
		},
		{
			title: 'Groups',
			content: 'Organize personnel into groups (sections, teams, departments). Use "Manage Groups" in the toolbar overflow menu to create, rename, reorder, or delete groups. Pin frequently used groups to keep them at the top of lists.'
		},
		{
			title: 'Bulk Import',
			content: 'Import many personnel at once using Excel or CSV. Click "Bulk Import" in the toolbar overflow menu. Required columns: FirstName, LastName, Rank. Optional: MOS, Role, Group.'
		},
		{
			title: 'Bulk Delete',
			content: 'Select multiple personnel with checkboxes, then click the delete button. A confirmation dialog prevents accidental deletion.'
		},
		{
			title: 'Search',
			content: 'Use the search box at the top to filter personnel by name. Works in both view modes.'
		},
		{
			title: '',
			content: 'You only see personnel in your assigned group. You can add and edit personnel within your group.',
			role: 'team-leader'
		},
		{
			title: '',
			content: 'Manage Groups, Bulk Import, and Bulk Delete require full-editor, admin, or owner access.',
			role: 'admin'
		}
	]
},
{
	id: 'training',
	title: 'Training Tracker',
	icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zm20 0h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
	items: [
		{
			title: 'Training Matrix',
			content: 'The Training page shows a matrix grid: personnel as rows, training types as columns. Each cell shows completion status with color-coded expiration warnings.'
		},
		{
			title: 'Expiration Colors',
			content: 'Cells are color-coded: Green = valid, Yellow = expiring within 60 days, Orange = expiring within 30 days, Red = expired or missing. This lets you quickly spot who needs recertification.'
		},
		{
			title: 'Recording Training',
			content: 'Click any cell in the training matrix to record a completion date. The system calculates the expiration date automatically based on the training type settings.'
		},
		{
			title: 'Training Types',
			content: 'Configure which certifications you track via "Manage Types" in the toolbar overflow menu. Set the name, expiration period (months), and optionally restrict by role.'
		},
		{
			title: 'Reports',
			content: 'Click "Reports" in the toolbar to see delinquency reports — all expired or soon-to-expire training sorted by urgency for prioritizing recertification.'
		},
		{
			title: 'Bulk Import',
			content: 'Import training records via Excel or CSV from the toolbar overflow menu. Format: Person identifier, Training Type, Completion Date.'
		},
		{
			title: '',
			content: 'You only see training for personnel in your assigned group.',
			role: 'team-leader'
		},
		{
			title: '',
			content: 'Manage Types, Reports, and Bulk Import require full-editor, admin, or owner access.',
			role: 'admin'
		}
	]
},
{
	id: 'onboarding',
	title: 'Onboarding',
	icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m8-2H8v4h8V2zm-5 10h6m-6 4h6',
	items: [
		{
			title: 'Overview',
			content: 'The Onboarding page tracks in-processing checklists for new personnel. Each onboarding has a set of steps that must be completed before the person is fully integrated.'
		},
		{
			title: 'Templates',
			content: 'Define onboarding templates with three step types: Training (auto-completes when the training record exists), Paperwork (upload-based with stages), and Checkbox (simple manual check-off). Use "Manage Template" in the toolbar.'
		},
		{
			title: 'Starting an Onboarding',
			content: 'Click "Start Onboarding" in the toolbar, select a person, and the template steps are created for them. Track progress as each step is completed.'
		},
		{
			title: 'Progress Tracking',
			content: 'Each onboarding shows a progress bar and step count. Expand a person\'s entry to see individual step status, add notes, and mark steps complete.'
		},
		{
			title: '',
			content: 'Template management requires full-editor, admin, or owner access.',
			role: 'admin'
		}
	]
}
```

**Step 3: Run build check**

Run: `npm run check`
Expected: passes

**Step 4: Commit**

```
git add src/routes/help/+page.svelte
git commit -m "feat: rewrite help page sections 1-6 with role callouts"
```

---

### Task 3: Rewrite help page content — sections 7-11

**Files:**

- Modify: `src/routes/help/+page.svelte` (script block, continuing sections array)

**Step 1: Replace sections 7-11**

Replace the remaining sections (old `settings`, `status-types`, `tips`) with sections 7-11:

```typescript
{
	id: 'leaders-book',
	title: 'Leaders Book',
	icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20m0-12H6.5A2.5 2.5 0 0 0 4 7.5v9m0 0V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2.5 2.5 0 0 1-2.5-2.5z',
	items: [
		{
			title: 'Counseling Records',
			content: 'Track counseling sessions for each person: initial, monthly, quarterly, or event-driven. Each record can include a PDF document upload. Access the Leaders Book from the top navigation.'
		},
		{
			title: 'Development Goals',
			content: 'Set development goals for personnel and track progress over time. Goals can be linked to counseling records.'
		},
		{
			title: '',
			content: 'You only see records for personnel in your assigned group.',
			role: 'team-leader'
		},
		{
			title: '',
			content: 'Counseling type management requires full-editor, admin, or owner access.',
			role: 'admin'
		}
	]
},
{
	id: 'settings',
	title: 'Settings & Members',
	icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
	items: [
		{
			title: 'Organization Name',
			content: 'Rename your organization at any time from the Settings page. Access Settings via the avatar menu.'
		},
		{
			title: 'Member Management',
			content: 'View all organization members, their roles, and permissions. Invite new members by email — they will see the invitation on their Dashboard when they log in.'
		},
		{
			title: 'Permission Presets',
			content: 'When inviting or editing a member, choose a preset: Admin (full access + admin hub), Full Editor (all editing permissions), Team Leader (scoped to a group), Viewer (read-only), or Custom (pick individual toggles).'
		},
		{
			title: 'Status Types',
			content: 'Configure the status types available in your calendar (Leave, TDY, School, Sick, etc.). Set name, abbreviation, color, and whether it counts as "unavailable". Access via "Manage Status Types" in the Calendar toolbar overflow menu.'
		},
		{
			title: 'Assignment Types',
			content: 'Define duty assignments (MOD, Front Desk, CQ, etc.). You can restrict certain assignments to specific roles. Access via "Manage Assignment Types" in the Calendar toolbar overflow menu.'
		},
		{
			title: 'Holidays',
			content: 'Manage holidays and special days. Federal holidays are pre-loaded — add organizational closures, training days, or custom events. Access via "Manage Holidays" in the Calendar toolbar overflow menu.'
		},
		{
			title: '',
			content: 'Member management requires the "Manage Members" permission. Type management (status types, assignment types, training types, counseling types) requires full-editor, admin, or owner access.',
			role: 'admin'
		},
		{
			title: '',
			content: 'Only the owner can transfer ownership or delete the organization.',
			role: 'admin'
		}
	]
},
{
	id: 'roles-permissions',
	title: 'Roles & Permissions',
	icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
	items: [
		{
			title: 'Role Hierarchy',
			content: 'There are three roles: Owner, Admin, and Member. The Owner has full access including transferring ownership and deleting the organization. Admins have full access plus the Admin Hub, but cannot transfer or delete. Members have access controlled by individual permission toggles.'
		},
		{
			title: 'Permission Presets',
			content: 'Admin: full access + admin hub. Full Editor: all 11 permission toggles on — can edit everything and access type managers, bulk operations, and export. Team Leader: scoped to a specific group with edit permissions for that group. Viewer: can see everything but cannot make changes. Custom: pick individual toggles.'
		},
		{
			title: 'Group Scoping',
			content: 'Members can be scoped to a specific group. When scoped, they only see and edit personnel in that group. This is the "Team Leader" model — each group leader manages their own people while the calendar stays org-wide for visibility. Owners and admins are always org-wide regardless of scope setting.'
		},
		{
			title: 'What Full Editor Unlocks',
			content: 'A member with all 11 permission toggles on is detected as a "Full Editor." This unlocks access to type managers (status types, training types, etc.), bulk operations (bulk status, bulk import/delete), data export, and the duty roster generator — everything except the Admin Hub and destructive operations.'
		},
		{
			title: 'Deletion Approvals',
			content: 'Members who are not full-editors, admins, or owners must request approval to delete personnel, counseling records, training records, and development goals. The record shows a "Pending deletion" indicator until an admin or owner approves or denies the request from the Admin Hub.'
		},
		{
			title: '',
			content: 'As a team leader, you can add and edit personnel, calendar entries, training, and counseling records for your assigned group. You cannot access type managers, bulk operations, or the admin hub.',
			role: 'team-leader'
		},
		{
			title: '',
			content: 'Read-only members can view all pages they have view permissions for, but cannot make any changes. Attempting to edit shows a permission message.',
			role: 'viewer'
		}
	]
},
{
	id: 'admin-hub',
	title: 'Admin Hub',
	icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
	items: [
		{
			title: 'Approvals',
			content: 'Review pending deletion requests from non-privileged members. Approve or deny each request with an optional reason. The requester is notified of the decision. Filter between pending and resolved requests.'
		},
		{
			title: 'Audit Log',
			content: 'View a chronological log of all actions taken in the organization — personnel changes, training updates, membership modifications, and more. Use this for accountability and compliance tracking.'
		},
		{
			title: '',
			content: 'The Admin Hub is only visible to admins and owners. Access it from the avatar menu.',
			role: 'admin'
		}
	]
},
{
	id: 'tips',
	title: 'Tips & Shortcuts',
	icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
	items: [
		{
			title: 'Quick Organization Switch',
			content: 'Click the organization name in the top-left header to switch between organizations without going back to the main Dashboard.'
		},
		{
			title: 'Pin Groups',
			content: 'Pin frequently used groups to always appear at the top of personnel lists and the dashboard breakdown. Look for the pin icon when managing groups.'
		},
		{
			title: 'Keyboard Navigation',
			content: 'Use Tab to navigate between interactive elements. Press Enter or Space to activate buttons. Press Escape to close modals and dialogs.'
		},
		{
			title: 'Mobile Usage',
			content: 'On mobile, the bottom tab bar replaces the top navigation. The calendar and training matrix scroll horizontally. All features are fully functional on mobile.'
		},
		{
			title: 'Notifications',
			content: 'The bell icon next to your avatar shows unread notifications. Click it to see deletion approval results and other updates. Each notification can be dismissed individually.'
		}
	]
}
```

**Step 2: Update page title and subtitle**

Change the `<h1>` text from "Help & Documentation" to "Platform Guide" and update the subtitle:

```svelte
<h1>Platform Guide</h1>
<p class="subtitle">Learn how to use Troop to Task — organized by feature with role-specific tips</p>
```

Also update the `<title>` tag:

```svelte
<title>Platform Guide - Troop to Task</title>
```

**Step 3: Allow multiple sections to be expanded at once**

Replace the single `expandedSection` state with a Set so users can have multiple sections open:

```typescript
let expandedSections = $state<Set<string>>(new Set(['getting-started']));

function toggleSection(section: string) {
	const next = new Set(expandedSections);
	if (next.has(section)) {
		next.delete(section);
	} else {
		next.add(section);
	}
	expandedSections = next;
}
```

Update all references from `expandedSection === section.id` to `expandedSections.has(section.id)`.

**Step 4: Run build check**

Run: `npm run check`
Expected: passes

**Step 5: Commit**

```
git add src/routes/help/+page.svelte
git commit -m "feat: complete help page rewrite with 11 sections, role callouts, multi-expand"
```

---

### Task 4: Add welcome banner to org dashboard

**Files:**

- Modify: `src/routes/org/[orgId]/+page.svelte`

**Step 1: Add banner state and dismissal logic**

In the `<script>` block, after the `let { data } = $props();` line (~line 22), add:

```typescript
import { browser } from '$app/environment';

// Welcome banner
const bannerKey = $derived(`guide-dismissed-${data.userId}-${data.orgId}`);
let bannerDismissed = $state(true); // default true to avoid flash

$effect(() => {
	if (browser) {
		bannerDismissed = localStorage.getItem(bannerKey) === 'true';
	}
});

function dismissBanner() {
	bannerDismissed = true;
	if (browser) {
		localStorage.setItem(bannerKey, 'true');
	}
}
```

Note: Move the `import { browser }` to the top import section.

**Step 2: Add banner markup**

In the template, after the `<div class="dashboard-header">...</div>` block (~line 353) and before the card rows, add:

```svelte
{#if !bannerDismissed}
	<div class="welcome-banner">
		<div class="welcome-content">
			<strong>Welcome to Troop to Task!</strong>
			<span class="welcome-text">New here? Check out the platform guide to learn what you can do.</span>
			<a href="/help" class="btn btn-sm btn-primary welcome-btn">View Guide</a>
		</div>
		<button class="welcome-dismiss" onclick={dismissBanner} aria-label="Dismiss welcome banner">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>
{/if}
```

**Step 3: Add banner styles**

Add to the `<style>` block:

```css
/* Welcome Banner */
.welcome-banner {
	display: flex;
	align-items: center;
	gap: var(--spacing-md);
	padding: var(--spacing-md) var(--spacing-lg);
	background: var(--color-surface);
	border-radius: var(--radius-lg);
	border-left: 3px solid var(--color-primary);
	box-shadow: var(--shadow-1);
}

.welcome-content {
	flex: 1;
	display: flex;
	align-items: center;
	gap: var(--spacing-sm);
	flex-wrap: wrap;
}

.welcome-content strong {
	color: var(--color-text);
	font-size: var(--font-size-base);
}

.welcome-text {
	font-size: var(--font-size-sm);
	color: var(--color-text-secondary);
}

.welcome-btn {
	margin-left: var(--spacing-sm);
}

.welcome-dismiss {
	background: none;
	border: none;
	cursor: pointer;
	padding: var(--spacing-xs);
	color: var(--color-text-muted);
	border-radius: var(--radius-sm);
	flex-shrink: 0;
}

.welcome-dismiss:hover {
	color: var(--color-text);
	background: var(--color-surface-variant);
}

.welcome-dismiss svg {
	width: 18px;
	height: 18px;
}

@media (max-width: 640px) {
	.welcome-content {
		flex-direction: column;
		align-items: flex-start;
	}

	.welcome-btn {
		margin-left: 0;
	}
}
```

**Step 4: Run build check**

Run: `npm run check`
Expected: passes

**Step 5: Commit**

```
git add src/routes/org/[orgId]/+page.svelte
git commit -m "feat: add dismissable welcome banner to org dashboard"
```

---

### Task 5: Final verification and build

**Step 1: Run full build**

Run: `npm run build`
Expected: builds successfully

**Step 2: Manual check (if dev server available)**

- Visit `/help` — verify 11 sections render, role callouts display with correct colors
- Visit `/org/[orgId]` — verify welcome banner appears, dismiss works, refresh shows it stays dismissed
- Clear localStorage entry — verify banner reappears

**Step 3: Commit any fixes if needed**
