// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { useDataTable } from './useDataTable.svelte';
import type { ColumnDef } from './types.js';

type Row = {
	id: string;
	name: string;
	age: number;
	group: string;
};

const rows: Row[] = [
	{ id: '1', name: 'Alice', age: 30, group: 'A' },
	{ id: '2', name: 'Bob', age: 25, group: 'B' },
	{ id: '3', name: 'Charlie', age: 35, group: 'A' }
];

describe('useDataTable', () => {
	test('derives sorted, paginated, and grouped rows from public table state', () => {
		const cleanup = $effect.root(() => {
			const columns: ColumnDef<Row>[] = [
				{ key: 'name', header: 'Name', value: (row) => row.name },
				{ key: 'age', header: 'Age', value: (row) => row.age, compare: (a, b) => a.age - b.age }
			];

			const table = useDataTable({
				data: () => rows,
				columns,
				initialSortKey: 'age',
				pageSize: 2,
				groupBy: { key: (row) => row.group }
			});

			expect(table.rows.map((row) => row.name)).toEqual(['Bob', 'Alice']);
			expect(table.allRows.map((row) => row.name)).toEqual(['Bob', 'Alice', 'Charlie']);
			expect(table.totalRows).toBe(3);
			expect(table.totalPages).toBe(2);
			expect(table.groups.map((group) => group.key)).toEqual(['B', 'A']);

			table.toggleSort('age');
			expect(table.rows.map((row) => row.name)).toEqual(['Charlie', 'Alice']);
		});

		cleanup();
	});

	test('pages grouped rows in group order and keeps a collapsed group on the page where it starts', () => {
		const cleanup = $effect.root(() => {
			const data: Row[] = [
				...rows,
				{ id: '4', name: 'Diana', age: 28, group: 'B' },
				{ id: '5', name: 'Eve', age: 32, group: 'C' }
			];
			const columns: ColumnDef<Row>[] = [{ key: 'name', header: 'Name', value: (row) => row.name }];
			const table = useDataTable({ data: () => data, columns, pageSize: 2, groupBy: { key: (row) => row.group } });
			const shown = () => table.groups.map((group) => [group.key, group.rows.map((row) => row.name)]);

			expect([shown(), table.totalPages]).toEqual([[['A', ['Alice', 'Charlie']]], 3]);
			table.setPage(2);
			expect(shown()).toEqual([['B', ['Bob', 'Diana']]]);

			table.toggleGroup('A');
			expect([table.page, table.totalPages]).toEqual([2, 2]);
			table.setPage(1);
			expect(shown()).toEqual([
				['A', ['Alice', 'Charlie']],
				['B', ['Bob', 'Diana']]
			]);
		});

		cleanup();
	});

	test('repairs the current page when reactive data shrinks below it', () => {
		const cleanup = $effect.root(() => {
			let data = $state<Row[]>([
				...rows,
				{ id: '4', name: 'Diana', age: 28, group: 'B' },
				{ id: '5', name: 'Eve', age: 32, group: 'C' }
			]);
			const columns: ColumnDef<Row>[] = [{ key: 'name', header: 'Name', value: (row) => row.name }];
			const table = useDataTable({ data: () => data, columns, pageSize: 2 });

			table.setPage(3);
			expect(table.rows.map((row) => row.name)).toEqual(['Eve']);
			expect(table.page).toBe(3);

			data = rows.slice(0, 2);

			expect(table.rows.map((row) => row.name)).toEqual(['Alice', 'Bob']);
			expect(table.totalPages).toBe(1);
			expect(table.page).toBe(1);
		});

		cleanup();
	});
});
