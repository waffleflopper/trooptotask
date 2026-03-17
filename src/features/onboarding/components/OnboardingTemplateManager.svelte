<script lang="ts">
	import type { OnboardingTemplateStep } from '../onboarding.types';
	import type { TrainingType } from '$features/training/training.types';
	import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		trainingTypes: TrainingType[];
		onClose: () => void;
	}

	let { trainingTypes, onClose }: Props = $props();

	// Derived locals to ensure reactive tracking of store state
	const templates = $derived(onboardingTemplateStore.templates);
	const activeTemplateId = $derived(onboardingTemplateStore.activeTemplateId);
	const stepList = $derived(onboardingTemplateStore.list);

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

	// ── Template management state ──────────────────────────────────
	let showNewTemplateForm = $state(false);
	let newTemplateName = $state('');
	let newTemplateDescription = $state('');
	let creatingTemplate = $state(false);
	let templateError = $state('');

	let editingTemplateId = $state<string | null>(null);
	let editTemplateName = $state('');
	let editTemplateDescription = $state('');
	let renamingTemplate = $state(false);

	let confirmDeleteTemplate = $state<{ id: string; name: string } | null>(null);
	let deleteTemplateError = $state('');

	async function handleCreateTemplate() {
		if (!newTemplateName.trim()) return;
		creatingTemplate = true;
		templateError = '';
		try {
			const result = await onboardingTemplateStore.addTemplate(
				newTemplateName.trim(),
				newTemplateDescription.trim() || null
			);
			if (result.template) {
				showNewTemplateForm = false;
				newTemplateName = '';
				newTemplateDescription = '';
			} else {
				templateError = result.error ?? 'Failed to create template';
			}
		} finally {
			creatingTemplate = false;
		}
	}

	function startRenameTemplate() {
		const active = templates.find((t) => t.id === activeTemplateId);
		if (!active) return;
		editingTemplateId = active.id;
		editTemplateName = active.name;
		editTemplateDescription = active.description ?? '';
	}

	async function saveRenameTemplate() {
		if (!editingTemplateId || !editTemplateName.trim()) return;
		renamingTemplate = true;
		templateError = '';
		try {
			const result = await onboardingTemplateStore.updateTemplate(editingTemplateId, {
				name: editTemplateName.trim(),
				description: editTemplateDescription.trim() || null
			});
			if (result.success) {
				editingTemplateId = null;
			} else {
				templateError = result.error ?? 'Failed to rename template';
			}
		} finally {
			renamingTemplate = false;
		}
	}

	function cancelRenameTemplate() {
		editingTemplateId = null;
		templateError = '';
	}

	async function handleDeleteTemplate() {
		if (!confirmDeleteTemplate) return;
		const result = await onboardingTemplateStore.removeTemplate(confirmDeleteTemplate.id);
		if (result.success) {
			confirmDeleteTemplate = null;
			deleteTemplateError = '';
		} else {
			// Close the dialog and show the error inline in the manager
			deleteTemplateError = result.error ?? 'Failed to delete template';
			confirmDeleteTemplate = null;
		}
	}

	// ── Step management state ─────────────────────────────────────
	let newStepType = $state<'training' | 'paperwork' | 'checkbox'>('training');
	let newName = $state('');
	let newDescription = $state('');
	let newTrainingTypeId = $state<string | null>(null);
	let newStages = $state<string[]>([]);

	let editingId = $state<string | null>(null);
	let editStepType = $state<'training' | 'paperwork' | 'checkbox'>('training');
	let editName = $state('');
	let editDescription = $state('');
	let editTrainingTypeId = $state<string | null>(null);
	let editStages = $state<string[]>([]);

	function handleAdd() {
		if (!newName.trim()) return;
		onboardingTemplateStore.add({
			name: newName.trim(),
			description: newDescription.trim() || null,
			stepType: newStepType,
			trainingTypeId: newStepType === 'training' ? newTrainingTypeId : null,
			stages: newStepType === 'paperwork' ? newStages.filter((s) => s.trim()) : null,
			sortOrder: stepList.length
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
			onboardingTemplateStore.update(editingId, {
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
			onboardingTemplateStore.remove(confirmRemove.id);
			confirmRemove = null;
		}
	}

	// Local sorted copy for immediate visual feedback during reordering
	let orderedSteps = $state<OnboardingTemplateStep[]>([]);

	$effect(() => {
		orderedSteps = [...stepList];
	});

	function moveUp(index: number) {
		if (index === 0) return;
		const next = orderedSteps.map((s, i) => ({ ...s, sortOrder: i }));
		[next[index], next[index - 1]] = [next[index - 1], next[index]];
		next[index - 1].sortOrder = index - 1;
		next[index].sortOrder = index;
		orderedSteps = next;
		onboardingTemplateStore.update(next[index - 1].id, { sortOrder: index - 1 });
		onboardingTemplateStore.update(next[index].id, { sortOrder: index });
	}

	function moveDown(index: number) {
		if (index === orderedSteps.length - 1) return;
		const next = orderedSteps.map((s, i) => ({ ...s, sortOrder: i }));
		[next[index], next[index + 1]] = [next[index + 1], next[index]];
		next[index].sortOrder = index;
		next[index + 1].sortOrder = index + 1;
		orderedSteps = next;
		onboardingTemplateStore.update(next[index].id, { sortOrder: index });
		onboardingTemplateStore.update(next[index + 1].id, { sortOrder: index + 1 });
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
			return step.description.length > 60 ? step.description.substring(0, 60) + '...' : step.description;
		}
		return '';
	}

	const activeTemplate = $derived(templates.find((t) => t.id === activeTemplateId) ?? null);

	const canDeleteTemplate = $derived(templates.length > 1);
</script>

<Modal title="Manage Onboarding Templates" {onClose} width="640px" titleId="onboarding-template-title">
	<!-- Template Selector -->
	<div class="template-header">
		<div class="template-selector">
			<label class="label" for="template-select">Template</label>
			<div class="template-select-row">
				{#if editingTemplateId === activeTemplateId}
					<div class="rename-form">
						<input type="text" class="input" bind:value={editTemplateName} placeholder="Template name..." />
						<input
							type="text"
							class="input"
							bind:value={editTemplateDescription}
							placeholder="Description (optional)"
						/>
						{#if templateError}
							<p class="error-text">{templateError}</p>
						{/if}
						<div class="rename-actions">
							<button
								class="btn btn-primary btn-sm"
								onclick={saveRenameTemplate}
								disabled={!editTemplateName.trim() || renamingTemplate}
							>
								{#if renamingTemplate}<Spinner />{/if}
								Save
							</button>
							<button class="btn btn-secondary btn-sm" onclick={cancelRenameTemplate}>Cancel</button>
						</div>
					</div>
				{:else}
					<select
						id="template-select"
						class="select"
						style="flex: 1;"
						value={activeTemplateId}
						onchange={(e) => onboardingTemplateStore.setActiveTemplate((e.target as HTMLSelectElement).value)}
					>
						{#each templates as t (t.id)}
							<option value={t.id}>{t.name}</option>
						{/each}
					</select>
					<button class="btn btn-secondary btn-sm" onclick={startRenameTemplate} title="Rename template">
						Rename
					</button>
					{#if canDeleteTemplate}
						<button
							class="btn btn-danger btn-sm"
							onclick={() =>
								activeTemplate && (confirmDeleteTemplate = { id: activeTemplate.id, name: activeTemplate.name })}
							title="Delete template"
						>
							Delete
						</button>
					{/if}
					{#if !showNewTemplateForm}
						<button
							class="btn btn-secondary btn-sm new-template-btn"
							onclick={() => {
								showNewTemplateForm = true;
								templateError = '';
							}}
						>
							+ New Template
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	{#if deleteTemplateError}
		<p class="error-text" style="margin-bottom: var(--spacing-sm);">{deleteTemplateError}</p>
	{/if}

	{#if showNewTemplateForm}
		<div class="new-template-form">
			<h3>New Template</h3>
			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Name</label>
					<input type="text" class="input" bind:value={newTemplateName} placeholder="e.g., Enlisted Onboarding" />
				</div>
			</div>
			<div class="form-group">
				<label class="label">Description (optional)</label>
				<input type="text" class="input" bind:value={newTemplateDescription} placeholder="Brief description..." />
			</div>
			{#if templateError}
				<p class="error-text">{templateError}</p>
			{/if}
			<div class="form-actions">
				<button
					class="btn btn-primary btn-sm"
					onclick={handleCreateTemplate}
					disabled={!newTemplateName.trim() || creatingTemplate}
				>
					{#if creatingTemplate}<Spinner />{/if}
					Create Template
				</button>
				<button
					class="btn btn-secondary btn-sm"
					onclick={() => {
						showNewTemplateForm = false;
						templateError = '';
					}}
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

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
								<input type="text" class="input flex-1" bind:value={newStages[index]} placeholder="Stage name..." />
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

			<button class="btn btn-primary" onclick={handleAdd} disabled={!newName.trim()}> Add Step </button>
		</div>
	</div>

	<div class="list-section">
		<h3>
			{activeTemplate?.name ?? 'Template'} Steps
			{#if activeTemplate?.description}
				<span class="template-description">{activeTemplate.description}</span>
			{/if}
		</h3>
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
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
										><polyline points="18 15 12 9 6 15" /></svg
									>
								</button>
								<button
									class="btn-move"
									onclick={() => moveDown(index)}
									disabled={index === orderedSteps.length - 1}
									title="Move down"
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
										><polyline points="6 9 12 15 18 9" /></svg
									>
								</button>
							</div>
							<button class="btn btn-secondary btn-sm" onclick={() => startEdit(step)}> Edit </button>
							<button class="btn btn-danger btn-sm" onclick={() => handleRemove(step.id, step.name)}> &times; </button>
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
		message={`Remove "${confirmRemove.name}"? This step will be removed from the template.`}
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (confirmRemove = null)}
	/>
{/if}

{#if confirmDeleteTemplate}
	<ConfirmDialog
		title="Delete Template"
		message={`Delete template "${confirmDeleteTemplate.name}"? Steps in this template will be removed. Active onboardings using this template must be completed or cancelled first.`}
		confirmLabel="Delete Template"
		variant="danger"
		onConfirm={handleDeleteTemplate}
		onCancel={() => {
			confirmDeleteTemplate = null;
			deleteTemplateError = '';
		}}
	/>
{/if}

<style>
	.template-header {
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
	}

	.template-selector {
		min-width: 0;
	}

	.template-select-row {
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
		margin-top: var(--spacing-xs);
	}

	.new-template-btn {
		flex-shrink: 0;
	}

	.rename-form {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.rename-actions {
		display: flex;
		gap: var(--spacing-xs);
	}

	.new-template-form {
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.new-template-form h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-bottom: var(--spacing-sm);
		color: var(--color-text-muted);
	}

	.form-actions {
		display: flex;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-sm);
	}

	.error-text {
		font-size: var(--font-size-sm);
		color: var(--color-error);
		margin: var(--spacing-xs) 0 0;
	}

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
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.template-description {
		font-size: var(--font-size-sm);
		font-weight: 400;
		color: var(--color-text-muted);
		font-style: italic;
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
