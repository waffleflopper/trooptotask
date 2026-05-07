<script lang="ts" generics="T">
	import { cn } from '$lib/utils.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import DataTableRoot from './data-table-root.svelte';
	import DataTableSortableHeader from './data-table-sortable-header.svelte';
	import DataTableEmpty from './data-table-empty.svelte';
	import DataTableLoading from './data-table-loading.svelte';
	import DataTablePagination from './data-table-pagination.svelte';
	import { eventStartedInInteractiveDescendant } from './data-table-context.js';
	import type {
		ColumnDef,
		DataTableCellSnippet,
		DataTableGroupHeaderSnippet,
		DataTableHeaderSnippet,
		DataTableRowSnippet,
		DataTableState,
		DataTableStateSnippet
	} from './types.js';

	type Props = {
		table: DataTableState<T>;
		ariaLabel?: string;
		emptyMessage?: string;
		loading?: boolean;
		loadingRows?: number;
		onRowClick?: (row: T) => void;
		rowActionLabel?: (row: T) => string;
		density?: 'default' | 'dense';
		compact?: boolean;
		striped?: boolean;
		stickyHeader?: boolean;
		stickyFirstColumn?: boolean;
		maxHeight?: string;
		cell?: DataTableCellSnippet<T>;
		row?: DataTableRowSnippet<T>;
		headerCell?: DataTableHeaderSnippet<T>;
		groupHeader?: DataTableGroupHeaderSnippet;
		toolbar?: DataTableStateSnippet<T>;
		footer?: DataTableStateSnippet<T>;
	};

	let {
		table,
		ariaLabel,
		emptyMessage = 'No data.',
		loading = false,
		loadingRows = 5,
		onRowClick,
		rowActionLabel,
		density = 'default',
		compact = false,
		striped = false,
		stickyHeader = false,
		stickyFirstColumn = false,
		maxHeight,
		cell,
		row: rowSnippet,
		headerCell,
		groupHeader,
		toolbar,
		footer
	}: Props = $props();

	const resolvedDensity = $derived(compact ? 'dense' : density);
	const cols = $derived(table.columns);

	function isSortable(column: ColumnDef<T>): boolean {
		return column.sortable !== false;
	}

	function ariaSort(column: ColumnDef<T>): 'ascending' | 'descending' | undefined {
		if (!isSortable(column) || table.sortKey !== column.key) return undefined;
		return table.sortDirection === 'asc' ? 'ascending' : 'descending';
	}

	function rowClass(row: T): string {
		return cn(
			onRowClick &&
				!table.isRowDisabled(row) &&
				'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
			table.isRowDisabled(row) && 'opacity-55'
		);
	}

	function handleRowClick(event: MouseEvent, row: T): void {
		if (!onRowClick || table.isRowDisabled(row) || eventStartedInInteractiveDescendant(event)) return;
		onRowClick(row);
	}

	function handleRowKeydown(event: KeyboardEvent, row: T): void {
		if (!onRowClick || table.isRowDisabled(row)) return;
		if (event.key !== 'Enter' && event.key !== ' ') return;
		if (eventStartedInInteractiveDescendant(event)) return;

		event.preventDefault();
		onRowClick(row);
	}
</script>

<DataTableRoot density={resolvedDensity} {striped} {stickyHeader} {stickyFirstColumn} {maxHeight}>
	{#if toolbar}
		<div
			data-slot="data-table-toolbar"
			class="border-b border-border bg-muted/20 p-2 [&_[data-slot=workspace-toolbar]]:h-auto [&_[data-slot=workspace-toolbar]]:rounded-none [&_[data-slot=workspace-toolbar]]:border-0 [&_[data-slot=workspace-toolbar]]:bg-transparent [&_[data-slot=workspace-toolbar]]:p-0 [&_[data-slot=workspace-toolbar]]:shadow-none"
		>
			{@render toolbar(table)}
		</div>
	{/if}

	<Table.Root aria-label={ariaLabel}>
		<Table.Header>
			<Table.Row>
				{#each cols as column (column.key)}
					<Table.Head
						scope="col"
						aria-sort={ariaSort(column)}
						class={cn(column.align === 'center' && 'text-center', column.align === 'right' && 'text-right')}
						style={column.width ? `width: ${column.width}` : undefined}
					>
						{#if headerCell}
							{@render headerCell(column)}
						{:else if isSortable(column)}
							<DataTableSortableHeader {table} {column} />
						{:else}
							<span aria-label={column.headerAriaLabel} class="inline-flex h-8 items-center">
								{column.header}
							</span>
						{/if}
					</Table.Head>
				{/each}
			</Table.Row>
		</Table.Header>

		{#if loading}
			<DataTableLoading columns={cols.length} rows={loadingRows} />
		{:else if table.groups.length > 0}
			<Table.Body>
				{#each table.groups as group (group.key)}
					<Table.Row data-slot="data-table-group-row">
						<Table.Cell colspan={cols.length} class="bg-muted/45 p-0">
							{#if groupHeader}
								{@render groupHeader({
									key: group.key,
									label: group.label,
									count: group.rows.length,
									collapsed: group.collapsed,
									toggle: () => table.toggleGroup(group.key)
								})}
							{:else}
								<button
									type="button"
									class="flex w-full items-center justify-between px-3 py-2 text-left font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
									onclick={() => table.toggleGroup(group.key)}
								>
									<span>{group.label}</span>
									<span>{group.rows.length}</span>
								</button>
							{/if}
						</Table.Cell>
					</Table.Row>
					{#if !group.collapsed}
						{#each group.rows as row, rowIndex (table.getRowKey(row, rowIndex))}
							{#if rowSnippet}
								{@render rowSnippet(row, cols)}
							{:else}
								<Table.Row
									class={rowClass(row)}
									tabindex={onRowClick && !table.isRowDisabled(row) ? 0 : undefined}
									aria-label={onRowClick && rowActionLabel ? rowActionLabel(row) : undefined}
									aria-disabled={table.isRowDisabled(row) || undefined}
									onclick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
									onkeydown={onRowClick ? (event) => handleRowKeydown(event, row) : undefined}
								>
									{#each cols as column (column.key)}
										<Table.Cell
											class={cn(column.align === 'center' && 'text-center', column.align === 'right' && 'text-right')}
										>
											{#if cell}{@render cell(row, column)}{:else}{String(column.value(row) ?? '')}{/if}
										</Table.Cell>
									{/each}
								</Table.Row>
							{/if}
						{/each}
					{/if}
				{/each}
			</Table.Body>
		{:else if table.rows.length > 0}
			<Table.Body>
				{#each table.rows as row, rowIndex (table.getRowKey(row, rowIndex))}
					{#if rowSnippet}
						{@render rowSnippet(row, cols)}
					{:else}
						<Table.Row
							class={rowClass(row)}
							tabindex={onRowClick && !table.isRowDisabled(row) ? 0 : undefined}
							aria-label={onRowClick && rowActionLabel ? rowActionLabel(row) : undefined}
							aria-disabled={table.isRowDisabled(row) || undefined}
							onclick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
							onkeydown={onRowClick ? (event) => handleRowKeydown(event, row) : undefined}
						>
							{#each cols as column (column.key)}
								<Table.Cell
									class={cn(column.align === 'center' && 'text-center', column.align === 'right' && 'text-right')}
								>
									{#if cell}{@render cell(row, column)}{:else}{String(column.value(row) ?? '')}{/if}
								</Table.Cell>
							{/each}
						</Table.Row>
					{/if}
				{/each}
			</Table.Body>
		{/if}
	</Table.Root>

	{#if !loading && table.groups.length === 0 && table.rows.length === 0}
		<DataTableEmpty message={emptyMessage} />
	{/if}

	{#if !loading && table.groups.length === 0}
		<DataTablePagination {table} />
	{/if}

	{#if footer}
		<div data-slot="data-table-footer" class="border-t border-border bg-card p-2">
			{@render footer(table)}
		</div>
	{/if}
</DataTableRoot>
