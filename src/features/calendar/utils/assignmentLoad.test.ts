import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import { BUILT_IN_RANK_CATALOG, type Personnel } from '$features/personnel/contracts';
import {
	computeAssignmentLoad,
	dutyTypes,
	rankLoad,
	type AssignmentLoadInput,
	type PersonLoad
} from './assignmentLoad';

function person(id: string, mos = '11B', rank = 'SGT', groupId: string | null = null): Personnel {
	return { id, rank, lastName: id.toUpperCase(), firstName: 'Pat', mos, clinicRole: '', groupId, groupName: '' };
}

function duty(id: string, overrides: Partial<AssignmentType> = {}): AssignmentType {
	return {
		id,
		name: id,
		shortName: id.slice(0, 2),
		assignTo: 'personnel',
		color: '#000000',
		poolRules: null,
		weekendMode: 'same',
		excusals: [],
		showOnCalendar: true,
		sortOrder: 0,
		...overrides
	};
}

const assign = (date: string, assigneeId: string, assignmentTypeId = 'cq'): DailyAssignment => ({
	id: `${date}-${assigneeId}-${assignmentTypeId}`,
	date,
	assignmentTypeId,
	assigneeId
});

const away = (personnelId: string, startDate: string, endDate: string, statusTypeId = 'leave'): AvailabilityEntry => ({
	id: `${personnelId}-${startDate}`,
	personnelId,
	statusTypeId,
	startDate,
	endDate
});

const a = person('a');
const b = person('b');
const c = person('c');

// 1 to 4 March 2026 unless a test says otherwise.
function load(overrides: Partial<AssignmentLoadInput>) {
	const roster = overrides.roster ?? [a, b, c];
	return computeAssignmentLoad({
		roster,
		shown: roster,
		assignments: [],
		assignmentTypes: [duty('cq')],
		typeIds: new Set(['cq']),
		entries: [],
		awayStatusTypeIds: new Set(['leave']),
		rankCatalog: BUILT_IN_RANK_CATALOG,
		groups: [],
		startDate: '2026-03-01',
		endDate: '2026-03-04',
		...overrides
	});
}

const byId = (people: PersonLoad[], id: string) => people.find((entry) => entry.person.id === id);

describe('fair share', () => {
	// Everyone shares each day's duty: 4 days over 3 people is 4/3 each.
	const assignments = [
		assign('2026-03-01', 'a'),
		assign('2026-03-02', 'a'),
		assign('2026-03-03', 'b'),
		assign('2026-03-04', 'a')
	];

	it('shares each day among everyone eligible when the pool is Everyone', () => {
		const { people, summary } = load({ assignments });
		expect(people.map((entry) => [entry.person.id, entry.total])).toEqual([
			['a', 3],
			['b', 1],
			['c', 0]
		]);
		for (const entry of people) expect(entry.expected).toBeCloseTo(4 / 3, 9);
		expect(byId(people, 'a')?.difference).toBe(1.7);
		expect(byId(people, 'c')?.difference).toBe(-1.3);
		expect(summary).toMatchObject({ duties: 4, eligible: 3, never: 1, overFlagged: 0, onShare: 1 });
		expect(summary.heaviest?.person.id).toBe('a');
		expect(summary.owedMost?.person.id).toBe('c');
	});

	it('leaves a person who was away out of the days they missed', () => {
		const { people } = load({ assignments, entries: [away('b', '2026-03-03', '2026-03-04')] });
		// Days 1 and 2 split three ways, days 3 and 4 between a and c.
		expect(byId(people, 'a')?.expected).toBeCloseTo(2 / 3 + 1, 9);
		expect(byId(people, 'b')?.expected).toBeCloseTo(2 / 3, 9);
		expect(byId(people, 'c')?.expected).toBeCloseTo(2 / 3 + 1, 9);
		expect(byId(people, 'b')?.presentDays).toBe(2);
		expect(byId(people, 'a')?.presentDays).toBe(4);
	});

	it('counts a status that is not chosen as away as present', () => {
		const { people } = load({ assignments, entries: [away('b', '2026-03-03', '2026-03-04', 'sick')] });
		expect(byId(people, 'b')?.expected).toBeCloseTo(4 / 3, 9);
		expect(byId(people, 'b')?.presentDays).toBe(4);
	});

	it('shares a duty only among people its pool rules allow who are not excused', () => {
		const nurse = duty('range', { poolRules: { rank: null, mos: ['68W'], role: [], groupIds: [] } });
		const medics = [person('a', '68W'), person('b', '11B'), person('c', '68W')];
		const { people } = load({
			roster: medics,
			assignmentTypes: [nurse],
			typeIds: new Set(['range']),
			assignments: [assign('2026-03-01', 'a', 'range'), assign('2026-03-03', 'a', 'range')],
			entries: []
		});
		expect(people.map((entry) => entry.person.id)).toEqual(['a', 'c']);
		expect(byId(people, 'a')?.expected).toBeCloseTo(1, 9);
		expect(byId(people, 'c')?.expected).toBeCloseTo(1, 9);

		// With c excused from 3 March, that day belongs to a alone.
		const excused = load({
			roster: medics,
			assignmentTypes: [{ ...nurse, excusals: [{ personId: 'c', reason: 'Profile', startsOn: '2026-03-03' }] }],
			typeIds: new Set(['range']),
			assignments: [assign('2026-03-01', 'a', 'range'), assign('2026-03-03', 'a', 'range')]
		});
		expect(byId(excused.people, 'a')?.expected).toBeCloseTo(1.5, 9);
		expect(byId(excused.people, 'c')?.expected).toBeCloseTo(0.5, 9);
	});

	it('applies a rank range from the rank catalog', () => {
		const nco = duty('cq', { poolRules: { rank: { from: 'SGT', to: 'SSG' }, mos: [], role: [], groupIds: [] } });
		const roster = [
			person('a', '11B', 'SSG'),
			person('b', '11B', 'SPC'),
			person('c', '11B', 'SGT'),
			person('d', '11B', 'SFC')
		];
		const { people } = load({ roster, assignmentTypes: [nco], assignments: [assign('2026-03-01', 'a')] });
		expect(people.map((entry) => entry.person.id)).toEqual(['a', 'c']);
		expect(byId(people, 'c')?.expected).toBeCloseTo(0.5, 9);
	});

	it('works the fair share against the whole roster when the report is narrowed to some people', () => {
		const { people, summary } = load({ assignments, shown: [a] });
		expect(people.map((entry) => entry.person.id)).toEqual(['a']);
		expect(people[0].expected).toBeCloseTo(4 / 3, 9);
		expect(summary.duties).toBe(3);
	});

	it('gives nobody a share of a duty assigned on a day everyone eligible was away', () => {
		const { people } = load({
			assignments: [assign('2026-03-01', 'a')],
			entries: [
				away('a', '2026-03-01', '2026-03-01'),
				away('b', '2026-03-01', '2026-03-01'),
				away('c', '2026-03-01', '2026-03-01')
			]
		});
		expect(people.map((entry) => [entry.person.id, entry.expected])).toEqual([['a', 0]]);
		expect(people[0].difference).toBe(1);
	});

	it('flags exactly two duties over and counts exactly one duty off as still on share', () => {
		// Nine days, three people, a drew 5 and b and c drew 2 each; a fair share is 3.
		const days = Array.from({ length: 9 }, (_, i) => `2026-03-0${i + 1}`);
		const drawn = ['a', 'a', 'a', 'a', 'a', 'b', 'b', 'c', 'c'];
		const { summary } = load({
			endDate: '2026-03-09',
			assignments: days.map((date, i) => assign(date, drawn[i]))
		});
		expect(summary.overFlagged).toBe(1);
		expect(summary.onShare).toBe(2);
		expect(summary.onShareFraction).toBeCloseTo(2 / 3, 9);
	});

	it('flags and bands each person by the difference to a tenth of a duty, as the page shows it', () => {
		// 22 days of one duty over 21 people is a fair share of 22/21 each: a drew 3 (+1.95, shown +2.0), b drew
		// none (-1.05, shown -1.0) and everyone else drew 1 (-0.05, shown 0.0).
		const roster = Array.from({ length: 21 }, (_, i) => person(i === 0 ? 'a' : i === 1 ? 'b' : `p${i}`));
		const days = Array.from({ length: 22 }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`);
		const drawn = ['a', 'a', 'a', ...roster.slice(2).map((entry) => entry.id)];
		const { people, summary, duties } = load({
			roster,
			endDate: '2026-03-22',
			assignments: days.map((date, i) => assign(date, drawn[i]))
		});
		expect([byId(people, 'a')?.difference, byId(people, 'b')?.difference, byId(people, 'p2')?.difference]).toEqual([
			2, -1, 0
		]);
		expect(summary).toMatchObject({ overFlagged: 1, onShare: 20 });
		expect(duties[0]).toMatchObject({ over: 1, onShare: 20, under: 0 });
	});

	it('reports each duty separately, counting people over, on and under their share of it', () => {
		const second = duty('sd');
		const { duties, dutyTypes: counted } = load({
			assignmentTypes: [duty('cq'), second],
			typeIds: new Set(['cq', 'sd']),
			assignments: [...assignments, assign('2026-03-01', 'b', 'sd')]
		});
		expect(counted.map((type) => type.id)).toEqual(['cq', 'sd']);
		expect(duties.find((entry) => entry.assignmentTypeId === 'cq')).toMatchObject({
			duties: 4,
			eligible: 3,
			never: 1,
			over: 1,
			onShare: 1,
			under: 1
		});
		// One day of sd, shared three ways: b drew it (diff 2/3), a and c did not (diff -1/3).
		expect(duties.find((entry) => entry.assignmentTypeId === 'sd')).toMatchObject({
			duties: 1,
			eligible: 3,
			never: 2,
			over: 0,
			onShare: 3,
			under: 0
		});
	});

	it('has no one to report on when nothing was assigned', () => {
		const { people, duties, summary } = load({});
		expect(people).toEqual([]);
		expect(duties).toEqual([]);
		expect(summary).toMatchObject({ duties: 0, eligible: 0, onShareFraction: null, heaviest: null, owedMost: null });
	});
});

describe('duty types', () => {
	const types = [
		duty('cq'),
		duty('old', { archivedAt: '2025-01-01T00:00:00Z' }),
		duty('older', { archivedAt: '2025-01-01T00:00:00Z' }),
		duty('squad', { assignTo: 'group' })
	];

	it('keeps person-assigned types, and archived ones only when assigned in the span', () => {
		const ids = dutyTypes(
			types,
			[assign('2026-03-02', 'a', 'old'), assign('2026-04-02', 'a', 'older')],
			'2026-03-01',
			'2026-03-04'
		).map((type) => type.id);
		expect(ids).toEqual(['cq', 'old']);
	});

	it('ignores a type that is not chosen', () => {
		const { people } = load({
			assignmentTypes: types,
			assignments: [assign('2026-03-01', 'a')],
			typeIds: new Set(['squad'])
		});
		expect(people).toEqual([]);
	});
});

describe('ranking', () => {
	const { people } = load({
		assignments: [
			assign('2026-03-01', 'a'),
			assign('2026-03-02', 'a'),
			assign('2026-03-03', 'b'),
			assign('2026-03-04', 'a')
		]
	});

	it('puts the furthest over first, or the furthest under first', () => {
		expect(rankLoad(people, 'over').map((entry) => entry.person.id)).toEqual(['a', 'b', 'c']);
		expect(rankLoad(people, 'under').map((entry) => entry.person.id)).toEqual(['c', 'b', 'a']);
	});
});
