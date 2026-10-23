// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyAssignmentsStore, loadDutyPicker } from '$features/calendar';
import type { AssignmentType, DailyAssignment, RosterDay } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { PolicyResource } from '$lib/access/policyEvaluator';
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

const personnel = [
	person('p-adams', 'Adams'),
	person('p-baker', 'Baker'),
	person('p-cole', 'Cole'),
	person('p-dunn', 'Dunn'),
	person('p-exempt', 'Able')
];

function duty(date: string, assigneeId: string): DailyAssignment {
	return { id: `${assigneeId}-${date}`, date, assignmentTypeId: 'sd', assigneeId };
}

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
			assignmentTypes: [staffDuty],
			assignments: dailyAssignmentsStore.assignments,
			page: { orgId: 'org-1' }
		};
	}
} as unknown as DashboardScreenModel;

/** Cole is next up, then Baker, then Adams; Dunn is outside the pool. Each day the counts climb by one. */
function rosterOn(date: string): RosterDay {
	const climb = toDayNumber(date) - toDayNumber('2026-10-27');
	return {
		track: 'weekday',
		standing: [
			{ personId: 'p-cole', count: 14 + climb, effect: null },
			{ personId: 'p-baker', count: 9 + climb, effect: null },
			{ personId: 'p-adams', count: 3 + climb, effect: null }
		]
	};
}

const rosterDayUrl = (date: string) => `/org/org-1/api/duty-rosters/day?typeId=sd&date=${date}&today=${TODAY}`;

function respond(body: unknown, status = 200) {
	return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const fetchMock = vi.fn();

/** Answers every roster day read from `rosterOn` unless a test overrides it. */
function answerRosterDays(answer: (date: string) => Promise<Response> = (date) => respond(rosterOn(date))) {
	fetchMock.mockImplementation((url: string) => {
		const date = new URL(url, 'http://test').searchParams.get('date');
		if (url.startsWith('/org/org-1/api/duty-rosters/day') && date) return answer(date);
		throw new Error(`unexpected fetch ${url}`);
	});
}

function open(openDates: readonly string[], organizationWide = true) {
	dailyAssignmentsStore.load(
		[staffDuty],
		FORECAST.filter((date) => !openDates.includes(date)).map((date) => duty(date, 'p-cole')),
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
			updates: { refreshSummary: vi.fn(), putRecord: vi.fn() },
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

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('DutyFillPanel', () => {
	it("shows skeletons while each open day's roster loads, then suggests the roster's next up per day, never twice", async () => {
		const held: (() => void)[] = [];
		answerRosterDays(
			(date) => new Promise((resolve) => held.push(() => resolve(new Response(JSON.stringify(rosterOn(date))))))
		);
		open(['2026-10-27', '2026-10-28']);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([rosterDayUrl('2026-10-27'), rosterDayUrl('2026-10-28')]);
		expect(daysToFill().getAttribute('aria-busy')).toBe('true');
		expect(slotNames()).toEqual([]);
		expect(screen.getByRole('button', { name: 'Assign all 0' }).getAttribute('aria-disabled')).toBe('true');

		held.forEach((release) => release());

		await waitFor(() => expect(slotNames()).toEqual(['Tue 27: SPC Cole, Ana, swap', 'Wed 28: SPC Baker, Ana, swap']));
		expect(daysToFill().getAttribute('aria-busy')).toBe('false');
		expect(screen.getByText('count 14')).toBeTruthy();
		expect(screen.getByText('count 10')).toBeTruthy();
		expect(screen.getByText(/next up on the roster/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Assign all 2' }).getAttribute('aria-disabled')).toBe('false');
	});

	it('assigns every suggested day in one batch request and leaves the store holding them', async () => {
		answerRosterDays();
		open(['2026-10-27', '2026-10-28']);
		await waitFor(() => expect(slotNames()).toHaveLength(2));

		fetchMock.mockReturnValueOnce(respond({ inserted: [duty('2026-10-27', 'p-cole'), duty('2026-10-28', 'p-baker')] }));
		await fireEvent.click(screen.getByRole('button', { name: 'Assign all 2' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		const [url, request] = fetchMock.mock.calls[2];
		expect(url).toBe('/org/org-1/api/daily-assignments/batch');
		expect(JSON.parse(request.body)).toEqual({
			records: [
				{ date: '2026-10-27', assignmentTypeId: 'sd', assigneeId: 'p-cole' },
				{ date: '2026-10-28', assignmentTypeId: 'sd', assigneeId: 'p-baker' }
			]
		});
		await waitFor(() =>
			expect(
				dailyAssignmentsStore.assignments
					.filter((assignment) => assignment.date >= '2026-10-27' && assignment.date <= '2026-10-28')
					.map((assignment) => assignment.assigneeId)
			).toEqual(['p-cole', 'p-baker'])
		);
	});

	it('shows a failed roster read in the panel, suggests nobody, and reads again on Try again', async () => {
		answerRosterDays(() => respond({ message: 'Roster unavailable' }, 503));
		open(['2026-10-27']);

		expect((await screen.findByRole('alert')).textContent).toContain('Roster counts could not be loaded');
		expect(screen.getByRole('button', { name: 'Assign all 0' }).getAttribute('aria-disabled')).toBe('true');
		expect(slotNames()).toEqual(['Tue 27: not suggested, swap']);
		expect(screen.getByText('Count unavailable')).toBeTruthy();

		answerRosterDays();
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		await waitFor(() => expect(slotNames()).toEqual(['Tue 27: SPC Cole, Ana, swap']));
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('fills the first seven open days and sends the rest to the duty planner', async () => {
		answerRosterDays();
		open(FORECAST.slice(1, 10));

		await waitFor(() => expect(screen.getByRole('button', { name: 'Assign all 3' })).toBeTruthy());
		expect(fetchMock).toHaveBeenCalledTimes(7);
		expect(slotNames().slice(0, 3)).toEqual([
			'Tue 20: SPC Cole, Ana, swap',
			'Wed 21: SPC Baker, Ana, swap',
			'Thu 22: SPC Adams, Ana, swap'
		]);
		expect(screen.getByRole('link', { name: 'Open duty planner for 2 more' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/assignments'
		);
		expect(screen.getAllByText('Everyone free has a day')).toHaveLength(4);
	});

	it('finds someone off the roster only by name in the swap picker and keeps them as the pick', async () => {
		const calendar = await vi.importActual<typeof import('$features/calendar')>('$features/calendar');
		vi.mocked(loadDutyPicker).mockImplementationOnce(calendar.loadDutyPicker);
		answerRosterDays();
		open(['2026-10-27']);
		await waitFor(() => expect(slotNames()).toHaveLength(1));

		await fireEvent.click(screen.getByRole('button', { name: 'Tue 27: SPC Cole, Ana, swap' }));
		const search = await screen.findByRole('combobox', { name: 'Find person' });
		expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
			'SPC Cole, Ana, count 14, assigned',
			'SPC Baker, Ana, count 9',
			'SPC Adams, Ana, count 3'
		]);

		await fireEvent.input(search, { target: { value: 'dunn' } });
		await fireEvent.click(await screen.findByRole('option', { name: 'SPC Dunn, Ana, not on this roster' }));

		await waitFor(() => expect(slotNames()).toEqual(['Tue 27: SPC Dunn, Ana, swap']));
		expect(screen.getByText('Not on this roster')).toBeTruthy();
		expect(screen.getByText('Selected')).toBeTruthy();
	});

	it('for a Group-scoped operator reads no roster and suggests people available that day in name order', async () => {
		open(['2026-10-27', '2026-10-28'], false);

		expect(slotNames()).toEqual(['Tue 27: SPC Adams, Ana, swap', 'Wed 28: SPC Baker, Ana, swap']);
		expect(screen.getAllByText('Available')).toHaveLength(2);
		expect(screen.getByText(/in name order/)).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('shows the picker loading on the chosen day, and a failed load with Try again that keeps the day', async () => {
		answerRosterDays();
		open(['2026-10-27', '2026-10-28']);
		await waitFor(() => expect(slotNames()).toHaveLength(2));
		let fail!: (error: Error) => void;
		vi.mocked(loadDutyPicker).mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));

		const day = screen.getByRole('button', { name: 'Wed 28: SPC Baker, Ana, swap' });
		await fireEvent.click(day);
		expect(day.getAttribute('aria-busy')).toBe('true');
		fail(new Error('chunk failed'));

		expect((await screen.findByRole('alert')).textContent).toContain('The duty picker did not load');
		expect(day.getAttribute('aria-busy')).toBe('false');
		vi.mocked(loadDutyPicker).mockResolvedValueOnce({ default: DutyPickerTestDouble } as never);
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		expect(await screen.findByRole('dialog', { name: 'Duty picker for 28' })).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('collapses on Cancel without saving', async () => {
		answerRosterDays();
		const { close } = open(['2026-10-27']);
		await waitFor(() => expect(slotNames()).toHaveLength(1));

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(close).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
