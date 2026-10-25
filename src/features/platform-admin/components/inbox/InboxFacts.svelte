<script lang="ts">
	let { facts }: { facts: { label: string; value: string }[] } = $props();
</script>

<dl class="border-t border-border">
	{#each facts as fact (fact.label)}
		<div class="grid gap-x-4 gap-y-0.5 border-b border-border py-2.5 sm:grid-cols-[180px_minmax(0,1fr)]">
			<dt class="font-mono text-[11px] leading-5 tracking-[0.08em] text-muted-foreground uppercase">{fact.label}</dt>
			<dd class="text-sm leading-5 break-words text-foreground">{fact.value}</dd>
		</div>
	{/each}
</dl>
