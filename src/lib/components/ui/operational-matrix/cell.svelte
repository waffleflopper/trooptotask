<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { getOperationalMatrixContext } from './context.js';
	import type {
		OperationalMatrixCellSelection,
		OperationalMatrixColumn,
		OperationalMatrixRow,
		OperationalMatrixSelectHandler
	} from './types.js';

	type Props = HTMLAttributes<HTMLTableCellElement> & {
		row: OperationalMatrixRow;
		column: OperationalMatrixColumn;
		rowId?: string;
		columnId?: string;
		disabled?: boolean;
		readOnly?: boolean;
		selected?: boolean;
		ariaLabel?: string;
		onSelect?: OperationalMatrixSelectHandler;
		children?: Snippet;
	};

	let {
		row,
		column,
		rowId = row.id,
		columnId = column.id,
		disabled = false,
		readOnly = false,
		selected = false,
		ariaLabel,
		onSelect,
		children,
		...restProps
	}: Props = $props();

	const matrix = getOperationalMatrixContext();

	const isDisabled = $derived(matrix.isCellDisabled(row, column, disabled));
	const isReadOnly = $derived(matrix.isCellReadOnly(row, column, readOnly));
	const isSelected = $derived(matrix.isCellSelected(rowId, columnId, selected));
	const selectable = $derived(!isDisabled && !isReadOnly && (onSelect || matrix.onCellSelect()));
	const accessibleLabel = $derived(ariaLabel ?? `${row.label} ${column.label}`);

	function select(source: OperationalMatrixCellSelection['source']) {
		if (isDisabled || isReadOnly) {
			return;
		}

		const selection = { row, column, rowId, columnId, source };
		onSelect?.(selection);
		matrix.selectCell(selection);
	}
</script>

<td
	data-slot="operational-matrix-cell"
	data-matrix-cell
	data-row-id={rowId}
	data-column-id={columnId}
	data-selected={isSelected || undefined}
	data-disabled={isDisabled || undefined}
	data-readonly={isReadOnly || undefined}
	{...restProps}
>
	{#if selectable}
		<button
			type="button"
			aria-label={accessibleLabel}
			data-slot="operational-matrix-cell-trigger"
			onclick={() => select('pointer')}
		>
			{@render children?.()}
		</button>
	{:else}
		<div aria-label={accessibleLabel} data-slot="operational-matrix-cell-content">
			{@render children?.()}
		</div>
	{/if}
</td>
