<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type {
		DevelopmentGoal,
		GoalStatus,
		GoalPriority,
		GoalCategory
	} from '../counseling.types';
	import {
		GOAL_STATUS_LABELS,
		GOAL_PRIORITY_LABELS,
		GOAL_CATEGORY_LABELS,
		GOAL_CATEGORY_COLORS
	} from '../counseling.types';
	import { page } from '$app/stores';
	import { developmentGoalsStore } from '$features/counseling/stores/developmentGoals.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	interface Props {
		person: Personnel;
		existingGoal?: DevelopmentGoal;
		onClose: () => void;
	}

	let { person, existingGoal, onClose }: Props = $props();

	const isEdit = !!existingGoal;
	const orgId = $page.params.orgId!;

	// Form state
	let title = $state('');
	let description = $state('');
	let category = $state<GoalCategory>('career');
	let priority = $state<GoalPriority>('medium');
	let status = $state<GoalStatus>('not-started');
	let targetDate = $state('');
	let progressNotes = $state('');

	$effect(() => {
		title = existingGoal?.title ?? '';
		description = existingGoal?.description ?? '';
		category = existingGoal?.category ?? 'career';
		priority = existingGoal?.priority ?? 'medium';
		status = existingGoal?.status ?? 'not-started';
		targetDate = existingGoal?.targetDate ?? '';
		progressNotes = existingGoal?.progressNotes ?? '';
	});

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
			toastStore.success(isEdit ? 'Goal updated' : 'Goal created');
			onClose();
		} catch {
			toastStore.error('Failed to save goal');
		} finally {
			saving = false;
		}
	}

	let showRemoveConfirm = $state(false);

	function handleRemove() {
		showRemoveConfirm = true;
	}

	async function doRemove() {
		showRemoveConfirm = false;
		if (!existingGoal) return;
		try {
			const result = await developmentGoalsStore.remove(existingGoal.id);
			if (result === 'approval_required') {
				await submitDeletionRequest(
					orgId,
					'development_goal',
					existingGoal.id,
					`Goal "${existingGoal.title}" for ${person.rank} ${person.lastName}`,
					`/org/${orgId}/leaders-book`
				);
				onClose();
				return;
			}
			toastStore.success('Goal deleted');
			onClose();
		} catch {
			toastStore.error('Failed to delete goal');
		}
	}
</script>

<Modal
	title="{isEdit ? 'Edit' : 'New'} Development Goal"
	{onClose}
	width="550px"
	titleId="goal-modal-title"
>
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

	{#snippet footer()}
		{#if existingGoal}
			<button class="btn btn-danger" onclick={handleRemove}>Delete</button>
		{/if}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" onclick={handleSave} disabled={!canSave || saving}>
			{saving ? 'Saving...' : 'Save'}
		</button>
	{/snippet}
</Modal>

{#if showRemoveConfirm}
	<ConfirmDialog
		title="Delete Goal"
		message="Are you sure you want to delete this goal?"
		confirmLabel="Delete"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (showRemoveConfirm = false)}
	/>
{/if}

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

	.spacer {
		flex: 1;
	}
</style>