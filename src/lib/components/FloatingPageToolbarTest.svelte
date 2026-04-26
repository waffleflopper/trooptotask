<script lang="ts">
	import FloatingPageToolbar from './FloatingPageToolbar.svelte';
	import ToolbarOverflowMenu from './ui/ToolbarOverflowMenu.svelte';

	interface Props {
		collapse?: 'wide' | 'medium' | 'narrow';
		leadingMin?: string;
		withActions?: boolean;
		withOverflow?: boolean;
	}

	let { collapse, leadingMin, withActions = true, withOverflow = false }: Props = $props();

	const overflowItems = [{ label: 'Add', onclick: () => undefined }];
</script>

{#if withOverflow}
	<FloatingPageToolbar ariaLabel="Test controls" {collapse} {leadingMin}>
		{#snippet leading()}
			<button type="button">History</button>
		{/snippet}

		{#if withActions}
			<button type="button">Add</button>
		{/if}

		{#snippet overflow()}
			<ToolbarOverflowMenu ariaLabel="More test actions" items={overflowItems} />
		{/snippet}
	</FloatingPageToolbar>
{:else}
	<FloatingPageToolbar ariaLabel="Test controls" {collapse} {leadingMin}>
		{#snippet leading()}
			<button type="button">History</button>
		{/snippet}

		{#if withActions}
			<button type="button">Add</button>
		{/if}
	</FloatingPageToolbar>
{/if}
