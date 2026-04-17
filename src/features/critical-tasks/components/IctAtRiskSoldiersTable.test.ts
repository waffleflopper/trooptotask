// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctAtRiskSoldiersTable from './IctAtRiskSoldiersTable.svelte';
import type { IctAtRiskSoldierRow } from '$features/critical-tasks/utils/ictReports';

const rows: IctAtRiskSoldierRow[] = [
	{
		personnelId: 'person-1',
		soldierName: 'Stale, Ryan',
		mos: '11B',
		rank: 'SGT',
		groupName: 'Alpha',
		readinessPercent: 0,
		applicableCount: 2,
		readyCount: 0,
		tasksExpiringSoonCount: 0,
		daysSinceLastIctUpdate: 790,
		lastIctUpdateAt: '2024-02-01T00:00:00Z'
	},
	{
		personnelId: 'person-2',
		soldierName: 'NoUpdate, Nora',
		mos: '11B',
		rank: 'SPC',
		groupName: 'Bravo',
		readinessPercent: 0,
		applicableCount: 2,
		readyCount: 0,
		tasksExpiringSoonCount: 0,
		daysSinceLastIctUpdate: null,
		lastIctUpdateAt: null
	},
	{
		personnelId: 'person-3',
		soldierName: 'Expiring, Emily',
		mos: '68W',
		rank: 'CPL',
		groupName: 'Charlie',
		readinessPercent: 50,
		applicableCount: 2,
		readyCount: 1,
		tasksExpiringSoonCount: 2,
		daysSinceLastIctUpdate: 12,
		lastIctUpdateAt: '2026-03-20T00:00:00Z'
	}
];

function row(index: number): IctAtRiskSoldierRow {
	return {
		personnelId: `person-${index}`,
		soldierName: `Soldier, ${String(index).padStart(2, '0')}`,
		mos: '11B',
		rank: 'SPC',
		groupName: 'Alpha',
		readinessPercent: index,
		applicableCount: 20,
		readyCount: index,
		tasksExpiringSoonCount: 20 - index,
		daysSinceLastIctUpdate: index,
		lastIctUpdateAt: '2026-03-20T00:00:00Z'
	};
}

function soldierNames(region: HTMLElement): string[] {
	return within(region)
		.getAllByRole('rowheader')
		.map((header) => header.textContent?.trim() ?? '');
}

describe('IctAtRiskSoldiersTable', () => {
	afterEach(() => {
		cleanup();
	});

	it('defaults to the top 10 at-risk Soldiers and exposes an accessible expand/collapse control', async () => {
		render(IctAtRiskSoldiersTable, {
			props: {
				rows: Array.from({ length: 12 }, (_, index) => row(index + 1))
			}
		});

		const region = screen.getByRole('region', { name: 'At-Risk Soldiers' });
		expect(within(region).getByText('Soldier, 01')).toBeTruthy();
		expect(within(region).getByText('Soldier, 10')).toBeTruthy();
		expect(within(region).queryByText('Soldier, 11')).toBeNull();

		const expandButton = within(region).getByRole('button', { name: 'Show all 12 at-risk Soldiers' });
		expect(expandButton.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(expandButton);

		expect(within(region).getByText('Soldier, 11')).toBeTruthy();
		expect(within(region).getByText('Soldier, 12')).toBeTruthy();
		const collapseButton = within(region).getByRole('button', { name: 'Show top 10 at-risk Soldiers' });
		expect(collapseButton.getAttribute('aria-expanded')).toBe('true');
		await fireEvent.click(collapseButton);

		expect(within(region).queryByText('Soldier, 11')).toBeNull();
	});

	it('renders the at-risk call list with no-update labels and sortable operational columns', async () => {
		render(IctAtRiskSoldiersTable, { props: { rows } });

		const region = screen.getByRole('region', { name: 'At-Risk Soldiers' });
		expect(within(region).getByRole('button', { name: 'Sort by Soldier' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by % Complete' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by Tasks Expiring ≤30d' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by Days Since Last ICT Update' })).toBeTruthy();
		expect(within(region).getByText('No ICT update')).toBeTruthy();
		expect(soldierNames(region)).toEqual(['Stale, Ryan', 'NoUpdate, Nora', 'Expiring, Emily']);

		await fireEvent.click(within(region).getByRole('button', { name: 'Sort by Soldier' }));
		expect(soldierNames(region)).toEqual(['Expiring, Emily', 'NoUpdate, Nora', 'Stale, Ryan']);

		await fireEvent.click(within(region).getByRole('button', { name: 'Sort by Tasks Expiring ≤30d' }));
		expect(soldierNames(region)).toEqual(['Expiring, Emily', 'NoUpdate, Nora', 'Stale, Ryan']);

		await fireEvent.click(within(region).getByRole('button', { name: 'Sort by Days Since Last ICT Update' }));
		expect(soldierNames(region)).toEqual(['Stale, Ryan', 'Expiring, Emily', 'NoUpdate, Nora']);
	});

	it('explains when no Soldiers match the active filters', () => {
		render(IctAtRiskSoldiersTable, { props: { rows: [] } });

		const region = screen.getByRole('region', { name: 'At-Risk Soldiers' });
		expect(within(region).getByText('No Soldiers match the active filters.')).toBeTruthy();
		expect(within(region).queryByRole('table')).toBeNull();
	});
});
