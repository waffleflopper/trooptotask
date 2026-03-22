// @vitest-environment happy-dom
import { afterEach, describe, test, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/svelte';
import DataTable from './DataTable.svelte';
import CellSnippetWrapper from './__tests__/CellSnippetWrapper.svelte';
import HeaderCellSnippetWrapper from './__tests__/HeaderCellSnippetWrapper.svelte';
import ToolbarSnippetWrapper from './__tests__/ToolbarSnippetWrapper.svelte';
import { useDataTable } from './useDataTable.svelte';
import type { ColumnDef } from './useDataTable.svelte';

// @testing-library/svelte can't infer generics on Svelte 5 components.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Table = DataTable as any;

interface TestRow {
	id: string;
	name: string;
	age: number;
	group: string;
}

const testData: TestRow[] = [
	{ id: '1', name: 'Alice', age: 30, group: 'A' },
	{ id: '2', name: 'Bob', age: 25, group: 'B' },
	{ id: '3', name: 'Charlie', age: 35, group: 'A' }
];

const columns: ColumnDef<TestRow>[] = [
	{ key: 'name', header: 'Name', value: (r) => r.name },
	{ key: 'age', header: 'Age', value: (r) => r.age },
	{ key: 'group', header: 'Group', value: (r) => r.group }
];

describe('DataTable', () => {
	afterEach(() => cleanup());

	describe('basic rendering', () => {
		test('renders a table with thead and tbody', () => {
			render(Table, { props: { data: testData, columns } });

			expect(screen.getByRole('table')).toBeTruthy();
			expect(screen.getByRole('table').querySelector('thead')).toBeTruthy();
			expect(screen.getByRole('table').querySelector('tbody')).toBeTruthy();
		});

		test('renders column headers from column defs', () => {
			render(Table, { props: { data: testData, columns } });

			const headers = screen.getAllByRole('columnheader');
			expect(headers).toHaveLength(3);
			expect(headers[0].textContent).toContain('Name');
			expect(headers[1].textContent).toContain('Age');
			expect(headers[2].textContent).toContain('Group');
		});

		test('renders data rows with cell values', () => {
			render(Table, { props: { data: testData, columns } });

			const rows = screen.getAllByRole('row');
			// 1 header row + 3 data rows
			expect(rows).toHaveLength(4);

			// Check cell content
			expect(screen.getByText('Alice')).toBeTruthy();
			expect(screen.getByText('Bob')).toBeTruthy();
			expect(screen.getByText('Charlie')).toBeTruthy();
			expect(screen.getByText('30')).toBeTruthy();
			expect(screen.getByText('25')).toBeTruthy();
			expect(screen.getByText('35')).toBeTruthy();
		});

		test('applies aria-label to the table', () => {
			render(Table, { props: { data: testData, columns, ariaLabel: 'Test table' } });

			expect(screen.getByRole('table').getAttribute('aria-label')).toBe('Test table');
		});

		test('headers have scope="col"', () => {
			render(Table, { props: { data: testData, columns } });

			const headers = screen.getAllByRole('columnheader');
			headers.forEach((h) => {
				expect(h.getAttribute('scope')).toBe('col');
			});
		});
	});

	describe('empty state', () => {
		test('shows EmptyState when data is empty', () => {
			render(Table, { props: { data: [], columns } });

			expect(screen.getByText('No data.')).toBeTruthy();
			// No data rows
			expect(screen.getAllByRole('row')).toHaveLength(1); // header row only
		});

		test('shows custom empty message', () => {
			render(Table, { props: { data: [], columns, emptyMessage: 'Nothing here.' } });

			expect(screen.getByText('Nothing here.')).toBeTruthy();
		});
	});

	describe('sort interaction', () => {
		test('clicking a header sorts the column and sets aria-sort', async () => {
			render(Table, { props: { data: testData, columns } });

			const nameHeader = screen.getByText('Name');
			await fireEvent.click(nameHeader);

			// After click, should be sorted ascending
			expect(nameHeader.closest('th')!.getAttribute('aria-sort')).toBe('ascending');

			// Data should be in sorted order
			const cells = screen.getAllByRole('cell');
			const nameCells = cells.filter((_, i) => i % 3 === 0);
			expect(nameCells.map((c) => c.textContent)).toEqual(['Alice', 'Bob', 'Charlie']);
		});

		test('clicking same header twice toggles to descending', async () => {
			render(Table, { props: { data: testData, columns } });

			const nameHeader = screen.getByText('Name');
			await fireEvent.click(nameHeader);
			await fireEvent.click(nameHeader);

			expect(nameHeader.closest('th')!.getAttribute('aria-sort')).toBe('descending');

			const cells = screen.getAllByRole('cell');
			const nameCells = cells.filter((_, i) => i % 3 === 0);
			expect(nameCells.map((c) => c.textContent)).toEqual(['Charlie', 'Bob', 'Alice']);
		});

		test('unsorted columns have no aria-sort', () => {
			render(Table, { props: { data: testData, columns } });

			const headers = screen.getAllByRole('columnheader');
			headers.forEach((h) => {
				expect(h.getAttribute('aria-sort')).toBeNull();
			});
		});
	});

	describe('search bar', () => {
		test('does not render search input by default', () => {
			render(Table, { props: { data: testData, columns } });

			expect(screen.queryByRole('searchbox')).toBeNull();
		});

		test('renders search input when showSearch is true', () => {
			render(Table, { props: { data: testData, columns, showSearch: true } });

			expect(screen.getByRole('searchbox')).toBeTruthy();
		});

		test('typing in search filters rows', async () => {
			render(Table, { props: { data: testData, columns, showSearch: true } });

			const input = screen.getByRole('searchbox');
			await fireEvent.input(input, { target: { value: 'alice' } });

			expect(screen.getByText('Alice')).toBeTruthy();
			expect(screen.queryByText('Bob')).toBeNull();
			expect(screen.queryByText('Charlie')).toBeNull();
		});

		test('renders custom search placeholder', () => {
			render(Table, {
				props: { data: testData, columns, showSearch: true, searchPlaceholder: 'Find someone...' }
			});

			expect(screen.getByPlaceholderText('Find someone...')).toBeTruthy();
		});
	});

	describe('pagination', () => {
		const fiveRows: TestRow[] = [
			{ id: '1', name: 'Alice', age: 30, group: 'A' },
			{ id: '2', name: 'Bob', age: 25, group: 'B' },
			{ id: '3', name: 'Charlie', age: 35, group: 'A' },
			{ id: '4', name: 'Diana', age: 28, group: 'B' },
			{ id: '5', name: 'Eve', age: 32, group: 'C' }
		];

		test('does not render pagination when pageSize is 0', () => {
			render(Table, { props: { data: fiveRows, columns } });

			expect(screen.queryByText('Previous')).toBeNull();
			expect(screen.queryByText('Next')).toBeNull();
		});

		test('renders pagination controls when totalPages > 1', () => {
			render(Table, { props: { data: fiveRows, columns, pageSize: 2 } });

			expect(screen.getByText('Previous')).toBeTruthy();
			expect(screen.getByText('Next')).toBeTruthy();
			expect(screen.getByText('Page 1 of 3')).toBeTruthy();
		});

		test('shows only first page of rows', () => {
			render(Table, { props: { data: fiveRows, columns, pageSize: 2 } });

			// 1 header row + 2 data rows
			expect(screen.getAllByRole('row')).toHaveLength(3);
		});

		test('clicking Next advances to page 2', async () => {
			render(Table, { props: { data: fiveRows, columns, pageSize: 2 } });

			await fireEvent.click(screen.getByText('Next'));

			expect(screen.getByText('Page 2 of 3')).toBeTruthy();
			expect(screen.getByText('Charlie')).toBeTruthy();
		});

		test('clicking Previous goes back', async () => {
			render(Table, { props: { data: fiveRows, columns, pageSize: 2 } });

			await fireEvent.click(screen.getByText('Next'));
			await fireEvent.click(screen.getByText('Previous'));

			expect(screen.getByText('Page 1 of 3')).toBeTruthy();
		});
	});

	describe('clickable rows', () => {
		test('calls onRowClick with row data when a row is clicked', async () => {
			const handler = vi.fn();
			render(Table, { props: { data: testData, columns, onRowClick: handler } });

			const dataRows = screen.getAllByRole('row').slice(1); // skip header
			await fireEvent.click(dataRows[1]); // click Bob's row

			expect(handler).toHaveBeenCalledOnce();
			expect(handler).toHaveBeenCalledWith(testData[1]);
		});

		test('rows do not have clickable class when onRowClick is not provided', () => {
			render(Table, { props: { data: testData, columns } });

			const dataRows = screen.getAllByRole('row').slice(1);
			expect(dataRows[0].classList.contains('clickable')).toBe(false);
		});
	});

	describe('group headers', () => {
		const groupBy = {
			key: (r: TestRow) => r.group,
			label: (key: string) => `Group ${key}`
		};

		test('renders group header rows with label and count', () => {
			render(Table, { props: { data: testData, columns, groupBy } });

			expect(screen.getByText('Group A (2)')).toBeTruthy();
			expect(screen.getByText('Group B (1)')).toBeTruthy();
		});

		test('clicking group header collapses the group', async () => {
			render(Table, { props: { data: testData, columns, groupBy } });

			// Both groups visible initially — Alice, Charlie in A; Bob in B
			expect(screen.getByText('Alice')).toBeTruthy();
			expect(screen.getByText('Charlie')).toBeTruthy();
			expect(screen.getByText('Bob')).toBeTruthy();

			// Click Group A header to collapse
			await fireEvent.click(screen.getByText('Group A (2)'));

			// Group A rows should be hidden
			expect(screen.queryByText('Alice')).toBeNull();
			expect(screen.queryByText('Charlie')).toBeNull();
			// Group B still visible
			expect(screen.getByText('Bob')).toBeTruthy();
		});

		test('clicking collapsed group header expands it', async () => {
			render(Table, { props: { data: testData, columns, groupBy } });

			// Collapse then expand
			await fireEvent.click(screen.getByText('Group A (2)'));
			await fireEvent.click(screen.getByText('Group A (2)'));

			expect(screen.getByText('Alice')).toBeTruthy();
			expect(screen.getByText('Charlie')).toBeTruthy();
		});
	});

	describe('CSS class props', () => {
		test('applies compact class to table wrapper', () => {
			render(Table, { props: { data: testData, columns, compact: true } });

			const wrapper = screen.getByRole('table').closest('.data-table');
			expect(wrapper?.classList.contains('compact')).toBe(true);
		});

		test('applies striped class to table wrapper', () => {
			render(Table, { props: { data: testData, columns, striped: true } });

			const wrapper = screen.getByRole('table').closest('.data-table');
			expect(wrapper?.classList.contains('striped')).toBe(true);
		});

		test('applies sticky-first-column class to table wrapper', () => {
			render(Table, { props: { data: testData, columns, stickyFirstColumn: true } });

			const wrapper = screen.getByRole('table').closest('.data-table');
			expect(wrapper?.classList.contains('sticky-first-column')).toBe(true);
		});

		test('no styling classes by default', () => {
			render(Table, { props: { data: testData, columns } });

			const wrapper = screen.getByRole('table').closest('.data-table');
			expect(wrapper?.classList.contains('compact')).toBe(false);
			expect(wrapper?.classList.contains('striped')).toBe(false);
			expect(wrapper?.classList.contains('sticky-first-column')).toBe(false);
		});
	});

	describe('pre-built mode', () => {
		test('renders rows from an external DataTableState', () => {
			const table = useDataTable({ data: () => testData, columns });

			render(Table, { props: { table } });

			expect(screen.getByText('Alice')).toBeTruthy();
			expect(screen.getByText('Bob')).toBeTruthy();
			expect(screen.getByText('Charlie')).toBeTruthy();
			expect(screen.getAllByRole('columnheader')).toHaveLength(3);
		});
	});

	describe('snippet overrides', () => {
		test('cell snippet overrides default cell rendering', () => {
			render(CellSnippetWrapper, { props: { data: testData, columns } });

			const customCells = screen.getAllByTestId('custom-cell');
			expect(customCells.length).toBe(9); // 3 rows x 3 columns
			expect(customCells[0].textContent).toBe('name:Alice');
			expect(customCells[1].textContent).toBe('age:30');
		});

		test('headerCell snippet overrides default header rendering', () => {
			render(HeaderCellSnippetWrapper, { props: { data: testData, columns } });

			const customHeaders = screen.getAllByTestId('custom-header');
			expect(customHeaders.length).toBe(3);
			expect(customHeaders[0].textContent).toBe('HD:Name');
			expect(customHeaders[1].textContent).toBe('HD:Age');
			expect(customHeaders[2].textContent).toBe('HD:Group');
		});

		test('toolbar snippet renders above the table', () => {
			render(ToolbarSnippetWrapper, { props: { data: testData, columns } });

			const toolbar = screen.getByTestId('custom-toolbar');
			expect(toolbar.textContent).toBe('Total: 3');
		});
	});
});
