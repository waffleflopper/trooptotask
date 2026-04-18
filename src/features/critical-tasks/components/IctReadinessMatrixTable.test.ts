// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctReadinessMatrixTable from './IctReadinessMatrixTable.svelte';
import type { IctReadinessMatrix } from '$features/critical-tasks/utils/ictReports';

const matrix: IctReadinessMatrix = {
	hasCategorizedTasks: true,
	categories: [
		{ key: 'category:weapons', label: 'Weapons', isUncategorized: false },
		{ key: 'category:medical', label: 'Medical', isUncategorized: false },
		{ key: '__uncategorized__', label: 'Uncategorized', isUncategorized: true }
	],
	rows: [
		{
			mos: '11B',
			personnelCount: 2,
			averageReadinessPercent: 25,
			averageReadyCount: 1,
			averageApplicableCount: 4,
			averageTier: 'danger',
			cells: [
				{
					categoryKey: 'category:weapons',
					categoryLabel: 'Weapons',
					readinessPercent: 50,
					readyCount: 1,
					applicableCount: 2,
					tier: 'danger'
				},
				{
					categoryKey: 'category:medical',
					categoryLabel: 'Medical',
					readinessPercent: null,
					readyCount: 0,
					applicableCount: 0,
					tier: 'not-applicable'
				},
				{
					categoryKey: '__uncategorized__',
					categoryLabel: 'Uncategorized',
					readinessPercent: 0,
					readyCount: 0,
					applicableCount: 2,
					tier: 'danger'
				}
			]
		},
		{
			mos: '68W',
			personnelCount: 1,
			averageReadinessPercent: 100,
			averageReadyCount: 2,
			averageApplicableCount: 2,
			averageTier: 'good',
			cells: [
				{
					categoryKey: 'category:weapons',
					categoryLabel: 'Weapons',
					readinessPercent: null,
					readyCount: 0,
					applicableCount: 0,
					tier: 'not-applicable'
				},
				{
					categoryKey: 'category:medical',
					categoryLabel: 'Medical',
					readinessPercent: 100,
					readyCount: 1,
					applicableCount: 1,
					tier: 'good'
				},
				{
					categoryKey: '__uncategorized__',
					categoryLabel: 'Uncategorized',
					readinessPercent: 100,
					readyCount: 1,
					applicableCount: 1,
					tier: 'good'
				}
			]
		}
	]
};

describe('IctReadinessMatrixTable', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders the MOS by category matrix as an accessible table with signal tiers', () => {
		render(IctReadinessMatrixTable, { props: { matrix } });

		const region = screen.getByRole('region', { name: 'Readiness Matrix — MOS × Task Category' });
		expect(within(region).getByText('Cell = % trained & current')).toBeTruthy();
		const table = within(region).getByRole('table', { name: 'MOS by task category readiness matrix' });

		expect(within(table).getByRole('columnheader', { name: 'MOS' })).toBeTruthy();
		expect(within(table).getByRole('columnheader', { name: 'Weapons' })).toBeTruthy();
		expect(within(table).getByRole('columnheader', { name: 'Medical' })).toBeTruthy();
		expect(within(table).getByRole('columnheader', { name: 'Uncategorized' })).toBeTruthy();
		expect(within(table).getByRole('columnheader', { name: 'Avg' })).toBeTruthy();
		expect(within(table).getByRole('rowheader', { name: /11B/ }).textContent).toContain('2 Soldiers');
		expect(within(table).getByRole('rowheader', { name: /68W/ }).textContent).toContain('1 Soldier');

		expect(within(table).getByLabelText('11B Weapons readiness: 50%, 1 of 2 current')).toBeTruthy();
		expect(within(table).getByLabelText('11B Medical readiness: not applicable')).toBeTruthy();
		expect(within(table).getByLabelText('11B average readiness: 25%, 1 of 4 current')).toBeTruthy();
		expect(within(table).getByLabelText('68W Medical readiness: 100%, 1 of 1 current')).toBeTruthy();

		const legend = within(region).getByLabelText('Readiness matrix tiers');
		expect(within(legend).getByText('<60%')).toBeTruthy();
		expect(within(legend).getByText('60-69%')).toBeTruthy();
		expect(within(legend).getByText('70-79%')).toBeTruthy();
		expect(within(legend).getByText('80-89%')).toBeTruthy();
		expect(within(legend).getByText('90%+')).toBeTruthy();
		expect(within(legend).getByText('Not applicable')).toBeTruthy();
	});

	it('explains when active filters have no rows or no categorized task data', () => {
		render(IctReadinessMatrixTable, {
			props: {
				matrix: {
					hasCategorizedTasks: true,
					categories: matrix.categories,
					rows: []
				}
			}
		});

		expect(screen.getByText('No readiness matrix data is available for the active filters.')).toBeTruthy();

		cleanup();
		render(IctReadinessMatrixTable, {
			props: {
				matrix: {
					hasCategorizedTasks: false,
					categories: [{ key: '__uncategorized__', label: 'Uncategorized', isUncategorized: true }],
					rows: matrix.rows
				}
			}
		});

		expect(
			screen.getByText('Task categories are not set yet. Add categories to build the MOS by category matrix.')
		).toBeTruthy();
	});
});
