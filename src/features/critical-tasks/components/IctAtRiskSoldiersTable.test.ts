// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctAtRiskSoldiersTable from './IctAtRiskSoldiersTable.svelte';
import type { IctAtRiskSoldierRow } from '$features/critical-tasks/utils/ictReports';

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

afterEach(() => cleanup());

describe('IctAtRiskSoldiersTable', () => {
	it('uses the shared data table and expands overflow rows', async () => {
		render(IctAtRiskSoldiersTable, {
			props: {
				rows: Array.from({ length: 12 }, (_, index) => row(index + 1)),
				expiringSoonWindowDays: 60
			}
		});

		const region = screen.getByRole('region', { name: 'At-Risk Soldiers - Call List' });
		expect(within(region).getByRole('table', { name: 'At-risk Soldiers call list' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by Soldier' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by Last Update' })).toBeTruthy();
		expect(within(region).getByText('Soldier, 01')).toBeTruthy();
		expect(within(region).getByText('Soldier, 10')).toBeTruthy();
		expect(within(region).queryByText('Soldier, 11')).toBeNull();

		const expandButton = within(region).getByRole('button', { name: 'Show all 12 at-risk Soldiers' });
		expect(expandButton.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(expandButton);

		expect(within(region).getByText('Soldier, 11')).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Show top 10 at-risk Soldiers' })).toBeTruthy();
	});

	it('explains when no Soldiers match the active filters', () => {
		render(IctAtRiskSoldiersTable, { props: { rows: [], expiringSoonWindowDays: 60 } });

		const region = screen.getByRole('region', { name: 'At-Risk Soldiers - Call List' });
		expect(within(region).getByText('No Soldiers match the active filters.')).toBeTruthy();
		expect(within(region).queryByRole('table')).toBeNull();
	});
});
