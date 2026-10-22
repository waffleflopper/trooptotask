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
		poolRules: null,
		weekendMode: 'same',
		excusals: [],
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
	poolRules: null,
	weekendMode: 'same',
	excusals: [],
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

/** Answers month roster reads with `rosters`, day reads with a type that has no open roster, and every other request with `rest`. */
function routedFetch(
	rest: (url: string, init?: RequestInit) => Promise<Response>,
	rosters: () => Promise<Response> = async () => Response.json([])
) {
	return vi.fn((url: string, init?: RequestInit) => {
		if (url.includes('/api/duty-rosters/day')) return Promise.resolve(Response.json(null));
		return url.includes('/api/duty-rosters') ? rosters() : rest(url, init);
	});
}

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

// Roster counts load on every Organization-wide render; a test that reads them stubs fetch itself.
beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		routedFetch(() => new Promise(() => {}))
	);
});

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
	const rosters = vi.fn(async () => Response.json([]));
	vi.stubGlobal(
		'fetch',
		routedFetch(async (_url, init) => {
			const payload = JSON.parse(String(init?.body));
			saved.push(payload);
			return Response.json(
				payload.records
					? { inserted: payload.records.map((row: object, index: number) => ({ id: `batch-${index}`, ...row })) }
					: { id: 'saved', ...payload }
			);
		}, rosters)
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
		await waitFor(() => expect(rosters).toHaveBeenCalledTimes(3));
	} finally {
		cleanup();
		vi.unstubAllGlobals();
	}
});

it('offers a Group-scoped member only the Groups in their scope, and no roster counts', async () => {
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
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	try {
		renderPage();
		await fireEvent.click(screen.getByRole('button', { name: /^Assign Group Duty, Tue 1 Sept?/ }));

		expect(await screen.findByRole('option', { name: 'Alpha' })).toBeTruthy();
		expect(screen.queryByRole('option', { name: 'Bravo' })).toBeNull();
		expect(screen.queryByRole('region', { name: 'Roster · count today' })).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		cleanup();
		vi.unstubAllGlobals();
	}
});

describe('planner roster counts', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('offers edits while roster counts load, keeps them when the counts fail, and reads again on retry', async () => {
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 8);
		dailyAssignmentsStore.load(assignmentTypes, [], 'org-1');
		let fail!: () => void;
		const rosters = vi
			.fn<() => Promise<Response>>()
			.mockReturnValueOnce(new Promise((resolve) => (fail = () => resolve(new Response('', { status: 503 })))))
			.mockResolvedValueOnce(Response.json([]));
		vi.stubGlobal(
			'fetch',
			routedFetch(() => new Promise(() => {}), rosters)
		);
		renderPage();

		const panel = screen.getByRole('region', { name: 'Roster · count today' });
		expect(within(panel).getByRole('status', { name: 'Loading roster counts' })).toBeTruthy();
		expect(screen.getByRole('button', { name: /^Assign Charge of Quarters, Tue 22 Sept?/ })).toBeTruthy();
		expect(rosters).toHaveBeenCalledTimes(1);

		fail();
		await fireEvent.click(await within(panel).findByRole('button', { name: 'Retry roster counts' }));

		expect(screen.getByRole('button', { name: /^Assign Charge of Quarters, Tue 22 Sept?/ })).toBeTruthy();
		await waitFor(() => expect(within(panel).getByText('This duty has no roster yet.')).toBeTruthy());
		expect(rosters).toHaveBeenCalledTimes(2);
	});

	it('reads the counts again after an assignment saves', async () => {
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 8);
		dailyAssignmentsStore.load(assignmentTypes, [], 'org-1');
		const rosters = vi.fn(async () => Response.json([]));
		vi.stubGlobal(
			'fetch',
			routedFetch(async (_url, init) => Response.json({ id: 'a-1', ...JSON.parse(String(init?.body)) }), rosters)
		);
		renderPage();
		await waitFor(() => expect(rosters).toHaveBeenCalledTimes(1));

		await fireEvent.click(screen.getByRole('button', { name: /^Assign Charge of Quarters, Tue 22 Sept?/ }));
		await fireEvent.click(await screen.findByRole('option', { name: /Smith, Alex/ }));

		await waitFor(() => expect(rosters).toHaveBeenCalledTimes(2));
	});
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
			[
				{
					id: 'leave',
					name: 'Leave',
					color: '#0a0',
					textColor: '#fff',
					shortLabel: null,
					rosterEffect: 'A',
					sortOrder: 0
				}
			],
			'org-1'
		);
		availabilityStore.load(
			[{ id: 'e-1', personnelId: 'person-1', statusTypeId: 'leave', startDate: '2026-09-21', endDate: '2026-09-23' }],
			'org-1'
		);
		const rosters = vi.fn(async () => Response.json([]));
		vi.stubGlobal(
			'fetch',
			routedFetch(async (_url, init) => Response.json({ id: 'a-1', ...JSON.parse(String(init?.body)) }), rosters)
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
			await waitFor(() => expect(rosters).toHaveBeenCalledTimes(2));
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
	function answer(url: string, dailyAssignments = [saved]) {
		const params = new URL(url, 'http://localhost').searchParams;
		const collections = params.get('collections')?.split(',') ?? [];
		return Response.json({
			rangeStart: params.get('rangeStart'),
			rangeEnd: params.get('rangeEnd'),
			...(collections.includes('availability') && { availabilityEntries: [] }),
			...(collections.includes('assignments') && { specialDays: [], dailyAssignments })
		});
	}
	it('loads the displayed month on a cold start outside bootstrap coverage before offering edits', async () => {
		const pending: Array<{ url: string; resolve: (value: Response) => void }> = [];
		vi.stubGlobal(
			'fetch',
			routedFetch(
				(url) =>
					new Promise<Response>((resolve) => {
						pending.push({ url, resolve });
					})
			)
		);
		renderPage(staleBootstrap);
		expect(screen.queryByRole('button', { name: /^Assign Charge of Quarters/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Charge of Quarters column actions' })).toBeNull();
		await waitFor(() => expect(pending).toHaveLength(1));
		expect(pending[0].url).toBe(
			'/org/org-1/api/calendar-range?rangeStart=2026-09-01&rangeEnd=2026-09-30&collections=availability%2Cassignments'
		);
		pending[0].resolve(answer(pending[0].url));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /^Charge of Quarters, Tue 22 Sept?: SGT Smith, Alex/ })).toBeTruthy()
		);
		expect(document.cookie).toContain('ttt-calendar-anchor-date=2026-09-01');
	});
	it('keeps failed dates non-editable and recovers the saved slot on explicit retry', async () => {
		vi.stubGlobal(
			'fetch',
			routedFetch(
				vi
					.fn()
					.mockResolvedValueOnce(new Response('', { status: 503 }))
					.mockImplementation(async (url: string) => answer(url))
			)
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
		const pending: Array<{ url: string; resolve: (value: Response) => void }> = [];
		vi.stubGlobal(
			'fetch',
			routedFetch(
				(url) =>
					new Promise<Response>((resolve) => {
						pending.push({ url, resolve });
					})
			)
		);
		renderPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await waitFor(() => expect(pending).toHaveLength(1));
		expect(screen.queryByRole('button', { name: 'Charge of Quarters column actions' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await waitFor(() => expect(pending).toHaveLength(3));
		for (const { url, resolve } of pending.slice(1)) {
			resolve(answer(url, [{ ...saved, id: 'saved-december', date: '2026-12-31' }]));
		}
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Charge of Quarters, Thu 31 Dec: SGT Smith, Alex' })).toBeTruthy()
		);
		await act(async () => {
			pending[0].resolve(
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
			routedFetch(
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
