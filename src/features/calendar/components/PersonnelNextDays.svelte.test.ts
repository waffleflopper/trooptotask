// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PersonnelCalendarWindow } from '../calendar.types';
import PersonnelNextDays from './PersonnelNextDays.svelte';

const leave = {
	id: 'leave',
	name: 'Leave',
	color: '#f59e0b',
	textColor: '#000000',
	shortLabel: 'L',
	rosterEffect: 'A',
	sortOrder: 0
};
const training = { ...leave, id: 'training', name: 'Training', shortLabel: 'T', color: '#2563eb', sortOrder: 1 };

function entry(id: string, statusTypeId: string, startDate: string, endDate: string, note: string) {
	return { id, personnelId: 'p1', statusTypeId, startDate, endDate, note };
}

function calendarWith(availability: ReturnType<typeof entry>[]): PersonnelCalendarWindow {
	return {
		rangeStart: '2026-10-23',
		rangeEnd: '2026-10-29',
		availability,
		statusTypes: [leave, training],
		assignments: [],
		assignmentTypes: [],
		specialDays: []
	} as unknown as PersonnelCalendarWindow;
}

const longNote = 'Block leave to visit family in Tampa before the holiday weekend, reachable by cell only';

afterEach(cleanup);

describe('Next days legend', () => {
	it('draws every entry on its own line when they fit', () => {
		const calendar = calendarWith([
			entry('a1', 'training', '2026-10-23', '2026-10-24', 'Current training'),
			entry('a2', 'leave', '2026-10-26', '2026-10-28', longNote)
		]);
		render(PersonnelNextDays, { props: { calendar, legendLines: 2 } });

		const lines = screen.getAllByTitle(/^(Training|Leave) /);
		expect(lines.map((line) => line.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Training Fri 23 – Sat 24 Oct · Current training',
			`Leave Mon 26 – Wed 28 Oct · ${longNote}`
		]);
	});

	it('folds entries past the last line into one "+N more" line', () => {
		const calendar = calendarWith([
			entry('a1', 'training', '2026-10-23', '2026-10-23', ''),
			entry('a2', 'leave', '2026-10-25', '2026-10-25', ''),
			entry('a3', 'leave', '2026-10-27', '2026-10-27', ''),
			entry('a4', 'training', '2026-10-28', '2026-10-28', '')
		]);
		render(PersonnelNextDays, { props: { calendar, legendLines: 2 } });

		const list = screen.getByTitle(/^Training /).closest('ul');
		expect(
			within(list!)
				.getAllByRole('listitem')
				.map((line) => line.textContent?.replace(/\s+/g, ' ').trim())
		).toEqual(['Training Fri 23 Oct', '+3 more · Leave, Leave, Training']);
	});
});
