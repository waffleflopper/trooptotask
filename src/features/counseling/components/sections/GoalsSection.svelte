<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { DevelopmentGoal } from '../../counseling.types';
	import {
		GOAL_STATUS_LABELS,
		GOAL_STATUS_COLORS,
		GOAL_PRIORITY_LABELS,
		GOAL_PRIORITY_COLORS,
		GOAL_CATEGORY_LABELS,
		GOAL_CATEGORY_COLORS
	} from '../../counseling.types';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { developmentGoalsStore } from '$features/counseling/stores/developmentGoals.svelte';
	import DevelopmentGoalModal from '../DevelopmentGoalModal.svelte';

	interface Props {
		person: Personnel;
		canEdit: boolean;
	}

	let { person, canEdit }: Props = $props();

	let showGoalModal = $state(false);
	let editingGoal = $state<DevelopmentGoal | undefined>(undefined);
	const developmentGoals = $derived(developmentGoalsStore.getByPersonnelId(person.id));

	function openNewGoal() {
		editingGoal = undefined;
		showGoalModal = true;
	}

	function openEditGoal(goal: DevelopmentGoal) {
		editingGoal = goal;
		showGoalModal = true;
	}

	function closeGoalModal() {
		showGoalModal = false;
		editingGoal = undefined;
	}
</script>

<div class="leader-card">
	<div class="leader-card-header">
		<h3>Goals ({developmentGoals.length})</h3>
		{#if canEdit}
			<button class="btn btn-sm btn-primary" onclick={openNewGoal}>+ New</button>
		{/if}
	</div>
	<div class="leader-card-body">
		{#if developmentGoals.length > 0}
			<div class="goals-list">
				{#each developmentGoals as goal (goal.id)}
					<button
						class="goal-card"
						onclick={() => canEdit && openEditGoal(goal)}
						disabled={!canEdit}
					>
						<div class="goal-header">
							<span
								class="goal-category"
								style="background-color: {GOAL_CATEGORY_COLORS[goal.category]}"
							>
								{GOAL_CATEGORY_LABELS[goal.category]}
							</span>
							<span
								class="goal-priority"
								style="color: {GOAL_PRIORITY_COLORS[goal.priority]}"
							>
								{GOAL_PRIORITY_LABELS[goal.priority]}
							</span>
						</div>
						<h4 class="goal-title">{goal.title}</h4>
						{#if goal.description}
							<p class="goal-description">{goal.description}</p>
						{/if}
						<div class="goal-footer">
							<span
								class="goal-status"
								style="background-color: {GOAL_STATUS_COLORS[goal.status]}"
							>
								{GOAL_STATUS_LABELS[goal.status]}
							</span>
							{#if goal.targetDate}
								<span class="goal-target"
									>Target: {formatDisplayDate(goal.targetDate)}</span
								>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{:else}
			<div class="empty-state">
				<p>No development goals yet.</p>
				{#if canEdit}
					<p>Click "+ New" to add career, education, or personal goals.</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if showGoalModal}
	<DevelopmentGoalModal {person} existingGoal={editingGoal} onClose={closeGoalModal} />
{/if}

<style>
	.goals-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.goal-card {
		display: flex;
		flex-direction: column;
		padding: var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.goal-card:hover:not(:disabled) {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-2);
	}

	.goal-card:disabled {
		cursor: default;
	}

	.goal-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.goal-category {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 500;
	}

	.goal-priority {
		font-size: var(--font-size-sm);
		font-weight: 600;
	}

	.goal-title {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0 0 var(--spacing-xs);
	}

	.goal-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0 0 var(--spacing-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.goal-footer {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.goal-status {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 500;
		margin-left: auto;
	}

	.goal-target {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
	}
</style>
