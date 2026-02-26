<script lang="ts">
	import { personnelStore } from '$lib/stores/personnel.svelte';
	import { statusTypesStore } from '$lib/stores/statusTypes.svelte';
	import { availabilityStore } from '$lib/stores/availability.svelte';
	import { dailyAssignmentsStore } from '$lib/stores/dailyAssignments.svelte';
	import { trainingTypesStore } from '$lib/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$lib/stores/personnelTrainings.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { getTrainingStatus, getTrainingStats } from '$lib/utils/trainingStatus';
	import { parseDate } from '$lib/utils/dates';

	let { data } = $props();
	let showSidebar = $state(false);

	$effect(() => {
		personnelStore.load(data.personnel, data.orgId);
		groupsStore.load(data.groups, data.orgId);
		statusTypesStore.load(data.statusTypes, data.orgId);
		availabilityStore.load(data.availabilityEntries, data.orgId);
		dailyAssignmentsStore.load(data.assignmentTypes, data.todayAssignments, data.orgId);
		trainingTypesStore.load(data.trainingTypes, data.orgId);
		personnelTrainingsStore.load(data.personnelTrainings, data.orgId);
		pinnedGroupsStore.load(data.pinnedGroups, data.orgId);

		if (data.subscriptionLimits) {
			subscriptionStore.load({
				subscription: null,
				plan: { id: data.subscriptionLimits.planId, name: data.subscriptionLimits.planName } as any,
				organizationCount: data.subscriptionLimits.currentOrganizations
			});
		}
	});

	// Today's date string from server
	const today = data.today;

	// Format today for display
	const todayDisplay = $derived(() => {
		const d = parseDate(today);
		const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
	});

	// Availability entries covering today
	const todayEntries = $derived(
		availabilityStore.list.filter((e) => e.startDate <= today && e.endDate >= today)
	);

	// Personnel on status today (set)
	const unavailablePersonnelIds = $derived(new Set(todayEntries.map((e) => e.personnelId)));

	// Available count
	const totalPersonnel = $derived(personnelStore.list.length);
	const availableCount = $derived(totalPersonnel - unavailablePersonnelIds.size);

	// Status breakdown: Map<statusTypeId, {name, color, textColor, count}>
	const statusBreakdown = $derived.by(() => {
		const map = new Map<string, { name: string; color: string; textColor: string; count: number }>();
		for (const entry of todayEntries) {
			const st = statusTypesStore.list.find((s) => s.id === entry.statusTypeId);
			if (!st) continue;
			const existing = map.get(st.id);
			if (existing) {
				existing.count++;
			} else {
				map.set(st.id, { name: st.name, color: st.color, textColor: st.textColor, count: 1 });
			}
		}
		return map;
	});

	// Duty assignments for today: join with types + assignee names
	const dutyAssignments = $derived.by(() => {
		return dailyAssignmentsStore.assignments
			.filter((a) => a.date === today)
			.map((a) => {
				const type = dailyAssignmentsStore.types.find((t) => t.id === a.assignmentTypeId);
				let assigneeName = '';
				if (type?.assignTo === 'personnel') {
					const person = personnelStore.list.find((p) => p.id === a.assigneeId);
					if (person) assigneeName = `${person.rank} ${person.lastName}`;
				} else {
					// Group assignments store the group name directly as assigneeId (not a UUID)
					assigneeName = a.assigneeId;
				}
				return {
					id: a.id,
					typeName: type?.name ?? 'Unknown',
					shortName: type?.shortName ?? '',
					color: type?.color ?? '#9e9e9e',
					assigneeName
				};
			});
	});

	// Training stats across all personnel
	const trainingStats = $derived.by(() => {
		if (trainingTypesStore.list.length === 0) return null;
		return getTrainingStats(
			personnelStore.list,
			trainingTypesStore.list,
			personnelTrainingsStore.list
		);
	});

	// Top expired/warning personnel for training card
	const topTrainingIssues = $derived.by(() => {
		if (trainingTypesStore.list.length === 0) return [];
		const issues: { personName: string; typeName: string; label: string; status: string }[] = [];
		const trainingMap = new Map(
			personnelTrainingsStore.list.map((t) => [`${t.personnelId}-${t.trainingTypeId}`, t])
		);
		for (const person of personnelStore.list) {
			for (const type of trainingTypesStore.list) {
				const training = trainingMap.get(`${person.id}-${type.id}`);
				const info = getTrainingStatus(training, type, person);
				if (info.status === 'expired' || info.status === 'warning-orange') {
					issues.push({
						personName: `${person.rank} ${person.lastName}`,
						typeName: type.name,
						label: info.label,
						status: info.status
					});
				}
			}
		}
		// Sort: expired first, then by label
		issues.sort((a, b) => {
			if (a.status === 'expired' && b.status !== 'expired') return -1;
			if (b.status === 'expired' && a.status !== 'expired') return 1;
			return 0;
		});
		return issues.slice(0, 5);
	});

	// Upcoming changes: entries starting OR ending in next 7 days
	const upcomingChanges = $derived.by(() => {
		const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const twoWeeksStr = `${sevenDaysOut.getFullYear()}-${String(sevenDaysOut.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysOut.getDate()).padStart(2, '0')}`;

		const changes: {
			date: string;
			personName: string;
			statusName: string;
			statusColor: string;
			direction: 'departing' | 'returning';
		}[] = [];

		for (const entry of availabilityStore.list) {
			const person = personnelStore.list.find((p) => p.id === entry.personnelId);
			const st = statusTypesStore.list.find((s) => s.id === entry.statusTypeId);
			if (!person || !st) continue;

			// Starting soon (departing)
			if (entry.startDate > today && entry.startDate <= twoWeeksStr) {
				changes.push({
					date: entry.startDate,
					personName: `${person.rank} ${person.lastName}`,
					statusName: st.name,
					statusColor: st.color,
					direction: 'departing'
				});
			}
			// Ending soon (returning)
			if (entry.endDate >= today && entry.endDate <= twoWeeksStr) {
				// endDate + 1 day is when they return
				const endD = parseDate(entry.endDate);
				endD.setDate(endD.getDate() + 1);
				const returnDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
				if (returnDate > today && returnDate <= twoWeeksStr) {
					changes.push({
						date: returnDate,
						personName: `${person.rank} ${person.lastName}`,
						statusName: st.name,
						statusColor: st.color,
						direction: 'returning'
					});
				}
			}
		}

		changes.sort((a, b) => a.date.localeCompare(b.date));
		return changes;
	});

	// Format a date string for display (e.g. "Feb 26")
	function formatShortDate(dateStr: string): string {
		const d = parseDate(dateStr);
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${months[d.getMonth()]} ${d.getDate()}`;
	}

	// Group upcomingChanges by date
	const upcomingByDate = $derived.by(() => {
		const map = new Map<string, typeof upcomingChanges>();
		for (const change of upcomingChanges) {
			const existing = map.get(change.date);
			if (existing) existing.push(change);
			else map.set(change.date, [change]);
		}
		return map;
	});

	// Per-group breakdown
	const groupBreakdown = $derived.by(() => {
		// Sort: pinned groups first, then by sort order
		const pinnedSet = new Set(pinnedGroupsStore.list);
		const sorted = [...groupsStore.list].sort((a, b) => {
			const aPinned = pinnedSet.has(a.name);
			const bPinned = pinnedSet.has(b.name);
			if (aPinned && !bPinned) return -1;
			if (!aPinned && bPinned) return 1;
			return a.sortOrder - b.sortOrder;
		});

		return sorted.map((group) => {
			const groupPersonnel = personnelStore.list.filter((p) => p.groupId === group.id);
			const total = groupPersonnel.length;
			const unavailable = groupPersonnel.filter((p) => unavailablePersonnelIds.has(p.id)).length;
			const available = total - unavailable;
			const pct = total > 0 ? Math.round((available / total) * 100) : 100;

			// Per-status counts
			const statusCounts = new Map<string, number>();
			for (const person of groupPersonnel) {
				const entry = todayEntries.find((e) => e.personnelId === person.id);
				if (entry) {
					statusCounts.set(entry.statusTypeId, (statusCounts.get(entry.statusTypeId) ?? 0) + 1);
				}
			}

			return {
				id: group.id,
				name: group.name,
				total,
				available,
				pct,
				statusCounts,
				isPinned: pinnedSet.has(group.name)
			};
		});
	});

	// Duty strength percentage
	const dutyStrengthPct = $derived(
		totalPersonnel > 0 ? Math.round((availableCount / totalPersonnel) * 100) : 100
	);
</script>

<svelte:head>
	<title>{data.orgName} - Dashboard - Troop to Task</title>
</svelte:head>

<Sidebar
	orgId={data.orgId}
	orgName={data.orgName}
	isOpen={showSidebar}
	onClose={() => (showSidebar = false)}
	onToggleTheme={() => themeStore.toggle()}
	isDarkTheme={themeStore.isDark}
	permissions={data.permissions}
	allOrgs={data.allOrgs}
/>

<div class="page">
	<header class="page-header mobile-only">
		<h1>Troop to Task</h1>
		<button class="mobile-menu-btn" onclick={() => (showSidebar = true)} aria-label="Open menu">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="3" y1="12" x2="21" y2="12" />
				<line x1="3" y1="6" x2="21" y2="6" />
				<line x1="3" y1="18" x2="21" y2="18" />
			</svg>
		</button>
	</header>

	<main class="dashboard">
		<!-- Header -->
		<div class="dashboard-header">
			<div class="dashboard-title">
				<h2>{data.orgName}</h2>
				<p class="greeting">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</p>
			</div>
			<div class="dashboard-date">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="date-icon">
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
				</svg>
				<span>{todayDisplay()}</span>
			</div>
		</div>

		<!-- Quick Actions -->
		<div class="quick-actions">
			<a href="/org/{data.orgId}/calendar" class="quick-action">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
				</svg>
				Calendar
			</a>
			{#if data.permissions?.canViewPersonnel}
				<a href="/org/{data.orgId}/personnel" class="quick-action">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
						<circle cx="9" cy="7" r="4" />
						<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
						<path d="M16 3.13a4 4 0 0 1 0 7.75" />
					</svg>
					Personnel
				</a>
			{/if}
			{#if data.permissions?.canViewTraining}
				<a href="/org/{data.orgId}/training" class="quick-action">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
						<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
					</svg>
					Training
				</a>
			{/if}
			{#if data.permissions?.canViewPersonnel}
				<a href="/org/{data.orgId}/leaders-book" class="quick-action">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
						<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
						<line x1="8" y1="7" x2="16" y2="7" />
						<line x1="8" y1="11" x2="16" y2="11" />
					</svg>
					Leaders Book
				</a>
			{/if}
		</div>

		<!-- Card Row 1: Strength + Duty -->
		<div class="card-row">
			<!-- Today's Strength -->
			<div class="card">
				<div class="card-header">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
						<circle cx="9" cy="7" r="4" />
						<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
						<path d="M16 3.13a4 4 0 0 1 0 7.75" />
					</svg>
					Today's Strength
				</div>
				<div class="card-body">
					<div class="strength-numbers">
						<div class="strength-main">
							<span class="strength-value">{availableCount}</span>
							<span class="strength-label">available</span>
						</div>
						<div class="strength-divider">/</div>
						<div class="strength-total">
							<span class="strength-value strength-value--muted">{totalPersonnel}</span>
							<span class="strength-label">total</span>
						</div>
					</div>

					<div class="strength-bar-wrap">
						<div class="strength-bar">
							<div
								class="strength-bar-fill"
								style="width: {dutyStrengthPct}%; background: {dutyStrengthPct >= 80 ? 'var(--color-success)' : dutyStrengthPct >= 60 ? 'var(--color-warning)' : 'var(--color-error)'}"
							></div>
						</div>
						<span class="strength-pct">{dutyStrengthPct}% present</span>
					</div>

					{#if statusBreakdown.size > 0}
						<div class="status-chips">
							{#each [...statusBreakdown.entries()] as [, info]}
								<span class="status-chip" style="background: {info.color}; color: {info.textColor}">
									{info.count} {info.name}
								</span>
							{/each}
						</div>
					{:else}
						<p class="empty-note">All personnel present</p>
					{/if}
				</div>
			</div>

			<!-- Today's Duty Assignments -->
			<div class="card">
				<div class="card-header">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
						<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
						<path d="M9 14l2 2 4-4" />
					</svg>
					Today's Duty Assignments
				</div>
				<div class="card-body">
					{#if dutyAssignments.length > 0}
						<div class="duty-list">
							{#each dutyAssignments as assignment}
								<div class="duty-item">
									<span
										class="duty-badge"
										style="background: {assignment.color}"
									>{assignment.shortName || assignment.typeName}</span>
									<span class="duty-assignee">{assignment.assigneeName || 'Unassigned'}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<p>No assignments today</p>
							<a href="/org/{data.orgId}/calendar" class="btn btn-text btn-sm">Manage in Calendar</a>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Card Row 2: Training + Upcoming -->
		<div class="card-row">
			<!-- Training Status -->
			<div class="card">
				<div class="card-header">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
						<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
					</svg>
					Training Status
				</div>
				<div class="card-body">
					{#if trainingStats === null}
						<div class="empty-state">
							<p>No training types configured</p>
							{#if data.permissions?.canEditTraining}
								<a href="/org/{data.orgId}/training" class="btn btn-text btn-sm">Set Up Training</a>
							{/if}
						</div>
					{:else}
						<div class="training-stats">
							<div class="training-stat training-stat--expired">
								<span class="training-stat-value">{trainingStats.expired}</span>
								<span class="training-stat-label">Expired</span>
							</div>
							<div class="training-stat training-stat--orange">
								<span class="training-stat-value">{trainingStats.warningOrange}</span>
								<span class="training-stat-label">Expiring Soon</span>
							</div>
							<div class="training-stat training-stat--yellow">
								<span class="training-stat-value">{trainingStats.warningYellow}</span>
								<span class="training-stat-label">Due Soon</span>
							</div>
							<div class="training-stat training-stat--current">
								<span class="training-stat-value">{trainingStats.current}</span>
								<span class="training-stat-label">Current</span>
							</div>
						</div>

						{#if topTrainingIssues.length > 0}
							<div class="training-issues">
								<p class="issues-label">Needs attention:</p>
								{#each topTrainingIssues as issue}
									<div class="issue-row">
										<span class="issue-name">{issue.personName}</span>
										<span class="issue-type">{issue.typeName}</span>
										<span class="issue-badge" class:expired={issue.status === 'expired'} class:warning={issue.status === 'warning-orange'}>
											{issue.label}
										</span>
									</div>
								{/each}
							</div>
						{/if}

						<div class="card-link">
							<a href="/org/{data.orgId}/training" class="btn btn-text btn-sm">View Full Training Report</a>
						</div>
					{/if}
				</div>
			</div>

			<!-- Upcoming Changes -->
			<div class="card">
				<div class="card-header">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
					Upcoming (Next 7 Days)
				</div>
				<div class="card-body">
					{#if upcomingByDate.size === 0}
						<div class="empty-state">
							<p>No changes in the next 7 days</p>
							<a href="/org/{data.orgId}/calendar" class="btn btn-text btn-sm">View Calendar</a>
						</div>
					{:else}
						<div class="upcoming-list">
							{#each [...upcomingByDate.entries()] as [date, changes]}
								<div class="upcoming-group">
									<div class="upcoming-date">{formatShortDate(date)}</div>
									{#each changes as change}
										<div class="upcoming-item">
											<span
												class="upcoming-dot"
												style="background: {change.statusColor}"
											></span>
											<span class="upcoming-person">{change.personName}</span>
											<span class="upcoming-direction" class:departing={change.direction === 'departing'} class:returning={change.direction === 'returning'}>
												{change.direction === 'departing' ? 'starts' : 'returns'} — {change.statusName}
											</span>
										</div>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Per-Group Breakdown -->
		{#if groupBreakdown.length > 0}
			<div class="card card--full">
				<div class="card-header">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
						<circle cx="9" cy="7" r="4" />
						<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
						<path d="M16 3.13a4 4 0 0 1 0 7.75" />
					</svg>
					Per-Group Breakdown
				</div>
				<div class="card-body card-body--no-pad">
					<div class="group-table-wrap">
						<table class="group-table">
							<thead>
								<tr>
									<th class="col-group">Group</th>
									<th class="col-num">Total</th>
									<th class="col-num">Present</th>
									{#each statusTypesStore.list as st}
										<th class="col-num col-status" style="color: {st.color}">{st.name}</th>
									{/each}
									<th class="col-num">%</th>
								</tr>
							</thead>
							<tbody>
								{#each groupBreakdown as group}
									<tr class:pinned={group.isPinned}>
										<td class="col-group">
											{#if group.isPinned}
												<svg class="pin-icon" viewBox="0 0 24 24" fill="currentColor">
													<path d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.314-2.686-6-6-6zm0 8c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2z"/>
												</svg>
											{/if}
											{group.name}
										</td>
										<td class="col-num">{group.total}</td>
										<td class="col-num col-present">{group.available}</td>
										{#each statusTypesStore.list as st}
											<td class="col-num">
												{#if (group.statusCounts.get(st.id) ?? 0) > 0}
													<span class="table-chip" style="background: {st.color}; color: {st.textColor}">
														{group.statusCounts.get(st.id)}
													</span>
												{:else}
													<span class="col-zero">—</span>
												{/if}
											</td>
										{/each}
										<td class="col-num">
											<span class="pct-badge" class:pct-high={group.pct >= 80} class:pct-mid={group.pct >= 60 && group.pct < 80} class:pct-low={group.pct < 60}>
												{group.pct}%
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
		margin-left: var(--sidebar-width);
	}

	/* Mobile header */
	.page-header.mobile-only {
		display: none;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-primary);
		color: white;
	}

	.page-header h1 {
		font-size: var(--font-size-lg);
		font-weight: 700;
	}

	.mobile-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.mobile-menu-btn svg {
		width: 24px;
		height: 24px;
	}

	.dashboard {
		flex: 1;
		padding: var(--spacing-lg);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	/* Dashboard Header */
	.dashboard-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
	}

	.dashboard-title h2 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
	}

	.greeting {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	.dashboard-date {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		white-space: nowrap;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-1);
	}

	.date-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	/* Quick Actions */
	.quick-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.quick-action {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
		text-decoration: none;
		transition: all var(--transition-fast);
		box-shadow: var(--shadow-1);
	}

	.quick-action:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: rgba(var(--color-primary-rgb), 0.04);
		box-shadow: var(--shadow-2);
	}

	.quick-action svg {
		width: 18px;
		height: 18px;
	}

	/* Card Row */
	.card-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-lg);
	}

	.card--full {
		width: 100%;
	}

	/* Card Header Override */
	.card-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text);
	}

	.card-header svg {
		width: 18px;
		height: 18px;
		color: var(--color-primary);
		flex-shrink: 0;
	}

	/* Strength Card */
	.strength-numbers {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.strength-main,
	.strength-total {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.strength-value {
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--color-text);
		line-height: 1;
	}

	.strength-value--muted {
		color: var(--color-text-muted);
		font-size: 2rem;
	}

	.strength-divider {
		font-size: 2rem;
		color: var(--color-text-muted);
		line-height: 1;
		padding-top: 2px;
	}

	.strength-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 2px;
	}

	.strength-bar-wrap {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.strength-bar {
		flex: 1;
		height: 8px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.strength-bar-fill {
		height: 100%;
		border-radius: var(--radius-full);
		transition: width var(--transition-normal);
	}

	.strength-pct {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.status-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.status-chip {
		padding: 3px 10px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: 600;
	}

	.empty-note {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Duty Card */
	.duty-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.duty-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.duty-badge {
		padding: 2px 10px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: 700;
		color: white;
		white-space: nowrap;
	}

	.duty-assignee {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md) 0;
		text-align: center;
	}

	.empty-state p {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	/* Training Card */
	.training-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.training-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-sm);
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
	}

	.training-stat-value {
		font-size: 1.75rem;
		font-weight: 700;
		line-height: 1;
	}

	.training-stat-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin-top: 2px;
		text-align: center;
	}

	.training-stat--expired .training-stat-value { color: var(--color-error); }
	.training-stat--orange .training-stat-value { color: var(--color-warning); }
	.training-stat--yellow .training-stat-value { color: #f59e0b; }
	.training-stat--current .training-stat-value { color: var(--color-success); }

	.training-issues {
		margin-bottom: var(--spacing-sm);
	}

	.issues-label {
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-xs);
	}

	.issue-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 3px 0;
		font-size: var(--font-size-sm);
	}

	.issue-name {
		font-weight: 500;
		color: var(--color-text);
		min-width: 80px;
	}

	.issue-type {
		flex: 1;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.issue-badge {
		font-size: var(--font-size-xs);
		font-weight: 600;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		white-space: nowrap;
	}

	.issue-badge.expired {
		background: rgba(244, 67, 54, 0.12);
		color: var(--color-error);
	}

	.issue-badge.warning {
		background: rgba(255, 152, 0, 0.12);
		color: var(--color-warning);
	}

	.card-link {
		margin-top: var(--spacing-sm);
	}

	/* Upcoming Card */
	.upcoming-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		max-height: 260px;
		overflow-y: auto;
	}

	.upcoming-group {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.upcoming-date {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-primary);
		padding: 2px 0;
		border-bottom: 1px solid var(--color-divider);
		margin-bottom: 2px;
	}

	.upcoming-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 2px 0;
		font-size: var(--font-size-sm);
	}

	.upcoming-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.upcoming-person {
		font-weight: 500;
		color: var(--color-text);
		min-width: 100px;
	}

	.upcoming-direction {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.upcoming-direction.departing {
		color: var(--color-warning);
	}

	.upcoming-direction.returning {
		color: var(--color-success);
	}

	/* Group Breakdown Table */
	.card-body--no-pad {
		padding: 0;
	}

	.group-table-wrap {
		overflow-x: auto;
	}

	.group-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.group-table thead tr {
		border-bottom: 2px solid var(--color-divider);
	}

	.group-table th {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		font-weight: 600;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	.group-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
	}

	.group-table tbody tr:last-child td {
		border-bottom: none;
	}

	.group-table tbody tr:hover {
		background: rgba(var(--color-primary-rgb), 0.04);
	}

	.group-table tbody tr.pinned {
		background: rgba(var(--color-primary-rgb), 0.06);
	}

	.col-group {
		min-width: 120px;
		font-weight: 500;
		color: var(--color-text);
	}

	.col-num {
		text-align: center;
		color: var(--color-text-secondary);
	}

	.col-present {
		font-weight: 600;
		color: var(--color-text);
	}

	.col-status {
		font-weight: 600;
	}

	.col-zero {
		color: var(--color-text-disabled);
	}

	.pin-icon {
		width: 10px;
		height: 10px;
		color: var(--color-primary);
		margin-right: 4px;
		vertical-align: middle;
	}

	.table-chip {
		display: inline-block;
		padding: 1px 8px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: 600;
	}

	.pct-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: 600;
	}

	.pct-badge.pct-high {
		background: rgba(76, 175, 80, 0.15);
		color: var(--color-success);
	}

	.pct-badge.pct-mid {
		background: rgba(255, 152, 0, 0.15);
		color: var(--color-warning);
	}

	.pct-badge.pct-low {
		background: rgba(244, 67, 54, 0.15);
		color: var(--color-error);
	}

	/* Mobile Responsive */
	@media (max-width: 640px) {
		.page {
			margin-left: 0;
		}

		.page-header.mobile-only {
			display: flex;
		}

		.dashboard {
			padding: var(--spacing-md);
			gap: var(--spacing-md);
		}

		.dashboard-title h2 {
			font-size: var(--font-size-xl);
		}

		.dashboard-date {
			display: none;
		}

		.card-row {
			grid-template-columns: 1fr;
		}

		.training-stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.page {
			margin-left: var(--sidebar-width);
		}
	}
</style>
