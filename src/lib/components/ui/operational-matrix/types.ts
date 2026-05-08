export interface OperationalMatrixRow {
	id: string;
	label: string;
	disabled?: boolean;
	readOnly?: boolean;
	meta?: Record<string, unknown>;
}

export interface OperationalMatrixColumn {
	id: string;
	label: string;
	disabled?: boolean;
	readOnly?: boolean;
	meta?: Record<string, unknown>;
}

export interface OperationalMatrixRowGroup {
	id: string;
	label: string;
	rowIds: string[];
	collapsed?: boolean;
	meta?: Record<string, unknown>;
}

export interface OperationalMatrixCellIdentity {
	rowId: string;
	columnId: string;
}

export interface OperationalMatrixCellSelection<Row = OperationalMatrixRow, Column = OperationalMatrixColumn> {
	row: Row;
	column: Column;
	rowId: string;
	columnId: string;
	source: 'pointer' | 'keyboard' | 'programmatic';
}

export type OperationalMatrixSelectHandler<Row = OperationalMatrixRow, Column = OperationalMatrixColumn> = (
	selection: OperationalMatrixCellSelection<Row, Column>
) => void;
