<script lang="ts">
	import { Progress } from '$lib/components/ui/progress/index.js';

	let {
		value,
		max,
		label = `${value}/${max} complete`,
		prefixLabel
	}: {
		value: number;
		max: number;
		label?: string;
		prefixLabel?: string;
	} = $props();

	const percent = $derived(max > 0 ? Math.round((value / max) * 100) : 0);
</script>

<div data-slot="onboarding-packet-progress" class="flex flex-col gap-1">
	{#if prefixLabel}
		<span class="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">{prefixLabel}</span>
	{/if}
	<Progress value={percent} aria-label={label} />
	<span class="whitespace-nowrap font-mono text-xs text-muted-foreground">{label}</span>
</div>
