<script lang="ts">
	import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import { untrack } from 'svelte';
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
	import {
		createOnboardingTemplateWorkspace,
		type OnboardingTemplateDeleteTarget
	} from '$features/onboarding/stores/onboardingTemplate.svelte';
	import type { OnboardingStepType } from '$features/onboarding/onboarding.types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const org = getOrgContext();
	const orgId = $derived(org.orgId);
	const orgUrlSegment = $derived(org.orgUrlSegment ?? data.orgId ?? org.orgId);

	const configureAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.onboarding.configureWorkflows, { kind: 'unscoped' })
	);
	const canMutate = $derived(configureAffordance.visible && !configureAffordance.disabled);
	const workspace = createOnboardingTemplateWorkspace({
		organization: {
			get orgId() {
				return orgId;
			},
			get routeSegment() {
				return orgUrlSegment;
			},
			get canConfigure() {
				return canMutate;
			}
		},
		data: {
			get templates() {
				return data.templates;
			},
			get templateSteps() {
				return data.templateSteps;
			},
			get trainingTypes() {
				return data.trainingTypes ?? [];
			}
		}
	});
	const model = $derived(workspace.model);

	$effect(() => {
		const organization = {
			orgId,
			routeSegment: orgUrlSegment,
			canConfigure: canMutate
		};
		const workspaceData = {
			templates: data.templates,
			templateSteps: data.templateSteps,
			trainingTypes: data.trainingTypes ?? []
		};

		untrack(() => {
			workspace.replaceOrganization(organization);
			workspace.replaceData(workspaceData);
		});
	});

	const onboardingNavItems = $derived<WorkspaceToolbarNavItem[]>([
		{ label: 'Onboarding', href: `/org/${orgUrlSegment}/onboarding` }
	]);
	const templateToolbarActions = $derived.by<WorkspaceToolbarAction[]>(() => {
		if (!model.canMutate) return [];
		return [
			{
				id: 'add-template',
				label: 'Add Template',
				onclick: () => workspace.startCreateTemplate(),
				disabled: model.templateActionDisabled,
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

	function handleStageKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			workspace.addStage();
		}
	}

	async function saveStep(): Promise<void> {
		await workspace.saveStep();
	}

	function requestDelete(target: OnboardingTemplateDeleteTarget) {
		workspace.requestDelete(target);
	}

	async function handleConfirmDelete(): Promise<void> {
		await workspace.confirmDelete();
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
		<TypeWorkspace.List mobileHidden={model.mobileDetailOpen || model.creatingTemplate || model.editingTemplate}>
			{#if model.templates.length === 0 && !model.creatingTemplate}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No templates yet.</Empty.Title>
						<Empty.Description>Create one to get started.</Empty.Description>
					</Empty.Header>
					{#if model.canMutate}
						<Empty.Content>
							<Button variant="outline" size="sm" type="button" onclick={() => workspace.startCreateTemplate()}>
								Add Template
							</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				<TypeWorkspace.ItemList role="listbox" aria-label="Onboarding templates">
					{#each model.templates as template (template.id)}
						<TypeWorkspace.ListItem
							selected={model.selectedTemplate?.id === template.id && !model.creatingTemplate}
							title={template.name}
							description={workspace.getTemplateSummary(template)}
							onselect={() => workspace.selectTemplate(template.id)}
							disabled={model.templateActionDisabled}
							role="option"
							aria-selected={model.selectedTemplate?.id === template.id && !model.creatingTemplate}
						>
							{#snippet actions()}
								{#if model.canMutate && !model.templateActionDisabled}
									<Button
										variant="outline"
										size="icon"
										type="button"
										title="Edit template"
										onclick={() => workspace.startEditTemplate(template.id)}
										aria-label={`Edit ${template.name}`}
									>
										<Pencil aria-hidden="true" />
									</Button>
									<Button
										variant="outline"
										size="icon"
										type="button"
										title="Duplicate template"
										onclick={() => workspace.duplicateTemplate(template.id)}
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
											requestDelete({
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
			mobileHidden={!model.mobileDetailOpen && !model.creatingTemplate && !model.editingTemplate}
			class={model.creatingTemplate || model.editingTemplate || model.selectedTemplate
				? 'flex flex-col overflow-hidden pr-0'
				: undefined}
		>
			{#if model.creatingTemplate || model.editingTemplate || model.selectedTemplate}
				<TypeWorkspace.MobileBack onclick={() => workspace.closeMobileDetail()}>Templates</TypeWorkspace.MobileBack>
			{/if}

			{#if model.creatingTemplate || model.editingTemplate}
				<div class="grid min-h-0 flex-1 gap-6 overflow-y-auto pr-2 pb-8 [scrollbar-gutter:stable]">
					<TypeWorkspace.DetailHeader
						title={model.creatingTemplate ? 'New Onboarding Template' : 'Edit Onboarding Template'}
					/>

					<TypeWorkspace.Form title="Basics">
						<Field.Root>
							<Field.Label for="template-name">Name</Field.Label>
							<Input
								id="template-name"
								type="text"
								bind:value={workspace.templateDraft.name}
								placeholder="e.g. Standard Arrival"
							/>
						</Field.Root>
						<Field.Root>
							<Field.Label for="template-description">Description</Field.Label>
							<Textarea
								id="template-description"
								rows={3}
								bind:value={workspace.templateDraft.description}
								placeholder="Optional template description"
							/>
						</Field.Root>
					</TypeWorkspace.Form>
				</div>

				<TypeWorkspace.Actions class="shrink-0 bg-background py-3 pr-2">
					{#if !model.creatingTemplate && model.selectedTemplate && model.canMutate}
						<Button
							variant="destructive"
							size="sm"
							type="button"
							onclick={() =>
								requestDelete({
									type: 'template',
									id: model.selectedTemplate!.id,
									name: model.selectedTemplate!.name
								})}
						>
							<Trash2 aria-hidden="true" />
							Delete
						</Button>
					{/if}
					<TypeWorkspace.ActionSpacer />
					<Button variant="outline" size="sm" type="button" onclick={() => workspace.cancelTemplateEdit()}>
						Cancel
					</Button>
					<Button size="sm" type="button" onclick={() => workspace.saveTemplate()} disabled={!model.canSaveTemplate}>
						{#if model.savingTemplate}<Spinner />{/if}
						{model.creatingTemplate ? 'Create' : 'Save'}
					</Button>
				</TypeWorkspace.Actions>
			{:else if model.selectedTemplate}
				<div class="min-h-0 flex-1 overflow-y-auto pr-2 pb-8 [scrollbar-gutter:stable]">
					<TypeWorkspace.Stack>
						<TypeWorkspace.DetailHeader title={model.selectedTemplate.name}>
							{#snippet actions()}
								{#if model.canMutate}
									<Button variant="outline" size="sm" type="button" onclick={() => workspace.startEditTemplate()}>
										Edit
									</Button>
								{/if}
							{/snippet}
						</TypeWorkspace.DetailHeader>

						<TypeWorkspace.Description>
							{model.selectedTemplate.description ?? 'No description has been added for this onboarding template.'}
						</TypeWorkspace.Description>

						<TypeWorkspace.FactList>
							<TypeWorkspace.Impact label="Steps">
								{model.selectedTemplateSteps.length} configured
							</TypeWorkspace.Impact>
							<TypeWorkspace.Impact label="Created">
								{new Date(model.selectedTemplate.createdAt).toLocaleDateString()}
							</TypeWorkspace.Impact>
						</TypeWorkspace.FactList>

						<TypeWorkspace.Form title="Steps">
							{#if model.selectedTemplateSteps.length === 0 && !model.addingStep}
								<button
									type="button"
									class="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-card/70 p-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
									onclick={() => workspace.startAddStep()}
									disabled={!model.canMutate}
								>
									<Plus class="size-4" aria-hidden="true" />
									<span class="font-medium">Add first step</span>
								</button>
							{:else}
								<div class="grid overflow-hidden rounded-md border border-border bg-card">
									{#each model.selectedTemplateSteps as step, index (step.id)}
										<div class="border-b border-border/70 p-3 last:border-b-0">
											{#if model.editingStepId === step.id}
												{@render stepForm(saveStep, () => workspace.cancelEditStep(), 'Save Changes')}
											{:else}
												<div class="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
													<div class="flex min-w-0 flex-1 items-center gap-2 max-sm:flex-wrap">
														<span class="min-w-5 font-mono text-xs font-semibold text-muted-foreground">
															{index + 1}.
														</span>
														<span class="truncate text-sm font-semibold text-foreground">{step.name}</span>
														<Badge variant={STEP_TYPE_VARIANTS[step.stepType]}>{STEP_TYPE_LABELS[step.stepType]}</Badge>
													</div>
													{#if model.canMutate && !model.addingStep}
														<div class="flex shrink-0 gap-1">
															<Button
																variant="outline"
																size="icon"
																type="button"
																title="Move up"
																disabled={index === 0}
																onclick={() => workspace.moveStep(step, 'up')}
																aria-label={`Move ${step.name} up`}
															>
																<ArrowUp aria-hidden="true" />
															</Button>
															<Button
																variant="outline"
																size="icon"
																type="button"
																title="Move down"
																disabled={index === model.selectedTemplateSteps.length - 1}
																onclick={() => workspace.moveStep(step, 'down')}
																aria-label={`Move ${step.name} down`}
															>
																<ArrowDown aria-hidden="true" />
															</Button>
															<Button
																variant="outline"
																size="icon"
																type="button"
																title="Edit"
																onclick={() => workspace.startEditStep(step)}
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
																	requestDelete({
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
													{@const trainingType = model.trainingTypes.find((type) => type.id === step.trainingTypeId)}
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

							{#if model.addingStep}
								<TypeWorkspace.Choice>
									{@render stepForm(saveStep, () => workspace.cancelAddStep(), 'Add Step')}
								</TypeWorkspace.Choice>
							{/if}
						</TypeWorkspace.Form>
					</TypeWorkspace.Stack>
				</div>

				{#if model.canMutate}
					<TypeWorkspace.Actions class="shrink-0 bg-background py-3 pr-2">
						<Button
							variant="destructive"
							size="sm"
							type="button"
							onclick={() =>
								requestDelete({
									type: 'template',
									id: model.selectedTemplate!.id,
									name: model.selectedTemplate!.name
								})}
						>
							Delete Template
						</Button>
						<TypeWorkspace.ActionSpacer />
						<Button
							variant="outline"
							size="sm"
							type="button"
							onclick={() => workspace.duplicateTemplate(model.selectedTemplate!.id)}
							disabled={model.duplicatingTemplateId === model.selectedTemplate.id}
						>
							{#if model.duplicatingTemplateId === model.selectedTemplate.id}
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
							onclick={() => workspace.startAddStep()}
							disabled={model.addingStep || !!model.editingStepId}
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

{#if model.confirmDelete}
	<ConfirmDialog
		title="Delete {model.confirmDelete.type === 'template' ? 'Template' : 'Step'}"
		message="Are you sure you want to delete &quot;{model.confirmDelete.name}&quot;?{model.confirmDelete.type ===
		'template'
			? ' This will also delete all steps in this template.'
			: ''}"
		confirmLabel="Delete"
		variant="danger"
		onConfirm={handleConfirmDelete}
		onCancel={() => workspace.cancelDelete()}
	/>
{/if}

{#snippet stepForm(onSave: () => void | Promise<void>, onCancel: () => void, saveLabel: string)}
	<div class="grid gap-4">
		<TypeWorkspace.Form title="Step Basics">
			<Field.Root>
				<Field.Label for="step-name">Name</Field.Label>
				<Input id="step-name" type="text" placeholder="Step name" bind:value={workspace.stepDraft.name} />
			</Field.Root>

			<Field.Root>
				<Field.Label for="step-description">Description</Field.Label>
				<Textarea
					id="step-description"
					placeholder="Optional description"
					rows={2}
					bind:value={workspace.stepDraft.description}
				/>
			</Field.Root>
		</TypeWorkspace.Form>

		<TypeWorkspace.Form title="Type">
			<RadioGroup.Root bind:value={workspace.stepDraft.stepType} class="sm:grid-cols-3">
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

			{#if workspace.stepDraft.stepType === 'training'}
				<Field.Root>
					<Field.Label for="training-type-select">Training Type</Field.Label>
					<Select.Root
						type="single"
						value={workspace.stepDraft.trainingTypeId ?? ''}
						onValueChange={(value) => (workspace.stepDraft.trainingTypeId = value || null)}
					>
						<Select.Trigger id="training-type-select" class="w-full sm:w-fit sm:min-w-56">
							{model.stepTrainingTypeLabel}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="" label="Select training type" />
							{#each model.trainingTypes as trainingType (trainingType.id)}
								<Select.Item value={trainingType.id} label={trainingType.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Root>
			{/if}
		</TypeWorkspace.Form>

		{#if workspace.stepDraft.stepType === 'paperwork'}
			<TypeWorkspace.Form title="Stages">
				<div class="grid gap-2">
					{#each workspace.stepDraft.stages as stage, index (index)}
						<div class="flex items-center justify-between rounded-md border bg-card p-2">
							<span class="text-sm text-foreground">{stage}</span>
							<div class="flex gap-1">
								<Button
									variant="outline"
									size="icon"
									type="button"
									title="Move up"
									disabled={index === 0}
									onclick={() => workspace.moveStage(index, 'up')}
									aria-label={`Move ${stage} up`}
								>
									<ArrowUp aria-hidden="true" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									type="button"
									title="Move down"
									disabled={index === workspace.stepDraft.stages.length - 1}
									onclick={() => workspace.moveStage(index, 'down')}
									aria-label={`Move ${stage} down`}
								>
									<ArrowDown aria-hidden="true" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									type="button"
									title="Remove"
									onclick={() => workspace.removeStage(index)}
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
							bind:value={workspace.newStageName}
							onkeydown={handleStageKeydown}
						/>
						<Button
							variant="outline"
							size="sm"
							type="button"
							onclick={() => workspace.addStage()}
							disabled={!workspace.newStageName.trim()}
						>
							Add
						</Button>
					</div>
				</div>
			</TypeWorkspace.Form>
		{/if}

		<TypeWorkspace.Actions>
			<TypeWorkspace.ActionSpacer />
			<Button variant="outline" size="sm" type="button" onclick={onCancel}>Cancel</Button>
			<Button size="sm" type="button" onclick={onSave} disabled={!model.canSaveStep}>
				{#if model.savingStep}<Spinner class="size-3" />{/if}
				{saveLabel}
			</Button>
		</TypeWorkspace.Actions>
	</div>
{/snippet}
