<script lang="ts">
	import type { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import Calendar from '$features/calendar/components/Calendar.svelte';
	import LongRangeView from '$features/calendar/components/LongRangeView.svelte';
	import StatusLegend from '$features/calendar/components/StatusLegend.svelte';
	import AvailabilityModal from '$features/calendar/components/AvailabilityModal.svelte';
	import DailyAssignmentModal from '$features/calendar/components/DailyAssignmentModal.svelte';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { ToolbarActions, ToolbarFilterSelect, ToolbarSearchItem } from '$lib/components/ui/toolbar';
	import { buildCalendarToolbarItems } from '$features/calendar/utils/calendarToolbarItems';
	import { exportMonthToCSV, printMonthCalendar } from '$features/calendar/utils/calendarExport';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';

	interface Props {
		ctx: CalendarPageContext;
		data: {
			orgId: string;
			orgName: string;
			permissions?: { canViewCalendar?: boolean; canEditCalendar?: boolean } | null;
		};
	}

	let { ctx, data }: Props = $props();

	function getExportData() {
		return {
			personnelByGroup: ctx.filteredPBG,
			availabilityEntries: availabilityStore.items,
			statusTypes: statusTypesStore.items,
			specialDays: specialDaysStore.items,
			assignmentTypes: dailyAssignmentsStore.types,
			assignments: dailyAssignmentsStore.assignments
		};
	}

	const toolbarItems = $derived(
		buildCalendarToolbarItems({
			orgId: data.orgId,
			canEditCalendar: data.permissions?.canEditCalendar ?? false,
			canManageConfig: ctx.canManageConfig,
			readOnly: ctx.readOnly,
			showStatusText: ctx.showStatusText,
			showPersonnelRoles: ctx.showPersonnelRoles,
			showOnboardingToggle: ctx.activeOnboardingPersonnelIds.length > 0,
			highlightOnboarding: ctx.highlightOnboarding,
			dutyStartDayOnly: ctx.dutyStartDayOnly,
			viewMode: ctx.viewMode,
			onToggleStatusText: () => ctx.toggleShowStatusText(),
			onTogglePersonnelRoles: () => ctx.toggleShowPersonnelRoles(),
			onToggleHighlightOnboarding: () => ctx.toggleHighlightOnboarding(),
			onToggleDutyStartDayOnly: () => ctx.toggleDutyStartDayOnly(),
			onExportCSV: () => exportMonthToCSV(calendarStore.year, calendarStore.month, getExportData()),
			onExportPDF: async () => {
				try {
					await printMonthCalendar(calendarStore.year, calendarStore.month, getExportData());
				} catch (err) {
					toastStore.error(err instanceof Error ? err.message : 'PDF export failed');
				}
			}
		})
	);

	const groupFilterOptions = $derived(
		ctx.groupFilterOptions.map((option) => ({
			value: option.value,
			label: option.value === '' ? 'Group: All' : `${option.label} (${option.count ?? 0})`
		}))
	);
</script>

<svelte:head>
	<title>{data.orgName} - Troop to Task</title>
</svelte:head>

<div class="page">
	{#if !data.permissions?.canViewCalendar}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else if ctx.isHydrating}
		<main class="page-content" aria-busy="true">
			<section class="calendar-section calendar-section--loading" aria-live="polite" role="status">
				<p class="loading-kicker">Loading calendar data</p>

				{#if ctx.viewMode === '3-month'}
					<SkeletonBlock height="820px" />
				{:else}
					<SkeletonGrid rows={7} columns={7} cellWidth="minmax(0, 1fr)" cellHeight="82px" />
				{/if}
			</section>
		</main>
	{:else}
		<main class="page-content">
			<section class="calendar-section">
				<FloatingPageToolbar ariaLabel="Calendar controls" leadingMin="29rem" searchCompactAt={1180}>
					{#snippet leading()}
						<div class="filter-cluster" aria-label="Calendar filters">
							<ToolbarFilterSelect
								ariaLabel="Calendar group filter"
								options={groupFilterOptions}
								value={ctx.calendarGroupFilter}
								defaultValue=""
								mode="full"
								width="wide"
								onValueChange={(value) => ctx.setCalendarGroupFilter(value)}
							/>
							<ToolbarSearchItem
								ariaLabel="Search by name, rank, MOS, role, or group"
								placeholder="Search name, rank, MOS, role, or group..."
								value={ctx.calendarPersonnelSearch}
								width="wide"
								onValueChange={(value) => ctx.setCalendarPersonnelSearch(value)}
							/>
						</div>
					{/snippet}

					<ToolbarActions
						actions={toolbarItems}
						ariaLabel="Calendar actions"
						overflowAriaLabel="More Calendar actions"
					/>
				</FloatingPageToolbar>

				{#if ctx.viewMode === '3-month'}
					<LongRangeView
						startDate={calendarStore.currentDate}
						personnelByGroup={ctx.filteredPBG}
						availabilityEntries={availabilityStore.items}
						statusTypes={statusTypesStore.items}
						specialDays={specialDaysStore.items}
						assignmentTypes={dailyAssignmentsStore.types}
						assignments={dailyAssignmentsStore.assignments}
						dutyEvents={ctx.advancedDutyEvents}
						dutyStartDayOnly={ctx.dutyStartDayOnly}
						onDateColumnClick={(date) => ctx.navigateToMonth(date)}
						onToggleViewMode={() => ctx.toggleViewMode()}
					/>
				{:else}
					<Calendar
						year={calendarStore.year}
						month={calendarStore.month}
						monthName={calendarStore.monthName}
						dates={calendarStore.dates}
						personnelByGroup={ctx.filteredPBG}
						availabilityEntries={availabilityStore.items}
						statusTypes={statusTypesStore.items}
						specialDays={specialDaysStore.items}
						pinnedGroups={pinnedGroupsStore.list}
						assignmentTypes={dailyAssignmentsStore.types}
						assignments={dailyAssignmentsStore.assignments}
						dutyEvents={ctx.advancedDutyEvents}
						dutyStartDayOnly={ctx.dutyStartDayOnly}
						activeOnboardingPersonnelIds={ctx.activeOnboardingPersonnelIds}
						highlightOnboarding={ctx.highlightOnboarding}
						canEdit={data.permissions?.canEditCalendar ?? false}
						showStatusText={ctx.showStatusText}
						showPersonnelRoles={ctx.showPersonnelRoles}
						upcomingLossMap={ctx.upcomingLossMap}
						personnelHref={`/org/${data.orgId}/personnel`}
						onPrevMonth={() => calendarStore.prevMonth()}
						onNextMonth={() => calendarStore.nextMonth()}
						onGoToToday={() => calendarStore.goToToday()}
						onNavigateToMonth={(year, month) => calendarStore.goToMonth(year, month)}
						onCellClick={(person, date) => ctx.handleCellClick(person, date)}
						onPersonClick={(person) => ctx.handlePersonClick(person)}
						onPinToggle={(group) => ctx.handlePinToggle(group)}
						onDateClick={(date) => ctx.handleDateClick(date)}
						viewMode={ctx.viewMode}
						onToggleViewMode={() => ctx.toggleViewMode()}
					/>
					<StatusLegend statusTypes={statusTypesStore.items} />
				{/if}
			</section>
		</main>
	{/if}
</div>

{#if ctx.selectedPerson && ctx.selectedDate}
	<AvailabilityModal
		person={ctx.selectedPerson}
		date={ctx.selectedDate}
		statusTypes={statusTypesStore.items}
		existingEntries={availabilityStore.items}
		onAdd={(entry) => ctx.handleAddAvailability(entry)}
		onRemove={(id) => ctx.handleRemoveAvailability(id)}
		onClose={() => ctx.closeAvailabilityModal()}
		dutyEvents={ctx.advancedDutyEvents}
		dutyRosterHref={`/org/${data.orgId}/calendar/duty-roster/`}
	/>
{/if}

{#if ctx.assignmentDate}
	<DailyAssignmentModal
		date={ctx.assignmentDate}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={ctx.personnelByGroup}
		groups={groupsStore.names}
		onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
		onRemoveAssignment={(date, typeId) => dailyAssignmentsStore.removeAssignment(date, typeId)}
		onClose={() => ctx.closeAssignmentModal()}
		dutyEvents={ctx.advancedDutyEvents}
		dutyRosterHref={`/org/${data.orgId}/calendar/duty-roster/`}
	/>
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: color-mix(in srgb, var(--surface-page) 92%, var(--surface-panel) 8%);
		--personnel-column-width: 250px;
		--cell-height: 30px;
	}

	.page-content {
		flex: 1;
		display: flex;
		overflow: hidden;
		padding: var(--sp-4) var(--sp-6) var(--sp-5);
	}

	.calendar-section {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		width: 100%;
		overflow: hidden;
	}

	.calendar-section--loading {
		overflow: visible;
	}

	.filter-cluster {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
	}

	.filter-cluster {
		flex-wrap: nowrap;
	}

	.loading-kicker {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--amber);
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 320px;
		margin: var(--sp-6);
		padding: var(--sp-8);
		text-align: center;
		color: var(--text-secondary);
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
	}

	.no-permission h2 {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 1.2rem + 0.8vw, 2.1rem);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.no-permission p {
		margin: 0;
		max-width: 44ch;
		font-family: var(--font-body);
		line-height: var(--line-height-copy);
	}

	@media (max-width: 640px) {
		.page-content {
			padding: var(--sp-3);
		}

		.no-permission {
			margin: var(--sp-4);
			padding: var(--sp-6) var(--sp-4);
		}
	}
</style>
