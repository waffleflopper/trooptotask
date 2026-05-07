<script lang="ts" generics="T">
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import type { ColumnDef, DataTableState } from './types.js';

	type Props = {
		table: DataTableState<T>;
		column: ColumnDef<T>;
		label?: string;
	};

	let { table, column, label = column.header }: Props = $props();
	const isSorted = $derived(table.sortKey === column.key);
	const direction = $derived(isSorted ? table.sortDirection : undefined);
</script>

<button
	type="button"
	class="-ml-2 inline-flex h-8 items-center justify-start gap-1.5 rounded-sm bg-transparent px-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0"
	aria-label={column.headerAriaLabel ?? `Sort by ${label}`}
	onclick={() => table.toggleSort(column.key)}
>
	<span>{label}</span>
	{#if direction === 'asc'}
		<ArrowUpIcon aria-hidden="true" />
	{:else if direction === 'desc'}
		<ArrowDownIcon aria-hidden="true" />
	{:else}
		<ChevronsUpDownIcon aria-hidden="true" />
	{/if}
</button>
