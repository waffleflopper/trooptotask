<script lang="ts">
	import type { Personnel, AvailabilityEntry } from '$lib/types';
	import { personnelStore } from '$lib/stores/personnel.svelte';
	import { statusTypesStore } from '$lib/stores/statusTypes.svelte';
	import { availabilityStore } from '$lib/stores/availability.svelte';
	import { specialDaysStore } from '$lib/stores/specialDays.svelte';
	import { calendarStore } from '$lib/stores/calendar.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { dailyAssignmentsStore } from '$lib/stores/dailyAssignments.svelte';
	import { dutyRosterHistoryStore } from '$lib/stores/dutyRosterHistory.svelte';
	import type { RosterHistoryItem } from '$lib/stores/dutyRosterHistory.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { calendarPrefsStore } from '$lib/stores/calendarPrefs.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import Calendar from '$lib/components/Calendar.svelte';
	import AvailabilityModal from '$lib/components/AvailabilityModal.svelte';
	import StatusTypeManager from '$lib/components/StatusTypeManager.svelte';
	import SpecialDayManager from '$lib/components/SpecialDayManager.svelte';
	import DailyAssignmentModal from '$lib/components/DailyAssignmentModal.svelte';
	import TodayBreakdown from '$lib/components/TodayBreakdown.svelte';
	import StatusLegend from '$lib/components/StatusLegend.svelte';
	import BulkStatusModal from '$lib/components/BulkStatusModal.svelte';
	import MonthlyAssignmentPlanner from '$lib/components/MonthlyAssignmentPlanner.svelte';
	import AssignmentTypeManager from '$lib/components/AssignmentTypeManager.svelte';
	import DutyRosterGenerator from '$lib/components/DutyRosterGenerator.svelte';
	import LongRangeView from '$lib/components/LongRangeView.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';
	import { exportMonthToCSV, printMonthCalendar } from '$lib/utils/calendarExport';
	import { groupAndSortPersonnel } from '$lib/utils/personnelGrouping';

	let { data } = $props();

	// Use allPersonnel for calendar display (shows all org members regardless of group scope)
	// but scoped personnel for editing checks
	const calendarPersonnel = $derived(data.allPersonnel ?? data.personnel);
	const scopedPersonnelIds = $derived(new Set(data.personnel.map((p: Personnel) => p.id)));

	// Hydrate stores with server data
	$effect(() => {
		personnelStore.load(data.personnel, data.orgId);
		groupsStore.load(data.groups, data.orgId);
		statusTypesStore.load(data.statusTypes, data.orgId);
		availabilityStore.load(data.availabilityEntries, data.orgId);
		specialDaysStore.load(data.specialDays, data.orgId);
		dailyAssignmentsStore.load(data.assignmentTypes, data.dailyAssignments, data.orgId);
		pinnedGroupsStore.load(data.pinnedGroups, data.orgId);
		dutyRosterHistoryStore.load(data.rosterHistory);
	});

	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canManageConfig = $derived(data.isOwner || data.isAdmin || data.isFullEditor);

	let showStatusManager = $state(false);
	let showSpecialDayManager = $state(false);
	let showTodayBreakdown = $state(false);
	let showBulkStatusModal = $state(false);
	let showAssignmentPlanner = $state(false);
	let showLongRangeView = $state(false);
	let showAssignmentTypeManager = $state(false);
	let showDutyRosterGenerator = $state(false);
	let selectedPerson = $state<Personnel | null>(null);
	let selectedDate = $state<Date | null>(null);
	let assignmentDate = $state<Date | null>(null);

	// Use shared utility for personnel grouping — use ALL personnel for calendar display
	const personnelByGroup = $derived(
		groupAndSortPersonnel(calendarPersonnel, { pinnedGroups: pinnedGroupsStore.list, fallbackGroupName: data.orgName })
	);

	function handlePinToggle(group: string) {
		pinnedGroupsStore.toggle(group);
	}

	function handleCellClick(person: Personnel, date: Date) {
		if (!data.permissions.canEditCalendar) return;
		if (data.scopedGroupId && !scopedPersonnelIds.has(person.id)) return;
		selectedPerson = person;
		selectedDate = date;
	}

	function handlePersonClick(person: Personnel) {
		if (!data.permissions.canEditCalendar) return;
		if (data.scopedGroupId && !scopedPersonnelIds.has(person.id)) return;
		selectedPerson = person;
		selectedDate = new Date();
	}

	async function handleAddAvailability(data: Omit<AvailabilityEntry, 'id'>) {
		await availabilityStore.add(data);
	}

	async function handleRemoveAvailability(id: string) {
		await availabilityStore.remove(id);
	}

	function closeAvailabilityModal() {
		selectedPerson = null;
		selectedDate = null;
	}

	function handleDateClick(date: Date) {
		assignmentDate = date;
	}

	function closeAssignmentModal() {
		assignmentDate = null;
	}

	async function handleBulkStatusApply(personnelIds: string[], statusTypeId: string, startDate: string, endDate: string) {
		// Create an availability entry for each person with the date range
		for (const personnelId of personnelIds) {
			await availabilityStore.add({
				personnelId,
				statusTypeId,
				startDate,
				endDate
			});
		}
	}

	function handleExportCSV() {
		exportMonthToCSV(calendarStore.year, calendarStore.month, {
			personnelByGroup: personnelByGroup,
			availabilityEntries: availabilityStore.list,
			statusTypes: statusTypesStore.list,
			specialDays: specialDaysStore.list,
			assignmentTypes: dailyAssignmentsStore.types,
			assignments: dailyAssignmentsStore.assignments
		});
	}

	function handleExportPDF() {
		printMonthCalendar(calendarStore.year, calendarStore.month, {
			personnelByGroup: personnelByGroup,
			availabilityEntries: availabilityStore.list,
			statusTypes: statusTypesStore.list,
			specialDays: specialDaysStore.list,
			assignmentTypes: dailyAssignmentsStore.types,
			assignments: dailyAssignmentsStore.assignments
		});
	}

	async function handleApplyRoster(assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]) {
		for (const assignment of assignments) {
			await dailyAssignmentsStore.setAssignment(assignment.date, assignment.assignmentTypeId, assignment.assigneeId);
		}
	}

	async function handleSaveRoster(payload: Omit<RosterHistoryItem, 'id' | 'createdAt'>): Promise<RosterHistoryItem | null> {
		try {
			const res = await fetch(`/org/${data.orgId}/api/duty-roster-history`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) return null;
			const item: RosterHistoryItem = await res.json();
			dutyRosterHistoryStore.add(item);
			return item;
		} catch {
			return null;
		}
	}

	async function handleDeleteRoster(id: string): Promise<void> {
		dutyRosterHistoryStore.remove(id); // optimistic
		try {
			await fetch(`/org/${data.orgId}/api/duty-roster-history/${id}`, { method: 'DELETE' });
		} catch {
			// Silently fail — history will re-sync on next page load
		}
	}

	async function handleUpdateExemptions(assignmentTypeId: string, personnelIds: string[]): Promise<void> {
		// updateType handles both optimistic UI update and persistence
		await dailyAssignmentsStore.updateType(assignmentTypeId, { exemptPersonnelIds: personnelIds });
	}

	const calendarOverflowItems = $derived.by<OverflowItem[]>(() => {
		const items: OverflowItem[] = [];

		// Visible actions duplicated for mobile access
		items.push({ label: "Today's Breakdown", onclick: () => (showTodayBreakdown = true) });
		if (data.permissions.canEditCalendar) {
			if (canManageConfig) {
				items.push({ label: 'Assignments', onclick: () => (showAssignmentPlanner = true), disabled: readOnly });
			}
		}
		items.push({ label: '3-Month View', onclick: () => (showLongRangeView = true) });

		// Additional tools
		if (data.permissions.canEditCalendar) {
			if (canManageConfig) {
				items.push({ label: 'Bulk Status', onclick: () => (showBulkStatusModal = true), divider: true, disabled: readOnly });
				items.push({ label: 'Duty Roster', onclick: () => (showDutyRosterGenerator = true), disabled: readOnly });
			}
		}

		// Export
		items.push({ label: 'Export to Excel', onclick: handleExportCSV, divider: true });
		items.push({ label: 'Print / PDF', onclick: handleExportPDF });

		// Display toggle
		items.push({ label: 'Show Status Text', toggle: true, active: calendarPrefsStore.showStatusText, onclick: () => calendarPrefsStore.toggleShowStatusText(), divider: true });

		// Configure group
		if (canManageConfig) {
			items.push({ label: 'Status Types', onclick: () => (showStatusManager = true), divider: true, group: 'Configure', disabled: readOnly });
			items.push({ label: 'Assignment Types', onclick: () => (showAssignmentTypeManager = true), disabled: readOnly });
			items.push({ label: 'Holidays', onclick: () => (showSpecialDayManager = true), disabled: readOnly });
		}

		return items;
	});
</script>

<svelte:head>
	<title>{data.orgName} - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Calendar" helpTopic="calendar" overflowItems={calendarOverflowItems}>
		<button class="btn btn-sm" onclick={() => (showTodayBreakdown = true)}>
			Today's Breakdown
		</button>
		{#if data.permissions.canEditCalendar && canManageConfig}
			<button class="btn btn-sm" onclick={() => (showAssignmentPlanner = true)} disabled={readOnly}>
				Assignments
			</button>
		{/if}
		<button class="btn btn-sm" onclick={() => (showLongRangeView = true)}>
			3-Month View
		</button>
		{#if readOnly}
			<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
		{/if}
	</PageToolbar>

	{#if !data.permissions.canViewCalendar}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
	<main class="page-content">
		<section class="calendar-section">
			<Calendar
				year={calendarStore.year}
				monthName={calendarStore.monthName}
				dates={calendarStore.dates}
				personnelByGroup={personnelByGroup}
				availabilityEntries={availabilityStore.list}
				statusTypes={statusTypesStore.list}
				specialDays={specialDaysStore.list}
				pinnedGroups={pinnedGroupsStore.list}
				assignmentTypes={dailyAssignmentsStore.types}
				assignments={dailyAssignmentsStore.assignments}
				activeOnboardingPersonnelIds={data.activeOnboardingPersonnelIds}
				canEdit={data.permissions.canEditCalendar}
				showStatusText={calendarPrefsStore.showStatusText}
				personnelHref={`/org/${data.orgId}/personnel`}
				onPrevMonth={() => calendarStore.prevMonth()}
				onNextMonth={() => calendarStore.nextMonth()}
				onGoToToday={() => calendarStore.goToToday()}
				onCellClick={handleCellClick}
				onPersonClick={handlePersonClick}
				onPinToggle={handlePinToggle}
				onDateClick={handleDateClick}
			/>
			<StatusLegend statusTypes={statusTypesStore.list} />
		</section>
	</main>
	{/if}
</div>

{#if selectedPerson && selectedDate}
	<AvailabilityModal
		person={selectedPerson}
		date={selectedDate}
		statusTypes={statusTypesStore.list}
		existingEntries={availabilityStore.list}
		onAdd={handleAddAvailability}
		onRemove={handleRemoveAvailability}
		onClose={closeAvailabilityModal}
	/>
{/if}

{#if showStatusManager}
	<StatusTypeManager
		statusTypes={statusTypesStore.list}
		onAdd={(data) => statusTypesStore.add(data)}
		onUpdate={(id, data) => statusTypesStore.update(id, data)}
		onRemove={async (id) => {
			await statusTypesStore.remove(id);
			availabilityStore.removeByStatusTypeLocal(id);
		}}
		onClose={() => (showStatusManager = false)}
	/>
{/if}

{#if showAssignmentTypeManager}
	<AssignmentTypeManager
		assignmentTypes={dailyAssignmentsStore.types}
		onAdd={(data) => dailyAssignmentsStore.addType(data)}
		onUpdate={(id, data) => dailyAssignmentsStore.updateType(id, data)}
		onRemove={(id) => dailyAssignmentsStore.removeType(id)}
		onClose={() => (showAssignmentTypeManager = false)}
	/>
{/if}

{#if showSpecialDayManager}
	<SpecialDayManager
		specialDays={specialDaysStore.list}
		onAdd={(data) => specialDaysStore.add(data)}
		onRemove={(id) => specialDaysStore.remove(id)}
		onResetHolidays={() => specialDaysStore.resetFederalHolidays()}
		onClose={() => (showSpecialDayManager = false)}
	/>
{/if}

{#if assignmentDate}
	<DailyAssignmentModal
		date={assignmentDate}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={personnelByGroup}
		groups={groupsStore.names}
		onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
		onRemoveAssignment={(date, typeId) => dailyAssignmentsStore.removeAssignment(date, typeId)}
		onClose={closeAssignmentModal}
	/>
{/if}

{#if showTodayBreakdown}
	<TodayBreakdown
		personnelByGroup={personnelByGroup}
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => (showTodayBreakdown = false)}
	/>
{/if}

{#if showBulkStatusModal}
	<BulkStatusModal
		personnelByGroup={personnelByGroup}
		statusTypes={statusTypesStore.list}
		onApply={handleBulkStatusApply}
		onClose={() => (showBulkStatusModal = false)}
	/>
{/if}

{#if showDutyRosterGenerator}
	<DutyRosterGenerator
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={personnelByGroup}
		groups={groupsStore.names}
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		rosterHistory={dutyRosterHistoryStore.items}
		onApplyRoster={handleApplyRoster}
		onSaveRoster={handleSaveRoster}
		onDeleteRoster={handleDeleteRoster}
		onUpdateExemptions={handleUpdateExemptions}
		onClose={() => (showDutyRosterGenerator = false)}
	/>
{/if}

{#if showAssignmentPlanner}
	<MonthlyAssignmentPlanner
		currentDate={calendarStore.currentDate}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={personnelByGroup}
		groups={groupsStore.names}
		onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
		onClose={() => (showAssignmentPlanner = false)}
	/>
{/if}

{#if showLongRangeView}
	<LongRangeView
		startDate={calendarStore.currentDate}
		personnelByGroup={personnelByGroup}
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		specialDays={specialDaysStore.list}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => (showLongRangeView = false)}
		onCellClick={handleCellClick}
	/>
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.page-content {
		overflow: hidden;
	}

	.calendar-section {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		overflow: hidden;
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		text-align: center;
		color: var(--color-text-muted);
	}
	.no-permission h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-sm);
		color: var(--color-text);
	}

	/* Mobile styles — .page-content mobile in app.css */
</style>
