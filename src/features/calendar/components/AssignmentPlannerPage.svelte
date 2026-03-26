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

	interface Props {
		data: {
			orgId: string;
			orgName?: string;
			personnel?: Personnel[];
			allPersonnel?: Personnel[];
			scopedGroupId?: string | null;
			permissions?: { canViewCalendar?: boolean; canEditCalendar?: boolean } | null;
		};
	}

	let { data }: Props = $props();

	const org = getOrgContext();
	const canManageConfig = $derived(org.isPrivileged || org.isFullEditor);
	const canMutate = $derived(!org.readOnly && !!data.permissions?.canEditCalendar && canManageConfig);

	const calendarPersonnel = $derived(data.allPersonnel ?? data.personnel ?? []);
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
	breadcrumbs={[{ label: 'Calendar', href: `/org/${org.orgId}/calendar` }, { label: 'Assignments' }]}
>
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
				<p class="eyebrow">Manual scheduling</p>
				<h1>Plan assignments with room to think.</h1>
				<p class="hero-description">
					Use this page for the judgment calls that do not belong in the duty roster flow. Build out the month,
					make quick fills where they help, and adjust individual days without getting boxed into a modal.
				</p>
				<div class="hero-actions">
					<a class="btn btn-secondary btn-sm" href={`/org/${org.orgId}/calendar/duty-roster`}>Open Duty Roster</a>
				</div>
			</div>

			<div class="planner-meta" aria-label="Assignment planner summary">
				<div class="meta-pill">
					<span class="meta-label">Planning month</span>
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
				<p class="panel-description">Set daily assignments, quick-fill repeating coverage, or clear a full column when plans change.</p>
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
		padding: var(--spacing-lg);
		max-width: 1600px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.planner-hero {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-lg);
		align-items: stretch;
		padding: var(--spacing-xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		background: linear-gradient(135deg, var(--color-primary-tint), var(--color-surface) 48%);
		box-shadow: var(--shadow-1);
	}

	.hero-copy {
		flex: 1 1 460px;
		max-width: 760px;
	}

	.eyebrow {
		margin: 0 0 var(--spacing-xs);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-primary);
	}

	.planner-hero h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 3vw, 2.5rem);
		line-height: 1.08;
	}

	.hero-description {
		margin: var(--spacing-sm) 0 0;
		max-width: 62ch;
		font-size: var(--font-size-md);
		line-height: 1.6;
		color: var(--color-text-muted);
	}

	.hero-actions {
		margin-top: var(--spacing-md);
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
	}

	.planner-meta {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--spacing-sm);
		flex: 1 1 340px;
		align-self: stretch;
	}

	.meta-pill {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		padding: var(--spacing-md);
		border: 1px solid color-mix(in srgb, var(--color-primary) 10%, var(--color-border));
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--color-surface) 82%, white 18%);
		min-height: 92px;
	}

	.meta-label {
		font-size: var(--font-size-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.meta-pill strong {
		font-size: clamp(1rem, 1.6vw, 1.25rem);
		font-family: var(--font-display);
		color: var(--color-text);
	}

	.planner-panel {
		padding: var(--spacing-lg);
		border-radius: var(--radius-xl);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.panel-header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-md);
		align-items: end;
		justify-content: space-between;
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
	}

	.section-kicker {
		margin: 0 0 2px;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.panel-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.15rem, 1.7vw, 1.45rem);
	}

	.panel-description {
		margin: 0;
		max-width: 48ch;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.restricted-hero {
		text-align: center;
		padding: var(--spacing-xl) var(--spacing-lg);
		color: var(--color-text-secondary);
	}

	.restricted-hero h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-xl);
		margin: 0 0 var(--spacing-sm);
	}

	@media (max-width: 900px) {
		.planner-meta {
			grid-template-columns: 1fr;
		}

		.planner-panel {
			padding: var(--spacing-md);
		}
	}

	@media (max-width: 640px) {
		.assignment-planner-page {
			padding: var(--spacing-md);
		}

		.planner-hero {
			padding: var(--spacing-lg);
		}
	}
</style>
