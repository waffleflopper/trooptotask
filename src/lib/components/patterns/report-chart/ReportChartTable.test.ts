// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import ReportChartTable from './ReportChartTable.svelte';

afterEach(() => cleanup());

it('exposes chart data as a named table with column headers and a row header per row', () => {
	render(ReportChartTable, {
		props: {
			label: 'Readiness data',
			columns: ['Month', 'Unit', '68W'],
			rows: [
				{ key: 'a', cells: ['Mar 2026', '75%', '50%'] },
				{ key: 'b', cells: ['Apr 2026', '80%', 0] }
			]
		}
	});

	const table = screen.getByRole('table', { name: 'Readiness data' });
	expect(
		within(table)
			.getAllByRole('columnheader')
			.map((header) => header.textContent)
	).toEqual(['Month', 'Unit', '68W']);
	expect(
		within(table)
			.getAllByRole('rowheader')
			.map((header) => header.textContent)
	).toEqual(['Mar 2026', 'Apr 2026']);
	expect(within(table).getByRole('row', { name: 'Apr 2026 80% 0' })).toBeTruthy();
});
