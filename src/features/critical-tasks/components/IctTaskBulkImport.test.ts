// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctTaskBulkImport from './IctTaskBulkImport.svelte';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import {
	criticalTasksWorkspaceStatus,
	resetCriticalTasksWorkspaceStatus
} from '$features/critical-tasks/criticalTasksWorkspaceStatus.svelte';

const { parseFileMock } = vi.hoisted(() => ({
	parseFileMock: vi.fn()
}));

vi.mock('$lib/utils/csvParser', () => ({
	parseFile: parseFileMock
}));

const existingTasks: IctTask[] = [
	{
		id: 'task-existing',
		taskCode: '181-105-1000',
		title: 'Existing task',
		description: null,
		mos: ['68W'],
		expirationMonths: 12,
		sortOrder: 1,
		archivedAt: null,
		createdAt: '2026-04-01T00:00:00Z'
	},
	{
		id: 'task-archived',
		taskCode: '181-105-3000',
		title: 'Archived task',
		description: null,
		mos: ['11B'],
		expirationMonths: 24,
		sortOrder: 7,
		archivedAt: '2026-04-10T00:00:00Z',
		createdAt: '2026-04-01T00:00:00Z'
	}
];

describe('IctTaskBulkImport', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetCriticalTasksWorkspaceStatus();
		parseFileMock.mockResolvedValue([
			['Task Code', 'Title', 'MOS'],
			['181-105-2000', 'Task one', '68W'],
			['181-105-2000', 'Task duplicate', '18D']
		]);
	});

	afterEach(() => {
		cleanup();
	});

	it('blocks duplicate task codes with accessible row reasons', async () => {
		render(IctTaskBulkImport, {
			props: {
				tasks: existingTasks,
				onCancel: vi.fn(),
				onDone: vi.fn()
			}
		});

		const fileInput = screen.getByLabelText('Upload file');
		await fireEvent.change(fileInput, {
			target: {
				files: [
					new File(['fake'], 'tasks.xlsx', {
						type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
					})
				]
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('table')).toBeTruthy();
		});

		expect(screen.getByText('2 errors')).toBeTruthy();
		const blocked = screen
			.getAllByRole('checkbox')
			.filter((checkbox) => checkbox.getAttribute('aria-invalid') === 'true')
			.map((checkbox) =>
				(checkbox.getAttribute('aria-describedby') ?? '')
					.split(/\s+/)
					.map((id) => document.getElementById(id)?.textContent?.trim())
			);
		expect(blocked).toEqual([
			['Duplicate task code "181-105-2000" also appears on row 3 ("Task duplicate")'],
			['Duplicate task code "181-105-2000" also appears on row 2 ("Task one")']
		]);
	});

	it('imports checked rows and renders the created and updated summary', async () => {
		parseFileMock.mockResolvedValue([
			['Task Code', 'Title', 'Category', 'MOS', 'Expiration Months'],
			['181-105-2001', 'Task one', 'Casualty Care', '68W', '12']
		]);
		const importBatch = vi.spyOn(ictTasksStore, 'importBatch').mockResolvedValue({
			inserted: [
				{
					id: 'task-new',
					taskCode: '181-105-2001',
					title: 'Task one',
					description: null,
					category: 'Casualty Care',
					mos: ['68W'],
					expirationMonths: 12,
					sortOrder: 2,
					archivedAt: null,
					createdAt: '2026-04-15T00:00:00Z'
				}
			],
			updated: [],
			restored: [],
			errors: [],
			unconfirmed: [],
			notAttempted: []
		});

		render(IctTaskBulkImport, {
			props: {
				tasks: existingTasks,
				onCancel: vi.fn(),
				onDone: vi.fn()
			}
		});

		const fileInput = screen.getByLabelText('Upload file');
		await fireEvent.change(fileInput, {
			target: {
				files: [
					new File(['fake'], 'tasks.xlsx', {
						type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
					})
				]
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('table')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Import Checked Rows' }));

		await waitFor(() => {
			expect(importBatch).toHaveBeenCalledWith({
				mode: 'create-only',
				records: [
					{
						rowNumber: 2,
						values: {
							taskCode: '181-105-2001',
							title: 'Task one',
							category: 'Casualty Care',
							mos: '68W',
							expirationMonths: '12'
						}
					}
				]
			});
		});

		expect(await screen.findByText('Import Finished')).toBeTruthy();
		expect(screen.getByText('1 created')).toBeTruthy();
		expect(screen.getByText('0 updated')).toBeTruthy();
		expect(screen.getByText('0 restored')).toBeTruthy();
		expect(screen.getByText('0 failed')).toBeTruthy();
	});

	it('shows restore warnings in preview and reports restored rows separately', async () => {
		parseFileMock.mockResolvedValue([
			['Task Code', 'Title', 'MOS'],
			['181-105-3000', 'Restored task', '11B']
		]);
		const importBatch = vi.spyOn(ictTasksStore, 'importBatch').mockResolvedValue({
			inserted: [],
			updated: [],
			restored: [
				{
					...existingTasks[1],
					title: 'Restored task',
					archivedAt: null
				}
			],
			errors: [],
			unconfirmed: [],
			notAttempted: []
		});

		render(IctTaskBulkImport, {
			props: {
				tasks: existingTasks,
				onCancel: vi.fn(),
				onDone: vi.fn()
			}
		});

		await fireEvent.change(screen.getByLabelText('Upload file'), {
			target: {
				files: [new File(['fake'], 'tasks.csv', { type: 'text/csv' })]
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('table')).toBeTruthy();
		});

		const importBehavior = screen.getByLabelText('Import behavior') as HTMLSelectElement;
		importBehavior.value = 'upsert';
		await fireEvent.change(importBehavior);

		expect(await screen.findByText('Will restore archived task')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Import Checked Rows' }));

		await waitFor(() => {
			expect(importBatch).toHaveBeenCalledWith({
				mode: 'upsert',
				records: [
					{
						rowNumber: 2,
						values: {
							taskCode: '181-105-3000',
							title: 'Restored task',
							mos: '11B'
						}
					}
				]
			});
		});

		expect(await screen.findByText('1 restored')).toBeTruthy();
		expect(screen.getByText('0 failed')).toBeTruthy();
		expect(criticalTasksWorkspaceStatus.refreshRequested).toBe(true);
	});

	it.each([
		{ stopped: true, heading: 'Import Stopped' },
		{ stopped: false, heading: 'Import Needs Review' }
	])('shows $heading with truthful counts and reload guidance', async ({ stopped, heading }) => {
		parseFileMock.mockResolvedValue([
			['Task Code', 'Title'],
			['181-105-2001', 'Task one'],
			['181-105-2002', 'Task two'],
			['181-105-2003', 'Task three']
		]);
		vi.spyOn(ictTasksStore, 'importBatch').mockResolvedValue({
			inserted: [{ ...existingTasks[0], id: 'task-one', taskCode: '181-105-2001', title: 'Task one' }],
			updated: [],
			restored: [],
			errors: [],
			unconfirmed: [
				{
					rowNumber: 3,
					taskCode: '181-105-2002',
					title: 'Task two',
					message: "We couldn't confirm that this was saved. Reload to check it before trying again."
				}
			],
			notAttempted: stopped
				? [
						{
							rowNumber: 4,
							taskCode: '181-105-2003',
							title: 'Task three',
							message: 'Not sent because an earlier part of the import stopped.'
						}
					]
				: []
		});

		render(IctTaskBulkImport, { props: { tasks: existingTasks, onCancel: vi.fn(), onDone: vi.fn() } });
		await fireEvent.change(screen.getByLabelText('Upload file'), {
			target: { files: [new File(['fake'], 'tasks.csv', { type: 'text/csv' })] }
		});
		await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Import Checked Rows' }));

		expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
		expect(screen.getByText('1 created')).toBeTruthy();
		expect(screen.getByText('0 failed')).toBeTruthy();
		expect(screen.getByText('1 not confirmed')).toBeTruthy();
		expect(screen.queryByText('1 not imported') !== null).toBe(stopped);
		expect(screen.getByText('181-105-2002 - Task two')).toBeTruthy();
		expect(screen.queryByText('181-105-2003 - Task three') !== null).toBe(stopped);
		expect(screen.getByText(/Reload to check them before importing them again/)).toBeTruthy();
		expect(criticalTasksWorkspaceStatus.refreshRequested).toBe(true);
	});
});
