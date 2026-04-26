<script lang="ts">
	import FloatingPageToolbar from './FloatingPageToolbar.svelte';
	import ToolbarOverflowMenu from './ui/ToolbarOverflowMenu.svelte';
	import ToolbarFilterSelect from './ui/toolbar/ToolbarFilterSelect.svelte';
	import ToolbarGroup from './ui/toolbar/ToolbarGroup.svelte';
	import ToolbarSearchItem from './ui/toolbar/ToolbarSearchItem.svelte';

	interface Props {
		collapse?: 'wide' | 'medium' | 'narrow';
		leadingMin?: string;
		withActions?: boolean;
		withOverflow?: boolean;
		withCoordinatedControls?: boolean;
		containerWidth?: number;
		searchCompactAt?: number;
	}

	let {
		collapse,
		leadingMin,
		withActions = true,
		withOverflow = false,
		withCoordinatedControls = false,
		containerWidth,
		searchCompactAt
	}: Props = $props();

	const overflowItems = [{ label: 'Add', onclick: () => undefined }];
	const groupOptions = [
		{ value: '', label: 'All groups' },
		{ value: 'alpha', label: 'Alpha' }
	];
	let search = $state('');
	let groupId = $state('');
	let actionClicked = $state(false);
</script>

{#if withCoordinatedControls}
	<FloatingPageToolbar ariaLabel="Test controls" {collapse} {leadingMin} {containerWidth} {searchCompactAt}>
		{#snippet leading()}
			<p data-testid="coordinated-state">{search}|{groupId || 'all'}|{actionClicked}</p>
			<ToolbarGroup label="Filters" activeCount={groupId ? 1 : 0} testId="filters-group">
				{#snippet full()}
					<ToolbarFilterSelect
						ariaLabel="Group filter"
						options={groupOptions}
						defaultValue=""
						mode="full"
						bind:value={groupId}
					/>
				{/snippet}
			</ToolbarGroup>
			<ToolbarSearchItem ariaLabel="Search personnel" bind:value={search} />
		{/snippet}

		{#if withActions}
			<button type="button" onclick={() => (actionClicked = true)}>Add</button>
		{/if}

		{#snippet overflow()}
			<ToolbarOverflowMenu ariaLabel="More test actions" items={overflowItems} />
		{/snippet}
	</FloatingPageToolbar>
{:else if withOverflow}
	<FloatingPageToolbar ariaLabel="Test controls" {collapse} {leadingMin} {containerWidth}>
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
	<FloatingPageToolbar ariaLabel="Test controls" {collapse} {leadingMin} {containerWidth}>
		{#snippet leading()}
			<button type="button">History</button>
		{/snippet}

		{#if withActions}
			<button type="button">Add</button>
		{/if}
	</FloatingPageToolbar>
{/if}
