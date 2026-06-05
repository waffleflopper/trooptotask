// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctTaskLibraryPage from './IctTaskLibraryPage.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';

const orgContextMock = vi.hoisted(() => {
	const ownerContext = () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		readOnly: false,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' },
		affordanceForFeatureAction(action: { owner: { lane: string }; requiredCapability: string; accessMode: string }) {
			const levels = ['none', 'view', 'operate', 'configure'];
			const actual = this.capabilityMap[action.owner.lane as keyof typeof this.capabilityMap] ?? 'none';
			const hasCapability = levels.indexOf(actual) >= levels.indexOf(action.requiredCapability);
			const readOnlyBlocked = this.readOnly && action.accessMode === 'write';
			return {
				allowed: hasCapability && !readOnlyBlocked,
				visible: hasCapability,
				disabled: hasCapability && readOnlyBlocked,
				reason: readOnlyBlocked
					? 'denied:read-only-overlay'
					: hasCapability
						? 'allowed:capability'
						: 'denied:missing-capability',
				explanation: '',
				decision: {}
			};
		}
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
	category: 'Casualty Care',
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

		expect(screen.getByRole('toolbar', { name: 'ICT task library controls' })).toBeTruthy();
		const library = screen.getByRole('list', { name: 'ICT task library' });
		expect(within(library).getByText('181-105-1001')).toBeTruthy();
		expect(within(library).getByText('Casualty Care / 68W')).toBeTruthy();
		expect(screen.queryByText('181-105-9999')).toBeNull();
	});

	it('orders library filters before search', () => {
		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		const activeToggle = screen.getByRole('button', { name: 'Active' });
		const mosFilter = screen.getByLabelText('MOS');
		const search = screen.getByLabelText('Search');

		expect(activeToggle.compareDocumentPosition(mosFilter) & 4).toBeTruthy();
		expect(mosFilter.compareDocumentPosition(search) & 4).toBeTruthy();
	});

	it('hides import and edit actions for read-only users', () => {
		orgContextMock.current = {
			...orgContextMock.ownerContext(),
			readOnly: true
		};

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		expect(screen.queryByRole('heading', { name: 'Access Restricted' })).toBeNull();
		expect(screen.getByRole('list', { name: 'ICT task library' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'New Task' })).toBeNull();
	});

	it('uses the Critical Tasks configure policy affordance instead of privileged role for library management', () => {
		orgContextMock.current = {
			...orgContextMock.ownerContext(),
			role: 'member',
			isOwner: false,
			isPrivileged: false
		};

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		expect(screen.getByRole('button', { name: 'Import CSV' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'New Task' })).toBeTruthy();
	});

	it('filters active tasks by task search text', async () => {
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

		await fireEvent.input(screen.getByLabelText('Search'), {
			target: { value: '181 care' }
		});

		expect(within(taskList()).getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(within(taskList()).queryByText('Submit readiness report')).toBeNull();
	});

	it('opens the dedicated import workspace instead of the old pasted CSV side panel', async () => {
		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));

		expect(screen.getByRole('toolbar', { name: 'ICT task library controls' })).toBeTruthy();
		expect(await screen.findByRole('heading', { name: 'Import ICT Tasks' })).toBeTruthy();
		expect(screen.getByRole('region', { name: 'ICT task import workspace' })).toBeTruthy();
		expect(screen.queryByLabelText(/CSV data/i)).toBeNull();
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
		await fireEvent.input(screen.getByLabelText('Category'), { target: { value: ' Casualty Care ' } });
		await fireEvent.input(screen.getByLabelText('MOS applicability'), { target: { value: '68w, 18D, 68W' } });
		await fireEvent.input(screen.getByLabelText('Expiration override'), { target: { value: '18' } });
		await fireEvent.input(screen.getByLabelText('Sort order'), { target: { value: '3' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

		expect(add).toHaveBeenCalledWith(
			expect.objectContaining({
				taskCode: '181-105-2000',
				title: 'Evacuate casualty',
				description: 'Move under fire',
				category: 'Casualty Care',
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
		await fireEvent.input(screen.getByLabelText('Category'), { target: { value: '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(update).toHaveBeenCalledWith(
			'task-1',
			expect.objectContaining({
				title: 'Updated title',
				category: null
			})
		);
		expect(personnelIctCompletionsStore.items).toHaveLength(2);
	});

	it('warns with tied personnel completion count before soft-archive', async () => {
		const update = vi.spyOn(ictTasksStore, 'update').mockResolvedValue(true);

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: /Perform tactical combat casualty care/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Archive Task' }));

		expect(await screen.findByText(/2 personnel completion records are tied to this task/)).toBeTruthy();

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

	it('shows archived tasks in a separate view and restores them back to active status', async () => {
		const update = vi.spyOn(ictTasksStore, 'update').mockResolvedValue(true);

		render(IctTaskLibraryPage, { props: { data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
		await fireEvent.click(screen.getByRole('button', { name: /Archived task/ }));

		expect(screen.getByRole('button', { name: 'Restore Task' })).toBeTruthy();
		expect(screen.getByText('Apr 2, 2026')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Restore Task' }));

		await waitFor(() => {
			expect(update).toHaveBeenCalledWith(
				'task-archived',
				expect.objectContaining({
					archivedAt: null
				})
			);
		});
		expect(screen.getByRole('button', { name: 'Active' }).getAttribute('aria-pressed')).toBe('true');
	});
});
