<script lang="ts">
	import { cn } from '$lib/utils.js';

	/** The DA 6 header: Nature of duty, Organization, From and To. */
	let { fields }: { fields: readonly { label: string; value: string }[] } = $props();
</script>

<dl class="grid grid-cols-2 border-b lg:grid-cols-[2fr_2fr_1fr_1fr] print:grid-cols-[2fr_2fr_1fr_1fr]">
	{#each fields as field, index (field.label)}
		<div
			class={cn(
				'min-w-0 px-4 py-2.5 print:px-2 print:py-1',
				index % 2 === 1 && 'border-l',
				index >= 2 && 'max-lg:border-t print:border-t-0',
				index === 2 && 'lg:border-l print:border-l'
			)}
		>
			<dt class="font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				{field.label}
			</dt>
			<dd class={cn('truncate', field.value === 'Open' && 'text-muted-foreground')}>{field.value}</dd>
		</div>
	{/each}
</dl>
