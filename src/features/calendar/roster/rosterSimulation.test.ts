import { describe, expect, it } from 'vitest';
import { BUILT_IN_RANK_CATALOG } from '$features/personnel/contracts';
import { da6Segment, simulateRoster, type RosterFacts, type RosterRun } from './rosterEngine';
import {
	assigned,
	CQ,
	gridLines,
	octoberDate,
	person,
	r4Facts,
	rosterFacts,
	status,
	storedR4,
	typed
} from './rosterFixtures.test-support';

const R4_GRID = [
	'SSG Alvarez 10 11 12 *13 1 2 3 4 5 6 7 8 9 10 11 *12 1 2 3 4 5 6 7 8',
	'SSG Hale 5 6 7 8 9 10 11 12 *13 1 2 3 4 5 6 7 8 9 10 11 *12 1 2 3',
	'SGT Kim 9 10 11 12 *13 1 2 3 4 5 6 7 8 9 10 11 12 *13 1 2 3 4 5 6',
	'SGT Morales 4 5 6 7 8 9 10 11 12 *13 1 2 3 4 5 6 7 8 9 10 11 *12 1 2',
	'SGT Okafor 7 8 9 10 11 12 *13 1 2 3 4 5 6 7 8 9 10 11 12 A A A A *13',
	'SPC Liang 3 4 5 6 7 8 9 10 11 12 *13 1 2 3 4 5 6 7 8 9 10 11 *12 1',
	'SPC Moss 11 12 *13 1 2 3 4 5 6 7 8 9 10 11 *12 1 2 3 4 5 6 7 8 9',
	'SPC Nguyen 6 7 8 9 10 11 12 *13 1 2 3 4 5 6 7 8 9 10 11 *12 1 2 3 4',
	'SPC Ortiz 2 3 4 5 6 7 8 9 10 11 12 A A A A A *13 1 2 3 4 5 6 7',
	'SPC Patel 12 *13 1 2 3 4 D5 D6 7 8 9 10 11 *12 1 2 3 4 5 6 7 8 9 10',
	'PFC Brooks 8 9 10 11 12 *13 1 2 3 4 5 6 7 8 9 10 11 12 *13 1 2 3 4 5',
	'PFC Fuller 1 2 3 4 5 6 7 8 9 10 11 *12 1 2 3 4 5 6 7 8 9 10 11 12',
	'PFC Grant *13 1 2 3 4 5 6 7 8 9 10 11 *12 1 2 3 4 5 6 7 8 9 10 11'
];

function october(run: RosterRun) {
	const segment = da6Segment(run, '2026-10');
	if (!segment) throw new Error('October has no detail day');
	return segment;
}

function cell(run: RosterRun, personId: string, day: number) {
	const segment = october(run);
	const row = segment.rows.findIndex((ref) => ref.personId === personId);
	const column = segment.columns.findIndex((column) => column.date === octoberDate(day));
	return row < 0 ? undefined : segment.cells[row][column];
}

function standingOf(run: RosterRun, personId: string, day: number) {
	return run.byDate.get(octoberDate(day))?.standing.find((entry) => entry.personId === personId);
}

function fill(facts: RosterFacts, from: string, through: string) {
	return simulateRoster(facts, { kind: 'fill', days: { from, through } });
}

function picks(run: RosterRun): string[] {
	return run.changes.map((change) => `${change.date.slice(8)} ${change.personId} ${change.count}`);
}

function withPeople(...people: [rank: string, lastName: string, count?: number][]): RosterFacts {
	return rosterFacts({
		people: people.map(([rank, lastName]) => person(rank, lastName)),
		form: {
			startingNumbers: people.flatMap(([, lastName, count]) =>
				count === undefined ? [] : [typed(lastName.toLowerCase(), count)]
			)
		}
	});
}

describe('the R4 Staff Duty form', () => {
	it('reproduces every cell of the Paper frame for 1 to 24 Oct', () => {
		const segment = october(simulateRoster(storedR4()));

		expect(gridLines(segment)).toEqual(R4_GRID);
		expect(segment.columns.map((column) => column.when)).toEqual([
			...Array(16).fill('served'),
			...Array(8).fill('planned')
		]);
		expect(segment.remarks).toEqual([
			{
				kind: 'excused',
				who: { personId: 'moreno', rank: '1SG', lastName: 'Moreno', firstName: '' },
				reason: 'First sergeant',
				from: '2026-10-01',
				through: null
			}
		]);
	});

	it('fills the empty month with the same picks the form shows', () => {
		const run = fill(r4Facts(), '2026-10-01', '2026-10-24');

		expect(picks(run)).toEqual([
			'01 grant 13',
			'02 patel 13',
			'03 moss 13',
			'04 alvarez 13',
			'05 kim 13',
			'06 brooks 13',
			'07 okafor 13',
			'08 nguyen 13',
			'09 hale 13',
			'10 morales 13',
			'11 liang 13',
			'12 fuller 12',
			'13 grant 12',
			'14 patel 12',
			'15 moss 12',
			'16 alvarez 12',
			'17 ortiz 13',
			'18 kim 13',
			'19 brooks 13',
			'20 nguyen 12',
			'21 hale 12',
			'22 morales 12',
			'23 liang 12',
			'24 okafor 13'
		]);
		expect(run.unfilled).toEqual([]);
	});

	it('holds Ortiz at 12 through TDY, picks Fuller on the tie, and brings Ortiz back at 13', () => {
		const run = fill(r4Facts(), '2026-10-01', '2026-10-24');
		const byDay = new Map(run.changes.map((change) => [change.date, change]));

		expect(byDay.get('2026-10-12')).toMatchObject({
			personId: 'fuller',
			count: 12,
			passedOver: [{ personId: 'ortiz', count: 12, effect: { code: 'A', reason: 'TDY' } }]
		});
		expect(byDay.get('2026-10-17')).toMatchObject({ personId: 'ortiz', count: 13, returningFrom: 'TDY' });
	});

	it('picks Nguyen over Okafor on leave at 12, and Okafor on 24 Oct at 13', () => {
		const run = fill(r4Facts(), '2026-10-01', '2026-10-24');
		const byDay = new Map(run.changes.map((change) => [change.date, change]));

		expect(byDay.get('2026-10-20')).toMatchObject({
			personId: 'nguyen',
			count: 12,
			passedOver: [{ personId: 'okafor', count: 12, effect: { code: 'A', reason: 'Leave' } }]
		});
		expect(byDay.get('2026-10-24')).toMatchObject({ personId: 'okafor', count: 13, returningFrom: 'Leave' });
	});

	it('keeps D counting and names the status on the cell', () => {
		const run = simulateRoster(storedR4());

		expect(cell(run, 'patel', 7)).toEqual({ kind: 'code', code: 'D', count: 5, reason: 'Detail' });
		expect(cell(run, 'patel', 8)).toEqual({ kind: 'code', code: 'D', count: 6, reason: 'Detail' });
		expect(cell(run, 'patel', 9)).toEqual({ kind: 'count', count: 7 });
	});

	it('holds the count under A even on a day with a D too', () => {
		const facts = storedR4();
		const run = simulateRoster({
			...facts,
			availability: [...facts.availability, status('patel', 'leave', '2026-10-07', '2026-10-07')]
		});

		expect(cell(run, 'patel', 7)).toEqual({ kind: 'away', count: 4, reason: 'Leave' });
	});

	it('rotates a 13-person pool with no absences every 13 detail days at 13', () => {
		const run = fill(
			{ ...r4Facts(), availability: [], window: { from: '2026-10-01', through: '2026-10-26' } },
			'2026-10-01',
			'2026-10-26'
		);
		const order = [
			'grant',
			'patel',
			'moss',
			'alvarez',
			'kim',
			'brooks',
			'okafor',
			'nguyen',
			'hale',
			'morales',
			'liang',
			'ortiz',
			'fuller'
		];

		expect(run.changes.map((change) => change.personId)).toEqual([...order, ...order]);
		expect(new Set(run.changes.map((change) => change.count))).toEqual(new Set([13]));
	});
});

describe('ties', () => {
	it('go to the higher rank', () => {
		const run = fill(withPeople(['SGT', 'Baker', 4], ['SSG', 'Young', 4]), '2026-10-01', '2026-10-01');

		expect(picks(run)).toEqual(['01 young 5']);
	});

	it('go alphabetically by last name within a rank', () => {
		const run = fill(withPeople(['SSG', 'Hale', 4], ['SSG', 'Alvarez', 4]), '2026-10-01', '2026-10-01');

		expect(picks(run)).toEqual(['01 alvarez 5']);
	});

	it('follow the Organization rank catalog, not the built-in one', () => {
		const facts = withPeople(['CPL', 'Baker', 4], ['SPC', 'Young', 4]);
		const specialistFirst = BUILT_IN_RANK_CATALOG.map((entry) =>
			entry.code === 'SPC' ? { ...entry, sortOrder: -1 } : entry
		);

		expect(picks(fill(facts, '2026-10-01', '2026-10-01'))).toEqual(['01 baker 5']);
		expect(picks(fill({ ...facts, rankCatalog: specialistFirst }, '2026-10-01', '2026-10-01'))).toEqual(['01 young 5']);
	});
});

describe('detail days', () => {
	it('reset a hand-assigned person even when the rule would pick someone else', () => {
		const facts = storedR4();
		const run = simulateRoster({
			...facts,
			assignments: facts.assignments.map((assignment) =>
				assignment.date === '2026-10-03' ? assigned('2026-10-03', 'kim') : assignment
			)
		});

		expect(cell(run, 'kim', 3)).toEqual({ kind: 'detail', count: 11, when: 'served' });
		expect(cell(run, 'kim', 4)).toEqual({ kind: 'count', count: 1 });
		expect(cell(run, 'moss', 3)).toEqual({ kind: 'count', count: 13 });
		expect(run.byDate.get('2026-10-04')?.rulePick).toBe('moss');
		expect(standingOf(run, 'moss', 4)?.count).toBe(14);
	});

	it('count for everyone when the assignee is outside the pool, and nobody resets', () => {
		const facts = storedR4();
		const run = simulateRoster({
			...facts,
			assignments: facts.assignments.map((assignment) =>
				assignment.date === '2026-10-05' ? assigned('2026-10-05', 'moreno') : assignment
			)
		});
		const segment = october(run);

		expect(cell(run, 'kim', 5)).toEqual({ kind: 'count', count: 13 });
		expect(run.byDate.get('2026-10-06')?.rulePick).toBe('kim');
		expect(standingOf(run, 'kim', 6)?.count).toBe(14);
		expect(segment.rows.map((row) => row.personId)).not.toContain('moreno');
		expect(segment.remarks).toContainEqual({
			kind: 'outside',
			who: { personId: 'moreno', rank: '1SG', lastName: 'Moreno', firstName: '' },
			date: '2026-10-05'
		});
	});

	it('mark D for a detail on another roster that day', () => {
		const facts = r4Facts();
		const run = fill(
			{ ...facts, assignments: [assigned('2026-10-05', 'kim', 'manual', CQ)] },
			'2026-10-01',
			'2026-10-24'
		);
		const byDay = new Map(run.changes.map((change) => [change.date, change]));

		expect(byDay.get('2026-10-05')).toMatchObject({
			personId: 'brooks',
			count: 12,
			passedOver: [{ personId: 'kim', count: 13, effect: { code: 'D', reason: 'CQ' } }]
		});
		expect(byDay.get('2026-10-06')).toMatchObject({ personId: 'kim', count: 14 });
	});

	it('treat a Still available status as no status', () => {
		const facts = r4Facts();
		const run = fill(
			{
				...facts,
				statusTypes: facts.statusTypes.map((type) =>
					type.id === 'tdy' ? { ...type, rosterEffect: 'available' as const } : type
				)
			},
			'2026-10-01',
			'2026-10-24'
		);

		expect(picks(run)[11]).toBe('12 ortiz 13');
	});

	it('leave a day open and move no count when nobody can pull it', () => {
		const facts = withPeople(['SSG', 'Adams'], ['SGT', 'Baker']);
		const run = fill(
			{
				...facts,
				availability: [
					status('adams', 'leave', '2026-10-02', '2026-10-02'),
					status('baker', 'arrest', '2026-10-02', '2026-10-02')
				]
			},
			'2026-10-01',
			'2026-10-03'
		);

		expect(run.unfilled).toEqual(['2026-10-02']);
		expect(picks(run)).toEqual(['01 adams 1', '03 baker 2']);
	});
});

describe('starting numbers and entry', () => {
	it('stop mattering after the first detail on the track', () => {
		const facts = storedR4();
		const run = simulateRoster({
			...facts,
			form: {
				...facts.form,
				startingNumbers: facts.form.startingNumbers.map((number) =>
					number.personId === 'grant' ? { ...number, count: 20 } : number
				)
			}
		});

		expect(cell(run, 'grant', 1)).toEqual({ kind: 'detail', count: 21, when: 'served' });
		expect(cell(run, 'grant', 24)).toEqual({ kind: 'count', count: 11 });
	});

	it('start a new arrival at the lowest count in the pool and put them at the foot', () => {
		const facts = storedR4();
		const run = simulateRoster({
			...facts,
			people: [...facts.people, person('SPC', 'Young', { joined: '2026-10-10' })]
		});
		const segment = october(run);

		expect(cell(run, 'young', 9)).toBeNull();
		expect(cell(run, 'young', 10)).toEqual({ kind: 'count', count: 1 });
		expect(cell(run, 'hale', 10)).toEqual({ kind: 'count', count: 1 });
		expect(cell(run, 'young', 11)).toEqual({ kind: 'count', count: 2 });
		expect(segment.rows.at(-1)?.personId).toBe('young');
		expect(segment.remarks).toContainEqual({
			kind: 'joined',
			who: { personId: 'young', rank: 'SPC', lastName: 'Young', firstName: '' },
			on: '2026-10-10',
			cause: 'joined'
		});
	});

	it('start someone who newly matches the rules at the lowest count on the day they match', () => {
		const facts = withPeople(['SSG', 'Adams'], ['SGT', 'Baker']);
		const run = fill(
			{
				...facts,
				people: [
					...facts.people,
					person('SGT', 'Young', {
						joined: '2026-09-01',
						states: [{ rank: 'SPC' }, { from: '2026-10-10', rank: 'SGT' }]
					})
				],
				form: {
					...facts.form,
					rules: { weekendMode: 'same', pool: { rank: { from: 'SGT', to: 'SSG' }, mos: [], role: [], groupIds: [] } }
				}
			},
			'2026-10-01',
			'2026-10-12'
		);

		expect(standingOf(run, 'young', 9)).toBeUndefined();
		expect(standingOf(run, 'young', 10)?.count).toBe(1);
		expect(run.poolChanges).toContainEqual({ date: '2026-10-10', personId: 'young', kind: 'enter', cause: 'matched' });
		expect(picks(run).slice(-3)).toEqual(['10 baker 2', '11 adams 2', '12 young 3']);
	});

	it('resume the held count when an excused person is reinstated', () => {
		const facts = storedR4();
		const run = simulateRoster({
			...facts,
			excusals: [
				...facts.excusals,
				{ personId: 'brooks', reason: 'Bereavement', from: '2026-10-02', through: '2026-10-04' }
			]
		});

		expect([2, 3, 4].map((day) => cell(run, 'brooks', day))).toEqual([null, null, null]);
		expect(cell(run, 'brooks', 5)).toEqual({ kind: 'count', count: 9 });
	});

	it('keep the row of someone who leaves the pool, with a remark', () => {
		const facts = storedR4();
		const run = simulateRoster({
			...facts,
			window: { from: '2026-10-01', through: '2026-10-16' },
			people: facts.people.map((entry) =>
				entry.id === 'kim' ? person('SGT', 'Kim', { states: [{}, { from: '2026-10-10', active: false }] }) : entry
			)
		});
		const segment = october(run);
		const kim = gridLines(segment).find((line) => line.startsWith('SGT Kim'));

		expect(kim).toBe('SGT Kim 9 10 11 12 *13 1 2 3 4 . . . . . . .');
		expect(segment.remarks).toContainEqual({
			kind: 'left',
			who: { personId: 'kim', rank: 'SGT', lastName: 'Kim', firstName: '' },
			on: '2026-10-10',
			cause: 'archived'
		});
	});

	it('read a running count as the lowest when the last detail went outside the pool', () => {
		const people = [person('SSG', 'Adams'), person('SGT', 'Baker'), person('SPC', 'Clark'), person('SPC', 'Dunn')];
		const run = simulateRoster(
			rosterFacts({
				people: [...people, person('1SG', 'Moreno'), person('PFC', 'Young', { joined: '2026-10-06' })],
				excusals: [{ personId: 'moreno', reason: 'First sergeant', from: '2026-10-01', through: null }],
				availability: [status('clark', 'leave', '2026-10-03', '2026-10-05')],
				assignments: [
					assigned('2026-10-01', 'clark'),
					assigned('2026-10-02', 'dunn'),
					assigned('2026-10-03', 'baker'),
					assigned('2026-10-04', 'adams'),
					assigned('2026-10-05', 'moreno'),
					assigned('2026-10-06', 'adams'),
					assigned('2026-10-07', 'clark'),
					assigned('2026-10-08', 'dunn')
				]
			})
		);

		expect(standingOf(run, 'young', 6)?.count).toBe(2);
	});
});

describe('no lookback limit', () => {
	it('ranks a person last detailed 140 detail days ago above one detailed 100 days ago', () => {
		const run = fill(
			rosterFacts({
				today: '2026-05-01',
				window: { from: '2026-05-01', through: '2026-09-18' },
				people: [person('SSG', 'Adams'), person('SGT', 'Baker'), person('SPC', 'Clark'), person('SPC', 'Dunn')],
				availability: [
					status('baker', 'detail', '2026-05-02', '2026-09-17'),
					status('adams', 'detail', '2026-05-02', '2026-06-09'),
					status('adams', 'detail', '2026-06-11', '2026-09-17')
				],
				assignments: [assigned('2026-05-01', 'baker'), assigned('2026-06-10', 'adams')],
				form: { startsOn: '2026-05-01' }
			}),
			'2026-05-02',
			'2026-09-18'
		);
		const last = run.changes.at(-1);

		expect(last).toMatchObject({ date: '2026-09-18', personId: 'baker', count: 140, passedOver: [] });
		expect(run.byDate.get('2026-09-18')?.standing.find((entry) => entry.personId === 'adams')?.count).toBe(100);
	});
});

describe('weekends and holidays', () => {
	const three = () =>
		rosterFacts({
			window: { from: '2026-10-01', through: '2026-10-12' },
			people: [person('SSG', 'Adams'), person('SGT', 'Baker'), person('SPC', 'Clark')],
			holidays: ['2026-10-12']
		});
	const withMode = (facts: RosterFacts, weekendMode: 'same' | 'separate' | 'none'): RosterFacts => ({
		...facts,
		form: { ...facts.form, rules: { pool: null, weekendMode } }
	});

	it('keep separate tracks that never affect each other, with Special Days on the weekend track', () => {
		const run = fill(withMode(three(), 'separate'), '2026-10-01', '2026-10-12');
		const byTrack = (track: string) =>
			run.changes
				.filter((change) => change.track === track)
				.map((change) => `${change.date.slice(8)} ${change.personId}`);

		expect(byTrack('weekday')).toEqual([
			'01 adams',
			'02 baker',
			'05 clark',
			'06 adams',
			'07 baker',
			'08 clark',
			'09 adams'
		]);
		expect(byTrack('weekend')).toEqual(['03 adams', '04 baker', '10 clark', '11 adams', '12 baker']);
	});

	it('run one sequence under Same count', () => {
		const run = fill(withMode(three(), 'same'), '2026-10-01', '2026-10-03');

		expect(picks(run)).toEqual(['01 adams 1', '02 baker 2', '03 clark 3']);
	});

	it('skip weekends and Special Days under No duty', () => {
		const run = fill(withMode(three(), 'none'), '2026-10-01', '2026-10-12');

		expect(run.changes.map((change) => change.date.slice(8))).toEqual(['01', '02', '05', '06', '07', '08', '09']);
	});

	it('keep a stored weekend assignment under No duty as a warning that moves no count', () => {
		const facts = withMode(three(), 'none');
		const run = fill({ ...facts, assignments: [assigned('2026-10-03', 'baker')] }, '2026-10-01', '2026-10-09');

		expect(run.excludedDates).toEqual(['2026-10-03']);
		expect(run.changes.map((change) => change.date.slice(8))).toEqual(['01', '02', '05', '06', '07', '08', '09']);
		expect(standingOf(run, 'adams', 6)?.count).toBe(3);
	});
});

describe('the fill boundary', () => {
	it('rejects fill days outside the window', () => {
		expect(() => fill(r4Facts(), '2026-10-20', '2026-10-31')).toThrow(RangeError);
	});
});
