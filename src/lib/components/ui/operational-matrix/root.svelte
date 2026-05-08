<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { setOperationalMatrixContext } from './context.js';
	import type {
		OperationalMatrixCellIdentity,
		OperationalMatrixCellSelection,
		OperationalMatrixColumn,
		OperationalMatrixRow,
		OperationalMatrixRowGroup,
		OperationalMatrixSelectHandler
	} from './types.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		rows: OperationalMatrixRow[];
		columns: OperationalMatrixColumn[];
		rowGroups?: OperationalMatrixRowGroup[];
		selectedCell?: OperationalMatrixCellIdentity;
		readOnly?: boolean;
		disabled?: boolean;
		onCellSelect?: OperationalMatrixSelectHandler;
		children?: Snippet;
	};

	let {
		rows,
		columns,
		rowGroups = [],
		selectedCell,
		readOnly = false,
		disabled = false,
		onCellSelect,
		children,
		class: className,
		...restProps
	}: Props = $props();

	let internalSelectedCell = $state<OperationalMatrixCellIdentity | undefined>();

	function currentSelectedCell() {
		return selectedCell ?? internalSelectedCell;
	}

	function selectCell(selection: OperationalMatrixCellSelection) {
		internalSelectedCell = { rowId: selection.rowId, columnId: selection.columnId };
		onCellSelect?.(selection);
	}

	setOperationalMatrixContext({
		disabled: () => disabled,
		readOnly: () => readOnly,
		selectedCell: currentSelectedCell,
		onCellSelect: () => onCellSelect,
		isCellDisabled: (row, column, cellDisabled = false) =>
			disabled || row.disabled === true || column.disabled === true || cellDisabled,
		isCellReadOnly: (row, column, cellReadOnly = false) =>
			readOnly || row.readOnly === true || column.readOnly === true || cellReadOnly,
		isCellSelected: (rowId, columnId, selected = false) => {
			const current = currentSelectedCell();
			return selected || (current?.rowId === rowId && current?.columnId === columnId);
		},
		selectCell
	});
</script>

<div
	data-slot="operational-matrix-root"
	data-matrix-root
	data-disabled={disabled || undefined}
	data-readonly={readOnly || undefined}
	data-row-count={rows.length}
	data-column-count={columns.length}
	data-row-group-count={rowGroups.length}
	class={cn('w-full min-w-0', className)}
	{...restProps}
>
	{@render children?.()}
</div>
