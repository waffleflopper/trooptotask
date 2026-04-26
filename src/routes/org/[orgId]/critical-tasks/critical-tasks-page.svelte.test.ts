// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

const { mockOrgContext, parseFileMock } = vi.hoisted(() => ({
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
			canViewCriticalTasks: true,
			canEditCriticalTasks: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true
		},
		scopedGroupId: null,
		readOnly: false
	},
	parseFileMock: vi.fn()
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => mockOrgContext
}));

vi.mock('$lib/utils/csvParser', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/utils/csvParser')>();
	return {
		...actual,
		parseFile: parseFileMock
	};
});

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

function person(overrides: Partial<Personnel> = {}): Personnel {
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

function expectBefore(a: Node, b: Node): void {
	expect(Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
}

function rectWithWidth(width: number): DOMRect {
	return {
		x: 0,
		y: 0,
		width,
		height: 34,
		top: 0,
		right: width,
		bottom: 34,
		left: 0,
		toJSON: () => ({})
	} as DOMRect;
}

describe('critical tasks page', () => {
	beforeEach(() => {
		parseFileMock.mockReset();
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
		vi.unstubAllGlobals();
		personnelStore.load([], 'org-test-reset');
		groupsStore.load([], 'org-test-reset');
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it('renders the floating matrix toolbar while workspace data is still streaming', () => {
		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					permissions: {
						canViewTraining: true,
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasks: {
						data: new Promise(() => undefined)
					}
				}
			}
		});

		expect(screen.getByRole('toolbar', { name: 'Critical Tasks controls' })).toBeTruthy();
		expect(screen.getByLabelText('Search by name, rank, or MOS')).toBeTruthy();
		expect(screen.getByTestId('critical-tasks-loading')).toBeTruthy();
	});

	it('shows the reports and task library affordances to owners and admins', async () => {
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
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					}
				}
			}
		});

		const reportsLink = screen.getByRole('link', { name: 'Reports' });
		expect(reportsLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/reports');
		const libraryLink = screen.getByRole('link', { name: 'Task Library' });
		expect(libraryLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/library');
		const orderedActions = [
			screen.getByRole('link', { name: 'Export CSV' }),
			screen.getByRole('button', { name: 'Import Completions' }),
			libraryLink,
			reportsLink,
			screen.getByRole('button', { name: 'Record Training' })
		];
		for (let index = 0; index < orderedActions.length - 1; index += 1) {
			expect(Boolean(orderedActions[index]!.compareDocumentPosition(orderedActions[index + 1]!) & 4)).toBe(true);
		}
	});

	it('opens the completion import modal from the page toolbar', async () => {
		personnelStore.load([person()], 'org-1');
		groupsStore.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewTraining: true,
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Import Completions' }));

		expect(await screen.findByRole('dialog', { name: 'Import ICT Completions' })).toBeTruthy();
		expect(screen.getByLabelText('Upload file')).toBeTruthy();
	});

	it('keeps the matrix export link in sync with group and search filters', async () => {
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
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		const exportLink = screen.getByRole('link', { name: 'Export CSV' });
		expect(exportLink.getAttribute('href')).toBe('/org/org-1/api/critical-tasks/matrix/export');

		await fireEvent.change(screen.getByLabelText('Critical Tasks group filter'), { target: { value: 'group-bravo' } });
		await waitFor(() => {
			expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
				'/org/org-1/api/critical-tasks/matrix/export?groupId=group-bravo'
			);
		});

		await fireEvent.input(screen.getByTestId('critical-tasks-search'), { target: { value: 'Jones' } });
		await waitFor(() => {
			expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
				'/org/org-1/api/critical-tasks/matrix/export?groupId=group-bravo&search=Jones'
			);
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Show gaps only' }));
		await waitFor(() => {
			expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
				'/org/org-1/api/critical-tasks/matrix/export?groupId=group-bravo&search=Jones&gapsOnly=true'
			);
		});
	});

	it('keeps Critical Tasks filters, search, and action overflow coordinated at constrained width', async () => {
		const originalRect = HTMLElement.prototype.getBoundingClientRect;
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
			if (this.matches('[data-floating-page-toolbar]')) return rectWithWidth(520);
			if (this.classList.contains('matrix-toolbar-controls')) return rectWithWidth(330);
			return originalRect.call(this);
		});

		personnelStore.load(
			[
				person({ id: 'smith', lastName: 'Smith', groupId: alphaGroup.id, groupName: alphaGroup.name }),
				person({ id: 'jones', lastName: 'Jones', groupId: bravoGroup.id, groupName: bravoGroup.name })
			],
			'org-1'
		);
		groupsStore.load([alphaGroup, bravoGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					permissions: {
						canViewTraining: true,
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		await waitFor(() => {
			expect(screen.getByTestId('floating-page-toolbar').getAttribute('data-toolbar-compact-phase')).toBe('group');
		});

		const filterTrigger = screen.getByRole('button', { name: 'Critical Tasks filters' });
		await fireEvent.click(filterTrigger);
		await fireEvent.change(await screen.findByLabelText('Critical Tasks group filter'), {
			target: { value: bravoGroup.id }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Search by name, rank, or MOS' }));
		await waitFor(() => {
			expect(screen.queryByTestId('critical-tasks-filter-group-panel')).toBeNull();
		});
		await fireEvent.input(await screen.findByTestId('critical-tasks-search'), { target: { value: 'Jones' } });

		await waitFor(() => {
			expect(screen.queryByRole('link', { name: /Smith, Jane/ })).toBeNull();
			expect(screen.getByRole('link', { name: /Jones, Jane/ })).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'More Critical Tasks actions' }));
		await waitFor(() => {
			expect(screen.queryByTestId('critical-tasks-search-panel')).toBeNull();
		});
		expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Export CSV' })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Record Training/ })).toBeTruthy();
	});

	it('updates the matrix status after importing a completion row', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'Task Code', 'Completion Date', 'Validation Method'],
			['SGT', 'Smith', 'Jane', '181-105-1001', '2098-01-01', 'Simulation']
		]);
		const fetchMock = vi.fn().mockResolvedValue(
			mockJsonResponse({
				inserted: [
					completion({
						id: 'completion-imported',
						personnelId: 'person-1',
						ictTaskId: 'task-1',
						completedAt: '2098-01-01',
						validationMethod: 'Simulation',
						validatedBy: null,
						notes: null
					})
				],
				updated: [],
				errors: []
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		personnelStore.load([person()], 'org-1');
		groupsStore.load([alphaGroup], 'org-1');
		ictTasksStore.load([{ ...ictTask, expirationMonths: 12 }], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					permissions: {
						canViewTraining: true,
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		expect(screen.getByRole('button', { name: /Smith 181-105-1001: not recorded/i })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Import Completions' }));
		await fireEvent.change(screen.getByLabelText('Upload file'), {
			target: {
				files: [new File(['fake'], 'ict-completions.csv', { type: 'text/csv' })]
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Import Checked Rows' })).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Import Checked Rows' }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe('/org/org-1/api/personnel-ict-completions/batch');
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			records: [
				{
					rowNumber: 2,
					values: {
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						taskCode: '181-105-1001',
						completedAt: '2098-01-01',
						validationMethod: 'Simulation'
					}
				}
			]
		});

		expect(await screen.findByText('Import Finished')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Import ICT Completions' })).toBeNull();
		});

		expect(screen.getByRole('button', { name: /Smith 181-105-1001: current/i })).toBeTruthy();
	});

	it('shows reports but omits the task library affordance for non-admin training editors', async () => {
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
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					}
				}
			}
		});

		expect(screen.getByRole('link', { name: 'Reports' }).getAttribute('href')).toBe(
			'/org/org-1/critical-tasks/reports'
		);
		expect(screen.getByRole('link', { name: 'Export CSV' })).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Task Library' })).toBeNull();
	});

	it('renders the matrix with the group filter and simplified toolbar controls', async () => {
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
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		const matrixPanel = screen.getByTestId('critical-tasks-matrix-panel');
		expect(matrixPanel).toBeTruthy();
		expect(within(matrixPanel).getByRole('table', { name: 'Critical Tasks readiness matrix' })).toBeTruthy();
		expect(screen.getByText('Smith, Jane')).toBeTruthy();
		expect(screen.getByText('Jones, Jane')).toBeTruthy();

		expect(screen.getByRole('toolbar', { name: 'Critical Tasks controls' })).toBeTruthy();
		expect(screen.getByRole('group', { name: 'Critical Tasks filters' })).toBeTruthy();
		expect(screen.getByTestId('critical-tasks-filter-group')).toBeTruthy();
		expect(screen.getByLabelText('Critical Tasks group filter')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Show gaps only' })).toBeTruthy();
		expect(screen.getByRole('group', { name: 'Critical Tasks matrix view mode' })).toBeTruthy();
		expect(screen.getByTestId('critical-tasks-search')).toBeTruthy();
		expect(screen.queryByText('Readiness 75%')).toBeNull();
		expect(screen.queryByRole('checkbox', { name: 'Gaps only' })).toBeNull();
		expect(screen.queryByLabelText('Critical Tasks matrix totals')).toBeNull();

		await fireEvent.change(screen.getByLabelText('Critical Tasks group filter'), { target: { value: 'group-bravo' } });

		await waitFor(() => {
			expect(screen.queryByText('Smith, Jane')).toBeNull();
			expect(screen.getByText('Jones, Jane')).toBeTruthy();
		});
	});

	it('filters personnel by search text and toggles between grouped and alphabetical views', async () => {
		personnelStore.load(
			[
				person({
					id: 'smith',
					lastName: 'Smith',
					rank: 'SGT',
					mos: '68W',
					groupId: alphaGroup.id,
					groupName: alphaGroup.name
				}),
				person({
					id: 'jones',
					lastName: 'Jones',
					rank: 'CPT',
					mos: '11B',
					groupId: bravoGroup.id,
					groupName: bravoGroup.name
				})
			],
			'org-1'
		);
		groupsStore.load([alphaGroup, bravoGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					permissions: {
						canViewTraining: true,
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		const groupedTable = screen.getByRole('table', { name: 'Critical Tasks readiness matrix' });
		expect(within(groupedTable).getByText('Alpha')).toBeTruthy();
		expect(within(groupedTable).getByText('Bravo')).toBeTruthy();
		expectBefore(screen.getByRole('link', { name: /Smith, Jane/ }), screen.getByRole('link', { name: /Jones, Jane/ }));

		await fireEvent.input(screen.getByTestId('critical-tasks-search'), { target: { value: '11b' } });
		await waitFor(() => {
			expect(screen.queryByRole('link', { name: /Smith, Jane/ })).toBeNull();
			expect(screen.getByRole('link', { name: /Jones, Jane/ })).toBeTruthy();
		});

		await fireEvent.input(screen.getByTestId('critical-tasks-search'), { target: { value: 'sgt' } });
		await waitFor(() => {
			expect(screen.getByRole('link', { name: /Smith, Jane/ })).toBeTruthy();
			expect(screen.queryByRole('link', { name: /Jones, Jane/ })).toBeNull();
		});

		await fireEvent.input(screen.getByTestId('critical-tasks-search'), { target: { value: 'smith' } });
		await waitFor(() => {
			expect(screen.getByRole('link', { name: /Smith, Jane/ })).toBeTruthy();
		});

		await fireEvent.input(screen.getByTestId('critical-tasks-search'), { target: { value: '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'A-Z' }));

		await waitFor(() => {
			const alphabeticalTable = screen.getByRole('table', { name: 'Critical Tasks readiness matrix' });
			expect(within(alphabeticalTable).queryByText('Alpha')).toBeNull();
			expect(within(alphabeticalTable).queryByText('Bravo')).toBeNull();
			expectBefore(
				screen.getByRole('link', { name: /Jones, Jane/ }),
				screen.getByRole('link', { name: /Smith, Jane/ })
			);
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
						canEditTraining: false,
						canViewCriticalTasks: true,
						canEditCriticalTasks: false
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
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
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

	it('lets training editors input a task from the toolbar with searchable person and task selectors', async () => {
		const airwayTask: IctTask = {
			...ictTask,
			id: 'task-2',
			taskCode: '181-105-1002',
			title: 'Airway management',
			mos: ['68W'],
			sortOrder: 1
		};
		const fetchMock = vi.fn().mockResolvedValue(
			mockJsonResponse(
				completion({
					id: 'server-completion',
					personnelId: 'smith',
					ictTaskId: airwayTask.id,
					completedAt: '2098-02-02',
					validationMethod: 'Simulation',
					validatedBy: 'SFC Taylor Example',
					notes: 'Toolbar entry'
				})
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		personnelStore.load([person({ id: 'smith', lastName: 'Smith', mos: '68W' })], 'org-1');
		groupsStore.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask, airwayTask], 'org-1');
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
						canEditTraining: true,
						canViewCriticalTasks: true,
						canEditCriticalTasks: true
					},
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Record Training' }));

		expect(screen.getByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));
		const personCombo = await screen.findByRole('combobox', { name: 'Person' });
		await fireEvent.input(personCombo, { target: { value: 'smith' } });
		await fireEvent.mouseDown(screen.getByRole('option', { name: 'SGT Smith, Jane - 68W' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Critical Task' }));
		const taskCombo = await screen.findByRole('combobox', { name: 'Critical Task' });
		await fireEvent.input(taskCombo, { target: { value: 'airway' } });
		expect(screen.getByRole('option', { name: '181-105-1002 Airway management' })).toBeTruthy();
		await fireEvent.input(taskCombo, { target: { value: '1002' } });
		await fireEvent.mouseDown(screen.getByRole('option', { name: '181-105-1002 Airway management' }));

		await fireEvent.input(screen.getByLabelText(/Completion Date/i), { target: { value: '2098-02-02' } });
		await fireEvent.change(screen.getByLabelText(/Validation Method/i), {
			target: { value: 'Simulation' }
		});
		await fireEvent.click(screen.getByLabelText('I am the validator'));
		await waitFor(() => {
			expect((screen.getByLabelText(/Validated By/i) as HTMLInputElement).value).toBe('SFC Taylor Example');
		});
		await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), {
			target: { value: 'Toolbar entry' }
		});

		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe('/org/org-1/api/personnel-ict-completions');
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			personnelId: 'smith',
			ictTaskId: 'task-2',
			completedAt: '2098-02-02',
			validationMethod: 'Simulation',
			validatedBy: 'SFC Taylor Example',
			notes: 'Toolbar entry'
		});
	});
});
