<script lang="ts">
	import FloatingPageToolbar from './FloatingPageToolbar.svelte';

	interface Props {
		collapse?: 'wide' | 'medium' | 'narrow';
		leadingMin?: string;
		withActions?: boolean;
	}

	let { collapse, leadingMin, withActions = true }: Props = $props();
</script>

<FloatingPageToolbar ariaLabel="Test controls" {collapse} {leadingMin}>
	{#snippet leading()}
		<button type="button">History</button>
	{/snippet}

	{#if withActions}
		<button type="button">Add</button>
	{/if}
</FloatingPageToolbar>
