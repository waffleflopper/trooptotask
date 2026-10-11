<script lang="ts">
	interface Props {
		stepName: string;
		stages: string[];
		currentStage: string | null;
	}

	let { stepName, stages, currentStage }: Props = $props();

	const shownStage = $derived(currentStage ?? stages[0] ?? '');
	const currentIndex = $derived(stages.indexOf(shownStage));
</script>

<div class="flex max-w-full min-w-0 flex-col gap-1">
	{#if shownStage}
		<p class="text-xs text-muted-foreground">Current stage: {shownStage}</p>
	{/if}
	<ol
		aria-label={`${stepName} paperwork stages`}
		data-slot="onboarding-packet-stages"
		class="flex w-full min-w-0 gap-3 overflow-x-auto pb-2"
	>
		{#each stages as stage, index (index)}
			<li
				aria-current={index === currentIndex ? 'step' : undefined}
				class="relative flex min-w-0 min-w-28 flex-1 flex-col items-center"
			>
				<div
					class="flex min-h-10 w-full min-w-0 flex-col items-center gap-2 text-center text-sm font-medium text-muted-foreground"
				>
					<span class="sr-only">Step {index + 1}:</span>
					<span
						aria-hidden="true"
						class="flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border border-border bg-background text-[0.625rem] font-semibold text-muted-foreground shadow-sm"
					>
						{index + 1}
					</span>
					<span class="grid min-w-0 gap-1">
						<span class="max-w-40 min-w-0 text-sm leading-tight font-medium text-balance">{stage}</span>
					</span>
				</div>
				{#if index < stages.length - 1}
					<span
						aria-hidden="true"
						class="absolute top-[0.5625rem] right-[calc(-50%+0.9375rem)] left-[calc(50%+0.9375rem)] h-px overflow-hidden bg-muted-foreground/25"
					></span>
				{/if}
			</li>
		{/each}
	</ol>
</div>
