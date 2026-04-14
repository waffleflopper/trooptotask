// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctTaskLibraryPage from './IctTaskLibraryPage.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: true,
		permissions: {
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
		},
		scopedGroupId: null,
		readOnly: false
	})
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

const completions = [
	{ id: 'c1', ictTaskId: 'task-1' },
	{ id: 'c2', ictTaskId: 'task-1' }
] as PersonnelIctCompletion[];

describe('IctTaskLibraryPage', () => {
	beforeEach(() => {
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
