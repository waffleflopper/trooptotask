import { describe, expect, it } from 'vitest';
import { da6Segment, simulateRoster } from '../roster/rosterEngine';
import { assigned, status, storedR4, swapExample, R4_STARTING } from '../roster/rosterFixtures.test-support';
import { defaultDay, remarkText, workedExample, type Da6Sheet } from './da6View';

const r4 = da6Segment(simulateRoster(storedR4()), '2026-10')!;
const column = (date: string) => r4.columns.findIndex((candidate) => candidate.date === date);

describe('Show the work', () => {
	it('names who stands a swapped day and explains the original holder’s published number', () => {
		const segment = da6Segment(simulateRoster(swapExample(true)), '2026-10')!;
		expect(workedExample(segment, 0)).toBe(
			'SPC Patel stands this day in a swap with SPC Kim, who stays counted for it. ' +
				'SPC Kim has the highest number at 6, so Kim pulls it.'
		);
	});

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

	it('says nobody starts over when a hand-assigned day went to someone outside the roster', () => {
		const facts = storedR4();
		const outside = da6Segment(
			simulateRoster({
				...facts,
				assignments: facts.assignments.map((assignment) =>
					assignment.date === '2026-10-05' ? assigned('2026-10-05', 'moreno') : assignment
				)
			}),
			'2026-10'
		)!;
		expect(workedExample(outside, column('2026-10-05'))).toBe(
			'Assigned by hand to 1SG Moreno, who is not on this roster. By the rule it would have gone to SGT Kim. ' +
				'The detail still counts, so everyone available gets one more and nobody starts over.'
		);
	});

	it('does not forecast a return from a hand assignment the rule did not make', () => {
		const facts = storedR4();
		const overridden = da6Segment(
			simulateRoster({
				...facts,
				assignments: facts.assignments.map((assignment) =>
					assignment.date === '2026-10-23' ? assigned('2026-10-23', 'okafor') : assignment
				)
			}),
			'2026-10'
		)!;
		expect(
			workedExample(
				overridden,
				overridden.columns.findIndex((candidate) => candidate.date === '2026-10-20')
			)
		).toBe('SGT Okafor and SPC Nguyen both sit at 12. Okafor is away (Leave), so Nguyen pulls it. Okafor holds at 12.');
	});

	it('forecasts the original holder’s return when someone else stands their next day in a swap', () => {
		const facts = storedR4();
		const segment = da6Segment(
			simulateRoster({
				...facts,
				assignments: facts.assignments.map((assignment) => {
					if (assignment.date === '2026-10-19') return assigned(assignment.date, 'okafor');
					if (assignment.date === '2026-10-24') return assigned(assignment.date, 'brooks');
					return assignment;
				}),
				swaps: [
					{
						id: 'return-swap',
						days: [
							{ date: '2026-10-19', heldBy: 'brooks' },
							{ date: '2026-10-24', heldBy: 'okafor' }
						]
					}
				]
			}),
			'2026-10'
		)!;

		expect(workedExample(segment, column('2026-10-20'))).toBe(
			'SGT Okafor and SPC Nguyen both sit at 12. Okafor is away (Leave), so Nguyen pulls it. ' +
				'Okafor holds at 12 and goes first after returning, on 24 Oct.'
		);
	});

	it('explains an emergency hand assignment when nobody on the roster could pull the day', () => {
		const facts = storedR4();
		const nobody = da6Segment(
			simulateRoster({
				...facts,
				availability: [
					...facts.availability,
					...R4_STARTING.map(([, lastName]) =>
						status(lastName.toLowerCase(), lastName === 'Kim' ? 'detail' : 'leave', '2026-10-05', '2026-10-05')
					)
				]
			}),
			'2026-10'
		)!;
		const text = workedExample(
			nobody,
			nobody.columns.findIndex((candidate) => candidate.date === '2026-10-05')
		);
		expect(text).toBe(
			'Nobody on the roster could pull this day. It went to SGT Kim by hand. ' +
				'Everyone available gets one more, and Kim starts over.'
		);
	});

	it('counts a wide tie instead of naming everyone in it', () => {
		const person = (lastName: string) => ({ personId: lastName, rank: 'SPC', lastName, firstName: 'A' });
		const people = ['Able', 'Baker', 'Cole', 'Dunn'].map(person);
		const segment = {
			...r4,
			columns: [{ ...r4.columns[0], pick: people[0], passedOver: [], rulePick: null }],
			rows: people,
			cells: [
				[{ kind: 'detail' as const, count: 1, when: 'served' as const }],
				...people.slice(1).map(() => [{ kind: 'count' as const, count: 1 }])
			]
		};

		expect(workedExample(segment, 0)).toBe('All 4 sit at 1. Able is higher on the form, so Able pulls it.');
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
	const sheets: Da6Sheet[] = [{ formId: 'r4', from: '2026-10-01', to: null, segment: r4 }];

	it('opens on today', () => {
		expect(defaultDay(sheets, '2026-10-16')).toEqual({ sheet: 0, column: 15 });
	});

	it('falls back to the last served day when today has no column', () => {
		expect(defaultDay(sheets, '2026-10-31')).toEqual({ sheet: 0, column: 23 });
		expect(defaultDay(sheets, '2026-09-30')).toEqual({ sheet: 0, column: 0 });
	});
});
