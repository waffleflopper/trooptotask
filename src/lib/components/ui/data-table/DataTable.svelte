<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { useDataTable } from './useDataTable.svelte';
	import type { ColumnDef, DataTableState, GroupDef, SortDirection } from './useDataTable.svelte';
	import EmptyState from '../EmptyState.svelte';

	interface GroupHeaderContext {
		key: string;
		label: string;
		count: number;
		collapsed: boolean;
		toggle: () => void;
	}

	interface Props {
		data?: T[];
		columns: ColumnDef<T>[];
		table?: DataTableState<T>;
		initialSortKey?: string;
		initialSortDirection?: SortDirection;
		pageSize?: number;
		groupBy?: GroupDef<T>;
		filterFn?: (row: T, query: string) => boolean;
		ariaLabel?: string;
		emptyMessage?: string;
		showSearch?: boolean;
		searchPlaceholder?: string;
		onRowClick?: (row: T) => void;
		compact?: boolean;
		striped?: boolean;
		stickyHeader?: boolean;
		stickyFirstColumn?: boolean;
		maxHeight?: string;
		cell?: Snippet<[T, ColumnDef<T>]>;
		row?: Snippet<[T, ColumnDef<T>[]]>;
		headerCell?: Snippet<[ColumnDef<T>]>;
		groupHeader?: Snippet<[GroupHeaderContext]>;
		toolbar?: Snippet<[DataTableState<T>]>;
		footer?: Snippet<[DataTableState<T>]>;
	}

	let {
		ariaLabel,
		emptyMessage = 'No data.',
		showSearch = false,
		searchPlaceholder = 'Search...',
		onRowClick,
		compact = false,
		striped = false,
		stickyHeader = true,
		stickyFirstColumn = false,
		maxHeight,
		cell,
		row: rowSnippet,
		headerCell,
		groupHeader: groupHeaderSnippet,
		toolbar,
		footer,
		...rest
	}: Props = $props();

	// Snapshot init-time props for useDataTable construction.
	// Only ariaLabel needs to stay reactive (used in template).
	const { data: initData, columns: initColumns, table: initTable, ...initOptions } = rest;

	const internalTable =
		!initTable && initData
			? useDataTable({
					data: () => initData,
					columns: initColumns,
					...initOptions
				})
			: undefined;

	const table = $derived(initTable ?? internalTable!);
	const cols = $derived(table.columns);

	function ariaSort(colKey: string): 'ascending' | 'descending' | undefined {
		if (table.sortKey !== colKey) return undefined;
		return table.sortDirection === 'asc' ? 'ascending' : 'descending';
	}
</script>

<div
	class="data-table"
	class:compact
	class:striped
	class:sticky-header={stickyHeader}
	class:sticky-first-column={stickyFirstColumn}
	style:max-height={maxHeight}
>
	{#if toolbar}
		{@render toolbar(table)}
	{/if}

	{#if showSearch}
		<div class="data-table-search">
			<input
				type="search"
				class="input"
				placeholder={searchPlaceholder}
				value={table.search}
				oninput={(e) => table.setSearch(e.currentTarget.value)}
			/>
		</div>
	{/if}

	<table aria-label={ariaLabel}>
		<thead>
			<tr>
				{#each cols as col}
					<th scope="col" aria-sort={ariaSort(col.key)} onclick={() => table.toggleSort(col.key)}
						>{#if headerCell}{@render headerCell(col)}{:else}{col.header}{/if}</th
					>
				{/each}
			</tr>
		</thead>
		{#if table.groups.length > 0}
			<tbody>
				{#each table.groups as group}
					{#if groupHeaderSnippet}
						<tr class="group-header">
							<td colspan={cols.length}>
								{@render groupHeaderSnippet({
									key: group.key,
									label: group.label,
									count: group.rows.length,
									collapsed: group.collapsed,
									toggle: () => table.toggleGroup(group.key)
								})}
							</td>
						</tr>
					{:else}
						<tr class="group-header" onclick={() => table.toggleGroup(group.key)}>
							<td colspan={cols.length}>
								{group.label} ({group.rows.length})
							</td>
						</tr>
					{/if}
					{#if !group.collapsed}
						{#each group.rows as row}
							{#if rowSnippet}
								{@render rowSnippet(row, cols)}
							{:else}
								<tr class:clickable={!!onRowClick} onclick={onRowClick ? () => onRowClick(row) : undefined}>
									{#each cols as col}
										<td
											>{#if cell}{@render cell(row, col)}{:else}{String(col.value(row) ?? '')}{/if}</td
										>
									{/each}
								</tr>
							{/if}
						{/each}
					{/if}
				{/each}
			</tbody>
		{:else if table.rows.length > 0}
			<tbody>
				{#each table.rows as row}
					{#if rowSnippet}
						{@render rowSnippet(row, cols)}
					{:else}
						<tr class:clickable={!!onRowClick} onclick={onRowClick ? () => onRowClick(row) : undefined}>
							{#each cols as col}
								<td
									>{#if cell}{@render cell(row, col)}{:else}{String(col.value(row) ?? '')}{/if}</td
								>
							{/each}
						</tr>
					{/if}
				{/each}
			</tbody>
		{/if}
	</table>

	{#if table.groups.length === 0 && table.rows.length === 0}
		<EmptyState message={emptyMessage} />
	{/if}

	{#if table.pageSize > 0 && table.totalPages > 1}
		<div class="data-table-pagination">
			<button class="btn btn-secondary btn-sm" disabled={table.page <= 1} onclick={() => table.setPage(table.page - 1)}
				>Previous</button
			>
			<span>Page {table.page} of {table.totalPages}</span>
			<button
				class="btn btn-secondary btn-sm"
				disabled={table.page >= table.totalPages}
				onclick={() => table.setPage(table.page + 1)}>Next</button
			>
		</div>
	{/if}

	{#if footer}
		{@render footer(table)}
	{/if}
</div>

<style>
	.data-table {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
	}

	.data-table-search {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
	}

	.data-table-search input {
		width: 100%;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-base);
	}

	thead {
		background: var(--color-surface-variant);
	}

	.sticky-header thead {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
	}

	th {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 2px solid var(--color-border);
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		background: var(--color-surface-variant);
	}

	th:hover {
		color: var(--color-text);
	}

	td {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
		color: var(--color-text);
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	tbody tr:hover {
		background: var(--color-surface-variant);
	}

	tr.clickable {
		cursor: pointer;
	}

	tr.clickable:hover {
		background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
	}

	tr.group-header {
		cursor: pointer;
		background: var(--color-surface-variant);
	}

	tr.group-header td {
		padding: var(--spacing-sm) var(--spacing-md);
		font-weight: var(--font-weight-semibold);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		border-bottom: 1px solid var(--color-border);
	}

	tr.group-header:hover {
		background: var(--color-border);
	}

	.compact th,
	.compact td {
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.compact tr.group-header td {
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.striped tbody tr:nth-child(even):not(.group-header) {
		background: var(--color-surface-variant);
	}

	.striped tbody tr:nth-child(even):not(.group-header):hover {
		background: var(--color-border);
	}

	.sticky-first-column th:first-child,
	.sticky-first-column td:first-child {
		position: sticky;
		left: 0;
		z-index: 1;
		background: var(--color-surface);
	}

	.sticky-first-column thead th:first-child {
		background: var(--color-surface-variant);
		z-index: calc(var(--z-sticky) + 1);
	}

	.data-table-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		border-top: 1px solid var(--color-divider);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	@media (max-width: 640px) {
		th,
		td {
			padding: var(--spacing-xs) var(--spacing-sm);
			font-size: var(--font-size-sm);
		}

		.sticky-first-column th:first-child,
		.sticky-first-column td:first-child {
			max-width: 120px;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
</style>
