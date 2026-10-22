<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { CalendarRangeCoordinator } from '../contexts/CalendarRangeCoordinator.svelte';
	import { PlannerRosterRead, previewRosterFill, previewRosterReplacement } from '../contexts/PlannerRosterRead.svelte';
	import { formatDate } from '$lib/utils/dates';
	import { calendarViewCoverage } from '../utils/calendarRange';
	import MonthlyAssignmentPlanner from './MonthlyAssignmentPlanner.svelte';
	import type { CalendarOperationsPageAccess, RosterReplacement } from '../contracts';
	import { pinnedGroupsStore } from '$features/personnel';
	import { groupsStore } from '$features/personnel';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import CalendarPeriodNavigation from './CalendarPeriodNavigation.svelte';
	import { createRosterReadModel } from '$features/personnel/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { groupsInScope } from '$lib/access/scopeSetAccess';
	import type { Personnel } from '$features/personnel/contracts';
	import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';

	interface Props {
		org: CalendarOperationsPageAccess;
		data: {
			orgId: string;
			orgName?: string;
			personnel?: Personnel[];
			allPersonnel?: Personnel[];
			calendar?: {
				data?: CalendarWorkspaceData;
			};
		};
	}

	let { data, org }: Props = $props();

	const orgUrlSegment = $derived(org.orgUrlSegment);
	const assignmentAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAssignments, { kind: 'unscoped' })
	);
	const canMutate = $derived(assignmentAffordance.allowed);
	const workspaceData = $derived(data.calendar?.data ?? data);

	const rangeCoordinator = new CalendarRangeCoordinator();
	const monthCoverage = $derived(calendarViewCoverage(calendarStore.currentDate, 'month'));
	$effect(() => {
		data.orgId;
		rangeCoordinator.reset();
		const bootstrap = data.calendar?.data;
		if (bootstrap?.rangeStart && bootstrap.rangeEnd && bootstrap.availabilityRange) {
			rangeCoordinator.includeBootstrap({
				rangeStart: bootstrap.rangeStart,
				rangeEnd: bootstrap.rangeEnd,
				availabilityRange: bootstrap.availabilityRange
			});
		}
		return () => rangeCoordinator.cancelInFlightLoads();
	});
	$effect(() => {
		workspaceData;
		rangeCoordinator.retryToken;
		if (!canMutate) return;
		void rangeCoordinator.ensureRange(data.orgId, monthCoverage);
		return () => rangeCoordinator.cancelInFlightLoads();
	});
	const rangeReady = $derived(
		dailyAssignmentsStore.orgId === data.orgId &&
			!dailyAssignmentsStore.loading &&
			rangeCoordinator.status(monthCoverage) === 'ready'
	);

	// Counts span the whole Organization, so only an Organization-wide operator reads them. The read starts
	// beside the range read and never waits on it.
	const rosterRead = new PlannerRosterRead();
	const showsRosters = $derived(canMutate && org.scopeSet.kind === 'organization');
	const rosterMonth = $derived(formatDate(calendarStore.currentDate).slice(0, 7));
	$effect(() => {
		if (!showsRosters) return rosterRead.reset();
		rosterRead.load({ orgId: data.orgId, month: rosterMonth, today: formatDate(new Date()) });
	});

	// Every confirmed write refreshes the counts on its own. A fill the roster moved past wrote nothing, so the counts
	// are read again for the next preview.
	async function fillFromRoster(fill: Parameters<typeof dailyAssignmentsStore.fillFromRoster>[0]) {
		const result = await dailyAssignmentsStore.fillFromRoster(fill);
		if (result === 'changed') rosterRead.refresh();
		return result;
	}

	async function replaceFromRoster(typeId: string, preview: RosterReplacement) {
		if (!preview.selected) return 'failed' as const;
		const result = await dailyAssignmentsStore.replaceFromRoster({
			typeId,
			today: formatDate(new Date()),
			date: preview.date,
			assigneeId: preview.selected,
			replacing: preview.replacing.personId,
			repicks: preview.repicks.map(({ date, personId }) => ({ date, personId }))
		});
		if (result === 'changed') rosterRead.refresh();
		return result;
	}

	const dayRequest = (typeId: string, date: string) => ({
		orgId: data.orgId,
		typeId,
		date,
		today: formatDate(new Date())
	});

	const rosters = $derived(
		showsRosters
			? {
					status: rosterRead.status,
					stale: rosterRead.stale,
					views: rosterRead.rosters,
					onRetry: () => rosterRead.retry(),
					preview: (typeId: string, from: string, through: string) =>
						previewRosterFill(data.orgId, { typeId, today: formatDate(new Date()), from, through }),
					fill: (typeId: string, from: string, through: string, picks: { date: string; personId: string }[]) =>
						fillFromRoster({
							typeId,
							today: formatDate(new Date()),
							from,
							through,
							picks: picks.map(({ date, personId }) => ({ date, personId }))
						}),
					replacement: (typeId: string, date: string, assigneeId?: string) =>
						previewRosterReplacement(data.orgId, { typeId, today: formatDate(new Date()), date, assigneeId }),
					replace: replaceFromRoster,
					day: (typeId: string, date: string) => rosterRead.day(dayRequest(typeId, date)),
					loadDay: (typeId: string, date: string) => rosterRead.loadDay(dayRequest(typeId, date)),
					retryDay: (typeId: string, date: string) => rosterRead.retryDay(dayRequest(typeId, date))
				}
			: undefined
	);

	const calendarPersonnel = $derived(workspaceData.allPersonnel ?? workspaceData.personnel ?? []);
	const rosterView = $derived(
		createRosterReadModel({
			personnel: calendarPersonnel,
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		}).scoped(org.scopeSet, { status: 'active' })
	);
	const scopedPBG = $derived(rosterView.personnelByGroup);
	const scopedGroups = $derived(groupsInScope(groupsStore.items, org.scopeSet));
	let batchBusy = $state(false);
</script>

<div class="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 sm:pb-6">
	<CalendarPeriodNavigation
		view="month"
		anchor={calendarStore.currentDate}
		disabled={batchBusy}
		onAnchorChange={(anchor) => calendarStore.goToMonth(anchor.getFullYear(), anchor.getMonth())}
	>
		{#snippet layout({ monthPicker, previous, next, today })}
			{#snippet headerControls()}
				{#if canMutate}
					{@render today()}
					<ButtonGroup.Root aria-label="Calendar period">
						{@render previous()}
						{@render monthPicker({ variant: 'outline', size: 'sm', class: 'font-display tracking-wide uppercase' })}
						{@render next()}
					</ButtonGroup.Root>
				{/if}
				<Button variant="outline" size="sm" href={`/org/${orgUrlSegment}/calendar`}>
					<ArrowLeftIcon aria-hidden="true" />
					Back to calendar
				</Button>
			{/snippet}
			<PageShell.Header eyebrow="Calendar · Planning" title="Duty planner" aside={headerControls} />
		{/snippet}
	</CalendarPeriodNavigation>

	{#if !canMutate}
		<section class="bg-card text-muted-foreground rounded-lg border px-6 py-8 text-center">
			<h2 class="font-display mb-2 text-2xl tracking-wide uppercase">Access restricted.</h2>
			<p class="leading-relaxed">Calendar operation access is required to manage monthly assignments.</p>
		</section>
	{:else}
		<MonthlyAssignmentPlanner
			bind:busy={batchBusy}
			currentDate={calendarStore.currentDate}
			rangeStatus={rangeReady ? 'ready' : rangeCoordinator.error ? 'error' : 'loading'}
			onRetry={() => rangeCoordinator.retryFailedRange()}
			assignmentTypes={dailyAssignmentsStore.types}
			assignments={dailyAssignmentsStore.assignments}
			availabilityEntries={availabilityStore.items}
			statusTypes={statusTypesStore.items}
			specialDays={specialDaysStore.items}
			personnelByGroup={scopedPBG}
			groups={scopedGroups}
			{rosters}
			onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
			onSetAssignmentBatch={(assignments) => dailyAssignmentsStore.setAssignmentBatch(assignments)}
		/>
	{/if}
</div>
