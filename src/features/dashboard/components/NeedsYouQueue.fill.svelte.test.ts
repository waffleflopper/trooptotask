// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyAssignmentsStore } from '$features/calendar';
import type { AssignmentType, DailyAssignment } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import NeedsYouFillHarness from './needs-you/NeedsYouFillHarness.svelte';

const TODAY = '2026-10-19';
const FORECAST = Array.from({ length: 14 }, (_, index) => fromDayNumber(toDayNumber(TODAY) + index));
const OPEN = ['2026-10-27', '2026-10-28'];

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#b91c1c',
	poolRules: null,
	weekendMode: 'same',
	excusals: [],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, lastName: string): Personnel {
	return { id, rank: 'SPC', lastName, firstName: 'Ana', mos: '', clinicRole: '', groupId: null, groupName: '' };
}

function duty(date: string, assigneeId: string): DailyAssignment {
	return { id: `${assigneeId}-${date}`, date, assignmentTypeId: 'sd', assigneeId };
}

const model = {
	get inputs() {
		return {
			today: TODAY,
			timeZone: 'UTC',
			forecastDays: FORECAST,
			personnel: [person('p-adams', 'Adams'), person('p-baker', 'Baker')],
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

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const PREVIEW_URL = '/org/org-1/api/duty-rosters/fill/preview';
const RANGE_URL = '/org/org-1/api/calendar-range?';
const preview = (first: string, second: string) => ({
	picks: [
		{ date: OPEN[0], personId: first, count: 2, passedOver: [], returningFrom: null },
		{ date: OPEN[1], personId: second, count: 2, passedOver: [], returningFrom: null }
	],
	unfilled: []
});
const fetchMock = vi.fn();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	dailyAssignmentsStore.load(
		[staffDuty],
		FORECAST.filter((date) => !OPEN.includes(date)).map((date) => duty(date, 'p-cole')),
		'org-1'
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function answerPreviews(answer: () => Promise<Response>) {
	fetchMock.mockImplementation((url: string) => {
		if (url === PREVIEW_URL) return answer();
		if (url.startsWith(RANGE_URL)) return json({ rangeStart: OPEN[0], rangeEnd: OPEN[1], dailyAssignments: [] });
		return Promise.reject(new Error(`unexpected ${url}`));
	});
}

async function openFill() {
	answerPreviews(() => json(preview('p-adams', 'p-baker')));
	render(NeedsYouFillHarness, {
		props: {
			model,
			updates: { refreshSummary: vi.fn(), refreshTaskings: vi.fn(), retryTaskings: vi.fn(), putRecord: vi.fn() }
		}
	});
	await fireEvent.click(screen.getByRole('button', { name: 'Fill 2 days' }));
	const assignAll = await screen.findByRole('button', { name: 'Assign all 2' });
	await waitFor(() => expect(assignAll.getAttribute('aria-disabled')).toBe('false'));
	return assignAll;
}

describe('NeedsYouQueue Fill focus', () => {
	it('returns focus to Assign all when a fill that covered every open day fails and the row comes back', async () => {
		const assignAll = await openFill();
		fetchMock.mockReturnValueOnce(json({ message: 'Batch rejected' }, 400));

		assignAll.focus();
		await fireEvent.click(assignAll);

		expect((await screen.findByRole('alert')).textContent).toBe('Batch rejected');
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Assign all 2' })));
	});

	it('moves focus to the empty queue message when the fill succeeds and no row is left', async () => {
		const assignAll = await openFill();
		fetchMock.mockReturnValueOnce(json({ saved: [duty(OPEN[0], 'p-adams'), duty(OPEN[1], 'p-baker')] }));

		assignAll.focus();
		await fireEvent.click(assignAll);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Nothing needs you right now.')));
	});

	it('says the roster moved and shows the new picks from one more preview when the fill is refused', async () => {
		const assignAll = await openFill();
		fetchMock.mockReturnValueOnce(json({ message: 'The roster changed since this preview.' }, 409));
		answerPreviews(() => json(preview('p-baker', 'p-adams')));

		await fireEvent.click(assignAll);

		expect((await screen.findByRole('alert')).textContent).toBe(
			'The roster changed since this preview. Review the new picks and fill again.'
		);
		await waitFor(() =>
			expect(screen.getAllByRole('button', { name: /swap$/ }).map((day) => day.getAttribute('aria-label'))).toEqual([
				'Tue 27: SPC Baker, Ana, swap',
				'Wed 28: SPC Adams, Ana, swap'
			])
		);
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			PREVIEW_URL,
			'/org/org-1/api/duty-rosters/fill',
			`${RANGE_URL}rangeStart=${OPEN[0]}&rangeEnd=${OPEN[1]}&collections=assignments`,
			PREVIEW_URL
		]);
		expect(dailyAssignmentsStore.assignments.filter((assignment) => OPEN.includes(assignment.date))).toEqual([]);
	});
});
