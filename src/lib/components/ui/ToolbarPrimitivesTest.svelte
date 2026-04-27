<script lang="ts">
	import SegmentedControl from './SegmentedControl.svelte';
	import ToolbarOverflowMenu from './ToolbarOverflowMenu.svelte';
	import ToolbarSearch from './ToolbarSearch.svelte';
	import ToolbarSelect from './ToolbarSelect.svelte';
	import type { OverflowItem } from './OverflowMenu.types';

	interface Props {
		onSearchChange?: (value: string) => void;
		onSelectChange?: (value: string) => void;
		onSegmentChange?: (value: string) => void;
		onOverflowClick?: () => void;
		iconOnlyOverflow?: boolean;
	}

	let {
		onSearchChange = () => undefined,
		onSelectChange = () => undefined,
		onSegmentChange = () => undefined,
		onOverflowClick = () => undefined,
		iconOnlyOverflow = false
	}: Props = $props();

	let searchValue = $state('');
	let groupValue = $state('all');
	let viewValue = $state('alphabetical');

	const groupOptions = [
		{ value: 'all', label: 'Group: All' },
		{ value: 'alpha', label: 'Alpha (8)' }
	];

	const viewOptions = [
		{ value: 'alphabetical', label: 'A-Z' },
		{ value: 'by-group', label: 'By Group' }
	];

	const overflowItems = $derived<OverflowItem[]>([
		{
			label: 'Bulk Import',
			onclick: () => onOverflowClick()
		}
	]);
</script>

<ToolbarSearch
	ariaLabel="Roster search"
	placeholder="Search roster"
	testId="toolbar-search"
	bind:value={searchValue}
	onValueChange={onSearchChange}
/>

<ToolbarSelect ariaLabel="Group filter" options={groupOptions} bind:value={groupValue} onValueChange={onSelectChange} />

<SegmentedControl
	ariaLabel="Roster view"
	options={viewOptions}
	bind:value={viewValue}
	onValueChange={onSegmentChange}
/>

<ToolbarOverflowMenu ariaLabel="More roster actions" items={overflowItems} iconOnly={iconOnlyOverflow} />
