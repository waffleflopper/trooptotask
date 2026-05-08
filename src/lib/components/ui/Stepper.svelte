<script lang="ts">
	interface Props {
		stages: string[];
		currentStage: string;
		onStageClick?: (stage: string) => void;
		disabled?: boolean;
	}

	let { stages, currentStage, onStageClick, disabled = false }: Props = $props();

	function getStageStatus(stage: string): 'completed' | 'current' | 'upcoming' {
		const currentIndex = stages.indexOf(currentStage);
		const stageIndex = stages.indexOf(stage);
		if (stageIndex < currentIndex) return 'completed';
		if (stageIndex === currentIndex) return 'current';
		return 'upcoming';
	}
</script>

<div class="flex w-full items-center gap-0" role="group" aria-label="Progress steps" data-slot="stepper">
	{#each stages as stage, i (stage)}
		{@const status = getStageStatus(stage)}
		{#if i > 0}
			<div
				class="h-px min-w-2 flex-1 bg-border transition-colors"
				class:bg-primary={status === 'completed' || status === 'current'}
			></div>
		{/if}
		<button
			type="button"
			aria-current={status === 'current' ? 'step' : undefined}
			data-state={status}
			class="group flex min-w-0 flex-col items-center gap-1 rounded-md bg-transparent p-1 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
			disabled={disabled || !onStageClick}
			onclick={() => onStageClick?.(stage)}
			title={stage}
		>
			<span
				class="relative flex size-4 shrink-0 rounded-full border border-input bg-background transition-colors group-data-[state=completed]:border-primary group-data-[state=completed]:bg-primary group-data-[state=current]:border-primary group-data-[state=current]:bg-primary"
			>
				{#if status === 'completed' || status === 'current'}
					<span
						class="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground"
					></span>
				{/if}
			</span>
			<span
				class="max-w-20 truncate text-center font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground group-data-[state=current]:text-foreground group-data-[state=completed]:text-muted-foreground"
				>{stage}</span
			>
		</button>
	{/each}
</div>
