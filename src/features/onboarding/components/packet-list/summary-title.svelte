<script lang="ts">
	let {
		title,
		meta = []
	}: {
		title: string;
		meta?: Array<string | null | undefined>;
	} = $props();

	const visibleMeta = $derived(meta.filter((item): item is string => Boolean(item)));
</script>

<div data-slot="onboarding-packet-summary-title" class="flex min-w-0 flex-col gap-1">
	<span class="truncate text-lg font-semibold text-foreground">{title}</span>
	{#if visibleMeta.length > 0}
		<span
			class="flex min-w-0 items-center gap-1 overflow-hidden font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground max-sm:flex-wrap"
		>
			{#each visibleMeta as item, index (`${item}-${index}`)}
				{#if index > 0}<span class="opacity-50">·</span>{/if}
				<span>{item}</span>
			{/each}
		</span>
	{/if}
</div>
