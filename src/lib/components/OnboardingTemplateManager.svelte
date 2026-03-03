<script lang="ts">
	import type { OnboardingTemplateStep, TrainingType } from '../types';
	import Modal from './Modal.svelte';
	import Badge from './ui/Badge.svelte';
	import EmptyState from './ui/EmptyState.svelte';
	import ConfirmDialog from './ui/ConfirmDialog.svelte';

	interface Props {
		templateSteps: OnboardingTemplateStep[];
		trainingTypes: TrainingType[];
		onAdd: (data: Omit<OnboardingTemplateStep, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<OnboardingTemplateStep, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { templateSteps, trainingTypes, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	const stepTypeColors: Record<string, string> = {
		training: '#3b82f6',
		paperwork: '#f59e0b',
		checkbox: '#6b7280'
	};

	const stepTypeLabels: Record<string, string> = {
		training: 'Training',
		paperwork: 'Paperwork',
		checkbox: 'Checkbox'
	};

	// Add form state
	let newStepType = $state<'training' | 'paperwork' | 'checkbox'>('training');
	let newName = $state('');
	let newDescription = $state('');
	let newTrainingTypeId = $state<string | null>(null);
	let newStages = $state<string[]>([]);

	// Edit form state
	let editingId = $state<string | null>(null);
	let editStepType = $state<'training' | 'paperwork' | 'checkbox'>('training');
	let editName = $state('');
	let editDescription = $state('');
	let editTrainingTypeId = $state<string | null>(null);
	let editStages = $state<string[]>([]);

	function handleAdd() {
		if (!newName.trim()) return;
		onAdd({
			name: newName.trim(),
			description: newDescription.trim() || null,
			stepType: newStepType,
			trainingTypeId: newStepType === 'training' ? newTrainingTypeId : null,
			stages: newStepType === 'paperwork' ? newStages.filter((s) => s.trim()) : null,
			sortOrder: templateSteps.length
		});
		resetNewForm();
	}

	function resetNewForm() {
		newStepType = 'training';
		newName = '';
		newDescription = '';
		newTrainingTypeId = null;
		newStages = [];
	}

	function addNewStage() {
		newStages = [...newStages, ''];
	}

	function removeNewStage(index: number) {
		newStages = newStages.filter((_, i) => i !== index);
	}

	function addEditStage() {
		editStages = [...editStages, ''];
	}

	function removeEditStage(index: number) {
		editStages = editStages.filter((_, i) => i !== index);
	}

	function startEdit(step: OnboardingTemplateStep) {
		editingId = step.id;
		editStepType = step.stepType;
		editName = step.name;
		editDescription = step.description ?? '';
		editTrainingTypeId = step.trainingTypeId;
		editStages = step.stages ? [...step.stages] : [];
	}

	function saveEdit() {
		if (editingId && editName.trim()) {
			onUpdate(editingId, {
				name: editName.trim(),
				description: editDescription.trim() || null,
				stepType: editStepType,
				trainingTypeId: editStepType === 'training' ? editTrainingTypeId : null,
				stages: editStepType === 'paperwork' ? editStages.filter((s) => s.trim()) : null
			});
		}
		cancelEdit();
	}

	function cancelEdit() {
		editingId = null;
	}

	let confirmRemove = $state<{ id: string; name: string } | null>(null);

	function handleRemove(id: string, name: string) {
		confirmRemove = { id, name };
	}

	function doRemove() {
		if (confirmRemove) {
			onRemove(confirmRemove.id);
			confirmRemove = null;
		}
	}

	// Local sorted copy for immediate visual feedback during reordering
	let orderedSteps = $state<OnboardingTemplateStep[]>([]);

	$effect(() => {
		orderedSteps = [...templateSteps].sort((a, b) => a.sortOrder - b.sortOrder);
	});

	function moveUp(index: number) {
		if (index === 0) return;
		const next = orderedSteps.map((s, i) => ({ ...s, sortOrder: i }));
		[next[index], next[index - 1]] = [next[index - 1], next[index]];
		next[index - 1].sortOrder = index - 1;
		next[index].sortOrder = index;
		orderedSteps = next;
		onUpdate(next[index - 1].id, { sortOrder: index - 1 });
		onUpdate(next[index].id, { sortOrder: index });
	}

	function moveDown(index: number) {
		if (index === orderedSteps.length - 1) return;
		const next = orderedSteps.map((s, i) => ({ ...s, sortOrder: i }));
		[next[index], next[index + 1]] = [next[index + 1], next[index]];
		next[index].sortOrder = index;
		next[index + 1].sortOrder = index + 1;
		orderedSteps = next;
		onUpdate(next[index].id, { sortOrder: index });
		onUpdate(next[index + 1].id, { sortOrder: index + 1 });
	}

	function getDescriptionPreview(step: OnboardingTemplateStep): string {
		if (step.stepType === 'training' && step.trainingTypeId) {
			const tt = trainingTypes.find((t) => t.id === step.trainingTypeId);
			return tt ? `Training: ${tt.name}` : 'Training type not found';
		}
		if (step.stepType === 'paperwork' && step.stages?.length) {
			return `${step.stages.length} stage${step.stages.length === 1 ? '' : 's'}`;
		}
		if (step.description) {
			return step.description.length > 60
				? step.description.substring(0, 60) + '...'
				: step.description;
		}
		return '';
	}
</script>

<Modal title="Manage Onboarding Template" {onClose} width="600px" titleId="onboarding-template-title">
	<div class="add-section">
		<h3>Add Step</h3>
		<div class="add-form">
			<div class="form-row">
				<div class="form-group">
					<label class="label">Step Type</label>
					<select class="select" bind:value={newStepType}>
						<option value="training">Training</option>
						<option value="paperwork">Paperwork</option>
						<option value="checkbox">Checkbox</option>
					</select>
				</div>
				<div class="form-group flex-1">
					<label class="label">Name</label>
					<input type="text" class="input" bind:value={newName} placeholder="e.g., Complete safety briefing" />
				</div>
			</div>

			{#if newStepType === 'training'}
				<div class="form-group">
					<label class="label">Training Type</label>
					<select class="select" bind:value={newTrainingTypeId}>
						<option value={null}>-- Select training type --</option>
						{#each trainingTypes as tt}
							<option value={tt.id}>{tt.name}</option>
						{/each}
					</select>
				</div>
			{:else if newStepType === 'paperwork'}
				<div class="form-group">
					<label class="label">Stages</label>
					<div class="stages-list">
						{#each newStages as stage, index}
							<div class="stage-row">
								<input
									type="text"
									class="input flex-1"
									bind:value={newStages[index]}
									placeholder="Stage name..."
								/>
								<button class="btn btn-danger btn-sm" onclick={() => removeNewStage(index)}>&times;</button>
							</div>
						{/each}
						<button class="btn btn-secondary btn-sm" onclick={addNewStage}>Add Stage</button>
					</div>
				</div>
			{:else if newStepType === 'checkbox'}
				<div class="form-group">
					<label class="label">Description (optional)</label>
					<input type="text" class="input" bind:value={newDescription} placeholder="Brief description..." />
				</div>
			{/if}

			<button class="btn btn-primary" onclick={handleAdd} disabled={!newName.trim()}>
				Add Step
			</button>
		</div>
	</div>

	<div class="list-section">
		<h3>Template Steps</h3>
		<div class="type-list">
			{#each orderedSteps as step, index (step.id)}
				<div class="type-item">
					{#if editingId === step.id}
						<div class="edit-form">
							<div class="form-row">
								<div class="form-group">
									<label class="label">Step Type</label>
									<select class="select" bind:value={editStepType}>
										<option value="training">Training</option>
										<option value="paperwork">Paperwork</option>
										<option value="checkbox">Checkbox</option>
									</select>
								</div>
								<div class="form-group flex-1">
									<label class="label">Name</label>
									<input type="text" class="input" bind:value={editName} />
								</div>
							</div>

							{#if editStepType === 'training'}
								<div class="form-group">
									<label class="label">Training Type</label>
									<select class="select" bind:value={editTrainingTypeId}>
										<option value={null}>-- Select training type --</option>
										{#each trainingTypes as tt}
											<option value={tt.id}>{tt.name}</option>
										{/each}
									</select>
								</div>
							{:else if editStepType === 'paperwork'}
								<div class="form-group">
									<label class="label">Stages</label>
									<div class="stages-list">
										{#each editStages as stage, index}
											<div class="stage-row">
												<input
													type="text"
													class="input flex-1"
													bind:value={editStages[index]}
													placeholder="Stage name..."
												/>
												<button class="btn btn-danger btn-sm" onclick={() => removeEditStage(index)}>&times;</button>
											</div>
										{/each}
										<button class="btn btn-secondary btn-sm" onclick={addEditStage}>Add Stage</button>
									</div>
								</div>
							{:else if editStepType === 'checkbox'}
								<div class="form-group">
									<label class="label">Description (optional)</label>
									<input type="text" class="input" bind:value={editDescription} />
								</div>
							{/if}

							<div class="edit-actions">
								<button class="btn btn-primary btn-sm" onclick={saveEdit}>Save</button>
								<button class="btn btn-secondary btn-sm" onclick={cancelEdit}>Cancel</button>
							</div>
						</div>
					{:else}
						<div class="type-info">
							<Badge label={stepTypeLabels[step.stepType]} color={stepTypeColors[step.stepType]} />
							<span class="step-name">{step.name}</span>
							{#if getDescriptionPreview(step)}
								<span class="type-meta">{getDescriptionPreview(step)}</span>
							{/if}
						</div>
						<div class="type-actions">
							<div class="move-btns">
								<button class="btn-move" onclick={() => moveUp(index)} disabled={index === 0} title="Move up">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
								</button>
								<button class="btn-move" onclick={() => moveDown(index)} disabled={index === orderedSteps.length - 1} title="Move down">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
								</button>
							</div>
							<button class="btn btn-secondary btn-sm" onclick={() => startEdit(step)}>
								Edit
							</button>
							<button
								class="btn btn-danger btn-sm"
								onclick={() => handleRemove(step.id, step.name)}
							>
								&times;
							</button>
						</div>
					{/if}
				</div>
			{/each}

			{#if orderedSteps.length === 0}
				<EmptyState message="No onboarding steps defined yet." variant="simple" />
			{/if}
		</div>
	</div>

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Close</button>
	{/snippet}
</Modal>

{#if confirmRemove}
	<ConfirmDialog
		title="Remove Onboarding Step"
		message='Remove "{confirmRemove.name}"? This step will be removed from the template.'
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (confirmRemove = null)}
	/>
{/if}

<style>
	.add-section,
	.list-section {
		margin-bottom: var(--spacing-lg);
	}

	.add-section h3,
	.list-section h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-bottom: var(--spacing-sm);
		color: var(--color-text-muted);
	}

	.add-form,
	.edit-form {
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-sm);
	}

	.form-group {
		margin-bottom: var(--spacing-sm);
	}

	.form-group.flex-1 {
		flex: 1;
	}

	.stages-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.stage-row {
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
	}

	.stage-row .flex-1 {
		flex: 1;
	}

	.type-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		max-height: 300px;
		overflow-y: auto;
	}

	.type-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.type-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		flex-wrap: wrap;
		min-width: 0;
	}

	.step-name {
		font-size: var(--font-size-base);
		font-weight: 500;
	}

	.type-meta {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.type-actions {
		display: flex;
		gap: var(--spacing-xs);
		flex-shrink: 0;
	}

	.edit-form {
		width: 100%;
	}

	.edit-actions {
		display: flex;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-sm);
	}

	.move-btns {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-right: var(--spacing-xs);
	}

	.btn-move {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-move:hover:not(:disabled) {
		background: var(--color-surface-variant);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.btn-move:disabled {
		opacity: 0.25;
		cursor: default;
	}

	.btn-move svg {
		width: 12px;
		height: 12px;
	}
</style>
