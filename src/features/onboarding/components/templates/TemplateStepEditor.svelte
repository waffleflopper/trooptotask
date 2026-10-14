<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import { ReorderGrip, ReorderItem, ReorderList } from '$lib/components/patterns/reorder-list';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import type { OnboardingStepType } from '../../contracts';
	import type { OnboardingTemplateWorkspace } from '../../stores/onboardingTemplate.svelte';
	import { STEP_TYPE_LABELS, STEP_TYPES, stepPosition } from './templateStepLabels';

	let {
		workspace,
		position,
		onsave,
		oncancel
	}: {
		workspace: OnboardingTemplateWorkspace;
		/** Where the step sits in the list, from 0. */
		position: number;
		onsave: () => void | Promise<void>;
		oncancel: () => void;
	} = $props();

	const model = $derived(workspace.model);
	const draft = $derived(workspace.stepDraft);
	const isNew = $derived(model.addingStep);
	const stageEntries = $derived(
		draft.stages.map((stage, index) => ({
			id: `${stage}#${draft.stages.slice(0, index).filter((earlier) => earlier === stage).length}`,
			label: stage
		}))
	);

	let nameInput = $state<HTMLElement | null>(null);

	$effect(() => {
		nameInput?.focus();
	});

	function setType(value: string) {
		if (value) workspace.stepDraft.stepType = value as OnboardingStepType;
	}

	function moveStage(id: string, toIndex: number) {
		workspace.moveStage(
			stageEntries.findIndex((entry) => entry.id === id),
			toIndex
		);
	}

	async function addStage() {
		workspace.addStage();
		await tick();
		document.getElementById('step-new-stage')?.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
		}
	}
</script>

<div
	class="grid gap-4 border-l-2 border-primary bg-muted/30 p-4"
	role="group"
	aria-label={isNew ? 'New step' : 'Editing step'}
>
	<p class="m-0 font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
		<span class="mr-2">{stepPosition(position)}</span>
		{isNew ? 'New step' : 'Editing step'}
	</p>

	<div class="grid gap-4 sm:grid-cols-[1fr_auto]">
		<Field.Root>
			<Field.Label for="step-name">Step name</Field.Label>
			<Input
				bind:ref={nameInput}
				id="step-name"
				type="text"
				placeholder="Step name"
				bind:value={workspace.stepDraft.name}
				onkeydown={handleKeydown}
			/>
		</Field.Root>
		<Field.Root>
			<Field.Label id="step-type-label">Type</Field.Label>
			<div>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					aria-labelledby="step-type-label"
					value={draft.stepType}
					onValueChange={setType}
				>
					{#each STEP_TYPES as type (type)}
						<ToggleGroup.Item
							value={type}
							aria-label={STEP_TYPE_LABELS[type]}
							class="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
						>
							{STEP_TYPE_LABELS[type]}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</div>
		</Field.Root>
	</div>

	<Field.Root>
		<Field.Label for="step-description">Instructions</Field.Label>
		<Field.Description>Optional. Shown to whoever works the packet.</Field.Description>
		<Textarea id="step-description" rows={3} bind:value={workspace.stepDraft.description} onkeydown={handleKeydown} />
	</Field.Root>

	{#if draft.stepType === 'training'}
		<Field.Root>
			<Field.Label for="training-type-select">Training Type</Field.Label>
			<Select.Root
				type="single"
				value={draft.trainingTypeId ?? ''}
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

	{#if draft.stepType === 'paperwork'}
		<div class="grid gap-2">
			<p class="m-0 text-sm font-medium text-foreground">
				Stages <span class="font-normal text-muted-foreground"
					>In order. Reaching the last stage completes the step.</span
				>
			</p>
			<ReorderList entries={stageEntries} onmove={moveStage} aria-label="Stages" class="grid gap-1">
				{#each stageEntries as entry, index (entry.id)}
					<ReorderItem
						id={entry.id}
						class="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1"
					>
						<ReorderGrip />
						<span class="min-w-5 font-mono text-xs text-muted-foreground">{index + 1}</span>
						<span class="min-w-0 flex-1 truncate text-sm text-foreground">{entry.label}</span>
						<Button
							variant="ghost"
							size="icon-xs"
							type="button"
							title="Remove stage"
							aria-label="Remove {entry.label}"
							onclick={() => workspace.removeStage(index)}
						>
							<X aria-hidden="true" />
						</Button>
					</ReorderItem>
				{/each}
			</ReorderList>
			<div class="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
				<Input
					id="step-new-stage"
					class="flex-1"
					type="text"
					placeholder="Add a stage"
					aria-label="Stage name"
					bind:value={workspace.newStageName}
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							void addStage();
						} else handleKeydown(event);
					}}
				/>
				<Button variant="outline" size="sm" type="button" disabled={!workspace.newStageName.trim()} onclick={addStage}>
					<Plus aria-hidden="true" />
					Add stage
				</Button>
			</div>
		</div>
	{/if}

	<div class="flex justify-end gap-2 border-t border-border pt-3">
		<Button variant="outline" size="sm" type="button" onclick={oncancel}>Cancel</Button>
		<Button size="sm" type="button" disabled={!model.canSaveStep} onclick={onsave}>
			{#if model.savingStep}<Spinner class="size-3" />{/if}
			Save step
		</Button>
	</div>
</div>
