<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';

	type HelpItem =
		| { title: string; content: string; role?: undefined }
		| { content: string; role: 'admin' | 'team-leader' | 'viewer'; title?: undefined };

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

	const sections: { id: string; title: string; icon: string; items: HelpItem[] }[] = [
		{
			id: 'getting-started',
			title: 'Getting Started',
			icon: 'M13 10V3L4 14h7v7l9-11h-7z',
			items: [
				{
					title: 'What is Troop to Task?',
					content:
						"Troop to Task is a unit management platform for tracking personnel availability, training certifications, duty assignments, onboarding checklists, and counseling records. It gives leaders a real-time picture of their unit's readiness."
				},
				{
					title: 'Dashboard',
					content:
						'The Dashboard is your home base inside an organization. It shows today\'s strength, duty assignments, training watch, upcoming changes, and onboarding or rating follow-up where it matters. Click "Customize" to show, hide, or reorder dashboard cards.'
				},
				{
					title: 'Navigation',
					content:
						'Use the top navigation bar to move between Dashboard, Calendar, Personnel, Training, and Onboarding. On mobile, the bottom tab bar provides the same core navigation. The avatar menu in the top-right gives access to organization switching, Org Settings, Help, theme controls, and Admin (if you have access).'
				},
				{
					title: 'Multiple Organizations',
					content:
						'You can belong to multiple organizations. Open the avatar menu in the top-right to switch between them. If you need the full list of organizations or pending invitations, use "Manage Organizations" from that same menu.'
				},
				{
					title: 'Theme Toggle',
					content:
						'Switch between light and dark mode from the avatar menu or the sun/moon icon on standalone pages. Your preference is saved automatically.'
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
					content:
						"The dashboard centers on Today's Strength, Duty Assignments, Training Watch, Upcoming Changes, and Active Onboardings. Rating follow-up appears when there is open action or when you choose to keep it visible."
				},
				{
					title: 'Customization',
					content:
						'Click "Customize" in the toolbar to show, hide, or reorder dashboard cards. Your preferences are saved in the browser.'
				},
				{
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
					content:
						'The Calendar shows a monthly grid with personnel as rows and days as columns. Each cell is color-coded by status. Weekends and holidays have distinct background colors for easy identification.'
				},
				{
					title: 'Adding Status Entries',
					content:
						'Click any cell to add or modify a status entry (Leave, TDY, School, Sick, etc.). Select a date range if the status spans multiple days. The status color appears on the calendar immediately.'
				},
				{
					title: '3-Month View',
					content:
						'For long-range planning, click the "3-Month" toggle next to the month navigation buttons. This displays three months at once so you can spot coverage gaps. Click any date column to jump back to that month in the regular view.'
				},
				{
					title: 'Daily Assignments',
					content:
						'Use "Assignments" from the toolbar to assign personnel to daily duties (MOD, Front Desk, CQ, etc.). The monthly planner lets you fill assignments quickly across the month.'
				},
				{
					title: 'Duty Roster Generator',
					content:
						'The Duty Roster tool automatically distributes assignments fairly across eligible personnel, taking into account availability and previous assignment counts.'
				},
				{
					title: 'Bulk Status',
					content:
						'Apply the same status to multiple people at once via "Bulk Status" in the toolbar. Select personnel, choose a status, set the date range, and apply.'
				},
				{
					title: 'Export',
					content: 'Export the calendar to Excel or print/save as PDF from the toolbar overflow menu.'
				},
				{
					title: 'Show Status Text',
					content:
						'Toggle "Show Status Text" in the toolbar to show abbreviated status names on calendar cells alongside the color coding.'
				},
				{
					content:
						'You can see the full calendar for org-wide visibility, but can only edit entries for personnel in your assigned group.',
					role: 'team-leader'
				},
				{
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
					content:
						'Toggle between "By Group" (personnel organized under collapsible group headings) and "A-Z" (single alphabetical list with group badges) using the buttons in the filter bar.'
				},
				{
					title: 'Adding Personnel',
					content:
						'Click "Add Person" in the toolbar to add a new team member. Enter their name, rank, MOS, role, and assign them to a group.'
				},
				{
					title: 'Editing Personnel',
					content:
						'Click on any person in the list to view and edit their information, including extended info like phone, email, and emergency contacts.'
				},
				{
					title: 'Groups',
					content:
						'Organize personnel into groups (sections, teams, departments). Use "Manage Groups" in the toolbar overflow menu to create, rename, reorder, or delete groups. Pin frequently used groups to keep them at the top of lists.'
				},
				{
					title: 'Bulk Import',
					content:
						'Import many personnel at once using Excel or CSV. Click "Bulk Import" in the toolbar overflow menu. Required columns: FirstName, LastName, Rank. Optional: MOS, Role, Group.'
				},
				{
					title: 'Bulk Delete',
					content:
						'Select multiple personnel with checkboxes, then click the delete button. A confirmation dialog prevents accidental deletion.'
				},
				{
					title: 'Search',
					content: 'Use the search box at the top to filter personnel by name. Works in both view modes.'
				},
				{
					content: 'You only see personnel in your assigned group. You can add and edit personnel within your group.',
					role: 'team-leader'
				},
				{
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
					content:
						'The Training page shows a matrix grid: personnel as rows, training types as columns. Each cell shows completion status with color-coded expiration warnings.'
				},
				{
					title: 'Expiration Colors',
					content:
						'Cells are color-coded: Green = valid, Yellow = expiring within 60 days, Orange = expiring within 30 days, Red = expired or missing. This lets you quickly spot who needs recertification.'
				},
				{
					title: 'Recording Training',
					content:
						'Click any cell in the training matrix to record a completion date. The system calculates the expiration date automatically based on the training type settings.'
				},
				{
					title: 'Training Types',
					content:
						'Configure which certifications you track via "Manage Types" in the toolbar overflow menu. Set the name, expiration period (months), and optionally restrict by role.'
				},
				{
					title: 'Reports',
					content:
						'Click "Reports" in the toolbar to see delinquency reports — all expired or soon-to-expire training sorted by urgency for prioritizing recertification.'
				},
				{
					title: 'Bulk Import',
					content:
						'Import training records via Excel or CSV from the toolbar overflow menu. Format: Person identifier, Training Type, Completion Date.'
				},
				{
					content: 'You only see training for personnel in your assigned group.',
					role: 'team-leader'
				},
				{
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
					content:
						'The Onboarding page tracks in-processing checklists for new personnel. Each onboarding has a set of steps that must be completed before the person is fully integrated.'
				},
				{
					title: 'Templates',
					content:
						'Define onboarding templates with three step types: Training (auto-completes when the training record exists), Paperwork (upload-based with stages), and Checkbox (simple manual check-off). Use "Manage Template" in the toolbar.'
				},
				{
					title: 'Starting an Onboarding',
					content:
						'Click "Start Onboarding" in the toolbar, select a person, and the template steps are created for them. Track progress as each step is completed.'
				},
				{
					title: 'Progress Tracking',
					content:
						"Each onboarding shows a progress bar and step count. Expand a person's entry to see individual step status, add notes, and mark steps complete."
				},
				{
					content: 'Template management requires full-editor, admin, or owner access.',
					role: 'admin'
				}
			]
		},
		{
			id: 'leaders-book',
			title: 'Leaders Book',
			icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20m0-12H6.5A2.5 2.5 0 0 0 4 7.5v9m0 0V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2.5 2.5 0 0 1-2.5-2.5z',
			items: [
				{
					title: 'Counseling Records',
					content:
						'Track counseling sessions for each person: initial, monthly, quarterly, or event-driven. Each record can include a PDF document upload. Leader\'s Book is temporarily hidden from the main navigation while that area is being redesigned.'
				},
				{
					title: 'Development Goals',
					content:
						'Set development goals for personnel and track progress over time. Goals can be linked to counseling records.'
				},
				{
					content: 'You only see records for personnel in your assigned group.',
					role: 'team-leader'
				},
				{
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
					content:
						'View all organization members, their roles, and permissions. Invite new members by email — they will see the invitation on their Dashboard when they log in.'
				},
				{
					title: 'Permission Presets',
					content:
						'When inviting or editing a member, choose a preset: Admin (full access + admin hub), Full Editor (all editing permissions), Team Leader (scoped to a group), Viewer (read-only), or Custom (pick individual toggles).'
				},
				{
					title: 'Status Types',
					content:
						'Configure the status types available in your calendar (Leave, TDY, School, Sick, etc.). Set name, abbreviation, color, and whether it counts as "unavailable". Access via "Manage Status Types" in the Calendar toolbar overflow menu.'
				},
				{
					title: 'Assignment Types',
					content:
						'Define duty assignments (MOD, Front Desk, CQ, etc.). You can restrict certain assignments to specific roles. Access via "Manage Assignment Types" in the Calendar toolbar overflow menu.'
				},
				{
					title: 'Holidays',
					content:
						'Manage holidays and special days. Federal holidays are pre-loaded — add organizational closures, training days, or custom events. Access via "Manage Holidays" in the Calendar toolbar overflow menu.'
				},
				{
					content:
						'Member management requires the "Manage Members" permission. Type management (status types, assignment types, training types, counseling types) requires full-editor, admin, or owner access.',
					role: 'admin'
				},
				{
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
					content:
						'There are three roles: Owner, Admin, and Member. The Owner has full access including transferring ownership and deleting the organization. Admins have full access plus the Admin Hub, but cannot transfer or delete. Members have access controlled by individual permission toggles.'
				},
				{
					title: 'Permission Presets',
					content:
						'Admin: full access + admin hub. Full Editor: all 11 permission toggles on — can edit everything and access type managers, bulk operations, and export. Team Leader: scoped to a specific group with edit permissions for that group. Viewer: can see everything but cannot make changes. Custom: pick individual toggles.'
				},
				{
					title: 'Group Scoping',
					content:
						'Members can be scoped to a specific group. When scoped, they only see and edit personnel in that group. This is the "Team Leader" model — each group leader manages their own people while the calendar stays org-wide for visibility. Owners and admins are always org-wide regardless of scope setting.'
				},
				{
					title: 'What Full Editor Unlocks',
					content:
						'A member with all 11 permission toggles on is detected as a "Full Editor." This unlocks access to type managers (status types, training types, etc.), bulk operations (bulk status, bulk import/delete), data export, and the duty roster generator — everything except the Admin Hub and destructive operations.'
				},
				{
					title: 'Deletion Approvals',
					content:
						'Members who are not full-editors, admins, or owners must request approval to delete personnel, counseling records, training records, and development goals. The record shows a "Pending deletion" indicator until an admin or owner approves or denies the request from the Admin Hub.'
				},
				{
					content:
						'As a team leader, you can add and edit personnel, calendar entries, training, and counseling records for your assigned group. You cannot access type managers, bulk operations, or the admin hub.',
					role: 'team-leader'
				},
				{
					content:
						'Read-only members can view all pages they have view permissions for, but cannot make any changes. Attempting to edit shows a permission message.',
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
					content:
						'Review pending deletion requests from non-privileged members. Approve or deny each request with an optional reason. The requester is notified of the decision. Filter between pending and resolved requests.'
				},
				{
					title: 'Audit Log',
					content:
						'View a chronological log of all actions taken in the organization — personnel changes, training updates, membership modifications, and more. Use this for accountability and compliance tracking.'
				},
				{
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
					content:
						'Open the avatar menu in the top-right to switch organizations without leaving your current page. Troop to Task keeps you on the same section when that page exists in the destination organization.'
				},
				{
					title: 'Pin Groups',
					content:
						'Pin frequently used groups to keep them at the top of personnel lists. Look for the pin icon when managing groups.'
				},
				{
					title: 'Keyboard Navigation',
					content:
						'Use Tab to navigate between interactive elements. Press Enter or Space to activate buttons. Press Escape to close modals and dialogs.'
				},
				{
					title: 'Mobile Usage',
					content:
						'On mobile, the bottom tab bar replaces the top navigation. The calendar and training matrix scroll horizontally. All features are fully functional on mobile.'
				},
				{
					title: 'Notifications',
					content:
						'The bell icon next to your avatar shows unread notifications. Click it to see deletion approval results and other updates. Each notification can be dismissed individually.'
				}
			]
		}
	];
</script>

<svelte:head>
	<title>Platform Guide - Troop to Task</title>
	<meta name="description" content="Help and platform guide for Troop to Task." />
</svelte:head>

<div class="help-page">
	<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
		{#if themeStore.isDark}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="5" />
				<line x1="12" y1="1" x2="12" y2="3" />
				<line x1="12" y1="21" x2="12" y2="23" />
				<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
				<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
				<line x1="1" y1="12" x2="3" y2="12" />
				<line x1="21" y1="12" x2="23" y2="12" />
				<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
				<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
			</svg>
		{/if}
	</button>

	<main class="help-container">
		<header class="help-header">
			<a href="/dashboard" class="back-link">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="19" y1="12" x2="5" y2="12" />
					<polyline points="12 19 5 12 12 5" />
				</svg>
				Back to Dashboard
			</a>
			<p class="eyebrow">Reference Guide</p>
			<h1>Platform Guide</h1>
			<p class="subtitle">Learn how to use Troop to Task — organized by feature with role-specific tips</p>
		</header>

		<div class="sections">
			{#each sections as section (section.id)}
				<div class="section" class:expanded={expandedSections.has(section.id)}>
					<button
						class="section-header"
						onclick={() => toggleSection(section.id)}
						aria-expanded={expandedSections.has(section.id)}
					>
						<div class="section-title">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d={section.icon} />
							</svg>
							<h2>{section.title}</h2>
						</div>
						<svg
							class="chevron"
							class:rotated={expandedSections.has(section.id)}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>
					{#if expandedSections.has(section.id)}
						<div class="section-content">
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
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<footer class="help-footer">
			<p>
				Need more help? Contact your organization administrator or visit the
				<a href="https://github.com/waffleflopper/trooptotask" target="_blank" rel="noopener">project repository</a>.
			</p>
		</footer>
	</main>
</div>

<style>
	.help-page {
		min-height: 100vh;
		background: var(--surface-page);
		padding: var(--sp-6) var(--sp-5);
	}

	.help-container {
		max-width: 960px;
		margin: 0 auto;
	}

	.help-header {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-bottom: var(--sp-6);
		padding-bottom: var(--sp-5);
		border-bottom: var(--border-thin);
	}

	.eyebrow,
	.role-callout-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.eyebrow {
		margin: 0;
		color: var(--amber);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		color: var(--text-secondary);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: 500;
		width: fit-content;
		padding: 0.625rem 0.85rem;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
	}

	.back-link:hover {
		color: var(--text-strong);
	}

	.back-link svg {
		width: 18px;
		height: 18px;
	}

	.help-header h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.8rem, 5vw, 4rem);
		font-weight: 800;
		line-height: 0.94;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.subtitle {
		margin: 0;
		max-width: 54rem;
		color: var(--text-secondary);
		font-size: var(--text-base);
		line-height: 1.6;
	}

	.sections {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.section {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.section.expanded {
		border-color: color-mix(in srgb, var(--amber) 36%, var(--ink-15) 64%);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--sp-4);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.section-header:hover {
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.section-title svg {
		width: 28px;
		height: 28px;
		color: var(--amber-dark);
		padding: 5px;
		background: color-mix(in srgb, var(--amber-light) 84%, var(--surface-panel) 16%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
	}

	.section-title h2 {
		font-size: clamp(1.8rem, 3vw, 2.3rem);
		font-family: var(--font-display);
		font-weight: 700;
		line-height: 0.98;
		text-transform: uppercase;
		color: var(--text-strong);
		margin: 0;
	}

	.chevron {
		width: 24px;
		height: 24px;
		color: var(--text-secondary);
		transition: transform 160ms ease;
	}

	.chevron.rotated {
		transform: rotate(180deg);
	}

	.section-content {
		padding: 0 var(--sp-4) var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.help-item {
		padding: var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
		border-radius: var(--radius-md);
		border: var(--border-thin);
	}

	.help-item h3 {
		font-size: var(--text-lg);
		font-family: var(--font-display);
		font-weight: 600;
		line-height: 1;
		text-transform: uppercase;
		color: var(--text-strong);
		margin: 0 0 var(--sp-2);
	}

	.help-item p {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		line-height: 1.65;
		margin: 0;
	}

	.role-callout {
		padding: var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
		border-radius: var(--radius-md);
		border: var(--border-thin);
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
	}

	.role-callout--admin {
		background: color-mix(in srgb, var(--surface-subtle) 60%, var(--surface-panel) 40%);
	}

	.role-callout--team-leader {
		background: color-mix(in srgb, var(--amber-light) 60%, var(--surface-panel) 40%);
	}

	.role-callout--viewer {
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.role-callout--admin .role-callout-label {
		color: var(--amber-dark);
	}

	.role-callout--team-leader .role-callout-label {
		color: var(--amber-dark);
	}

	.role-callout--viewer .role-callout-label {
		color: var(--text-secondary);
	}

	.role-callout-text {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		line-height: 1.65;
	}

	.help-footer {
		margin-top: var(--sp-5);
		padding: var(--sp-5);
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
	}

	.help-footer p {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	.help-footer a {
		color: var(--amber-dark);
		font-weight: 500;
		text-decoration: none;
	}

	.help-footer a:hover {
		text-decoration: underline;
	}

	.theme-toggle {
		position: fixed;
		top: var(--sp-4);
		right: var(--sp-4);
		width: 44px;
		height: 44px;
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		border: var(--border-thin);
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: var(--shadow-md);
		z-index: 100;
	}

	.theme-toggle:hover {
		color: var(--text-strong);
	}

	.theme-toggle svg {
		width: 22px;
		height: 22px;
	}

	@media (max-width: 640px) {
		.help-page {
			padding: var(--sp-4);
		}

		.help-header h1 {
			font-size: clamp(2.2rem, 9vw, 3rem);
		}

		.section-header {
			padding: var(--sp-3);
		}

		.section-content {
			padding: 0 var(--sp-3) var(--sp-3);
		}

		.section-title h2 {
			font-size: 1.8rem;
		}

		.section-title svg {
			width: 24px;
			height: 24px;
		}

		.help-item {
			padding: var(--sp-3);
		}

		.role-callout {
			flex-direction: column;
		}
	}
</style>
