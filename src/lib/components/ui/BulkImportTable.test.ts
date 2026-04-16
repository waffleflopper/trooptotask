// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import BulkImportTable from './BulkImportTable.svelte';

describe('BulkImportTable', () => {
	it('preserves source row numbers for checked row entries when headers are present', () => {
		const rawRows = [
			['Task Code', 'Title'],
			['181-105-1001', 'Task one'],
			['181-105-1002', 'Task two']
		];

		const { component } = render(BulkImportTable, {
			props: {
				rawRows,
				columnDefs: [
					{ key: 'taskCode', label: 'Task Code', required: true, aliases: ['task code'] },
					{ key: 'title', label: 'Title', required: true, aliases: ['title'] }
				],
				validateRow: () => ({
					valid: true,
					cellErrors: {},
					cellWarnings: {}
				})
			}
		});

		const table = screen.getByRole('table');
		const bodyRows = within(table).getAllByRole('row').slice(1);
		expect(within(bodyRows[0]).getByText('2')).toBeTruthy();
		expect(within(bodyRows[1]).getByText('3')).toBeTruthy();

		expect(component.getCheckedRowEntries()).toEqual([
			{
				rowIndex: 0,
				sourceRowNumber: 2,
				values: {
					taskCode: '181-105-1001',
					title: 'Task one'
				}
			},
			{
				rowIndex: 1,
				sourceRowNumber: 3,
				values: {
					taskCode: '181-105-1002',
					title: 'Task two'
				}
			}
		]);
	});

	it('merges cross-row validation results into checked row selection', () => {
		const rawRows = [
			['Task Code', 'Title'],
			['181-105-1001', 'Task one'],
			['181-105-1001', 'Task duplicate']
		];

		const { component } = render(BulkImportTable, {
			props: {
				rawRows,
				columnDefs: [
					{ key: 'taskCode', label: 'Task Code', required: true, aliases: ['task code'] },
					{ key: 'title', label: 'Title', required: true, aliases: ['title'] }
				],
				validateRow: () => ({
					valid: true,
					cellErrors: {},
					cellWarnings: {}
				}),
				validateRows: (rows: Array<{ sourceRowNumber: number; values: Record<string, string> }>) =>
					rows.map((row, index) => ({
						valid: false,
						cellErrors: {
							taskCode: `Duplicate ${row.values.taskCode} at row ${rows[(index + 1) % rows.length].sourceRowNumber}`
						},
						cellWarnings: {}
					}))
			}
		});

		expect(screen.getByText('2 errors')).toBeTruthy();
		expect(component.getCheckedRows()).toEqual([]);
		expect(component.getCheckedRowEntries()).toEqual([]);
	});
});
