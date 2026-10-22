// @vitest-environment happy-dom
import { createClientAccess, type ClientAccessFacts } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctPersonnelDetailPage from './IctPersonnelDetailPage.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import { CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE } from '$features/critical-tasks/contracts';
import { toastStore } from '$lib/stores/toast.svelte';
import { openToolbarMore, openToolbarSubmenu, stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import type {
	CriticalTasksPersonnelHistoryData,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';

let accessFacts: ClientAccessFacts = { membershipRole: 'owner', capabilityMap: createCapabilityMap('configure') };
const org = createClientAccess(() => accessFacts);

const criticalTasksLayoutData = {
	data: {
		settings: {
			defaultExpirationMonths: 12,
			expiringSoonWarningDays: 60
		}
	}
};

const history: CriticalTasksPersonnelHistoryData = {
	personnel: {
		id: 'p-1',
		rank: 'SGT',
		firstName: 'Jane',
		lastName: 'Smith',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: null,
		groupName: ''
	},
	rows: [
		{
			completion: {
				id: 'completion-1',
				personnelId: 'p-1',
				ictTaskId: 'task-archived',
				completedAt: '2026-04-02',
				validationMethod: 'Practical Exercise',
				validatedBy: 'SFC Jones',
				notes: 'Lane validation',
				loggedBy: 'user-1',
				createdAt: '2026-04-02T12:00:00Z'
			},
			task: null,
			taskCode: '181-105-1002',
			taskTitle: 'Evacuate casualty',
			taskArchivedAt: '2026-04-14T12:00:00Z'
		}
	]
};

const activeTask: IctTask = {
	id: 'task-active',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: null,
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

const nonApplicableTask: IctTask = {
	id: 'task-not-applicable',
	taskCode: '181-105-2001',
	title: 'Infantry lane rehearsal',
	description: null,
	mos: ['11B'],
	expirationMonths: 12,
	sortOrder: 1,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

const secondaryActiveTask: IctTask = {
	id: 'task-secondary',
	taskCode: '181-105-1003',
	title: 'Airway management',
	description: null,
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 1,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

const activeCompletion: PersonnelIctCompletion = {
	id: 'completion-active',
	personnelId: 'p-1',
	ictTaskId: 'task-active',
	completedAt: '2098-01-01',
	validationMethod: 'Demonstration',
	validatedBy: 'SFC Observer',
	notes: 'Observed on lane 2',
	loggedBy: 'user-1',
	createdAt: '2098-01-01T12:00:00Z'
};

function mockJsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body)
	} as Response;
}

function createDeferredResponse() {
	let resolve!: (value: Response) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<Response>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function chooseCompletionDate(label: RegExp): Promise<void> {
	await fireEvent.click(screen.getByLabelText(/Completion Date/i));
	const day = await screen.findByRole('button', { name: label });
	await fireEvent.click(day);
}

describe('IctPersonnelDetailPage', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
		accessFacts = { membershipRole: 'owner', capabilityMap: createCapabilityMap('configure') };
		ictTasksStore.load([], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
	});

	afterEach(cleanup);

	afterEach(() => {
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('lists active applicable tasks for the selected soldier with their current details', () => {
		ictTasksStore.load([activeTask, nonApplicableTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		expect(screen.getByRole('table', { name: 'Applicable Critical Tasks' })).toBeTruthy();
		expect(screen.getByText('181-105-1001')).toBeTruthy();
		expect(screen.getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(screen.queryByText('181-105-2001')).toBeNull();
		expect(screen.getByText('01 JAN 2099')).toBeTruthy();
		expect(screen.getByText('Demonstration')).toBeTruthy();
		expect(screen.getByText('SFC Observer')).toBeTruthy();
		expect(screen.getByText('Observed on lane 2')).toBeTruthy();
	});

	it('keeps applicable task rows in library order and hides viewer actions', () => {
		ictTasksStore.load([secondaryActiveTask, activeTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const data = {
			orgId: 'org-1',
			criticalTasks: criticalTasksLayoutData,
			criticalTasksPersonnelHistory: { ...history, rows: [] }
		};

		const { unmount } = render(IctPersonnelDetailPage, { props: { org, data } });

		const active = screen.getByRole('table', { name: 'Applicable Critical Tasks' });
		expect(
			within(active)
				.getAllByText(/^181-105-100\d$/)
				.map((code) => code.textContent)
		).toEqual(['181-105-1001', '181-105-1003']);
		unmount();

		accessFacts = { membershipRole: 'member', capabilityMap: createCapabilityMap('view') };
		ictTasksStore.load([], 'org-1');
		render(IctPersonnelDetailPage, { props: { org, data } });

		const viewOnly = screen.getByRole('table', { name: 'Applicable Critical Tasks' });
		expect(within(viewOnly).queryByRole('columnheader', { name: 'Action' })).toBeNull();
	});

	it('heads each record row with its task and scrolls each table inside a named focusable region', () => {
		ictTasksStore.load([activeTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');
		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						personnel: { ...history.personnel, archivedAt: '2026-04-14T12:00:00Z' },
						rows: [
							{
								completion: activeCompletion,
								task: activeTask,
								taskCode: activeTask.taskCode,
								taskTitle: activeTask.title,
								taskArchivedAt: null
							}
						]
					}
				}
			}
		});

		for (const name of ['Applicable Critical Tasks', 'ICT completion history']) {
			const table = screen.getByRole('table', { name });
			const rowHeaders = within(table).getAllByRole('rowheader');
			expect(rowHeaders.map((header) => header.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
				'181-105-1001 Perform tactical combat casualty care'
			]);
			expect(rowHeaders[0].getAttribute('scope')).toBe('row');
			const region = screen.getByRole('region', { name: `${name}, scrollable` });
			expect(region.getAttribute('tabindex')).toBe('0');
			expect(region.contains(table)).toBe(true);
		}
		expect(screen.queryByRole('main')).toBeNull();
	});

	it('shows archived personnel completion history read-only when the active workspace omits it', () => {
		ictTasksStore.load([activeTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						personnel: { ...history.personnel, archivedAt: '2026-04-14T12:00:00Z' },
						rows: [
							{
								completion: activeCompletion,
								task: activeTask,
								taskCode: activeTask.taskCode,
								taskTitle: activeTask.title,
								taskArchivedAt: null
							}
						]
					}
				}
			}
		});

		const table = screen.getByRole('table', { name: 'Applicable Critical Tasks' });
		expect(within(table).getByText('Demonstration')).toBeTruthy();
		expect(within(table).getByText('01 JAN 2098')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Input Task' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Edit completion for 181-105-1001' })).toBeNull();
	});

	it('retains an archived person’s completion when their current MOS no longer includes the task', () => {
		ictTasksStore.load([activeTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						personnel: { ...history.personnel, mos: '11B', archivedAt: '2026-04-14T12:00:00Z' },
						rows: [
							{
								completion: activeCompletion,
								task: activeTask,
								taskCode: activeTask.taskCode,
								taskTitle: activeTask.title,
								taskArchivedAt: null
							}
						]
					}
				}
			}
		});

		const table = screen.getByRole('table', { name: 'ICT completion history' });
		expect(within(table).getByText('181-105-1001')).toBeTruthy();
		expect(within(table).getByText('Demonstration')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Input Task' })).toBeNull();
	});

	it('closes an edit dialog when navigation changes to an archived person', async () => {
		ictTasksStore.load([activeTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');
		const { rerender } = render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: { ...history, rows: [] }
				}
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Edit completion for 181-105-1001' }));
		expect(screen.getByRole('dialog', { name: 'Edit ICT Completion' })).toBeTruthy();

		await rerender({
			org,
			data: {
				orgId: 'org-1',
				criticalTasks: criticalTasksLayoutData,
				criticalTasksPersonnelHistory: {
					personnel: { ...history.personnel, id: 'p-archived', archivedAt: '2026-04-14T12:00:00Z' },
					rows: []
				}
			}
		});

		expect(screen.queryByRole('dialog', { name: 'Edit ICT Completion' })).toBeNull();

		await rerender({
			org,
			data: {
				orgId: 'org-1',
				criticalTasks: criticalTasksLayoutData,
				criticalTasksPersonnelHistory: {
					personnel: { ...history.personnel, id: 'p-third' },
					rows: []
				}
			}
		});
		expect(screen.queryByRole('dialog', { name: 'Edit ICT Completion' })).toBeNull();
	});

	it('does not reopen task input after switching from a read-only person to another operator record', async () => {
		ictTasksStore.load([activeTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const { rerender } = render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: { ...history, rows: [] }
				}
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Input Task' }));
		expect(screen.getByRole('dialog')).toBeTruthy();

		await rerender({
			org,
			data: {
				orgId: 'org-1',
				criticalTasks: criticalTasksLayoutData,
				criticalTasksPersonnelHistory: {
					personnel: { ...history.personnel, id: 'p-archived', archivedAt: '2026-04-14T12:00:00Z' },
					rows: []
				}
			}
		});
		expect(screen.queryByRole('dialog')).toBeNull();

		await rerender({
			org,
			data: {
				orgId: 'org-1',
				criticalTasks: criticalTasksLayoutData,
				criticalTasksPersonnelHistory: {
					personnel: { ...history.personnel, id: 'p-third' },
					rows: []
				}
			}
		});
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('keeps the page read-only for members without Critical Tasks edit access', () => {
		accessFacts.capabilityMap!.criticalTasks = 'view';
		ictTasksStore.load([activeTask, secondaryActiveTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		expect(screen.getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Edit completion for 181-105-1001' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Log completion for 181-105-1003' })).toBeNull();
	});

	it('shows completion actions from Critical Tasks record-completion Policy Decisions, not legacy edit flags', () => {
		accessFacts.capabilityMap!.criticalTasks = 'operate';
		accessFacts.scopeSet = { kind: 'groups', groupIds: ['group-alpha'] };
		ictTasksStore.load([activeTask, secondaryActiveTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						...history,
						personnel: {
							...history.personnel,
							groupId: 'group-alpha',
							groupName: 'Alpha'
						},
						rows: []
					}
				}
			}
		});

		expect(screen.getByRole('button', { name: 'Edit completion for 181-105-1001' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Log completion for 181-105-1003' })).toBeTruthy();
	});

	it('hides completion actions when the personnel record is outside the advisory Scope Set', () => {
		accessFacts.capabilityMap!.criticalTasks = 'operate';
		accessFacts.scopeSet = { kind: 'groups', groupIds: ['group-alpha'] };
		ictTasksStore.load([activeTask, secondaryActiveTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						...history,
						personnel: {
							...history.personnel,
							groupId: 'group-bravo',
							groupName: 'Bravo'
						},
						rows: []
					}
				}
			}
		});

		expect(screen.queryByRole('button', { name: 'Edit completion for 181-105-1001' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Log completion for 181-105-1003' })).toBeNull();
	});

	it('lets Critical Tasks operators log a completion from the detail page without a reload', async () => {
		const deferred = createDeferredResponse();
		const fetchMock = vi.fn().mockReturnValue(deferred.promise);
		vi.stubGlobal('fetch', fetchMock);
		ictTasksStore.load([secondaryActiveTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					viewer: { displayName: 'SFC Taylor Example' },
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Log completion for 181-105-1003' }));

		expect(await screen.findByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();

		await chooseCompletionDate(/May 10, 2026/i);
		await fireEvent.change(screen.getByLabelText(/Validation Method/i), {
			target: { value: 'Practical Exercise' }
		});
		await fireEvent.click(screen.getByLabelText('I am the validator'));
		await waitFor(() => {
			expect((screen.getByLabelText(/Validated By/i) as HTMLInputElement).value).toBe('SFC Taylor Example');
		});
		await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), {
			target: { value: 'Lane validation' }
		});

		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe('/org/org-1/api/personnel-ict-completions');
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			personnelId: 'p-1',
			ictTaskId: 'task-secondary',
			completedAt: '2026-05-10',
			validationMethod: 'Practical Exercise',
			validatedBy: 'SFC Taylor Example',
			notes: 'Lane validation'
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Edit completion for 181-105-1003' })).toBeTruthy();
		});

		deferred.resolve(
			mockJsonResponse({
				id: 'completion-secondary',
				personnelId: 'p-1',
				ictTaskId: 'task-secondary',
				completedAt: '2026-05-10',
				validationMethod: 'Practical Exercise',
				validatedBy: 'SFC Taylor Example',
				notes: 'Lane validation',
				loggedBy: 'user-1',
				createdAt: '2098-02-01T12:00:00Z'
			})
		);

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Log ICT Completion' })).toBeNull();
		});
	});

	it('lets Critical Tasks operators input a task from the personnel toolbar with an MOS-scoped task search', async () => {
		const deferred = createDeferredResponse();
		const fetchMock = vi.fn().mockReturnValue(deferred.promise);
		vi.stubGlobal('fetch', fetchMock);
		ictTasksStore.load([secondaryActiveTask, nonApplicableTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Input Task' }));

		expect(await screen.findByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Person' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Critical Task' }));

		let taskList = screen.getByRole('listbox');
		expect(within(taskList).getByText('181-105-1003 Airway management')).toBeTruthy();
		expect(within(taskList).queryByText('181-105-2001 Infantry lane rehearsal')).toBeNull();

		await fireEvent.input(screen.getByRole('combobox', { name: 'Critical Task' }), {
			target: { value: 'airway' }
		});
		taskList = screen.getByRole('listbox');
		await fireEvent.click(within(taskList).getByText('181-105-1003 Airway management'));

		await chooseCompletionDate(/May 10, 2026/i);
		await fireEvent.change(screen.getByLabelText(/Validation Method/i), {
			target: { value: 'Demonstration' }
		});

		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe('/org/org-1/api/personnel-ict-completions');
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			personnelId: 'p-1',
			ictTaskId: 'task-secondary',
			completedAt: '2026-05-10',
			validationMethod: 'Demonstration',
			validatedBy: null,
			notes: null
		});

		deferred.resolve(
			mockJsonResponse({
				id: 'completion-secondary',
				personnelId: 'p-1',
				ictTaskId: 'task-secondary',
				completedAt: '2026-05-10',
				validationMethod: 'Demonstration',
				validatedBy: null,
				notes: null,
				loggedBy: 'user-1',
				createdAt: '2098-03-01T12:00:00Z'
			})
		);

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Log ICT Completion' })).toBeNull();
		});
	});

	it('lets Critical Tasks operators edit an existing completion from the detail page', async () => {
		const deferred = createDeferredResponse();
		const fetchMock = vi.fn().mockReturnValue(deferred.promise);
		vi.stubGlobal('fetch', fetchMock);
		ictTasksStore.load([activeTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit completion for 181-105-1001' }));

		expect(await screen.findByRole('dialog', { name: 'Edit ICT Completion' })).toBeTruthy();

		await fireEvent.change(screen.getByLabelText(/Validation Method/i), {
			target: { value: 'Simulation' }
		});
		await fireEvent.input(screen.getByLabelText(/Validated By/i), {
			target: { value: 'MSG Jordan Example' }
		});
		await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), {
			target: { value: 'Corrected entry' }
		});

		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe('/org/org-1/api/personnel-ict-completions');
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' });
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			id: 'completion-active',
			personnelId: 'p-1',
			ictTaskId: 'task-active',
			completedAt: '2098-01-01',
			validationMethod: 'Simulation',
			validatedBy: 'MSG Jordan Example',
			notes: 'Corrected entry'
		});

		const activeTable = screen.getByRole('table', { name: 'Applicable Critical Tasks' });

		await waitFor(() => {
			expect(within(activeTable).getByText('Simulation')).toBeTruthy();
			expect(within(activeTable).getByText('Corrected entry')).toBeTruthy();
		});

		deferred.resolve(
			mockJsonResponse({
				...activeCompletion,
				validationMethod: 'Simulation',
				validatedBy: 'MSG Jordan Example',
				notes: 'Corrected entry'
			})
		);

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Edit ICT Completion' })).toBeNull();
		});
	});

	it('keeps the completion edit draft and shows the public uncertainty message when the save reply is lost', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(mockJsonResponse({ message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE }, 503))
		);
		const success = vi.spyOn(toastStore, 'success');
		ictTasksStore.load([activeTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: { ...history, rows: [] }
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit completion for 181-105-1001' }));
		await screen.findByRole('dialog', { name: 'Edit ICT Completion' });
		await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), { target: { value: 'Corrected entry' } });
		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		expect(await screen.findByText(CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE)).toBeTruthy();
		expect(screen.getByRole('dialog', { name: 'Edit ICT Completion' })).toBeTruthy();
		expect((screen.getByLabelText(/Notes \(optional\)/i) as HTMLTextAreaElement).value).toBe('Corrected entry');
		expect(success).not.toHaveBeenCalled();
	});

	it('renders archived ICT task completions in the personnel history view', () => {
		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasksPersonnelHistory: history
				}
			}
		});

		expect(screen.getByText('181-105-1002')).toBeTruthy();
		expect(screen.getByText('Evacuate casualty')).toBeTruthy();
		expect(screen.getByText('Archived')).toBeTruthy();
		expect(screen.getByText('Lane validation')).toBeTruthy();
	});

	it('keeps archived history separate from active task records', () => {
		ictTasksStore.load([activeTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				org,
				data: {
					orgId: 'org-1',
					criticalTasks: criticalTasksLayoutData,
					criticalTasksPersonnelHistory: {
						...history,
						rows: [
							{
								completion: activeCompletion,
								task: activeTask,
								taskCode: activeTask.taskCode,
								taskTitle: activeTask.title,
								taskArchivedAt: null
							},
							...history.rows
						]
					}
				}
			}
		});

		const historyRegion = screen.getByRole('region', { name: 'Historical Completions' });

		expect(within(historyRegion).getByText('181-105-1002')).toBeTruthy();
		expect(within(historyRegion).queryByText('181-105-1001')).toBeNull();
	});

	describe('toolbar', () => {
		const toolbarName = 'Personnel critical task controls';

		function renderRecord(historyData: CriticalTasksPersonnelHistoryData = { ...history, rows: [] }) {
			render(IctPersonnelDetailPage, {
				props: {
					org,
					data: { orgId: 'org-1', criticalTasks: criticalTasksLayoutData, criticalTasksPersonnelHistory: historyData }
				}
			});
		}

		function applicableCodes(): (string | null)[] {
			return within(screen.getByRole('table', { name: 'Applicable Critical Tasks' }))
				.queryAllByText(/^181-105-100\d$/)
				.map((code) => code.textContent);
		}

		beforeEach(() => {
			ictTasksStore.load([activeTask, secondaryActiveTask], 'org-1');
			personnelIctCompletionsStore.load([activeCompletion], 'org-1');
		});

		afterEach(() => vi.unstubAllGlobals());

		it('filters the applicable tasks by search text and by status on the row', async () => {
			renderRecord();
			expect(applicableCodes()).toEqual(['181-105-1003', '181-105-1001']);

			await fireEvent.input(screen.getByRole('searchbox', { name: 'Filter by task ID or name' }), {
				target: { value: 'airway' }
			});
			expect(applicableCodes()).toEqual(['181-105-1003']);

			await fireEvent.input(screen.getByRole('searchbox', { name: 'Filter by task ID or name' }), {
				target: { value: '' }
			});
			const status = screen.getByRole('button', { name: 'Status' });
			status.focus();
			await fireEvent.keyDown(status, { key: 'ArrowDown' });
			await fireEvent.pointerUp(await screen.findByRole('option', { name: 'Current' }));
			expect(applicableCodes()).toEqual(['181-105-1001']);
		});

		it('keeps Status and Print Record working from More when the row folds', async () => {
			const widths = stubToolbarWidths();
			const print = vi.fn();
			vi.stubGlobal('print', print);
			renderRecord();
			await widths.foldAll();

			const row = within(screen.getByRole('toolbar', { name: toolbarName }));
			expect(row.queryByRole('button', { name: 'Status' })).toBeNull();
			expect(row.queryByRole('button', { name: 'Print Record' })).toBeNull();
			expect(row.getByRole('button', { name: 'Input Task' })).toBeTruthy();

			await openToolbarMore(toolbarName);
			await openToolbarSubmenu('Status, All Statuses');
			await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Not Recorded' }));
			expect(applicableCodes()).toEqual(['181-105-1003']);

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			await openToolbarMore(toolbarName);
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Print Record' }));
			await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
		});

		it('keeps the search field on the row until it is reduced to an icon that still filters', async () => {
			const widths = stubToolbarWidths();
			renderRecord();
			await widths.foldAll();

			const icon = screen.getByRole('button', { name: 'Filter by task ID or name' });
			await fireEvent.click(icon);
			await fireEvent.input(await screen.findByRole('searchbox', { name: 'Filter by task ID or name' }), {
				target: { value: 'airway' }
			});
			expect(applicableCodes()).toEqual(['181-105-1003']);
		});

		it('hides Input Task from a viewer and leaves Print Record in More', async () => {
			accessFacts = { membershipRole: 'member', capabilityMap: createCapabilityMap('view') };
			const widths = stubToolbarWidths();
			renderRecord();
			await widths.foldAll();

			expect(screen.queryByRole('button', { name: 'Input Task' })).toBeNull();
			await openToolbarMore(toolbarName);
			expect(screen.getByRole('menuitem', { name: 'Print Record' })).toBeTruthy();
			expect(screen.queryByRole('menuitem', { name: 'Input Task' })).toBeNull();
		});

		it('disables Input Task when no active task applies to the soldier', () => {
			ictTasksStore.load([nonApplicableTask], 'org-1');
			renderRecord();

			expect((screen.getByRole('button', { name: 'Input Task' }) as HTMLButtonElement).disabled).toBe(true);
		});
	});
});
