// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import DataTable from './DataTable.svelte';
import CellSnippetWrapper from './__tests__/CellSnippetWrapper.svelte';
import InteractiveCellWrapper from './__tests__/InteractiveCellWrapper.svelte';
import SelectionWrapper from './__tests__/SelectionWrapper.svelte';
import { useDataTable } from './useDataTable.svelte';
import type { ColumnDef } from './types.js';

type TestRow = {
	id: string;
	name: string;
	age: number;
	group: string;
};

// @testing-library/svelte cannot infer generics on Svelte 5 components.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Table = DataTable as any;

const testData: TestRow[] = [
	{ id: '1', name: 'Alice', age: 30, group: 'A' },
	{ id: '2', name: 'Bob', age: 25, group: 'B' },
	{ id: '3', name: 'Charlie', age: 35, group: 'A' }
];

const columns: ColumnDef<TestRow>[] = [
	{ key: 'name', header: 'Name', value: (row) => row.name },
	{ key: 'age', header: 'Age', value: (row) => row.age, align: 'right' },
	{ key: 'group', header: 'Group', value: (row) => row.group }
];

describe('shadcn DataTable foundation', () => {
	afterEach(() => cleanup());

	test('renders headers and rows with an accessible table label', () => {
		render(Table, { props: { data: testData, columns, ariaLabel: 'Personnel table' } });

		const table = screen.getByRole('table', { name: 'Personnel table' });
		expect(table).toBeTruthy();
		expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
		expect(within(table).getByText('Alice')).toBeTruthy();
		expect(within(table).getByText('Bob')).toBeTruthy();
		expect(within(table).getByText('Charlie')).toBeTruthy();
	});

	test('renders custom cell snippets', () => {
		render(CellSnippetWrapper, { props: { data: testData, columns } });

		const customCells = screen.getAllByTestId('custom-cell');
		expect(customCells).toHaveLength(9);
		expect(customCells[0].textContent).toBe('name:Alice');
	});

	test('sorts rows from sortable headers and exposes aria-sort', async () => {
		render(Table, { props: { data: testData, columns } });

		const nameSort = screen.getByRole('button', { name: 'Sort by Name' });
		await fireEvent.click(nameSort);
		expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe('ascending');

		await fireEvent.click(nameSort);
		expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe('descending');

		const nameCells = screen.getAllByRole('cell').filter((_, index) => index % 3 === 0);
		expect(nameCells.map((cell) => cell.textContent)).toEqual(['Charlie', 'Bob', 'Alice']);
	});

	test('filters rows when shared search is enabled', async () => {
		render(Table, { props: { data: testData, columns, showSearch: true, searchPlaceholder: 'Find personnel' } });

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Find personnel' }), {
			target: { value: 'bob' }
		});

		expect(screen.getByText('Bob')).toBeTruthy();
		expect(screen.queryByText('Alice')).toBeNull();
		expect(screen.queryByText('Charlie')).toBeNull();
	});

	test('paginates shared rows', async () => {
		const data = [
			...testData,
			{ id: '4', name: 'Diana', age: 28, group: 'B' },
			{ id: '5', name: 'Eve', age: 32, group: 'C' }
		];

		render(Table, { props: { data, columns, pageSize: 2 } });

		expect(screen.getByText('Page 1 of 3')).toBeTruthy();
		expect(screen.queryByText('Charlie')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: /Next/ }));
		expect(screen.getByText('Page 2 of 3')).toBeTruthy();
		expect(screen.getByText('Charlie')).toBeTruthy();
	});

	test('calls row click from pointer and keyboard activation', async () => {
		const onRowClick = vi.fn();
		render(Table, {
			props: {
				data: testData,
				columns,
				onRowClick,
				rowActionLabel: (row: TestRow) => `Open ${row.name}`
			}
		});

		const aliceRow = screen.getByLabelText('Open Alice');
		await fireEvent.click(aliceRow);
		await fireEvent.keyDown(aliceRow, { key: 'Enter' });
		await fireEvent.keyDown(aliceRow, { key: ' ' });

		expect(onRowClick).toHaveBeenCalledTimes(3);
		expect(onRowClick).toHaveBeenNthCalledWith(1, testData[0]);
	});

	test('does not activate row clicks from nested interactive actions', async () => {
		const rowHandler = vi.fn();
		const buttonHandler = vi.fn();
		const actionColumns: ColumnDef<TestRow>[] = [
			...columns,
			{ key: 'actions', header: 'Actions', value: () => '', sortable: false, searchable: false }
		];

		render(InteractiveCellWrapper, {
			props: {
				data: testData,
				columns: actionColumns,
				onRowClick: rowHandler,
				onButtonClick: buttonHandler
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Action Alice' }));
		expect(buttonHandler).toHaveBeenCalledWith(testData[0]);
		expect(rowHandler).not.toHaveBeenCalled();
	});

	test('renders empty and loading states', () => {
		const emptyView = render(Table, { props: { data: [], columns, emptyMessage: 'No personnel found.' } });
		expect(screen.getByText('No personnel found.')).toBeTruthy();
		emptyView.unmount();

		render(Table, { props: { data: testData, columns, loading: true, loadingRows: 2 } });
		expect(screen.getByLabelText('Loading table rows').getAttribute('aria-busy')).toBe('true');
		expect(screen.getAllByRole('row')).toHaveLength(3);
	});

	test('supports grouped rows and collapse behavior', async () => {
		render(Table, {
			props: {
				data: testData,
				columns,
				groupBy: { key: (row: TestRow) => row.group, label: (key: string) => `Group ${key}` }
			}
		});

		expect(screen.getByRole('button', { name: 'Group A 2' })).toBeTruthy();
		expect(screen.getByText('Alice')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Group A 2' }));
		expect(screen.queryByText('Alice')).toBeNull();
		expect(screen.getByText('Bob')).toBeTruthy();
	});

	test('supports selection and bulk selection primitives', async () => {
		render(SelectionWrapper);

		expect(screen.getByText('0 of 3 selected')).toBeTruthy();
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
		expect(screen.getByText('1 of 3 selected')).toBeTruthy();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
		expect(screen.getByText('2 of 3 selected')).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: 'Select Charlie' }).hasAttribute('disabled')).toBe(true);
	});
});

describe('useDataTable', () => {
	test('keeps sort, filter, pagination, and grouping behavior headless', () => {
		const table = useDataTable({
			data: () => testData,
			columns,
			pageSize: 2,
			groupBy: { key: (row) => row.group }
		});

		table.toggleSort('age');
		table.setSearch('a');

		expect(table.totalRows).toBe(2);
		expect(table.rows.map((row) => row.name)).toEqual(['Alice', 'Charlie']);
		expect(table.groups.map((group) => group.key)).toEqual(['A']);

		table.collapseAll();
		expect(table.groups[0].collapsed).toBe(true);
	});
});
