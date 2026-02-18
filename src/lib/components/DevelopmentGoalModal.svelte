<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type {
		DevelopmentGoal,
		GoalStatus,
		GoalPriority,
		GoalCategory
	} from '$lib/types/leadersBook';
	import {
		GOAL_STATUS_LABELS,
		GOAL_PRIORITY_LABELS,
		GOAL_CATEGORY_LABELS,
		GOAL_CATEGORY_COLORS
	} from '$lib/types/leadersBook';
	import { developmentGoalsStore } from '$lib/stores/developmentGoals.svelte';

	interface Props {
		person: Personnel;
		existingGoal?: DevelopmentGoal;
		onClose: () => void;
	}

	let { person, existingGoal, onClose }: Props = $props();

	const isEdit = !!existingGoal;

	// Form state
	let title = $state(existingGoal?.title ?? '');
	let description = $state(existingGoal?.description ?? '');
	let category = $state<GoalCategory>(existingGoal?.category ?? 'career');
	let priority = $state<GoalPriority>(existingGoal?.priority ?? 'medium');
	let status = $state<GoalStatus>(existingGoal?.status ?? 'not-started');
	let targetDate = $state(existingGoal?.targetDate ?? '');
	let progressNotes = $state(existingGoal?.progressNotes ?? '');

	let saving = $state(false);

	const canSave = $derived(title.trim());

	async function handleSave() {
		if (!canSave) return;
		saving = true;
		try {
			const data = {
				personnelId: person.id,
				title: title.trim(),
				description: description.trim() || null,
				category,
				priority,
				status,
				targetDate: targetDate || null,
				progressNotes: progressNotes.trim() || null
			};

			if (existingGoal) {
				await developmentGoalsStore.update(existingGoal.id, data);
			} else {
				await developmentGoalsStore.add(data);
			}
			onClose();
		} finally {
			saving = false;
		}
	}

	async function handleRemove() {
		if (existingGoal && confirm('Are you sure you want to delete this goal?')) {
			await developmentGoalsStore.remove(existingGoal.id);
			onClose();
		}
	}
</script>

<div
	class="modal-overlay"
	role="dialog"
	aria-modal="true"
	aria-labelledby="goal-modal-title"
	tabindex="-1"
	onkeydown={(e) => e.key === 'Escape' && onClose()}
>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal" style="width: 550px; max-height: 90vh;" role="document">
		<div class="modal-header">
			<h2 id="goal-modal-title">{isEdit ? 'Edit' : 'New'} Development Goal</h2>
			<button class="btn btn-secondary btn-sm" onclick={onClose}>&times;</button>
		</div>

		<div class="modal-body">
			<div class="person-info">
				<span class="person-rank">{person.rank}</span>
				<span class="person-name">{person.lastName}, {person.firstName}</span>
			</div>

			<div class="form-group">
				<label class="label">Goal Title <span class="required">*</span></label>
				<input
					type="text"
					class="input"
					bind:value={title}
					placeholder="e.g., Complete SLC"
					required
				/>
			</div>

			<div class="form-group">
				<label class="label">Description</label>
				<textarea
					class="input textarea"
					bind:value={description}
					placeholder="Detailed description of the goal..."
					rows="3"
				></textarea>
			</div>

			<div class="category-selector">
				<label class="label">Category</label>
				<div class="category-buttons">
					{#each Object.entries(GOAL_CATEGORY_LABELS) as [value, label]}
						<button
							type="button"
							class="category-btn"
							class:selected={category === value}
							style="--category-color: {GOAL_CATEGORY_COLORS[value as GoalCategory]}"
							onclick={() => (category = value as GoalCategory)}
						>
							{label}
						</button>
					{/each}
				</div>
			</div>

			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Priority</label>
					<select class="select" bind:value={priority}>
						{#each Object.entries(GOAL_PRIORITY_LABELS) as [value, label]}
							<option {value}>{label}</option>
						{/each}
					</select>
				</div>
				<div class="form-group flex-1">
					<label class="label">Status</label>
					<select class="select" bind:value={status}>
						{#each Object.entries(GOAL_STATUS_LABELS) as [value, label]}
							<option {value}>{label}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="form-group">
				<label class="label">Target Date</label>
				<input type="date" class="input" bind:value={targetDate} />
			</div>

			<div class="form-group">
				<label class="label">Progress Notes</label>
				<textarea
					class="input textarea"
					bind:value={progressNotes}
					placeholder="Track progress and updates..."
					rows="3"
				></textarea>
			</div>
		</div>

		<div class="modal-footer">
			{#if existingGoal}
				<button class="btn btn-danger" onclick={handleRemove}>Delete</button>
			{/if}
			<div class="spacer"></div>
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button class="btn btn-primary" onclick={handleSave} disabled={!canSave || saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
	</div>
</div>

<style>
	.person-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-lg);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.person-rank {
		font-weight: 600;
		color: var(--color-primary);
	}

	.person-name {
		font-weight: 500;
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
	}

	.form-group {
		margin-bottom: var(--spacing-md);
	}

	.form-group.flex-1 {
		flex: 1;
	}

	.required {
		color: var(--color-error);
	}

	.textarea {
		resize: vertical;
		min-height: 60px;
	}

	.category-selector {
		margin-bottom: var(--spacing-md);
	}

	.category-buttons {
		display: flex;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-xs);
	}

	.category-btn {
		flex: 1;
		padding: var(--spacing-sm);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		font-size: var(--font-size-sm);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.category-btn:hover {
		border-color: var(--category-color);
	}

	.category-btn.selected {
		background: var(--category-color);
		border-color: var(--category-color);
		color: white;
	}

	.modal-footer {
		display: flex;
		gap: var(--spacing-sm);
	}

	.spacer {
		flex: 1;
	}

	.modal-body {
		max-height: 70vh;
		overflow-y: auto;
	}
</style>
