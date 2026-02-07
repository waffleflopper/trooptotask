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
	import Calendar from '$lib/components/Calendar.svelte';
	import AvailabilityModal from '$lib/components/AvailabilityModal.svelte';
	import StatusTypeManager from '$lib/components/StatusTypeManager.svelte';
	import SpecialDayManager from '$lib/components/SpecialDayManager.svelte';
	import DailyAssignmentModal from '$lib/components/DailyAssignmentModal.svelte';
	import TodayBreakdown from '$lib/components/TodayBreakdown.svelte';
	import StatusLegend from '$lib/components/StatusLegend.svelte';
	import BulkStatusModal from '$lib/components/BulkStatusModal.svelte';
	import MonthlyAssignmentPlanner from '$lib/components/MonthlyAssignmentPlanner.svelte';
	import LongRangeView from '$lib/components/LongRangeView.svelte';

	let { data } = $props();

	// Hydrate stores with server data
	$effect(() => {
		personnelStore.load(data.personnel, data.clinicId);
		groupsStore.load(data.groups, data.clinicId);
		statusTypesStore.load(data.statusTypes, data.clinicId);
		availabilityStore.load(data.availabilityEntries, data.clinicId);
		specialDaysStore.load(data.specialDays, data.clinicId);
		dailyAssignmentsStore.load(data.assignmentTypes, data.dailyAssignments, data.clinicId);
		pinnedGroupsStore.load(data.pinnedGroups, data.clinicId);
	});

	let showStatusManager = $state(false);
	let showSpecialDayManager = $state(false);
	let showTodayBreakdown = $state(false);
	let showBulkStatusModal = $state(false);
	let showAssignmentPlanner = $state(false);
	let showLongRangeView = $state(false);
	let showSettingsMenu = $state(false);
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
		// Could open person edit modal here
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
</script>

<svelte:head>
	<title>{data.clinicName} - Troop to Task</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<div class="header-left">
			<h1>Troop to Task</h1>
			<span class="header-divider"></span>
			<p class="subtitle">{data.clinicName}</p>
		</div>
		<nav class="header-nav">
			<a href="/clinic/{data.clinicId}/personnel" class="nav-link">Personnel</a>
			<a href="/clinic/{data.clinicId}/training" class="nav-link">Training</a>
			<span class="nav-divider"></span>
			<button class="nav-link" onclick={() => (showLongRangeView = true)}>3-Month View</button>
			<button class="nav-link" onclick={() => (showAssignmentPlanner = true)}>Assignments</button>
			<button class="nav-link" onclick={() => (showBulkStatusModal = true)}>Bulk Status</button>
		</nav>
		<div class="header-actions">
			<button class="btn btn-primary btn-sm today-btn" onclick={() => (showTodayBreakdown = true)}>
				Today's Breakdown
			</button>
			<button class="theme-toggle-btn" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
				{#if themeStore.isDark}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="5"/>
						<line x1="12" y1="1" x2="12" y2="3"/>
						<line x1="12" y1="21" x2="12" y2="23"/>
						<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
						<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
						<line x1="1" y1="12" x2="3" y2="12"/>
						<line x1="21" y1="12" x2="23" y2="12"/>
						<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
						<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
					</svg>
				{/if}
			</button>
			<div class="dropdown">
				<button class="btn btn-secondary btn-sm dropdown-toggle" onclick={() => (showSettingsMenu = !showSettingsMenu)}>
					<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
						<path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
					</svg>
				</button>
				{#if showSettingsMenu}
					<button class="dropdown-backdrop" onclick={() => (showSettingsMenu = false)} aria-label="Close menu"></button>
					<div class="dropdown-menu">
						<button class="dropdown-item" onclick={() => { showSettingsMenu = false; showStatusManager = true; }}>Status Types</button>
						<button class="dropdown-item" onclick={() => { showSettingsMenu = false; showSpecialDayManager = true; }}>Holidays</button>
						<a href="/clinic/{data.clinicId}/settings" class="dropdown-item">Settings</a>
						<div class="dropdown-divider"></div>
						<a href="/auth/logout" class="dropdown-item">Sign Out</a>
					</div>
				{/if}
			</div>
		</div>
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

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.page-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-primary);
		color: white;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.page-header h1 {
		font-size: var(--font-size-lg);
		font-weight: 700;
	}

	.header-divider {
		width: 1px;
		height: 20px;
		background: rgba(255, 255, 255, 0.3);
	}

	.subtitle {
		font-size: var(--font-size-sm);
		opacity: 0.8;
	}

	.header-nav {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		margin-left: var(--spacing-lg);
	}

	.nav-link {
		padding: var(--spacing-xs) var(--spacing-sm);
		color: rgba(255, 255, 255, 0.8);
		font-size: var(--font-size-sm);
		text-decoration: none;
		border-radius: var(--radius-sm);
		transition: all 0.15s ease;
		background: none;
		border: none;
		cursor: pointer;
	}

	.nav-link:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.nav-divider {
		width: 1px;
		height: 16px;
		background: rgba(255, 255, 255, 0.2);
		margin: 0 var(--spacing-xs);
	}

	.header-actions {
		margin-left: auto;
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
	}

	.header-actions .btn-secondary {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.header-actions .btn-secondary:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.today-btn {
		background: var(--color-secondary);
		border-color: var(--color-secondary);
	}

	.today-btn:hover {
		background: #b8922f;
		border-color: #b8922f;
	}

	/* Dropdown */
	.dropdown {
		position: relative;
	}

	.dropdown-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.dropdown-backdrop {
		position: fixed;
		inset: 0;
		background: transparent;
		z-index: 99;
	}

	.dropdown-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--spacing-xs);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		min-width: 160px;
		z-index: 100;
		overflow: hidden;
	}

	.dropdown-item {
		display: block;
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		color: var(--color-text);
		font-size: var(--font-size-sm);
		text-decoration: none;
		background: none;
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.dropdown-item:hover {
		background: var(--color-bg);
	}

	.dropdown-divider {
		height: 1px;
		background: var(--color-border);
		margin: var(--spacing-xs) 0;
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

	.theme-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.theme-toggle-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.theme-toggle-btn svg {
		width: 18px;
		height: 18px;
	}
</style>
