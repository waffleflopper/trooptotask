<script lang="ts">
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import MonthlyAssignmentPlanner from './MonthlyAssignmentPlanner.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { groupAndSortPersonnel } from '$lib/domain/rosterGrouping';
	import { scopePersonnelByGroupScopeSet } from '$lib/utils/scopePersonnel';
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
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAssignments)
	);
	const canMutate = $derived(assignmentAffordance.allowed);
	const workspaceData = $derived(data.calendar?.data ?? data);

	const calendarPersonnel = $derived(workspaceData.allPersonnel ?? workspaceData.personnel ?? []);
	const personnelByGroup = $derived(
		groupAndSortPersonnel(calendarPersonnel, {
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		})
	);
	const scopedPBG = $derived(scopePersonnelByGroupScopeSet(personnelByGroup, org.scopeSet));
	const relatedLinks = $derived([
		{ label: 'Duty Rosters', href: `/org/${orgUrlSegment}/duty-rosters` },
		{ label: 'Calendar', href: `/org/${orgUrlSegment}/calendar` }
	]);
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
			assignmentTypes={dailyAssignmentsStore.types}
			assignments={dailyAssignmentsStore.assignments}
			personnelByGroup={scopedPBG}
			groups={groupsStore.names}
			onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
			onSetAssignmentBatch={(assignments) => dailyAssignmentsStore.setAssignmentBatch(assignments)}
		/>
	{/if}
</div>
