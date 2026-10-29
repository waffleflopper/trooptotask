// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import CalendarReports from './CalendarReports.svelte';

const { exportGroupReadinessWorkbookMock } = vi.hoisted(() => ({ exportGroupReadinessWorkbookMock: vi.fn() }));

vi.mock('./calendarReportData', () => ({
	fetchCalendarReportData: vi.fn(async () => ({ entries: [] }))
}));
vi.mock('./calendarReportWorkbookExport', async (importOriginal) => ({
	...(await importOriginal<typeof import('./calendarReportWorkbookExport')>()),
	exportGroupReadinessWorkbook: exportGroupReadinessWorkbookMock
}));

const personnel: Personnel[] = [
	{
		id: 'alpha-1',
		firstName: 'Ann',
		lastName: 'Able',
		rank: 'SGT',
		groupId: 'alpha',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B'
	}
];

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function renderReports() {
	render(CalendarReports, {
		props: {
			orgId: 'org-1',
			personnel,
			statusTypes: [],
			groups: [{ id: 'alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }]
		}
	});
}

function toolbar(): HTMLElement {
	return screen.getByRole('toolbar', { name: 'Calendar report controls' });
}

async function openMore(): Promise<HTMLElement> {
	const more = within(toolbar()).getByRole('button', { name: 'More Calendar report controls' });
	more.focus();
	await fireEvent.keyDown(more, { key: 'Enter' });
	return screen.findByRole('menu');
}

async function chooseReport(name: string): Promise<void> {
	const reportType = within(await openMore()).getByRole('menuitem', { name: /^Report type, / });
	reportType.focus();
	await fireEvent.keyDown(reportType, { key: 'ArrowRight' });
	await fireEvent.click(await screen.findByRole('menuitemradio', { name }));
	await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

describe('CalendarReports', () => {
	it('shows the chosen report type and links back to Calendar', () => {
		renderReports();

		expect(within(toolbar()).getByRole('button', { name: 'Report type' }).textContent).toContain(
			'Status days by person'
		);
		expect(within(toolbar()).getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(screen.getByRole('region', { name: 'Status days by person report' })).toBeTruthy();
	});

	it('offers the report export in the toolbar only once a result exists, and runs it from More', async () => {
		const { layOut } = stubToolbarWidths();
		renderReports();
		await layOut(1);

		await chooseReport('Group availability by day');
		expect(screen.getByRole('region', { name: 'Group availability by day report' })).toBeTruthy();
		expect(within(await openMore()).queryByRole('menuitem', { name: 'Export group availability' })).toBeNull();
		await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

		await fireEvent.click(screen.getByRole('button', { name: 'Run group availability report' }));
		await screen.findByRole('table', { name: 'Group availability heat map' });
		await layOut(1);

		await fireEvent.click(within(await openMore()).getByRole('menuitem', { name: 'Export group availability' }));
		await waitFor(() => expect(exportGroupReadinessWorkbookMock).toHaveBeenCalledTimes(1));
		expect(
			screen.queryByRole('button', { name: 'Export group availability' }),
			'no second export in the table'
		).toBeNull();
	});
});
