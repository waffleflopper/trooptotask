<script lang="ts">
	import type { OnboardingTemplateStep } from '../onboarding.types';
	import type { TrainingType } from '$features/training/training.types';
	import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	interface Props {
		trainingTypes: TrainingType[];
		onClose: () => void;
	}

	interface DraftStage {
		id: string;
		value: string;
	}

	let { trainingTypes, onClose }: Props = $props();

	// Derived locals to ensure reactive tracking of store state
	const templates = $derived(onboardingTemplateStore.templates);
	const activeTemplateId = $derived(onboardingTemplateStore.activeTemplateId);
	const stepList = $derived(onboardingTemplateStore.list);

	const stepTypeVariants: Record<string, BadgeVariant> = {
		training: 'info',
		paperwork: 'warning',
		checkbox: 'secondary'
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
	let newStages = $state<DraftStage[]>([]);

	let editingId = $state<string | null>(null);
	let editStepType = $state<'training' | 'paperwork' | 'checkbox'>('training');
	let editName = $state('');
	let editDescription = $state('');
	let editTrainingTypeId = $state<string | null>(null);
	let editStages = $state<DraftStage[]>([]);
	let nextDraftStageId = 0;

	function createDraftStage(value = ''): DraftStage {
		nextDraftStageId += 1;
		return { id: `draft-stage-${nextDraftStageId}`, value };
	}

	function getStageValues(stages: DraftStage[]): string[] {
		return stages.map((stage) => stage.value.trim()).filter(Boolean);
	}

	function handleAdd() {
		if (!newName.trim()) return;
		onboardingTemplateStore.add({
			name: newName.trim(),
			description: newDescription.trim() || null,
			stepType: newStepType,
			trainingTypeId: newStepType === 'training' ? newTrainingTypeId : null,
			stages: newStepType === 'paperwork' ? getStageValues(newStages) : null,
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
		newStages = [...newStages, createDraftStage()];
	}

	function removeNewStage(index: number) {
		newStages = newStages.filter((_, i) => i !== index);
	}

	function addEditStage() {
		editStages = [...editStages, createDraftStage()];
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
		editStages = step.stages ? step.stages.map((stage) => createDraftStage(stage)) : [];
	}

	function saveEdit() {
		if (editingId && editName.trim()) {
			onboardingTemplateStore.update(editingId, {
				name: editName.trim(),
				description: editDescription.trim() || null,
				stepType: editStepType,
				trainingTypeId: editStepType === 'training' ? editTrainingTypeId : null,
				stages: editStepType === 'paperwork' ? getStageValues(editStages) : null
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

	// Keep optimistic order local so store refreshes from unrelated edits do not snap the list back.
	let manualStepOrder = $state<string[] | null>(null);
	const orderedSteps = $derived.by<OnboardingTemplateStep[]>(() => {
		const source = [...stepList];
		const order = manualStepOrder;
		if (!order) return source;

		const ordered = order
			.map((id) => source.find((step) => step.id === id))
			.filter((step): step is OnboardingTemplateStep => step !== undefined);
		const remaining = source.filter((step) => !order.includes(step.id));
		return [...ordered, ...remaining];
	});

	$effect(() => {
		if (templates.length === 0) {
			showNewTemplateForm = true;
		}
	});

	$effect(() => {
		if (!manualStepOrder) return;
		const stepIds = stepList.map((step) => step.id);
		if (manualStepOrder.length !== stepIds.length || manualStepOrder.some((id) => !stepIds.includes(id))) {
			manualStepOrder = null;
		}
	});

	function reorderStep(fromIndex: number, toIndex: number) {
		if (fromIndex < 0 || fromIndex >= orderedSteps.length) return;
		if (toIndex < 0 || toIndex >= orderedSteps.length) return;
		const next = [...orderedSteps];
		[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];

		const reordered = next.map((step, sortOrder) => ({ ...step, sortOrder }));
		manualStepOrder = reordered.map((step) => step.id);
		void persistStepOrder(reordered);
	}

	async function persistStepOrder(steps: OnboardingTemplateStep[]) {
		await Promise.all(steps.map((step) => onboardingTemplateStore.update(step.id, { sortOrder: step.sortOrder })));
	}

	function moveUp(index: number) {
		reorderStep(index, index - 1);
	}

	function moveDown(index: number) {
		reorderStep(index, index + 1);
	}

	function getDescriptionPreview(step: OnboardingTemplateStep): string {
		if (step.stepType === 'training' && step.trainingTypeId) {
			const tt = trainingTypes.find((t) => t.id === step.trainingTypeId);
			return tt ? `Training: ${tt.name}` : 'Training type not found';
		}
		if (step.stepType === 'paperwork') {
			if (step.stages?.length) {
				return `${step.stages.length} stage${step.stages.length === 1 ? '' : 's'}`;
			}
			return 'No stages defined';
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
	<div class="mb-3 rounded-lg border bg-card p-3">
		<div class="min-w-0">
			<Label for="template-select">Template</Label>
			<div class="mt-2 flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
				{#if editingTemplateId != null && editingTemplateId === activeTemplateId}
					<div class="flex flex-1 flex-col gap-2">
						<Input id="rename-template-name" type="text" bind:value={editTemplateName} placeholder="Template name..." />
						<Input
							id="rename-template-description"
							type="text"
							bind:value={editTemplateDescription}
							placeholder="Description (optional)"
						/>
						{#if templateError}
							<p class="mt-1 text-sm text-destructive">{templateError}</p>
						{/if}
						<div class="mt-2 flex gap-2">
							<Button
								size="sm"
								type="button"
								onclick={saveRenameTemplate}
								disabled={!editTemplateName.trim() || renamingTemplate}
							>
								{#if renamingTemplate}<Spinner />{/if}
								Save
							</Button>
							<Button variant="outline" size="sm" type="button" onclick={cancelRenameTemplate}>Cancel</Button>
						</div>
					</div>
				{:else}
					<NativeSelect
						id="template-select"
						class="flex-1"
						value={activeTemplateId}
						onchange={(e) => onboardingTemplateStore.setActiveTemplate((e.target as HTMLSelectElement).value)}
					>
						{#each templates as t (t.id)}
							<option value={t.id}>{t.name}</option>
						{/each}
					</NativeSelect>
					<Button variant="outline" size="sm" type="button" onclick={startRenameTemplate} title="Rename template">
						Rename
					</Button>
					{#if canDeleteTemplate}
						<Button
							variant="destructive"
							size="sm"
							type="button"
							onclick={() =>
								activeTemplate && (confirmDeleteTemplate = { id: activeTemplate.id, name: activeTemplate.name })}
							title="Delete template"
						>
							Delete
						</Button>
					{/if}
					{#if !showNewTemplateForm}
						<Button
							variant="outline"
							size="sm"
							class="shrink-0"
							type="button"
							onclick={() => {
								showNewTemplateForm = true;
								templateError = '';
							}}
						>
							<PlusIcon /> New Template
						</Button>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	{#if deleteTemplateError}
		<p class="mb-2 text-sm text-destructive">{deleteTemplateError}</p>
	{/if}

	{#if showNewTemplateForm}
		<div class="mb-3 rounded-lg border bg-muted/40 p-3">
			<h3 class="mb-3 text-lg font-semibold tracking-tight">New Template</h3>
			<div class="mb-2 flex gap-3">
				<div class="flex flex-1 flex-col gap-1.5">
					<Label for="new-template-name">Name</Label>
					<Input
						id="new-template-name"
						type="text"
						bind:value={newTemplateName}
						placeholder="e.g., Enlisted Onboarding"
					/>
				</div>
			</div>
			<div class="mb-2 flex flex-col gap-1.5">
				<Label for="new-template-description">Description (optional)</Label>
				<Input
					id="new-template-description"
					type="text"
					bind:value={newTemplateDescription}
					placeholder="Brief description..."
				/>
			</div>
			{#if templateError}
				<p class="mt-1 text-sm text-destructive">{templateError}</p>
			{/if}
			<div class="mt-3 flex gap-2">
				<Button
					size="sm"
					type="button"
					onclick={handleCreateTemplate}
					disabled={!newTemplateName.trim() || creatingTemplate}
				>
					{#if creatingTemplate}<Spinner />{/if}
					Create Template
				</Button>
				<Button
					variant="outline"
					size="sm"
					type="button"
					onclick={() => {
						showNewTemplateForm = false;
						templateError = '';
					}}
				>
					Cancel
				</Button>
			</div>
		</div>
	{/if}

	<div class="mb-4">
		<h3 class="mb-2 text-lg font-semibold tracking-tight">Add Step</h3>
		<div class="rounded-lg border bg-muted/40 p-3">
			<div class="mb-2 flex gap-3 max-sm:flex-col">
				<div class="flex flex-col gap-1.5">
					<Label for="new-step-type">Step Type</Label>
					<NativeSelect id="new-step-type" bind:value={newStepType}>
						<option value="training">Training</option>
						<option value="paperwork">Paperwork</option>
						<option value="checkbox">Checkbox</option>
					</NativeSelect>
				</div>
				<div class="flex flex-1 flex-col gap-1.5">
					<Label for="new-step-name">Name</Label>
					<Input id="new-step-name" type="text" bind:value={newName} placeholder="e.g., Complete safety briefing" />
				</div>
			</div>

			{#if newStepType === 'training'}
				<div class="mb-2 flex flex-col gap-1.5">
					<Label for="new-training-type">Training Type</Label>
					<NativeSelect
						id="new-training-type"
						value={newTrainingTypeId ?? ''}
						onchange={(e) => (newTrainingTypeId = (e.target as HTMLSelectElement).value || null)}
					>
						<option value="">Select training type</option>
						{#each trainingTypes as tt (tt.id)}
							<option value={tt.id}>{tt.name}</option>
						{/each}
					</NativeSelect>
				</div>
			{:else if newStepType === 'paperwork'}
				<div class="mb-2 flex flex-col gap-1.5">
					<p class="text-sm font-medium">Stages</p>
					<div class="flex flex-col gap-2">
						{#each newStages as stage, index (stage.id)}
							<div class="flex items-center gap-2">
								<Input class="flex-1" type="text" bind:value={stage.value} placeholder="Stage name..." />
								<Button variant="destructive" size="sm" type="button" onclick={() => removeNewStage(index)}>
									<Trash2Icon />
								</Button>
							</div>
						{/each}
						<Button class="self-start" variant="outline" size="sm" type="button" onclick={addNewStage}>
							<PlusIcon /> Add Stage
						</Button>
					</div>
				</div>
			{:else if newStepType === 'checkbox'}
				<div class="mb-2 flex flex-col gap-1.5">
					<Label for="new-step-description">Description (optional)</Label>
					<Input id="new-step-description" type="text" bind:value={newDescription} placeholder="Brief description..." />
				</div>
			{/if}

			<Button type="button" onclick={handleAdd} disabled={!newName.trim()}><PlusIcon /> Add Step</Button>
		</div>
	</div>

	<div class="mb-4">
		<h3 class="mb-2 text-lg font-semibold tracking-tight">
			{activeTemplate?.name ?? 'Template'} Steps
			{#if activeTemplate?.description}
				<span class="ml-2 text-sm font-normal text-muted-foreground">{activeTemplate.description}</span>
			{/if}
		</h3>
		<div class="flex max-h-80 flex-col gap-2 overflow-y-auto">
			{#each orderedSteps as step, index (step.id)}
				<div
					class="flex items-center justify-between gap-2 rounded-lg border bg-card p-3 max-sm:flex-col max-sm:items-stretch"
				>
					{#if editingId === step.id}
						<div class="w-full rounded-lg border bg-muted/40 p-3">
							<div class="mb-2 flex gap-3 max-sm:flex-col">
								<div class="flex flex-col gap-1.5">
									<Label for="edit-step-type">Step Type</Label>
									<NativeSelect id="edit-step-type" bind:value={editStepType}>
										<option value="training">Training</option>
										<option value="paperwork">Paperwork</option>
										<option value="checkbox">Checkbox</option>
									</NativeSelect>
								</div>
								<div class="flex flex-1 flex-col gap-1.5">
									<Label for="edit-step-name">Name</Label>
									<Input id="edit-step-name" type="text" bind:value={editName} />
								</div>
							</div>

							{#if editStepType === 'training'}
								<div class="mb-2 flex flex-col gap-1.5">
									<Label for="edit-training-type">Training Type</Label>
									<NativeSelect
										id="edit-training-type"
										value={editTrainingTypeId ?? ''}
										onchange={(e) => (editTrainingTypeId = (e.target as HTMLSelectElement).value || null)}
									>
										<option value="">Select training type</option>
										{#each trainingTypes as tt (tt.id)}
											<option value={tt.id}>{tt.name}</option>
										{/each}
									</NativeSelect>
								</div>
							{:else if editStepType === 'paperwork'}
								<div class="mb-2 flex flex-col gap-1.5">
									<p class="text-sm font-medium">Stages</p>
									<div class="flex flex-col gap-2">
										{#each editStages as stage, index (stage.id)}
											<div class="flex items-center gap-2">
												<Input class="flex-1" type="text" bind:value={stage.value} placeholder="Stage name..." />
												<Button variant="destructive" size="sm" type="button" onclick={() => removeEditStage(index)}>
													<Trash2Icon />
												</Button>
											</div>
										{/each}
										<Button class="self-start" variant="outline" size="sm" type="button" onclick={addEditStage}>
											<PlusIcon /> Add Stage
										</Button>
									</div>
								</div>
							{:else if editStepType === 'checkbox'}
								<div class="mb-2 flex flex-col gap-1.5">
									<Label for="edit-step-description">Description (optional)</Label>
									<Input id="edit-step-description" type="text" bind:value={editDescription} />
								</div>
							{/if}

							<div class="mt-3 flex gap-2">
								<Button size="sm" type="button" onclick={saveEdit}>Save</Button>
								<Button variant="outline" size="sm" type="button" onclick={cancelEdit}>Cancel</Button>
							</div>
						</div>
					{:else}
						<div class="flex min-w-0 flex-wrap items-center gap-2">
							<Badge variant={stepTypeVariants[step.stepType]}>{stepTypeLabels[step.stepType]}</Badge>
							<span data-testid="onboarding-template-step-name" class="text-base font-medium text-foreground">
								{step.name}
							</span>
							{#if getDescriptionPreview(step)}
								<span class="text-sm text-muted-foreground">{getDescriptionPreview(step)}</span>
							{/if}
						</div>
						<div class="flex shrink-0 gap-2 max-sm:w-full max-sm:justify-between">
							<div class="mr-1 flex flex-col gap-px">
								<Button
									variant="outline"
									size="icon-xs"
									type="button"
									onclick={() => moveUp(index)}
									disabled={index === 0}
									title="Move up"
								>
									<ChevronUpIcon />
								</Button>
								<Button
									variant="outline"
									size="icon-xs"
									type="button"
									onclick={() => moveDown(index)}
									disabled={index === orderedSteps.length - 1}
									title="Move down"
								>
									<ChevronDownIcon />
								</Button>
							</div>
							<Button variant="outline" size="sm" type="button" onclick={() => startEdit(step)}>Edit</Button>
							<Button variant="destructive" size="sm" type="button" onclick={() => handleRemove(step.id, step.name)}>
								<Trash2Icon />
							</Button>
						</div>
					{/if}
				</div>
			{/each}

			{#if orderedSteps.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No onboarding steps defined yet.</Empty.Title>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</div>
	</div>

	{#snippet footer()}
		<div class="flex-1"></div>
		<Button variant="outline" type="button" onclick={onClose}>Close</Button>
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
