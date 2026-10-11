<script lang="ts">
	import type { OnboardingStepProgress } from '../onboarding.types';
	import { Button } from '$lib/components/ui/button';
	import Check from '@lucide/svelte/icons/check';

	type StageState = 'done' | 'current' | 'upcoming';

	interface StageView {
		value: string;
		label: string;
		state: StageState;
		index: number;
	}

	interface Props {
		step: OnboardingStepProgress;
		canManage: boolean;
		onSelect: (stage: string) => void;
		inset?: boolean;
	}

	let { step, canManage, onSelect, inset = true }: Props = $props();

	const stages = $derived(step.stages ?? []);
	const currentStage = $derived(step.currentStage ?? stages[0] ?? '');
	const currentIndex = $derived.by(() => {
		const index = stages.indexOf(currentStage);
		return index >= 0 ? index : null;
	});
	const stageViews = $derived<StageView[]>(
		stages.map((stage, index) => ({
			value: stage,
			label: stage,
			index,
			state:
				currentIndex === null
					? 'upcoming'
					: index < currentIndex
						? 'done'
						: index === currentIndex
							? 'current'
							: 'upcoming'
		}))
	);

	function selectStage(stage: string) {
		if (canManage) onSelect(stage);
	}
</script>

{#if stageViews.length > 0}
	<div class={['mt-2 grid gap-1.5', inset && 'pl-7']} role="group" aria-label={`${step.stepName} paperwork stages`}>
		{#each stageViews as stage (stage.index)}
			<Button
				variant="outline"
				size="none"
				disabled={!canManage}
				aria-current={stage.state === 'current' ? 'step' : undefined}
				onclick={() => selectStage(stage.value)}
				class={[
					'min-h-10 w-full justify-start gap-2 px-2.5 py-2 text-left',
					stage.state === 'current' && 'border-primary bg-primary/5 dark:bg-primary/5',
					stage.state === 'done' && 'border-success/30 bg-success/5 dark:bg-success/5'
				]}
			>
				<span
					class={[
						'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-semibold',
						stage.state === 'done' && 'border-success bg-success text-white',
						stage.state === 'current' && 'border-primary bg-primary text-primary-foreground',
						stage.state === 'upcoming' && 'border-border bg-muted text-muted-foreground'
					]}
				>
					{#if stage.state === 'done'}
						<Check class="h-3 w-3" aria-hidden="true" />
					{:else}
						{stage.index + 1}
					{/if}
				</span>
				<span class="min-w-0 flex-1 text-sm font-medium">{stage.label}</span>
				<span class="text-[0.68rem] font-medium uppercase text-muted-foreground">
					{stage.state === 'done' ? 'Cleared' : stage.state === 'current' ? 'Current' : 'Queued'}
				</span>
			</Button>
		{/each}
	</div>
{/if}
