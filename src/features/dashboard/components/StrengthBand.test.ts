// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { buildStrengthBand } from '../read-model/strengthBand';
import BottomLine from './BottomLine.svelte';
import GroupStrength from './GroupStrength.svelte';

afterEach(cleanup);

const leave = { id: 'leave', name: 'Leave', color: '#aa0000', textColor: '#ffffff', sortOrder: 0 } as StatusType;

/** 42 people across seven groups of six; the first `out` are on Leave today. */
function band(out: number) {
	const groups = Array.from(
		{ length: 7 },
		(_, index) => ({ id: `g${index}`, name: `Group ${index}`, sortOrder: index }) as Group
	);
	const personnel = Array.from(
		{ length: 42 },
		(_, index) =>
			({
				id: `p${index}`,
				rank: 'SPC',
				firstName: 'Pat',
				lastName: `Last${index}`,
				groupId: `g${index % 7}`
			}) as Personnel
	);
	const availability = personnel.slice(0, out).map(
		(person) =>
			({
				id: `a-${person.id}`,
				personnelId: person.id,
				statusTypeId: 'leave',
				startDate: '2026-10-19',
				endDate: '2026-10-20'
			}) as AvailabilityEntry
	);
	return buildStrengthBand({
		today: '2026-10-19',
		forecastDays: ['2026-10-19', '2026-10-20'],
		personnel,
		availability,
		statusTypes: [leave],
		specialDays: [],
		groups,
		floorPercent: 80
	});
}

describe('BottomLine at counts scale', () => {
	it('folds origins past two groups and opens every name out today in place', async () => {
		const strength = band(3);
		render(BottomLine, { props: { line: strength.bottomLine, statusById: strength.statusById } });

		const rows = within(screen.getByRole('list', { name: 'Out today by status' })).getAllByRole('listitem');
		expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Leave 3 Group 0 1 · Group 1 1 · 1 more back 21 Oct'
		]);
		const toggle = screen.getByRole('button', { name: 'All 3 names' });
		const names = document.getElementById(toggle.getAttribute('aria-controls')!)!;
		expect([toggle.getAttribute('aria-expanded'), names.hidden]).toEqual(['false', true]);

		await fireEvent.click(toggle);

		expect([toggle.textContent?.trim(), toggle.getAttribute('aria-expanded'), names.hidden]).toEqual([
			'Fewer names',
			'true',
			false
		]);
		expect(names.textContent).toContain('SPC Last2, Pat');
	});
});

describe('GroupStrength at counts scale', () => {
	it('shows the lowest five of seven groups and unfolds the rest in place', async () => {
		render(GroupStrength, { props: { groups: band(3).groups, mode: 'counts' } });

		expect(screen.getByText('By group · lowest 5 of 7')).toBeTruthy();
		const list = screen.getByRole('list', { name: 'Available by group' });
		expect(within(list).getAllByRole('listitem')).toHaveLength(5);
		expect(list.textContent).toContain('Group 0');
		expect(list.textContent).not.toContain('Group 6');

		await fireEvent.click(screen.getByRole('button', { name: 'All 7 groups' }));

		expect(screen.getByText('By group · all 7 · lowest first')).toBeTruthy();
		expect(within(list).getAllByRole('listitem')).toHaveLength(7);
		expect(screen.getByRole('button', { name: 'Fewer groups' }).getAttribute('aria-expanded')).toBe('true');
	});
});
