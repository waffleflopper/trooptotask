// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

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
	}
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => mockOrgContext
}));

const ictTask: IctTask = {
	id: 'task-1',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: null,
	mos: [],
	expirationMonths: null,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-alpha',
		groupName: 'Alpha',
		...overrides
	};
}

function completion(overrides: Partial<PersonnelIctCompletion>): PersonnelIctCompletion {
	return {
		id: 'completion-1',
		personnelId: 'person-1',
		ictTaskId: 'task-1',
		completedAt: '2098-01-01',
		validationMethod: 'Demonstration',
		validatedBy: 'SFC Observer',
		notes: null,
		loggedBy: 'user-1',
		createdAt: '2098-01-01T12:00:00Z',
		...overrides
	};
}

const alphaGroup: Group = { id: 'group-alpha', name: 'Alpha', sortOrder: 0 };
const bravoGroup: Group = { id: 'group-bravo', name: 'Bravo', sortOrder: 1 };

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

describe('critical tasks page', () => {
	beforeEach(() => {
		mockOrgContext.role = 'owner';
		mockOrgContext.isOwner = true;
		mockOrgContext.isAdmin = false;
		mockOrgContext.isPrivileged = true;
		mockOrgContext.isFullEditor = true;
		personnelStore.startLoading();
		groupsStore.startLoading();
		ictTasksStore.startLoading();
		personnelIctCompletionsStore.startLoading();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		personnelStore.load([], 'org-test-reset');
		groupsStore.load([], 'org-test-reset');
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it('renders the Critical Tasks shell while workspace data is still streaming', () => {
		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					permissions: {
						canViewTraining: true,
						canEditTraining: true
					},
					criticalTasks: {
						data: new Promise(() => undefined)
					}
				}
			}
		});

		expect(screen.getByText('Critical Tasks')).toBeTruthy();
		expect(screen.getByText('ICTL readiness')).toBeTruthy();
		expect(screen.getByTestId('critical-tasks-loading')).toBeTruthy();
	});

	it('shows the task library affordance to owners and admins', async () => {
		personnelStore.load([], 'org-1');
		groupsStore.load([], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewTraining: true,
						canEditTraining: true
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /more/i }));

		const link = screen.getByRole('menuitem', { name: 'Task Library' });
		expect(link.getAttribute('href')).toBe('/org/org-1/critical-tasks/library');
	});

	it('omits the task library affordance for non-admin training editors', () => {
		mockOrgContext.role = 'member';
		mockOrgContext.isOwner = false;
		mockOrgContext.isPrivileged = false;
		mockOrgContext.isFullEditor = true;
		personnelStore.load([], 'org-1');
		groupsStore.load([], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewTraining: true,
						canEditTraining: true
					}
				}
			}
		});

		expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
		expect(screen.queryByRole('menuitem', { name: 'Task Library' })).toBeNull();
	});

	it('renders the matrix with group and readiness gap filters', async () => {
		const currentTask: IctTask = {
			...ictTask,
			id: 'current-task',
			taskCode: '181-105-1001',
			title: 'TCCC',
			sortOrder: 0
		};
		const gapTask: IctTask = {
			...ictTask,
			id: 'gap-task',
			taskCode: '181-105-1002',
			title: 'Airway management',
			sortOrder: 1
		};
		personnelStore.load(
			[
				person({ id: 'smith', lastName: 'Smith', groupId: alphaGroup.id, groupName: alphaGroup.name }),
				person({ id: 'jones', lastName: 'Jones', groupId: bravoGroup.id, groupName: bravoGroup.name })
			],
			'org-1'
		);
		groupsStore.load([alphaGroup, bravoGroup], 'org-1');
		ictTasksStore.load([currentTask, gapTask], 'org-1');
		personnelIctCompletionsStore.load(
			[
				completion({ id: 'smith-current', personnelId: 'smith', ictTaskId: currentTask.id }),
				completion({ id: 'jones-current', personnelId: 'jones', ictTaskId: currentTask.id }),
				completion({ id: 'jones-gap', personnelId: 'jones', ictTaskId: gapTask.id })
			],
			'org-1'
		);

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					permissions: {
						canViewTraining: true,
						canEditTraining: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		expect(screen.getByRole('table', { name: 'Critical Tasks readiness matrix' })).toBeTruthy();
		expect(screen.getByText('Smith, Jane')).toBeTruthy();
		expect(screen.getByText('Jones, Jane')).toBeTruthy();

		await fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'group-bravo' } });

		await waitFor(() => {
			expect(screen.queryByText('Smith, Jane')).toBeNull();
			expect(screen.getByText('Jones, Jane')).toBeTruthy();
		});

		await fireEvent.change(screen.getByLabelText('Group'), { target: { value: '' } });
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Show readiness gaps only' }));

		await waitFor(() => {
			expect(screen.getByText('Smith, Jane')).toBeTruthy();
			expect(screen.queryByText('Jones, Jane')).toBeNull();
			expect(screen.queryByRole('columnheader', { name: /181-105-1001 TCCC/ })).toBeNull();
			expect(screen.getByRole('columnheader', { name: /181-105-1002 Airway management/ })).toBeTruthy();
			expect(screen.getByRole('button', { name: /Smith 181-105-1002: not recorded/ })).toBeTruthy();
		});
	});

	it('links soldier names to the per-person detail page for training viewers', () => {
		personnelStore.load([person({ id: 'smith', lastName: 'Smith' })], 'org-1');
		groupsStore.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					permissions: {
						canViewTraining: true,
						canEditTraining: false
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		const personLink = screen.getByRole('link', { name: /Smith, Jane/ });
		expect(personLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/smith');
		expect(personLink.textContent).toContain('SGT');
		expect(personLink.textContent).toContain('68W');
		expect(screen.queryByRole('dialog', { name: 'Log ICT Completion' })).toBeNull();
	});

	it('lets training editors log a completion from a matrix cell and updates the matrix without a reload', async () => {
		const deferred = createDeferredResponse();
		const fetchMock = vi.fn().mockReturnValue(deferred.promise);
		vi.stubGlobal('fetch', fetchMock);

		personnelStore.load([person({ id: 'smith', lastName: 'Smith' })], 'org-1');
		groupsStore.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
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
					permissions: {
						canViewTraining: true,
						canEditTraining: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Smith 181-105-1001: not recorded/ }));

		expect(screen.getByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();

		await fireEvent.input(screen.getByLabelText(/Completion Date/i), { target: { value: '2098-01-01' } });
		await fireEvent.change(screen.getByLabelText(/Validation Method/i), {
			target: { value: 'Practical Exercise' }
		});
		await fireEvent.change(screen.getByLabelText('I am the validator'), { target: { checked: true } });
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
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			personnelId: 'smith',
			ictTaskId: 'task-1',
			completedAt: '2098-01-01',
			validationMethod: 'Practical Exercise',
			validatedBy: 'SFC Taylor Example',
			notes: 'Lane validation'
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Smith 181-105-1001: current/ })).toBeTruthy();
		});

		deferred.resolve(
			mockJsonResponse(
				completion({
					id: 'server-completion',
					personnelId: 'smith',
					ictTaskId: 'task-1',
					completedAt: '2098-01-01',
					validationMethod: 'Practical Exercise',
					validatedBy: 'SFC Taylor Example',
					notes: 'Lane validation'
				})
			)
		);

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Log ICT Completion' })).toBeNull();
		});
	});
});
