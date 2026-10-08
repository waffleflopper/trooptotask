import { describe, expect, it } from 'vitest';
import {
	tallyReadiness,
	tallyReadinessBy,
	tallyReadinessGrid,
	type ReadinessFact,
	type ReadinessTallyConfig
} from './readinessRollup';

type DemoState = 'current' | 'expiring' | 'expired' | 'not-recorded' | 'exempt';

const READY_CURRENT: ReadinessTallyConfig<DemoState, 0> = {
	readyStates: ['current'],
	inapplicableStates: ['exempt'],
	zeroApplicablePercent: 0
};

const READY_CURRENT_OR_EXPIRING_NULL: ReadinessTallyConfig<DemoState, null> = {
	readyStates: ['current', 'expiring'],
	zeroApplicablePercent: null
};

function fact(subjectKey: string, requirementKey: string, state: DemoState): ReadinessFact<DemoState> {
	return { subjectKey, requirementKey, state };
}

describe('tallyReadiness', () => {
	it('counts ready and applicable facts and rounds the percent', () => {
		const result = tallyReadiness(
			[fact('p1', 'r1', 'current'), fact('p1', 'r2', 'expired'), fact('p2', 'r1', 'expiring')],
			READY_CURRENT
		);

		expect(result.applicable).toBe(3);
		expect(result.ready).toBe(1);
		expect(result.percent).toBe(33);
		expect(result.stateCounts.get('current')).toBe(1);
		expect(result.stateCounts.get('expired')).toBe(1);
		expect(result.stateCounts.get('expiring')).toBe(1);
	});

	it('honors the feature-defined ready set', () => {
		const result = tallyReadiness(
			[fact('p1', 'r1', 'current'), fact('p1', 'r2', 'expiring'), fact('p1', 'r3', 'expired')],
			READY_CURRENT_OR_EXPIRING_NULL
		);

		expect(result.ready).toBe(2);
		expect(result.percent).toBe(67);
	});

	it('excludes inapplicable states from applicable and ready but keeps them in stateCounts', () => {
		const result = tallyReadiness([fact('p1', 'r1', 'exempt'), fact('p1', 'r2', 'current')], READY_CURRENT);

		expect(result.applicable).toBe(1);
		expect(result.ready).toBe(1);
		expect(result.percent).toBe(100);
		expect(result.stateCounts.get('exempt')).toBe(1);
	});

	it('reports the configured zero-applicable percent on an empty denominator', () => {
		expect(tallyReadiness([], READY_CURRENT).percent).toBe(0);
		expect(tallyReadiness([], READY_CURRENT_OR_EXPIRING_NULL).percent).toBeNull();
		expect(tallyReadiness([fact('p1', 'r1', 'exempt')], READY_CURRENT).percent).toBe(0);
	});

	it('lets inapplicable win when a state is configured in both lists', () => {
		const conflicted: ReadinessTallyConfig<DemoState, 0> = {
			readyStates: ['current', 'exempt'],
			inapplicableStates: ['exempt'],
			zeroApplicablePercent: 0
		};

		const result = tallyReadiness([fact('p1', 'r1', 'exempt')], conflicted);

		expect(result.applicable).toBe(0);
		expect(result.ready).toBe(0);
		expect(result.stateCounts.get('exempt')).toBe(1);
	});

	it('demonstrates that a complement rate needs its own fold, never 100 − percent', () => {
		// 1 of 3 ready → 33%; 2 of 3 in the complement → 67%. 33 + 67 = 100 here,
		// but with 1 of 8: round(12.5) = 13 and round(87.5) = 88, summing to 101.
		const facts = [
			fact('p1', 'r1', 'current'),
			...Array.from({ length: 7 }, (_, index) => fact(`p${index + 2}`, 'r1', 'expired'))
		];
		const compliance = tallyReadiness(facts, READY_CURRENT);
		const nonCompliance = tallyReadiness(facts, {
			...READY_CURRENT,
			readyStates: ['expiring', 'expired', 'not-recorded']
		});

		expect(compliance.percent).toBe(13);
		expect(nonCompliance.percent).toBe(88);
		expect(nonCompliance.percent).not.toBe(100 - compliance.percent);
	});

	it('does not mutate the facts array', () => {
		const facts = [fact('p1', 'r1', 'current')];
		const snapshot = JSON.parse(JSON.stringify(facts));

		tallyReadiness(facts, READY_CURRENT);

		expect(facts).toEqual(snapshot);
	});
});

describe('tallyReadinessBy', () => {
	const facts = [
		fact('p1', 'r1', 'current'),
		fact('p2', 'r1', 'expired'),
		fact('p1', 'r2', 'exempt'),
		fact('p2', 'r2', 'current')
	];

	it('folds by an arbitrary key function', () => {
		const bySubject = tallyReadinessBy(facts, READY_CURRENT, (f) => f.subjectKey);

		expect(bySubject.get('p1')).toMatchObject({ applicable: 1, ready: 1, percent: 100 });
		expect(bySubject.get('p2')).toMatchObject({ applicable: 2, ready: 1, percent: 50 });
	});

	it('iterates keys in first-encounter order of the facts', () => {
		const byRequirement = tallyReadinessBy(facts, READY_CURRENT, (f) => f.requirementKey);

		expect([...byRequirement.keys()]).toEqual(['r1', 'r2']);
	});

	it('places seed keys first, in seed order, with empty tallies when unobserved', () => {
		const byRequirement = tallyReadinessBy(facts, READY_CURRENT, (f) => f.requirementKey, {
			seedKeys: ['r9', 'r2']
		});

		expect([...byRequirement.keys()]).toEqual(['r9', 'r2', 'r1']);
		expect(byRequirement.get('r9')).toMatchObject({ applicable: 0, ready: 0, percent: 0 });
		expect(byRequirement.get('r9')?.stateCounts.size).toBe(0);
	});

	it('uses the configured zero-applicable percent for seeded empty buckets', () => {
		const byRequirement = tallyReadinessBy(facts, READY_CURRENT_OR_EXPIRING_NULL, (f) => f.requirementKey, {
			seedKeys: ['r9']
		});

		expect(byRequirement.get('r9')?.percent).toBeNull();
	});
});

describe('tallyReadinessGrid', () => {
	const facts = [fact('p1', 'r1', 'current'), fact('p2', 'r2', 'expired'), fact('p3', 'r1', 'expiring')];
	const rowOf = new Map([
		['p1', 'mosA'],
		['p2', 'mosA'],
		['p3', 'mosB']
	]);
	const colOf = new Map([
		['r1', 'catX'],
		['r2', 'catY']
	]);
	const rowKeyOf = (f: ReadinessFact<DemoState>) => rowOf.get(f.subjectKey)!;
	const colKeyOf = (f: ReadinessFact<DemoState>) => colOf.get(f.requirementKey)!;

	it('is rectangular: every row holds a tally for every column key', () => {
		const grid = tallyReadinessGrid(facts, READY_CURRENT_OR_EXPIRING_NULL, rowKeyOf, colKeyOf);

		expect([...grid.keys()]).toEqual(['mosA', 'mosB']);
		expect([...grid.get('mosB')!.keys()]).toEqual(['catX', 'catY']);
		expect(grid.get('mosB')?.get('catY')).toMatchObject({ applicable: 0, ready: 0, percent: null });
		expect(grid.get('mosA')?.get('catX')).toMatchObject({ applicable: 1, ready: 1, percent: 100 });
		expect(grid.get('mosB')?.get('catX')).toMatchObject({ applicable: 1, ready: 1, percent: 100 });
	});

	it('places seeded rows and columns first and keeps them when unobserved', () => {
		const grid = tallyReadinessGrid(facts, READY_CURRENT_OR_EXPIRING_NULL, rowKeyOf, colKeyOf, {
			seedRowKeys: ['mosZ', 'mosA'],
			seedColKeys: ['catY']
		});

		expect([...grid.keys()]).toEqual(['mosZ', 'mosA', 'mosB']);
		expect([...grid.get('mosA')!.keys()]).toEqual(['catY', 'catX']);
		expect(grid.get('mosZ')?.get('catX')).toMatchObject({ applicable: 0, percent: null });
	});

	it('handles empty facts with seeds as an all-empty rectangle', () => {
		const grid = tallyReadinessGrid([], READY_CURRENT, rowKeyOf, colKeyOf, {
			seedRowKeys: ['mosA'],
			seedColKeys: ['catX', 'catY']
		});

		expect(grid.get('mosA')?.get('catY')).toMatchObject({ applicable: 0, ready: 0, percent: 0 });
	});
});
