import { describe, expect, it } from 'vitest';
import {
	closeForm,
	countChanges,
	da6Segment,
	detailConflicts,
	simulateRoster,
	startingNumbersLocked
} from './rosterEngine';
import { assigned, CQ, gridLines, person, rosterFacts, status, typed } from './rosterFixtures.test-support';

describe('review regressions', () => {
	it('carries a held count through a form the excused person never entered', () => {
		const facts = rosterFacts({
			people: [person('SPC', 'Adams'), person('SGT', 'Baker')],
			form: { startingNumbers: [typed('adams', 7), typed('baker', 0)] },
			excusals: [{ personId: 'adams', reason: 'School', from: '2026-10-02', through: '2026-10-04' }],
			assignments: [assigned('2026-10-01', 'baker')]
		});
		const first = closeForm(facts, '2026-10-02');
		const secondFacts = {
			...facts,
			form: { ...facts.form, id: 'form-2', startsOn: '2026-10-03', startingNumbers: first.carry }
		};
		const second = closeForm(secondFacts, '2026-10-04');
		expect(second.carry).toEqual([
			{ personId: 'baker', track: 'all', count: 0, origin: 'carried' },
			{ personId: 'adams', track: 'all', count: 8, origin: 'carried' }
		]);
		const third = simulateRoster(
			{
				...facts,
				window: { from: '2026-10-05', through: '2026-10-05' },
				form: { ...facts.form, id: 'form-3', startsOn: '2026-10-05', startingNumbers: second.carry }
			},
			{ kind: 'fill', days: { from: '2026-10-05', through: '2026-10-05' } }
		);
		expect(third.changes.map(({ personId, count }) => [personId, count])).toEqual([['adams', 9]]);
	});

	it('shows counts after the last served detail without incrementing an open day', () => {
		const run = simulateRoster(
			rosterFacts({
				today: '2026-10-02',
				people: [person('SPC', 'Adams'), person('SGT', 'Baker')],
				assignments: [assigned('2026-10-01', 'adams'), assigned('2026-10-03', 'baker')]
			})
		);
		expect(run.current).toEqual([
			{
				track: 'all',
				counts: [
					{ personId: 'baker', count: 1, effect: { code: 'available' } },
					{ personId: 'adams', count: 0, effect: { code: 'available' } }
				]
			}
		]);
		expect(run.byDate.get('2026-10-02')?.standing.map(({ personId, count }) => [personId, count])).toEqual([
			['baker', 2],
			['adams', 1]
		]);
	});

	it.each(['2026-10-02', '2026-10-04'])('projects every current track when the window ends on %s', (through) => {
		const run = simulateRoster(
			rosterFacts({
				today: '2026-10-02',
				window: { from: '2026-10-01', through },
				people: [person('SPC', 'Adams'), person('SGT', 'Baker')],
				form: {
					rules: { pool: null, weekendMode: 'separate' },
					startingNumbers: [
						typed('adams', 4, 'weekday'),
						typed('baker', 1, 'weekday'),
						typed('adams', 9, 'weekend'),
						typed('baker', 2, 'weekend')
					]
				},
				availability: [status('baker', 'leave', '2026-10-02', '2026-10-02')],
				assignments: [assigned('2026-10-01', 'adams'), assigned('2026-10-03', 'baker')]
			})
		);
		expect(run.current).toEqual([
			{
				track: 'weekday',
				counts: [
					{ personId: 'baker', count: 2, effect: { code: 'A', reason: 'Leave' } },
					{ personId: 'adams', count: 0, effect: { code: 'available' } }
				]
			},
			{
				track: 'weekend',
				counts: [
					{ personId: 'adams', count: 9, effect: { code: 'available' } },
					{ personId: 'baker', count: 2, effect: { code: 'A', reason: 'Leave' } }
				]
			}
		]);
	});

	it('projects today on a No duty weekend with today’s effect and no extra count', () => {
		const run = simulateRoster(
			rosterFacts({
				today: '2026-10-03',
				people: [person('SPC', 'Adams'), person('SGT', 'Baker')],
				form: { rules: { pool: null, weekendMode: 'none' } },
				assignments: [assigned('2026-10-01', 'adams')],
				availability: [status('baker', 'leave', '2026-10-03', '2026-10-03')]
			})
		);
		expect(run.current).toEqual([
			{
				track: 'weekday',
				counts: [
					{ personId: 'baker', count: 1, effect: { code: 'A', reason: 'Leave' } },
					{ personId: 'adams', count: 0, effect: { code: 'available' } }
				]
			}
		]);
	});

	it('includes today’s reset when today is the last simulated day', () => {
		const run = simulateRoster(
			rosterFacts({
				today: '2026-10-02',
				window: { from: '2026-10-01', through: '2026-10-02' },
				people: [person('SPC', 'Adams'), person('SGT', 'Baker')],
				assignments: [assigned('2026-10-01', 'adams'), assigned('2026-10-02', 'baker')]
			})
		);
		expect(run.current).toEqual([
			{
				track: 'all',
				counts: [
					{ personId: 'adams', count: 1, effect: { code: 'available' } },
					{ personId: 'baker', count: 0, effect: { code: 'available' } }
				]
			}
		]);
		expect(run.byDate.get('2026-10-02')?.standing.find((entry) => entry.personId === 'baker')?.count).toBe(2);
	});

	it.each(['2026-09-30', '2026-10-01', '2026-10-04'])(
		'does not claim current counts without window coverage of %s',
		(today) => {
			const run = simulateRoster(
				rosterFacts({ today, window: { from: '2026-10-02', through: '2026-10-03' }, people: [person('SPC', 'Adams')] })
			);
			expect(run.current).toBeNull();
		}
	);

	it('retains departed form members across months and appends entrants by entry date', () => {
		const run = simulateRoster(
			rosterFacts({
				today: '2026-10-04',
				window: { from: '2026-10-01', through: '2026-10-04' },
				form: { startsOn: '2026-09-30' },
				people: [
					person('SPC', 'Adams', { states: [{}, { from: '2026-10-01', active: false }] }),
					person('SGT', 'Baker'),
					person('SSG', 'Clark', { joined: '2026-10-03' })
				],
				assignments: [assigned('2026-09-30', 'adams'), assigned('2026-10-02', 'baker'), assigned('2026-10-04', 'clark')]
			})
		);
		const october = da6Segment(run, '2026-10')!;
		expect(gridLines(october)).toEqual(['SGT Baker *2 1', 'SPC Adams . .', 'SSG Clark . *1']);
		expect(october.remarks).toEqual([
			{
				kind: 'left',
				who: { personId: 'adams', rank: 'SPC', lastName: 'Adams', firstName: '' },
				on: '2026-10-01',
				cause: 'archived'
			},
			{
				kind: 'joined',
				who: { personId: 'clark', rank: 'SSG', lastName: 'Clark', firstName: '' },
				on: '2026-10-03',
				cause: 'joined'
			}
		]);
	});

	it('keeps departures in their month and leaves them off later months', () => {
		const run = simulateRoster(
			rosterFacts({
				window: { from: '2026-10-01', through: '2026-11-30' },
				people: [
					person('SPC', 'Adams'),
					person('SGT', 'Baker'),
					person('SSG', 'Clark', { states: [{}, { from: '2026-10-08', active: false }] })
				],
				excusals: [{ personId: 'adams', reason: 'School', from: '2026-10-05', through: null }],
				assignments: [assigned('2026-10-01', 'adams'), assigned('2026-10-02', 'baker'), assigned('2026-11-02', 'baker')]
			})
		);
		expect(gridLines(da6Segment(run, '2026-10')!)).toEqual(['SSG Clark 1 2', 'SGT Baker 1 *2', 'SPC Adams *1 1']);
		const november = da6Segment(run, '2026-11')!;
		expect(gridLines(november)).toEqual(['SGT Baker *1']);
		expect(november.remarks).toEqual([
			{
				kind: 'excused',
				who: { personId: 'adams', rank: 'SPC', lastName: 'Adams', firstName: '' },
				reason: 'School',
				from: '2026-10-05',
				through: null
			}
		]);
	});

	it('locks typed numbers only for served dates that have a track', () => {
		const facts = rosterFacts({
			today: '2026-10-05',
			form: { rules: { pool: null, weekendMode: 'none' } },
			holidays: ['2026-10-02'],
			assignments: [assigned('2026-10-02', 'adams'), assigned('2026-10-03', 'adams')]
		});
		expect(startingNumbersLocked(facts)).toBe(false);
		expect(
			startingNumbersLocked({ ...facts, assignments: [...facts.assignments, assigned('2026-10-05', 'adams')] })
		).toBe(true);
	});

	it('keeps carried starting numbers read-only before any detail is served', () => {
		const facts = rosterFacts({
			form: { startingNumbers: [{ personId: 'adams', track: 'all', count: 7, origin: 'carried' }] }
		});
		expect(startingNumbersLocked(facts)).toBe(true);
	});

	it('reports A D and U conflicts for actual assignees outside the pool', () => {
		const run = simulateRoster(
			rosterFacts({
				people: [person('SGT', 'Adams'), person('SPC', 'Baker')],
				form: {
					rules: { weekendMode: 'same', pool: { rank: { from: 'SGT', to: 'SSG' }, mos: [], role: [], groupIds: [] } }
				},
				assignments: [
					assigned('2026-10-01', 'baker'),
					assigned('2026-10-01', 'baker', 'manual', CQ),
					assigned('2026-10-02', 'baker'),
					assigned('2026-10-03', 'baker')
				],
				availability: [
					status('baker', 'leave', '2026-10-02', '2026-10-02'),
					status('baker', 'arrest', '2026-10-03', '2026-10-03')
				]
			})
		);
		expect(detailConflicts(run).map((day) => day.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
	});

	it('lists changed historical cells even after a later detail resets the count', () => {
		const before = rosterFacts({
			today: '2026-10-03',
			window: { from: '2026-10-01', through: '2026-10-03' },
			people: [person('SPC', 'Adams'), person('SGT', 'Baker')],
			form: { startingNumbers: [typed('adams', 4), typed('baker', 0)] },
			availability: [status('adams', 'leave', '2026-10-01', '2026-10-01')],
			assignments: [assigned('2026-10-01', 'baker'), assigned('2026-10-02', 'adams'), assigned('2026-10-03', 'baker')]
		});
		const after = {
			...before,
			statusTypes: before.statusTypes.map((type) =>
				type.id === 'leave' ? { ...type, rosterEffect: 'D' as const } : type
			)
		};
		expect(countChanges(simulateRoster(before), simulateRoster(after))).toEqual([
			{
				date: '2026-10-01',
				personId: 'adams',
				track: 'all',
				from: { kind: 'away', count: 4, reason: 'Leave' },
				to: { kind: 'code', code: 'D', count: 5, reason: 'Leave' }
			},
			{
				date: '2026-10-02',
				personId: 'adams',
				track: 'all',
				from: { kind: 'detail', count: 5, when: 'served' },
				to: { kind: 'detail', count: 6, when: 'served' }
			}
		]);
	});

	it('includes a changed code with an unchanged number and omits hypothetical open-day cells', () => {
		const before = rosterFacts({
			today: '2026-10-03',
			window: { from: '2026-10-01', through: '2026-10-03' },
			people: [person('SPC', 'Adams'), person('SGT', 'Baker')],
			form: { startingNumbers: [typed('adams', 4), typed('baker', 0)] },
			availability: [status('adams', 'detail', '2026-10-01', '2026-10-03')],
			assignments: [assigned('2026-10-01', 'baker')]
		});
		const after = {
			...before,
			statusTypes: before.statusTypes.map((type) =>
				type.id === 'detail' ? { ...type, rosterEffect: 'U' as const } : type
			)
		};
		expect(countChanges(simulateRoster(before), simulateRoster(after))).toEqual([
			{
				date: '2026-10-01',
				personId: 'adams',
				track: 'all',
				from: { kind: 'code', code: 'D', count: 5, reason: 'Detail' },
				to: { kind: 'code', code: 'U', count: 5, reason: 'Detail' }
			}
		]);
	});

	it('refuses a status preview that omits historical columns or mixes planned picks into the facts', () => {
		const facts = rosterFacts({
			people: [person('SPC', 'Adams')],
			assignments: [assigned('2026-10-01', 'adams')]
		});
		const before = simulateRoster(facts);
		const partial = simulateRoster({ ...facts, window: { from: '2026-10-02', through: '2026-10-31' } });
		expect(() => countChanges(before, partial)).toThrow(RangeError);
		const filled = simulateRoster(facts, { kind: 'fill', days: { from: '2026-10-02', through: '2026-10-03' } });
		expect(() => countChanges(before, filled)).toThrow(RangeError);
	});
});
