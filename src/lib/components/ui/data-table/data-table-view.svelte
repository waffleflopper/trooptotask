<script lang="ts" generics="T">
	import { cn } from '$lib/utils.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import DataTableRoot from './data-table-root.svelte';
	import DataTableSortableHeader from './data-table-sortable-header.svelte';
	import DataTableEmpty from './data-table-empty.svelte';
	import type { EmptyTitleLevel } from '$lib/components/ui/empty/index.js';
	import DataTableLoading from './data-table-loading.svelte';
	import DataTablePagination from './data-table-pagination.svelte';
	import { eventStartedInInteractiveDescendant } from './data-table-context.js';
	import { columnCellClass } from './column-class.js';
	import type {
		ColumnDef,
		DataTableCellSnippet,
		DataTableGroupHeaderSnippet,
		DataTableHeaderSnippet,
		DataTableRowDetailSnippet,
		DataTableRowSnippet,
		DataTableState,
		DataTableStateSnippet,
		PageLabels
	} from './types.js';

	type Props = {
		table: DataTableState<T>;
		ariaLabel?: string;
		emptyMessage?: string;
		emptyLevel?: EmptyTitleLevel;
		loading?: boolean;
		loadingRows?: number;
		onRowClick?: (row: T) => void;
		rowActionLabel?: (row: T) => string;
		density?: 'default' | 'dense';
		variant?: 'framed' | 'editorial';
		/** When the table is narrower than 42rem, rows become wrapping lines instead of columns; see the catalog. */
		stacked?: boolean;
		compact?: boolean;
		striped?: boolean;
		stickyHeader?: boolean;
		stickyFirstColumn?: boolean;
		maxHeight?: string;
		scrollRegionLabel?: string;
		cell?: DataTableCellSnippet<T>;
		row?: DataTableRowSnippet<T>;
		rowDetail?: DataTableRowDetailSnippet<T>;
		rowDetailVisible?: (row: T) => boolean;
		/**
		 * Hidden rows stay mounted, so a filter that changes as the user types does not remount them. Applies to
		 * default-rendered rows on an unpaginated table: a `row` snippet renders its own row and pages count hidden rows. A
		 * group counts only its shown rows and hides its header when it has none.
		 */
		rowHidden?: (row: T) => boolean;
		pageLabels?: PageLabels;
		headerCell?: DataTableHeaderSnippet<T>;
		groupHeader?: DataTableGroupHeaderSnippet;
		toolbar?: DataTableStateSnippet<T>;
		footer?: DataTableStateSnippet<T>;
	};

	let {
		table,
		ariaLabel,
		emptyMessage = 'No data.',
		emptyLevel,
		loading = false,
		loadingRows = 5,
		onRowClick,
		rowActionLabel,
		density = 'default',
		variant = 'framed',
		stacked = false,
		compact = false,
		striped = false,
		stickyHeader = false,
		stickyFirstColumn = false,
		maxHeight,
		scrollRegionLabel,
		cell,
		row: rowSnippet,
		rowDetail,
		rowDetailVisible,
		rowHidden,
		pageLabels,
		headerCell,
		groupHeader,
		toolbar,
		footer
	}: Props = $props();

	const resolvedDensity = $derived(compact ? 'dense' : density);
	const cols = $derived(table.columns);
	const allRowsHidden = $derived(rowHidden !== undefined && table.rows.every(rowHidden));

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

	function handleGroupRowClick(event: MouseEvent, groupKey: string): void {
		if (eventStartedInInteractiveDescendant(event)) return;
		table.toggleGroup(groupKey);
	}

	function handleGroupRowKeydown(event: KeyboardEvent, groupKey: string): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		if (eventStartedInInteractiveDescendant(event)) return;

		event.preventDefault();
		table.toggleGroup(groupKey);
	}
</script>

{#snippet bodyCell(row: T, column: ColumnDef<T>)}
	{@const alignClass = columnCellClass(column)}
	{#if column.rowHeader}
		<th
			scope="row"
			data-slot="table-cell"
			data-max-width={column.maxWidth}
			class={cn('p-2 text-left align-middle font-normal whitespace-nowrap', alignClass)}
		>
			{#if cell}{@render cell(row, column)}{:else}{String(column.value(row) ?? '')}{/if}
		</th>
	{:else}
		<Table.Cell class={alignClass} data-max-width={column.maxWidth}>
			{#if cell}{@render cell(row, column)}{:else}{String(column.value(row) ?? '')}{/if}
		</Table.Cell>
	{/if}
{/snippet}

<DataTableRoot density={resolvedDensity} {variant} {stacked} {striped} {stickyHeader} {stickyFirstColumn} {maxHeight}>
	{#if toolbar}
		<div data-slot="data-table-toolbar" class="border-b border-border bg-muted/20 p-2">
			{@render toolbar(table)}
		</div>
	{/if}

	<Table.Root aria-label={ariaLabel} {scrollRegionLabel}>
		<Table.Header>
			<Table.Row>
				{#each cols as column (column.key)}
					<Table.Head
						scope="col"
						aria-sort={ariaSort(column)}
						class={columnCellClass(column)}
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
					{@const shownCount = rowHidden ? group.rows.filter((row) => !rowHidden(row)).length : group.rows.length}
					<Table.Row
						data-slot="data-table-group-row"
						hidden={shownCount === 0}
						class="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						tabindex={0}
						aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.label}`}
						aria-expanded={!group.collapsed}
						onclick={(event) => handleGroupRowClick(event, group.key)}
						onkeydown={(event) => handleGroupRowKeydown(event, group.key)}
					>
						<Table.Cell colspan={cols.length} class="bg-muted/45 p-0">
							{#if groupHeader}
								<div class="flex items-center gap-2 px-3 py-2">
									{@render groupHeader({
										key: group.key,
										label: group.label,
										count: shownCount,
										collapsed: group.collapsed,
										toggle: () => table.toggleGroup(group.key)
									})}
								</div>
							{:else}
								<button
									type="button"
									class="flex w-full items-center justify-between px-3 py-2 text-left font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
									onclick={() => table.toggleGroup(group.key)}
								>
									<span>{group.label}</span>
									<span>{shownCount}</span>
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
									hidden={rowHidden?.(row)}
									tabindex={onRowClick && !table.isRowDisabled(row) ? 0 : undefined}
									aria-label={onRowClick && rowActionLabel ? rowActionLabel(row) : undefined}
									aria-disabled={table.isRowDisabled(row) || undefined}
									onclick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
									onkeydown={onRowClick ? (event) => handleRowKeydown(event, row) : undefined}
								>
									{#each cols as column (column.key)}
										{@render bodyCell(row, column)}
									{/each}
								</Table.Row>
								{#if rowDetail && rowDetailVisible?.(row)}
									<Table.Row data-slot="data-table-detail-row" hidden={rowHidden?.(row)}>
										<Table.Cell colspan={cols.length} class="bg-muted/25 whitespace-normal">
											<!-- The detail spans every column, so on a scrolled narrow table it is pinned to the visible width. -->
											<div data-slot="data-table-detail" class="sticky left-2 w-[calc(100cqw-1rem)] min-w-0">
												{@render rowDetail(row)}
											</div>
										</Table.Cell>
									</Table.Row>
								{/if}
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
							hidden={rowHidden?.(row)}
							tabindex={onRowClick && !table.isRowDisabled(row) ? 0 : undefined}
							aria-label={onRowClick && rowActionLabel ? rowActionLabel(row) : undefined}
							aria-disabled={table.isRowDisabled(row) || undefined}
							onclick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
							onkeydown={onRowClick ? (event) => handleRowKeydown(event, row) : undefined}
						>
							{#each cols as column (column.key)}
								{@render bodyCell(row, column)}
							{/each}
						</Table.Row>
						{#if rowDetail && rowDetailVisible?.(row)}
							<Table.Row data-slot="data-table-detail-row" hidden={rowHidden?.(row)}>
								<Table.Cell colspan={cols.length} class="bg-muted/25 whitespace-normal">
									<div data-slot="data-table-detail" class="sticky left-2 w-[calc(100cqw-1rem)] min-w-0">
										{@render rowDetail(row)}
									</div>
								</Table.Cell>
							</Table.Row>
						{/if}
					{/if}
				{/each}
			</Table.Body>
		{/if}
	</Table.Root>

	{#if !loading && (table.rows.length === 0 || allRowsHidden)}
		<DataTableEmpty message={emptyMessage} level={emptyLevel} />
	{/if}

	{#if !loading && table.groups.length === 0}
		<DataTablePagination {table} {variant} labels={pageLabels} />
	{/if}

	{#if footer}
		<div data-slot="data-table-footer" class="border-t border-border bg-card p-2">
			{@render footer(table)}
		</div>
	{/if}
</DataTableRoot>
