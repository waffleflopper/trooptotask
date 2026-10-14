<script lang="ts">
	import type { OnboardingStepProgress } from '../onboarding.types';
	import { daysAtStage, isStepStalled, type Today } from '../onboardingStatus';
	import { Button } from '$lib/components/ui/button';
	import Check from '@lucide/svelte/icons/check';

	interface Props {
		step: OnboardingStepProgress;
		today: Today;
		canManage: boolean;
		onSelect: (stage: string) => void;
	}

	let { step, today, canManage, onSelect }: Props = $props();

	type StageState = 'cleared' | 'current' | 'upcoming';

	const stages = $derived(step.stages ?? []);
	const currentIndex = $derived(step.currentStage === null ? -1 : stages.indexOf(step.currentStage));
	const days = $derived(daysAtStage(step, today));
	const stalled = $derived(isStepStalled(step, today));

	function stateOf(index: number): StageState {
		if (index < currentIndex || (step.completed && index === currentIndex)) return 'cleared';
		return index === currentIndex ? 'current' : 'upcoming';
	}

	function dayLabel(count: number) {
		return count === 1 ? '1 day' : `${count} days`;
	}
</script>

{#snippet marker(state: StageState)}
	<span
		aria-hidden="true"
		class={[
			'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
			state === 'cleared' && 'border-foreground bg-foreground text-background',
			state === 'current' && (stalled ? 'border-2 border-warning' : 'border-2 border-primary'),
			state === 'upcoming' && 'border-dashed border-muted-foreground'
		]}
	>
		{#if state === 'cleared'}<Check class="size-3" />{/if}
	</span>
{/snippet}

{#snippet status(stage: string, index: number, state: StageState)}
	{#if state === 'cleared'}
		<span class="font-mono text-xs text-muted-foreground">Cleared</span>
	{:else if state === 'current'}
		<span class={['font-mono text-xs', stalled ? 'text-warning-foreground' : 'text-muted-foreground']}>
			{dayLabel(days)}
		</span>
	{:else if canManage && !step.completed && index === currentIndex + 1}
		<Button size="xs" onclick={() => onSelect(stage)} aria-label={`Advance ${step.stepName} to ${stage}`}>
			Advance
		</Button>
	{/if}
{/snippet}

<ol class="grid grid-cols-1 gap-0.5" aria-label={`${step.stepName} stages`}>
	{#each stages as stage, index (index)}
		{@const state = stateOf(index)}
		<li class="flex min-h-8 items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
			{#if canManage}
				<Button
					variant="ghost"
					size="none"
					class="min-h-8 min-w-0 flex-1 items-start justify-start gap-2 px-1 py-1.5 text-left whitespace-normal"
					onclick={() => onSelect(stage)}
					aria-label={`Set ${step.stepName} to ${stage}`}
				>
					{@render marker(state)}
					<span class={['min-w-0 text-sm wrap-anywhere', state === 'current' && 'font-semibold']}>{stage}</span>
				</Button>
			{:else}
				<span class="flex min-w-0 flex-1 items-start gap-2 px-1 py-1.5">
					{@render marker(state)}
					<span class={['min-w-0 text-sm wrap-anywhere', state === 'current' && 'font-semibold']}>{stage}</span>
				</span>
			{/if}
			{@render status(stage, index, state)}
		</li>
	{/each}
</ol>
