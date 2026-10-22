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
	exemptPersonnelIds: [],
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
const rangeRead = { rangeStart: '', rangeEnd: '', availabilityEntries: [], specialDays: [], dailyAssignments: [] };
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

async function openFill() {
	fetchMock.mockReturnValueOnce(json(rangeRead));
	render(NeedsYouFillHarness, { props: { model, updates: { refreshSummary: vi.fn(), putRecord: vi.fn() } } });
	await fireEvent.click(screen.getByRole('button', { name: 'Fill 2 days' }));
	const assignAll = await screen.findByRole('button', { name: 'Assign all 2' });
	await waitFor(() => expect(assignAll.getAttribute('aria-disabled')).toBe('false'));
	return assignAll;
}

describe('NeedsYouQueue Fill focus', () => {
	it('returns focus to Assign all when a batch that filled every open day fails and the row comes back', async () => {
		const assignAll = await openFill();
		fetchMock.mockReturnValueOnce(json({ message: 'Batch rejected' }, 400));

		assignAll.focus();
		await fireEvent.click(assignAll);

		expect((await screen.findByRole('alert')).textContent).toBe('Batch rejected');
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Assign all 2' })));
	});

	it('moves focus to the empty queue message when the batch succeeds and no row is left', async () => {
		const assignAll = await openFill();
		fetchMock.mockReturnValueOnce(json({ inserted: OPEN.map((date) => duty(date, 'p-adams')) }));

		assignAll.focus();
		await fireEvent.click(assignAll);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Nothing needs you right now.')));
	});
});
