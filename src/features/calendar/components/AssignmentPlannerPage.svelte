<script lang="ts">
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import MonthlyAssignmentPlanner from './MonthlyAssignmentPlanner.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
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
		{ label: 'Duty Rosters', href: `/org/${org.orgId}/duty-rosters` },
		{ label: 'Calendar', href: `/org/${org.orgId}/calendar` }
	]);
</script>

<div class="assignment-planner-page">
	<WorkspaceToolbar.Root ariaLabel="Assignment planner controls">
		<WorkspaceToolbar.Group label="Assignment planner context" zone="meta">
			<WorkspaceToolbar.Meta>Manual monthly coverage planning</WorkspaceToolbar.Meta>
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Related calendar pages" zone="actions">
			<WorkspaceToolbar.Nav ariaLabel="Related calendar pages" items={relatedLinks} />
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>

	{#if !canMutate}
		<section class="restricted-hero">
			<h1>Access restricted.</h1>
			<p>Calendar operation access is required to manage monthly assignments.</p>
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

<style>
	.assignment-planner-page {
		padding: var(--sp-4) var(--sp-6) var(--sp-6);
		max-width: 1600px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.restricted-hero {
		text-align: center;
		padding: var(--sp-8) var(--sp-6);
		color: var(--text-secondary);
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
	}

	.restricted-hero h1 {
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 1.3rem + 0.5vw, 1.9rem);
		margin: 0 0 var(--sp-2);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.restricted-hero p {
		margin: 0;
		font-family: var(--font-body);
		line-height: var(--line-height-copy);
	}

	@media (max-width: 640px) {
		.assignment-planner-page {
			padding: var(--sp-4);
		}
	}
</style>
