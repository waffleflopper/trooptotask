<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';

	let expandedSection = $state<string | null>('getting-started');

	function toggleSection(section: string) {
		expandedSection = expandedSection === section ? null : section;
	}

	const sections = [
		{
			id: 'getting-started',
			title: 'Getting Started',
			icon: 'M13 10V3L4 14h7v7l9-11h-7z',
			items: [
				{
					title: 'Dashboard',
					content:
						'The Dashboard is your home base. Here you can see all organizations you belong to, accept or decline invitations to new organizations, and create new organizations. Click on any organization to enter it.'
				},
				{
					title: 'Navigation',
					content:
						'Once inside an organization, use the sidebar on the left to navigate between Calendar, Personnel, Training, and Settings. On mobile devices, tap the menu icon in the top-right corner to open the sidebar.'
				},
				{
					title: 'Theme Toggle',
					content:
						'Click the sun/moon icon in the sidebar or on standalone pages to switch between light and dark mode. Your preference is saved automatically.'
				}
			]
		},
		{
			id: 'calendar',
			title: 'Calendar',
			icon: 'M3 4h18v16H3V4zm0 6h18M8 2v4m8-4v4',
			items: [
				{
					title: 'Overview',
					content:
						'The Calendar view shows a monthly grid with all personnel and their availability status for each day. Rows represent people, columns represent days. Weekends and holidays are highlighted with different background colors.'
				},
				{
					title: 'Adding Status Entries',
					content:
						'Click on any cell in the calendar to add or modify a status entry. You can set statuses like Leave, TDY, School, Sick, and more. Select a date range if the status spans multiple days.'
				},
				{
					title: "Today's Breakdown",
					content:
						'Access this from the sidebar under "Calendar Tools". It shows a quick summary of who is available vs. unavailable today, grouped by their current status.'
				},
				{
					title: '3-Month View',
					content:
						'For long-range planning, click "3-Month View" in the sidebar. This displays three months at once so you can see coverage gaps and plan ahead for leave, TDY, and training schedules.'
				},
				{
					title: 'Daily Assignments',
					content:
						'Use the "Assignments" tool in the sidebar to assign personnel to daily duties like MOD (Medical Officer of the Day), Front Desk Support, or custom duty types. The monthly planner lets you quickly fill assignments.'
				},
				{
					title: 'Bulk Status',
					content:
						'Need to apply the same status to multiple people? Use "Bulk Status" from the sidebar. Select personnel, choose a status, set the date range, and apply all at once.'
				},
				{
					title: 'Export Options',
					content:
						'Export the calendar to Excel for spreadsheet analysis or print/save as PDF. Find these options under "Export Calendar" in the sidebar.'
				},
				{
					title: 'Show Status Text',
					content:
						'Toggle "Show Status Text" in Display Options to show abbreviated status names on calendar cells in addition to the color coding.'
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
						'Toggle between two view modes using the buttons in the filter bar: "By Group" shows personnel organized under their group headings with collapsible sections. "A-Z" shows everyone in a single alphabetical list with group badges.'
				},
				{
					title: 'Adding Personnel',
					content:
						'Click "Add Person" in the sidebar to add a new team member. Enter their name, rank, MOS, role, and assign them to a group.'
				},
				{
					title: 'Editing Personnel',
					content:
						'Click on any person in the list to edit their information. You can update their details or remove them from the organization.'
				},
				{
					title: 'Groups',
					content:
						'Organize personnel into logical groups (sections, teams, departments). Click "Manage Groups" in the sidebar to create, rename, reorder, or delete groups. Pin frequently used groups to keep them at the top.'
				},
				{
					title: 'Bulk Import',
					content:
						'Import many personnel at once using Excel or CSV files. Click "Bulk Import" in the sidebar and follow the format guidelines. Required columns: FirstName, LastName, Rank. Optional: MOS, Role, Group.'
				},
				{
					title: 'Bulk Delete',
					content:
						'To remove multiple personnel, use the checkboxes to select them, then click the delete button that appears. A confirmation dialog prevents accidental deletion.'
				},
				{
					title: 'Search',
					content:
						'Use the search box at the top to filter personnel by name. The search works in both view modes.'
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
						'The Training page displays a matrix grid showing all personnel and their training certifications. Each cell shows the completion status with color-coded expiration warnings.'
				},
				{
					title: 'View Modes',
					content:
						'Like the Personnel page, toggle between "A-Z" (alphabetical single list) and "By Group" (organized by group with collapsible sections) using the view mode buttons.'
				},
				{
					title: 'Expiration Colors',
					content:
						'Training cells are color-coded: Green = valid, Yellow = expiring within 60 days, Orange = expiring within 30 days, Red = expired or missing. This helps you quickly identify who needs recertification.'
				},
				{
					title: 'Recording Training',
					content:
						'Click on any cell in the training matrix to record a completion date. The system automatically calculates the expiration date based on the training type settings.'
				},
				{
					title: 'Training Types',
					content:
						'Click "Manage Types" in the sidebar to configure what training certifications you track. Set the name, expiration period (in months), and optionally restrict by role.'
				},
				{
					title: 'Reports',
					content:
						'Click "Reports" in the sidebar to see delinquency reports. These show all expired or soon-to-expire training sorted by urgency, making it easy to prioritize recertification efforts.'
				},
				{
					title: 'Bulk Import',
					content:
						'Import training records in bulk via Excel or CSV. Click "Bulk Import" in the sidebar and follow the format: Person identifier, Training Type, Completion Date.'
				}
			]
		},
		{
			id: 'settings',
			title: 'Organization Settings',
			icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
			items: [
				{
					title: 'Organization Name',
					content:
						'As the owner, you can rename your organization at any time from the Settings page.'
				},
				{
					title: 'Member Management',
					content:
						'View all organization members, their roles, and permissions. Members with "Manage Members" permission can invite new users and adjust permissions.'
				},
				{
					title: 'Inviting Members',
					content:
						'Enter an email address and select a permission preset to invite someone. They will see the invitation on their Dashboard when they log in. No email is sent automatically.'
				},
				{
					title: 'Permission Presets',
					content:
						'Choose from presets: Full Editor (all permissions), Calendar Only, Personnel Only, Training Only, Read-Only (view everything, edit nothing), or Custom (pick individual permissions).'
				},
				{
					title: 'Editing Permissions',
					content:
						'Click the edit icon next to a member to change their permissions. You cannot modify the owner\'s permissions.'
				},
				{
					title: 'Removing Members',
					content:
						'Click the remove icon to remove a member from the organization. You cannot remove yourself or the owner.'
				},
				{
					title: 'Transfer Ownership',
					content:
						'As the owner, you can transfer ownership to another member. This makes them the new owner and changes your role to member.'
				},
				{
					title: 'Delete Organization',
					content:
						'Only the owner can delete an organization. This permanently removes all data including personnel, calendar entries, and training records. This action cannot be undone.'
				}
			]
		},
		{
			id: 'status-types',
			title: 'Status Types & Holidays',
			icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
			items: [
				{
					title: 'Status Types',
					content:
						'Configure the status types available in your calendar (Leave, TDY, School, Sick, etc.). Access via sidebar > Settings > Status Types. Set name, abbreviation, color, and whether it counts as "unavailable".'
				},
				{
					title: 'Assignment Types',
					content:
						'Define duty assignments like MOD, Front Desk, CQ, etc. Access via sidebar > Settings > Assignment Types. You can restrict certain assignments to specific roles (e.g., only PA/MD can be MOD).'
				},
				{
					title: 'Holidays',
					content:
						'Manage special days and holidays. Access via sidebar > Settings > Holidays. Federal holidays are pre-loaded but you can add organizational closures, training days, or custom events.'
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
						'If you belong to multiple organizations, click on the organization name below the header to quickly switch between them without going back to the Dashboard.'
				},
				{
					title: 'Pin Groups',
					content:
						'Frequently used groups can be pinned to always appear at the top of lists. Look for the pin icon when managing groups.'
				},
				{
					title: 'Keyboard Navigation',
					content:
						'Use Tab to navigate between interactive elements. Press Enter or Space to activate buttons and links. Press Escape to close modals and dialogs.'
				},
				{
					title: 'Mobile Usage',
					content:
						'On mobile devices, the sidebar becomes a slide-out menu. Tap the menu icon in the top-right corner. The calendar and training matrix scroll horizontally for full visibility.'
				},
				{
					title: 'Duty Roster Generator',
					content:
						'Use the Duty Roster tool to automatically distribute assignments fairly across eligible personnel, taking into account their availability and previous assignment counts.'
				}
			]
		}
	];
</script>

<svelte:head>
	<title>Help - Troop to Task</title>
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
				<path
					d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
				/>
			</svg>
		{/if}
	</button>

	<div class="help-container">
		<header class="help-header">
			<a href="/dashboard" class="back-link">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="19" y1="12" x2="5" y2="12" />
					<polyline points="12 19 5 12 12 5" />
				</svg>
				Back to Dashboard
			</a>
			<h1>Help & Documentation</h1>
			<p class="subtitle">Learn how to use Troop to Task to manage your organization</p>
		</header>

		<div class="sections">
			{#each sections as section (section.id)}
				<div class="section" class:expanded={expandedSection === section.id}>
					<button
						class="section-header"
						onclick={() => toggleSection(section.id)}
						aria-expanded={expandedSection === section.id}
					>
						<div class="section-title">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d={section.icon} />
							</svg>
							<h2>{section.title}</h2>
						</div>
						<svg
							class="chevron"
							class:rotated={expandedSection === section.id}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>
					{#if expandedSection === section.id}
						<div class="section-content">
							{#each section.items as item}
								<div class="help-item">
									<h3>{item.title}</h3>
									<p>{item.content}</p>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<footer class="help-footer">
			<p>
				Need more help? Contact your organization administrator or visit the
				<a href="https://github.com/waffleflopper/trooptotask" target="_blank" rel="noopener"
					>project repository</a
				>.
			</p>
		</footer>
	</div>
</div>

<style>
	.help-page {
		min-height: 100vh;
		background: var(--color-bg);
		padding: var(--spacing-lg);
	}

	.help-container {
		max-width: 800px;
		margin: 0 auto;
	}

	.help-header {
		text-align: center;
		margin-bottom: var(--spacing-xl);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-primary);
		text-decoration: none;
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.back-link:hover {
		text-decoration: underline;
	}

	.back-link svg {
		width: 16px;
		height: 16px;
	}

	.help-header h1 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-primary);
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		color: var(--color-text-muted);
		font-size: var(--font-size-base);
	}

	.sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.section.expanded {
		border-color: var(--color-primary);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--spacing-md) var(--spacing-lg);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
	}

	.section-header:hover {
		background: var(--color-bg);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.section-title svg {
		width: 24px;
		height: 24px;
		color: var(--color-primary);
	}

	.section-title h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.chevron {
		width: 20px;
		height: 20px;
		color: var(--color-text-muted);
		transition: transform 0.2s ease;
	}

	.chevron.rotated {
		transform: rotate(180deg);
	}

	.section-content {
		padding: 0 var(--spacing-lg) var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.help-item {
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.help-item h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.help-item p {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0;
	}

	.help-footer {
		margin-top: var(--spacing-xl);
		padding-top: var(--spacing-lg);
		border-top: 1px solid var(--color-border);
		text-align: center;
	}

	.help-footer p {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.help-footer a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.help-footer a:hover {
		text-decoration: underline;
	}

	.theme-toggle {
		position: fixed;
		top: var(--spacing-lg);
		right: var(--spacing-lg);
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: var(--shadow-md);
		z-index: 100;
	}

	.theme-toggle:hover {
		background: var(--color-bg);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.theme-toggle svg {
		width: 20px;
		height: 20px;
	}

	@media (max-width: 640px) {
		.help-page {
			padding: var(--spacing-md);
		}

		.section-header {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.section-content {
			padding: 0 var(--spacing-md) var(--spacing-md);
		}

		.section-title h2 {
			font-size: var(--font-size-base);
		}

		.section-title svg {
			width: 20px;
			height: 20px;
		}
	}
</style>
