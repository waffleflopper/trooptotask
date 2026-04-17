// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctTaskBulkImport from './IctTaskBulkImport.svelte';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';

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
		parseFileMock.mockResolvedValue([
			['Task Code', 'Title', 'MOS'],
			['181-105-2000', 'Task one', '68W'],
			['181-105-2000', 'Task duplicate', '18D']
		]);
	});

	afterEach(() => {
		cleanup();
	});

	it('uses file upload only and surfaces duplicate task codes in the preview table', async () => {
		render(IctTaskBulkImport, {
			props: {
				tasks: existingTasks,
				onCancel: vi.fn(),
				onDone: vi.fn()
			}
		});

		expect(screen.queryByLabelText(/CSV data/i)).toBeNull();
		expect(screen.queryByPlaceholderText(/Paste CSV/i)).toBeNull();

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
		expect(
			screen.getAllByTitle('Duplicate task code "181-105-2000" also appears on row 3 ("Task duplicate")').length
		).toBeGreaterThan(0);
		expect(
			screen.getAllByTitle('Duplicate task code "181-105-2000" also appears on row 2 ("Task one")').length
		).toBeGreaterThan(0);
	});

	it('imports checked rows and renders the created and updated summary', async () => {
		parseFileMock.mockResolvedValue([
			['Task Code', 'Title', 'MOS', 'Expiration Months'],
			['181-105-2001', 'Task one', '68W', '12']
		]);
		const importBatch = vi.spyOn(ictTasksStore, 'importBatch').mockResolvedValue({
			inserted: [
				{
					id: 'task-new',
					taskCode: '181-105-2001',
					title: 'Task one',
					description: null,
					mos: ['68W'],
					expirationMonths: 12,
					sortOrder: 2,
					archivedAt: null,
					createdAt: '2026-04-15T00:00:00Z'
				}
			],
			updated: [],
			restored: [],
			errors: []
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
			errors: []
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

		expect(await screen.findByText('Rows tagged in amber will restore archived tasks.')).toBeTruthy();
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
	});
});
