<script lang="ts" generics="T">
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import type { DataTableState } from './types.js';

	type Props = {
		table: DataTableState<T>;
		ariaLabel: string;
		placeholder?: string;
	};

	let { table, ariaLabel, placeholder = 'Search...' }: Props = $props();
</script>

<InputGroup.Root class="w-48 sm:w-64">
	<InputGroup.Addon>
		<SearchIcon aria-hidden="true" />
	</InputGroup.Addon>
	<InputGroup.Input
		type="search"
		aria-label={ariaLabel}
		{placeholder}
		value={table.search}
		oninput={(event) => table.setSearch(event.currentTarget.value)}
	/>
</InputGroup.Root>
