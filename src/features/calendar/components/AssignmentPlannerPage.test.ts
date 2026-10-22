// @vitest-environment happy-dom
import { createClientAccess, type ClientAccessFacts } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, cleanup, waitFor, act, within } from '@testing-library/svelte';
import AssignmentPlannerPage from './AssignmentPlannerPage.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { groupCatalogHydration } from '$features/personnel';
import type { CalendarOperationsPageAccess } from '../contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType } from '$features/calendar/contracts';

function makeOrg(overrides: Partial<ClientAccessFacts> = {}) {
	return {
		orgUrlSegment: 'org-1',
		...createClientAccess({ membershipRole: 'member', capabilityMap: createCapabilityMap('configure'), ...overrides })
	};
}

let mockOrg: CalendarOperationsPageAccess = makeOrg();

const assignmentTypes: AssignmentType[] = [
	{
		id: 'type-1',
		name: 'Charge of Quarters',
		shortName: 'CQ',
		assignTo: 'personnel',
		color: '#2563eb',
		exemptPersonnelIds: [],
		showOnCalendar: false,
		sortOrder: 0
	}
];

const modType: AssignmentType = {
	id: 'type-mod',
	name: 'Manager on Duty',
	shortName: 'MOD',
	assignTo: 'personnel',
	color: '#dc2626',
	exemptPersonnelIds: [],
	showOnCalendar: false,
	sortOrder: 0
};

const personnel: Personnel[] = [
	{
		id: 'person-1',
		firstName: 'Alex',
		lastName: 'Smith',
		rank: 'SGT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B'
	},
	{
		id: 'person-2',
		firstName: 'Jamie',
		lastName: 'Taylor',
		rank: 'CPT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: 'Provider',
		mos: 'PA'
	}
];

function renderPage(
	data: {
		orgId: string;
		orgName?: string;
		personnel?: Personnel[];
		allPersonnel?: Personnel[];
		calendar?: { data: CalendarWorkspaceData };
	} = {
		orgId: 'org-1',
		orgName: 'Test Org',
		personnel,
		allPersonnel: personnel
	}
) {
	return render(AssignmentPlannerPage, {
		props: {
			org: mockOrg,
			data: {
				...data,
				calendar: data.calendar ?? {
					data: {
						personnel,
						allPersonnel: personnel,
						rangeStart: '2026-06-03',
						rangeEnd: '2026-10-31',
						availabilityRange: { rangeStart: '2026-09-01', rangeEnd: '2026-10-31' }
					}
				}
			}
		}
	});
}

describe('AssignmentPlannerPage', () => {
	beforeEach(() => {
		cleanup();
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 8);
		dailyAssignmentsStore.load(assignmentTypes, [], 'org-1');
		groupCatalogHydration.load([{ id: 'group-1', name: 'Alpha', sortOrder: 0 }], 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('links back to Calendar', () => {
		renderPage();

		expect(screen.getByRole('link', { name: 'Back to calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
	});

	it('shows access restricted when the user cannot manage calendar assignments', () => {
		mockOrg = makeOrg({
			capabilityMap: {
				calendar: 'view',
				personnel: 'configure',
				training: 'configure',
				criticalTasks: 'configure',
				onboarding: 'configure',
				ratingScheme: 'configure'
			}
		});

		renderPage({
			orgId: 'org-1',
			orgName: 'Test Org',
			personnel,
			allPersonnel: personnel
		});

		expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent?.trim())).toEqual(['Duty planner']);
		expect(screen.getByRole('heading', { level: 2, name: 'Access restricted.' })).toBeTruthy();
		expect(screen.getByText(/Calendar operation access is required to manage monthly assignments\./)).toBeTruthy();
	});

	it('allows Calendar operators to manage monthly assignments without legacy edit flags', () => {
		mockOrg = makeOrg({
			capabilityMap: {
				calendar: 'operate',
				personnel: 'view',
				training: 'view',
				criticalTasks: 'view',
				onboarding: 'view',
				ratingScheme: 'view'
			}
		});

		renderPage({
			orgId: 'org-1',
			orgName: 'Test Org',
			personnel,
			allPersonnel: personnel
		});

		expect(screen.getByRole('button', { name: 'Charge of Quarters column actions' })).toBeTruthy();
		expect(screen.queryByText('Access restricted.')).toBeNull();
	});
});

it('saves a Group duty chosen in a cell or the column menu by the Group id', async () => {
	mockOrg = makeOrg();
	calendarStore.goToMonth(2026, 8);
	const groupType = { ...modType, id: 'group-duty', name: 'Group Duty', shortName: 'GD', assignTo: 'group' as const };
	dailyAssignmentsStore.load([groupType], [], 'org-1');
	groupCatalogHydration.load(
		[
			{ id: 'group-alpha', name: 'Alpha Renamed', sortOrder: 0 },
			{ id: 'group-bravo', name: 'Bravo', sortOrder: 1 }
		],
		'org-1'
	);
	const saved: Record<string, unknown>[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => {
			const payload = JSON.parse(init.body);
			saved.push(payload);
			return Response.json(
				payload.records
					? { inserted: payload.records.map((row: object, index: number) => ({ id: `batch-${index}`, ...row })) }
					: { id: 'saved', ...payload }
			);
		})
	);
	try {
		renderPage();
		await fireEvent.click(screen.getByRole('button', { name: /^Assign Group Duty, Tue 1 Sept?/ }));
		expect(await screen.findByRole('option', { name: 'Bravo' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('option', { name: 'Alpha Renamed' }));
		await waitFor(() => expect(saved).toHaveLength(1));
		expect(saved[0]).toMatchObject({ assignmentTypeId: 'group-duty', assigneeId: 'group-alpha' });

		await fireEvent.click(screen.getByRole('button', { name: 'Group Duty column actions' }));
		await fireEvent.change(await screen.findByLabelText('Assignee'), { target: { value: 'group-bravo' } });
		await fireEvent.click(screen.getByRole('button', { name: /^Fill \d+ days$/ }));
		await waitFor(() => expect(saved.some((payload) => Array.isArray(payload.records))).toBe(true));
		const batch = saved.find((payload) => Array.isArray(payload.records));
		const rows = batch?.records as Array<{ assigneeId: string; assignmentTypeId: string }>;
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((row) => row.assigneeId === 'group-bravo' && row.assignmentTypeId === 'group-duty')).toBe(true);
	} finally {
		cleanup();
		vi.unstubAllGlobals();
	}
});

it('offers a Group-scoped member only the Groups in their scope, in the pickers and the fairness panel', async () => {
	mockOrg = makeOrg({ scopeSet: { kind: 'groups', groupIds: ['group-alpha'] } });
	calendarStore.goToMonth(2026, 8);
	const groupType = { ...modType, id: 'group-duty', name: 'Group Duty', shortName: 'GD', assignTo: 'group' as const };
	dailyAssignmentsStore.load([groupType], [], 'org-1');
	groupCatalogHydration.load(
		[
			{ id: 'group-alpha', name: 'Alpha', sortOrder: 0 },
			{ id: 'group-bravo', name: 'Bravo', sortOrder: 1 }
		],
		'org-1'
	);
	try {
		renderPage();
		const fairness = screen.getByRole('table', { name: 'Group Duty fairness' });
		expect(
			within(fairness)
				.getAllByRole('rowheader')
				.map((header) => header.textContent!.trim())
		).toEqual(['Alpha']);

		await fireEvent.click(screen.getByRole('button', { name: /^Assign Group Duty, Tue 1 Sept?/ }));

		expect(await screen.findByRole('option', { name: 'Alpha' })).toBeTruthy();
		expect(screen.queryByRole('option', { name: 'Bravo' })).toBeNull();
	} finally {
		cleanup();
	}
});

describe('planner conflicts', () => {
	it('replaces a person assigned on a day they are unavailable and clears the conflict through the store', async () => {
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 8);
		dailyAssignmentsStore.load(
			assignmentTypes,
			[{ id: 'a-1', date: '2026-09-22', assignmentTypeId: 'type-1', assigneeId: 'person-1' }],
			'org-1'
		);
		statusTypesStore.load(
			[{ id: 'leave', name: 'Leave', color: '#0a0', textColor: '#fff', shortLabel: null, sortOrder: 0 }],
			'org-1'
		);
		availabilityStore.load(
			[{ id: 'e-1', personnelId: 'person-1', statusTypeId: 'leave', startDate: '2026-09-21', endDate: '2026-09-23' }],
			'org-1'
		);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url, init) => {
				const payload = JSON.parse(init.body);
				return Response.json({ id: 'a-1', ...payload });
			})
		);
		try {
			renderPage();
			const panel = screen.getByRole('region', { name: /Conflicts/ });
			await fireEvent.click(
				await within(panel).findByRole('button', { name: /^Find replacement for Charge of Quarters, Tue 22 Sept?/ })
			);
			await fireEvent.click(await screen.findByRole('option', { name: /Taylor, Jamie/ }));

			await waitFor(() => expect(screen.queryByRole('button', { name: /^Find replacement/ })).toBeNull());
			expect(screen.getByRole('button', { name: /^Charge of Quarters, Tue 22 Sept?: CPT Taylor, Jamie/ })).toBeTruthy();
		} finally {
			cleanup();
			vi.unstubAllGlobals();
			availabilityStore.load([], 'org-1');
		}
	});
});

describe('planner visible-month loading', () => {
	beforeEach(() => {
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 8);
		dailyAssignmentsStore.load(assignmentTypes, [], 'org-1');
		groupCatalogHydration.load([{ id: 'group-1', name: 'Alpha', sortOrder: 0 }], 'org-1');
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});
	const staleBootstrap = {
		orgId: 'org-1',
		calendar: {
			data: {
				personnel,
				rangeStart: '2026-11-01',
				rangeEnd: '2027-01-31',
				availabilityRange: { rangeStart: '2026-11-01', rangeEnd: '2027-01-31' }
			}
		}
	};
	const saved = {
		id: 'saved-september',
		date: '2026-09-22',
		assignmentTypeId: 'type-1',
		assigneeId: 'person-1'
	};
	function response(assignments = [saved], rangeStart = '2026-06-03', rangeEnd = '2026-09-30') {
		return Response.json({
			rangeStart,
			rangeEnd,
			dailyAssignments: assignments,
			availabilityEntries: [],
			specialDays: []
		});
	}
	/** Answers a range read with exactly the collections its URL names. */
	function answer(url: string) {
		const params = new URL(url, 'http://localhost').searchParams;
		const collections = params.get('collections')?.split(',') ?? [];
		return Response.json({
			rangeStart: params.get('rangeStart'),
			rangeEnd: params.get('rangeEnd'),
			...(collections.includes('availability') && { availabilityEntries: [] }),
			...(collections.includes('assignments') && { specialDays: [], dailyAssignments: [saved] })
		});
	}
	it('loads the displayed month on a cold start outside bootstrap coverage before offering edits', async () => {
		const pending: Array<{ url: string; resolve: (value: Response) => void }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(url: string) =>
					new Promise<Response>((resolve) => {
						pending.push({ url, resolve });
					})
			)
		);
		renderPage(staleBootstrap);
		expect(screen.queryByRole('button', { name: /^Assign Charge of Quarters/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Charge of Quarters column actions' })).toBeNull();
		await waitFor(() => expect(pending).toHaveLength(2));
		expect(pending.map(({ url }) => url)).toEqual([
			'/org/org-1/api/calendar-range?rangeStart=2026-09-01&rangeEnd=2026-09-30&collections=availability',
			'/org/org-1/api/calendar-range?rangeStart=2026-06-03&rangeEnd=2026-09-30&collections=assignments'
		]);
		pending[0].resolve(answer(pending[0].url));
		expect(screen.queryByRole('button', { name: 'Charge of Quarters column actions' })).toBeNull();
		pending[1].resolve(answer(pending[1].url));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /^Charge of Quarters, Tue 22 Sept?: SGT Smith, Alex/ })).toBeTruthy()
		);
		expect(document.cookie).toContain('ttt-calendar-anchor-date=2026-09-01');
	});
	it('keeps the month non-editable until the 90-day lookback before it is loaded', async () => {
		let resolve!: (value: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((r) => {
						resolve = r;
					})
			)
		);
		renderPage({
			orgId: 'org-1',
			calendar: {
				data: {
					personnel,
					rangeStart: '2026-09-01',
					rangeEnd: '2026-10-31',
					availabilityRange: { rangeStart: '2026-09-01', rangeEnd: '2026-10-31' }
				}
			}
		});
		await waitFor(() => expect(resolve).toBeTypeOf('function'));
		expect(screen.queryByRole('button', { name: /^Assign Charge of Quarters/ })).toBeNull();
		resolve(response([], '2026-06-03', '2026-08-31'));
		expect(await screen.findByRole('button', { name: /^Assign Charge of Quarters, Tue 22 Sept?/ })).toBeTruthy();
	});
	it('keeps failed dates non-editable and recovers the saved slot on explicit retry', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response('', { status: 503 }))
				.mockImplementation(async (url: string) => answer(url))
		);
		renderPage(staleBootstrap);
		const retry = await screen.findByRole('button', { name: 'Retry calendar load' });
		expect(screen.queryByRole('button', { name: /^Assign Charge of Quarters/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Charge of Quarters column actions' })).toBeNull();
		await fireEvent.click(retry);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /^Charge of Quarters, Tue 22 Sept?: SGT Smith, Alex/ })).toBeTruthy()
		);
	});
	it('loads far-month assignments after navigation and ignores a superseded response', async () => {
		const pending: Array<(value: Response) => void> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						pending.push(resolve);
					})
			)
		);
		renderPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await waitFor(() => expect(pending).toHaveLength(1));
		expect(screen.queryByRole('button', { name: 'Charge of Quarters column actions' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await waitFor(() => expect(pending).toHaveLength(2));
		pending[1](response([{ ...saved, id: 'saved-december', date: '2026-12-31' }], '2026-11-01', '2026-12-31'));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Charge of Quarters, Thu 31 Dec: SGT Smith, Alex' })).toBeTruthy()
		);
		await act(async () => {
			pending[0](
				response(
					[{ ...saved, id: 'stale-november', date: '2026-11-15', assigneeId: 'person-2' }],
					'2026-11-01',
					'2026-11-30'
				)
			);
		});
		expect(dailyAssignmentsStore.assignments.map((row) => row.id)).toEqual(['saved-december']);

		expect(calendarStore.currentDate.getMonth()).toBe(11);
	});
	it('does not merge a late response into a different organization after navigation', async () => {
		let resolve!: (value: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((r) => {
						resolve = r;
					})
			)
		);
		const view = renderPage(staleBootstrap);
		await waitFor(() => expect(resolve).toBeTypeOf('function'));
		dailyAssignmentsStore.load(assignmentTypes, [{ ...saved, id: 'other-org', assigneeId: 'person-2' }], 'org-2');
		await view.rerender({
			org: mockOrg,
			data: {
				orgId: 'org-2',
				calendar: {
					data: {
						personnel,
						rangeStart: '2026-06-03',
						rangeEnd: '2026-09-30',
						availabilityRange: { rangeStart: '2026-09-01', rangeEnd: '2026-09-30' }
					}
				}
			}
		});
		await act(async () => {
			resolve(response());
		});
		expect(dailyAssignmentsStore.orgId).toBe('org-2');
		expect(dailyAssignmentsStore.assignments.map((row) => row.id)).toEqual(['other-org']);
		expect(screen.getByRole('button', { name: /^Charge of Quarters, Tue 22 Sept?: CPT Taylor, Jamie/ })).toBeTruthy();
	});
});
