<script lang="ts">
	import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction, WorkspaceToolbarNavItem } from '$lib/components/ui/workspace-toolbar';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as TypeWorkspace from '$lib/components/ui/type-workspace';
	import * as Select from '$lib/components/ui/select';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { duplicateTemplate, templateStore, templateStepStore } from '$features/onboarding/stores/templates.svelte';
	import type {
		OnboardingTemplate,
		OnboardingTemplateStep,
		OnboardingStepType
	} from '$features/onboarding/onboarding.types';
	import type { TrainingType } from '$features/training/training.types';

	let { data } = $props();

	const org = getOrgContext();

	$effect(() => {
		templateStore.load(data.templates, data.orgId);
		templateStepStore.load(data.templateSteps, data.orgId);
	});

	let selectedTemplateId: string | null = $state(null);
	let creatingTemplate = $state(false);
	let editingTemplate = $state(false);
	let mobileDetailOpen = $state(false);
	let templateName = $state('');
	let templateDescription = $state('');

	let addingStep = $state(false);
	let editingStepId: string | null = $state(null);
	let stepName = $state('');
	let stepDescription = $state('');
	let stepType: OnboardingStepType = $state('checkbox');
	let stepTrainingTypeId: string | null = $state(null);
	let stepStages: string[] = $state([]);
	let newStageName = $state('');

	let confirmDelete: { type: 'template' | 'step'; id: string; name: string } | null = $state(null);
	let savingTemplate = $state(false);
	let savingStep = $state(false);
	let duplicatingTemplateId: string | null = $state(null);

	const templates = $derived(templateStore.items);
	const allSteps = $derived(templateStepStore.items);
	const orderedTemplates = $derived([...templates].sort((a, b) => a.name.localeCompare(b.name)));
	const selectedTemplate = $derived(
		creatingTemplate
			? null
			: (selectedTemplateId ? (templateStore.getById(selectedTemplateId) ?? null) : null) || orderedTemplates[0] || null
	);
	const selectedTemplateSteps = $derived(
		selectedTemplate
			? allSteps.filter((step) => step.templateId === selectedTemplate.id).sort((a, b) => a.sortOrder - b.sortOrder)
			: []
	);

	const trainingTypes: TrainingType[] = $derived(data.trainingTypes ?? []);
	const stepTrainingTypeLabel = $derived(
		trainingTypes.find((type) => type.id === stepTrainingTypeId)?.name ?? 'Select training type'
	);

	const configureAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.onboarding.configureWorkflows, { kind: 'unscoped' })
	);
	const canMutate = $derived(configureAffordance.visible && !configureAffordance.disabled);
	const templateActionDisabled = $derived(
		creatingTemplate || editingTemplate || addingStep || !!editingStepId || !!duplicatingTemplateId
	);
	const onboardingNavItems = $derived<WorkspaceToolbarNavItem[]>([
		{ label: 'Onboarding', href: `/org/${org.orgId}/onboarding` }
	]);
	const templateToolbarActions = $derived.by<WorkspaceToolbarAction[]>(() => {
		if (!canMutate) return [];
		return [
			{
				id: 'add-template',
				label: 'Add Template',
				onclick: startCreateTemplate,
				disabled: templateActionDisabled,
				priority: 'critical',
				overflow: 'never',
				variant: 'primary'
			}
		];
	});

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

	function getTemplateStepCount(templateId: string): number {
		return allSteps.filter((step) => step.templateId === templateId).length;
	}

	function getTemplateSummary(template: OnboardingTemplate): string {
		const stepCount = getTemplateStepCount(template.id);
		return `${stepCount} step${stepCount === 1 ? '' : 's'}`;
	}

	function selectTemplate(id: string) {
		if (templateActionDisabled) return;
		selectedTemplateId = id;
		mobileDetailOpen = true;
		cancelAddStep();
		cancelEditStep();
	}

	function startCreateTemplate() {
		if (!canMutate || templateActionDisabled) return;
		cancelAddStep();
		cancelEditStep();
		selectedTemplateId = null;
		templateName = '';
		templateDescription = '';
		creatingTemplate = true;
		editingTemplate = false;
		mobileDetailOpen = true;
	}

	function startEditTemplate() {
		if (!selectedTemplate || !canMutate || templateActionDisabled) return;
		cancelAddStep();
		cancelEditStep();
		selectedTemplateId = selectedTemplate.id;
		templateName = selectedTemplate.name;
		templateDescription = selectedTemplate.description ?? '';
		creatingTemplate = false;
		editingTemplate = true;
		mobileDetailOpen = true;
	}

	function cancelTemplateEdit() {
		const wasCreating = creatingTemplate;
		creatingTemplate = false;
		editingTemplate = false;
		savingTemplate = false;
		templateName = '';
		templateDescription = '';
		if (wasCreating) mobileDetailOpen = false;
	}

	async function saveTemplate() {
		if (!templateName.trim() || savingTemplate) return;
		savingTemplate = true;
		try {
			if (creatingTemplate) {
				const created = await templateStore.add({
					orgId: data.orgId,
					name: templateName.trim(),
					description: templateDescription.trim() || null,
					createdAt: new Date().toISOString()
				});
				if (created) selectedTemplateId = created.id;
				creatingTemplate = false;
				mobileDetailOpen = true;
			} else if (selectedTemplateId) {
				await templateStore.update(selectedTemplateId, {
					name: templateName.trim(),
					description: templateDescription.trim() || null
				});
				editingTemplate = false;
			}
		} finally {
			savingTemplate = false;
		}
	}

	async function deleteTemplate(id: string) {
		await templateStore.removeBool(id);
		if (selectedTemplateId === id) selectedTemplateId = null;
		mobileDetailOpen = false;
		confirmDelete = null;
	}

	async function duplicateSelectedTemplate(template: OnboardingTemplate) {
		if (!canMutate || templateActionDisabled) return;
		duplicatingTemplateId = template.id;
		try {
			const duplicate = await duplicateTemplate(template.id);
			if (duplicate) {
				selectedTemplateId = duplicate.template.id;
				mobileDetailOpen = true;
			}
		} finally {
			duplicatingTemplateId = null;
		}
	}

	function resetStepForm() {
		stepName = '';
		stepDescription = '';
		stepType = 'checkbox';
		stepTrainingTypeId = null;
		stepStages = [];
		newStageName = '';
	}

	function startAddStep() {
		if (!selectedTemplate || !canMutate || creatingTemplate || editingTemplate) return;
		cancelEditStep();
		resetStepForm();
		addingStep = true;
	}

	function cancelAddStep() {
		addingStep = false;
		resetStepForm();
	}

	function startEditStep(step: OnboardingTemplateStep) {
		if (creatingTemplate || editingTemplate) return;
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
		if (!selectedTemplate || !stepName.trim()) return;
		savingStep = true;
		try {
			const nextOrder =
				selectedTemplateSteps.length > 0 ? Math.max(...selectedTemplateSteps.map((step) => step.sortOrder)) + 1 : 0;

			await templateStepStore.add({
				templateId: selectedTemplate.id,
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
		if (editingStepId === id) cancelEditStep();
	}

	async function moveStep(step: OnboardingTemplateStep, direction: 'up' | 'down') {
		const index = selectedTemplateSteps.findIndex((item) => item.id === step.id);
		if (index < 0) return;
		const swapIndex = direction === 'up' ? index - 1 : index + 1;
		if (swapIndex < 0 || swapIndex >= selectedTemplateSteps.length) return;

		const other = selectedTemplateSteps[swapIndex];
		await Promise.all([
			templateStepStore.update(step.id, { sortOrder: other.sortOrder }),
			templateStepStore.update(other.id, { sortOrder: step.sortOrder })
		]);
	}

	function addStage() {
		if (!newStageName.trim()) return;
		stepStages = [...stepStages, newStageName.trim()];
		newStageName = '';
	}

	function removeStage(index: number) {
		stepStages = stepStages.filter((_, itemIndex) => itemIndex !== index);
	}

	function moveStage(index: number, direction: 'up' | 'down') {
		const newIndex = direction === 'up' ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= stepStages.length) return;
		const copy = [...stepStages];
		[copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
		stepStages = copy;
	}

	function handleStageKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			addStage();
		}
	}

	function handleConfirmDelete() {
		if (!confirmDelete) return;
		if (confirmDelete.type === 'template') return deleteTemplate(confirmDelete.id);
		return deleteStep(confirmDelete.id);
	}

	function closeMobileDetail() {
		if (creatingTemplate || editingTemplate) cancelTemplateEdit();
		mobileDetailOpen = false;
	}
</script>

<TypeWorkspace.Root aria-label="Onboarding template management workspace" class="overflow-hidden">
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

	<TypeWorkspace.Layout>
		<TypeWorkspace.List mobileHidden={mobileDetailOpen || creatingTemplate || editingTemplate}>
			{#if orderedTemplates.length === 0 && !creatingTemplate}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No templates yet.</Empty.Title>
						<Empty.Description>Create one to get started.</Empty.Description>
					</Empty.Header>
					{#if canMutate}
						<Empty.Content>
							<Button variant="outline" size="sm" type="button" onclick={startCreateTemplate}>Add Template</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				<TypeWorkspace.ItemList role="listbox" aria-label="Onboarding templates">
					{#each orderedTemplates as template (template.id)}
						<TypeWorkspace.ListItem
							selected={selectedTemplate?.id === template.id && !creatingTemplate}
							title={template.name}
							description={getTemplateSummary(template)}
							onselect={() => selectTemplate(template.id)}
							disabled={templateActionDisabled}
							role="option"
							aria-selected={selectedTemplate?.id === template.id && !creatingTemplate}
						>
							{#snippet actions()}
								{#if canMutate && !templateActionDisabled}
									<Button
										variant="outline"
										size="icon"
										type="button"
										title="Edit template"
										onclick={() => {
											selectedTemplateId = template.id;
											startEditTemplate();
										}}
										aria-label={`Edit ${template.name}`}
									>
										<Pencil aria-hidden="true" />
									</Button>
									<Button
										variant="outline"
										size="icon"
										type="button"
										title="Duplicate template"
										onclick={() => duplicateSelectedTemplate(template)}
										aria-label={`Duplicate ${template.name}`}
									>
										<Copy aria-hidden="true" />
									</Button>
									<Button
										variant="outline"
										size="icon"
										type="button"
										title="Delete template"
										onclick={() =>
											(confirmDelete = {
												type: 'template',
												id: template.id,
												name: template.name
											})}
										aria-label={`Delete ${template.name}`}
									>
										<Trash2 aria-hidden="true" />
									</Button>
								{/if}
							{/snippet}
						</TypeWorkspace.ListItem>
					{/each}
				</TypeWorkspace.ItemList>
			{/if}
		</TypeWorkspace.List>

		<TypeWorkspace.Detail
			mobileHidden={!mobileDetailOpen && !creatingTemplate && !editingTemplate}
			class={creatingTemplate || editingTemplate || selectedTemplate ? 'flex flex-col overflow-hidden pr-0' : undefined}
		>
			{#if creatingTemplate || editingTemplate || selectedTemplate}
				<TypeWorkspace.MobileBack onclick={closeMobileDetail}>Templates</TypeWorkspace.MobileBack>
			{/if}

			{#if creatingTemplate || editingTemplate}
				<div class="grid min-h-0 flex-1 gap-6 overflow-y-auto pr-2 pb-8 [scrollbar-gutter:stable]">
					<TypeWorkspace.DetailHeader
						title={creatingTemplate ? 'New Onboarding Template' : 'Edit Onboarding Template'}
					/>

					<TypeWorkspace.Form title="Basics">
						<Field.Root>
							<Field.Label for="template-name">Name</Field.Label>
							<Input id="template-name" type="text" bind:value={templateName} placeholder="e.g. Standard Arrival" />
						</Field.Root>
						<Field.Root>
							<Field.Label for="template-description">Description</Field.Label>
							<Textarea
								id="template-description"
								rows={3}
								bind:value={templateDescription}
								placeholder="Optional template description"
							/>
						</Field.Root>
					</TypeWorkspace.Form>
				</div>

				<TypeWorkspace.Actions class="shrink-0 bg-background py-3 pr-2">
					{#if !creatingTemplate && selectedTemplate && canMutate}
						<Button
							variant="destructive"
							size="sm"
							type="button"
							onclick={() =>
								(confirmDelete = { type: 'template', id: selectedTemplate.id, name: selectedTemplate.name })}
						>
							<Trash2 aria-hidden="true" />
							Delete
						</Button>
					{/if}
					<TypeWorkspace.ActionSpacer />
					<Button variant="outline" size="sm" type="button" onclick={cancelTemplateEdit}>Cancel</Button>
					<Button size="sm" type="button" onclick={saveTemplate} disabled={!templateName.trim() || savingTemplate}>
						{#if savingTemplate}<Spinner />{/if}
						{creatingTemplate ? 'Create' : 'Save'}
					</Button>
				</TypeWorkspace.Actions>
			{:else if selectedTemplate}
				<div class="min-h-0 flex-1 overflow-y-auto pr-2 pb-8 [scrollbar-gutter:stable]">
					<TypeWorkspace.Stack>
						<TypeWorkspace.DetailHeader title={selectedTemplate.name}>
							{#snippet actions()}
								{#if canMutate}
									<Button variant="outline" size="sm" type="button" onclick={startEditTemplate}>Edit</Button>
								{/if}
							{/snippet}
						</TypeWorkspace.DetailHeader>

						<TypeWorkspace.Description>
							{selectedTemplate.description ?? 'No description has been added for this onboarding template.'}
						</TypeWorkspace.Description>

						<TypeWorkspace.FactList>
							<TypeWorkspace.Impact label="Steps">
								{selectedTemplateSteps.length} configured
							</TypeWorkspace.Impact>
							<TypeWorkspace.Impact label="Created">
								{new Date(selectedTemplate.createdAt).toLocaleDateString()}
							</TypeWorkspace.Impact>
						</TypeWorkspace.FactList>

						<TypeWorkspace.Form title="Steps">
							{#if selectedTemplateSteps.length === 0 && !addingStep}
								<button
									type="button"
									class="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-card/70 p-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
									onclick={startAddStep}
									disabled={!canMutate}
								>
									<Plus class="size-4" aria-hidden="true" />
									<span class="font-medium">Add first step</span>
								</button>
							{:else}
								<div class="grid overflow-hidden rounded-md border border-border bg-card">
									{#each selectedTemplateSteps as step, index (step.id)}
										<div class="border-b border-border/70 p-3 last:border-b-0">
											{#if editingStepId === step.id}
												{@render stepForm(saveEditStep, cancelEditStep, 'Save Changes')}
											{:else}
												<div class="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
													<div class="flex min-w-0 flex-1 items-center gap-2 max-sm:flex-wrap">
														<span class="min-w-5 font-mono text-xs font-semibold text-muted-foreground">
															{index + 1}.
														</span>
														<span class="truncate text-sm font-semibold text-foreground">{step.name}</span>
														<Badge variant={STEP_TYPE_VARIANTS[step.stepType]}>{STEP_TYPE_LABELS[step.stepType]}</Badge>
													</div>
													{#if canMutate && !addingStep}
														<div class="flex shrink-0 gap-1">
															<Button
																variant="outline"
																size="icon"
																type="button"
																title="Move up"
																disabled={index === 0}
																onclick={() => moveStep(step, 'up')}
																aria-label={`Move ${step.name} up`}
															>
																<ArrowUp aria-hidden="true" />
															</Button>
															<Button
																variant="outline"
																size="icon"
																type="button"
																title="Move down"
																disabled={index === selectedTemplateSteps.length - 1}
																onclick={() => moveStep(step, 'down')}
																aria-label={`Move ${step.name} down`}
															>
																<ArrowDown aria-hidden="true" />
															</Button>
															<Button
																variant="outline"
																size="icon"
																type="button"
																title="Edit"
																onclick={() => startEditStep(step)}
																aria-label={`Edit ${step.name}`}
															>
																<Pencil aria-hidden="true" />
															</Button>
															<Button
																variant="outline"
																size="icon"
																type="button"
																title="Delete"
																onclick={() =>
																	(confirmDelete = {
																		type: 'step',
																		id: step.id,
																		name: step.name
																	})}
																aria-label={`Delete ${step.name}`}
															>
																<Trash2 aria-hidden="true" />
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
														{#each step.stages as stage, stageIndex (stageIndex)}
															<Badge variant="outline">{stage}</Badge>
														{/each}
													</div>
												{/if}
												{#if step.stepType === 'training' && step.trainingTypeId}
													{@const trainingType = trainingTypes.find((type) => type.id === step.trainingTypeId)}
													{#if trainingType}
														<div class="mt-2 ml-7 flex flex-wrap items-center gap-1">
															<span class="text-sm text-muted-foreground">Training:</span>
															<Badge variant="outline">{trainingType.name}</Badge>
														</div>
													{/if}
												{/if}
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							{#if addingStep}
								<TypeWorkspace.Choice>
									{@render stepForm(saveNewStep, cancelAddStep, 'Add Step')}
								</TypeWorkspace.Choice>
							{/if}
						</TypeWorkspace.Form>
					</TypeWorkspace.Stack>
				</div>

				{#if canMutate}
					<TypeWorkspace.Actions class="shrink-0 bg-background py-3 pr-2">
						<Button
							variant="destructive"
							size="sm"
							type="button"
							onclick={() =>
								(confirmDelete = { type: 'template', id: selectedTemplate.id, name: selectedTemplate.name })}
						>
							Delete Template
						</Button>
						<TypeWorkspace.ActionSpacer />
						<Button
							variant="outline"
							size="sm"
							type="button"
							onclick={() => duplicateSelectedTemplate(selectedTemplate)}
							disabled={duplicatingTemplateId === selectedTemplate.id}
						>
							{#if duplicatingTemplateId === selectedTemplate.id}
								<Spinner class="size-3" />
							{:else}
								<Copy aria-hidden="true" />
							{/if}
							Duplicate Template
						</Button>
						<Button
							variant="outline"
							size="sm"
							type="button"
							onclick={startAddStep}
							disabled={addingStep || !!editingStepId}
						>
							<Plus aria-hidden="true" />
							Add Step
						</Button>
					</TypeWorkspace.Actions>
				{/if}
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>Select a template</Empty.Title>
						<Empty.Description>Choose a template from the list to view details.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</TypeWorkspace.Detail>
	</TypeWorkspace.Layout>
</TypeWorkspace.Root>

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

{#snippet stepForm(onSave: () => void | Promise<void>, onCancel: () => void, saveLabel: string)}
	<div class="grid gap-4">
		<TypeWorkspace.Form title="Step Basics">
			<Field.Root>
				<Field.Label for="step-name">Name</Field.Label>
				<Input id="step-name" type="text" placeholder="Step name" bind:value={stepName} />
			</Field.Root>

			<Field.Root>
				<Field.Label for="step-description">Description</Field.Label>
				<Textarea id="step-description" placeholder="Optional description" rows={2} bind:value={stepDescription} />
			</Field.Root>
		</TypeWorkspace.Form>

		<TypeWorkspace.Form title="Type">
			<RadioGroup.Root bind:value={stepType} class="sm:grid-cols-3">
				{#each ['checkbox', 'paperwork', 'training'] as const as typeOption (typeOption)}
					<TypeWorkspace.Choice>
						<label for="step-type-{typeOption}" class="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
							<RadioGroup.Item
								id="step-type-{typeOption}"
								value={typeOption}
								aria-label={STEP_TYPE_LABELS[typeOption]}
							/>
							<Badge variant={STEP_TYPE_VARIANTS[typeOption]}>{STEP_TYPE_LABELS[typeOption]}</Badge>
						</label>
					</TypeWorkspace.Choice>
				{/each}
			</RadioGroup.Root>

			{#if stepType === 'training'}
				<Field.Root>
					<Field.Label for="training-type-select">Training Type</Field.Label>
					<Select.Root
						type="single"
						value={stepTrainingTypeId ?? ''}
						onValueChange={(value) => (stepTrainingTypeId = value || null)}
					>
						<Select.Trigger id="training-type-select" class="w-full sm:w-fit sm:min-w-56">
							{stepTrainingTypeLabel}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="" label="Select training type" />
							{#each trainingTypes as trainingType (trainingType.id)}
								<Select.Item value={trainingType.id} label={trainingType.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Root>
			{/if}
		</TypeWorkspace.Form>

		{#if stepType === 'paperwork'}
			<TypeWorkspace.Form title="Stages">
				<div class="grid gap-2">
					{#each stepStages as stage, index (index)}
						<div class="flex items-center justify-between rounded-md border bg-card p-2">
							<span class="text-sm text-foreground">{stage}</span>
							<div class="flex gap-1">
								<Button
									variant="outline"
									size="icon"
									type="button"
									title="Move up"
									disabled={index === 0}
									onclick={() => moveStage(index, 'up')}
									aria-label={`Move ${stage} up`}
								>
									<ArrowUp aria-hidden="true" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									type="button"
									title="Move down"
									disabled={index === stepStages.length - 1}
									onclick={() => moveStage(index, 'down')}
									aria-label={`Move ${stage} down`}
								>
									<ArrowDown aria-hidden="true" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									type="button"
									title="Remove"
									onclick={() => removeStage(index)}
									aria-label={`Remove ${stage}`}
								>
									<Trash2 aria-hidden="true" />
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
						<Button variant="outline" size="sm" type="button" onclick={addStage} disabled={!newStageName.trim()}>
							Add
						</Button>
					</div>
				</div>
			</TypeWorkspace.Form>
		{/if}

		<TypeWorkspace.Actions>
			<TypeWorkspace.ActionSpacer />
			<Button variant="outline" size="sm" type="button" onclick={onCancel}>Cancel</Button>
			<Button size="sm" type="button" onclick={onSave} disabled={!stepName.trim() || savingStep}>
				{#if savingStep}<Spinner class="size-3" />{/if}
				{saveLabel}
			</Button>
		</TypeWorkspace.Actions>
	</div>
{/snippet}
