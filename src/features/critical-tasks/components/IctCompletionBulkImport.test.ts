// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctCompletionBulkImport from './IctCompletionBulkImport.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';

const { parseFileMock } = vi.hoisted(() => ({
	parseFileMock: vi.fn()
}));

vi.mock('$lib/utils/csvParser', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/utils/csvParser')>();
	return {
		...actual,
		parseFile: parseFileMock
	};
});

const alphaMedic: Personnel = {
	id: 'person-alpha',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'group-alpha',
	groupName: 'Alpha',
	archivedAt: null
};

const bravoMedic: Personnel = {
	...alphaMedic,
	id: 'person-bravo',
	rank: 'SPC',
	groupId: 'group-bravo',
	groupName: 'Bravo'
};

const tcccTask: IctTask = {
	id: 'task-tccc',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: null,
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 1,
	archivedAt: null,
	createdAt: '2026-04-01T00:00:00Z'
};

const existingCompletion: PersonnelIctCompletion = {
	id: 'completion-existing',
	personnelId: 'person-alpha',
	ictTaskId: 'task-tccc',
	completedAt: '2026-03-01',
	validationMethod: 'Lecture',
	validatedBy: 'MSG Example',
	notes: 'Old note',
	loggedBy: 'user-1',
	createdAt: '2026-03-01T12:00:00Z'
};

describe('IctCompletionBulkImport', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'Task Code', 'Completion Date'],
			['SGT', 'Smith', 'Jane', '181-105-1001', '2026-03-13'],
			['', 'Smith', 'Jane', '181-105-1001', '2026-03-14'],
			['SGT', 'Smith', 'Jane', 'BAD-TASK', '2026-03-15']
		]);
	});

	afterEach(() => {
		cleanup();
	});

	it('uses file upload only and separates ready, ambiguous, and invalid rows in preview', async () => {
		render(IctCompletionBulkImport, {
			props: {
				personnel: [alphaMedic, bravoMedic],
				tasks: [tcccTask],
				completions: [existingCompletion],
				onCancel: vi.fn(),
				onDone: vi.fn()
			}
		});

		expect(screen.queryByLabelText(/CSV data/i)).toBeNull();
		expect(screen.queryByPlaceholderText(/Paste CSV/i)).toBeNull();

		await fireEvent.change(screen.getByLabelText('Upload file'), {
			target: {
				files: [
					new File(['fake'], 'ict-completions.xlsx', {
						type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
					})
				]
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('table')).toBeTruthy();
		});

		expect(screen.getByText('1 ready to import')).toBeTruthy();
		expect(screen.getByText('1 ambiguous')).toBeTruthy();
		expect(screen.getByText('1 invalid')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Ready (1)' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Ambiguous (1)' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Invalid (1)' })).toBeTruthy();
		expect(screen.getByText('Showing Ambiguous rows')).toBeTruthy();
		expect(screen.getByText('Possible matches')).toBeTruthy();
		expect(screen.getByText('SPC Jane Smith')).toBeTruthy();
		expect(screen.getByText('SGT Jane Smith')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Invalid (1)' }));

		expect(screen.getByText('Showing Invalid rows')).toBeTruthy();
		expect(screen.getByText('Row 4')).toBeTruthy();
		expect(screen.getByText('Task code "BAD-TASK" does not match an existing critical task')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Ready (1)' }));

		expect(screen.getByText('Showing Ready rows')).toBeTruthy();
		expect(screen.getByText(/181-105-1001 Perform tactical combat casualty care/i)).toBeTruthy();
		expect(
			screen.getAllByTitle('Multiple personnel records match this row. Add rank or correct the name values.').length
		).toBeGreaterThan(0);
		expect(
			screen.getAllByTitle('Task code "BAD-TASK" does not match an existing critical task').length
		).toBeGreaterThan(0);
	});

	it('imports checked valid rows and renders the created and updated summary', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'Task Code', 'Completion Date', 'Validation Method'],
			['SGT', 'Smith', 'Jane', '181-105-1001', '2026-03-13', 'Simulation']
		]);
		const onDone = vi.fn();
		const importBatch = vi.spyOn(personnelIctCompletionsStore, 'importBatch').mockResolvedValue({
			inserted: [
				{
					id: 'completion-new',
					personnelId: 'person-alpha',
					ictTaskId: 'task-tccc',
					completedAt: '2026-03-13',
					validationMethod: 'Simulation',
					validatedBy: null,
					notes: null,
					loggedBy: 'user-1',
					createdAt: '2026-03-13T12:00:00Z'
				}
			],
			updated: [
				{
					...existingCompletion,
					validationMethod: 'Practical Exercise',
					notes: 'Corrected entry'
				}
			],
			errors: [
				{
					rowNumber: 9,
					personnelName: 'SGT Jane Smith',
					taskCode: '181-105-1001',
					message: 'Batch import failed'
				}
			]
		});

		render(IctCompletionBulkImport, {
			props: {
				personnel: [alphaMedic],
				tasks: [tcccTask],
				completions: [existingCompletion],
				onCancel: vi.fn(),
				onDone
			}
		});

		await fireEvent.change(screen.getByLabelText('Upload file'), {
			target: {
				files: [new File(['fake'], 'ict-completions.csv', { type: 'text/csv' })]
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('table')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Import Checked Rows' }));

		await waitFor(() => {
			expect(importBatch).toHaveBeenCalledWith({
				records: [
					{
						rowNumber: 2,
						values: {
							rank: 'SGT',
							lastName: 'Smith',
							firstName: 'Jane',
							taskCode: '181-105-1001',
							completedAt: '2026-03-13',
							validationMethod: 'Simulation'
						}
					}
				]
			});
		});

		expect(await screen.findByText('Import Finished')).toBeTruthy();
		expect(screen.getByText('1 created')).toBeTruthy();
		expect(screen.getByText('1 updated')).toBeTruthy();
		expect(screen.getByText('1 failed')).toBeTruthy();
		expect(screen.getByText('SGT Jane Smith')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		expect(onDone).toHaveBeenCalledTimes(1);
	});
});
