// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyAssignmentsStore } from '$features/calendar';
import type { AssignmentType, DailyAssignment } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import DutyFillPanel from './DutyFillPanel.svelte';

const TODAY = '2026-10-19';
const FORECAST = Array.from({ length: 14 }, (_, index) => fromDayNumber(toDayNumber(TODAY) + index));

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#b91c1c',
	exemptPersonnelIds: ['p-exempt'],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, lastName: string): Personnel {
	return { id, rank: 'SPC', lastName, firstName: 'Ana', mos: '', clinicRole: '', groupId: null, groupName: '' };
}

const roster = [
	person('p-adams', 'Adams'),
	person('p-baker', 'Baker'),
	person('p-cole', 'Cole'),
	person('p-exempt', 'Able')
];

function duty(date: string, assigneeId: string): DailyAssignment {
	return { id: `${assigneeId}-${date}`, date, assignmentTypeId: 'sd', assigneeId };
}

/** Like the screen model, the inputs read the Calendar store live, so merged history shows up. */
const model = {
	get inputs() {
		return {
			today: TODAY,
			timeZone: 'UTC',
			forecastDays: FORECAST,
			personnel: roster,
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

function respond(body: unknown, status = 200) {
	return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function history(rows: DailyAssignment[]) {
	return { rangeStart: '', rangeEnd: '', availabilityEntries: [], specialDays: [], dailyAssignments: rows };
}

const fetchMock = vi.fn();

function open(openDates: readonly string[]) {
	dailyAssignmentsStore.load(
		[staffDuty],
		FORECAST.filter((date) => !openDates.includes(date)).map((date) => duty(date, 'p-cole')),
		'org-1'
	);
	const close = vi.fn();
	render(DutyFillPanel, {
		props: {
			model,
			access: { can: () => true },
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

function slotNames(): string[] {
	return within(screen.getByRole('list', { name: 'Days to fill' }))
		.getAllByRole('button')
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
	it('reads 90 days of history on open and suggests the longest idle person per day, never twice', async () => {
		fetchMock.mockReturnValueOnce(respond(history([duty('2026-09-26', 'p-baker')])));
		open(['2026-10-27', '2026-10-28']);

		expect(screen.getByRole('list', { name: 'Days to fill' }).getAttribute('aria-busy')).toBe('true');
		expect(fetchMock.mock.calls[0][0]).toBe(
			'/org/org-1/api/calendar-range?rangeStart=2026-07-29&rangeEnd=2026-10-28&collections=assignments'
		);

		await waitFor(() => expect(slotNames()).toHaveLength(2));
		expect(slotNames()).toEqual(['Tue 27: SPC Adams, Ana, swap', 'Wed 28: SPC Baker, Ana, swap']);
		expect(screen.getByText('no duty in 90d')).toBeTruthy();
		expect(screen.getByText('last duty 32d')).toBeTruthy();
	});

	it('assigns every suggested day in one batch request and leaves the store holding them', async () => {
		fetchMock.mockReturnValueOnce(respond(history([])));
		open(['2026-10-27', '2026-10-28']);
		await waitFor(() => expect(slotNames()).toHaveLength(2));

		fetchMock.mockReturnValueOnce(
			respond({ inserted: [duty('2026-10-27', 'p-adams'), duty('2026-10-28', 'p-baker')] })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Assign all 2' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		const [url, request] = fetchMock.mock.calls[1];
		expect(url).toBe('/org/org-1/api/daily-assignments/batch');
		expect(JSON.parse(request.body)).toEqual({
			records: [
				{ date: '2026-10-27', assignmentTypeId: 'sd', assigneeId: 'p-adams' },
				{ date: '2026-10-28', assignmentTypeId: 'sd', assigneeId: 'p-baker' }
			]
		});
		await waitFor(() =>
			expect(
				dailyAssignmentsStore.assignments
					.filter((assignment) => assignment.date >= '2026-10-27' && assignment.date <= '2026-10-28')
					.map((assignment) => assignment.assigneeId)
			).toEqual(['p-adams', 'p-baker'])
		);
	});

	it('shows a failed history read in the panel and reads again on Try again', async () => {
		fetchMock.mockReturnValueOnce(respond({ message: 'Calendar range unavailable' }, 503));
		open(['2026-10-27']);

		expect((await screen.findByRole('alert')).textContent).toContain('Duty history did not load');
		expect(screen.getByRole('button', { name: 'Assign all 1' }).getAttribute('aria-disabled')).toBe('true');
		// Without history the plan is unreliable, so no slot names or counts a suggestion.
		expect(slotNames()).toEqual(['Tue 27: not suggested, swap']);
		expect(screen.queryByText('SPC Adams, Ana')).toBeNull();
		expect(screen.getByText('History not loaded')).toBeTruthy();

		fetchMock.mockReturnValueOnce(respond(history([])));
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		await waitFor(() => expect(slotNames()).toEqual(['Tue 27: SPC Adams, Ana, swap']));
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('fills the first seven open days and sends the rest to the duty planner', async () => {
		fetchMock.mockReturnValueOnce(respond(history([])));
		const openDates = FORECAST.slice(1, 10);
		open(openDates);

		await waitFor(() => expect(slotNames()).toHaveLength(7));
		expect(screen.getByRole('link', { name: 'Open duty planner for 2 more' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/assignments'
		);
		expect(screen.getByRole('button', { name: 'Assign all 3' })).toBeTruthy();
		expect(screen.getAllByText('Everyone free has a day')).toHaveLength(4);
	});

	it('collapses on Cancel without saving', async () => {
		fetchMock.mockReturnValueOnce(respond(history([])));
		const { close } = open(['2026-10-27']);
		await waitFor(() => expect(slotNames()).toHaveLength(1));

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(close).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
