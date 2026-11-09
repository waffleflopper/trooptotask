// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssignmentType, DailyAssignment, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import {
	openToolbarMore,
	openToolbarSubmenu,
	stubToolbarWidths,
	type ToolbarWidths
} from '$lib/test-support/toolbarWidths';
import CalendarReports from './CalendarReports.svelte';

const { pageMock, fetchDataMock } = vi.hoisted(() => ({
	pageMock: { url: new URL('http://localhost/org/org-1/calendar/reports'), shallow: undefined },
	fetchDataMock: vi.fn()
}));

vi.mock('$app/state', () => ({ page: pageMock }));
vi.mock('./calendarReportData', () => ({ fetchCalendarReportData: fetchDataMock }));

const groups: Group[] = [
	{ id: 'alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 },
	{ id: 'bravo', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 }
];

const person = (id: string, lastName: string, groupId: string): Personnel => ({
	id,
	firstName: 'Pat',
	lastName,
	rank: 'SGT',
	groupId,
	groupName: '',
	clinicRole: '',
	mos: '11B'
});

const personnel = [
	person('a1', 'Able', 'alpha'),
	person('a2', 'Adams', 'alpha'),
	person('a3', 'Avery', 'alpha'),
	person('b1', 'Baker', 'bravo'),
	person('b2', 'Bell', 'bravo')
];

const statusTypes: StatusType[] = [
	{
		id: 'leave',
		name: 'Leave',
		color: '#48bb78',
		textColor: '#fff',
		shortLabel: null,
		rosterEffect: 'U',
		sortOrder: 0,
		archivedAt: null
	}
];

// Two of Alpha's three are on leave on 4 Nov, so that day holds 3 of 5 here.
const entries = [
	{ id: 'e1', personnelId: 'a1', statusTypeId: 'leave', startDate: '2026-11-04', endDate: '2026-11-04' },
	{ id: 'e2', personnelId: 'a2', statusTypeId: 'leave', startDate: '2026-11-04', endDate: '2026-11-04' }
];

let widths: ToolbarWidths;

beforeEach(() => {
	widths = stubToolbarWidths();
	fetchDataMock.mockResolvedValue({ entries });
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function renderReports(search: string) {
	pageMock.url = new URL(`http://localhost/org/org-1/calendar/reports${search}`);
	render(CalendarReports, {
		props: { orgId: 'org-1', orgUrlSegment: 'org-1', personnel, statusTypes, groups, rankCatalog: [] }
	});
}

describe('CalendarReports Availability lens', () => {
	it('reads the span from the address, fetches it once and leads with the lowest day', async () => {
		renderReports('?start=2026-11-03&days=14');

		const bottomLine = within(await screen.findByRole('region', { name: 'Bottom line' }));
		expect(await bottomLine.findByText('3 of 5 here')).toBeTruthy();
		expect(bottomLine.getByText('60%')).toBeTruthy();
		expect(fetchDataMock).toHaveBeenCalledTimes(1);
		expect(fetchDataMock).toHaveBeenCalledWith('org-1', '2026-11-03', '2026-11-16', expect.any(AbortSignal));
		expect(
			within(screen.getByRole('navigation', { name: 'Report span' }))
				.getByRole('link', { name: '14 D' })
				.getAttribute('aria-current')
		).toBe('page');
	});

	it('recomputes for a Group filter without fetching again', async () => {
		renderReports('?start=2026-11-03&days=14');
		await screen.findByText('3 of 5 here');
		await widths.foldAll();

		await openToolbarMore('Calendar report controls');
		await openToolbarSubmenu('Group, 2 selected');
		const bravo = await screen.findByRole('menuitemcheckbox', { name: 'Bravo' });
		bravo.focus();
		await fireEvent.keyDown(bravo, { key: ' ' });

		expect(await screen.findByText('1 of 3 here')).toBeTruthy();
		expect(fetchDataMock).toHaveBeenCalledTimes(1);
	});

	it('lists who is out on the lowest day, then follows a day picked in the chart', async () => {
		renderReports('?start=2026-11-03&days=14');
		await screen.findByText('3 of 5 here');

		const away = screen.getByRole('list', { name: 'People away, by status' });
		expect(away.textContent).toContain('Able');
		expect(away.textContent).toContain('Adams');

		await fireEvent.click(screen.getByRole('button', { name: /^Tue 3 Nov: 5 of 5 here/ }));

		expect(screen.queryByRole('list', { name: 'People away, by status' })).toBeNull();
	});

	it('shows the load error with a retry that fetches again', async () => {
		fetchDataMock.mockRejectedValueOnce(new Error('Calendar service is down'));
		renderReports('?start=2026-11-03&days=14');

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Calendar service is down');

		await fireEvent.click(within(alert).getByRole('button', { name: /retry/i }));

		expect(await screen.findByText('3 of 5 here')).toBeTruthy();
		expect(fetchDataMock).toHaveBeenCalledTimes(2);
	});
});

describe('CalendarReports lenses', () => {
	it('links each lens tab through the address, and a lens that looks back opens on its own default span', () => {
		renderReports('?start=2026-11-10&days=60');
		const tabs = within(screen.getByRole('navigation', { name: 'Report lenses' }));

		expect(tabs.getByRole('link', { name: 'Availability' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/reports?days=60&start=2026-11-10'
		);
		expect(tabs.getByRole('link', { name: 'Time away' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/reports?lens=time-away'
		);
		expect(tabs.getByRole('link', { name: 'Assignment load' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/reports?lens=assignment-load'
		);
	});

	it('links back to Calendar', () => {
		renderReports('?start=2026-11-03');
		expect(
			within(screen.getByRole('toolbar', { name: 'Calendar report controls' }))
				.getByRole('link', { name: 'Back to calendar' })
				.getAttribute('href')
		).toBe('/org/org-1/calendar');
	});
});

// Alpha's Able is on leave 4 Nov, Adams 4 to 6 Nov and out again 1 Dec; Bravo is never away.
const timeAwayEntries = [
	{ id: 'e1', personnelId: 'a1', statusTypeId: 'leave', startDate: '2026-11-04', endDate: '2026-11-04' },
	{ id: 'e2', personnelId: 'a2', statusTypeId: 'leave', startDate: '2026-11-04', endDate: '2026-11-06' },
	{ id: 'e3', personnelId: 'a2', statusTypeId: 'leave', startDate: '2026-12-01', endDate: '2026-12-02' }
];

function peopleOrder(): string[] {
	return within(screen.getByRole('list', { name: 'Days away by person' }))
		.getAllByRole('listitem')
		.map((row) => row.querySelector('p')?.textContent?.trim() ?? '');
}

describe('CalendarReports Time away lens', () => {
	beforeEach(() => {
		fetchDataMock.mockResolvedValue({ entries: timeAwayEntries });
	});

	it('fetches the span and the days after it in one request and leads with the share of person-days away', async () => {
		renderReports('?lens=time-away&start=2026-11-03&days=14');

		const bottomLine = within(await screen.findByRole('region', { name: 'Bottom line' }));
		expect(await bottomLine.findByText('4 of 70 person-days')).toBeTruthy();
		expect(bottomLine.getByText('6%')).toBeTruthy();
		expect(fetchDataMock).toHaveBeenCalledTimes(1);
		expect(fetchDataMock).toHaveBeenCalledWith('org-1', '2026-11-03', '2027-01-15', expect.any(AbortSignal));
	});

	it('defaults to 90 days ending yesterday, and offers no later span from there', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 10, 3, 12));
		renderReports('?lens=time-away');

		await screen.findByRole('region', { name: 'Bottom line' });
		expect(fetchDataMock).toHaveBeenCalledWith('org-1', '2026-08-05', '2027-01-01', expect.any(AbortSignal));
		const spans = within(screen.getByRole('navigation', { name: 'Report span' }));
		expect(spans.getByRole('link', { name: '90 D' }).getAttribute('aria-current')).toBe('page');
		expect(spans.getByRole('link', { name: '30 D' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/reports?lens=time-away&days=30'
		);
		expect(screen.getByRole('link', { name: 'Previous 90 days' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/reports?lens=time-away&start=2026-05-07'
		);
		expect(screen.getByRole('button', { name: 'Next 90 days' }).getAttribute('aria-disabled')).toBe('true');
	});

	it('lengthens an earlier span backward from its last day instead of into the days to come', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 10, 3, 12));
		renderReports('?lens=time-away&days=14&start=2026-10-06');

		await screen.findByRole('region', { name: 'Bottom line' });
		const spans = within(screen.getByRole('navigation', { name: 'Report span' }));
		expect(spans.getByRole('link', { name: '90 D' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/reports?lens=time-away&start=2026-07-22'
		);
	});

	it('recomputes for a Group filter without fetching again', async () => {
		renderReports('?lens=time-away&start=2026-11-03&days=14');
		await screen.findByText('4 of 70 person-days');
		await widths.foldAll();

		await openToolbarMore('Calendar report controls');
		await openToolbarSubmenu('Group, 2 selected');
		const bravo = await screen.findByRole('menuitemcheckbox', { name: 'Bravo' });
		bravo.focus();
		await fireEvent.keyDown(bravo, { key: ' ' });

		expect(await screen.findByText('4 of 42 person-days')).toBeTruthy();
		expect(fetchDataMock).toHaveBeenCalledTimes(1);
	});

	it('keeps every Group row, at zero, when nobody was away in the span', async () => {
		fetchDataMock.mockResolvedValue({ entries: [] });
		renderReports('?lens=time-away&start=2026-11-03&days=14');

		const byGroup = await screen.findByRole('list', { name: 'Days away per person, by group' });
		expect(
			within(byGroup)
				.getAllByRole('listitem')
				.map((row) => row.querySelector('p')?.textContent)
		).toEqual(['Alpha', 'Bravo']);
	});

	it('ranks people by days away with the next time out, and reverses for least away', async () => {
		renderReports('?lens=time-away&start=2026-11-03&days=14');
		await screen.findByText('4 of 70 person-days');

		expect(peopleOrder()).toEqual(['SGT Adams', 'SGT Able', 'SGT Avery', 'SGT Baker', 'SGT Bell']);
		const adams = screen.getAllByRole('listitem').find((row) => row.textContent?.includes('SGT Adams'));
		expect(adams?.textContent).toContain('Leave · 1 Dec');

		await fireEvent.click(screen.getByRole('radio', { name: 'Least away' }));

		expect(peopleOrder()).toEqual(['SGT Avery', 'SGT Baker', 'SGT Bell', 'SGT Able', 'SGT Adams']);
	});

	it('shows the load error with a retry that fetches again', async () => {
		fetchDataMock.mockRejectedValueOnce(new Error('Calendar service is down'));
		renderReports('?lens=time-away&start=2026-11-03&days=14');

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Calendar service is down');

		await fireEvent.click(within(alert).getByRole('button', { name: /retry/i }));

		expect(await screen.findByText('4 of 70 person-days')).toBeTruthy();
		expect(fetchDataMock).toHaveBeenCalledTimes(2);
	});
});

const cq: AssignmentType = {
	id: 'cq',
	name: 'CQ',
	shortName: 'CQ',
	assignTo: 'personnel',
	color: '#2563eb',
	poolRules: null,
	weekendMode: 'same',
	excusals: [],
	showOnCalendar: true,
	sortOrder: 0
};
const duty = (date: string, assigneeId: string): DailyAssignment => ({
	id: `${date}-${assigneeId}`,
	date,
	assignmentTypeId: 'cq',
	assigneeId
});

// Four CQ days for five people; Able and Adams are on leave 4 Nov. Fair shares: Able and Adams 0.6, the rest 14/15.
// Able drew 3 (+2.4), Baker 1 (+0.1), Adams nothing (-0.6), Avery and Bell nothing (-0.9 each).
const loadData = {
	entries,
	assignmentTypes: [cq],
	assignments: [duty('2026-11-03', 'a1'), duty('2026-11-04', 'a1'), duty('2026-11-05', 'b1'), duty('2026-11-06', 'a1')]
};

const personRows = () =>
	within(screen.getByRole('list', { name: 'Duties against fair share by person' }))
		.getAllByRole('listitem')
		.map((row) => row.querySelector('p')?.textContent?.trim() ?? '');

describe('CalendarReports Assignment load lens', () => {
	beforeEach(() => {
		fetchDataMock.mockResolvedValue(loadData);
	});

	it('fetches the span once and shows each person against the share the days they were here earn', async () => {
		renderReports('?lens=assignment-load&start=2026-11-03&days=14');

		const people = within(await screen.findByRole('list', { name: 'Duties against fair share by person' }));
		const able = people.getAllByRole('listitem')[0];
		expect(able.textContent).toContain('SGT Able');
		expect(able.textContent).toContain('+2.4');
		expect(able.textContent).toContain('0.6');
		expect(fetchDataMock).toHaveBeenCalledTimes(1);
		expect(fetchDataMock).toHaveBeenCalledWith('org-1', '2026-11-03', '2026-11-16', expect.any(AbortSignal));
	});

	it('orders by who is furthest over, and reverses for most under', async () => {
		renderReports('?lens=assignment-load&start=2026-11-03&days=14');
		await screen.findByRole('list', { name: 'Duties against fair share by person' });

		expect(personRows()).toEqual(['SGT Able', 'SGT Baker', 'SGT Adams', 'SGT Avery', 'SGT Bell']);

		await fireEvent.click(screen.getByRole('radio', { name: 'Most under' }));

		expect(personRows()).toEqual(['SGT Avery', 'SGT Bell', 'SGT Adams', 'SGT Baker', 'SGT Able']);
	});

	it('recomputes for a Group filter without fetching again, keeping fair share against everyone', async () => {
		renderReports('?lens=assignment-load&start=2026-11-03&days=14');
		await screen.findByRole('list', { name: 'Duties against fair share by person' });
		await widths.foldAll();

		await openToolbarMore('Calendar report controls');
		await openToolbarSubmenu('Group, 2 selected');
		const alpha = await screen.findByRole('menuitemcheckbox', { name: 'Alpha' });
		alpha.focus();
		await fireEvent.keyDown(alpha, { key: ' ' });

		await vi.waitFor(() => expect(personRows()).toEqual(['SGT Baker', 'SGT Bell']));
		const baker = screen.getAllByRole('listitem').find((row) => row.textContent?.includes('SGT Baker'));
		expect(baker?.textContent).toContain('+0.1');
		expect(fetchDataMock).toHaveBeenCalledTimes(1);
	});

	it('says so when the Organization assigns no duties to people', async () => {
		fetchDataMock.mockResolvedValue({ entries, assignmentTypes: [], assignments: [] });
		renderReports('?lens=assignment-load&start=2026-11-03&days=14');

		expect(await screen.findByRole('heading', { level: 2, name: /No duties were assigned/ })).toBeTruthy();
		expect(screen.queryByRole('region', { name: 'Bottom line' })).toBeNull();
	});

	it('shows the load error with a retry that fetches again', async () => {
		fetchDataMock.mockRejectedValueOnce(new Error('Calendar service is down'));
		renderReports('?lens=assignment-load&start=2026-11-03&days=14');

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Calendar service is down');

		await fireEvent.click(within(alert).getByRole('button', { name: /retry/i }));

		expect(await screen.findByRole('list', { name: 'Duties against fair share by person' })).toBeTruthy();
		expect(fetchDataMock).toHaveBeenCalledTimes(2);
	});
});
