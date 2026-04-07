<script lang="ts">
	import type { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import TodayBreakdownPanel from '$features/calendar/components/TodayBreakdownPanel.svelte';
	import Calendar from '$features/calendar/components/Calendar.svelte';
	import LongRangeView from '$features/calendar/components/LongRangeView.svelte';
	import StatusLegend from '$features/calendar/components/StatusLegend.svelte';
	import AvailabilityModal from '$features/calendar/components/AvailabilityModal.svelte';
	import DailyAssignmentModal from '$features/calendar/components/DailyAssignmentModal.svelte';
	import SmartToolbar from '$lib/components/ui/SmartToolbar.svelte';
	import { buildCalendarToolbarItems } from '$features/calendar/utils/calendarToolbarItems';
	import { exportMonthToCSV, printMonthCalendar } from '$features/calendar/utils/calendarExport';
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
			personnelByGroup: ctx.scopedPBG,
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
			breakdownExpanded: ctx.breakdownExpanded,
			showStatusText: ctx.showStatusText,
			onToggleBreakdown: () => ctx.toggleBreakdown(),
			onToggleStatusText: () => ctx.toggleShowStatusText(),
			onExportCSV: () => exportMonthToCSV(calendarStore.year, calendarStore.month, getExportData()),
			onExportPDF: async () => {
				try {
					await printMonthCalendar(calendarStore.year, calendarStore.month, getExportData());
				} catch (err) {
					alert(err instanceof Error ? err.message : 'PDF export failed');
				}
			}
		})
	);
</script>

<svelte:head>
	<title>{data.orgName} - Troop to Task</title>
</svelte:head>

<div class="page">
	<SmartToolbar title="Calendar" helpTopic="calendar" items={toolbarItems}>
		<button
			class="toolbar-toggle"
			class:active={ctx.highlightOnboarding}
			onclick={() => ctx.toggleHighlightOnboarding()}
			title={ctx.highlightOnboarding ? 'Hide onboarding highlighting' : 'Show onboarding highlighting'}
		>
			<span class="toggle-dot"></span>
			Onboarding
		</button>
		{#if ctx.readOnly}
			<span class="text-muted" style="font-size: var(--text-xs);">Upgrade to edit</span>
		{/if}
	</SmartToolbar>

	<TodayBreakdownPanel
		expanded={ctx.breakdownExpanded}
		onToggle={() => ctx.toggleBreakdown()}
		personnelByGroup={ctx.personnelByGroup}
		availabilityEntries={availabilityStore.items}
		statusTypes={statusTypesStore.items}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		dutyEvents={ctx.advancedDutyEvents}
	/>

	{#if !data.permissions?.canViewCalendar}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content">
			<section class="calendar-section">
				{#if ctx.viewMode === '3-month'}
					<LongRangeView
						startDate={calendarStore.currentDate}
						personnelByGroup={ctx.scopedPBG}
						availabilityEntries={availabilityStore.items}
						statusTypes={statusTypesStore.items}
						specialDays={specialDaysStore.items}
						assignmentTypes={dailyAssignmentsStore.types}
						assignments={dailyAssignmentsStore.assignments}
						dutyEvents={ctx.advancedDutyEvents}
						onDateColumnClick={(date) => ctx.navigateToMonth(date)}
						onToggleViewMode={() => ctx.toggleViewMode()}
					/>
				{:else}
					<Calendar
						year={calendarStore.year}
						month={calendarStore.month}
						monthName={calendarStore.monthName}
						dates={calendarStore.dates}
						personnelByGroup={ctx.personnelByGroup}
						availabilityEntries={availabilityStore.items}
						statusTypes={statusTypesStore.items}
						specialDays={specialDaysStore.items}
						pinnedGroups={pinnedGroupsStore.list}
						assignmentTypes={dailyAssignmentsStore.types}
						assignments={dailyAssignmentsStore.assignments}
						dutyEvents={ctx.advancedDutyEvents}
						activeOnboardingPersonnelIds={ctx.activeOnboardingPersonnelIds}
						highlightOnboarding={ctx.highlightOnboarding}
						canEdit={data.permissions?.canEditCalendar ?? false}
						showStatusText={ctx.showStatusText}
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
		background: var(--surface-page);
	}

	.page-content {
		flex: 1;
		display: flex;
		overflow: hidden;
		padding: var(--sp-5) var(--sp-6) var(--sp-6);
	}

	.calendar-section {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		width: 100%;
		overflow: hidden;
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

	.toolbar-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 34px;
		padding: 7px 12px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.toolbar-toggle:hover {
		border-color: var(--ink-35);
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.toolbar-toggle.active {
		border-color: var(--amber);
		color: var(--amber-dark);
		background: var(--amber-light);
	}

	.toggle-dot {
		width: 8px;
		height: 8px;
		border-radius: 1px;
		background: var(--border-default);
		transition: background-color var(--transition-fast);
	}

	.toolbar-toggle.active .toggle-dot {
		background: var(--amber);
	}

	@media (max-width: 640px) {
		.page-content {
			padding: var(--sp-4);
		}

		.no-permission {
			margin: var(--sp-4);
			padding: var(--sp-6) var(--sp-4);
		}
	}
</style>
