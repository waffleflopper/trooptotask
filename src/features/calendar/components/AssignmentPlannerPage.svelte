<script lang="ts">
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import { CalendarRangeCoordinator } from '../contexts/CalendarRangeCoordinator.svelte';
	import { createVisibleCalendarRange, getCalendarRangeGaps } from '../utils/calendarRange';
	import { buildCalendarAnchorCookie } from '../utils/calendarAnchorDate';
	import MonthlyAssignmentPlanner from './MonthlyAssignmentPlanner.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupsStore } from '$features/personnel';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { createRosterReadModel } from '$features/personnel/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import type { Personnel } from '$lib/types';
	import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';

	interface Props {
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

	let { data }: Props = $props();

	const org = getOrgContext();
	const orgUrlSegment = $derived(org.orgUrlSegment ?? org.orgId);
	const assignmentAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAssignments, { kind: 'unscoped' })
	);
	const canMutate = $derived(assignmentAffordance.allowed);
	const workspaceData = $derived(data.calendar?.data ?? data);

	const rangeCoordinator = new CalendarRangeCoordinator();
	$effect(() => {
		data.orgId;
		rangeCoordinator.reset();
		const bootstrap = data.calendar?.data;
		if (bootstrap?.rangeStart && bootstrap.rangeEnd) {
			rangeCoordinator.includeBootstrap({ rangeStart: bootstrap.rangeStart, rangeEnd: bootstrap.rangeEnd });
		}
		return () => rangeCoordinator.cancelInFlightLoads();
	});
	$effect(() => {
		workspaceData;
		rangeCoordinator.retryToken;
		void rangeCoordinator.loadVisibleRange({
			orgId: data.orgId,
			canViewCalendar: canMutate,
			currentDate: calendarStore.currentDate,
			viewMode: 'month'
		});
		return () => rangeCoordinator.cancelInFlightLoads();
	});
	const rangeReady = $derived(
		dailyAssignmentsStore.orgId === data.orgId &&
			!dailyAssignmentsStore.loading &&
			rangeCoordinator.loadedRange !== null &&
			getCalendarRangeGaps(rangeCoordinator.loadedRange, createVisibleCalendarRange(calendarStore.currentDate, 'month'))
				.length === 0
	);
	$effect(() => {
		if (canMutate) document.cookie = buildCalendarAnchorCookie(calendarStore.currentDate);
	});

	const calendarPersonnel = $derived(workspaceData.allPersonnel ?? workspaceData.personnel ?? []);
	const rosterView = $derived(
		createRosterReadModel({
			personnel: calendarPersonnel,
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		}).scoped(org.scopeSet, { status: 'active' })
	);
	const scopedPBG = $derived(rosterView.personnelByGroup);
	const relatedLinks = $derived([{ label: 'Calendar', href: `/org/${orgUrlSegment}/calendar` }]);
</script>

<div class="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 sm:pb-6">
	<WorkspaceToolbar.Root ariaLabel="Assignment planner controls">
		<WorkspaceToolbar.Group label="Assignment planner context" zone="meta">
			<WorkspaceToolbar.Meta>Manual monthly coverage planning</WorkspaceToolbar.Meta>
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Related calendar pages" zone="actions">
			<WorkspaceToolbar.Nav ariaLabel="Related calendar pages" items={relatedLinks} />
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>

	{#if !canMutate}
		<section class="bg-card text-muted-foreground rounded-lg border px-6 py-8 text-center">
			<h1 class="font-display mb-2 text-2xl tracking-wide uppercase">Access restricted.</h1>
			<p class="leading-relaxed">Calendar operation access is required to manage monthly assignments.</p>
		</section>
	{:else}
		<MonthlyAssignmentPlanner
			currentDate={calendarStore.currentDate}
			onDateChange={(date) => calendarStore.goToMonth(date.getFullYear(), date.getMonth())}
			rangeStatus={rangeReady ? 'ready' : rangeCoordinator.error ? 'error' : 'loading'}
			onRetry={() => rangeCoordinator.retryFailedRange()}
			assignmentTypes={dailyAssignmentsStore.types}
			assignments={dailyAssignmentsStore.assignments}
			personnelByGroup={scopedPBG}
			groups={groupsStore.items}
			onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
			onSetAssignmentBatch={(assignments) => dailyAssignmentsStore.setAssignmentBatch(assignments)}
		/>
	{/if}
</div>
