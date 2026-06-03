import Root from './root.svelte';
import Viewport from './viewport.svelte';
import Table from './table.svelte';
import Header from './header.svelte';
import HeaderRow from './header-row.svelte';
import ColumnGroup from './column-group.svelte';
import ColumnHeader from './column-header.svelte';
import CornerCell from './corner-cell.svelte';
import Body from './body.svelte';
import RowGroup from './row-group.svelte';
import Row from './row.svelte';
import RowHeader from './row-header.svelte';
import Cell from './cell.svelte';

export type {
	OperationalMatrixCellIdentity,
	OperationalMatrixCellSelection,
	OperationalMatrixColumn,
	OperationalMatrixRow,
	OperationalMatrixRowGroup,
	OperationalMatrixSelectHandler
} from './types.js';
export {
	buildVirtualMatrixWindow,
	type PositionedVirtualMatrixItem,
	type VirtualMatrixItem,
	type VirtualMatrixWindow
} from './virtualRows.js';

export {
	Root,
	Viewport,
	Table,
	Header,
	HeaderRow,
	ColumnGroup,
	ColumnHeader,
	CornerCell,
	Body,
	RowGroup,
	Row,
	RowHeader,
	Cell,
	//
	Root as OperationalMatrix,
	Viewport as OperationalMatrixViewport,
	Table as OperationalMatrixTable,
	Header as OperationalMatrixHeader,
	HeaderRow as OperationalMatrixHeaderRow,
	ColumnGroup as OperationalMatrixColumnGroup,
	ColumnHeader as OperationalMatrixColumnHeader,
	CornerCell as OperationalMatrixCornerCell,
	Body as OperationalMatrixBody,
	RowHeader as OperationalMatrixRowHeader,
	Cell as OperationalMatrixCell
};
