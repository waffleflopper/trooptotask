<script lang="ts">
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction, WorkspaceToolbarNavItem } from '$lib/components/ui/workspace-toolbar';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { templateStore, templateStepStore } from '$features/onboarding/stores/templates.svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
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

	const configureAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.onboarding.configureWorkflows, { kind: 'unscoped' })
	);
	const canMutate = $derived(configureAffordance.visible && !configureAffordance.disabled);
	const onboardingNavItems = $derived<WorkspaceToolbarNavItem[]>([
		{ label: 'Onboarding', href: `/org/${org.orgId}/onboarding` }
	]);
	const templateToolbarActions = $derived.by<WorkspaceToolbarAction[]>(() => {
		if (!canMutate) return [];
		return [
			{
				id: 'add-template',
				label: 'Add Template',
				onclick: () => (addingTemplate = true),
				disabled: addingTemplate,
				priority: 'critical',
				overflow: 'never',
				variant: 'primary'
			}
		];
	});

	// --- Step type config ---
	const STEP_TYPE_VARIANTS: Record<OnboardingStepType, BadgeVariant> = {
		checkbox: 'secondary',
		paperwork: 'warning',
		training: 'info'
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

<div class="flex min-h-[calc(100vh-120px)] flex-col gap-3 bg-background p-6 max-sm:p-2">
	<WorkspaceToolbar.Root ariaLabel="Onboarding template controls">
		<WorkspaceToolbar.Group label="Onboarding sections">
			<WorkspaceToolbar.Nav ariaLabel="Onboarding sections" items={onboardingNavItems} />
		</WorkspaceToolbar.Group>

		{#if templateToolbarActions.length > 0}
			<WorkspaceToolbar.Group label="Onboarding template actions" zone="actions">
				<WorkspaceToolbar.Actions
					actions={templateToolbarActions}
					ariaLabel="Onboarding template actions"
					overflowAriaLabel="More onboarding template actions"
				/>
			</WorkspaceToolbar.Group>
		{/if}
	</WorkspaceToolbar.Root>

	<div class="grid min-h-0 grid-cols-[320px_1fr] gap-3 max-[820px]:grid-cols-1">
		<!-- Left panel: Template list -->
		<div class="flex flex-col rounded-lg border bg-card p-3">
			<div class="mb-3 flex items-start justify-between gap-2 border-b pb-2">
				<div class="flex flex-col gap-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-primary">Library</p>
					<h3 class="text-lg font-semibold tracking-tight">Templates</h3>
				</div>
			</div>

			{#if addingTemplate}
				<div class="mb-2 flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
					<Input
						type="text"
						placeholder="Template name"
						bind:value={newTemplateName}
						onkeydown={(e) => e.key === 'Enter' && addTemplate()}
					/>
					<Textarea placeholder="Description (optional)" rows={2} bind:value={newTemplateDescription}></Textarea>
					<div class="mt-1 flex justify-end gap-2">
						<Button variant="outline" size="sm" onclick={cancelAddTemplate}>Cancel</Button>
						<Button size="sm" onclick={addTemplate} disabled={!newTemplateName.trim() || savingTemplate}>
							{#if savingTemplate}<Spinner class="size-3" />{/if}
							Save
						</Button>
					</div>
				</div>
			{/if}

			{#if templates.length === 0 && !addingTemplate}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No templates yet.</Empty.Title>
						<Empty.Description>Create one to get started.</Empty.Description>
					</Empty.Header>
					{#if canMutate}
						<Empty.Content>
							<Button variant="outline" size="sm" onclick={() => (addingTemplate = true)}>Add Template</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				<ul class="m-0 flex list-none flex-col gap-2 p-0" role="listbox" aria-label="Onboarding templates">
					{#each templates as template (template.id)}
						{@const stepCount = allSteps.filter((s) => s.templateId === template.id).length}
						<li
							class={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted ${
								selectedTemplateId === template.id ? 'border-primary bg-primary/10' : 'bg-card'
							}`}
							role="option"
							aria-selected={selectedTemplateId === template.id}
							onclick={() => selectTemplate(template.id)}
							onkeydown={(e) => e.key === 'Enter' && selectTemplate(template.id)}
							tabindex="0"
						>
							{#if renamingTemplateId === template.id}
								<Input
									class="flex-1 text-sm"
									type="text"
									bind:value={renameValue}
									onblur={commitRename}
									onkeydown={handleRenameKeydown}
									onclick={(e) => e.stopPropagation()}
								/>
							{:else}
								<div class="flex min-w-0 flex-1 flex-col gap-1">
									<span class="truncate font-medium text-foreground">{template.name}</span>
									<span class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
										{stepCount} step{stepCount !== 1 ? 's' : ''}
									</span>
								</div>
							{/if}

							{#if canMutate && renamingTemplateId !== template.id}
								<div
									class="flex gap-0.5 opacity-100"
									onclick={(e) => e.stopPropagation()}
									onkeydown={(e) => e.stopPropagation()}
									role="toolbar"
									tabindex="-1"
								>
									<Button
										variant="ghost"
										size="icon-sm"
										title="Rename"
										onclick={() => startRename(template)}
										aria-label="Rename template"
									>
										<PencilIcon />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										class="text-destructive hover:text-destructive"
										title="Delete"
										onclick={() =>
											(confirmDelete = {
												type: 'template',
												id: template.id,
												name: template.name
											})}
										aria-label="Delete template"
									>
										<Trash2Icon />
									</Button>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Right panel: Step editor -->
		<div class="flex flex-col rounded-lg border bg-card p-3">
			{#if !selectedTemplate}
				<div class="flex flex-1 items-center justify-center">
					<p class="text-sm text-muted-foreground">Select a template to manage its steps</p>
				</div>
			{:else}
				<div class="mb-3 flex items-start justify-between gap-2 border-b pb-2 max-sm:flex-col max-sm:items-stretch">
					<div class="flex flex-col gap-1">
						<p class="text-xs font-semibold uppercase tracking-wider text-primary">Template Editor</p>
						<h3 class="text-lg font-semibold tracking-tight">{selectedTemplate.name} - Steps</h3>
					</div>
					{#if canMutate}
						<Button size="sm" onclick={startAddStep} disabled={addingStep}>Add Step</Button>
					{/if}
				</div>

				{#if selectedTemplate.description}
					<p class="mb-3 text-sm leading-6 text-muted-foreground">{selectedTemplate.description}</p>
				{/if}

				{#if selectedSteps.length === 0 && !addingStep}
					<Empty.Root>
						<Empty.Header>
							<Empty.Title>No steps in this template yet.</Empty.Title>
						</Empty.Header>
						{#if canMutate}
							<Empty.Content>
								<Button variant="outline" size="sm" onclick={startAddStep}>Add Step</Button>
							</Empty.Content>
						{/if}
					</Empty.Root>
				{:else}
					<ul class="m-0 flex list-none flex-col gap-2 p-0">
						{#each selectedSteps as step, idx (step.id)}
							{#if editingStepId === step.id}
								<!-- Inline edit form -->
								<li class="rounded-lg border border-primary bg-primary/10 p-3">
									{@render stepForm(saveEditStep, cancelEditStep, 'Save Changes')}
								</li>
							{:else}
								<li class="rounded-lg border bg-card p-3">
									<div class="flex items-center justify-between gap-2 max-sm:flex-col max-sm:items-stretch">
										<div class="flex min-w-0 flex-1 items-center gap-2 max-sm:flex-wrap">
											<span class="min-w-5 font-mono text-xs font-semibold text-primary">{idx + 1}.</span>
											<span class="truncate font-medium text-foreground">{step.name}</span>
											<Badge variant={STEP_TYPE_VARIANTS[step.stepType]}>{STEP_TYPE_LABELS[step.stepType]}</Badge>
										</div>
										{#if canMutate}
											<div class="flex shrink-0 gap-0.5">
												<Button
													variant="ghost"
													size="icon-sm"
													title="Move up"
													disabled={idx === 0}
													onclick={() => moveStep(step, 'up')}
													aria-label="Move step up"
												>
													<ChevronUpIcon />
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													title="Move down"
													disabled={idx === selectedSteps.length - 1}
													onclick={() => moveStep(step, 'down')}
													aria-label="Move step down"
												>
													<ChevronDownIcon />
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													title="Edit"
													onclick={() => startEditStep(step)}
													aria-label="Edit step"
												>
													<PencilIcon />
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													class="text-destructive hover:text-destructive"
													title="Delete"
													onclick={() =>
														(confirmDelete = {
															type: 'step',
															id: step.id,
															name: step.name
														})}
													aria-label="Delete step"
												>
													<Trash2Icon />
												</Button>
											</div>
										{/if}
									</div>
									{#if step.description}
										<p class="mt-2 ml-7 text-sm leading-5 text-muted-foreground">{step.description}</p>
									{/if}
									{#if step.stepType === 'paperwork' && step.stages && step.stages.length > 0}
										<div class="mt-2 ml-7 flex flex-wrap items-center gap-1">
											<span class="text-sm text-muted-foreground">Stages:</span>
											{#each step.stages as stage, stageIdx (stageIdx)}
												<Badge variant="outline">{stage}</Badge>
											{/each}
										</div>
									{/if}
									{#if step.stepType === 'training' && step.trainingTypeId}
										{@const tt = trainingTypes.find((t) => t.id === step.trainingTypeId)}
										{#if tt}
											<div class="mt-2 ml-7 flex flex-wrap items-center gap-1">
												<span class="text-sm text-muted-foreground">Training:</span>
												<Badge variant="outline">{tt.name}</Badge>
											</div>
										{/if}
									{/if}
								</li>
							{/if}
						{/each}
					</ul>
				{/if}

				{#if addingStep}
					<div class="mt-3 flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
						{@render stepForm(saveNewStep, cancelAddStep, 'Add Step')}
					</div>
				{/if}
			{/if}
		</div>
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
	<div class="flex flex-col gap-2">
		<div class="flex flex-col gap-1.5">
			<Label for="step-name">Name <span class="text-destructive">*</span></Label>
			<Input id="step-name" type="text" placeholder="Step name" bind:value={stepName} />
		</div>

		<div class="flex flex-col gap-1.5">
			<Label for="step-desc">Description</Label>
			<Textarea id="step-desc" placeholder="Optional description" rows={2} bind:value={stepDescription}></Textarea>
		</div>

		<fieldset class="m-0 flex flex-col gap-1.5 border-0 p-0">
			<legend class="text-sm font-medium">Type</legend>
			<div class="flex flex-wrap gap-2">
				{#each ['checkbox', 'paperwork', 'training'] as const as typeOption (typeOption)}
					<label class="flex cursor-pointer items-center gap-1">
						<input type="radio" name="step-type" value={typeOption} bind:group={stepType} />
						<Badge variant={STEP_TYPE_VARIANTS[typeOption]}>{STEP_TYPE_LABELS[typeOption]}</Badge>
					</label>
				{/each}
			</div>
		</fieldset>

		{#if stepType === 'training'}
			<div class="flex flex-col gap-1.5">
				<Label for="training-type-select">Training Type</Label>
				<NativeSelect
					id="training-type-select"
					value={stepTrainingTypeId ?? ''}
					onchange={(e) => (stepTrainingTypeId = (e.target as HTMLSelectElement).value || null)}
				>
					<option value="">Select training type</option>
					{#each trainingTypes as tt (tt.id)}
						<option value={tt.id}>{tt.name}</option>
					{/each}
				</NativeSelect>
			</div>
		{/if}

		{#if stepType === 'paperwork'}
			<fieldset class="m-0 flex flex-col gap-1.5 border-0 p-0">
				<legend class="text-sm font-medium">Stages</legend>
				<div class="flex flex-col gap-1">
					{#each stepStages as stage, i (i)}
						<div class="flex items-center justify-between rounded-md border bg-card p-2">
							<span class="text-sm text-foreground">{stage}</span>
							<div class="flex gap-0.5">
								<Button
									variant="ghost"
									size="icon-xs"
									title="Move up"
									disabled={i === 0}
									onclick={() => moveStage(i, 'up')}
								>
									<ChevronUpIcon />
								</Button>
								<Button
									variant="ghost"
									size="icon-xs"
									title="Move down"
									disabled={i === stepStages.length - 1}
									onclick={() => moveStage(i, 'down')}
								>
									<ChevronDownIcon />
								</Button>
								<Button
									variant="ghost"
									size="icon-xs"
									class="text-destructive hover:text-destructive"
									title="Remove"
									onclick={() => removeStage(i)}
								>
									<Trash2Icon />
								</Button>
							</div>
						</div>
					{/each}
					<div class="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
						<Input
							class="flex-1"
							type="text"
							placeholder="Add a stage"
							bind:value={newStageName}
							onkeydown={handleStageKeydown}
						/>
						<Button variant="outline" size="sm" onclick={addStage} disabled={!newStageName.trim()}>Add</Button>
					</div>
				</div>
			</fieldset>
		{/if}

		<div class="mt-1 flex justify-end gap-2 max-sm:flex-col">
			<Button variant="outline" size="sm" onclick={onCancel}>Cancel</Button>
			<Button size="sm" onclick={onSave} disabled={!stepName.trim() || savingStep}>
				{#if savingStep}<Spinner class="size-3" />{/if}
				{saveLabel}
			</Button>
		</div>
	</div>
{/snippet}
