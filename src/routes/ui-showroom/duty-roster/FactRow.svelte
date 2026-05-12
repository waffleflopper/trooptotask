<script lang="ts">
	let { label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' } = $props();
</script>

<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
	<span class="text-sm text-muted-foreground">{label}</span>
	<strong
		class={tone === 'warning'
			? 'text-sm font-semibold text-warning-foreground'
			: 'text-sm font-semibold text-foreground'}
	>
		{value}
	</strong>
</div>
