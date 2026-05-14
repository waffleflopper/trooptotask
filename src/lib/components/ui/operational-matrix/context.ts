import { getContext, setContext } from 'svelte';
import type {
	OperationalMatrixCellIdentity,
	OperationalMatrixCellSelection,
	OperationalMatrixColumn,
	OperationalMatrixRow,
	OperationalMatrixSelectHandler
} from './types.js';

export type OperationalMatrixContext = {
	disabled: () => boolean;
	readOnly: () => boolean;
	selectedCell: () => OperationalMatrixCellIdentity | undefined;
	onCellSelect: () => OperationalMatrixSelectHandler | undefined;
	isCellDisabled: (row: OperationalMatrixRow, column: OperationalMatrixColumn, disabled?: boolean) => boolean;
	isCellReadOnly: (row: OperationalMatrixRow, column: OperationalMatrixColumn, readOnly?: boolean) => boolean;
	isCellSelected: (rowId: string, columnId: string, selected?: boolean) => boolean;
	selectCell: (selection: OperationalMatrixCellSelection) => void;
};

const operationalMatrixContextKey = Symbol('operational-matrix');

export function setOperationalMatrixContext(context: OperationalMatrixContext) {
	setContext(operationalMatrixContextKey, context);
}

export function getOperationalMatrixContext() {
	return getContext<OperationalMatrixContext>(operationalMatrixContextKey);
}
