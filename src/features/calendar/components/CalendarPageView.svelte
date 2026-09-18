<script lang="ts">
	import type { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import Calendar from '$features/calendar/components/Calendar.svelte';
	import LongRangeView from '$features/calendar/components/LongRangeView.svelte';
	import StatusLegend from '$features/calendar/components/StatusLegend.svelte';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { buildCalendarToolbarItems } from '$features/calendar/utils/calendarToolbarItems';
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
			orgUrlSegment?: string;
			orgName: string;
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
			orgUrlSegment: data.orgUrlSegment ?? data.orgId,
			canManageAvailability: ctx.canManageAvailability,
			canManageAssignments: ctx.canManageAssignments,
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
			onExportExcel: async () => {
				try {
					const { exportMonthToExcel } = await import('$features/calendar/utils/calendarExport');
					await exportMonthToExcel(calendarStore.year, calendarStore.month, getExportData());
				} catch (err) {
					toastStore.error(err instanceof Error ? err.message : 'Excel export failed');
				}
			},
			onExportPDF: async () => {
				try {
					const { printMonthCalendar } = await import('$features/calendar/utils/calendarExport');
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
	const activeCalendarFilterCount = $derived(
		(ctx.calendarGroupFilter ? 1 : 0) + (ctx.calendarPersonnelSearch.trim() ? 1 : 0)
	);

	async function loadAvailabilityModal() {
		try {
			return await import('$features/calendar/components/AvailabilityModal.svelte');
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Availability editor failed to load');
			ctx.closeAvailabilityModal();
			throw error;
		}
	}

	async function loadDailyAssignmentModal() {
		try {
			return await import('$features/calendar/components/DailyAssignmentModal.svelte');
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Daily assignment editor failed to load');
			ctx.closeAssignmentModal();
			throw error;
		}
	}
</script>

<svelte:head>
	<title>{data.orgName} - Troop to Task</title>
</svelte:head>

<div class="flex h-full flex-col bg-background">
	{#if !ctx.canViewCalendar}
		<Empty.Root class="m-4 min-h-80 border bg-card p-6 text-card-foreground sm:m-6 sm:p-8">
			<Empty.Header>
				<Empty.Title>Access Restricted</Empty.Title>
				<Empty.Description>
					You don't have permission to view this area. Contact your organization admin for access.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else if ctx.isHydrating}
		<main class="flex flex-1 overflow-hidden p-3 sm:px-6 sm:pt-4 sm:pb-5" aria-busy="true">
			<section class="flex w-full flex-col gap-3 overflow-visible sm:gap-4" aria-live="polite" role="status">
				<p class="font-mono text-xs font-semibold tracking-widest text-primary uppercase">Loading calendar data</p>

				{#if ctx.viewMode === '3-month'}
					<Skeleton class="h-[min(820px,calc(100dvh-10rem))] w-full rounded-lg" />
				{:else}
					<div class="grid grid-cols-7 gap-1">
						{#each { length: 49 }, index (index)}
							<Skeleton class="h-20 rounded-md" data-testid="skeleton-grid-cell" />
						{/each}
					</div>
				{/if}
			</section>
		</main>
	{:else}
		<main class="flex flex-1 overflow-hidden p-3 sm:px-6 sm:pt-4 sm:pb-5">
			<section class="flex h-full w-full flex-col gap-3 overflow-hidden sm:gap-4">
				<WorkspaceToolbar.Root ariaLabel="Calendar controls">
					<WorkspaceToolbar.Group
						label="Calendar filters"
						activeCount={activeCalendarFilterCount}
						data-testid="calendar-filters"
					>
						<WorkspaceToolbar.Select
							ariaLabel="Calendar group filter"
							options={groupFilterOptions}
							value={ctx.calendarGroupFilter}
							onValueChange={(value) => ctx.setCalendarGroupFilter(value)}
						/>
						<WorkspaceToolbar.Search
							ariaLabel="Search by name, rank, MOS, role, or group"
							placeholder="Search name, rank, MOS, role, or group..."
							value={ctx.calendarPersonnelSearch}
							onValueChange={(value) => ctx.setCalendarPersonnelSearch(value)}
						/>
					</WorkspaceToolbar.Group>

					<WorkspaceToolbar.Group label="Calendar actions" zone="actions">
						<WorkspaceToolbar.Actions
							actions={toolbarItems}
							ariaLabel="Calendar actions"
							overflowAriaLabel="More Calendar actions"
						/>
					</WorkspaceToolbar.Group>
				</WorkspaceToolbar.Root>

				{#if ctx.viewMode === '3-month'}
					<LongRangeView
						startDate={calendarStore.currentDate}
						personnelByGroup={ctx.filteredPBG}
						availabilityEntries={availabilityStore.items}
						statusTypes={statusTypesStore.items}
						specialDays={specialDaysStore.items}
						assignmentTypes={dailyAssignmentsStore.types}
						assignments={dailyAssignmentsStore.assignments}
						groups={groupsStore.items}
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
						groups={groupsStore.items}
						dutyEvents={ctx.advancedDutyEvents}
						dutyStartDayOnly={ctx.dutyStartDayOnly}
						activeOnboardingPersonnelIds={ctx.activeOnboardingPersonnelIds}
						highlightOnboarding={ctx.highlightOnboarding}
						canEdit={ctx.canManageAvailability}
						canEditAssignments={ctx.canManageAssignments}
						showStatusText={ctx.showStatusText}
						showPersonnelRoles={ctx.showPersonnelRoles}
						upcomingLossMap={ctx.upcomingLossMap}
						personnelHref={`/org/${data.orgUrlSegment ?? data.orgId}/personnel`}
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
	{#await loadAvailabilityModal() then { default: AvailabilityModal }}
		<AvailabilityModal
			person={ctx.selectedPerson}
			date={ctx.selectedDate}
			statusTypes={statusTypesStore.items}
			existingEntries={availabilityStore.items}
			onAdd={(entry) => ctx.handleAddAvailability(entry)}
			onRemove={(id) => ctx.handleRemoveAvailability(id)}
			onClose={() => ctx.closeAvailabilityModal()}
			dutyEvents={ctx.advancedDutyEvents}
			dutyRosterHref={`/org/${data.orgUrlSegment ?? data.orgId}/duty-rosters/`}
		/>
	{:catch}
		<span class="sr-only">Availability editor failed to load.</span>
	{/await}
{/if}

{#if ctx.assignmentDate}
	{#await loadDailyAssignmentModal() then { default: DailyAssignmentModal }}
		<DailyAssignmentModal
			date={ctx.assignmentDate}
			assignmentTypes={dailyAssignmentsStore.types}
			assignments={dailyAssignmentsStore.assignments}
			personnelByGroup={ctx.personnelByGroup}
			groups={groupsStore.items}
			onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
			onRemoveAssignment={(date, typeId) => dailyAssignmentsStore.removeAssignment(date, typeId)}
			onClose={() => ctx.closeAssignmentModal()}
			dutyEvents={ctx.advancedDutyEvents}
			dutyRosterHref={`/org/${data.orgUrlSegment ?? data.orgId}/duty-rosters/`}
		/>
	{:catch}
		<span class="sr-only">Daily assignment editor failed to load.</span>
	{/await}
{/if}
