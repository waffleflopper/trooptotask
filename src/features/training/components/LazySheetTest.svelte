<script lang="ts">
	import LazySheet from './LazySheet.svelte';

	let { load, onClose = () => {} }: { load: () => Promise<{ label: string }>; onClose?: () => void } = $props();
</script>

<LazySheet {load} title="Manage views" {onClose}>
	{#snippet children(module)}
		<p data-testid="loaded">{module.label}</p>
	{/snippet}
</LazySheet>
