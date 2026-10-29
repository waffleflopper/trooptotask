// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Group, Personnel } from '$features/personnel/contracts';
import AvailabilityForecast from './AvailabilityForecast.svelte';
import StatusDaysSummary from './StatusDaysSummary.svelte';

vi.mock('./calendarReportData', () => ({
	fetchCalendarReportData: vi.fn(async () => ({ entries: [] }))
}));

const groups: Group[] = [
	{ id: 'platoon', name: '2nd Platoon', sortOrder: 0, parentId: null, depth: 1 },
	{ id: 'squad', name: '1st Squad', sortOrder: 0, parentId: 'platoon', depth: 2 },
	{ id: 'team', name: 'Alpha Team', sortOrder: 0, parentId: 'squad', depth: 3 },
	{ id: 'other', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 }
];

const person = (id: string, lastName: string, groupId: string | null): Personnel => ({
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
	person('hq', 'Hale', 'platoon'),
	person('squad-1', 'Shaw', 'squad'),
	person('team-1', 'Toms', 'team'),
	person('other-1', 'Otis', 'other'),
	person('none-1', 'Nash', null)
];

afterEach(cleanup);

function optionNames(groupName: string): string[] {
	return within(screen.getByRole('group', { name: groupName }))
		.getAllByRole('checkbox')
		.map((box) => box.closest('label')?.textContent?.trim() ?? '');
}

function bodyCells(tableName: string): string[][] {
	return within(screen.getByRole('table', { name: tableName }))
		.getAllByRole('row')
		.slice(1)
		.map((row) =>
			within(row)
				.getAllByRole('cell')
				.map((cell) => cell.textContent?.trim() ?? '')
		);
}

describe('Calendar report Group filters', () => {
	it('offers top-level Groups in Status days, and a platoon pick covers its squads and teams', async () => {
		render(StatusDaysSummary, {
			props: {
				orgId: 'org-1',
				personnel,
				statusTypes: [
					{
						id: 'leave',
						name: 'Leave',
						color: '#000',
						textColor: '#fff',
						shortLabel: null,
						rosterEffect: 'U',
						sortOrder: 0
					}
				],
				groups
			}
		});

		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Filter personnel' }));
		const byGroup = await screen.findByRole('option', { name: 'By Group' });
		await fireEvent.pointerDown(byGroup);
		await fireEvent.pointerUp(byGroup);
		expect(optionNames('Select groups')).toEqual(['2nd Platoon', 'Bravo']);

		await fireEvent.click(within(screen.getByRole('group', { name: 'Select groups' })).getAllByRole('checkbox')[0]);
		await fireEvent.click(screen.getByRole('button', { name: 'Run status-day report' }));
		await screen.findByRole('table', { name: 'Status days by person' });

		expect(bodyCells('Status days by person').map((cells) => cells[1])).toEqual([
			'Hale, Pat',
			'Shaw, Pat',
			'Toms, Pat'
		]);
	});

	it('offers top-level Groups in Availability by day, and a platoon pick counts its squads and teams', async () => {
		render(AvailabilityForecast, { props: { orgId: 'org-1', personnel, statusTypes: [], groups } });

		expect(optionNames('Filter by group')).toEqual(['2nd Platoon', 'Bravo']);

		await fireEvent.click(within(screen.getByRole('group', { name: 'Filter by group' })).getAllByRole('checkbox')[1]);
		await fireEvent.click(screen.getByRole('button', { name: 'Run availability report' }));
		await screen.findByRole('table', { name: 'Availability by day' });

		const [, unavailable, available] = bodyCells('Availability by day')[0];
		expect([unavailable, available]).toEqual(['0', '3']);
	});
});
