<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import MonthlyAssignmentPlanner from './MonthlyAssignmentPlanner.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
	import { scopePersonnelByGroup } from '$lib/utils/scopePersonnel';
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
			scopedGroupId?: string | null;
			permissions?: { canViewCalendar?: boolean; canEditCalendar?: boolean } | null;
		};
	}

	let { data }: Props = $props();

	const org = getOrgContext();
	const canManageConfig = $derived(org.isPrivileged || org.isFullEditor);
	const canMutate = $derived(!org.readOnly && !!data.permissions?.canEditCalendar && canManageConfig);
	const workspaceData = $derived(data.calendar?.data ?? data);

	const calendarPersonnel = $derived(workspaceData.allPersonnel ?? workspaceData.personnel ?? []);
	const personnelByGroup = $derived(
		groupAndSortPersonnel(calendarPersonnel, {
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		})
	);
	const scopedPBG = $derived(scopePersonnelByGroup(personnelByGroup, data.scopedGroupId ?? null));
	const assignmentTypeCount = $derived(dailyAssignmentsStore.types.length);
	const scopedPersonnelCount = $derived(scopedPBG.flatMap((group) => group.personnel).length);
	const plannerMonthLabel = $derived(`${calendarStore.monthName} ${calendarStore.year}`);
</script>

<PageToolbar
	title="Assignment Planner"
	subtitle="Manual monthly coverage planning for duty positions that need direct control."
	breadcrumbs={[{ label: 'Calendar', href: `/org/${org.orgId}/calendar` }, { label: 'Assignments' }]}
>
	<a href={`/org/${org.orgId}/calendar/duty-roster`} class="btn btn-secondary btn-sm">Duty Roster</a>
	<a href={`/org/${org.orgId}/calendar`} class="btn btn-sm">Back</a>
</PageToolbar>

<div class="assignment-planner-page">
	{#if !canMutate}
		<section class="restricted-hero">
			<h1>Access restricted.</h1>
			<p>Only organization admins and full editors can manage monthly assignments.</p>
		</section>
	{:else}
		<section class="planner-hero">
			<div class="hero-copy">
				<p class="eyebrow">Monthly coverage</p>
				<h1>Plan monthly assignments.</h1>
				<p class="hero-description">
					Use this planner for manual coverage decisions that do not belong in the duty roster flow. Fill recurring
					assignments quickly, then adjust individual dates as needed.
				</p>
			</div>

			<div class="planner-meta" aria-label="Assignment planner summary">
				<div class="meta-pill">
					<span class="meta-label">Month</span>
					<strong>{plannerMonthLabel}</strong>
				</div>
				<div class="meta-pill">
					<span class="meta-label">Assignment types</span>
					<strong>{assignmentTypeCount}</strong>
				</div>
				<div class="meta-pill">
					<span class="meta-label">Personnel in scope</span>
					<strong>{scopedPersonnelCount}</strong>
				</div>
			</div>
		</section>

		<section class="planner-panel card card-flat">
			<div class="panel-header">
				<div>
					<p class="section-kicker">Assignment grid</p>
					<h2>Monthly planner</h2>
				</div>
				<p class="panel-description">
					Set daily assignments, apply repeating coverage, or clear an assignment column when plans change.
				</p>
			</div>

			<MonthlyAssignmentPlanner
				currentDate={calendarStore.currentDate}
				assignmentTypes={dailyAssignmentsStore.types}
				assignments={dailyAssignmentsStore.assignments}
				personnelByGroup={scopedPBG}
				groups={groupsStore.names}
				onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
				onSetAssignmentBatch={(assignments) => dailyAssignmentsStore.setAssignmentBatch(assignments)}
			/>
		</section>
	{/if}
</div>

<style>
	.assignment-planner-page {
		padding: var(--sp-5) var(--sp-6) var(--sp-6);
		max-width: 1600px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}

	.planner-hero {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-4);
		align-items: stretch;
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.hero-copy {
		flex: 1 1 460px;
		max-width: 720px;
	}

	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.planner-hero h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 1.55rem + 1vw, 2.7rem);
		line-height: var(--line-height-tight);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.hero-description {
		margin: var(--sp-3) 0 0;
		max-width: 58ch;
		font-family: var(--font-body);
		font-size: var(--text-base);
		line-height: var(--line-height-copy);
		color: var(--text-secondary);
	}

	.planner-meta {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-3);
		flex: 1 1 340px;
		align-self: stretch;
	}

	.meta-pill {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--sp-1);
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		min-height: 100px;
	}

	.meta-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.meta-pill strong {
		font-size: clamp(1.15rem, 1rem + 0.6vw, 1.5rem);
		font-family: var(--font-display);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.04em;
		color: var(--text-primary);
	}

	.planner-panel {
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}

	.panel-header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: end;
		justify-content: space-between;
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-rule);
	}

	.section-kicker {
		margin: 0 0 2px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.panel-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.3rem, 1.1rem + 0.6vw, 1.7rem);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.panel-description {
		margin: 0;
		max-width: 48ch;
		font-family: var(--font-body);
		color: var(--text-secondary);
		line-height: var(--line-height-copy);
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

	@media (max-width: 900px) {
		.planner-meta {
			grid-template-columns: 1fr;
		}

		.planner-panel {
			padding: var(--sp-4);
		}
	}

	@media (max-width: 640px) {
		.assignment-planner-page {
			padding: var(--sp-4);
		}

		.planner-hero {
			padding: var(--sp-4);
		}
	}
</style>
