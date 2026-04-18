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

function taskNames(region: HTMLElement): string[] {
	return within(region)
		.getAllByRole('rowheader')
		.map((header) => header.querySelector('.task-name')?.textContent ?? '');
}

describe('IctTasksBelowThresholdTable', () => {
	afterEach(() => {
		cleanup();
	});

	it('defaults to the top 10 compact rows and exposes an accessible expand/collapse control', async () => {
		render(IctTasksBelowThresholdTable, {
			props: {
				rows: Array.from({ length: 12 }, (_, index) => row(index + 1)),
				thresholdPercent: 70
			}
		});

		const region = screen.getByRole('region', { name: 'Tasks Below Unit Threshold' });
		expect(within(region).getByRole('button', { name: 'Sort by Task ID + Name' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by % Complete' })).toBeTruthy();
		expect(within(region).getByRole('button', { name: 'Sort by Soldier Gap' })).toBeTruthy();
		expect(within(region).getByText('081-000-0001')).toBeTruthy();
		expect(within(region).getByText('Task 10')).toBeTruthy();
		expect(within(region).queryByText('Task 11')).toBeNull();
		expect(region.querySelectorAll('tbody tr')).toHaveLength(10);

		const expandButton = within(region).getByRole('button', { name: 'Show all 12 tasks below threshold' });
		expect(expandButton.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(expandButton);

		expect(within(region).getByText('Task 11')).toBeTruthy();
		expect(within(region).getByText('Task 12')).toBeTruthy();
		const collapseButton = within(region).getByRole('button', { name: 'Show top 10 tasks below threshold' });
		expect(collapseButton.getAttribute('aria-expanded')).toBe('true');
		await fireEvent.click(collapseButton);

		expect(within(region).queryByText('Task 11')).toBeNull();
	});

	it('lets training staff sort by task, percent complete, and soldier gap', async () => {
		const rows: IctTaskBelowThresholdRow[] = [
			{
				taskId: 'task-bravo',
				taskCode: '081-000-0002',
				taskName: 'Bravo task',
				percentComplete: 40,
				soldierGapCount: 1,
				applicableCount: 5,
				completeCount: 2
			},
			{
				taskId: 'task-alpha',
				taskCode: '071-000-0001',
				taskName: 'Alpha task',
				percentComplete: 60,
				soldierGapCount: 4,
				applicableCount: 10,
				completeCount: 6
			},
			{
				taskId: 'task-charlie',
				taskCode: '091-000-0003',
				taskName: 'Charlie task',
				percentComplete: 20,
				soldierGapCount: 2,
				applicableCount: 5,
				completeCount: 1
			}
		];
		render(IctTasksBelowThresholdTable, {
			props: {
				rows,
				thresholdPercent: 70
			}
		});

		const region = screen.getByRole('region', { name: 'Tasks Below Unit Threshold' });
		expect(taskNames(region)).toEqual(['Bravo task', 'Alpha task', 'Charlie task']);

		await fireEvent.click(within(region).getByRole('button', { name: 'Sort by Task ID + Name' }));
		expect(taskNames(region)).toEqual(['Alpha task', 'Bravo task', 'Charlie task']);

		await fireEvent.click(within(region).getByRole('button', { name: 'Sort by % Complete' }));
		expect(taskNames(region)).toEqual(['Charlie task', 'Bravo task', 'Alpha task']);

		await fireEvent.click(within(region).getByRole('button', { name: 'Sort by Soldier Gap' }));
		expect(taskNames(region)).toEqual(['Alpha task', 'Charlie task', 'Bravo task']);
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
