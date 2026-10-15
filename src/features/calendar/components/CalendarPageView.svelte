<script lang="ts">
	import type { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import Calendar from '$features/calendar/components/Calendar.svelte';
	import LongRangeView from '$features/calendar/components/LongRangeView.svelte';
	import StatusLegend from '$features/calendar/components/StatusLegend.svelte';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { buildCalendarToolbar } from '$features/calendar/utils/calendarToolbarItems';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { stillInOrganizationLifetime } from '$lib/stores/core';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { pinnedGroupsStore } from '$features/personnel';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { groupsStore } from '$features/personnel';

	interface Props {
		ctx: CalendarPageContext;
		data: {
			orgId: string;
			orgUrlSegment?: string;
			orgName: string;
		};
		rangeStatus?: 'ready' | 'loading' | 'error';
		onRetryRange?: () => void;
	}

	let { ctx, data, rangeStatus = 'ready', onRetryRange }: Props = $props();

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

	function quarterStart(): Date {
		return new Date(calendarStore.year, calendarStore.month, 1);
	}

	async function exportExcel(): Promise<void> {
		const current = stillInOrganizationLifetime();
		try {
			const { exportMonthToExcel, exportQuarterToExcel } = await import('$features/calendar/utils/calendarExport');
			if (ctx.viewMode === '3-month') await exportQuarterToExcel(quarterStart(), getExportData());
			else await exportMonthToExcel(calendarStore.year, calendarStore.month, getExportData());
		} catch (err) {
			if (current()) toastStore.error(err instanceof Error ? err.message : 'Excel export failed');
		}
	}

	async function exportPDF(): Promise<void> {
		const current = stillInOrganizationLifetime();
		try {
			const { printMonthCalendar, printQuarterCalendar } = await import('$features/calendar/utils/calendarExport');
			if (ctx.viewMode === '3-month') await printQuarterCalendar(quarterStart(), getExportData());
			else await printMonthCalendar(calendarStore.year, calendarStore.month, getExportData());
		} catch (err) {
			if (current()) toastStore.error(err instanceof Error ? err.message : 'PDF export failed');
		}
	}

	const toolbar = $derived(
		buildCalendarToolbar({
			orgUrlSegment: data.orgUrlSegment ?? data.orgId,
			canManageAvailability: ctx.canManageAvailability,
			canManageAssignments: ctx.canManageAssignments,
			canManageConfig: ctx.canManageConfig,
			viewMode: ctx.viewMode,
			groupOptions: ctx.groupFilterOptions.map((option) => ({
				value: option.value,
				label: option.value === '' ? 'Group: All' : `${option.label} (${option.count ?? 0})`
			})),
			groupFilter: ctx.calendarGroupFilter,
			showStatusText: ctx.showStatusText,
			showPersonnelRoles: ctx.showPersonnelRoles,
			showOnboardingToggle: ctx.activeOnboardingPersonnelIds.length > 0,
			highlightOnboarding: ctx.highlightOnboarding,
			onViewModeChange: (mode) => {
				if (mode !== ctx.viewMode) ctx.toggleViewMode();
			},
			onGroupFilterChange: (value) => ctx.setCalendarGroupFilter(value),
			onToggleStatusText: () => ctx.toggleShowStatusText(),
			onTogglePersonnelRoles: () => ctx.toggleShowPersonnelRoles(),
			onToggleHighlightOnboarding: () => ctx.toggleHighlightOnboarding(),
			onExportExcel: exportExcel,
			onExportPDF: exportPDF
		})
	);

	async function loadAvailabilityModal() {
		const current = stillInOrganizationLifetime();
		try {
			return await import('$features/calendar/components/AvailabilityModal.svelte');
		} catch (error) {
			if (current()) toastStore.error(error instanceof Error ? error.message : 'Availability editor failed to load');
			ctx.closeAvailabilityModal();
			throw error;
		}
	}

	async function loadDailyAssignmentModal() {
		const current = stillInOrganizationLifetime();
		try {
			return await import('$features/calendar/components/DailyAssignmentModal.svelte');
		} catch (error) {
			if (current())
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
		<Empty.Root class="m-4 w-auto min-h-80 border bg-card p-6 text-card-foreground sm:m-6 sm:p-8">
			<Empty.Header>
				<Empty.Title>Access Restricted</Empty.Title>
				<Empty.Description>
					You don't have permission to view this area. Contact your organization admin for access.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else if ctx.isHydrating}
		<div class="flex flex-1 overflow-hidden p-3 sm:px-6 sm:pt-4 sm:pb-5">
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
		</div>
	{:else}
		<div class="flex flex-1 overflow-hidden p-3 sm:px-6 sm:pt-4 sm:pb-5">
			<section class="flex h-full w-full flex-col gap-3 overflow-hidden sm:gap-4">
				<WorkspaceToolbar
					ariaLabel="Calendar controls"
					items={toolbar.items}
					primary={toolbar.primary}
					search={{
						label: 'Search by name, rank, MOS, role, or group',
						placeholder: 'Search name, rank, MOS, role, or group...',
						value: ctx.calendarPersonnelSearch,
						onValueChange: (value) => ctx.setCalendarPersonnelSearch(value)
					}}
				/>

				{#if rangeStatus === 'loading'}
					<Alert.Root role="status" aria-live="polite">
						<Alert.Description>Loading additional calendar dates...</Alert.Description>
					</Alert.Root>
				{:else if rangeStatus === 'error'}
					<Alert.Root variant="destructive" role="status" aria-live="polite">
						<Alert.Description>Additional calendar data is temporarily unavailable.</Alert.Description>
						<Alert.Action>
							<Button type="button" variant="destructive" size="xs" onclick={onRetryRange}>Retry calendar load</Button>
						</Alert.Action>
					</Alert.Root>
				{/if}

				{#if ctx.lossWarningsUnavailable}
					<Alert.Root role="status">
						<Alert.Description>Loss warnings could not be loaded, so ETS and PCS flags are not shown.</Alert.Description
						>
						<Alert.Action>
							<Button type="button" variant="outline" size="xs" onclick={() => window.location.reload()}
								>Reload page</Button
							>
						</Alert.Action>
					</Alert.Root>
				{/if}

				{#if ctx.viewMode === '3-month'}
					<LongRangeView
						startDate={calendarStore.currentDate}
						onStartDateChange={(date) => calendarStore.goToMonth(date.getFullYear(), date.getMonth())}
						personnelByGroup={ctx.filteredPBG}
						availabilityEntries={availabilityStore.items}
						statusTypes={statusTypesStore.items}
						specialDays={specialDaysStore.items}
						assignmentTypes={dailyAssignmentsStore.types}
						assignments={dailyAssignmentsStore.assignments}
						groups={groupsStore.items}
						onDateColumnClick={(date) => ctx.navigateToMonth(date)}
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
					/>
					<StatusLegend statusTypes={statusTypesStore.items} />
				{/if}
			</section>
		</div>
	{/if}
</div>

{#if ctx.selectedPerson && ctx.selectedDate}
	{#await loadAvailabilityModal() then { default: AvailabilityModal }}
		<AvailabilityModal
			orgId={data.orgId}
			person={ctx.selectedPerson}
			date={ctx.selectedDate}
			statusTypes={statusTypesStore.items}
			existingEntries={availabilityStore.items}
			onAdd={(entry) => ctx.handleAddAvailability(entry)}
			onUpdate={(id, changes) => ctx.handleUpdateAvailability(id, changes)}
			onRemove={(id) => ctx.handleRemoveAvailability(id)}
			onReconcile={(dates, expectedOrgId) => ctx.reconcileAvailability(dates, expectedOrgId)}
			onClose={() => ctx.closeAvailabilityModal()}
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
		/>
	{:catch}
		<span class="sr-only">Daily assignment editor failed to load.</span>
	{/await}
{/if}
