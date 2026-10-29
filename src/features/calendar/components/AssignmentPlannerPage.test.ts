import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
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
		groupCatalogHydration.load(
			[{ id: 'group-1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }],
			'org-1'
		);
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
			{ id: 'group-alpha', name: 'Alpha Renamed', sortOrder: 0, parentId: null, depth: 1 as const },
			{ id: 'group-bravo', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 as const }
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
	mockOrg = makeOrg({ scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] }) });
	calendarStore.goToMonth(2026, 8);
	const groupType = { ...modType, id: 'group-duty', name: 'Group Duty', shortName: 'GD', assignTo: 'group' as const };
	dailyAssignmentsStore.load([groupType], [], 'org-1');
	groupCatalogHydration.load(
		[
			{ id: 'group-alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const },
			{ id: 'group-bravo', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 as const }
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

describe('planner roster replacement', () => {
	const preview = {
		date: '2026-10-20',
		replacing: { personId: 'person-1', count: 12, effect: { code: 'A', reason: 'Leave' } },
		nextUp: 'person-2',
		candidates: [{ personId: 'person-2', count: 9, adjacent: [] }],
		cantPull: [{ personId: 'person-1', count: 12, code: 'A', reason: 'Leave' }],
		selected: 'person-2',
		repicks: [{ date: '2026-10-23', was: 'person-2', personId: 'person-1' }],
		unfilled: []
	};
	const dutyRoster = {
		typeId: 'type-1',
		people: ['person-1', 'person-2'],
		effects: [{ code: 'A', reason: 'Leave' }],
		current: [{ track: 'all', standing: [0, 12, 1, 1, 9, 0] }],
		todayAssignee: null,
		excused: [],
		covered: ['2026-10-20'],
		swaps: [],
		conflicts: [{ date: '2026-10-20', personId: 'person-1', code: 'A', reason: 'Leave' }]
	};
	const planned = (id: string, date: string, assigneeId: string) => ({
		id,
		date,
		assignmentTypeId: 'type-1',
		assigneeId
	});

	/**
	 * Routes the Organization's duty roster and calendar range reads; `replaceStatus` answers the replacement write and
	 * a Fill from roster. `failedRanges` range reads fail before the rest answer.
	 */
	function replacementFetch(
		replaceStatus: number,
		rangeAssignments: () => ReturnType<typeof planned>[],
		{ failedRanges = 0 } = {}
	) {
		const writes: unknown[] = [];
		const ranges = vi.fn();
		const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.endsWith('/replacement/preview')) return Response.json(preview);
			if (url.endsWith('/fill/preview')) {
				return Response.json({
					picks: [{ date: '2026-10-21', personId: 'person-2', count: 9, passedOver: [], returningFrom: null }],
					unfilled: []
				});
			}
			if (url.endsWith('/api/duty-rosters/replacement') || url.endsWith('/api/duty-rosters/fill')) {
				writes.push(JSON.parse(String(init?.body)));
				return Response.json({ message: 'The roster changed.' }, { status: replaceStatus });
			}
			if (url.includes('/api/duty-rosters/day')) return Response.json(null);
			if (url.includes('/api/duty-rosters')) return Response.json([dutyRoster]);
			if (url.includes('/api/calendar-range')) {
				ranges(url);
				if (ranges.mock.calls.length <= failedRanges) return new Response('', { status: 503 });
				return Response.json({
					rangeStart: '2026-10-01',
					rangeEnd: '2026-10-31',
					dailyAssignments: rangeAssignments()
				});
			}
			return new Promise<Response>(() => {});
		});
		return { fetcher, writes, ranges };
	}

	async function assignReplacement() {
		const panel = screen.getByRole('region', { name: /Conflicts/ });
		await fireEvent.click(
			await within(panel).findByRole('button', { name: 'Find replacement for Charge of Quarters, Tue 20 Oct' })
		);
		const dialog = await screen.findByRole('dialog', { name: /^Replace/ });
		await fireEvent.click(await within(dialog).findByRole('button', { name: 'Assign Taylor' }));
		return dialog;
	}

	async function fillFromRoster() {
		await fireEvent.click(await screen.findByRole('button', { name: 'Fill Charge of Quarters from roster' }));
		const menu = await screen.findByRole('dialog', { name: 'Fill from roster, Charge of Quarters' });
		await fireEvent.click(await within(menu).findByRole('button', { name: 'Fill 1 day' }));
		return menu;
	}

	const openSlot = () =>
		screen.getByRole('button', { name: 'Assign Charge of Quarters, Thu 22 Oct', hidden: true }) as HTMLButtonElement;

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 16) });
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 9);
		dailyAssignmentsStore.load(
			assignmentTypes,
			[planned('a-20', '2026-10-20', 'person-1'), planned('a-23', '2026-10-23', 'person-2')],
			'org-1'
		);
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('sends who held each re-picked day in the preview so the server can tell an edit made since', async () => {
		const { fetcher, writes } = replacementFetch(409, () => []);
		vi.stubGlobal('fetch', fetcher);
		renderPage();

		await assignReplacement();

		await waitFor(() => expect(writes).toHaveLength(1));
		expect(writes[0]).toMatchObject({
			assigneeId: 'person-2',
			replacing: 'person-1',
			repicks: [{ date: '2026-10-23', was: 'person-2', personId: 'person-1' }]
		});
	});

	it("reads the month's assignments again when the roster moved, so the grid shows the other operator's edit", async () => {
		const { fetcher, ranges } = replacementFetch(409, () => [
			planned('a-20', '2026-10-20', 'person-1'),
			planned('a-23', '2026-10-23', 'person-1')
		]);
		vi.stubGlobal('fetch', fetcher);
		renderPage();

		const dialog = await assignReplacement();

		expect(await within(dialog).findByRole('alert')).toBeTruthy();
		await waitFor(() => expect(ranges).toHaveBeenCalledTimes(1));
		expect(
			await screen.findByRole('button', { name: 'Charge of Quarters, Fri 23 Oct: SGT Smith, Alex', hidden: true })
		).toBeTruthy();
	});

	it("reads the month's assignments again after a refused fill, so a day another operator filled no longer looks open", async () => {
		const { fetcher, ranges, writes } = replacementFetch(409, () => [
			planned('a-20', '2026-10-20', 'person-1'),
			planned('a-21', '2026-10-21', 'person-1'),
			planned('a-23', '2026-10-23', 'person-2')
		]);
		vi.stubGlobal('fetch', fetcher);
		renderPage();

		const menu = await fillFromRoster();

		await waitFor(() => expect(writes).toHaveLength(1));
		await waitFor(() => expect(ranges).toHaveBeenCalledTimes(1));
		expect(
			await screen.findByRole('button', { name: 'Charge of Quarters, Wed 21 Oct: SGT Smith, Alex', hidden: true })
		).toBeTruthy();
		expect(await within(menu).findByText(/The roster changed since this preview/)).toBeTruthy();
		expect(screen.queryByText(/could not be read again/)).toBeNull();
	});

	it('locks the month after a refused fill whose re-read failed, until Retry reads it', async () => {
		const { fetcher, ranges } = replacementFetch(
			409,
			() => [planned('a-20', '2026-10-20', 'person-1'), planned('a-21', '2026-10-21', 'person-1')],
			{ failedRanges: 1 }
		);
		vi.stubGlobal('fetch', fetcher);
		renderPage();

		await fillFromRoster();

		const alert = await screen.findByText(/could not be read again/);
		expect(openSlot().disabled).toBe(true);
		expect(screen.queryByRole('button', { name: /Wed 21 Oct: SGT Smith/, hidden: true })).toBeNull();

		await fireEvent.click(within(alert.closest('section')!).getByRole('button', { name: 'Retry' }));

		await waitFor(() => expect(screen.queryByText(/could not be read again/)).toBeNull());
		expect(ranges).toHaveBeenCalledTimes(2);
		expect(screen.getByRole('button', { name: /Wed 21 Oct: SGT Smith/, hidden: true })).toBeTruthy();
		expect(openSlot().disabled).toBe(false);
	});

	it('locks the month after a refused replacement whose re-read failed, until Retry reads it', async () => {
		const { fetcher, ranges } = replacementFetch(409, () => [planned('a-20', '2026-10-20', 'person-1')], {
			failedRanges: 1
		});
		vi.stubGlobal('fetch', fetcher);
		renderPage();

		await assignReplacement();

		const alert = await screen.findByText(/could not be read again/);
		await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Replace/ })).toBeNull());
		expect(openSlot().disabled).toBe(true);

		await fireEvent.click(within(alert.closest('section')!).getByRole('button', { name: 'Retry' }));

		await waitFor(() => expect(screen.queryByText(/could not be read again/)).toBeNull());
		expect(ranges).toHaveBeenCalledTimes(2);
		expect(openSlot().disabled).toBe(false);
	});
});

describe('planner duty swaps', () => {
	const planned = (id: string, date: string, assigneeId: string) => ({
		id,
		date,
		assignmentTypeId: 'type-1',
		assigneeId
	});
	const dutyRoster = (swaps: unknown[]) => ({
		typeId: 'type-1',
		people: [],
		effects: [],
		current: null,
		todayAssignee: null,
		excused: [],
		covered: ['2026-10-20', '2026-10-23'],
		swaps,
		conflicts: []
	});
	const swapRecord = {
		id: 'swap-1',
		days: [
			{ date: '2026-10-20', heldBy: 'person-1' },
			{ date: '2026-10-23', heldBy: 'person-2' }
		]
	};
	const exchanged = [planned('a-20', '2026-10-20', 'person-2'), planned('a-23', '2026-10-23', 'person-1')];
	const restored = [planned('a-20', '2026-10-20', 'person-1'), planned('a-23', '2026-10-23', 'person-2')];

	/** Answers the roster month read with whatever swaps `state.swaps` holds, and the swap endpoints with `reply`. */
	function swapFetch(state: { swaps: unknown[] }, reply: (method: string) => Response) {
		const requests: { method: string; url: string; body?: unknown }[] = [];
		const monthReads = vi.fn();
		const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes('/api/duty-rosters/swap')) {
				const method = init?.method ?? 'GET';
				requests.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
				if (method === 'GET') {
					return Response.json({
						date: '2026-10-20',
						personId: 'person-1',
						days: [{ date: '2026-10-23', personId: 'person-2', warnings: [] }]
					});
				}
				return reply(method);
			}
			if (url.includes('/api/duty-rosters/day')) return Response.json(null);
			if (url.includes('/api/duty-rosters')) {
				monthReads();
				return Response.json([dutyRoster(state.swaps)]);
			}
			return new Promise<Response>(() => {});
		});
		return { fetcher, requests, monthReads };
	}

	const cell = (date: string, holder: string) =>
		screen.findByRole('button', { name: new RegExp(`^Charge of Quarters, ${date}: ${holder}`), hidden: true });

	async function swapTuesdayWithFriday() {
		await fireEvent.click(await cell('Tue 20 Oct', 'SGT Smith, Alex'));
		await fireEvent.click(await screen.findByRole('button', { name: 'Swap with…' }));
		const dialog = await screen.findByRole('dialog', { name: /^Swap Charge of Quarters/ });
		await fireEvent.click(await within(dialog).findByRole('radio', { name: /^Fri 23 Oct/ }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Swap days' }));
		return dialog;
	}

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 16) });
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 9);
		dailyAssignmentsStore.load(assignmentTypes, restored, 'org-1');
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('swaps two days through the store, shows the new holders and reads the roster again', async () => {
		const state = { swaps: [] as unknown[] };
		const { fetcher, requests, monthReads } = swapFetch(state, () => {
			state.swaps = [swapRecord];
			return Response.json({ saved: exchanged, assignmentTypeId: 'type-1', swap: swapRecord });
		});
		vi.stubGlobal('fetch', fetcher);
		renderPage();
		await waitFor(() => expect(monthReads).toHaveBeenCalledTimes(1));

		await swapTuesdayWithFriday();

		expect(await cell('Tue 20 Oct', 'CPT Taylor, Jamie')).toBeTruthy();
		expect(await cell('Fri 23 Oct', 'SGT Smith, Alex')).toBeTruthy();
		expect(requests.filter((request) => request.method === 'POST').map((request) => request.body)).toEqual([
			{
				today: '2026-10-16',
				days: [
					{ assignmentTypeId: 'type-1', date: '2026-10-20', was: 'person-1' },
					{ assignmentTypeId: 'type-1', date: '2026-10-23', was: 'person-2' }
				]
			}
		]);
		await waitFor(() => expect(monthReads).toHaveBeenCalledTimes(2));
		expect(
			await screen.findByRole('button', { name: /^Charge of Quarters, Tue 20 Oct:.*swapped with 23 Oct/, hidden: true })
		).toBeTruthy();
		expect(screen.queryByRole('dialog', { name: /^Swap Charge of Quarters/ })).toBeNull();
	});

	it("reads the month's assignments again when another operator changed the roster, and keeps the swap open", async () => {
		const { fetcher } = swapFetch({ swaps: [] }, () =>
			Response.json({ message: 'The roster changed.' }, { status: 409 })
		);
		vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
			url.includes('/api/calendar-range')
				? Response.json({
						rangeStart: '2026-10-01',
						rangeEnd: '2026-10-31',
						dailyAssignments: [planned('a-20', '2026-10-20', 'person-1'), planned('a-23', '2026-10-23', 'person-1')]
					})
				: fetcher(url, init)
		);
		renderPage();

		const dialog = await swapTuesdayWithFriday();

		expect(await within(dialog).findByText(/roster changed since this preview/)).toBeTruthy();
		expect(await cell('Fri 23 Oct', 'SGT Smith, Alex')).toBeTruthy();
		expect(screen.getByRole('dialog', { name: /^Swap Charge of Quarters/ })).toBe(dialog);
	});

	it('undoes a swap from the picker and shows the original holders', async () => {
		dailyAssignmentsStore.load(assignmentTypes, exchanged, 'org-1');
		const state = { swaps: [swapRecord] as unknown[] };
		const { fetcher, requests } = swapFetch(state, () => {
			state.swaps = [];
			return Response.json({ saved: restored, assignmentTypeId: 'type-1', swap: swapRecord });
		});
		vi.stubGlobal('fetch', fetcher);
		renderPage();

		await fireEvent.click(await cell('Tue 20 Oct', 'CPT Taylor, Jamie, swapped with 23 Oct'));
		await fireEvent.click(await screen.findByRole('button', { name: 'Undo swap' }));

		expect(await cell('Tue 20 Oct', 'SGT Smith, Alex')).toBeTruthy();
		expect(requests.find((request) => request.method === 'DELETE')?.body).toEqual({
			today: '2026-10-16',
			swapId: 'swap-1'
		});
	});

	it('offers no swap and sends no swap read to an operator limited to a Group', async () => {
		mockOrg = makeOrg({ scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-1'] }) });
		const { fetcher, requests } = swapFetch({ swaps: [] }, () => new Response('', { status: 500 }));
		vi.stubGlobal('fetch', fetcher);
		renderPage();

		await fireEvent.click(await cell('Tue 20 Oct', 'SGT Smith, Alex'));
		await screen.findByRole('dialog', { name: 'Charge of Quarters, Tue 20 Oct' });

		expect(screen.queryByRole('button', { name: 'Swap with…' })).toBeNull();
		expect(requests).toEqual([]);
	});
});

describe('planner visible-month loading', () => {
	beforeEach(() => {
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 8);
		dailyAssignmentsStore.load(assignmentTypes, [], 'org-1');
		groupCatalogHydration.load(
			[{ id: 'group-1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }],
			'org-1'
		);
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
