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
		data,
		columns: columnsProp,
		table: tableProp,
		initialSortKey,
		initialSortDirection,
		pageSize,
		groupBy,
		filterFn,
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
		footer
	}: Props = $props();

	const internalTable =
		!tableProp && data
			? useDataTable({
					data: () => data!,
					columns: columnsProp,
					initialSortKey,
					initialSortDirection,
					pageSize,
					groupBy,
					filterFn
				})
			: undefined;

	const table = $derived(tableProp ?? internalTable!);
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
					<th scope="col" aria-sort={ariaSort(col.key)}>
						<button type="button" class="column-sort" onclick={() => table.toggleSort(col.key)}>
							<span class="column-label"
								>{#if headerCell}{@render headerCell(col)}{:else}{col.header}{/if}</span
							>
						</button>
					</th>
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
						<tr class="group-header">
							<td colspan={cols.length}>
								<button type="button" class="group-toggle" onclick={() => table.toggleGroup(group.key)}>
									<span>{group.label} <span class="group-count">({group.rows.length})</span></span>
								</button>
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

	{#if table.pageSize > 0 && table.totalPages > 1 && table.groups.length === 0}
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
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.data-table-search {
		padding: var(--sp-4) var(--sp-5);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.data-table-search input {
		width: 100%;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	thead {
		background: var(--surface-subtle);
	}

	.sticky-header thead {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
	}

	th {
		padding: 0;
		text-align: left;
		border-bottom: var(--border-thin);
		white-space: nowrap;
		background: var(--surface-subtle);
	}

	.column-sort {
		width: 100%;
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		padding: 10px 14px;
		border: none;
		background: transparent;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		line-height: 1.2;
		text-transform: uppercase;
		cursor: pointer;
	}

	.column-sort:hover {
		color: var(--text-primary);
	}

	.column-sort:focus-visible {
		outline: var(--focus-outline);
		outline-offset: -2px;
		box-shadow: inset 0 0 0 2px rgba(196, 127, 0, 0.18);
	}

	td {
		padding: 10px 14px;
		border-bottom: var(--border-rule);
		color: var(--text-secondary);
		line-height: 1.45;
		vertical-align: top;
		transition: background-color var(--transition-fast);
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	tbody tr:hover > td {
		background: color-mix(in srgb, var(--surface-subtle) 76%, var(--surface-panel) 24%);
	}

	tr.clickable {
		cursor: pointer;
	}

	tr.clickable:hover > td {
		background: color-mix(in srgb, var(--surface-subtle) 64%, var(--surface-panel) 36%);
	}

	tr.group-header {
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	tr.group-header td {
		padding: 0;
		border-bottom: var(--border-thin);
	}

	.group-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: 10px 14px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.group-toggle:hover {
		color: var(--text-primary);
	}

	.group-toggle:focus-visible {
		outline: var(--focus-outline);
		outline-offset: -2px;
		box-shadow: inset 0 0 0 2px rgba(196, 127, 0, 0.18);
	}

	.group-count {
		color: var(--amber-dark);
	}

	.compact th,
	.compact td {
		padding: 8px 10px;
	}

	.compact .column-sort,
	.compact .group-toggle {
		padding: 8px 10px;
	}

	.striped tbody tr:nth-child(even):not(.group-header) > td {
		background: color-mix(in srgb, var(--surface-subtle) 36%, var(--surface-panel) 64%);
	}

	.striped tbody tr:nth-child(even):not(.group-header):hover > td {
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
	}

	.sticky-first-column th:first-child,
	.sticky-first-column td:first-child {
		position: sticky;
		left: 0;
		z-index: 1;
		background: var(--surface-panel);
	}

	.sticky-first-column thead th:first-child {
		background: var(--surface-subtle);
		z-index: calc(var(--z-sticky) + 1);
	}

	.data-table-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-4);
		padding: var(--sp-4) var(--sp-5);
		border-top: var(--border-thin);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	@media (max-width: 640px) {
		th,
		td {
			padding: 8px 10px;
			font-size: var(--text-sm);
		}

		.column-sort,
		.group-toggle {
			padding: 8px 10px;
		}

		.sticky-first-column th:first-child,
		.sticky-first-column td:first-child {
			max-width: 120px;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
</style>
