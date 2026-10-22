import { describe, expect, it } from 'vitest';
import {
	carryOver,
	closeForm,
	countChanges,
	da6Segment,
	detailConflicts,
	replacementOptions,
	simulateRoster,
	slotChanges,
	startingNumbersLocked,
	withAssignment,
	type RosterFacts,
	type StartingNumber
} from './rosterEngine';
import { assigned, gridLines, R4_PICKS, octoberDate, status, storedR4 } from './rosterFixtures.test-support';

function withLeave(facts: RosterFacts, personId: string, date: string): RosterFacts {
	return { ...facts, availability: [...facts.availability, status(personId, 'leave', date, date)] };
}

describe('count today', () => {
	it('lists current counts after today’s reset, with A holds and ties in DA 6 order', () => {
		const run = simulateRoster(storedR4());

		expect(run.current?.[0].counts.map((entry) => [entry.personId, entry.count, entry.effect.code])).toEqual([
			['ortiz', 12, 'A'],
			['kim', 11, 'available'],
			['brooks', 10, 'available'],
			['okafor', 9, 'available'],
			['nguyen', 8, 'available'],
			['hale', 7, 'available'],
			['morales', 6, 'available'],
			['liang', 5, 'available'],
			['fuller', 4, 'available'],
			['grant', 3, 'available'],
			['patel', 2, 'available'],
			['moss', 1, 'available'],
			['alvarez', 0, 'available']
		]);
		expect(run.byDate.get('2026-10-16')?.detail).toEqual({
			kind: 'stored',
			personId: 'alvarez',
			source: 'manual',
			served: true,
			onRoster: true,
			effect: { code: 'available' }
		});
		expect(run.byDate.get('2026-10-16')?.standing.find((entry) => entry.personId === 'alvarez')?.count).toBe(12);
	});
});

describe('replacing a conflicted assignee', () => {
	const facts = withLeave(storedR4(), 'kim', '2026-10-18');

	it('offers the rule’s pick, who cannot pull, and next-door duties', () => {
		const options = replacementOptions(simulateRoster(facts), '2026-10-18');

		expect(options.nextUp).toBe('brooks');
		expect(options.cantPull).toEqual([{ personId: 'kim', count: 12, effect: { code: 'A', reason: 'Leave' } }]);
		expect(options.candidates[0]).toEqual({
			personId: 'brooks',
			count: 12,
			effect: { code: 'available' },
			adjacent: ['Staff Duty']
		});
		expect(options.candidates.map((candidate) => candidate.personId)).not.toContain('kim');
	});

	it('flags the hand-assigned day whose assignee is away', () => {
		expect(detailConflicts(simulateRoster(facts)).map((day) => day.date)).toEqual(['2026-10-18']);
	});

	it('re-picks only the later roster day that changes', () => {
		const scenario = withAssignment(storedR4(), { date: '2026-10-18', assigneeId: 'brooks', source: 'roster' });
		const repick = simulateRoster(scenario, { kind: 'repick', after: '2026-10-18' });

		expect(repick.changes).toEqual([
			{
				date: '2026-10-19',
				track: 'all',
				personId: 'kim',
				count: 14,
				was: 'brooks',
				passedOver: [],
				returningFrom: null
			}
		]);
		expect(slotChanges(repick)).toEqual([
			{ date: '2026-10-19', assignmentTypeId: 'staff-duty', assigneeId: 'kim', source: 'roster' }
		]);
	});

	it('re-picks only inside the window, where other duties are known', () => {
		const scenario = withAssignment(
			{ ...storedR4(), window: { from: '2026-10-20', through: '2026-10-24' } },
			{ date: '2026-10-18', assigneeId: 'brooks', source: 'roster' }
		);
		const repick = simulateRoster(scenario, { kind: 'repick', after: '2026-10-18' });

		expect(repick.changes.map(({ date, personId }) => `${date.slice(8)} ${personId}`)).toEqual([
			'20 kim',
			'21 nguyen',
			'22 hale',
			'23 morales'
		]);
	});

	it('re-picks later roster days but never a hand-assigned one', () => {
		const handAssigned = withAssignment(storedR4(), { date: '2026-10-19', assigneeId: 'brooks', source: 'manual' });
		const scenario = withAssignment(handAssigned, { date: '2026-10-18', assigneeId: 'brooks', source: 'roster' });

		const repick = simulateRoster(scenario, { kind: 'repick', after: '2026-10-18' });

		expect(repick.changes.map(({ date, personId, was }) => `${date.slice(8)} ${was} → ${personId}`)).toEqual([
			'20 nguyen → kim',
			'21 hale → nguyen',
			'22 morales → hale',
			'23 liang → morales'
		]);
		expect(repick.byDate.get('2026-10-19')?.detail).toMatchObject({
			kind: 'stored',
			personId: 'brooks',
			source: 'manual'
		});
	});
});

describe('starting numbers', () => {
	const allRoster = (): RosterFacts => {
		const facts = storedR4();
		return {
			...facts,
			today: '2026-09-30',
			assignments: R4_PICKS.map((personId, index) => assigned(octoberDate(index + 1), personId, 'roster'))
		};
	};

	it('re-pick planned days when an unlocked number changes', () => {
		const facts = allRoster();
		const edited: RosterFacts = {
			...facts,
			form: {
				...facts.form,
				startingNumbers: facts.form.startingNumbers.map((number) =>
					number.personId === 'grant' ? { ...number, count: 0 } : number
				)
			}
		};
		const repick = simulateRoster(edited, { kind: 'repick', after: edited.today });

		expect(
			repick.changes.slice(0, 3).map(({ date, personId, was, count }) => ({ date, personId, was, count }))
		).toEqual([
			{ date: '2026-10-01', personId: 'patel', was: 'grant', count: 12 },
			{ date: '2026-10-02', personId: 'moss', was: 'patel', count: 12 },
			{ date: '2026-10-03', personId: 'alvarez', was: 'moss', count: 12 }
		]);
	});

	it('lock once the first detail on the form is served', () => {
		expect(startingNumbersLocked(allRoster())).toBe(false);
		expect(startingNumbersLocked({ ...allRoster(), today: '2026-10-01' })).toBe(true);
	});
});

describe('changing a status effect', () => {
	it('lists the numbers that move on the open form', () => {
		const before = storedR4();
		const after: RosterFacts = {
			...before,
			statusTypes: before.statusTypes.map((type) => (type.id === 'tdy' ? { ...type, rosterEffect: 'D' } : type))
		};

		expect(countChanges(simulateRoster(before), simulateRoster(after))).toEqual([
			{
				date: '2026-10-12',
				personId: 'ortiz',
				track: 'all',
				from: { kind: 'away', count: 12, reason: 'TDY' },
				to: { kind: 'code', code: 'D', count: 13, reason: 'TDY' }
			},
			{
				date: '2026-10-13',
				personId: 'ortiz',
				track: 'all',
				from: { kind: 'away', count: 12, reason: 'TDY' },
				to: { kind: 'code', code: 'D', count: 14, reason: 'TDY' }
			},
			{
				date: '2026-10-14',
				personId: 'ortiz',
				track: 'all',
				from: { kind: 'away', count: 12, reason: 'TDY' },
				to: { kind: 'code', code: 'D', count: 15, reason: 'TDY' }
			},
			{
				date: '2026-10-15',
				personId: 'ortiz',
				track: 'all',
				from: { kind: 'away', count: 12, reason: 'TDY' },
				to: { kind: 'code', code: 'D', count: 16, reason: 'TDY' }
			},
			{
				date: '2026-10-16',
				personId: 'ortiz',
				track: 'all',
				from: { kind: 'away', count: 12, reason: 'TDY' },
				to: { kind: 'code', code: 'D', count: 17, reason: 'TDY' }
			},
			{
				date: '2026-10-17',
				personId: 'ortiz',
				track: 'all',
				from: { kind: 'detail', count: 13, when: 'planned' },
				to: { kind: 'detail', count: 18, when: 'planned' }
			}
		]);
	});
});

describe('closing a form', () => {
	it('saves the month so far and carries each count into the next form', () => {
		const facts = storedR4();
		const closed = closeForm(facts, '2026-10-16');

		expect(closed.carry.map(({ personId, track, count, origin }) => [personId, track, count, origin])).toEqual([
			['alvarez', 'all', 0, 'carried'],
			['hale', 'all', 7, 'carried'],
			['kim', 'all', 11, 'carried'],
			['morales', 'all', 6, 'carried'],
			['okafor', 'all', 9, 'carried'],
			['liang', 'all', 5, 'carried'],
			['moss', 'all', 1, 'carried'],
			['nguyen', 'all', 8, 'carried'],
			['ortiz', 'all', 12, 'carried'],
			['patel', 'all', 2, 'carried'],
			['brooks', 'all', 10, 'carried'],
			['fuller', 'all', 4, 'carried'],
			['grant', 'all', 3, 'carried']
		]);
		expect(closed.segments).toHaveLength(1);
		expect(closed.segments[0]).toMatchObject({ formState: 'closed', natureOfDuty: 'Staff Duty', month: '2026-10' });
		expect(closed.segments[0].columns.map((column) => column.date.slice(8))).toEqual([
			'01',
			'02',
			'03',
			'04',
			'05',
			'06',
			'07',
			'08',
			'09',
			'10',
			'11',
			'12',
			'13',
			'14',
			'15',
			'16'
		]);

		const next = simulateRoster({
			...facts,
			excusals: [
				...facts.excusals,
				{ personId: 'brooks', reason: 'Bereavement', from: '2026-10-02', through: '2026-10-04' }
			],
			form: {
				kind: 'open',
				id: 'form-2',
				startsOn: '2026-10-17',
				rules: facts.form.rules,
				startingNumbers: closed.carry
			}
		});
		const nextOctober = da6Segment(next, '2026-10')!;
		expect(nextOctober.remarks.map((remark) => [remark.kind, remark.who.personId])).toEqual([['excused', 'moreno']]);
		expect(gridLines(nextOctober)).toEqual([
			'SSG Alvarez 1 2 3 4 5 6 7 8',
			'SSG Hale 8 9 10 11 *12 1 2 3',
			'SGT Kim 12 *13 1 2 3 4 5 6',
			'SGT Morales 7 8 9 10 11 *12 1 2',
			'SGT Okafor 10 11 12 A A A A *13',
			'SPC Liang 6 7 8 9 10 11 *12 1',
			'SPC Moss 2 3 4 5 6 7 8 9',
			'SPC Nguyen 9 10 11 *12 1 2 3 4',
			'SPC Ortiz *13 1 2 3 4 5 6 7',
			'SPC Patel 3 4 5 6 7 8 9 10',
			'PFC Brooks 11 12 *13 1 2 3 4 5',
			'PFC Fuller 5 6 7 8 9 10 11 12',
			'PFC Grant 4 5 6 7 8 9 10 11'
		]);
	});
});

describe('carrying counts across a weekend-mode change', () => {
	const number = (track: StartingNumber['track'], count: number): StartingNumber => ({
		personId: 'kim',
		track,
		count,
		origin: 'carried'
	});
	const tracks = (numbers: StartingNumber[]) => numbers.map(({ track, count }) => [track, count]);

	it('copies one sequence to both tracks when the form turns separate', () => {
		expect(tracks(carryOver([number('all', 7)], 'same', 'separate'))).toEqual([
			['weekday', 7],
			['weekend', 7]
		]);
		expect(tracks(carryOver([number('weekday', 7)], 'none', 'separate'))).toEqual([
			['weekday', 7],
			['weekend', 7]
		]);
	});

	it('keeps the weekday count when separate tracks merge or weekends drop', () => {
		expect(tracks(carryOver([number('weekday', 7), number('weekend', 3)], 'separate', 'same'))).toEqual([['all', 7]]);
		expect(tracks(carryOver([number('weekday', 7), number('weekend', 3)], 'separate', 'none'))).toEqual([
			['weekday', 7]
		]);
	});

	it('moves the single sequence between Same count and No duty', () => {
		expect(tracks(carryOver([number('all', 7)], 'same', 'none'))).toEqual([['weekday', 7]]);
		expect(tracks(carryOver([number('weekday', 7)], 'none', 'same'))).toEqual([['all', 7]]);
	});

	it('keeps both tracks when the mode stays separate', () => {
		expect(tracks(carryOver([number('weekday', 7), number('weekend', 3)], 'separate', 'separate'))).toEqual([
			['weekday', 7],
			['weekend', 3]
		]);
	});
});
