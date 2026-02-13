<script lang="ts">
	import type { Personnel, AvailabilityEntry } from '$lib/types';
	import { personnelStore } from '$lib/stores/personnel.svelte';
	import { statusTypesStore } from '$lib/stores/statusTypes.svelte';
	import { availabilityStore } from '$lib/stores/availability.svelte';
	import { specialDaysStore } from '$lib/stores/specialDays.svelte';
	import { calendarStore } from '$lib/stores/calendar.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { dailyAssignmentsStore } from '$lib/stores/dailyAssignments.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { calendarPrefsStore } from '$lib/stores/calendarPrefs.svelte';
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
	import PlatformInviteManager from '$lib/components/PlatformInviteManager.svelte';
	import LongRangeView from '$lib/components/LongRangeView.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { exportMonthToCSV, printMonthCalendar } from '$lib/utils/calendarExport';

	let { data } = $props();
	let showSidebar = $state(false);

	// Hydrate stores with server data
	$effect(() => {
		personnelStore.load(data.personnel, data.orgId);
		groupsStore.load(data.groups, data.orgId);
		statusTypesStore.load(data.statusTypes, data.orgId);
		availabilityStore.load(data.availabilityEntries, data.orgId);
		specialDaysStore.load(data.specialDays, data.orgId);
		dailyAssignmentsStore.load(data.assignmentTypes, data.dailyAssignments, data.orgId);
		pinnedGroupsStore.load(data.pinnedGroups, data.orgId);
	});

	let showStatusManager = $state(false);
	let showSpecialDayManager = $state(false);
	let showTodayBreakdown = $state(false);
	let showBulkStatusModal = $state(false);
	let showAssignmentPlanner = $state(false);
	let showLongRangeView = $state(false);
	let showAssignmentTypeManager = $state(false);
	let showDutyRosterGenerator = $state(false);
	let showPlatformInvite = $state(false);
	let selectedPerson = $state<Personnel | null>(null);
	let selectedDate = $state<Date | null>(null);
	let assignmentDate = $state<Date | null>(null);

	const RANK_ORDER = [
		'GEN', 'LTG', 'MG', 'BG', 'COL', 'LTC', 'MAJ', 'CPT', '1LT', '2LT',
		'CW5', 'CW4', 'CW3', 'CW2', 'WO1',
		'CSM', 'SGM', '1SG', 'MSG', 'SFC', 'SSG', 'SGT',
		'CPL', 'SPC', 'PFC', 'PV2', 'PV1',
		'CIV'
	];

	const personnelByGroup = $derived(() => {
		const personnel = personnelStore.list;
		const pinned = pinnedGroupsStore.list;
		const groupMap = new Map<string, Personnel[]>();

		// Group by group
		for (const person of personnel) {
			const group = person.groupName || '';
			if (!groupMap.has(group)) {
				groupMap.set(group, []);
			}
			groupMap.get(group)!.push(person);
		}

		// Sort each group's personnel by rank (highest first) then alphabetically
		for (const [, people] of groupMap) {
			people.sort((a, b) => {
				const rankDiff = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
				if (rankDiff !== 0) return rankDiff;
				const lastNameDiff = a.lastName.localeCompare(b.lastName);
				if (lastNameDiff !== 0) return lastNameDiff;
				return a.firstName.localeCompare(b.firstName);
			});
		}

		// Sort groups: pinned first (in pin order), then alphabetically, empty group last
		const sortedGroups = [...groupMap.keys()].sort((a, b) => {
			const aPinned = pinned.includes(a);
			const bPinned = pinned.includes(b);

			// Both pinned: sort by pin order
			if (aPinned && bPinned) {
				return pinned.indexOf(a) - pinned.indexOf(b);
			}
			// Only one pinned: pinned comes first
			if (aPinned && !bPinned) return -1;
			if (!aPinned && bPinned) return 1;

			// Neither pinned: empty group last, then alphabetically
			if (a === '' && b !== '') return 1;
			if (a !== '' && b === '') return -1;
			return a.localeCompare(b);
		});

		return sortedGroups.map((group) => ({
			group,
			personnel: groupMap.get(group)!
		}));
	});

	function handlePinToggle(group: string) {
		pinnedGroupsStore.toggle(group);
	}

	function handleCellClick(person: Personnel, date: Date) {
		selectedPerson = person;
		selectedDate = date;
	}

	function handlePersonClick(person: Personnel) {
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
			personnelByGroup: personnelByGroup(),
			availabilityEntries: availabilityStore.list,
			statusTypes: statusTypesStore.list,
			specialDays: specialDaysStore.list,
			assignmentTypes: dailyAssignmentsStore.types,
			assignments: dailyAssignmentsStore.assignments
		});
	}

	function handleExportPDF() {
		printMonthCalendar(calendarStore.year, calendarStore.month, {
			personnelByGroup: personnelByGroup(),
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
</script>

<svelte:head>
	<title>{data.orgName} - Troop to Task</title>
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
	onShowLongRangeView={() => (showLongRangeView = true)}
	onShowAssignmentPlanner={() => (showAssignmentPlanner = true)}
	onShowBulkStatus={() => (showBulkStatusModal = true)}
	onShowTodayBreakdown={() => (showTodayBreakdown = true)}
	onShowStatusManager={() => (showStatusManager = true)}
	onShowSpecialDayManager={() => (showSpecialDayManager = true)}
	onShowDutyRosterGenerator={() => (showDutyRosterGenerator = true)}
	onExportCalendarCSV={handleExportCSV}
	onExportCalendarPDF={handleExportPDF}
	showStatusText={calendarPrefsStore.showStatusText}
	onToggleStatusText={() => calendarPrefsStore.toggleShowStatusText()}
	onShowAssignmentTypeManager={() => (showAssignmentTypeManager = true)}
	onShowPlatformInvite={() => (showPlatformInvite = true)}
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

	<main class="page-content">
		<section class="calendar-section">
			<Calendar
				year={calendarStore.year}
				monthName={calendarStore.monthName}
				dates={calendarStore.dates}
				personnelByGroup={personnelByGroup()}
				availabilityEntries={availabilityStore.list}
				statusTypes={statusTypesStore.list}
				specialDays={specialDaysStore.list}
				pinnedGroups={pinnedGroupsStore.list}
				assignmentTypes={dailyAssignmentsStore.types}
				assignments={dailyAssignmentsStore.assignments}
				canEdit={data.permissions.canEditCalendar}
				showStatusText={calendarPrefsStore.showStatusText}
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
		personnelByGroup={personnelByGroup()}
		groups={groupsStore.names}
		onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
		onRemoveAssignment={(date, typeId) => dailyAssignmentsStore.removeAssignment(date, typeId)}
		onClose={closeAssignmentModal}
	/>
{/if}

{#if showTodayBreakdown}
	<TodayBreakdown
		personnelByGroup={personnelByGroup()}
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => (showTodayBreakdown = false)}
	/>
{/if}

{#if showBulkStatusModal}
	<BulkStatusModal
		personnelByGroup={personnelByGroup()}
		statusTypes={statusTypesStore.list}
		onApply={handleBulkStatusApply}
		onClose={() => (showBulkStatusModal = false)}
	/>
{/if}

{#if showDutyRosterGenerator}
	<DutyRosterGenerator
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={personnelByGroup()}
		groups={groupsStore.names}
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		onApplyRoster={handleApplyRoster}
		onClose={() => (showDutyRosterGenerator = false)}
	/>
{/if}

{#if showAssignmentPlanner}
	<MonthlyAssignmentPlanner
		currentDate={calendarStore.currentDate}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={personnelByGroup()}
		groups={groupsStore.names}
		onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
		onClose={() => (showAssignmentPlanner = false)}
	/>
{/if}

{#if showLongRangeView}
	<LongRangeView
		startDate={calendarStore.currentDate}
		personnelByGroup={personnelByGroup()}
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		specialDays={specialDaysStore.list}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => (showLongRangeView = false)}
		onCellClick={handleCellClick}
	/>
{/if}

{#if showPlatformInvite}
	<PlatformInviteManager onClose={() => (showPlatformInvite = false)} />
{/if}


<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
		margin-left: var(--sidebar-width);
	}

	/* Mobile header - only visible on mobile */
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

	.mobile-menu-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.mobile-menu-btn svg {
		width: 24px;
		height: 24px;
	}

	.page-content {
		flex: 1;
		padding: var(--spacing-lg);
		overflow: hidden;
	}

	.calendar-section {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		overflow: hidden;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.page {
			margin-left: 0;
		}

		.page-header.mobile-only {
			display: flex;
		}

		.page-content {
			padding: var(--spacing-sm);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.page {
			margin-left: var(--sidebar-width);
		}
	}
</style>
