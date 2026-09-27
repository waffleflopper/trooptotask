// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupCatalogHydration } from '$features/personnel';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$features/personnel/contracts';
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
			return {
				allowed: hasCapability,
				visible: hasCapability,
				disabled: !hasCapability,
				reason: hasCapability ? 'allowed:capability' : 'denied:missing-capability',
				explanation: '',
				decision: {}
			};
		}
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

const criticalTasksLayoutData = {
	data: {
		settings: {
			defaultExpirationMonths: 12,
			expiringSoonWarningDays: 60
		}
	}
};

async function chooseCompletionDate(label: RegExp): Promise<void> {
	await fireEvent.click(screen.getByLabelText(/Completion Date/i));
	const day = await screen.findByRole('button', { name: label });
	await fireEvent.click(day);
}

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

describe('critical tasks page', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
		parseFileMock.mockReset();
		mockOrgContext.role = 'owner';
		mockOrgContext.isOwner = true;
		mockOrgContext.isAdmin = false;
		mockOrgContext.isPrivileged = true;
		mockOrgContext.capabilityMap.criticalTasks = 'configure';
		mockOrgContext.scopeSet = { kind: 'organization' };
		personnelStore.startLoading();
		groupCatalogHydration.startLoading();
		ictTasksStore.startLoading();
		personnelIctCompletionsStore.startLoading();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		personnelStore.load([], 'org-test-reset');
		groupCatalogHydration.load([], 'org-test-reset');
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it('renders the floating matrix toolbar while workspace data is still streaming', () => {
		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
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
		groupCatalogHydration.load([], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1'
				}
			}
		});

		const reportsLink = screen.getByRole('link', { name: 'Reports' });
		expect(reportsLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/reports');
		const libraryLink = screen.getByRole('link', { name: 'Task Library' });
		expect(libraryLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/library');
	});

	it('uses Critical Tasks Policy Decisions for page affordances', () => {
		mockOrgContext.role = 'member';
		mockOrgContext.isOwner = false;
		mockOrgContext.isAdmin = false;
		mockOrgContext.isPrivileged = false;
		mockOrgContext.capabilityMap.criticalTasks = 'configure';
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit'
				}
			}
		});

		expect(screen.queryByRole('heading', { name: 'Access Restricted' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Task Library' }).getAttribute('href')).toBe(
			'/org/org-1/critical-tasks/library'
		);
		expect(screen.getByRole('button', { name: 'Import Completions' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Record Completion' })).toBeTruthy();
	});

	it('opens the completion import modal from the page toolbar', async () => {
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1'
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Import Completions' }));

		expect(await screen.findByRole('dialog', { name: 'Import ICT Completions' })).toBeTruthy();
		expect(screen.getByLabelText('Upload file')).toBeTruthy();
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
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([{ ...ictTask, expirationMonths: 12 }], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					criticalTasks: criticalTasksLayoutData
				}
			}
		});

		expect(screen.getByRole('button', { name: /Smith 181-105-1001: not recorded/i })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Import Completions' }));
		await fireEvent.change(await screen.findByLabelText('Upload file'), {
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

	it('shows reports but omits the task library affordance for non-admin Critical Tasks operators', async () => {
		mockOrgContext.role = 'member';
		mockOrgContext.isOwner = false;
		mockOrgContext.isPrivileged = false;
		mockOrgContext.capabilityMap.criticalTasks = 'operate';
		personnelStore.load([], 'org-1');
		groupCatalogHydration.load([], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1'
				}
			}
		});

		expect(screen.getByRole('link', { name: 'Reports' }).getAttribute('href')).toBe(
			'/org/org-1/critical-tasks/reports'
		);
		expect(screen.getByRole('button', { name: 'Export Excel' })).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Task Library' })).toBeNull();
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
		groupCatalogHydration.load([alphaGroup, bravoGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					criticalTasks: criticalTasksLayoutData
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

	it('links soldier names to the per-person detail page for Critical Tasks viewers', () => {
		personnelStore.load([person({ id: 'smith', lastName: 'Smith' })], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					criticalTasks: criticalTasksLayoutData
				}
			}
		});

		const personLink = screen.getByRole('link', { name: /Smith, Jane/ });
		expect(personLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/smith');
		expect(personLink.textContent).toContain('SGT');
		expect(personLink.textContent).toContain('68W');
		expect(screen.queryByRole('dialog', { name: 'Log ICT Completion' })).toBeNull();
	});

	it('lets Critical Tasks operators log a completion from a matrix cell and updates the matrix without a reload', async () => {
		const deferred = createDeferredResponse();
		const fetchMock = vi.fn().mockReturnValue(deferred.promise);
		vi.stubGlobal('fetch', fetchMock);

		personnelStore.load([person({ id: 'smith', lastName: 'Smith' })], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
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
					criticalTasks: criticalTasksLayoutData
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Smith 181-105-1001: not recorded/ }));

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
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			personnelId: 'smith',
			ictTaskId: 'task-1',
			completedAt: '2026-05-10',
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

	it('lets Critical Tasks operators input a task from the toolbar with searchable person and task selectors', async () => {
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
		groupCatalogHydration.load([alphaGroup], 'org-1');
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
					criticalTasks: criticalTasksLayoutData
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Record Completion' }));

		expect(await screen.findByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));
		const personCombo = await screen.findByRole('combobox', { name: 'Person' });
		await fireEvent.input(personCombo, { target: { value: 'smith' } });
		await fireEvent.click(screen.getByRole('option', { name: 'SGT Smith, Jane - 68W' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Critical Task' }));
		const taskCombo = await screen.findByRole('combobox', { name: 'Critical Task' });
		await fireEvent.input(taskCombo, { target: { value: 'airway' } });
		expect(screen.getByRole('option', { name: '181-105-1002 Airway management' })).toBeTruthy();
		await fireEvent.input(taskCombo, { target: { value: '1002' } });
		await fireEvent.click(screen.getByRole('option', { name: '181-105-1002 Airway management' }));

		await chooseCompletionDate(/May 10, 2026/i);
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
			completedAt: '2026-05-10',
			validationMethod: 'Simulation',
			validatedBy: 'SFC Taylor Example',
			notes: 'Toolbar entry'
		});
	});
});
