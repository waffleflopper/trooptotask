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

/** `size` people spread across seven groups; the first `out` are on Leave today. */
function band(out: number, size = 42) {
	const groups = Array.from(
		{ length: 7 },
		(_, index) => ({ id: `g${index}`, name: `Group ${index}`, sortOrder: index }) as Group
	);
	const personnel = Array.from(
		{ length: size },
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
	it('keeps every name out today behind a disclosure that opens in place', async () => {
		const strength = band(3);
		render(BottomLine, { props: { line: strength.bottomLine, statusById: strength.statusById } });

		const toggle = screen.getByRole('button', { expanded: false });
		expect(screen.queryByRole('list', { name: 'Everyone out today' })).toBeNull();

		await fireEvent.click(toggle);

		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		const names = screen.getByRole('list', { name: 'Everyone out today' });
		expect(within(names).getByText('SPC Last2, Pat')).toBeTruthy();
	});
});

describe.each(['people', 'counts'] as const)('GroupStrength at %s scale', (mode) => {
	it('lists the lowest groups first and reaches the rest through the disclosure', async () => {
		render(GroupStrength, { props: { groups: band(3, mode === 'people' ? 21 : 42).groups, mode } });

		const list = screen.getByRole('list', { name: 'Available by group' });
		expect(within(list).getByText('Group 0')).toBeTruthy();
		expect(within(list).queryByText('Group 6')).toBeNull();

		const toggle = screen.getByRole('button', { expanded: false });
		await fireEvent.click(toggle);

		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(within(list).getByText('Group 6')).toBeTruthy();
	});
});
