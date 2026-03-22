import { describe, test, expect } from 'vitest';
import { useDataTable } from './useDataTable.svelte';

interface TestRow {
	id: string;
	name: string;
	age: number;
	group: string;
}

const testData: TestRow[] = [
	{ id: '1', name: 'Alice', age: 30, group: 'A' },
	{ id: '2', name: 'Bob', age: 25, group: 'B' },
	{ id: '3', name: 'Charlie', age: 35, group: 'A' },
	{ id: '4', name: 'Diana', age: 28, group: 'B' },
	{ id: '5', name: 'Eve', age: 32, group: 'C' }
];

const columns = [
	{ key: 'name', header: 'Name', value: (r: TestRow) => r.name },
	{ key: 'age', header: 'Age', value: (r: TestRow) => r.age },
	{ key: 'group', header: 'Group', value: (r: TestRow) => r.group }
];

describe('useDataTable', () => {
	test('returns all rows when no options are set', () => {
		const table = useDataTable({
			data: () => testData,
			columns
		});

		expect(table.rows).toEqual(testData);
		expect(table.totalRows).toBe(5);
		expect(table.sortKey).toBeNull();
		expect(table.sortDirection).toBe('asc');
		expect(table.search).toBe('');
		expect(table.page).toBe(1);
		expect(table.pageSize).toBe(0);
		expect(table.totalPages).toBe(1);
		expect(table.groups).toEqual([]);
	});

	test('sorts strings ascending by default', () => {
		const table = useDataTable({
			data: () => testData,
			columns
		});

		table.toggleSort('name');

		expect(table.sortKey).toBe('name');
		expect(table.sortDirection).toBe('asc');
		expect(table.rows.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']);
	});

	test('sorts numbers ascending', () => {
		const table = useDataTable({
			data: () => testData,
			columns
		});

		table.toggleSort('age');

		expect(table.rows.map((r) => r.age)).toEqual([25, 28, 30, 32, 35]);
	});

	test('toggleSort toggles direction on same key', () => {
		const table = useDataTable({
			data: () => testData,
			columns
		});

		table.toggleSort('name');
		expect(table.sortDirection).toBe('asc');

		table.toggleSort('name');
		expect(table.sortDirection).toBe('desc');
		expect(table.rows.map((r) => r.name)).toEqual(['Eve', 'Diana', 'Charlie', 'Bob', 'Alice']);
	});

	test('toggleSort resets to asc on new key', () => {
		const table = useDataTable({
			data: () => testData,
			columns
		});

		table.toggleSort('name');
		table.toggleSort('name'); // desc
		table.toggleSort('age'); // new key, reset to asc

		expect(table.sortKey).toBe('age');
		expect(table.sortDirection).toBe('asc');
		expect(table.rows.map((r) => r.age)).toEqual([25, 28, 30, 32, 35]);
	});

	test('sorts nulls last regardless of direction', () => {
		interface NullRow {
			id: string;
			val: string | null;
		}
		const data: NullRow[] = [
			{ id: '1', val: 'Banana' },
			{ id: '2', val: null },
			{ id: '3', val: 'Apple' },
			{ id: '4', val: null },
			{ id: '5', val: 'Cherry' }
		];
		const cols = [{ key: 'val', header: 'Val', value: (r: NullRow) => r.val }];

		const table = useDataTable({ data: () => data, columns: cols });
		table.toggleSort('val');

		expect(table.rows.map((r) => r.val)).toEqual(['Apple', 'Banana', 'Cherry', null, null]);

		table.toggleSort('val'); // desc
		expect(table.rows.map((r) => r.val)).toEqual(['Cherry', 'Banana', 'Apple', null, null]);
	});

	test('uses custom comparator when provided', () => {
		const RANK_ORDER = ['PV1', 'PV2', 'SGT', 'SSG', 'SFC'];
		interface RankRow {
			id: string;
			rank: string;
		}
		const data: RankRow[] = [
			{ id: '1', rank: 'SGT' },
			{ id: '2', rank: 'PV1' },
			{ id: '3', rank: 'SFC' },
			{ id: '4', rank: 'PV2' },
			{ id: '5', rank: 'SSG' }
		];
		const cols = [
			{
				key: 'rank',
				header: 'Rank',
				value: (r: RankRow) => r.rank,
				compare: (a: RankRow, b: RankRow) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank)
			}
		];

		const table = useDataTable({ data: () => data, columns: cols });
		table.toggleSort('rank');

		expect(table.rows.map((r) => r.rank)).toEqual(['PV1', 'PV2', 'SGT', 'SSG', 'SFC']);
	});

	test('uses initialSortKey and initialSortDirection', () => {
		const table = useDataTable({
			data: () => testData,
			columns,
			initialSortKey: 'age',
			initialSortDirection: 'desc'
		});

		expect(table.sortKey).toBe('age');
		expect(table.sortDirection).toBe('desc');
		expect(table.rows.map((r) => r.age)).toEqual([35, 32, 30, 28, 25]);
	});

	test('filters rows by text search across searchable columns', () => {
		const table = useDataTable({ data: () => testData, columns });

		table.setSearch('ali');

		expect(table.rows).toHaveLength(1);
		expect(table.rows[0].name).toBe('Alice');
		expect(table.totalRows).toBe(1);
		expect(table.search).toBe('ali');
	});

	test('text search is case-insensitive', () => {
		const table = useDataTable({ data: () => testData, columns });

		table.setSearch('BOB');

		expect(table.rows).toHaveLength(1);
		expect(table.rows[0].name).toBe('Bob');
	});

	test('text search uses searchValue when provided', () => {
		const cols = [
			{
				key: 'name',
				header: 'Name',
				value: (r: TestRow) => r.name,
				searchValue: (r: TestRow) => `${r.name} ${r.group}`
			},
			{ key: 'age', header: 'Age', value: (r: TestRow) => r.age, searchable: false }
		];
		const table = useDataTable({ data: () => testData, columns: cols });

		// Search for group value — only findable via searchValue
		table.setSearch('C');

		const names = table.rows.map((r) => r.name);
		expect(names).toContain('Charlie'); // group A, but searchValue includes 'Charlie C'? No, 'Charlie A'
		expect(names).toContain('Eve'); // group C
	});

	test('excludes non-searchable columns from text search', () => {
		const cols = [
			{ key: 'name', header: 'Name', value: (r: TestRow) => r.name },
			{ key: 'age', header: 'Age', value: (r: TestRow) => r.age, searchable: false },
			{ key: 'group', header: 'Group', value: (r: TestRow) => r.group }
		];
		const table = useDataTable({ data: () => testData, columns: cols });

		// '25' matches Bob's age, but age column is not searchable
		table.setSearch('25');

		expect(table.rows).toHaveLength(0);
	});

	test('custom filterFn overrides default search', () => {
		const table = useDataTable({
			data: () => testData,
			columns,
			filterFn: (row, query) => row.age > Number(query)
		});

		table.setSearch('30');

		expect(table.rows.map((r) => r.name)).toEqual(['Charlie', 'Eve']);
	});

	test('clearing search returns all rows', () => {
		const table = useDataTable({ data: () => testData, columns });

		table.setSearch('alice');
		expect(table.rows).toHaveLength(1);

		table.setSearch('');
		expect(table.rows).toHaveLength(5);
	});

	test('paginates rows correctly', () => {
		const table = useDataTable({ data: () => testData, columns, pageSize: 2 });

		expect(table.rows).toHaveLength(2);
		expect(table.rows.map((r) => r.name)).toEqual(['Alice', 'Bob']);
		expect(table.page).toBe(1);
		expect(table.pageSize).toBe(2);
		expect(table.totalPages).toBe(3);
		expect(table.totalRows).toBe(5);
	});

	test('setPage navigates between pages', () => {
		const table = useDataTable({ data: () => testData, columns, pageSize: 2 });

		table.setPage(2);
		expect(table.page).toBe(2);
		expect(table.rows.map((r) => r.name)).toEqual(['Charlie', 'Diana']);

		table.setPage(3);
		expect(table.rows.map((r) => r.name)).toEqual(['Eve']);
	});

	test('setPage clamps to valid bounds', () => {
		const table = useDataTable({ data: () => testData, columns, pageSize: 2 });

		table.setPage(0);
		expect(table.page).toBe(1);

		table.setPage(99);
		expect(table.page).toBe(3);
	});

	test('page resets to 1 when search changes', () => {
		const table = useDataTable({ data: () => testData, columns, pageSize: 2 });

		table.setPage(2);
		expect(table.page).toBe(2);

		table.setSearch('ali');
		expect(table.page).toBe(1);
	});

	test('pageSize 0 disables pagination', () => {
		const table = useDataTable({ data: () => testData, columns, pageSize: 0 });

		expect(table.rows).toHaveLength(5);
		expect(table.totalPages).toBe(1);
	});

	test('setPageSize changes page size and resets to page 1', () => {
		const table = useDataTable({ data: () => testData, columns, pageSize: 2 });

		table.setPage(2);
		expect(table.page).toBe(2);

		table.setPageSize(3);
		expect(table.pageSize).toBe(3);
		expect(table.page).toBe(1);
		expect(table.totalPages).toBe(2);
		expect(table.rows).toHaveLength(3);
	});

	test('groups rows by key', () => {
		const table = useDataTable({
			data: () => testData,
			columns,
			groupBy: { key: (r) => r.group }
		});

		expect(table.groups).toHaveLength(3);
		expect(table.groups[0].key).toBe('A');
		expect(table.groups[0].label).toBe('A');
		expect(table.groups[0].rows.map((r) => r.name)).toEqual(['Alice', 'Charlie']);
		expect(table.groups[0].collapsed).toBe(false);
		expect(table.groups[1].key).toBe('B');
		expect(table.groups[1].rows.map((r) => r.name)).toEqual(['Bob', 'Diana']);
		expect(table.groups[2].key).toBe('C');
		expect(table.groups[2].rows.map((r) => r.name)).toEqual(['Eve']);
	});

	test('groups use custom label function', () => {
		const table = useDataTable({
			data: () => testData,
			columns,
			groupBy: {
				key: (r) => r.group,
				label: (key) => `Group ${key}`
			}
		});

		expect(table.groups[0].label).toBe('Group A');
		expect(table.groups[1].label).toBe('Group B');
	});

	test('groups ordered by compare function', () => {
		const table = useDataTable({
			data: () => testData,
			columns,
			groupBy: {
				key: (r) => r.group,
				compare: (a, b) => b.localeCompare(a) // reverse
			}
		});

		expect(table.groups.map((g) => g.key)).toEqual(['C', 'B', 'A']);
	});

	test('toggleGroup collapses and expands', () => {
		const table = useDataTable({
			data: () => testData,
			columns,
			groupBy: { key: (r) => r.group }
		});

		expect(table.groups[0].collapsed).toBe(false);

		table.toggleGroup('A');
		expect(table.groups[0].collapsed).toBe(true);

		table.toggleGroup('A');
		expect(table.groups[0].collapsed).toBe(false);
	});

	test('expandAll and collapseAll', () => {
		const table = useDataTable({
			data: () => testData,
			columns,
			groupBy: { key: (r) => r.group }
		});

		table.collapseAll();
		expect(table.groups.every((g) => g.collapsed)).toBe(true);

		table.expandAll();
		expect(table.groups.every((g) => !g.collapsed)).toBe(true);
	});

	test('filter + sort + paginate pipeline works together', () => {
		const table = useDataTable({
			data: () => testData,
			columns,
			pageSize: 2
		});

		table.toggleSort('age'); // sort by age asc
		table.setSearch('a'); // Alice(A), Charlie(A), Diana(B) - all have 'a' somewhere

		// Filtered by 'a': Alice(30,A), Charlie(35,A), Diana(28,B) — sorted by age: Diana(28), Alice(30), Charlie(35)
		expect(table.totalRows).toBe(3);
		expect(table.totalPages).toBe(2);
		expect(table.rows.map((r) => r.name)).toEqual(['Diana', 'Alice']); // page 1, size 2

		table.setPage(2);
		expect(table.rows.map((r) => r.name)).toEqual(['Charlie']);
	});
});
