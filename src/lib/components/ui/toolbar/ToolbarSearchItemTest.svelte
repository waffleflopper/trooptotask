<script lang="ts">
	import ToolbarSearchItem from './ToolbarSearchItem.svelte';
	import type { ToolbarSearchItemMode } from './toolbar.types';

	let mode = $state<ToolbarSearchItemMode>('full');
	let search = $state('');
</script>

<button type="button" onclick={() => (mode = mode === 'full' ? 'compact' : 'full')}>Toggle mode</button>
<p data-testid="bound-search">{search}</p>

<ToolbarSearchItem
	{mode}
	ariaLabel="Search personnel"
	placeholder="Search name, rank, or MOS..."
	testId="toolbar-search-item-input"
	bind:value={search}
/>
