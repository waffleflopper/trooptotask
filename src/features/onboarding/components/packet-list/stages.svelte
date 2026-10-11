<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

	interface Props {
		stepName: string;
		stages: string[];
		currentStage: string | null;
	}

	let { stepName, stages, currentStage }: Props = $props();

	const shownStage = $derived(currentStage ?? stages[0] ?? '');
	const currentIndex = $derived(stages.indexOf(shownStage));

	function stateOf(index: number) {
		if (currentIndex < 0) return 'queued';
		return index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'queued';
	}
</script>

<div class="flex max-w-full min-w-0 flex-col gap-1">
	{#if shownStage}
		<p class="text-xs text-muted-foreground">Current stage: {shownStage}</p>
	{/if}
	<ol
		aria-label={`${stepName} paperwork stages`}
		data-slot="onboarding-packet-stages"
		class="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:gap-3 sm:overflow-x-auto sm:pb-2"
	>
		{#each stages as stage, index (index)}
			{@const state = stateOf(index)}
			<li
				aria-current={index === currentIndex ? 'step' : undefined}
				class="relative flex min-w-0 flex-col sm:min-w-28 sm:flex-1 sm:items-center"
			>
				<div
					class={[
						'flex min-h-10 w-full min-w-0 items-center gap-2 text-left text-sm font-medium sm:flex-col sm:text-center',
						state === 'queued' ? 'text-muted-foreground' : 'text-foreground'
					]}
				>
					<span class="sr-only">Step {index + 1}:</span>
					<span
						aria-hidden="true"
						class={[
							'flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border text-[0.625rem] font-semibold shadow-sm',
							state === 'done' && 'border-success bg-success text-white',
							state === 'current' && 'border-primary bg-primary text-primary-foreground',
							state === 'queued' && 'border-border bg-background text-muted-foreground'
						]}
					>
						{#if state === 'done'}
							<Check class="size-3" />
						{:else}
							{index + 1}
						{/if}
					</span>
					<span class="grid min-w-0 gap-1">
						<span class="max-w-40 min-w-0 text-sm leading-tight font-medium text-balance">{stage}</span>
					</span>
				</div>
				{#if index < stages.length - 1}
					<span
						aria-hidden="true"
						class="absolute top-[0.5625rem] right-[calc(-50%+0.9375rem)] left-[calc(50%+0.9375rem)] hidden h-px overflow-hidden bg-muted-foreground/25 sm:block"
					></span>
				{/if}
			</li>
		{/each}
	</ol>
</div>
