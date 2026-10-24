// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import DataTable from './DataTable.svelte';
import CellSnippetWrapper from './__tests__/CellSnippetWrapper.svelte';
import GroupHeaderActionWrapper from './__tests__/GroupHeaderActionWrapper.svelte';
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

const testData: TestRow[] = [
	{ id: '1', name: 'Alice', age: 30, group: 'A' },
	{ id: '2', name: 'Bob', age: 25, group: 'B' },
	{ id: '3', name: 'Charlie', age: 35, group: 'A' }
];

const Table = DataTable<TestRow>;

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

	test('heads rows from a rowHeader column and names its scroll region only when labelled', () => {
		const headed: ColumnDef<TestRow>[] = [{ ...columns[0], rowHeader: true }, columns[1]];
		render(Table, {
			props: {
				data: testData,
				columns: headed,
				ariaLabel: 'Personnel table',
				scrollRegionLabel: 'Personnel, scrollable'
			}
		});

		const table = screen.getByRole('table', { name: 'Personnel table' });
		expect(
			within(table)
				.getAllByRole('rowheader')
				.map((cell) => cell.textContent?.trim())
		).toEqual(['Alice', 'Bob', 'Charlie']);
		expect(
			within(table)
				.getAllByRole('cell')
				.map((cell) => cell.textContent?.trim())
		).toEqual(['30', '25', '35']);
		const region = screen.getByRole('region', { name: 'Personnel, scrollable' });
		expect(region.getAttribute('tabindex')).toBe('0');

		cleanup();
		render(Table, { props: { data: testData, columns, ariaLabel: 'Personnel table' } });
		expect(screen.queryByRole('region')).toBeNull();
		expect(screen.queryAllByRole('rowheader')).toHaveLength(0);
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

	test('pages an editorial table by row range with the given labels', async () => {
		render(Table, {
			props: {
				data: testData,
				columns,
				pageSize: 2,
				variant: 'editorial',
				pageLabels: { previous: 'Newer', next: 'Older' }
			}
		});

		expect(screen.getByText('1–2 of 3')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Newer' }) as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.click(screen.getByRole('button', { name: 'Older' }));
		expect(screen.getByText('3–3 of 3')).toBeTruthy();
		expect(screen.getByText('Charlie')).toBeTruthy();
	});

	test('keeps keyboard focus on pagination when a button disables at either end', async () => {
		const data = [...testData, { id: '4', name: 'Diana', age: 28, group: 'B' }];
		render(Table, { props: { data, columns, pageSize: 2 } });
		const previous = screen.getByRole('button', { name: /Previous/ });
		const next = screen.getByRole('button', { name: /Next/ });

		next.focus();
		await fireEvent.click(next);
		expect(screen.getByText('Page 2 of 2')).toBeTruthy();
		expect(document.activeElement).toBe(previous);

		await fireEvent.click(previous);
		expect(screen.getByText('Page 1 of 2')).toBeTruthy();
		expect(document.activeElement).toBe(next);
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
		expect(screen.getByRole('heading', { level: 3, name: 'No personnel found.' })).toBeTruthy();
		emptyView.unmount();

		const pageEmptyView = render(Table, {
			props: { data: [], columns, emptyMessage: 'No personnel found.', emptyLevel: 2 }
		});
		expect(screen.getByRole('heading', { level: 2, name: 'No personnel found.' })).toBeTruthy();
		pageEmptyView.unmount();

		render(Table, { props: { data: testData, columns, loading: true, loadingRows: 2 } });
		expect(screen.getByLabelText('Loading table rows').getAttribute('aria-busy')).toBe('true');
		expect(screen.getAllByRole('row')).toHaveLength(3);
	});

	test('hides rows a rowHidden predicate excludes and shows the empty state when none remain', async () => {
		const view = render(Table, {
			props: {
				data: testData,
				columns,
				emptyMessage: 'No personnel found.',
				rowHidden: (row: TestRow) => row.group === 'A'
			}
		});
		expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Bob', '25', 'B']);

		await view.rerender({ data: testData, columns, emptyMessage: 'No personnel found.', rowHidden: () => true });
		expect(screen.getByRole('heading', { level: 3, name: 'No personnel found.' })).toBeTruthy();
	});

	test('counts only shown rows in a group and hides a group whose rows are all hidden', async () => {
		const groupBy = { key: (row: TestRow) => row.group, label: (key: string) => `Group ${key}` };
		const view = render(Table, {
			props: {
				data: testData,
				columns,
				groupBy,
				emptyMessage: 'No personnel found.',
				rowHidden: (row: TestRow) => row.name === 'Alice'
			}
		});
		expect(screen.getByRole('button', { name: 'Group A 1' })).toBeTruthy();
		expect(screen.queryByRole('cell', { name: 'Alice' })).toBeNull();

		await view.rerender({
			data: testData,
			columns,
			groupBy,
			emptyMessage: 'No personnel found.',
			rowHidden: (row: TestRow) => row.group === 'A'
		});
		expect(screen.queryByRole('button', { name: /^Group A/ })).toBeNull();
		expect(screen.getByRole('button', { name: 'Group B 1' })).toBeTruthy();

		await view.rerender({
			data: testData,
			columns,
			groupBy,
			emptyMessage: 'No personnel found.',
			rowHidden: () => true
		});
		expect(screen.getByRole('heading', { level: 3, name: 'No personnel found.' })).toBeTruthy();
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

	test('toggles grouped rows from the full group header row', async () => {
		render(Table, {
			props: {
				data: testData,
				columns,
				groupBy: { key: (row: TestRow) => row.group, label: (key: string) => `Group ${key}` }
			}
		});

		const groupRow = screen.getByLabelText('Collapse Group A');
		await fireEvent.click(groupRow);
		expect(screen.queryByText('Alice')).toBeNull();

		await fireEvent.keyDown(groupRow, { key: 'Enter' });
		expect(screen.getByText('Alice')).toBeTruthy();
	});

	test('does not toggle grouped rows from nested group header actions', async () => {
		const onGroupAction = vi.fn();
		render(GroupHeaderActionWrapper, {
			props: {
				data: testData,
				columns,
				onGroupAction
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Pin Group A' }));

		expect(onGroupAction).toHaveBeenCalledWith('A');
		expect(screen.getByText('Alice')).toBeTruthy();
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
