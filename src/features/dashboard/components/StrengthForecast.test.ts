// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import { buildStrengthBand } from '../read-model/strengthBand';
import StrengthForecast from './StrengthForecast.svelte';

afterEach(cleanup);

const leave = { id: 'leave', name: 'Leave', color: '#aa0000', textColor: '#ffffff', sortOrder: 0 } as StatusType;

function forecast() {
	const personnel = Array.from(
		{ length: 22 },
		(_, index) =>
			({ id: `p${index}`, rank: 'SPC', firstName: 'Pat', lastName: `Last${index}`, groupId: null }) as Personnel
	);
	const availability = personnel.slice(0, 4).map(
		(person) =>
			({
				id: `a-${person.id}`,
				personnelId: person.id,
				statusTypeId: 'leave',
				startDate: '2026-10-21',
				endDate: '2026-10-21'
			}) as AvailabilityEntry
	);
	const band = buildStrengthBand({
		today: '2026-10-19',
		forecastDays: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-24'],
		personnel,
		availability,
		statusTypes: [leave],
		specialDays: [{ id: 's1', date: '2026-10-20', name: 'Unit Day', type: 'org-closure' }],
		groups: [],
		floorPercent: 85
	});
	render(StrengthForecast, { props: { band, today: '2026-10-19', calendarHref: '/org/o/calendar' } });
}

describe('StrengthForecast day descriptions', () => {
	it('gives a flagged duty day its count, floor state and out statuses', () => {
		forecast();

		const name = screen.getByRole('img', { name: /Wednesday 21st/ }).getAttribute('aria-label')!;

		expect(name).toContain('18 of 22 available');
		expect(name).toContain('Duty day');
		expect(name).toContain('Below the floor');
		expect(name).toContain('Leave 4');
	});

	it('names the Special Day or the weekend that makes a day not a duty day', () => {
		forecast();

		const closure = screen.getByRole('img', { name: /Tuesday 20th/ }).getAttribute('aria-label')!;
		const weekend = screen.getByRole('img', { name: /Saturday 24th/ }).getAttribute('aria-label')!;

		expect(closure).toContain('Unit Day');
		expect(closure).not.toContain('Below the floor');
		expect(weekend).toContain('Weekend');
	});

	it('marks today and leaves an unflagged day without floor or out facts', () => {
		forecast();

		const today = screen.getByRole('img', { name: /Monday 19th/ }).getAttribute('aria-label')!;

		expect(today).toContain('Today');
		expect(today).toContain('22 of 22 available');
		expect(today).not.toContain('Below the floor');
		expect(today).not.toContain('Out:');
	});
});
