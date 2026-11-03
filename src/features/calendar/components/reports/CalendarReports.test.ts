// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatusType } from '$features/calendar/contracts';
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
	{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#fff', shortLabel: null, rosterEffect: 'U', sortOrder: 0 }
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
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function renderReports(search: string) {
	pageMock.url = new URL(`http://localhost/org/org-1/calendar/reports${search}`);
	render(CalendarReports, { props: { orgId: 'org-1', orgUrlSegment: 'org-1', personnel, statusTypes, groups } });
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
	it('links each lens tab through the address, keeping the span', () => {
		renderReports('?start=2026-11-10&days=60');
		const tabs = within(screen.getByRole('navigation', { name: 'Report lenses' }));

		expect(tabs.getByRole('link', { name: 'Availability' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/reports?days=60&start=2026-11-10'
		);
		expect(tabs.getByRole('link', { name: 'Time away' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/reports?lens=time-away&days=60&start=2026-11-10'
		);
		expect(tabs.getByRole('link', { name: 'Assignment load' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/reports?lens=assignment-load&days=60&start=2026-11-10'
		);
	});

	it('shows the existing reports under Time away and Assignment load without loading the Availability feed', () => {
		renderReports('?lens=time-away');
		expect(screen.getByRole('region', { name: 'Status days by person report' })).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Away days by person report' })).toBeTruthy();
		expect(screen.queryByRole('navigation', { name: 'Report span' })).toBeNull();
		cleanup();

		renderReports('?lens=assignment-load');
		expect(screen.getByRole('region', { name: 'Assignment load by person report' })).toBeTruthy();
		expect(fetchDataMock).not.toHaveBeenCalled();
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
