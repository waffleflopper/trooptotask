// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctPersonnelDetailPage from './IctPersonnelDetailPage.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import type {
	CriticalTasksPersonnelHistoryData,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';

const { mockOrgContext } = vi.hoisted(() => ({
	mockOrgContext: {
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
			canViewCriticalTasks: true,
			canEditCriticalTasks: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true
		},
		scopedGroupId: null,
		readOnly: false,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' } as { kind: 'organization' } | { kind: 'groups'; groupIds: string[] },
		affordanceForFeatureAction(
			action: { owner: { lane: string }; requiredCapability: string; accessMode: string },
			resource: { kind: 'organization' } | { kind: 'group'; groupId: string } | { kind: 'unscoped' } = {
				kind: 'organization'
			}
		) {
			const levels = ['none', 'view', 'operate', 'configure'];
			const actual = this.capabilityMap[action.owner.lane as keyof typeof this.capabilityMap] ?? 'none';
			const hasCapability = levels.indexOf(actual) >= levels.indexOf(action.requiredCapability);
			const inScope =
				this.scopeSet.kind === 'organization' ||
				resource.kind !== 'group' ||
				this.scopeSet.groupIds.includes(resource.groupId);
			const readOnlyBlocked = this.readOnly && action.accessMode === 'write';
			return {
				allowed: hasCapability && inScope && !readOnlyBlocked,
				visible: hasCapability && inScope,
				disabled: hasCapability && inScope && readOnlyBlocked,
				reason: readOnlyBlocked
					? 'denied:read-only-overlay'
					: hasCapability && inScope
						? 'allowed:capability'
						: 'denied:missing-capability',
				explanation: '',
				decision: {}
			};
		}
	}
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => mockOrgContext
}));

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
		mockOrgContext.permissions.canEditCriticalTasks = true;
		mockOrgContext.readOnly = false;
		mockOrgContext.capabilityMap.criticalTasks = 'configure';
		mockOrgContext.scopeSet = { kind: 'organization' };
		ictTasksStore.load([], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
	});

	afterEach(cleanup);

	afterEach(() => {
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
		vi.restoreAllMocks();
	});

	it('lists active applicable tasks for the selected soldier with their current details', () => {
		ictTasksStore.load([activeTask, nonApplicableTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		expect(screen.getByRole('table', { name: 'Applicable Critical Tasks' })).toBeTruthy();
		expect(screen.getByRole('toolbar', { name: 'Personnel critical task controls' })).toBeTruthy();
		expect(
			within(screen.getByRole('toolbar', { name: 'Personnel critical task controls' })).queryByText('SGT Smith, Jane')
		).toBeNull();
		expect(screen.queryByText('Sorted: Expiring first')).toBeNull();
		expect(screen.getByText('Individual Readiness')).toBeTruthy();
		expect(screen.getByText('Expiring ≤60d')).toBeTruthy();
		expect(screen.getByText('181-105-1001')).toBeTruthy();
		expect(screen.getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(screen.queryByText('181-105-2001')).toBeNull();
		expect(screen.getAllByText('01 JAN 2098').length).toBeGreaterThan(0);
		expect(screen.getByText('01 JAN 2099')).toBeTruthy();
		expect(screen.getByText('Demonstration')).toBeTruthy();
		expect(screen.getByText('SFC Observer')).toBeTruthy();
		expect(screen.getByText('Observed on lane 2')).toBeTruthy();
	});

	it('shows log and edit actions for Critical Tasks operators on active task rows', () => {
		ictTasksStore.load([activeTask, secondaryActiveTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		expect(screen.getByRole('button', { name: 'Edit completion for 181-105-1001' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Log completion for 181-105-1003' })).toBeTruthy();
	});

	it('keeps the page read-only for members without Critical Tasks edit access', () => {
		mockOrgContext.permissions.canEditCriticalTasks = false;
		mockOrgContext.capabilityMap.criticalTasks = 'view';
		ictTasksStore.load([activeTask, secondaryActiveTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewCriticalTasks: true,
						canEditCriticalTasks: false
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
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
		mockOrgContext.permissions.canEditCriticalTasks = false;
		mockOrgContext.capabilityMap.criticalTasks = 'operate';
		mockOrgContext.scopeSet = { kind: 'groups', groupIds: ['group-alpha'] };
		ictTasksStore.load([activeTask, secondaryActiveTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewCriticalTasks: true,
						canEditCriticalTasks: false
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
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
		mockOrgContext.permissions.canEditCriticalTasks = true;
		mockOrgContext.capabilityMap.criticalTasks = 'operate';
		mockOrgContext.scopeSet = { kind: 'groups', groupIds: ['group-alpha'] };
		ictTasksStore.load([activeTask, secondaryActiveTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(IctPersonnelDetailPage, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
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
				data: {
					orgId: 'org-1',
					permissions: {
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					session: {
						access_token: 'access-token',
						refresh_token: 'refresh-token',
						expires_in: 3600,
						token_type: 'bearer',
						user: {
							id: 'user-1',
							app_metadata: {},
							aud: 'authenticated',
							created_at: '2026-04-01T00:00:00.000Z',
							user_metadata: {
								rank: 'SFC',
								full_name: 'Taylor Example'
							}
						}
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Log completion for 181-105-1003' }));

		expect(screen.getByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();

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
				data: {
					orgId: 'org-1',
					permissions: {
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Input Task' }));

		expect(screen.getByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();
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
				data: {
					orgId: 'org-1',
					permissions: {
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
					criticalTasksPersonnelHistory: {
						...history,
						rows: []
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit completion for 181-105-1001' }));

		expect(screen.getByRole('dialog', { name: 'Edit ICT Completion' })).toBeTruthy();

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

	it('renders archived ICT task completions in the personnel history view', () => {
		render(IctPersonnelDetailPage, {
			props: {
				data: {
					orgId: 'org-1',
					criticalTasksPersonnelHistory: history
				}
			}
		});

		expect(screen.getByRole('toolbar', { name: 'Personnel critical task controls' })).toBeTruthy();
		expect(screen.queryByText('SGT Smith, Jane')).toBeNull();
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
				data: {
					orgId: 'org-1',
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
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
});
