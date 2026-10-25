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

	test('fills groups in display order up to the group row limit', () => {
		const cleanup = $effect.root(() => {
			const table = useDataTable({
				data: () => [...rows, { id: '4', name: 'Diana', age: 28, group: 'C' }],
				columns: [{ key: 'name', header: 'Name', value: (row: Row) => row.name }],
				initialSortKey: 'name',
				groupBy: { key: (row) => row.group },
				groupRowLimit: 2
			});

			expect(table.groups.map((group) => [group.key, group.rows.map((row) => row.name)])).toEqual([
				['A', ['Alice', 'Charlie']],
				['B', []],
				['C', []]
			]);
			expect(table.totalRows).toBe(4);

			table.toggleSort('name');
			expect(table.groups.map((group) => [group.key, group.rows.map((row) => row.name)])).toEqual([
				['C', ['Diana']],
				['A', ['Charlie']],
				['B', []]
			]);
		});

		cleanup();
	});

	test('gives the group row limit to expanded groups only', () => {
		const cleanup = $effect.root(() => {
			const table = useDataTable({
				data: () => [...rows, { id: '4', name: 'Diana', age: 28, group: 'C' }],
				columns: [{ key: 'name', header: 'Name', value: (row: Row) => row.name }],
				initialSortKey: 'name',
				groupBy: { key: (row) => row.group },
				groupRowLimit: 2
			});
			const expandedRows = () =>
				table.groups.map((group) => [group.key, group.collapsed ? 'collapsed' : group.rows.map((row) => row.name)]);

			table.toggleGroup('A');
			expect(expandedRows()).toEqual([
				['A', 'collapsed'],
				['B', ['Bob']],
				['C', ['Diana']]
			]);

			table.toggleGroup('A');
			expect(expandedRows()).toEqual([
				['A', ['Alice', 'Charlie']],
				['B', []],
				['C', []]
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
