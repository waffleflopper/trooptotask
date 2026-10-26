// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyAssignmentsStore, loadDutyPicker } from '$features/calendar';
import type { AssignmentType, DailyAssignment, RosterFillPreview } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { PolicyResource } from '$lib/access/policyEvaluator';
import { toastStore } from '$lib/stores/toast.svelte';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import DutyFillPanel from './DutyFillPanel.svelte';
import DutyPickerTestDouble from './DutyPickerTestDouble.svelte';

vi.mock('$features/calendar', async (original) => ({
	...(await original<typeof import('$features/calendar')>()),
	loadDutyPicker: vi.fn()
}));

const TODAY = '2026-10-19';
const FORECAST = Array.from({ length: 14 }, (_, index) => fromDayNumber(toDayNumber(TODAY) + index));

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#b91c1c',
	poolRules: null,
	weekendMode: 'same',
	excusals: [{ personId: 'p-exempt', reason: 'Profile', startsOn: '2026-01-01' }],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, lastName: string): Personnel {
	return { id, rank: 'SPC', lastName, firstName: 'Ana', mos: '', clinicRole: '', groupId: null, groupName: '' };
}

const personnel = [person('p-adams', 'Adams'), person('p-baker', 'Baker'), person('p-exempt', 'Able')];

function duty(date: string, assigneeId: string): DailyAssignment {
	return { id: `${assigneeId}-${date}`, date, assignmentTypeId: 'sd', assigneeId };
}

let type = staffDuty;
const model = {
	get inputs() {
		return {
			today: TODAY,
			timeZone: 'UTC',
			forecastDays: FORECAST,
			personnel,
			availability: [],
			statusTypes: [],
			groups: [],
			specialDays: [],
			assignmentTypes: [type],
			assignments: dailyAssignmentsStore.assignments,
			page: { orgId: 'org-1' }
		};
	}
} as unknown as DashboardScreenModel;

const pick = (
	date: string,
	personId: string,
	count: number,
	more: Partial<RosterFillPreview['picks'][number]> = {}
) => ({
	date,
	personId,
	count,
	passedOver: [],
	returningFrom: null,
	...more
});

/** What the planner's Fill from roster previews for Tue 20 through Mon 26: Adams and Baker take turns. */
const ROTATION: RosterFillPreview = {
	picks: [
		pick('2026-10-20', 'p-adams', 4),
		pick('2026-10-21', 'p-baker', 4),
		pick('2026-10-22', 'p-adams', 5),
		pick('2026-10-23', 'p-baker', 5),
		pick('2026-10-24', 'p-adams', 6, { passedOver: [{ personId: 'p-baker', count: 6, code: 'A', reason: 'Leave' }] }),
		pick('2026-10-25', 'p-baker', 6, { returningFrom: 'Leave' }),
		pick('2026-10-26', 'p-adams', 7)
	],
	unfilled: []
};

const PREVIEW_URL = '/org/org-1/api/duty-rosters/fill/preview';
const FILL_URL = '/org/org-1/api/duty-rosters/fill';
const BATCH_URL = '/org/org-1/api/daily-assignments/batch';

function respond(body: unknown, status = 200) {
	return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const fetchMock = vi.fn();

type Days = { from: string; through: string };

/** Answers each fill preview with the rotation's picks on its days unless a test overrides it; any other request fails the test. */
function answerPreviews(
	answer: (days: Days) => Promise<Response> = ({ from, through }) =>
		respond({ picks: ROTATION.picks.filter(({ date }) => date >= from && date <= through), unfilled: [] })
) {
	fetchMock.mockImplementation((url: string, init?: RequestInit) => {
		if (url === PREVIEW_URL) return answer(JSON.parse(String(init?.body)));
		throw new Error(`unexpected fetch ${url}`);
	});
}

function previewBodies() {
	return fetchMock.mock.calls.filter(([url]) => url === PREVIEW_URL).map(([, init]) => JSON.parse(init.body));
}

function open(openDates: readonly string[], organizationWide = true) {
	dailyAssignmentsStore.load(
		[type],
		FORECAST.filter((date) => !openDates.includes(date)).map((date) => duty(date, 'p-baker')),
		'org-1'
	);
	const close = vi.fn();
	render(DutyFillPanel, {
		props: {
			model,
			access: {
				can: (_action: unknown, resource?: PolicyResource) => organizationWide || resource?.kind !== 'organization',
				isPrivileged: false
			},
			updates: { refreshSummary: vi.fn(), refreshTaskings: vi.fn(), retryTaskings: vi.fn(), putRecord: vi.fn() },
			save: (command: () => Promise<void>) => command(),
			saving: false,
			failure: null,
			close,
			assignmentTypeId: 'sd'
		}
	});
	return { close };
}

function daysToFill() {
	return screen.getByRole('list', { name: 'Days to fill' });
}

function slotNames(): string[] {
	return within(daysToFill())
		.queryAllByRole('button')
		.map((slot) => slot.getAttribute('aria-label') ?? '');
}

const ROTATION_NAMES = [
	'Tue 20: SPC Adams, Ana, swap',
	'Wed 21: SPC Baker, Ana, swap',
	'Thu 22: SPC Adams, Ana, swap',
	'Fri 23: SPC Baker, Ana, swap',
	'Sat 24: SPC Adams, Ana, swap',
	'Sun 25: SPC Baker, Ana, swap',
	'Mon 26: SPC Adams, Ana, swap'
];

beforeEach(() => {
	type = staffDuty;
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('DutyFillPanel', () => {
	it("suggests the planner's fill preview for the shown days from one request, rotating a two-person pool", async () => {
		let release!: () => void;
		answerPreviews(() => new Promise((resolve) => (release = () => resolve(new Response(JSON.stringify(ROTATION))))));
		open(FORECAST.slice(1, 8));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(previewBodies()).toEqual([{ typeId: 'sd', today: TODAY, from: '2026-10-20', through: '2026-10-26' }]);
		expect(daysToFill().getAttribute('aria-busy')).toBe('true');
		expect(slotNames()).toEqual([]);
		expect(screen.getByRole('button', { name: 'Assign all 0' }).getAttribute('aria-disabled')).toBe('true');

		release();

		await waitFor(() => expect(slotNames()).toEqual(ROTATION_NAMES));
		expect(daysToFill().getAttribute('aria-busy')).toBe('false');
		expect(
			within(daysToFill())
				.getAllByText(/^count /)
				.map((note) => note.textContent?.trim())
		).toEqual(['count 4', 'count 4', 'count 5', 'count 5', 'count 6', 'count 6 · back from Leave', 'count 7']);
		expect(screen.getByText('Skipped SPC Baker (6). On Leave, count holds.')).toBeTruthy();
		expect(screen.getByText(/next up on the roster/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Assign all 7' }).getAttribute('aria-disabled')).toBe('false');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('assigns the previewed picks through the roster fill and leaves the store holding them', async () => {
		answerPreviews();
		open(FORECAST.slice(1, 8));
		await waitFor(() => expect(slotNames()).toEqual(ROTATION_NAMES));

		fetchMock.mockReturnValueOnce(
			respond({ saved: ROTATION.picks.map(({ date, personId }) => ({ ...duty(date, personId), source: 'roster' })) })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Assign all 7' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		const [url, request] = fetchMock.mock.calls[1];
		expect(url).toBe('/org/org-1/api/duty-rosters/fill');
		expect(JSON.parse(request.body)).toEqual({
			typeId: 'sd',
			today: TODAY,
			from: '2026-10-20',
			through: '2026-10-26',
			picks: [
				{ date: '2026-10-20', personId: 'p-adams' },
				{ date: '2026-10-21', personId: 'p-baker' },
				{ date: '2026-10-22', personId: 'p-adams' },
				{ date: '2026-10-23', personId: 'p-baker' },
				{ date: '2026-10-24', personId: 'p-adams' },
				{ date: '2026-10-25', personId: 'p-baker' },
				{ date: '2026-10-26', personId: 'p-adams' }
			]
		});
		await waitFor(() =>
			expect(
				dailyAssignmentsStore.assignments
					.filter((assignment) => assignment.date >= '2026-10-20' && assignment.date <= '2026-10-23')
					.map((assignment) => assignment.assigneeId)
			).toEqual(['p-adams', 'p-baker', 'p-adams', 'p-baker'])
		);
	});

	it('shows a failed preview in the panel, suggests nobody, and previews again on Try again', async () => {
		answerPreviews(() => respond({ message: 'Roster unavailable' }, 503));
		open(FORECAST.slice(1, 3));

		expect((await screen.findByRole('alert')).textContent).toContain('Roster counts could not be loaded');
		expect(daysToFill().getAttribute('aria-busy')).toBe('false');
		expect(screen.getByRole('button', { name: 'Assign all 0' }).getAttribute('aria-disabled')).toBe('true');
		expect(slotNames()).toEqual(['Tue 20: not suggested, swap', 'Wed 21: not suggested, swap']);
		expect(screen.getAllByText('Count unavailable')).toHaveLength(2);

		answerPreviews();
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		await waitFor(() => expect(slotNames()).toEqual(ROTATION_NAMES.slice(0, 2)));
		expect(previewBodies()).toHaveLength(2);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it("swaps a day from that day's roster standing, saves it by hand and previews the later days again", async () => {
		const calendar = await vi.importActual<typeof import('$features/calendar')>('$features/calendar');
		vi.mocked(loadDutyPicker).mockImplementationOnce(calendar.loadDutyPicker);
		answerPreviews();
		open(FORECAST.slice(1, 8));
		await waitFor(() => expect(slotNames()).toEqual(ROTATION_NAMES));

		fetchMock.mockImplementation((url: string) => {
			if (url === `/org/org-1/api/duty-rosters/day?typeId=sd&date=2026-10-20&today=${TODAY}`)
				return respond({
					track: 'all',
					standing: [
						{ personId: 'p-adams', count: 4, effect: null },
						{ personId: 'p-baker', count: 3, effect: null }
					]
				});
			if (url === '/org/org-1/api/daily-assignments/batch')
				return respond({ inserted: [duty('2026-10-20', 'p-baker')] });
			if (url === PREVIEW_URL)
				return respond({
					picks: ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'].map(
						(date, index) => pick(date, index % 2 ? 'p-baker' : 'p-adams', 5)
					),
					unfilled: []
				});
			throw new Error(`unexpected fetch ${url}`);
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Tue 20: SPC Adams, Ana, swap' }));
		await screen.findByRole('combobox', { name: 'Find person' });
		await waitFor(() =>
			expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
				'SPC Adams, Ana, count 4, assigned',
				'SPC Baker, Ana, count 3'
			])
		);

		await fireEvent.click(screen.getByRole('option', { name: 'SPC Baker, Ana, count 3' }));

		await waitFor(() =>
			expect(slotNames()).toEqual([
				'Tue 20: SPC Baker, Ana, swap',
				'Wed 21: SPC Adams, Ana, swap',
				'Thu 22: SPC Baker, Ana, swap',
				'Fri 23: SPC Adams, Ana, swap',
				'Sat 24: SPC Baker, Ana, swap',
				'Sun 25: SPC Adams, Ana, swap',
				'Mon 26: SPC Baker, Ana, swap'
			])
		);
		const batch = fetchMock.mock.calls.find(([url]) => url === '/org/org-1/api/daily-assignments/batch');
		expect(JSON.parse(batch?.[1].body)).toEqual({
			records: [{ date: '2026-10-20', assignmentTypeId: 'sd', assigneeId: 'p-baker' }]
		});
		expect(previewBodies()).toEqual([
			{ typeId: 'sd', today: TODAY, from: '2026-10-20', through: '2026-10-26' },
			{ typeId: 'sd', today: TODAY, from: '2026-10-21', through: '2026-10-26' }
		]);
		expect(screen.getByText('Assigned')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Assign all 6' }).getAttribute('aria-disabled')).toBe('false');
	});

	it('leaves out the weekends of a No duty roster and sends the rest to the duty planner', async () => {
		type = { ...staffDuty, weekendMode: 'none' };
		answerPreviews(() =>
			respond({
				picks: [
					pick('2026-10-20', 'p-adams', 4),
					pick('2026-10-21', 'p-baker', 4),
					pick('2026-10-22', 'p-adams', 5),
					pick('2026-10-26', 'p-baker', 5),
					pick('2026-10-27', 'p-adams', 6),
					pick('2026-10-28', 'p-baker', 6)
				],
				unfilled: ['2026-10-23']
			})
		);
		open(FORECAST.slice(1, 12));

		await waitFor(() =>
			expect(slotNames()).toEqual([
				'Tue 20: SPC Adams, Ana, swap',
				'Wed 21: SPC Baker, Ana, swap',
				'Thu 22: SPC Adams, Ana, swap',
				'Fri 23: Open, swap',
				'Mon 26: SPC Baker, Ana, swap',
				'Tue 27: SPC Adams, Ana, swap',
				'Wed 28: SPC Baker, Ana, swap'
			])
		);
		expect(previewBodies()).toEqual([{ typeId: 'sd', today: TODAY, from: '2026-10-20', through: '2026-10-28' }]);
		expect(screen.getByText('Nobody eligible is free')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Assign all 6' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Open duty planner for 2 more' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/assignments'
		);
	});

	it('for a Group-scoped operator reads no roster and suggests people available that day in name order', async () => {
		open(['2026-10-27', '2026-10-28'], false);

		expect(slotNames()).toEqual(['Tue 27: SPC Adams, Ana, swap', 'Wed 28: SPC Baker, Ana, swap']);
		expect(screen.getAllByText('Available')).toHaveLength(2);
		expect(screen.getByText(/in name order/)).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('shows the picker loading on the chosen day, and a failed load with Try again that keeps the day', async () => {
		answerPreviews();
		open(FORECAST.slice(1, 3));
		await waitFor(() => expect(slotNames()).toHaveLength(2));
		let fail!: (error: Error) => void;
		vi.mocked(loadDutyPicker).mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));

		const day = screen.getByRole('button', { name: 'Wed 21: SPC Baker, Ana, swap' });
		await fireEvent.click(day);
		expect(day.getAttribute('aria-busy')).toBe('true');
		fail(new Error('chunk failed'));

		expect((await screen.findByRole('alert')).textContent).toContain('The duty picker did not load');
		expect(day.getAttribute('aria-busy')).toBe('false');
		vi.mocked(loadDutyPicker).mockResolvedValueOnce({ default: DutyPickerTestDouble } as never);
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		expect(await screen.findByRole('dialog', { name: 'Duty picker for 21' })).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('reads the range again after the roster moved, so a day another operator filled leaves the list', async () => {
		answerPreviews();
		open(FORECAST.slice(1, 4));
		await waitFor(() => expect(slotNames()).toEqual(ROTATION_NAMES.slice(0, 3)));
		const rereads: string[] = [];
		fetchMock.mockImplementation((url: string, init?: RequestInit) => {
			if (url === FILL_URL) return respond({ message: 'The roster changed' }, 409);
			if (url.startsWith('/org/org-1/api/calendar-range?')) {
				rereads.push(url);
				return respond({
					rangeStart: '2026-10-20',
					rangeEnd: '2026-10-22',
					dailyAssignments: [duty('2026-10-22', 'p-adams')]
				});
			}
			if (url === PREVIEW_URL) {
				const { from, through } = JSON.parse(String(init?.body));
				return respond({ picks: ROTATION.picks.filter(({ date }) => date >= from && date <= through), unfilled: [] });
			}
			throw new Error(`unexpected fetch ${url}`);
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Assign all 3' }));

		await waitFor(() => expect(slotNames()).toEqual(ROTATION_NAMES.slice(0, 2)));
		expect(rereads).toEqual([
			'/org/org-1/api/calendar-range?rangeStart=2026-10-20&rangeEnd=2026-10-22&collections=assignments'
		]);
		await waitFor(() =>
			expect(previewBodies().at(-1)).toEqual({ typeId: 'sd', today: TODAY, from: '2026-10-20', through: '2026-10-21' })
		);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Assign all 2' })).toBeTruthy());
	});

	it('shows a failed re-read after the roster moved, and Try again re-reads the range before it plans again', async () => {
		answerPreviews();
		open(FORECAST.slice(1, 4));
		await waitFor(() => expect(slotNames()).toEqual(ROTATION_NAMES.slice(0, 3)));
		const calls: string[] = [];
		let rangeOnline = false;
		fetchMock.mockImplementation((url: string, init?: RequestInit) => {
			if (url === FILL_URL) return respond({ message: 'The roster changed' }, 409);
			if (url.startsWith('/org/org-1/api/calendar-range?')) {
				calls.push('reread');
				if (!rangeOnline) return respond({ message: 'down' }, 500);
				return respond({
					rangeStart: '2026-10-20',
					rangeEnd: '2026-10-22',
					dailyAssignments: [duty('2026-10-22', 'p-adams')]
				});
			}
			if (url === PREVIEW_URL) {
				calls.push('preview');
				const { from, through } = JSON.parse(String(init?.body));
				return respond({ picks: ROTATION.picks.filter(({ date }) => date >= from && date <= through), unfilled: [] });
			}
			throw new Error(`unexpected fetch ${url}`);
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Assign all 3' }));

		expect(await screen.findByText('Roster counts could not be loaded.')).toBeTruthy();
		expect(calls.at(-1)).toBe('reread');
		expect(screen.getByRole('button', { name: 'Assign all 0' }).getAttribute('aria-disabled')).toBe('true');

		calls.length = 0;
		rangeOnline = true;
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		await waitFor(() => expect(slotNames()).toEqual(ROTATION_NAMES.slice(0, 2)));
		expect(calls).toEqual(['reread', 'preview']);
		expect(screen.queryByText('Roster counts could not be loaded.')).toBeNull();
		expect(screen.getByRole('button', { name: 'Assign all 2' })).toBeTruthy();
	});

	describe('while a swap is saving', () => {
		async function startSwap(openDates: readonly string[]) {
			const calendar = await vi.importActual<typeof import('$features/calendar')>('$features/calendar');
			vi.mocked(loadDutyPicker).mockImplementationOnce(calendar.loadDutyPicker);
			answerPreviews();
			const panel = open(openDates);
			await waitFor(() => expect(slotNames().length).toBeGreaterThan(0));
			let settle!: (response: Response) => void;
			fetchMock.mockImplementation((url: string) => {
				if (url.startsWith('/org/org-1/api/duty-rosters/day?'))
					return respond({
						track: 'all',
						standing: [
							{ personId: 'p-adams', count: 4, effect: null },
							{ personId: 'p-baker', count: 3, effect: null }
						]
					});
				if (url === BATCH_URL) return new Promise<Response>((resolve) => (settle = resolve));
				if (url === PREVIEW_URL) return respond(ROTATION);
				throw new Error(`unexpected fetch ${url}`);
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Tue 20: SPC Adams, Ana, swap' }));
			await screen.findByRole('combobox', { name: 'Find person' });
			await fireEvent.click(await screen.findByRole('option', { name: 'SPC Baker, Ana, count 3' }));
			await waitFor(() => expect(settle).toBeTypeOf('function'));
			return { ...panel, settle: (response: Response) => settle(response) };
		}

		it('keeps Cancel and the duty planner link from leaving the panel, then lets go', async () => {
			const { close, settle } = await startSwap(FORECAST.slice(1, 11));

			const planner = screen.getByRole('link', { name: 'Open duty planner for 3 more' });
			expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
			expect(planner.getAttribute('aria-disabled')).toBe('true');
			expect(planner.getAttribute('href')).toBeNull();

			settle(new Response(JSON.stringify({ inserted: [duty('2026-10-20', 'p-baker')] })));

			await waitFor(() =>
				expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false)
			);
			expect(screen.getByRole('link', { name: 'Open duty planner for 3 more' }).getAttribute('href')).toBe(
				'/org/org-1/calendar/assignments'
			);
			expect(close).not.toHaveBeenCalled();
		});

		it('shows a failed swap in the panel', async () => {
			const { settle } = await startSwap(FORECAST.slice(1, 4));

			settle(new Response(JSON.stringify({ message: 'Swap refused' }), { status: 500 }));

			expect((await screen.findByRole('alert')).textContent).toContain('Swap refused');
		});

		it('toasts a failed swap once the panel has gone', async () => {
			const toast = vi.spyOn(toastStore, 'error').mockReturnValue(1);
			const { settle } = await startSwap(FORECAST.slice(1, 4));

			cleanup();
			settle(new Response(JSON.stringify({ message: 'Swap refused' }), { status: 500 }));

			await waitFor(() => expect(toast).toHaveBeenCalledWith('Swap refused'));
			toast.mockRestore();
		});
	});

	it('collapses on Cancel without saving', async () => {
		answerPreviews();
		const { close } = open(FORECAST.slice(1, 2));
		await waitFor(() => expect(slotNames()).toHaveLength(1));

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(close).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
