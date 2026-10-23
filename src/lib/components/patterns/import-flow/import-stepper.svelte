<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { STEPS, stepIndex, type FlowStep } from './flowTypes';

	let { current }: { current: FlowStep } = $props();

	const currentIndex = $derived(stepIndex(current));
</script>

<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase sm:hidden">
	{currentIndex + 1} of {STEPS.length} · {STEPS[currentIndex].label}
</p>
<ol aria-label="Import steps" class="hidden items-center gap-1 sm:flex">
	{#each STEPS as item, index (item.step)}
		<li
			aria-current={index === currentIndex ? 'step' : undefined}
			class={cn(
				'flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs font-semibold tracking-[0.06em] uppercase',
				index === currentIndex ? 'bg-chrome text-chrome-text' : 'text-muted-foreground'
			)}
		>
			<span class={cn(index === currentIndex && 'text-accent', index < currentIndex && 'text-success-foreground')}>
				{String(index + 1).padStart(2, '0')}
			</span>
			{item.label}
		</li>
	{/each}
</ol>
