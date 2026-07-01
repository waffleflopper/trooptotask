import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_RANK_CATALOG,
	compareRankCodes,
	resolveBuiltInRank,
	resolveRank,
	type RankCatalogEntry
} from './rankCatalog';

describe('rank catalog ordering', () => {
	it('treats cross-service ranks with the same pay grade as equivalent precedence', () => {
		expect(resolveBuiltInRank('PFC')?.payGrade).toBe('E-3');
		expect(resolveBuiltInRank('A1C')?.payGrade).toBe('E-3');

		const ordered = ['A1C', 'SGT', 'PFC'].sort(compareRankCodes);

		expect(ordered).toEqual(['SGT', 'A1C', 'PFC']);
	});

	it('includes built-in rank service packs for military, civilian, and custom ranks', () => {
		const services = new Set(BUILT_IN_RANK_CATALOG.map((rank) => rank.service));

		expect(services).toEqual(
			new Set(['army', 'navy', 'air-force', 'marine-corps', 'coast-guard', 'space-force', 'civilian', 'custom'])
		);
		expect(resolveBuiltInRank('CIV')).toMatchObject({
			category: 'civilian',
			payGrade: 'ungraded',
			state: 'active'
		});
		expect(resolveBuiltInRank('CUSTOM')).toMatchObject({
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active'
		});
	});

	it('includes officer and enlisted defaults for every military service pack', () => {
		for (const service of ['army', 'navy', 'air-force', 'marine-corps', 'coast-guard', 'space-force']) {
			const serviceRanks = BUILT_IN_RANK_CATALOG.filter((rank) => rank.service === service);

			expect(
				serviceRanks.some((rank) => rank.category === 'officer'),
				`${service} officer defaults`
			).toBe(true);
			expect(
				serviceRanks.some((rank) => rank.category === 'enlisted'),
				`${service} enlisted defaults`
			).toBe(true);
		}

		expect(resolveBuiltInRank('PO3')).toMatchObject({
			service: 'navy',
			payGrade: 'E-4'
		});
		expect(resolveBuiltInRank('LTJG')).toMatchObject({
			service: 'navy',
			payGrade: 'O-2'
		});
	});

	it('prefers exact rank code matches before deterministic case-insensitive fallback', () => {
		expect(resolveBuiltInRank('GEN')).toMatchObject({
			code: 'GEN',
			service: 'army'
		});
		expect(resolveBuiltInRank('Gen')).toMatchObject({
			code: 'Gen',
			service: 'air-force'
		});
		expect(resolveBuiltInRank('gen')).toBeUndefined();
		expect(resolveRank('gen')).toMatchObject({
			code: 'gen',
			label: 'gen',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded'
		});
	});

	it('uses explicit sort order and then label/code fallback within the same pay grade', () => {
		expect(['SPC', 'CPL'].sort(compareRankCodes)).toEqual(['CPL', 'SPC']);

		const catalog = [
			{
				code: 'B',
				label: 'Bravo Grade',
				service: 'custom',
				category: 'custom',
				payGrade: 'E-5',
				state: 'active',
				sortOrder: 0
			},
			{
				code: 'A',
				label: 'Alpha Grade',
				service: 'custom',
				category: 'custom',
				payGrade: 'E-5',
				state: 'active',
				sortOrder: 0
			}
		] as const;

		expect(['B', 'A'].sort((a, b) => compareRankCodes(a, b, { catalog }))).toEqual(['A', 'B']);
	});

	it('fails fast when a provided catalog has duplicate exact rank codes', () => {
		const catalog: RankCatalogEntry[] = [
			{
				code: 'DUP',
				label: 'Duplicate One',
				service: 'custom',
				category: 'custom',
				payGrade: 'E-5',
				state: 'active',
				sortOrder: 0
			},
			{
				code: 'DUP',
				label: 'Duplicate Two',
				service: 'custom',
				category: 'custom',
				payGrade: 'E-6',
				state: 'active',
				sortOrder: 0
			}
		];

		expect(() => compareRankCodes('DUP', 'DUP', { catalog })).toThrow('Duplicate rank catalog code: DUP');
	});

	it('reuses the rank index for repeated comparisons with the same catalog identity', () => {
		let indexBuilds = 0;
		const source: RankCatalogEntry[] = [
			{
				code: 'HIGH',
				label: 'High',
				service: 'custom',
				category: 'custom',
				payGrade: 'E-6',
				state: 'active',
				sortOrder: 0
			},
			{
				code: 'LOW',
				label: 'Low',
				service: 'custom',
				category: 'custom',
				payGrade: 'E-5',
				state: 'active',
				sortOrder: 0
			}
		];
		const catalog = new Proxy(source, {
			get(target, property, receiver) {
				if (property === Symbol.iterator) {
					return function* () {
						indexBuilds += 1;
						yield* target;
					};
				}

				return Reflect.get(target, property, receiver);
			}
		});

		expect(compareRankCodes('LOW', 'HIGH', { catalog })).toBeGreaterThan(0);
		expect(compareRankCodes('HIGH', 'LOW', { catalog })).toBeLessThan(0);
		expect(resolveRank('LOW', catalog)).toMatchObject({ code: 'LOW' });
		expect(indexBuilds).toBe(1);
	});

	it('keeps unknown rank strings displayable and sortable', () => {
		expect(resolveRank('LOCAL')).toMatchObject({
			code: 'LOCAL',
			label: 'LOCAL',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active'
		});

		expect(['ZZZ', 'SGT', 'LOCAL'].sort(compareRankCodes)).toEqual(['SGT', 'LOCAL', 'ZZZ']);
	});

	it('trims surrounding whitespace before resolving and comparing rank codes', () => {
		expect(resolveBuiltInRank(' SGT ')).toMatchObject({ code: 'SGT' });
		expect(resolveRank(' LOCAL ')).toMatchObject({
			code: 'LOCAL',
			label: 'LOCAL',
			service: 'custom'
		});

		expect([' PFC ', ' SGT ', ' LOCAL '].sort(compareRankCodes)).toEqual([' SGT ', ' PFC ', ' LOCAL ']);
	});

	it('keeps retired built-in ranks displayable and ordered by their pay grade', () => {
		expect(resolveBuiltInRank('SP4')).toMatchObject({
			label: 'Specialist Four',
			payGrade: 'E-4',
			state: 'retired'
		});

		expect(['PFC', 'SP4', 'SGT'].sort(compareRankCodes)).toEqual(['SGT', 'SP4', 'PFC']);
	});

	it('can order ranks from lowest to highest pay-grade precedence', () => {
		const ordered = ['WO1', 'CPT', 'PFC', 'SGT'].sort((a, b) =>
			compareRankCodes(a, b, { direction: 'lowest-to-highest' })
		);

		expect(ordered).toEqual(['PFC', 'SGT', 'WO1', 'CPT']);
	});

	it('sorts ungraded civilian, custom, and unknown ranks after graded ranks', () => {
		const ordered = ['CUSTOM', 'LOCAL', 'CIV', 'SGT'].sort(compareRankCodes);

		expect(ordered).toEqual(['SGT', 'CIV', 'CUSTOM', 'LOCAL']);
	});
});
