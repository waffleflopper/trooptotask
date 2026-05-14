// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctTasksBelowThresholdTable from './IctTasksBelowThresholdTable.svelte';
import type { IctTaskBelowThresholdRow } from '$features/critical-tasks/utils/ictReports';

function row(index: number): IctTaskBelowThresholdRow {
	return {
		taskId: `task-${index}`,
		taskCode: `081-000-${String(index).padStart(4, '0')}`,
		taskName: `Task ${index}`,
		percentComplete: index,
		soldierGapCount: 20 - index,
		applicableCount: 20,
		completeCount: index
	};
}

afterEach(() => cleanup());

describe('IctTasksBelowThresholdTable', () => {
	it('uses the shared data table and expands overflow rows', async () => {
		render(IctTasksBelowThresholdTable, {
			props: {
				rows: Array.from({ length: 12 }, (_, index) => row(index + 1)),
				thresholdPercent: 70
			}
		});

		const region = screen.getByRole('region', { name: 'Tasks Below Unit Threshold' });
		expect(within(region).getByRole('table', { name: 'Tasks below unit threshold' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by Task' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by Complete' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by Gap' })).toBeTruthy();
		expect(within(region).getByText('081-000-0001')).toBeTruthy();
		expect(within(region).getByText('Task 10')).toBeTruthy();
		expect(within(region).queryByText('Task 11')).toBeNull();

		const expandButton = within(region).getByRole('button', { name: 'Show all 12 tasks below threshold' });
		await fireEvent.click(expandButton);

		expect(within(region).getByText('Task 11')).toBeTruthy();
		expect(within(region).getByText('Task 12')).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Show top 10 tasks below threshold' })).toBeTruthy();
	});

	it('explains when no tasks are below threshold for the active filters', () => {
		render(IctTasksBelowThresholdTable, {
			props: {
				rows: [],
				thresholdPercent: 70
			}
		});

		const region = screen.getByRole('region', { name: 'Tasks Below Unit Threshold' });
		expect(within(region).getByText('No tasks are below 70% for the active filters.')).toBeTruthy();
		expect(within(region).queryByRole('table')).toBeNull();
	});
});
