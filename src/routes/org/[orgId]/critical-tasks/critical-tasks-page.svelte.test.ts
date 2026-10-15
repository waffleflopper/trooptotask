// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ictTasksStore } from '$features/critical-tasks';
import { personnelIctCompletionsStore } from '$features/critical-tasks';
import { groupCatalogHydration, personnelStore } from '$features/personnel';
import {
	CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE,
	type IctTask,
	type PersonnelIctCompletion
} from '$features/critical-tasks/contracts';
import { toastStore } from '$lib/stores/toast.svelte';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';

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

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => mockOrgContext
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

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: '11b' }
		});
		await waitFor(() => {
			expect(screen.queryByRole('link', { name: /Smith, Jane/ })).toBeNull();
			expect(screen.getByRole('link', { name: /Jones, Jane/ })).toBeTruthy();
		});

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: 'sgt' }
		});
		await waitFor(() => {
			expect(screen.getByRole('link', { name: /Smith, Jane/ })).toBeTruthy();
			expect(screen.queryByRole('link', { name: /Jones, Jane/ })).toBeNull();
		});

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: 'smith' }
		});
		await waitFor(() => {
			expect(screen.getByRole('link', { name: /Smith, Jane/ })).toBeTruthy();
		});

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: '' }
		});
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

		await fireEvent.click(screen.getByRole('button', { name: 'Group' }));
		expect(screen.getByRole('button', { name: 'Group' }).getAttribute('aria-pressed')).toBe('true');
		await waitFor(() => {
			const regroupedTable = screen.getByRole('table', { name: 'Critical Tasks readiness matrix' });
			expect(within(regroupedTable).getByText('Alpha')).toBeTruthy();
			expectBefore(
				screen.getByRole('link', { name: /Smith, Jane/ }),
				screen.getByRole('link', { name: /Jones, Jane/ })
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
					viewer: { userId: 'user-1', displayName: 'SFC Taylor Example' },
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

	it('keeps the matrix completion edit draft and shows the public uncertainty message when the save reply is lost', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(mockJsonResponse({ message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE }, 503))
		);
		const success = vi.spyOn(toastStore, 'success');
		personnelStore.load([person({ id: 'smith', lastName: 'Smith' })], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load(
			[completion({ id: 'saved', personnelId: 'smith', ictTaskId: 'task-1' })],
			'org-1'
		);

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					viewer: { userId: 'user-1', displayName: 'SFC Taylor Example' },
					criticalTasks: criticalTasksLayoutData
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Smith 181-105-1001: current/ }));
		await screen.findByRole('dialog', { name: 'Edit ICT Completion' });
		await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), { target: { value: 'Corrected entry' } });
		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		expect(await screen.findByText(CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE)).toBeTruthy();
		expect((screen.getByLabelText(/Notes \(optional\)/i) as HTMLTextAreaElement).value).toBe('Corrected entry');
		expect(success).not.toHaveBeenCalled();
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
					viewer: { userId: 'user-1', displayName: 'SFC Taylor Example' },
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
	it('names the pending matrix as a live status inside a page with no nested main landmark', () => {
		render(Page, { props: { data: { orgId: 'org-1' } } });

		const status = screen.getByRole('status', { name: 'Loading Critical Tasks' });
		expect(status.getAttribute('aria-live')).toBe('polite');
		expect(status.hasAttribute('aria-busy')).toBe(false);
		expect(screen.queryByRole('main')).toBeNull();
		const exportButton = screen.getByRole('button', { name: 'Export Excel' }) as HTMLButtonElement;
		expect(exportButton.disabled).toBe(true);
		expect(exportButton.getAttribute('title')).toBe('Export unavailable while loading.');
	});

	it('keeps Record Completion and Import Completions unavailable until completions have loaded', async () => {
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		render(Page, { props: { data: { orgId: 'org-1' } } });

		const record = screen.getByRole('button', { name: 'Record Completion' }) as HTMLButtonElement;
		const importCompletions = screen.getByRole('button', { name: 'Import Completions' }) as HTMLButtonElement;
		expect([record.disabled, record.getAttribute('title')]).toEqual([true, 'Critical Tasks are still loading.']);
		expect([importCompletions.disabled, importCompletions.getAttribute('title')]).toEqual([
			true,
			'Critical Tasks are still loading.'
		]);
		await fireEvent.click(record);
		expect(screen.queryByRole('dialog')).toBeNull();

		personnelIctCompletionsStore.load([completion({})], 'org-1');
		await waitFor(() => expect(record.disabled).toBe(false));
		expect(record.getAttribute('title')).toBeNull();
	});

	it('shows an empty roster and a filter miss as distinct Empty states', async () => {
		personnelStore.load([], 'org-1');
		groupCatalogHydration.load([], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		const view = render(Page, { props: { data: { orgId: 'org-1' } } });

		expect(screen.getByText('No personnel yet.')).toBeTruthy();
		expect(screen.queryByRole('table', { name: 'Critical Tasks readiness matrix' })).toBeNull();
		view.unmount();

		personnelStore.load([person()], 'org-1');
		render(Page, { props: { data: { orgId: 'org-1' } } });
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: 'nobody' }
		});

		expect(await screen.findByText('No personnel match the current filters.')).toBeTruthy();
		expect(screen.queryByRole('table', { name: 'Critical Tasks readiness matrix' })).toBeNull();
		expect(screen.queryByText('No personnel yet.')).toBeNull();
	});

	it('keeps Export Excel focused and busy while the matrix downloads, refusing another press', async () => {
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
		vi.stubGlobal('fetch', fetchMock);

		render(Page, { props: { data: { orgId: 'org-1' } } });
		const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Export Excel' });
		button.focus();
		await fireEvent.click(button);

		const exporting = await screen.findByRole<HTMLButtonElement>('button', { name: 'Exporting...' });
		expect([
			exporting === document.activeElement,
			exporting.disabled,
			exporting.getAttribute('aria-disabled'),
			exporting.getAttribute('aria-busy')
		]).toEqual([true, false, 'true', 'true']);
		await fireEvent.click(exporting);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('reports a failed matrix export as an alert whose Retry requests the export again', async () => {
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
		vi.stubGlobal('fetch', fetchMock);

		render(Page, { props: { data: { orgId: 'org-1' } } });
		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));

		const alert = await screen.findByRole('alert');
		expect(within(alert).getByText('Unable to export the matrix')).toBeTruthy();
		expect(within(alert).getByText('Failed to export critical task matrix')).toBeTruthy();

		await fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(fetchMock.mock.calls[1][0]).toBe('/org/org-1/api/critical-tasks/matrix/export');
	});

	it('exports the matrix with the group, gaps and trimmed search chosen in the toolbar', async () => {
		personnelStore.load(
			[
				person({ id: 'smith', lastName: 'Smith', groupId: alphaGroup.id, groupName: alphaGroup.name }),
				person({ id: 'jones', lastName: 'Jones', groupId: bravoGroup.id, groupName: bravoGroup.name })
			],
			'org-1'
		);
		groupCatalogHydration.load([alphaGroup, bravoGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
		vi.stubGlobal('fetch', fetchMock);

		render(Page, { props: { data: { orgId: 'org-1' } } });
		const group = screen.getByRole('button', { name: 'Critical Tasks group filter' });
		group.focus();
		await fireEvent.keyDown(group, { key: 'ArrowDown' });
		const alpha = await screen.findByRole('option', { name: /Alpha/ });
		await fireEvent.pointerUp(alpha);
		expect(group.textContent).toContain('Alpha');
		await fireEvent.click(screen.getByRole('button', { name: 'Gaps only' }));
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: '  smith ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(fetchMock.mock.calls[0][0]).toBe(
			'/org/org-1/api/critical-tasks/matrix/export?groupFilter=group-alpha&search=smith&gapsOnly=true'
		);
	});

	it('keeps actions a Critical Tasks viewer may not use out of More when every control folds', async () => {
		mockOrgContext.role = 'member';
		mockOrgContext.isOwner = false;
		mockOrgContext.isPrivileged = false;
		mockOrgContext.capabilityMap.criticalTasks = 'view';
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
		vi.stubGlobal(
			'ResizeObserver',
			class {
				targets: Element[] = [];
				constructor(callback: ResizeObserverCallback) {
					observers.push({ callback, targets: this.targets });
				}
				observe(target: Element) {
					this.targets.push(target);
				}
				unobserve() {}
				disconnect() {}
			}
		);

		render(Page, { props: { data: { orgId: 'org-1' } } });
		for (const { callback, targets } of observers) {
			const entries = targets.map((target) => {
				const box = [{ inlineSize: target.hasAttribute('data-toolbar-row') ? 1 : 40, blockSize: 32 }];
				return { target, borderBoxSize: box, contentBoxSize: box };
			});
			callback(entries as unknown as ResizeObserverEntry[], {} as ResizeObserver);
		}
		await tick();

		const more = screen.getByRole('button', { name: 'More Critical Tasks controls' });
		more.focus();
		await fireEvent.keyDown(more, { key: 'Enter' });
		const menu = await screen.findByRole('menu');
		expect(within(menu).getByRole('menuitem', { name: 'Group, All groups' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Export Excel' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Reports' })).toBeTruthy();
		expect(within(menu).queryByRole('menuitem', { name: 'Task Library' })).toBeNull();
		expect(within(menu).queryByRole('menuitem', { name: 'Import Completions' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Record Completion' })).toBeNull();
	});
});
