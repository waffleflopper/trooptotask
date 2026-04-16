// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctTaskLibraryPage from './IctTaskLibraryPage.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';

const orgContextMock = vi.hoisted(() => {
	const permissions = {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: true
	};
	const ownerContext = () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: true,
		permissions: { ...permissions },
		scopedGroupId: null,
		readOnly: false
	});

	return {
		current: ownerContext(),
		ownerContext
	};
});

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => orgContextMock.current
}));

const activeTask: IctTask = {
	id: 'task-1',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: 'Aid under fire',
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 2,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

const archivedTask: IctTask = {
	...activeTask,
	id: 'task-archived',
	taskCode: '181-105-9999',
	title: 'Archived task',
	archivedAt: '2026-04-02T12:00:00Z'
};

const infantryTask: IctTask = {
	...activeTask,
	id: 'task-infantry',
	taskCode: '071-COM-1001',
	title: 'React to contact',
	description: null,
	mos: ['11B'],
	expirationMonths: null,
	sortOrder: 1
};

const allMosTask: IctTask = {
	...activeTask,
	id: 'task-all-mos',
	taskCode: '071-COM-2001',
	title: 'Submit readiness report',
	description: null,
	mos: [],
	expirationMonths: null,
	sortOrder: 3
};

const completions = [
	{ id: 'c1', ictTaskId: 'task-1' },
	{ id: 'c2', ictTaskId: 'task-1' }
] as PersonnelIctCompletion[];

describe('IctTaskLibraryPage', () => {
	beforeEach(() => {
		orgContextMock.current = orgContextMock.ownerContext();
		ictTasksStore.load([activeTask, archivedTask], 'org-1');
		personnelIctCompletionsStore.load(completions, 'org-1');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		cleanup();
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it('shows active tasks only in configured library order', () => {
		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		expect(screen.getByText('181-105-1001')).toBeTruthy();
		expect(screen.queryByText('181-105-9999')).toBeNull();
	});

	it('hides import and edit actions for read-only users', () => {
		orgContextMock.current = {
			...orgContextMock.ownerContext(),
			readOnly: true
		};

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'New Task' })).toBeNull();
	});

	it('filters active tasks by task search text and MOS applicability', async () => {
		ictTasksStore.load([activeTask, infantryTask, allMosTask, archivedTask], 'org-1');

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		const taskList = () => screen.getByRole('list', { name: 'ICT task library' });

		expect(within(taskList()).getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(within(taskList()).getByText('React to contact')).toBeTruthy();
		expect(within(taskList()).getByText('Submit readiness report')).toBeTruthy();

		await fireEvent.input(screen.getByLabelText('Search'), {
			target: { value: 'contact' }
		});

		expect(within(taskList()).getByText('React to contact')).toBeTruthy();
		expect(within(taskList()).queryByText('Perform tactical combat casualty care')).toBeNull();

		await fireEvent.input(screen.getByLabelText('Search'), {
			target: { value: '' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'MOS' }));
		await fireEvent.mouseDown(within(screen.getByRole('listbox')).getByText('68W'));

		expect(within(taskList()).getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(within(taskList()).getByText('Submit readiness report')).toBeTruthy();
		expect(within(taskList()).queryByText('React to contact')).toBeNull();
		expect(screen.getByText('2 of 3 shown')).toBeTruthy();

		await fireEvent.input(screen.getByLabelText('Search'), {
			target: { value: '181 care' }
		});

		expect(within(taskList()).getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(within(taskList()).queryByText('Submit readiness report')).toBeNull();
	});

	it('reviews pasted CSV task imports before saving valid rows', async () => {
		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
		expect(screen.getByText(/Optional columns: Description, MOS, Expiration Months, Sort Order/)).toBeTruthy();
		expect(screen.getByText(/181-105-2000,Evacuate casualty,68W,12/)).toBeTruthy();
		await fireEvent.input(screen.getByLabelText('CSV data'), {
			target: {
				value: [
					'Task Code,Title,MOS,Expiration Months',
					'181-105-2000,Evacuate casualty,68W,12',
					',Missing task code,68W,12'
				].join('\n')
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Import' }));

		await waitFor(() => {
			expect(screen.getByText('Ready to import')).toBeTruthy();
		});

		const readySection = screen.getByRole('region', { name: 'Ready to import' });
		const invalidSection = screen.getByRole('region', { name: 'Needs fixes' });

		expect(within(readySection).getByText('181-105-2000')).toBeTruthy();
		expect(within(readySection).getByText('Evacuate casualty')).toBeTruthy();
		expect(within(invalidSection).getByText('Row 3')).toBeTruthy();
		expect(within(invalidSection).getByText('Task code is required')).toBeTruthy();
	});

	it('commits valid CSV import rows without creating completion records', async () => {
		const add = vi.spyOn(ictTasksStore, 'add').mockResolvedValue({
			...activeTask,
			id: 'task-imported',
			taskCode: '181-105-2000',
			title: 'Evacuate casualty',
			sortOrder: 3
		});
		const update = vi.spyOn(ictTasksStore, 'update').mockResolvedValue(true);

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
		await fireEvent.change(screen.getByLabelText('Import behavior'), {
			target: { value: 'upsert' }
		});
		await fireEvent.input(screen.getByLabelText('CSV data'), {
			target: {
				value: [
					'Task Code,Title,MOS,Expiration Months',
					'181-105-1001,Updated TCCC task,68W,18',
					'181-105-2000,Evacuate casualty,68W,12'
				].join('\n')
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Import' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Import Valid Rows' }));

		await waitFor(() => {
			expect(update).toHaveBeenCalledWith(
				'task-1',
				expect.objectContaining({
					taskCode: '181-105-1001',
					title: 'Updated TCCC task',
					mos: ['68W'],
					expirationMonths: 18
				})
			);
			expect(add).toHaveBeenCalledWith(
				expect.objectContaining({
					taskCode: '181-105-2000',
					title: 'Evacuate casualty',
					mos: ['68W'],
					expirationMonths: 12,
					archivedAt: null
				})
			);
		});
		expect(personnelIctCompletionsStore.items).toHaveLength(2);
		expect(await screen.findByText('Import complete')).toBeTruthy();
	});

	it('creates task metadata with normalized MOS applicability and optional expiration override', async () => {
		const add = vi.spyOn(ictTasksStore, 'add').mockResolvedValue({
			...activeTask,
			id: 'task-new',
			taskCode: '181-105-2000',
			title: 'Evacuate casualty',
			mos: ['68W', '18D'],
			sortOrder: 3
		});

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		await fireEvent.input(screen.getByLabelText('Task code'), { target: { value: '181-105-2000' } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Evacuate casualty' } });
		await fireEvent.input(screen.getByLabelText('Description'), { target: { value: 'Move under fire' } });
		await fireEvent.input(screen.getByLabelText('MOS applicability'), { target: { value: '68w, 18D, 68W' } });
		await fireEvent.input(screen.getByLabelText('Expiration override'), { target: { value: '18' } });
		await fireEvent.input(screen.getByLabelText('Sort order'), { target: { value: '3' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

		expect(add).toHaveBeenCalledWith(
			expect.objectContaining({
				taskCode: '181-105-2000',
				title: 'Evacuate casualty',
				description: 'Move under fire',
				mos: ['68W', '18D'],
				expirationMonths: 18,
				sortOrder: 3,
				archivedAt: null
			})
		);
	});

	it('edits task metadata without touching completion history', async () => {
		const update = vi.spyOn(ictTasksStore, 'update').mockResolvedValue(true);

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: /Perform tactical combat casualty care/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Updated title' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(update).toHaveBeenCalledWith(
			'task-1',
			expect.objectContaining({
				title: 'Updated title'
			})
		);
		expect(personnelIctCompletionsStore.items).toHaveLength(2);
	});

	it('warns with tied personnel completion count before soft-archive', async () => {
		const update = vi.spyOn(ictTasksStore, 'update').mockResolvedValue(true);

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: /Perform tactical combat casualty care/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Archive Task' }));

		expect(screen.getByText(/2 personnel completion records are tied to this task/)).toBeTruthy();

		await fireEvent.click(screen.getAllByRole('button', { name: 'Archive Task' }).at(-1)!);

		await waitFor(() => {
			expect(update).toHaveBeenCalledWith(
				'task-1',
				expect.objectContaining({
					archivedAt: expect.any(String)
				})
			);
		});
		expect(personnelIctCompletionsStore.items).toHaveLength(2);
	});
});
