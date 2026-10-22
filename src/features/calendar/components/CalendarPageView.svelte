<script lang="ts">
	import type { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import Calendar from '$features/calendar/components/Calendar.svelte';
	import LongRangeView from '$features/calendar/components/LongRangeView.svelte';
	import CalendarLegend from '$features/calendar/components/calendar-legend/CalendarLegend.svelte';
	import CalendarPopover from '$features/calendar/components/CalendarPopover.svelte';
	import CalendarTitleRow from '$features/calendar/components/CalendarTitleRow.svelte';
	import { untrack } from 'svelte';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { buildCalendarToolbar } from '$features/calendar/utils/calendarToolbarItems';
	import { buildCalendarLanes } from '$features/calendar/utils/calendarLanes';
	import { DRAG_TO_ADD_HINT, dutyMarkerLegend, statusLegend } from '$features/calendar/utils/calendarLegend';
	import { dutyPickerOptions } from '$features/calendar/utils/dutyPickerOptions';
	import { indexDutyAvailability } from '$features/calendar/utils/dutyReadModel';
	import { PlannerRosterRead } from '$features/calendar/contexts/PlannerRosterRead.svelte';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { stillInOrganizationLifetime } from '$lib/stores/core';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { pinnedGroupsStore } from '$features/personnel';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';

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
			const { printMonthCalendar, printQuarterCalendar } = await import('$features/calendar/utils/calendarPrint');
			const options = { ...getExportData(), organizationName: data.orgName };
			if (ctx.viewMode === '3-month') await printQuarterCalendar(quarterStart(), options);
			else await printMonthCalendar(calendarStore.year, calendarStore.month, options);
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
			groupOptions: ctx.groupFilterOptions.map((option) => ({
				value: option.value,
				label: option.value === '' ? 'Group: All' : `${option.label} (${option.count ?? 0})`
			})),
			groupFilter: ctx.calendarGroupFilter,
			showStatusText: ctx.showStatusText,
			showPersonnelRoles: ctx.showPersonnelRoles,
			showOnboardingToggle: ctx.activeOnboardingPersonnelIds.length > 0,
			highlightOnboarding: ctx.highlightOnboarding,
			onGroupFilterChange: (value) => ctx.setCalendarGroupFilter(value),
			onToggleStatusText: () => ctx.toggleShowStatusText(),
			onTogglePersonnelRoles: () => ctx.toggleShowPersonnelRoles(),
			onToggleHighlightOnboarding: () => ctx.toggleHighlightOnboarding(),
			onExportExcel: exportExcel,
			onExportPDF: exportPDF
		})
	);

	const legend = $derived(
		ctx.viewMode === 'month'
			? [
					statusLegend(statusTypesStore.items, ctx.canManageAvailability ? DRAG_TO_ADD_HINT : undefined),
					dutyMarkerLegend(dailyAssignmentsStore.types)
				]
			: [statusLegend(statusTypesStore.items)]
	);

	// Built apart from the roster rows so search and Group filter changes do not rebuild lanes.
	const lanes = $derived(
		buildCalendarLanes({
			dates: calendarStore.dates,
			assignmentTypes: dailyAssignmentsStore.types,
			assignments: dailyAssignmentsStore.assignments,
			specialDays: specialDaysStore.items,
			personnel: ctx.allPersonnelFlat,
			groups: ctx.scopedGroups,
			actions: ctx.canManageAssignments
				? {
						// An open day offers no picker until the shown range has loaded, so it knows the slot's assignee.
						openDay:
							rangeStatus === 'ready' ? (typeId, date, anchor) => ctx.openDutyPicker(typeId, date, anchor) : undefined,
						editDay: (date) => ctx.handleDateClick(date)
					}
				: undefined
		})
	);

	const barPopover = $derived(ctx.popover?.kind === 'duty' ? null : ctx.popover);
	const popoverEntry = $derived(
		ctx.popover?.kind === 'entry' ? { personId: ctx.popover.person.id, entryId: ctx.popover.entryId } : null
	);
	const quickAddSelection = $derived(
		ctx.popover?.kind === 'quick-add'
			? { personId: ctx.popover.person.id, startDate: ctx.popover.startDate, endDate: ctx.popover.endDate }
			: null
	);

	$effect(() => {
		void [calendarStore.year, calendarStore.month, ctx.viewMode];
		untrack(() => ctx.closePopover());
	});

	const availabilityByPerson = $derived(indexDutyAvailability(availabilityStore.items));

	// The picker reads its roster day when it opens. Writes anywhere on the page refetch it through the shared read.
	const rosterRead = new PlannerRosterRead();
	const dayRequest = (typeId: string, date: string) => ({
		orgId: data.orgId,
		typeId,
		date,
		today: formatDate(new Date())
	});

	const dutyPick = $derived.by(() => {
		const pick = ctx.popover?.kind === 'duty' ? ctx.popover : null;
		const type = pick && dailyAssignmentsStore.types.find((candidate) => candidate.id === pick.typeId);
		if (!pick || !type || type.archivedAt) return null;
		const dateKey = formatDate(pick.date);
		const current = dailyAssignmentsStore.assignments.find(
			(assignment) => assignment.date === dateKey && assignment.assignmentTypeId === type.id
		);
		const counted = type.assignTo === 'personnel' && ctx.seesRosterCounts;
		const read = counted ? rosterRead.day(dayRequest(type.id, dateKey)) : undefined;
		return {
			...pick,
			type,
			dateKey,
			counted,
			counts: counted
				? {
						status: read?.status ?? 'loading',
						stale: read?.status === 'ready' && read.stale === true,
						onRetry: () => rosterRead.retryDay(dayRequest(type.id, dateKey))
					}
				: undefined,
			options: dutyPickerOptions({
				type,
				dateKey,
				personnel: ctx.allPersonnelFlat,
				groups: ctx.scopedGroups,
				availabilityByPerson,
				statusTypes: statusTypesStore.items,
				roster: read?.status === 'ready' ? (read.day ?? undefined) : undefined,
				currentAssigneeId: current?.assigneeId
			})
		};
	});

	// Keyed by the slot alone, so a status change never starts the read again.
	const dutyPickDay = $derived(dutyPick?.counted ? `${dutyPick.type.id}|${dutyPick.dateKey}` : null);
	$effect(() => {
		if (!dutyPickDay) return;
		const [typeId, dateKey] = dutyPickDay.split('|');
		rosterRead.loadDay(dayRequest(typeId, dateKey));
	});

	async function loadDutyPicker() {
		const current = stillInOrganizationLifetime();
		try {
			return await import('$features/calendar/components/DutyPicker.svelte');
		} catch (error) {
			if (current()) toastStore.error(error instanceof Error ? error.message : 'Duty picker failed to load');
			ctx.closePopover();
			throw error;
		}
	}

	async function loadAvailabilityModal() {
		const current = stillInOrganizationLifetime();
		try {
			return await import('$features/calendar/components/AvailabilityModal.svelte');
		} catch (error) {
			if (current()) toastStore.error(error instanceof Error ? error.message : 'Availability editor failed to load');
			ctx.closeEditor();
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
				<CalendarTitleRow
					view={ctx.viewMode}
					anchor={calendarStore.currentDate}
					today={ctx.todayAvailability}
					orgName={data.orgName}
					personnelCount={ctx.allPersonnelFlat.length}
					onAnchorChange={(anchor) => calendarStore.goToMonth(anchor.getFullYear(), anchor.getMonth())}
					onViewChange={(view) => ctx.setViewMode(view)}
				/>

				<WorkspaceToolbar
					ariaLabel="Calendar controls"
					items={toolbar.items}
					primary={toolbar.primary}
					search={{
						label: 'Search by name, rank, MOS, role, or group',
						placeholder: 'Search name, rank, MOS, role, or group...',
						value: ctx.calendarPersonnelSearch,
						placement: 'after-filters',
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
						personnelByGroup={ctx.filteredPBG}
						tracks={ctx.availabilityTracks}
						specialDays={specialDaysStore.items}
						onDateColumnClick={(date) => ctx.navigateToMonth(date)}
						onOpenEntry={(person, entry, anchor) => ctx.openEntry(person, entry.id, anchor)}
						onOpenOverflow={(person, entryIds, anchor) => ctx.openOverflow(person, entryIds, anchor)}
					/>
				{:else}
					<Calendar
						dates={calendarStore.dates}
						personnelByGroup={ctx.filteredPBG}
						tracks={ctx.availabilityTracks}
						specialDays={specialDaysStore.items}
						pinnedGroups={pinnedGroupsStore.list}
						assignmentTypes={dailyAssignmentsStore.types}
						assignments={dailyAssignmentsStore.assignments}
						{lanes}
						activeOnboardingPersonnelIds={ctx.activeOnboardingPersonnelIds}
						highlightOnboarding={ctx.highlightOnboarding}
						canEdit={ctx.canManageAvailability}
						canEditAssignments={ctx.canManageAssignments}
						showStatusText={ctx.showStatusText}
						showPersonnelRoles={ctx.showPersonnelRoles}
						upcomingLossMap={ctx.upcomingLossMap}
						personnelHref={`/org/${data.orgUrlSegment ?? data.orgId}/personnel`}
						onCellClick={(person, date) => ctx.handleCellClick(person, date)}
						onPersonClick={(person) => ctx.handlePersonClick(person)}
						onPinToggle={(group) => ctx.handlePinToggle(group)}
						onDateClick={(date) => ctx.handleDateClick(date)}
						onMarkerClick={(date) => ctx.handleDateClick(date)}
						onOpenEntry={(person, entry, anchor) => ctx.openEntry(person, entry.id, anchor)}
						onOpenOverflow={(person, entryIds, anchor) => ctx.openOverflow(person, entryIds, anchor)}
						canEditAvailabilityFor={(person) => ctx.canManageAvailabilityFor(person)}
						{popoverEntry}
						{quickAddSelection}
						saving={ctx.savingAvailability}
						onQuickAdd={(person, startDate, endDate, anchor) => ctx.openQuickAdd(person, startDate, endDate, anchor)}
						onResize={(person, entry, startDate, endDate) =>
							ctx.saveAvailability({
								kind: 'update',
								entry,
								changes: { statusTypeId: entry.statusTypeId, startDate, endDate, note: entry.note ?? null }
							})}
					/>
				{/if}
				<CalendarLegend sources={legend} />
			</section>
		</div>
	{/if}
</div>

{#if ctx.editor}
	{@const request = ctx.editor}
	{#key request}
		{#await loadAvailabilityModal() then { default: AvailabilityModal }}
			<AvailabilityModal
				{request}
				statusTypes={statusTypesStore.items}
				existingEntries={availabilityStore.items}
				saving={ctx.savingAvailability}
				onSave={(change) => ctx.saveAvailability(change)}
				onClose={() => ctx.closeEditor()}
			/>
		{:catch}
			<span class="sr-only">Availability editor failed to load.</span>
		{/await}
	{/key}
{/if}

{#if barPopover}
	{@const popover = barPopover}
	{#key popover}
		<CalendarPopover
			{popover}
			statusTypes={statusTypesStore.items}
			spans={ctx.availabilityTracks.spans(popover.person.id)}
			canEdit={ctx.canManageAvailabilityFor(popover.person)}
			anchorHasResizeGrips={ctx.viewMode !== '3-month' &&
				!ctx.savingAvailability &&
				popover.kind === 'entry' &&
				popover.anchor.dataset.entryId === popover.entryId}
			saving={ctx.savingAvailability}
			onSave={(change) => ctx.saveAvailability(change)}
			onEdit={(request) => ctx.openEditor(request)}
			onOpenEntry={(entryId) => ctx.openEntry(popover.person, entryId, popover.anchor)}
			onClose={() => ctx.closePopover()}
		/>
	{/key}
{/if}

{#if dutyPick}
	{#key dutyPick.anchor}
		{#await loadDutyPicker() then { default: DutyPicker }}
			<DutyPicker
				typeName={dutyPick.type.name}
				assignTo={dutyPick.type.assignTo}
				date={dutyPick.date}
				anchor={dutyPick.anchor}
				options={dutyPick.options}
				counts={dutyPick.counts}
				onAssign={(assigneeId) => dailyAssignmentsStore.setAssignment(dutyPick.dateKey, dutyPick.type.id, assigneeId)}
				onClose={() => ctx.closePopover()}
			/>
		{:catch}
			<span class="sr-only">Duty picker failed to load.</span>
		{/await}
	{/key}
{/if}

{#if ctx.assignmentDate}
	{#await loadDailyAssignmentModal() then { default: DailyAssignmentModal }}
		<DailyAssignmentModal
			date={ctx.assignmentDate}
			assignmentTypes={dailyAssignmentsStore.types}
			assignments={dailyAssignmentsStore.assignments}
			personnelByGroup={ctx.personnelByGroup}
			groups={ctx.scopedGroups}
			onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
			onRemoveAssignment={(date, typeId) => dailyAssignmentsStore.removeAssignment(date, typeId)}
			onClose={() => ctx.closeAssignmentModal()}
		/>
	{:catch}
		<span class="sr-only">Daily assignment editor failed to load.</span>
	{/await}
{/if}
