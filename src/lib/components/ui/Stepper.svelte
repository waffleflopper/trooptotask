<script lang="ts">
	import * as Stepper from '$lib/components/ui/stepper/index.js';

	interface Props {
		stages: string[];
		currentStage: string;
		onStageClick?: (stage: string) => void;
		disabled?: boolean;
	}

	let { stages, currentStage, onStageClick, disabled = false }: Props = $props();

	const stepperSteps = $derived(
		stages.map((stage, index) => ({
			value: stage,
			label: stage,
			completed: index < stages.indexOf(currentStage),
			disabled
		}))
	);
</script>

<Stepper.Root
	steps={stepperSteps}
	value={currentStage}
	onValueChange={(stage) => onStageClick?.(stage)}
	class="gap-0"
	data-slot="legacy-stepper"
>
	<Stepper.List class="gap-0 overflow-visible pb-0">
		{#each stepperSteps as step (step.value)}
			<Stepper.Item value={step.value} completed={step.completed} disabled={disabled || !onStageClick}>
				<Stepper.Trigger class="min-h-0 gap-1 rounded-md p-1" title={step.value}>
					<Stepper.Indicator class="size-4 text-[9px] [&>svg]:size-2.5" />
					<Stepper.Label class="max-w-20 truncate font-mono text-xs font-medium tracking-wider uppercase">
						{step.label}
					</Stepper.Label>
				</Stepper.Trigger>
			</Stepper.Item>
		{/each}
	</Stepper.List>
</Stepper.Root>
