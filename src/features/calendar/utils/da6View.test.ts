import { describe, expect, it } from 'vitest';
import { da6Segment, simulateRoster } from '../roster/rosterEngine';
import { storedR4 } from '../roster/rosterFixtures.test-support';
import { defaultDay, remarkText, workedExample, type Da6Sheet } from './da6View';

const r4 = da6Segment(simulateRoster(storedR4()), '2026-10')!;
const column = (date: string) => r4.columns.findIndex((candidate) => candidate.date === date);

describe('Show the work', () => {
	it('names who was skipped on 20 Oct, why, and when they pull next', () => {
		expect(workedExample(r4, column('2026-10-20'))).toBe(
			'SGT Okafor and SPC Nguyen both sit at 12. Okafor is away (Leave), so Nguyen pulls it. ' +
				'Okafor holds at 12 and goes first after returning, on 24 Oct.'
		);
	});

	it('explains a planned pick that leads the standing outright', () => {
		expect(workedExample(r4, column('2026-10-18'))).toBe('SGT Kim has the highest number at 13, so Kim pulls it.');
	});

	it('says when a hand-assigned day went to someone other than the rule’s pick', () => {
		const handPicked = da6Segment(
			simulateRoster({
				...storedR4(),
				assignments: storedR4().assignments.map((assignment) =>
					assignment.date === '2026-10-02' ? { ...assignment, assigneeId: 'brooks' } : assignment
				)
			}),
			'2026-10'
		)!;
		expect(workedExample(handPicked, 1)).toBe(
			'Assigned by hand to PFC Brooks at 9. By the rule it would have gone to SPC Patel. A hand-assigned day still counts, so Brooks starts over.'
		);
	});
});

describe('remarks', () => {
	it('numbers the excused first sergeant without a date when the excusal predates the form', () => {
		expect(r4.remarks.map((remark) => remarkText(remark, '2026-10-01'))).toEqual([
			'1SG Moreno omitted. Excused: First sergeant.'
		]);
	});
});

describe('the default day', () => {
	const sheets: Da6Sheet[] = [{ from: '2026-10-01', to: null, segment: r4 }];

	it('opens on today', () => {
		expect(defaultDay(sheets, '2026-10-16')).toEqual({ sheet: 0, column: 15 });
	});

	it('falls back to the last served day when today has no column', () => {
		expect(defaultDay(sheets, '2026-10-31')).toEqual({ sheet: 0, column: 23 });
		expect(defaultDay(sheets, '2026-09-30')).toEqual({ sheet: 0, column: 0 });
	});
});
