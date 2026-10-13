<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { ReorderGrip, ReorderItem, ReorderList } from '$lib/components/patterns/reorder-list';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import type { TrainingType } from '$features/training/contracts';
	import type { OnboardingTemplateStep } from '../../contracts';
	import type { OnboardingTemplateWorkspace } from '../../stores/onboardingTemplate.svelte';
	import TemplateStepEditor from './TemplateStepEditor.svelte';
	import { STEP_TYPE_LABELS, stepPosition } from './templateStepLabels';

	let {
		workspace,
		steps,
		trainingTypes,
		onedit,
		onadd,
		ondelete,
		onsave,
		oncancel
	}: {
		workspace: OnboardingTemplateWorkspace;
		steps: OnboardingTemplateStep[];
		trainingTypes: TrainingType[];
		onedit: (step: OnboardingTemplateStep) => void;
		onadd: () => void;
		ondelete: (step: OnboardingTemplateStep) => void;
		onsave: () => void | Promise<void>;
		oncancel: () => void;
	} = $props();

	const model = $derived(workspace.model);
	const entries = $derived(steps.map((step) => ({ id: step.id, label: step.name })));

	function detail(step: OnboardingTemplateStep): string | null {
		if (step.stepType === 'paperwork') return step.stages?.join(' → ') || null;
		if (step.stepType === 'training') {
			const type = trainingTypes.find((item) => item.id === step.trainingTypeId);
			return `Linked to Training: ${type?.name ?? 'a training type that no longer exists'}. Clears itself from training records.`;
		}
		return step.description;
	}

	function reorder(id: string, toIndex: number) {
		return workspace.reorderStep(id, toIndex);
	}
</script>

<Card.Root class="gap-0 overflow-hidden p-0">
	{#if steps.length > 0}
		<ReorderList {entries} onmove={reorder} aria-label="Steps">
			{#each steps as step, index (step.id)}
				<ReorderItem id={step.id} class="border-b border-border/70 last:border-b-0">
					{#if model.editingStepId === step.id}
						<TemplateStepEditor {workspace} position={index} {onsave} {oncancel} />
					{:else}
						<div class="flex items-start gap-3 px-3 py-3">
							{#if model.canMutate}
								<ReorderGrip class="mt-0.5" />
							{/if}
							<span class="mt-0.5 min-w-6 font-mono text-xs text-muted-foreground">{stepPosition(index)}</span>
							<div class="grid min-w-0 flex-1 gap-0.5">
								<span class="truncate text-sm font-semibold text-foreground">{step.name}</span>
								{#if detail(step)}
									<span class="text-sm text-muted-foreground">{detail(step)}</span>
								{/if}
							</div>
							<span class="mt-0.5 font-mono text-xs tracking-wider text-muted-foreground uppercase max-sm:hidden">
								{STEP_TYPE_LABELS[step.stepType]}
							</span>
							{#if model.canMutate}
								<div class="flex shrink-0 gap-1">
									<Button
										variant="ghost"
										size="icon-sm"
										type="button"
										title="Edit step"
										aria-label="Edit {step.name}"
										data-edit-step={step.id}
										onclick={() => onedit(step)}
									>
										<Pencil aria-hidden="true" />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										type="button"
										title="Delete step"
										aria-label="Delete {step.name}"
										onclick={() => ondelete(step)}
									>
										<Trash2 aria-hidden="true" />
									</Button>
								</div>
							{/if}
						</div>
					{/if}
				</ReorderItem>
			{/each}
		</ReorderList>
	{:else if !model.addingStep}
		<p class="m-0 px-3 py-4 text-sm text-muted-foreground">No steps yet.</p>
	{/if}

	{#if model.addingStep}
		<div class="border-t border-border/70 first:border-t-0">
			<TemplateStepEditor {workspace} position={steps.length} {onsave} {oncancel} />
		</div>
	{:else if model.canMutate}
		<div class="border-t border-border/70 first:border-t-0">
			<Button
				variant="ghost"
				size="sm"
				type="button"
				class="m-1.5"
				data-add-step
				disabled={model.creatingTemplate || model.editingTemplate}
				onclick={onadd}
			>
				<Plus aria-hidden="true" />
				Add step
			</Button>
		</div>
	{/if}
</Card.Root>
