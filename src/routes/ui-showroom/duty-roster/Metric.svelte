<script lang="ts">
	let {
		label,
		value,
		detail = '',
		tone = 'default'
	}: {
		label: string;
		value: string;
		detail?: string;
		tone?: 'default' | 'warning';
	} = $props();
</script>

<div class="grid gap-1 rounded-lg border p-3">
	<span class="text-xs text-muted-foreground">{label}</span>
	<strong class={tone === 'warning' ? 'text-xl font-semibold text-warning-foreground' : 'text-xl font-semibold'}
		>{value}</strong
	>
	{#if detail}
		<span class="text-xs text-muted-foreground">{detail}</span>
	{/if}
</div>
