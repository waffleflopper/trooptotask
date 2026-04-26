<script lang="ts">
	import ToolbarFilterSelect from './ToolbarFilterSelect.svelte';
	import ToolbarGroup from './ToolbarGroup.svelte';
	import ToolbarViewToggle from './ToolbarViewToggle.svelte';
	import type { ToolbarGroupCompactStrategy, ToolbarStatefulControlMode } from './toolbar.types';

	interface Props {
		mode?: ToolbarStatefulControlMode;
		compactStrategy?: ToolbarGroupCompactStrategy;
	}

	let { mode = 'full', compactStrategy = 'items-first' }: Props = $props();

	let groupId = $state('');
	let scope = $state('all');
	let viewMode = $state('by-group');

	const groupOptions = [
		{ value: '', label: 'Group: All' },
		{ value: 'alpha', label: 'Alpha' },
		{ value: 'bravo', label: 'Bravo' }
	];

	const scopeOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'gaps', label: 'Gaps' }
	];

	const viewOptions = [
		{ value: 'alphabetical', label: 'A-Z', title: 'Show personnel alphabetically' },
		{ value: 'by-group', label: 'By Group', title: 'Show personnel by group' }
	];

	const activeCount = $derived((groupId ? 1 : 0) + (scope === 'gaps' ? 1 : 0));
</script>

<p data-testid="state">{groupId || 'all'}|{scope}|{viewMode}|{activeCount}</p>

<ToolbarGroup label="Filters" {activeCount} {compactStrategy} {mode} testId="filters-group">
	{#snippet full()}
		<ToolbarFilterSelect
			ariaLabel="Group filter"
			options={groupOptions}
			defaultValue=""
			width="wide"
			mode="full"
			bind:value={groupId}
		/>
		<ToolbarFilterSelect
			ariaLabel="Critical Tasks matrix scope"
			options={scopeOptions}
			defaultValue="all"
			mode="full"
			bind:value={scope}
		/>
		<ToolbarViewToggle
			ariaLabel="Critical Tasks matrix view mode"
			options={viewOptions}
			mode="full"
			bind:value={viewMode}
		/>
	{/snippet}

	{#snippet panel()}
		<ToolbarFilterSelect
			ariaLabel="Group filter"
			options={groupOptions}
			defaultValue=""
			width="wide"
			mode="full"
			bind:value={groupId}
		/>
		<ToolbarFilterSelect
			ariaLabel="Critical Tasks matrix scope"
			options={scopeOptions}
			defaultValue="all"
			mode="full"
			bind:value={scope}
		/>
		<ToolbarViewToggle
			ariaLabel="Critical Tasks matrix view mode"
			options={viewOptions}
			mode="full"
			bind:value={viewMode}
		/>
	{/snippet}
</ToolbarGroup>
