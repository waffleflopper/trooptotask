// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { fetchCalendarReportData } from './calendarReportData';
import GroupReadiness from './GroupReadiness.svelte';

vi.mock('./calendarReportData', () => ({
	fetchCalendarReportData: vi.fn(async () => ({
		entries: [
			{ id: 'entry-1', personnelId: 'bravo-1', statusTypeId: 'leave', startDate: '2000-01-01', endDate: '2100-12-31' }
		]
	}))
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
	},
	{
		id: 'bravo-1',
		firstName: 'Ben',
		lastName: 'Baker',
		rank: 'SPC',
		groupId: 'bravo',
		groupName: 'Bravo',
		clinicRole: '',
		mos: '11B'
	}
];

afterEach(cleanup);

function rowOrder(): string[] {
	const table = screen.getByRole('table', { name: 'Group availability heat map' });
	return within(table)
		.getAllByRole('row')
		.slice(1)
		.map((row) => within(row).getAllByRole('cell')[0].textContent?.trim() ?? '');
}

function sortState(): string[] {
	return ['Sort by group', 'Sort by lowest availability'].map(
		(name) => screen.getByRole('button', { name }).closest('th')?.getAttribute('aria-sort') ?? 'none'
	);
}

describe('GroupReadiness', () => {
	it('lists the least available group first and sorts by group or lowest availability in both directions', async () => {
		render(GroupReadiness, {
			props: {
				orgId: 'org-1',
				personnel,
				statusTypes: [],
				groups: [
					{ id: 'alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const },
					{ id: 'bravo', name: 'Bravo', sortOrder: 0, parentId: null, depth: 1 as const }
				]
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Run group availability report' }));
		await screen.findByRole('table', { name: 'Group availability heat map' });

		expect(rowOrder()).toEqual(['Bravo', 'Alpha']);
		expect(sortState()).toEqual(['none', 'ascending']);
		expect(screen.getAllByText('0/1').length).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('button', { name: 'Sort by group' }));
		expect(rowOrder()).toEqual(['Alpha', 'Bravo']);
		expect(sortState()).toEqual(['ascending', 'none']);

		await fireEvent.click(screen.getByRole('button', { name: 'Sort by group' }));
		expect(rowOrder()).toEqual(['Bravo', 'Alpha']);
		expect(sortState()).toEqual(['descending', 'none']);

		await fireEvent.click(screen.getByRole('button', { name: 'Sort by lowest availability' }));
		expect(rowOrder()).toEqual(['Bravo', 'Alpha']);
		expect(sortState()).toEqual(['none', 'ascending']);

		await fireEvent.click(screen.getByRole('button', { name: 'Sort by lowest availability' }));
		expect(rowOrder()).toEqual(['Alpha', 'Bravo']);
		expect(sortState()).toEqual(['none', 'descending']);
	});

	it('ranks 159 of 200 below 4 of 5 although both read 80%', async () => {
		const people = (groupId: string, count: number): Personnel[] =>
			Array.from({ length: count }, (_, index) => ({
				...personnel[0],
				id: `${groupId}-${index}`,
				groupId,
				groupName: groupId
			}));
		const away = (ids: string[]) =>
			ids.map((personnelId) => ({
				id: `leave-${personnelId}`,
				personnelId,
				statusTypeId: 'leave',
				startDate: '2000-01-01',
				endDate: '2100-12-31'
			}));
		const alpha = people('alpha', 5);
		const bravo = people('bravo', 200);
		vi.mocked(fetchCalendarReportData).mockResolvedValueOnce({
			entries: away([alpha[0].id, ...bravo.slice(0, 41).map((person) => person.id)])
		} as Awaited<ReturnType<typeof fetchCalendarReportData>>);
		render(GroupReadiness, {
			props: {
				orgId: 'org-1',
				personnel: [...alpha, ...bravo],
				statusTypes: [],
				groups: [
					{ id: 'alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const },
					{ id: 'bravo', name: 'Bravo', sortOrder: 0, parentId: null, depth: 1 as const }
				]
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Run group availability report' }));
		await screen.findByRole('table', { name: 'Group availability heat map' });

		expect(rowOrder()).toEqual(['Bravo', 'Alpha']);
	});

	it('averages availability over people, so 1 of 100 available reads 1% however the Groups split', async () => {
		const platoon = Array.from({ length: 99 }, (_, index) => ({
			...personnel[0],
			id: `platoon-${index}`,
			groupId: 'platoon'
		}));
		vi.mocked(fetchCalendarReportData).mockResolvedValueOnce({
			entries: platoon.map((person) => ({
				id: `leave-${person.id}`,
				personnelId: person.id,
				statusTypeId: 'leave',
				startDate: '2000-01-01',
				endDate: '2100-12-31'
			}))
		} as Awaited<ReturnType<typeof fetchCalendarReportData>>);
		render(GroupReadiness, {
			props: {
				orgId: 'org-1',
				personnel: [...platoon, personnel[0]],
				statusTypes: [],
				groups: [
					{ id: 'platoon', name: '2nd Platoon', sortOrder: 0, parentId: null, depth: 1 as const },
					{ id: 'alpha', name: 'Alpha', sortOrder: 1, parentId: null, depth: 1 as const }
				]
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Run group availability report' }));
		const summary = await screen.findByLabelText('Report summary');
		const average = within(summary)
			.getAllByRole('listitem')
			.map((item) => item.textContent ?? '')
			.find((finding) => finding.includes('average'));

		expect(average?.match(/\d+%/)?.[0]).toBe('1%');
	});
});
