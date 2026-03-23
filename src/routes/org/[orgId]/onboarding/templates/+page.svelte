<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { templateStore, templateStepStore } from '$features/onboarding/stores/templates.svelte';
	import type {
		OnboardingTemplate,
		OnboardingTemplateStep,
		OnboardingStepType
	} from '$features/onboarding/onboarding.types';
	import type { TrainingType } from '$features/training/training.types';

	let { data } = $props();

	const org = getOrgContext();

	// --- Initialize stores from server data ---
	$effect(() => {
		templateStore.load(data.templates, data.orgId);
		templateStepStore.load(data.templateSteps, data.orgId);
	});

	// --- Local state ---
	let selectedTemplateId: string | null = $state(null);
	let renamingTemplateId: string | null = $state(null);
	let renameValue = $state('');
	let addingTemplate = $state(false);
	let newTemplateName = $state('');
	let newTemplateDescription = $state('');

	// Step editor state
	let addingStep = $state(false);
	let editingStepId: string | null = $state(null);
	let stepName = $state('');
	let stepDescription = $state('');
	let stepType: OnboardingStepType = $state('checkbox');
	let stepTrainingTypeId: string | null = $state(null);
	let stepStages: string[] = $state([]);
	let newStageName = $state('');

	// Confirm dialog
	let confirmDelete: { type: 'template' | 'step'; id: string; name: string } | null = $state(null);

	// Saving indicators
	let savingTemplate = $state(false);
	let savingStep = $state(false);

	// --- Derived ---
	const templates = $derived(templateStore.items);
	const allSteps = $derived(templateStepStore.items);

	const selectedTemplate = $derived(selectedTemplateId ? templateStore.getById(selectedTemplateId) : null);

	const selectedSteps = $derived(
		selectedTemplateId
			? allSteps.filter((s) => s.templateId === selectedTemplateId).sort((a, b) => a.sortOrder - b.sortOrder)
			: []
	);

	const trainingTypes: TrainingType[] = $derived(data.trainingTypes ?? []);

	const canMutate = $derived(!org.readOnly);

	// --- Step type config ---
	const STEP_TYPE_COLORS: Record<OnboardingStepType, string> = {
		checkbox: '#6b7280',
		paperwork: '#3b82f6',
		training: '#22c55e'
	};

	const STEP_TYPE_LABELS: Record<OnboardingStepType, string> = {
		checkbox: 'Checkbox',
		paperwork: 'Paperwork',
		training: 'Training'
	};

	// --- Template actions ---
	function selectTemplate(id: string) {
		selectedTemplateId = id;
		cancelAddStep();
		cancelEditStep();
	}

	function startRename(template: OnboardingTemplate) {
		renamingTemplateId = template.id;
		renameValue = template.name;
	}

	async function commitRename() {
		if (!renamingTemplateId || !renameValue.trim()) return;
		await templateStore.update(renamingTemplateId, { name: renameValue.trim() });
		renamingTemplateId = null;
		renameValue = '';
	}

	function cancelRename() {
		renamingTemplateId = null;
		renameValue = '';
	}

	function handleRenameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			commitRename();
		} else if (e.key === 'Escape') {
			cancelRename();
		}
	}

	async function addTemplate() {
		if (!newTemplateName.trim()) return;
		savingTemplate = true;
		try {
			const created = await templateStore.add({
				orgId: data.orgId,
				name: newTemplateName.trim(),
				description: newTemplateDescription.trim() || null,
				createdAt: new Date().toISOString()
			});
			if (created) {
				selectedTemplateId = created.id;
			}
			newTemplateName = '';
			newTemplateDescription = '';
			addingTemplate = false;
		} finally {
			savingTemplate = false;
		}
	}

	function cancelAddTemplate() {
		addingTemplate = false;
		newTemplateName = '';
		newTemplateDescription = '';
	}

	async function deleteTemplate(id: string) {
		// Also remove all steps belonging to this template
		const stepsToRemove = allSteps.filter((s) => s.templateId === id);
		for (const step of stepsToRemove) {
			await templateStepStore.removeBool(step.id);
		}
		await templateStore.removeBool(id);
		if (selectedTemplateId === id) {
			selectedTemplateId = null;
		}
		confirmDelete = null;
	}

	// --- Step actions ---
	function resetStepForm() {
		stepName = '';
		stepDescription = '';
		stepType = 'checkbox';
		stepTrainingTypeId = null;
		stepStages = [];
		newStageName = '';
	}

	function startAddStep() {
		cancelEditStep();
		resetStepForm();
		addingStep = true;
	}

	function cancelAddStep() {
		addingStep = false;
		resetStepForm();
	}

	function startEditStep(step: OnboardingTemplateStep) {
		cancelAddStep();
		editingStepId = step.id;
		stepName = step.name;
		stepDescription = step.description ?? '';
		stepType = step.stepType;
		stepTrainingTypeId = step.trainingTypeId;
		stepStages = step.stages ? [...step.stages] : [];
		newStageName = '';
	}

	function cancelEditStep() {
		editingStepId = null;
		resetStepForm();
	}

	async function saveNewStep() {
		if (!selectedTemplateId || !stepName.trim()) return;
		savingStep = true;
		try {
			const nextOrder = selectedSteps.length > 0 ? Math.max(...selectedSteps.map((s) => s.sortOrder)) + 1 : 0;

			await templateStepStore.add({
				templateId: selectedTemplateId,
				name: stepName.trim(),
				description: stepDescription.trim() || null,
				stepType,
				trainingTypeId: stepType === 'training' ? stepTrainingTypeId : null,
				stages: stepType === 'paperwork' && stepStages.length > 0 ? stepStages : null,
				sortOrder: nextOrder
			});
			cancelAddStep();
		} finally {
			savingStep = false;
		}
	}

	async function saveEditStep() {
		if (!editingStepId || !stepName.trim()) return;
		savingStep = true;
		try {
			await templateStepStore.update(editingStepId, {
				name: stepName.trim(),
				description: stepDescription.trim() || null,
				stepType,
				trainingTypeId: stepType === 'training' ? stepTrainingTypeId : null,
				stages: stepType === 'paperwork' && stepStages.length > 0 ? stepStages : null
			});
			cancelEditStep();
		} finally {
			savingStep = false;
		}
	}

	async function deleteStep(id: string) {
		await templateStepStore.removeBool(id);
		confirmDelete = null;
		if (editingStepId === id) {
			cancelEditStep();
		}
	}

	async function moveStep(step: OnboardingTemplateStep, direction: 'up' | 'down') {
		const idx = selectedSteps.findIndex((s) => s.id === step.id);
		if (idx < 0) return;
		const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
		if (swapIdx < 0 || swapIdx >= selectedSteps.length) return;

		const other = selectedSteps[swapIdx];
		// Swap sort orders
		await templateStepStore.update(step.id, { sortOrder: other.sortOrder });
		await templateStepStore.update(other.id, { sortOrder: step.sortOrder });
	}

	// --- Stage management (for paperwork steps) ---
	function addStage() {
		if (!newStageName.trim()) return;
		stepStages = [...stepStages, newStageName.trim()];
		newStageName = '';
	}

	function removeStage(index: number) {
		stepStages = stepStages.filter((_, i) => i !== index);
	}

	function moveStage(index: number, direction: 'up' | 'down') {
		const newIndex = direction === 'up' ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= stepStages.length) return;
		const copy = [...stepStages];
		[copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
		stepStages = copy;
	}

	function handleStageKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addStage();
		}
	}

	function handleConfirmDelete() {
		if (!confirmDelete) return;
		if (confirmDelete.type === 'template') {
			return deleteTemplate(confirmDelete.id);
		} else {
			return deleteStep(confirmDelete.id);
		}
	}
</script>

<PageToolbar
	title="Manage Templates"
	breadcrumbs={[{ label: 'Onboarding', href: `/org/${org.orgId}/onboarding` }, { label: 'Manage Templates' }]}
/>

<div class="templates-layout">
	<!-- Left panel: Template list -->
	<div class="panel template-list-panel">
		<div class="panel-header">
			<h3 class="panel-title">Templates</h3>
			{#if canMutate}
				<button class="btn btn-primary btn-sm" onclick={() => (addingTemplate = true)} disabled={addingTemplate}>
					+ Add Template
				</button>
			{/if}
		</div>

		{#if addingTemplate}
			<div class="add-template-form">
				<input
					class="input"
					type="text"
					placeholder="Template name"
					bind:value={newTemplateName}
					onkeydown={(e) => e.key === 'Enter' && addTemplate()}
				/>
				<textarea class="input" placeholder="Description (optional)" rows="2" bind:value={newTemplateDescription}
				></textarea>
				<div class="form-actions">
					<button class="btn btn-secondary btn-sm" onclick={cancelAddTemplate}>Cancel</button>
					<button
						class="btn btn-primary btn-sm"
						onclick={addTemplate}
						disabled={!newTemplateName.trim() || savingTemplate}
					>
						{#if savingTemplate}<Spinner size={12} />{/if}
						Save
					</button>
				</div>
			</div>
		{/if}

		{#if templates.length === 0 && !addingTemplate}
			<EmptyState
				message="No templates yet. Create one to get started."
				actionLabel={canMutate ? '+ Add Template' : undefined}
				onAction={canMutate ? () => (addingTemplate = true) : undefined}
			/>
		{:else}
			<ul class="template-list" role="listbox" aria-label="Onboarding templates">
				{#each templates as template (template.id)}
					{@const stepCount = allSteps.filter((s) => s.templateId === template.id).length}
					<li
						class="template-item"
						class:selected={selectedTemplateId === template.id}
						role="option"
						aria-selected={selectedTemplateId === template.id}
						onclick={() => selectTemplate(template.id)}
						onkeydown={(e) => e.key === 'Enter' && selectTemplate(template.id)}
						tabindex="0"
					>
						{#if renamingTemplateId === template.id}
							<input
								class="input rename-input"
								type="text"
								bind:value={renameValue}
								onblur={commitRename}
								onkeydown={handleRenameKeydown}
								onclick={(e) => e.stopPropagation()}
							/>
						{:else}
							<div class="template-info">
								<span class="template-name">{template.name}</span>
								<span class="template-meta">
									{stepCount} step{stepCount !== 1 ? 's' : ''}
								</span>
							</div>
						{/if}

						{#if canMutate && renamingTemplateId !== template.id}
							<div
								class="template-actions"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => e.stopPropagation()}
								role="toolbar"
								tabindex="-1"
							>
								<button
									class="btn-ghost btn-icon"
									title="Rename"
									onclick={() => startRename(template)}
									aria-label="Rename template"
								>
									&#9998;
								</button>
								<button
									class="btn-ghost btn-icon btn-icon-danger"
									title="Delete"
									onclick={() =>
										(confirmDelete = {
											type: 'template',
											id: template.id,
											name: template.name
										})}
									aria-label="Delete template"
								>
									&#128465;
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Right panel: Step editor -->
	<div class="panel step-editor-panel">
		{#if !selectedTemplate}
			<div class="panel-placeholder">
				<p class="placeholder-text">Select a template to manage its steps</p>
			</div>
		{:else}
			<div class="panel-header">
				<h3 class="panel-title">{selectedTemplate.name} &mdash; Steps</h3>
				{#if canMutate}
					<button class="btn btn-primary btn-sm" onclick={startAddStep} disabled={addingStep}> + Add Step </button>
				{/if}
			</div>

			{#if selectedTemplate.description}
				<p class="template-description">{selectedTemplate.description}</p>
			{/if}

			{#if selectedSteps.length === 0 && !addingStep}
				<EmptyState
					message="No steps in this template yet."
					variant="simple"
					actionLabel={canMutate ? '+ Add Step' : undefined}
					onAction={canMutate ? startAddStep : undefined}
				/>
			{:else}
				<ul class="step-list">
					{#each selectedSteps as step, idx (step.id)}
						{#if editingStepId === step.id}
							<!-- Inline edit form -->
							<li class="step-item step-item-editing">
								{@render stepForm(saveEditStep, cancelEditStep, 'Save Changes')}
							</li>
						{:else}
							<li class="step-item">
								<div class="step-header">
									<div class="step-info">
										<span class="step-order">{idx + 1}.</span>
										<span class="step-name">{step.name}</span>
										<Badge label={STEP_TYPE_LABELS[step.stepType]} color={STEP_TYPE_COLORS[step.stepType]} />
									</div>
									{#if canMutate}
										<div class="step-actions">
											<button
												class="btn-ghost btn-icon"
												title="Move up"
												disabled={idx === 0}
												onclick={() => moveStep(step, 'up')}
												aria-label="Move step up"
											>
												&#9650;
											</button>
											<button
												class="btn-ghost btn-icon"
												title="Move down"
												disabled={idx === selectedSteps.length - 1}
												onclick={() => moveStep(step, 'down')}
												aria-label="Move step down"
											>
												&#9660;
											</button>
											<button
												class="btn-ghost btn-icon"
												title="Edit"
												onclick={() => startEditStep(step)}
												aria-label="Edit step"
											>
												&#9998;
											</button>
											<button
												class="btn-ghost btn-icon btn-icon-danger"
												title="Delete"
												onclick={() =>
													(confirmDelete = {
														type: 'step',
														id: step.id,
														name: step.name
													})}
												aria-label="Delete step"
											>
												&#128465;
											</button>
										</div>
									{/if}
								</div>
								{#if step.description}
									<p class="step-description">{step.description}</p>
								{/if}
								{#if step.stepType === 'paperwork' && step.stages && step.stages.length > 0}
									<div class="step-stages-preview">
										<span class="stages-label">Stages:</span>
										{#each step.stages as stage, stageIdx (stageIdx)}
											<Badge label={stage} variant="outlined" />
										{/each}
									</div>
								{/if}
								{#if step.stepType === 'training' && step.trainingTypeId}
									{@const tt = trainingTypes.find((t) => t.id === step.trainingTypeId)}
									{#if tt}
										<div class="step-training-preview">
											<span class="stages-label">Training:</span>
											<Badge label={tt.name} color={tt.color} />
										</div>
									{/if}
								{/if}
							</li>
						{/if}
					{/each}
				</ul>
			{/if}

			{#if addingStep}
				<div class="add-step-form">
					{@render stepForm(saveNewStep, cancelAddStep, 'Add Step')}
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Confirm delete dialog -->
{#if confirmDelete}
	<ConfirmDialog
		title="Delete {confirmDelete.type === 'template' ? 'Template' : 'Step'}"
		message="Are you sure you want to delete &quot;{confirmDelete.name}&quot;?{confirmDelete.type === 'template'
			? ' This will also delete all steps in this template.'
			: ''}"
		confirmLabel="Delete"
		variant="danger"
		onConfirm={handleConfirmDelete}
		onCancel={() => (confirmDelete = null)}
	/>
{/if}

<!-- Reusable step form snippet -->
{#snippet stepForm(onSave: () => void | Promise<void>, onCancel: () => void, saveLabel: string)}
	<div class="step-form">
		<div class="form-field">
			<label class="form-label" for="step-name">Name <span class="required">*</span></label>
			<input class="input" id="step-name" type="text" placeholder="Step name" bind:value={stepName} />
		</div>

		<div class="form-field">
			<label class="form-label" for="step-desc">Description</label>
			<textarea class="input" id="step-desc" placeholder="Optional description" rows="2" bind:value={stepDescription}
			></textarea>
		</div>

		<fieldset class="form-field">
			<legend class="form-label">Type</legend>
			<div class="type-options">
				{#each ['checkbox', 'paperwork', 'training'] as const as typeOption (typeOption)}
					<label class="type-option">
						<input type="radio" name="step-type" value={typeOption} bind:group={stepType} />
						<Badge label={STEP_TYPE_LABELS[typeOption]} color={STEP_TYPE_COLORS[typeOption]} />
					</label>
				{/each}
			</div>
		</fieldset>

		{#if stepType === 'training'}
			<div class="form-field">
				<label class="form-label" for="training-type-select">Training Type</label>
				<select class="input" id="training-type-select" bind:value={stepTrainingTypeId}>
					<option value={null}>-- Select training type --</option>
					{#each trainingTypes as tt (tt.id)}
						<option value={tt.id}>{tt.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if stepType === 'paperwork'}
			<fieldset class="form-field">
				<legend class="form-label">Stages</legend>
				<div class="stages-editor">
					{#each stepStages as stage, i (i)}
						<div class="stage-row">
							<span class="stage-name">{stage}</span>
							<div class="stage-actions">
								<button
									class="btn-ghost btn-icon btn-icon-sm"
									title="Move up"
									disabled={i === 0}
									onclick={() => moveStage(i, 'up')}>&#9650;</button
								>
								<button
									class="btn-ghost btn-icon btn-icon-sm"
									title="Move down"
									disabled={i === stepStages.length - 1}
									onclick={() => moveStage(i, 'down')}>&#9660;</button
								>
								<button
									class="btn-ghost btn-icon btn-icon-sm btn-icon-danger"
									title="Remove"
									onclick={() => removeStage(i)}>&#10005;</button
								>
							</div>
						</div>
					{/each}
					<div class="stage-add-row">
						<input
							class="input"
							type="text"
							placeholder="Add a stage"
							bind:value={newStageName}
							onkeydown={handleStageKeydown}
						/>
						<button class="btn btn-secondary btn-sm" onclick={addStage} disabled={!newStageName.trim()}> Add </button>
					</div>
				</div>
			</fieldset>
		{/if}

		<div class="form-actions">
			<button class="btn btn-secondary btn-sm" onclick={onCancel}>Cancel</button>
			<button class="btn btn-primary btn-sm" onclick={onSave} disabled={!stepName.trim() || savingStep}>
				{#if savingStep}<Spinner size={12} />{/if}
				{saveLabel}
			</button>
		</div>
	</div>
{/snippet}

<style>
	/* Layout */
	.templates-layout {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: var(--spacing-lg);
		padding: var(--spacing-lg);
		min-height: calc(100vh - 120px);
	}

	/* Panels */
	.panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.panel-title {
		font-family: var(--font-display);
		font-size: var(--font-size-base);
		font-weight: 500;
		color: var(--color-text);
		margin: 0;
	}

	.panel-placeholder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.placeholder-text {
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Template list */
	.template-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.template-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
		border: 1px solid transparent;
	}

	.template-item:hover {
		background: var(--color-surface-variant);
	}

	.template-item.selected {
		background: var(--color-primary-surface);
		border-color: var(--color-primary);
	}

	.template-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.template-name {
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.template-meta {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.template-actions {
		display: flex;
		gap: 2px;
		opacity: 0;
		transition: opacity var(--transition-fast);
	}

	.template-item:hover .template-actions {
		opacity: 1;
	}

	.template-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-md) 0;
		line-height: 1.4;
	}

	.rename-input {
		flex: 1;
		font-size: var(--font-size-sm);
	}

	/* Add template form */
	.add-template-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		margin-bottom: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		border: 1px dashed var(--color-border);
	}

	/* Step list */
	.step-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.step-item {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
	}

	.step-item-editing {
		border-color: var(--color-primary);
		background: var(--color-primary-surface);
	}

	.step-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.step-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		min-width: 0;
		flex: 1;
	}

	.step-order {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-weight: 600;
		min-width: 20px;
	}

	.step-name {
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.step-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin: var(--spacing-xs) 0 0 28px;
		line-height: 1.4;
	}

	.step-stages-preview,
	.step-training-preview {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-xs);
		margin-left: 28px;
		flex-wrap: wrap;
	}

	.stages-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.step-actions {
		display: flex;
		gap: 2px;
		flex-shrink: 0;
	}

	/* Step form */
	.step-form,
	.add-step-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.add-step-form {
		margin-top: var(--spacing-md);
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		border: 1px dashed var(--color-border);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		border: none;
		margin: 0;
		padding: 0;
	}

	.form-label {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.required {
		color: var(--color-danger);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-xs);
	}

	/* Type picker */
	.type-options {
		display: flex;
		gap: var(--spacing-sm);
	}

	.type-option {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		cursor: pointer;
	}

	.type-option input[type='radio'] {
		accent-color: var(--color-primary);
	}

	/* Stages editor */
	.stages-editor {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.stage-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.stage-name {
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.stage-actions {
		display: flex;
		gap: 2px;
	}

	.stage-add-row {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
	}

	.stage-add-row .input {
		flex: 1;
	}

	/* Button icons */
	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		font-size: var(--font-size-sm);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		background: transparent;
		border: none;
		cursor: pointer;
		transition:
			color var(--transition-fast),
			background var(--transition-fast);
	}

	.btn-icon:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.btn-icon:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.btn-icon-danger:hover {
		color: var(--color-danger);
	}

	.btn-icon-sm {
		width: 24px;
		height: 24px;
		font-size: var(--font-size-xs);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.templates-layout {
			grid-template-columns: 1fr;
			gap: var(--spacing-md);
			padding: var(--spacing-md);
		}
	}
</style>
