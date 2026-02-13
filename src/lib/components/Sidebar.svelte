<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { OrganizationMemberPermissions } from '$lib/types';

	interface OrgInfo {
		id: string;
		name: string;
		role: string;
	}

	interface Props {
		orgId: string;
		orgName?: string;
		isOpen?: boolean;
		onClose?: () => void;
		onToggleTheme: () => void;
		isDarkTheme: boolean;
		// Permissions for visibility control
		permissions?: OrganizationMemberPermissions;
		// All organizations user belongs to (for switcher)
		allOrgs?: OrgInfo[];
		// Calendar-specific callbacks (only shown on calendar page)
		onShowLongRangeView?: () => void;
		onShowAssignmentPlanner?: () => void;
		onShowBulkStatus?: () => void;
		onShowTodayBreakdown?: () => void;
		onShowStatusManager?: () => void;
		onShowSpecialDayManager?: () => void;
		onShowDutyRosterGenerator?: () => void;
		// Calendar export callbacks
		onExportCalendarCSV?: () => void;
		onExportCalendarPDF?: () => void;
		// Calendar display options
		showStatusText?: boolean;
		onToggleStatusText?: () => void;
		// Assignment type management
		onShowAssignmentTypeManager?: () => void;
		// Platform invite
		onShowPlatformInvite?: () => void;
		// Personnel-specific callbacks
		onAddPerson?: () => void;
		onShowBulkImport?: () => void;
		onShowGroupManager?: () => void;
		// Training-specific callbacks
		onShowTrainingReports?: () => void;
		onShowTrainingTypeManager?: () => void;
		onShowTrainingBulkImport?: () => void;
	}

	let {
		orgId,
		orgName = 'Troop to Task',
		isOpen = false,
		onClose,
		onToggleTheme,
		isDarkTheme,
		permissions,
		allOrgs = [],
		onShowLongRangeView,
		onShowAssignmentPlanner,
		onShowBulkStatus,
		onShowTodayBreakdown,
		onShowStatusManager,
		onShowSpecialDayManager,
		onShowDutyRosterGenerator,
		onExportCalendarCSV,
		onExportCalendarPDF,
		showStatusText = false,
		onToggleStatusText,
		onShowAssignmentTypeManager,
		onShowPlatformInvite,
		onAddPerson,
		onShowBulkImport,
		onShowGroupManager,
		onShowTrainingReports,
		onShowTrainingTypeManager,
		onShowTrainingBulkImport
	}: Props = $props();

	let showOrgSwitcher = $state(false);

	function handleOrgSwitch(newOrgId: string) {
		showOrgSwitcher = false;
		if (newOrgId !== orgId) {
			// Navigate to same page type on the new org
			const currentPath = $page.url.pathname;
			const pathSuffix = currentPath.replace(`/org/${orgId}`, '');
			goto(`/org/${newOrgId}${pathSuffix}`);
		}
	}

	// Default permissions (full access) if not provided
	const perms = $derived(
		permissions ?? {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canManageMembers: true
		}
	);

	// Calendar tools: show view-only tools always, edit tools only with permission
	const hasCalendarViewTools = $derived(onShowLongRangeView || onShowTodayBreakdown);
	const hasCalendarEditTools = $derived(
		perms.canEditCalendar && (onShowAssignmentPlanner || onShowBulkStatus)
	);
	const hasCalendarTools = $derived(hasCalendarViewTools || hasCalendarEditTools);

	const hasCalendarExport = $derived(onExportCalendarCSV || onExportCalendarPDF);
	const hasCalendarDisplayOptions = $derived(!!onToggleStatusText);

	// Personnel tools: only show if can edit
	const hasPersonnelTools = $derived(
		perms.canEditPersonnel && (onAddPerson || onShowBulkImport || onShowGroupManager)
	);

	// Training tools: reports for view, type manager and bulk import for edit
	const hasTrainingViewTools = $derived(onShowTrainingReports);
	const hasTrainingEditTools = $derived(
		perms.canEditTraining && (onShowTrainingTypeManager || onShowTrainingBulkImport)
	);
	const hasTrainingTools = $derived(hasTrainingViewTools || hasTrainingEditTools);

	// Settings tools: only show if can edit calendar
	const hasSettingsTools = $derived(
		perms.canEditCalendar && (onShowStatusManager || onShowSpecialDayManager)
	);

	function handleNavClick(action?: () => void) {
		action?.();
		onClose?.();
	}

	function isActive(path: string): boolean {
		return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
	}
</script>

<!-- Mobile overlay (only shown when isOpen on mobile) -->
{#if isOpen}
	<div
		class="sidebar-overlay"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose?.()}
		role="button"
		tabindex="-1"
		aria-label="Close sidebar"
	></div>
{/if}

<aside class="sidebar" class:open={isOpen}>
	<div class="sidebar-header">
		<a href="/org/{orgId}" class="logo-link" onclick={() => onClose?.()}>
			<h1>Troop to Task</h1>
		</a>
		<button class="close-btn" onclick={onClose} aria-label="Close sidebar">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>

	{#if orgName}
		<div class="org-switcher">
			{#if allOrgs.length > 1}
				<button
					class="org-switcher-btn"
					onclick={() => (showOrgSwitcher = !showOrgSwitcher)}
					aria-expanded={showOrgSwitcher}
				>
					<span class="org-name-text">{orgName}</span>
					<svg class="chevron" class:open={showOrgSwitcher} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				{#if showOrgSwitcher}
					<div class="org-dropdown">
						{#each allOrgs as o (o.id)}
							<button
								class="org-option"
								class:active={o.id === orgId}
								onclick={() => handleOrgSwitch(o.id)}
							>
								<span class="org-option-name">{o.name}</span>
								<span class="org-option-role">{o.role}</span>
							</button>
						{/each}
						<a href="/dashboard?show=all" class="org-option manage-link" onclick={() => onClose?.()}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="3" />
								<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
							</svg>
							Manage Organizations
						</a>
					</div>
				{/if}
			{:else}
				<div class="org-name-static">{orgName}</div>
			{/if}
		</div>
	{/if}

	<nav class="sidebar-nav">
		<div class="nav-section">
			<h3>Navigation</h3>
			{#if perms.canViewCalendar}
				<a
					href="/org/{orgId}"
					class="nav-item"
					class:active={$page.url.pathname === `/org/${orgId}`}
					onclick={() => onClose?.()}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
						<line x1="16" y1="2" x2="16" y2="6" />
						<line x1="8" y1="2" x2="8" y2="6" />
						<line x1="3" y1="10" x2="21" y2="10" />
					</svg>
					Calendar
				</a>
			{/if}
			{#if perms.canViewPersonnel}
				<a
					href="/org/{orgId}/personnel"
					class="nav-item"
					class:active={isActive(`/org/${orgId}/personnel`)}
					onclick={() => onClose?.()}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
						<circle cx="9" cy="7" r="4" />
						<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
						<path d="M16 3.13a4 4 0 0 1 0 7.75" />
					</svg>
					Personnel
				</a>
			{/if}
			{#if perms.canViewTraining}
				<a
					href="/org/{orgId}/training"
					class="nav-item"
					class:active={isActive(`/org/${orgId}/training`)}
					onclick={() => onClose?.()}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
						<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
					</svg>
					Training
				</a>
			{/if}
		</div>

		{#if hasCalendarTools}
			<div class="nav-section">
				<h3>Calendar Tools</h3>
				{#if onShowTodayBreakdown}
					<button class="nav-item highlight" onclick={() => handleNavClick(onShowTodayBreakdown)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<polyline points="12 6 12 12 16 14" />
						</svg>
						Today's Breakdown
					</button>
				{/if}
				{#if onShowLongRangeView}
					<button class="nav-item" onclick={() => handleNavClick(onShowLongRangeView)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
							<line x1="16" y1="2" x2="16" y2="6" />
							<line x1="8" y1="2" x2="8" y2="6" />
							<line x1="3" y1="10" x2="21" y2="10" />
						</svg>
						3-Month View
					</button>
				{/if}
				{#if perms.canEditCalendar && onShowAssignmentPlanner}
					<button class="nav-item" onclick={() => handleNavClick(onShowAssignmentPlanner)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
						</svg>
						Assignments
					</button>
				{/if}
				{#if perms.canEditCalendar && onShowBulkStatus}
					<button class="nav-item" onclick={() => handleNavClick(onShowBulkStatus)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="9 11 12 14 22 4" />
							<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
						</svg>
						Bulk Status
					</button>
				{/if}
				{#if perms.canEditCalendar && onShowDutyRosterGenerator}
					<button class="nav-item" onclick={() => handleNavClick(onShowDutyRosterGenerator)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
							<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
							<path d="M9 14l2 2 4-4" />
						</svg>
						Duty Roster
					</button>
				{/if}
			</div>
		{/if}

		{#if hasCalendarDisplayOptions}
			<div class="nav-section">
				<h3>Display Options</h3>
				{#if onToggleStatusText}
					<button class="nav-item toggle-item" onclick={onToggleStatusText}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
						</svg>
						Show Status Text
						<span class="toggle-indicator" class:active={showStatusText}></span>
					</button>
				{/if}
			</div>
		{/if}

		{#if hasCalendarExport}
			<div class="nav-section">
				<h3>Export Calendar</h3>
				{#if onExportCalendarCSV}
					<button class="nav-item" onclick={() => handleNavClick(onExportCalendarCSV)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<polyline points="14 2 14 8 20 8" />
							<line x1="16" y1="13" x2="8" y2="13" />
							<line x1="16" y1="17" x2="8" y2="17" />
						</svg>
						Export to Excel
					</button>
				{/if}
				{#if onExportCalendarPDF}
					<button class="nav-item" onclick={() => handleNavClick(onExportCalendarPDF)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M6 9V2h12v7" />
							<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
							<rect x="6" y="14" width="12" height="8" />
						</svg>
						Print / PDF
					</button>
				{/if}
			</div>
		{/if}

		{#if hasPersonnelTools}
			<div class="nav-section">
				<h3>Personnel Tools</h3>
				{#if perms.canEditPersonnel && onAddPerson}
					<button class="nav-item highlight" onclick={() => handleNavClick(onAddPerson)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
							<circle cx="8.5" cy="7" r="4" />
							<line x1="20" y1="8" x2="20" y2="14" />
							<line x1="23" y1="11" x2="17" y2="11" />
						</svg>
						Add Person
					</button>
				{/if}
				{#if perms.canEditPersonnel && onShowBulkImport}
					<button class="nav-item" onclick={() => handleNavClick(onShowBulkImport)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						Bulk Import
					</button>
				{/if}
				{#if perms.canEditPersonnel && onShowGroupManager}
					<button class="nav-item" onclick={() => handleNavClick(onShowGroupManager)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
							<path d="M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
						Manage Groups
					</button>
				{/if}
			</div>
		{/if}

		{#if hasTrainingTools}
			<div class="nav-section">
				<h3>Training Tools</h3>
				{#if perms.canEditTraining && onShowTrainingBulkImport}
					<button class="nav-item" onclick={() => handleNavClick(onShowTrainingBulkImport)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						Bulk Import
					</button>
				{/if}
				{#if onShowTrainingReports}
					<button class="nav-item" onclick={() => handleNavClick(onShowTrainingReports)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<polyline points="14 2 14 8 20 8" />
							<line x1="16" y1="13" x2="8" y2="13" />
							<line x1="16" y1="17" x2="8" y2="17" />
							<polyline points="10 9 9 9 8 9" />
						</svg>
						Reports
					</button>
				{/if}
				{#if perms.canEditTraining && onShowTrainingTypeManager}
					<button class="nav-item" onclick={() => handleNavClick(onShowTrainingTypeManager)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="3" />
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
						</svg>
						Manage Types
					</button>
				{/if}
			</div>
		{/if}

		<div class="nav-section">
			<h3>Settings</h3>
			{#if perms.canEditCalendar && onShowStatusManager}
				<button class="nav-item" onclick={() => handleNavClick(onShowStatusManager)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
					Status Types
				</button>
			{/if}
			{#if perms.canEditCalendar && onShowAssignmentTypeManager}
				<button class="nav-item" onclick={() => handleNavClick(onShowAssignmentTypeManager)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
						<circle cx="8.5" cy="7" r="4" />
						<line x1="20" y1="8" x2="20" y2="14" />
						<line x1="23" y1="11" x2="17" y2="11" />
					</svg>
					Assignment Types
				</button>
			{/if}
			{#if perms.canEditCalendar && onShowSpecialDayManager}
				<button class="nav-item" onclick={() => handleNavClick(onShowSpecialDayManager)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
					</svg>
					Holidays
				</button>
			{/if}
			<a href="/org/{orgId}/settings" class="nav-item" onclick={() => onClose?.()}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
					<circle cx="12" cy="12" r="3" />
				</svg>
				Settings
			</a>
			<button class="nav-item" onclick={onToggleTheme}>
				{#if isDarkTheme}
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
					Light Mode
				{:else}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
					</svg>
					Dark Mode
				{/if}
			</button>
		</div>
	</nav>

	<div class="sidebar-footer">
		{#if onShowPlatformInvite}
			<button class="nav-item" onclick={() => handleNavClick(onShowPlatformInvite)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
					<circle cx="8.5" cy="7" r="4" />
					<line x1="20" y1="8" x2="20" y2="14" />
					<line x1="23" y1="11" x2="17" y2="11" />
				</svg>
				Invite to Platform
			</button>
		{/if}
		<a href="/dashboard?show=all" class="nav-item" onclick={() => onClose?.()}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="3" width="7" height="7" />
				<rect x="14" y="3" width="7" height="7" />
				<rect x="14" y="14" width="7" height="7" />
				<rect x="3" y="14" width="7" height="7" />
			</svg>
			Dashboard
		</a>
		<a href="/auth/logout" class="nav-item logout">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
				<polyline points="16 17 21 12 16 7" />
				<line x1="21" y1="12" x2="9" y2="12" />
			</svg>
			Sign Out
		</a>
	</div>
</aside>

<style>
	/* Sidebar width variable */
	:global(:root) {
		--sidebar-width: 240px;
	}

	.sidebar-overlay {
		display: none;
	}

	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		width: var(--sidebar-width);
		height: 100vh;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		z-index: 100;
		overflow-y: auto;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-primary);
		color: white;
	}

	.logo-link {
		text-decoration: none;
		color: white;
	}

	.sidebar-header h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
	}

	.close-btn {
		display: none;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.1);
		color: white;
		transition: background 0.15s ease;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.close-btn svg {
		width: 20px;
		height: 20px;
	}

	.org-switcher {
		position: relative;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg);
	}

	.org-switcher-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-lg);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
	}

	.org-switcher-btn:hover {
		background: var(--color-surface);
		color: var(--color-text);
	}

	.org-name-text {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.org-switcher-btn .chevron {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		transition: transform 0.2s ease;
	}

	.org-switcher-btn .chevron.open {
		transform: rotate(180deg);
	}

	.org-name-static {
		padding: var(--spacing-sm) var(--spacing-lg);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.org-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-top: none;
		box-shadow: var(--shadow-lg);
		z-index: 200;
		max-height: 300px;
		overflow-y: auto;
	}

	.org-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-lg);
		font-size: var(--font-size-sm);
		color: var(--color-text);
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		text-decoration: none;
		transition: background 0.15s ease;
	}

	.org-option:hover {
		background: var(--color-bg);
	}

	.org-option.active {
		background: var(--color-bg);
		font-weight: 600;
		color: var(--color-primary);
	}

	.org-option-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.org-option-role {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: capitalize;
		margin-left: var(--spacing-sm);
	}

	.org-option.manage-link {
		border-top: 1px solid var(--color-border);
		color: var(--color-primary);
		gap: var(--spacing-sm);
	}

	.org-option.manage-link svg {
		width: 16px;
		height: 16px;
	}

	.sidebar-nav {
		flex: 1;
		overflow-y: auto;
	}

	.nav-section {
		padding: var(--spacing-md) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.nav-section:last-child {
		border-bottom: none;
	}

	.nav-section h3 {
		padding: 0 var(--spacing-lg);
		margin-bottom: var(--spacing-sm);
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--color-text-muted);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-lg);
		font-size: var(--font-size-sm);
		color: var(--color-text);
		text-decoration: none;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
	}

	.nav-item:hover {
		background: var(--color-bg);
	}

	.nav-item.active {
		background: var(--color-bg);
		color: var(--color-primary);
		font-weight: 600;
	}

	.nav-item.active svg {
		color: var(--color-primary);
	}

	.nav-item svg {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--color-text-muted);
	}

	.nav-item.highlight {
		background: var(--color-secondary);
		color: white;
		margin: var(--spacing-xs) var(--spacing-md);
		border-radius: var(--radius-md);
		width: calc(100% - var(--spacing-lg));
	}

	.nav-item.highlight svg {
		color: white;
	}

	.nav-item.highlight:hover {
		filter: brightness(1.1);
		background: var(--color-secondary);
	}

	.nav-item.toggle-item {
		justify-content: flex-start;
	}

	.toggle-indicator {
		margin-left: auto;
		width: 36px;
		height: 20px;
		background: var(--color-border);
		border-radius: 10px;
		position: relative;
		transition: background 0.2s ease;
	}

	.toggle-indicator::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		background: white;
		border-radius: 50%;
		transition: transform 0.2s ease;
	}

	.toggle-indicator.active {
		background: var(--color-primary);
	}

	.toggle-indicator.active::after {
		transform: translateX(16px);
	}

	.sidebar-footer {
		padding: var(--spacing-md) 0;
		border-top: 1px solid var(--color-border);
		margin-top: auto;
	}

	.nav-item.logout {
		color: #dc2626;
	}

	.nav-item.logout svg {
		color: #dc2626;
	}

	.nav-item.logout:hover {
		background: rgba(220, 38, 38, 0.1);
	}

	/* Mobile styles - sidebar becomes a drawer */
	@media (max-width: 640px) {
		.sidebar-overlay {
			display: block;
			position: fixed;
			inset: 0;
			background-color: rgba(0, 0, 0, 0.5);
			z-index: 999;
			animation: fadeIn 0.2s ease;
		}

		@keyframes fadeIn {
			from { opacity: 0; }
			to { opacity: 1; }
		}

		.sidebar {
			position: fixed;
			left: auto;
			right: 0;
			width: 280px;
			max-width: 85vw;
			transform: translateX(100%);
			transition: transform 0.2s ease;
			box-shadow: var(--shadow-lg);
			border-right: none;
			border-left: 1px solid var(--color-border);
			z-index: 1000;
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.close-btn {
			display: flex;
		}
	}

	/* Tablet styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		:global(:root) {
			--sidebar-width: 200px;
		}

		.nav-item {
			padding: var(--spacing-xs) var(--spacing-md);
			font-size: var(--font-size-xs);
		}

		.nav-item svg {
			width: 16px;
			height: 16px;
		}

		.sidebar-header {
			padding: var(--spacing-md) var(--spacing-md);
		}

		.sidebar-header h1 {
			font-size: var(--font-size-xl);
		}

		.org-switcher-btn,
		.org-name-static {
			padding: var(--spacing-xs) var(--spacing-md);
			font-size: var(--font-size-xs);
		}

		.nav-section h3 {
			padding: 0 var(--spacing-md);
			font-size: 9px;
		}
	}
</style>
