import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import { buildTrainingBriefing, matchBriefingRequirements } from './trainingBriefing';
import type { TrainingBriefingInput } from './trainingBriefing.types';
import { getTrainingStatus } from './trainingStatus';

const AS_OF = '2026-09-29';
const VALID = '2030-01-01';
const ALPHA = { groupId: 'alpha', groupName: 'Alpha' };
const BRAVO = { groupId: 'bravo', groupName: 'Bravo' };
const CHARLIE = { groupId: 'charlie', groupName: 'Charlie' };

const EXPIRATION_FOR_LAPSE_BUCKET: Record<number, string> = {
	0: '2026-10-01',
	1: '2026-10-08',
	3: '2026-10-22',
	5: '2026-11-07',
	7: '2026-11-20',
	8: '2026-11-27',
	9: '2026-12-04',
	10: '2026-12-12',
	11: '2026-12-17',
	12: '2026-12-25'
};

function person(id: string, overrides: Partial<Personnel> = {}): Personnel {
	return {
		id,
		rank: 'SGT',
		lastName: id,
		firstName: 'Pat',
		mos: '68W',
		clinicRole: 'Medic',
		...ALPHA,
		...overrides
	};
}

function crew(prefix: string, count: number, overrides: Partial<Personnel> = {}): Personnel[] {
	return Array.from({ length: count }, (_, index) => person(`${prefix}${index + 1}`, overrides));
}

function trainingType(id: string, overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id,
		name: id,
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#000000',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

function record(
	personnelId: string,
	trainingTypeId: string,
	expirationDate: string | null,
	completionDate: string | null = '2025-01-01'
): PersonnelTraining {
	return {
		id: `record-${personnelId}-${trainingTypeId}`,
		personnelId,
		trainingTypeId,
		completionDate,
		expirationDate,
		notes: null,
		certificateUrl: null
	};
}

function validRecords(people: Personnel[], typeIds: string[]): PersonnelTraining[] {
	return people.flatMap((p) => typeIds.map((typeId) => record(p.id, typeId, VALID)));
}

function briefingInput(overrides: Partial<TrainingBriefingInput>): TrainingBriefingInput {
	return {
		personnel: [],
		types: [],
		records: [],
		filters: {},
		horizonDays: 90,
		asOf: AS_OF,
		goalPercent: 90,
		rowsBy: 'group',
		scopeName: 'Test Company',
		...overrides
	};
}

function renew(input: TrainingBriefingInput, keys: Array<[string, string]>): TrainingBriefingInput {
	const renewed = new Set(keys.map(([personId, typeId]) => `${personId}|${typeId}`));
	return {
		...input,
		records: [
			...input.records.filter((r) => !renewed.has(`${r.personnelId}|${r.trainingTypeId}`)),
			...keys.map(([personId, typeId]) => record(personId, typeId, VALID, AS_OF))
		]
	};
}

function requirementKeys(input: TrainingBriefingInput, key: string): Array<[string, string]> | undefined {
	return matchBriefingRequirements(input, { kind: 'focus', key })?.map((r) => [r.personId, r.typeId]);
}

function lapseScenario(typeIds: string[], lapses: Array<[typeId: string, expiration: string]>): TrainingBriefingInput {
	const personnel = lapses.map((_, index) => person(`l${String(index + 1).padStart(2, '0')}`));
	return briefingInput({
		personnel,
		types: typeIds.map((id) => trainingType(id, { name: id.toUpperCase() })),
		records: personnel.flatMap((p, index) =>
			typeIds.map((typeId) => record(p.id, typeId, typeId === lapses[index][0] ? lapses[index][1] : VALID))
		)
	});
}

function repeat(count: number, lapse: [string, string]): Array<[string, string]> {
	return Array.from({ length: count }, () => lapse);
}

function statusFixture(): TrainingBriefingInput {
	return briefingInput({
		personnel: [person('able', { mos: '68W', ...ALPHA }), person('baker', { mos: '11B', ...BRAVO })],
		types: [
			trainingType('cpr', { name: 'CPR' }),
			trainingType('bls', { name: 'BLS', expirationDateOnly: true, expirationMonths: null }),
			trainingType('never', { name: 'Orientation', expirationMonths: null }),
			trainingType('optional', { name: 'Optional', isOptional: true }),
			trainingType('targeted', { name: 'Targeted', appliesToMos: ['68W'] }),
			trainingType('exemptable', { name: 'Exemptable', canBeExempted: true, exemptPersonnelIds: ['baker'] })
		],
		records: [
			record('able', 'cpr', '2026-12-27', '2025-12-27'),
			record('baker', 'cpr', '2026-12-28', '2025-12-28'),
			record('able', 'bls', '2026-10-10', null),
			record('able', 'never', null, null),
			record('baker', 'never', null, '2020-01-01'),
			record('able', 'optional', '2025-01-01'),
			record('able', 'targeted', '2026-09-28', '2025-09-28'),
			record('baker', 'targeted', '2027-01-01', '2026-01-01'),
			record('able', 'exemptable', null, '2026-01-01'),
			record('baker', 'exemptable', '2025-01-01')
		]
	});
}

function dropFixture(): TrainingBriefingInput {
	const alpha = crew('a', 10, ALPHA);
	const bravo = crew('b', 51, BRAVO);
	const lapses: Record<string, string> = {
		a1: EXPIRATION_FOR_LAPSE_BUCKET[1],
		b1: EXPIRATION_FOR_LAPSE_BUCKET[3],
		b2: EXPIRATION_FOR_LAPSE_BUCKET[5],
		b3: EXPIRATION_FOR_LAPSE_BUCKET[7],
		b4: EXPIRATION_FOR_LAPSE_BUCKET[9],
		b5: EXPIRATION_FOR_LAPSE_BUCKET[12]
	};
	return briefingInput({
		personnel: [...alpha, ...bravo],
		types: [trainingType('cpr', { name: 'CPR' })],
		records: [...alpha, ...bravo].map((p) => record(p.id, 'cpr', lapses[p.id] ?? VALID))
	});
}

describe('buildTrainingBriefing readiness ledger', () => {
	it('counts current and expiring as ready and excludes optional, exempt and inapplicable requirements', () => {
		const briefing = buildTrainingBriefing(statusFixture());

		expect(briefing.bottomLine).toEqual({
			scopeName: 'Test Company',
			soldierCount: 2,
			asOf: AS_OF,
			horizonEnd: '2026-12-28',
			horizonEndLabel: '28 Dec',
			today: { ready: 7, applicable: 9, percent: 78, band: 'below' },
			horizon: { ready: 5, applicable: 9, percent: 56, band: 'critical' },
			drop: 22,
			expired: 1,
			notRecorded: 1,
			lapsing: 2,
			sentence: 'If no one renews, Test Company loses 22 points in 90 days.'
		});
		expect(briefing.typeRisk).toEqual([
			{ typeId: 'bls', name: 'BLS', applicable: 2, notReady: 1, lapsing: 1 },
			{ typeId: 'cpr', name: 'CPR', applicable: 2, notReady: 0, lapsing: 1 },
			{ typeId: 'targeted', name: 'Targeted', applicable: 2, notReady: 1, lapsing: 0 },
			{ typeId: 'never', name: 'Orientation', applicable: 2, notReady: 0, lapsing: 0 },
			{ typeId: 'exemptable', name: 'Exemptable', applicable: 1, notReady: 0, lapsing: 0 }
		]);
	});

	it('lapses a requirement expiring the day before the horizon end but not one expiring on it', () => {
		const input = statusFixture();

		expect(matchBriefingRequirements(input, { kind: 'cell', rowKey: null, typeId: 'cpr' })).toEqual([
			{
				personId: 'able',
				typeId: 'cpr',
				rowKey: 'alpha',
				status: 'current',
				label: 'Current',
				completionDate: '2025-12-27',
				expirationDate: '2026-12-27',
				readyToday: true,
				lapseDate: '2026-12-28',
				lapsesInHorizon: true
			}
		]);
	});

	it('lists not-recorded requirements before dated ones and returns an empty list for a valid quiet cell', () => {
		const input = statusFixture();

		expect(matchBriefingRequirements(input, { kind: 'cell', rowKey: null, typeId: 'bls' })).toEqual([
			{
				personId: 'baker',
				typeId: 'bls',
				rowKey: 'bravo',
				status: 'not-completed',
				label: 'Not Done',
				completionDate: null,
				expirationDate: null,
				readyToday: false,
				lapseDate: null,
				lapsesInHorizon: false
			},
			{
				personId: 'able',
				typeId: 'bls',
				rowKey: 'alpha',
				status: 'warning-orange',
				label: '11d left',
				completionDate: null,
				expirationDate: '2026-10-10',
				readyToday: true,
				lapseDate: '2026-10-11',
				lapsesInHorizon: true
			}
		]);
		expect(matchBriefingRequirements(input, { kind: 'cell', rowKey: null, typeId: 'exemptable' })).toEqual([]);
		expect(matchBriefingRequirements(input, { kind: 'cell', rowKey: null, typeId: 'optional' })).toBeNull();
	});

	it('produces an empty briefing with null percentages when nothing applies', () => {
		const briefing = buildTrainingBriefing(briefingInput({ types: [trainingType('cpr')] }));

		expect(briefing.bottomLine.today).toEqual({ ready: 0, applicable: 0, percent: null, band: 'none' });
		expect(briefing.bottomLine.drop).toBeNull();
		expect(briefing.bottomLine.sentence).toBe('Nothing lapses before 28 Dec.');
		expect(briefing.forecast.cliff).toBeNull();
		expect(briefing.forecast.points.every((point) => point.percent === null)).toBe(true);
		expect(briefing.grid.rows).toEqual([]);
		expect(briefing.grid.total.cells[0].today.band).toBe('none');
		expect(briefing.focus).toEqual({ areas: [], emptyMessage: 'Nothing drops more than 1 point by 28 Dec.' });
	});
});

describe('buildTrainingBriefing forecast', () => {
	function bucketEdgeFixture(): TrainingBriefingInput {
		const input = statusFixture();
		return {
			...input,
			personnel: [...input.personnel, person('carl'), person('dana')],
			records: [
				...input.records,
				record('carl', 'cpr', '2026-10-05'),
				record('dana', 'cpr', '2026-10-06'),
				...validRecords([person('carl'), person('dana')], ['bls', 'never', 'targeted', 'exemptable'])
			]
		};
	}

	it('counts each lapse in the weekly bucket that holds its lapse date, with a short final bucket', () => {
		const briefing = buildTrainingBriefing(bucketEdgeFixture());

		expect(briefing.forecast.buckets.map((bucket) => bucket.lapses)).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
		expect(briefing.forecast.buckets[0]).toMatchObject({
			startDate: '2026-09-30',
			endDate: '2026-10-06',
			label: '30 Sep – 6 Oct'
		});
		expect(briefing.forecast.buckets[12]).toMatchObject({
			startDate: '2026-12-23',
			endDate: '2026-12-28',
			label: '23 Dec – 28 Dec'
		});
	});

	it('matches the readiness rollup of getTrainingStatus at every weekly point', () => {
		const input = bucketEdgeFixture();
		const briefing = buildTrainingBriefing(input);
		const readyStates = ['current', 'warning-yellow', 'warning-orange'];

		const rollupOn = (date: string) => {
			let ready = 0;
			let applicable = 0;
			for (const p of input.personnel) {
				for (const type of input.types.filter((t) => !t.isOptional)) {
					const training = input.records.find((r) => r.personnelId === p.id && r.trainingTypeId === type.id);
					const { status } = getTrainingStatus(training, type, p, date);
					if (status === 'not-required' || status === 'exempt') continue;
					applicable++;
					if (readyStates.includes(status)) ready++;
				}
			}
			return { ready, applicable };
		};

		expect(briefing.forecast.points.map((point) => point.date)).toEqual([
			'2026-09-29',
			'2026-10-06',
			'2026-10-13',
			'2026-10-20',
			'2026-10-27',
			'2026-11-03',
			'2026-11-10',
			'2026-11-17',
			'2026-11-24',
			'2026-12-01',
			'2026-12-08',
			'2026-12-15',
			'2026-12-22',
			'2026-12-28'
		]);
		for (const point of briefing.forecast.points) {
			const rollup = rollupOn(point.date);
			expect({ date: point.date, ready: point.ready }).toEqual({ date: point.date, ready: rollup.ready });
			expect(rollup.applicable).toBe(briefing.bottomLine.today.applicable);
		}
		expect(briefing.forecast.points.map((point) => point.ready)).toEqual([
			17, 16, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 13
		]);
	});

	it.each([
		[30, 5, '2026-10-29', '28 Oct – 29 Oct'],
		[60, 9, '2026-11-28', '25 Nov – 28 Nov'],
		[90, 13, '2026-12-28', '23 Dec – 28 Dec'],
		[180, 26, '2027-03-28', '24 Mar – 28 Mar']
	])('splits a %i-day horizon into %i weekly buckets ending on %s', (horizonDays, bucketCount, end, lastLabel) => {
		const briefing = buildTrainingBriefing({ ...statusFixture(), horizonDays });

		expect(briefing.forecast.buckets).toHaveLength(bucketCount);
		expect(briefing.forecast.buckets.at(-1)).toMatchObject({ endDate: end, label: lastLabel });
		expect(briefing.forecast.points).toHaveLength(bucketCount + 1);
		expect(briefing.forecast.points.at(-1)?.date).toBe(end);
		expect(briefing.bottomLine.horizonEnd).toBe(end);
	});

	it.each([
		['America/New_York', '2026-10-30', 7, '2026-11-02', '2026-11-03', '2026-11-06'],
		['America/New_York', '2026-03-07', 7, '2026-03-08', '2026-03-09', '2026-03-14'],
		['UTC', '2028-02-28', 7, '2028-02-29', '2028-03-01', '2028-03-06'],
		['UTC', '2026-01-31', 30, '2026-02-28', '2026-03-01', '2026-03-02']
	])('walks calendar days in %s from %s', (timeZone, asOf, horizonDays, expiration, lapseDate, horizonEnd) => {
		const originalTimeZone = process.env.TZ;
		process.env.TZ = timeZone;
		try {
			const input = briefingInput({
				asOf,
				horizonDays,
				personnel: [person('able')],
				types: [trainingType('cpr')],
				records: [record('able', 'cpr', expiration)]
			});

			expect(buildTrainingBriefing(input).bottomLine.horizonEnd).toBe(horizonEnd);
			expect(matchBriefingRequirements(input, { kind: 'cell', rowKey: null, typeId: 'cpr' })?.[0].lapseDate).toBe(
				lapseDate
			);
		} finally {
			if (originalTimeZone === undefined) delete process.env.TZ;
			else process.env.TZ = originalTimeZone;
		}
	});
});

describe('buildTrainingBriefing cliff window', () => {
	const fortyPercent: Array<[string, string]> = [
		...repeat(6, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[5]]),
		...repeat(2, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[0]]),
		...repeat(3, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[9]]),
		...repeat(2, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[11]]),
		...repeat(2, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[12]])
	];

	it('highlights a window holding exactly 40% of horizon lapses and states its share', () => {
		const briefing = buildTrainingBriefing(lapseScenario(['cpr'], fortyPercent));

		expect(briefing.forecast.cliff).toEqual({
			startDate: '2026-10-21',
			endDate: '2026-11-10',
			label: '21 Oct – 10 Nov',
			caption: '6 lapse · CPR',
			lapses: 6,
			sharePercent: 40,
			highlighted: true,
			dominantTypeIds: ['cpr']
		});
		expect(briefing.forecast.buckets.map((bucket) => bucket.inCliff)).toEqual([
			false,
			false,
			false,
			true,
			true,
			true,
			false,
			false,
			false,
			false,
			false,
			false,
			false
		]);
		expect(briefing.bottomLine.sentence).toBe(
			'If no one renews, Test Company loses 100 points in 90 days. 40% of that drop lands between 21 Oct and 10 Nov.'
		);
	});

	it('does not highlight a window below 40% of horizon lapses', () => {
		const briefing = buildTrainingBriefing(
			lapseScenario(['cpr'], [...fortyPercent, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[12]]])
		);

		expect(briefing.forecast.cliff).toMatchObject({ lapses: 6, sharePercent: 38, highlighted: false });
		expect(briefing.forecast.buckets.some((bucket) => bucket.inCliff)).toBe(false);
		expect(briefing.bottomLine.sentence).toBe('If no one renews, Test Company loses 100 points in 90 days.');
		expect(briefing.focus.areas.some((area) => area.kind === 'wave')).toBe(false);
	});

	it('does not highlight a window just under 40% even when its share displays as 40', () => {
		const briefing = buildTrainingBriefing(
			lapseScenario(
				['cpr'],
				[
					...repeat(21, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[5]]),
					...repeat(8, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[0]]),
					...repeat(8, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[1]]),
					...repeat(8, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[9]]),
					...repeat(8, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[12]])
				]
			)
		);

		expect(briefing.forecast.cliff).toMatchObject({ lapses: 21, sharePercent: 40, highlighted: false });
	});

	it('does not highlight a window with fewer than 5 lapses', () => {
		const briefing = buildTrainingBriefing(lapseScenario(['cpr'], repeat(4, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[3]])));

		expect(briefing.forecast.cliff).toMatchObject({ lapses: 4, sharePercent: 100, highlighted: false });
	});

	it('picks the earliest of equally heavy windows', () => {
		const briefing = buildTrainingBriefing(
			lapseScenario(
				['cpr'],
				[...repeat(5, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[10]]), ...repeat(5, ['cpr', EXPIRATION_FOR_LAPSE_BUCKET[3]])]
			)
		);

		expect(briefing.forecast.cliff).toMatchObject({
			startDate: '2026-10-07',
			endDate: '2026-10-27',
			lapses: 5,
			highlighted: true
		});
		expect(briefing.bottomLine.sentence).toBe(
			'If no one renews, Test Company loses 100 points in 90 days. 50% of that drop lands between 7 Oct and 27 Oct.'
		);
	});

	it.each([
		['one type at exactly 60%', { a: 6, b: 4 }, ['a'], '10 lapse · A'],
		['the top two types', { a: 5, b: 2, c: 3 }, ['a', 'c'], '10 lapse · A and C'],
		['tied types in column order', { a: 2, b: 4, c: 4 }, ['b', 'c'], '10 lapse · B and C'],
		['no pair reaching 60%', { a: 2, b: 2, c: 2, d: 2, e: 2 }, [], '10 lapse']
	])('names the dominant window types for %s', (_case, counts, dominant, caption) => {
		const typeIds = ['a', 'b', 'c', 'd', 'e'];
		const lapses = Object.entries(counts).flatMap(([typeId, count]) =>
			repeat(count, [typeId, EXPIRATION_FOR_LAPSE_BUCKET[3]])
		);
		const scenario = lapseScenario(typeIds, lapses);
		const briefing = buildTrainingBriefing({
			...scenario,
			personnel: scenario.personnel.map((p) => ({ ...p, groupId: p.id, groupName: p.id }))
		});

		expect(briefing.forecast.cliff).toMatchObject({ highlighted: true, dominantTypeIds: dominant, caption });
		expect(briefing.focus.areas.some((area) => area.kind === 'wave')).toBe(dominant.length > 0);
	});
});

describe('buildTrainingBriefing bands', () => {
	function readinessOf(ready: number, total: number, goalPercent: number) {
		const personnel = crew('p', total);
		return buildTrainingBriefing(
			briefingInput({
				personnel,
				goalPercent,
				types: [trainingType('cpr')],
				records: validRecords(personnel.slice(0, ready), ['cpr'])
			})
		).bottomLine.today;
	}

	it.each([
		[170, 'goal'],
		[169, 'near'],
		[150, 'near'],
		[149, 'below'],
		[130, 'below'],
		[129, 'far'],
		[110, 'far'],
		[109, 'critical']
	])('places %i of 200 ready in the %s band for an 85% goal', (ready, band) => {
		expect(readinessOf(ready, 200, 85).band).toBe(band);
	});

	it('keeps 84.5% below an 85% goal even though it displays as 85', () => {
		expect(readinessOf(169, 200, 85)).toEqual({ ready: 169, applicable: 200, percent: 85, band: 'near' });
	});

	it('clips bands below zero for a low goal', () => {
		expect(readinessOf(0, 10, 25).band).toBe('far');
	});

	it.each([
		[90, ['90+', '80s', '70s', '60s', '<60']],
		[85, ['85+', '75–84', '65–74', '55–64', '<55']],
		[25, ['25+', '15–24', '5–14', '<5']],
		[10, ['10+', '<10']]
	])('generates the legend from a %i%% goal', (goalPercent, labels) => {
		const briefing = buildTrainingBriefing(briefingInput({ goalPercent }));

		expect(briefing.grid.legend.map((item) => item.label)).toEqual(labels);
		expect(briefing.grid.legend.map((item) => item.band)).toEqual(
			['goal', 'near', 'below', 'far', 'critical'].slice(0, labels.length)
		);
	});
});

describe('buildTrainingBriefing hot-spot grid', () => {
	function rosterFixture(): TrainingBriefingInput {
		const excluded = { excludedMos: ['42A'] };
		const personnel = [
			person('p1', { ...ALPHA, mos: '68W', clinicRole: 'Medic', rank: 'SGT' }),
			person('p2', { ...ALPHA, mos: '11B', clinicRole: 'Ops: Night', rank: 'SPC' }),
			person('p3', { ...BRAVO, mos: '68W', clinicRole: 'Medic', rank: 'SPC' }),
			person('p4', { groupId: null, groupName: '', mos: '', clinicRole: 'Ops: Night', rank: 'PFC' }),
			person('p5', { ...CHARLIE, mos: '42A', clinicRole: 'Clerk', rank: 'PVT' })
		];
		return briefingInput({
			personnel,
			types: [
				trainingType('bls', { name: 'BLS', sortOrder: 5, ...excluded }),
				trainingType('cpr', { name: 'CPR', sortOrder: 1, ...excluded }),
				trainingType('opt', { name: 'Optional', isOptional: true })
			],
			records: [
				record('p1', 'bls', VALID),
				record('p1', 'cpr', VALID),
				record('p2', 'bls', VALID),
				record('p4', 'bls', VALID),
				record('p4', 'cpr', VALID),
				record('p3', 'opt', VALID)
			]
		});
	}

	const rowSummary = (input: TrainingBriefingInput) => {
		const grid = buildTrainingBriefing(input).grid;
		return {
			columns: grid.columns.map((column) => column.typeId),
			rows: grid.rows.map((row) => [row.key, row.label, row.today.percent]),
			total: grid.total.today.percent
		};
	};

	it('sorts group rows by today readiness with empty rows last and keeps the selected column order', () => {
		const briefing = buildTrainingBriefing(rosterFixture());

		expect(rowSummary(rosterFixture())).toEqual({
			columns: ['bls', 'cpr'],
			rows: [
				['bravo', 'Bravo', 0],
				['alpha', 'Alpha', 75],
				['unassigned', 'Unassigned', 100],
				['charlie', 'Charlie', null]
			],
			total: 63
		});
		expect(briefing.grid.rows[1].cells.map((cell) => [cell.typeId, cell.today.ready, cell.today.applicable])).toEqual([
			['bls', 2, 2],
			['cpr', 1, 2]
		]);
		expect(briefing.grid.rows[3].cells.map((cell) => cell.today.band)).toEqual(['none', 'none']);
		expect(briefing.grid.total).toMatchObject({ key: null, label: 'Total' });
	});

	it('orders exact readiness fractions even when both rows display 85 percent and preserves frozen inputs', () => {
		const alpha = crew('a', 201);
		const zulu = crew('z', 200, { groupId: 'zulu', groupName: 'Zulu' });
		const input = briefingInput({
			personnel: [...alpha, ...zulu],
			types: [trainingType('cpr')],
			records: validRecords([...alpha.slice(0, 170), ...zulu.slice(0, 169)], ['cpr'])
		});
		const original = structuredClone(input);
		function freeze(value: unknown): void {
			if (value === null || typeof value !== 'object') return;
			for (const child of Object.values(value)) freeze(child);
			Object.freeze(value);
		}
		freeze(input);

		expect(
			buildTrainingBriefing(input).grid.rows.map((row) => [
				row.key,
				row.today.ready,
				row.today.applicable,
				row.today.percent
			])
		).toEqual([
			['zulu', 169, 200, 85],
			['alpha', 170, 201, 85]
		]);
		expect(matchBriefingRequirements(input, { kind: 'cell', rowKey: 'zulu', typeId: 'cpr' })).toHaveLength(31);
		expect(input).toEqual(original);
	});

	it('groups rows by raw MOS and duty role values', () => {
		expect(rowSummary({ ...rosterFixture(), rowsBy: 'mos' }).rows).toEqual([
			['11B', '11B', 50],
			['68W', '68W', 50],
			['', 'No MOS', 100],
			['42A', '42A', null]
		]);
		expect(rowSummary({ ...rosterFixture(), rowsBy: 'role' }).rows).toEqual([
			['Medic', 'Medic', 50],
			['Ops: Night', 'Ops: Night', 75],
			['Clerk', 'Clerk', null]
		]);
	});

	it('applies group, rank, multi-select MOS and role, and training type filters', () => {
		const filtered = (filters: TrainingBriefingInput['filters']) => rowSummary({ ...rosterFixture(), filters });

		expect(filtered({ mos: ['68W'] }).total).toBe(50);
		expect(filtered({ mos: ['68W', ''] }).rows.map((row) => row[0])).toEqual(['bravo', 'alpha', 'unassigned']);
		expect(filtered({ groupId: 'alpha', role: ['Ops: Night'] }).rows).toEqual([['alpha', 'Alpha', 50]]);
		expect(filtered({ rank: 'SPC', mos: [], role: [] }).rows.map((row) => row[0])).toEqual(['bravo', 'alpha']);
		expect(filtered({ trainingTypeIds: ['cpr'] })).toMatchObject({ columns: ['cpr'], total: 50 });
		expect(filtered({ trainingTypeIds: ['opt'] })).toMatchObject({ columns: [], total: null });
	});

	it('flags a 10-point drop but not a 9.8-point drop that displays as 10', () => {
		const grid = buildTrainingBriefing(dropFixture()).grid;

		expect(grid.rows.map((row) => [row.label, row.cells[0].drop, row.cells[0].dropAlert, row.drop])).toEqual([
			['Alpha', 10, true, 10],
			['Bravo', 10, false, 10]
		]);
		expect(grid.rows[1].horizon).toEqual({ ready: 46, applicable: 51, percent: 90, band: 'goal' });
		expect(grid.total.cells[0].dropAlert).toBe(false);
	});

	it('rounds the displayed drop once from counts rather than subtracting rounded endpoints', () => {
		const personnel = crew('p', 1000);
		const lapsing = new Set(personnel.slice(0, 93).map((p) => p.id));
		const briefing = buildTrainingBriefing(
			briefingInput({
				personnel,
				types: [trainingType('cpr')],
				records: personnel
					.slice(0, 986)
					.map((p) => record(p.id, 'cpr', lapsing.has(p.id) ? EXPIRATION_FOR_LAPSE_BUCKET[5] : VALID))
			})
		);

		expect(briefing.bottomLine).toMatchObject({
			today: { percent: 99, band: 'goal' },
			horizon: { percent: 89, band: 'near' },
			drop: 9
		});
	});
});

describe('buildTrainingBriefing focus areas', () => {
	function waveFixture(completions: string[]): TrainingBriefingInput {
		const alpha = crew('a', 8, ALPHA);
		const bravo = crew('b', 4, BRAVO);
		const lapsing: PersonnelTraining[] = [
			...completions.map((completion, index) =>
				record(`a${index + 1}`, 'cpr', EXPIRATION_FOR_LAPSE_BUCKET[3], completion)
			),
			record('b1', 'bls', '2026-10-25'),
			record('b2', 'acft', '2026-12-10')
		];
		const lapsingKeys = new Set(lapsing.map((r) => `${r.personnelId}|${r.trainingTypeId}`));
		return briefingInput({
			personnel: [...alpha, ...bravo],
			types: [
				trainingType('cpr', { name: 'CPR' }),
				trainingType('bls', { name: 'BLS' }),
				trainingType('acft', { name: 'ACFT' })
			],
			records: [
				...lapsing,
				...validRecords([...alpha, ...bravo], ['cpr', 'bls', 'acft']).filter(
					(r) => !lapsingKeys.has(`${r.personnelId}|${r.trainingTypeId}`)
				)
			]
		});
	}

	const sharedCompletions = Array.from({ length: 6 }, () => '2025-10-22');
	const waveKeys: Array<[string, string]> = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => [id, 'cpr']);

	it('names the biggest wave hit using the affected types rather than lapse counts or unrelated requirements', () => {
		const alpha = crew('a', 8);
		const bravo = crew('b', 2, { ...BRAVO, mos: '11B' });
		const unrelated = Array.from({ length: 9 }, (_, index) => trainingType(`extra${index}`, { appliesToMos: ['11B'] }));
		const input = briefingInput({
			personnel: [...alpha, ...bravo],
			types: [trainingType('cpr', { name: 'CPR' }), ...unrelated],
			records: [
				...alpha.map((p, index) => record(p.id, 'cpr', index < 5 ? EXPIRATION_FOR_LAPSE_BUCKET[3] : VALID)),
				...bravo.map((p) => record(p.id, 'cpr', EXPIRATION_FOR_LAPSE_BUCKET[3])),
				...validRecords(
					bravo,
					unrelated.map((type) => type.id)
				)
			]
		});
		const briefing = buildTrainingBriefing(input);

		expect(briefing.grid.rows.map((row) => [row.key, row.drop])).toEqual([
			['alpha', 63],
			['bravo', 10]
		]);
		expect(briefing.focus.areas[0]).toMatchObject({
			key: 'wave',
			requirementCount: 7,
			body: '7 of the 7 records lapsing 7 Oct–27 Oct are CPR. Most were completed on 1 Jan 2025, so they lapse together. Bravo takes the biggest hit.'
		});
	});

	it('renders the wave and the row drop it does not cover, with their template copy', () => {
		const input = waveFixture(sharedCompletions);
		const briefing = buildTrainingBriefing(input);

		expect(briefing.bottomLine.sentence).toBe(
			'If no one renews, Test Company loses 22 points in 90 days. More than half of that drop lands between 7 Oct and 27 Oct.'
		);
		expect(briefing.forecast.cliff).toMatchObject({
			label: '7 Oct – 27 Oct',
			caption: '7 lapse · CPR',
			sharePercent: 88
		});
		expect(briefing.focus).toEqual({
			emptyMessage: null,
			areas: [
				{
					kind: 'wave',
					key: 'wave',
					title: 'CPR — the October wave',
					body: '6 of the 7 records lapsing 7 Oct–27 Oct are CPR. Most were completed on 22 Oct 2025, so they lapse together. Alpha takes the biggest hit.',
					whatIf: { chip: 'RENEWED BEFORE 23 Oct · 28 Dec forecast 78% → 94%', before: 78, after: 94 },
					requirementCount: 6,
					soldierCount: 6,
					linkLabel: 'View 6 soldiers',
					typeIds: ['cpr'],
					firstLapseDate: '2026-10-23',
					firstLapseLabel: 'First lapse 23 Oct'
				},
				{
					kind: 'row',
					key: 'row:group:bravo',
					title: 'Bravo — BLS and ACFT',
					body: 'Bravo falls from 100% to 83% by 28 Dec.',
					whatIf: { chip: 'ALL RENEWED · Bravo 28 Dec forecast 83% → 100%', before: 83, after: 100 },
					requirementCount: 2,
					soldierCount: 2,
					linkLabel: 'View 2 soldiers',
					rowKey: 'bravo',
					typeIds: ['bls', 'acft']
				}
			]
		});
	});

	it('matches what-if numbers to a rebuild with the focus records renewed', () => {
		const input = waveFixture(sharedCompletions);

		expect(requirementKeys(input, 'wave')).toEqual(waveKeys);
		expect(requirementKeys(input, 'row:group:bravo')).toEqual([
			['b1', 'bls'],
			['b2', 'acft']
		]);
		expect(buildTrainingBriefing(renew(input, waveKeys)).bottomLine.horizon.percent).toBe(94);
		const renewedBravo = buildTrainingBriefing(
			renew(input, [
				['b1', 'bls'],
				['b2', 'acft']
			])
		);
		expect(renewedBravo.grid.rows.find((row) => row.key === 'bravo')?.horizon.percent).toBe(100);
	});

	it.each([
		['half share one date', ['2025-10-22', '2025-10-22', '2025-10-22', '2025-10-01', '2025-10-02', '2025-10-03'], true],
		[
			'a third share one date',
			['2025-10-22', '2025-10-22', '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04'],
			false
		]
	])(
		'adds the shared-completion sentence only when at least half of the wave records %s',
		(_case, completions, shown) => {
			const wave = buildTrainingBriefing(waveFixture(completions)).focus.areas[0];

			expect(wave.body.includes('Most were completed on 22 Oct 2025, so they lapse together.')).toBe(shown);
		}
	);

	it('rejects unknown, stale or unselected scopes', () => {
		const input = waveFixture(sharedCompletions);

		expect(matchBriefingRequirements(input, { kind: 'focus', key: 'row:group:alpha' })).toBeNull();
		expect(matchBriefingRequirements(input, { kind: 'focus', key: 'gap:cpr' })).toBeNull();
		expect(matchBriefingRequirements(input, { kind: 'focus', key: 'row:mos:bravo' })).toBeNull();
		expect(matchBriefingRequirements(input, { kind: 'cell', rowKey: 'charlie', typeId: 'cpr' })).toBeNull();
		expect(matchBriefingRequirements(input, { kind: 'cell', rowKey: 'bravo', typeId: 'missing' })).toBeNull();
		expect(matchBriefingRequirements(input, { kind: 'cell', rowKey: 'bravo', typeId: 'cpr' })).toEqual([]);
		expect(
			matchBriefingRequirements(input, { kind: 'cell', rowKey: 'bravo', typeId: 'acft' })?.map((r) => r.personId)
		).toEqual(['b2']);
	});

	function gapFixture(groups: Array<typeof ALPHA>): TrainingBriefingInput {
		const personnel = [
			person('a1', { ...groups[0], lastName: 'Zeta' }),
			person('b1', groups[1]),
			person('c1', { ...groups[2], lastName: 'Able' }),
			...crew('x', 7, groups[0])
		];
		return briefingInput({
			personnel,
			types: [trainingType('weapons', { name: 'Weapons' })],
			records: [record('b1', 'weapons', '2026-09-01'), ...validRecords(personnel.slice(3), ['weapons'])]
		});
	}

	it('renders the standing gap with the two rows holding most of its soldiers', () => {
		const input = gapFixture([ALPHA, BRAVO, CHARLIE]);
		const briefing = buildTrainingBriefing(input);

		expect(briefing.bottomLine.sentence).toBe('Nothing lapses before 28 Dec.');
		expect(briefing.focus.areas).toEqual([
			{
				kind: 'gap',
				key: 'gap:weapons',
				title: 'Weapons — the standing gap',
				body: '3 soldiers are already not ready, 30% of Test Company. Alpha and Bravo hold more than half of them.',
				whatIf: { chip: 'ALL RENEWED · 28 Dec forecast 70% → 100%', before: 70, after: 100 },
				requirementCount: 3,
				soldierCount: 3,
				linkLabel: 'View 3 soldiers',
				typeId: 'weapons'
			}
		]);
		expect(requirementKeys(input, 'gap:weapons')).toEqual([
			['c1', 'weapons'],
			['a1', 'weapons'],
			['b1', 'weapons']
		]);
		const renewed = renew(input, [
			['a1', 'weapons'],
			['b1', 'weapons'],
			['c1', 'weapons']
		]);
		expect(buildTrainingBriefing(renewed).bottomLine.horizon.percent).toBe(100);
	});

	it('omits the holders sentence when the top two rows hold exactly half', () => {
		const delta = { groupId: 'delta', groupName: 'Delta' };
		const steady = crew('x', 6, delta);
		const withFourthGap = briefingInput({
			personnel: [person('a1', ALPHA), person('b1', BRAVO), person('c1', CHARLIE), person('d1', delta), ...steady],
			types: [trainingType('weapons', { name: 'Weapons' })],
			records: [record('b1', 'weapons', '2026-09-01'), ...validRecords(steady, ['weapons'])]
		});

		expect(buildTrainingBriefing(withFourthGap).focus.areas[0].body).toBe(
			'4 soldiers are already not ready, 40% of Test Company.'
		);
	});

	it('divides the standing-gap soldiers by the whole filtered population, not the applicable requirements', () => {
		const medics = crew('m', 5, { ...ALPHA, mos: '68W' });
		const riflemen = crew('r', 5, { ...BRAVO, mos: '11B' });
		const briefing = buildTrainingBriefing(
			briefingInput({
				personnel: [...medics, ...riflemen],
				types: [
					trainingType('cert', { name: 'Cert', appliesToMos: ['68W'], canBeExempted: true, exemptPersonnelIds: ['m5'] })
				],
				records: validRecords(medics.slice(1, 4), ['cert'])
			})
		);

		expect(briefing.typeRisk).toEqual([{ typeId: 'cert', name: 'Cert', applicable: 4, notReady: 1, lapsing: 0 }]);
		expect(briefing.focus.areas.map((area) => [area.body, area.whatIf.chip])).toEqual([
			[
				'1 soldiers are already not ready, 10% of Test Company. Alpha hold more than half of them.',
				'ALL RENEWED · 28 Dec forecast 75% → 100%'
			]
		]);
	});

	it.each([
		['exactly 20%', 10, 2, ['gap:gap']],
		['under 20%', 6, 1, []],
		['19.9%, displayed as 20%', 196, 39, []]
	])('opens a standing gap only at 20%% not ready (%s)', (_case, total, notReady, keys) => {
		const personnel = crew('p', total);
		const briefing = buildTrainingBriefing(
			briefingInput({
				personnel,
				types: [trainingType('gap', { name: 'Gap' })],
				records: validRecords(personnel.slice(notReady), ['gap'])
			})
		);

		expect(briefing.focus.areas.map((area) => area.key)).toEqual(keys);
		expect(briefing.focus.emptyMessage).toBe(keys.length ? null : 'Nothing drops more than 1 point by 28 Dec.');
	});

	it.each([
		['recovers exactly 1 point', 95, ['gap:gap']],
		['recovers 0.99 points', 96, []]
	])('keeps a focus area only when it %s', (_case, total, keys) => {
		const personnel = [...crew('m', 5, { mos: '68W' }), ...crew('r', total - 5, { mos: '11B' })];
		const briefing = buildTrainingBriefing(
			briefingInput({
				personnel,
				types: [trainingType('fill'), trainingType('gap', { name: 'Gap', appliesToMos: ['68W'] })],
				records: [...validRecords(personnel, ['fill']), ...validRecords(personnel.slice(1, 5), ['gap'])]
			})
		);

		expect(briefing.focus.areas.map((area) => area.key)).toEqual(keys);
	});

	it('opens a row drop at exactly 10 points but not at 9.8', () => {
		expect(buildTrainingBriefing(dropFixture()).focus.areas).toEqual([
			{
				kind: 'row',
				key: 'row:group:alpha',
				title: 'Alpha — CPR',
				body: 'Alpha falls from 100% to 90% by 28 Dec.',
				whatIf: { chip: 'ALL RENEWED · Alpha 28 Dec forecast 90% → 100%', before: 90, after: 100 },
				requirementCount: 1,
				soldierCount: 1,
				linkLabel: 'View 1 soldiers',
				rowKey: 'alpha',
				typeIds: ['cpr']
			}
		]);
	});

	it('counts soldiers due for both row types and resolves role keys containing colons', () => {
		const night = { clinicRole: 'Medic: Night' };
		const personnel = crew('a', 5, night);
		const lapses = [
			record('a1', 'cpr', EXPIRATION_FOR_LAPSE_BUCKET[1]),
			record('a1', 'bls', EXPIRATION_FOR_LAPSE_BUCKET[5]),
			record('a2', 'cpr', EXPIRATION_FOR_LAPSE_BUCKET[8]),
			record('a3', 'bls', EXPIRATION_FOR_LAPSE_BUCKET[10]),
			record('a4', 'acft', EXPIRATION_FOR_LAPSE_BUCKET[12])
		];
		const lapsingKeys = new Set(lapses.map((r) => `${r.personnelId}|${r.trainingTypeId}`));
		const input = briefingInput({
			personnel,
			rowsBy: 'role',
			types: [
				trainingType('cpr', { name: 'CPR' }),
				trainingType('bls', { name: 'BLS' }),
				trainingType('acft', { name: 'ACFT' })
			],
			records: [
				...lapses,
				...validRecords(personnel, ['cpr', 'bls', 'acft']).filter(
					(r) => !lapsingKeys.has(`${r.personnelId}|${r.trainingTypeId}`)
				)
			]
		});
		const rowKeys: Array<[string, string]> = [
			['a1', 'cpr'],
			['a1', 'bls'],
			['a2', 'cpr'],
			['a3', 'bls']
		];

		expect(buildTrainingBriefing(input).focus.areas).toEqual([
			{
				kind: 'row',
				key: 'row:role:Medic: Night',
				title: 'Medic: Night — CPR and BLS',
				body: 'Medic: Night falls from 100% to 67% by 28 Dec. 1 soldiers are due for both.',
				whatIf: { chip: 'ALL RENEWED · Medic: Night 28 Dec forecast 67% → 93%', before: 67, after: 93 },
				requirementCount: 4,
				soldierCount: 3,
				linkLabel: 'View 3 soldiers',
				rowKey: 'Medic: Night',
				typeIds: ['cpr', 'bls']
			}
		]);
		expect(requirementKeys(input, 'row:role:Medic: Night')).toEqual(rowKeys);
		expect(matchBriefingRequirements(input, { kind: 'focus', key: 'row:role:Medic' })).toBeNull();
		const renewed = buildTrainingBriefing(renew(input, rowKeys));
		expect(renewed.grid.rows[0].horizon.percent).toBe(93);
	});

	it('orders equal scores wave, then gap, then row, regardless of name', () => {
		const alpha = crew('a', 5, ALPHA);
		const bravo = crew('b', 5, BRAVO);
		const charlie = crew('c', 5, CHARLIE);
		const victorLapses = [7, 8, 9, 11, 12];
		const input = briefingInput({
			personnel: [...alpha, ...bravo, ...charlie],
			types: [
				trainingType('yankee', { name: 'Yankee' }),
				trainingType('victor', { name: 'Victor' }),
				trainingType('xray', { name: 'Xray' })
			],
			records: [
				...alpha.flatMap((p) => [
					record(p.id, 'yankee', EXPIRATION_FOR_LAPSE_BUCKET[3]),
					record(p.id, 'victor', VALID),
					record(p.id, 'xray', VALID)
				]),
				...bravo.flatMap((p, index) => [
					record(p.id, 'yankee', VALID),
					record(p.id, 'victor', EXPIRATION_FOR_LAPSE_BUCKET[victorLapses[index]]),
					record(p.id, 'xray', VALID)
				]),
				...validRecords(charlie, ['yankee', 'victor'])
			]
		});
		const briefing = buildTrainingBriefing(input);

		expect(briefing.focus.areas.map((area) => [area.key, area.requirementCount])).toEqual([
			['wave', 5],
			['gap:xray', 5],
			['row:group:bravo', 5]
		]);
		expect(briefing.focus.areas[1].body).toBe(
			'5 soldiers are already not ready, 33% of Test Company. Charlie hold more than half of them.'
		);
	});

	it('caps focus areas at three and breaks equal scores by name', () => {
		const personnel = crew('p', 10);
		const notReady: Record<string, string[]> = {
			alpha: ['p1', 'p2', 'p3', 'p4'],
			echo: ['p5', 'p6', 'p7'],
			zulu: ['p8', 'p9', 'p10'],
			delta: ['p1', 'p2']
		};
		const typeIds = ['zulu', 'echo', 'delta', 'alpha'];
		const briefing = buildTrainingBriefing(
			briefingInput({
				personnel,
				types: typeIds.map((id) => trainingType(id, { name: id[0].toUpperCase() + id.slice(1) })),
				records: typeIds.flatMap((typeId) =>
					personnel.filter((p) => !notReady[typeId].includes(p.id)).map((p) => record(p.id, typeId, VALID))
				)
			})
		);

		expect(briefing.focus.areas.map((area) => area.key)).toEqual(['gap:alpha', 'gap:echo', 'gap:zulu']);
	});

	function overlapFixture(missingUniform: string[]): TrainingBriefingInput {
		const alpha = crew('s', 4, ALPHA);
		const bravo = crew('r', 5, BRAVO);
		const charlie = crew('u', 5, CHARLIE);
		const tango: Record<string, string> = {
			s1: EXPIRATION_FOR_LAPSE_BUCKET[3],
			s2: EXPIRATION_FOR_LAPSE_BUCKET[3],
			s3: EXPIRATION_FOR_LAPSE_BUCKET[3],
			s4: EXPIRATION_FOR_LAPSE_BUCKET[3],
			r1: EXPIRATION_FOR_LAPSE_BUCKET[3],
			r2: EXPIRATION_FOR_LAPSE_BUCKET[3],
			r3: EXPIRATION_FOR_LAPSE_BUCKET[7],
			r4: EXPIRATION_FOR_LAPSE_BUCKET[9],
			r5: EXPIRATION_FOR_LAPSE_BUCKET[11]
		};
		const everyone = [...alpha, ...bravo, ...charlie];
		return briefingInput({
			personnel: everyone,
			types: [trainingType('tango', { name: 'Tango' }), trainingType('uniform', { name: 'Uniform' })],
			records: [
				...everyone.map((p) => record(p.id, 'tango', tango[p.id] ?? VALID)),
				...everyone
					.filter((p) => !missingUniform.includes(p.id))
					.map((p) => record(p.id, 'uniform', p.id === 'r1' ? EXPIRATION_FOR_LAPSE_BUCKET[12] : VALID))
			]
		});
	}

	it('skips a candidate when half its records are already covered by the union of selected areas', () => {
		const briefing = buildTrainingBriefing(overlapFixture(['u1', 'u2', 'u3', 'u4', 'u5']));

		expect(briefing.focus.areas.map((area) => [area.key, area.requirementCount])).toEqual([
			['wave', 6],
			['gap:uniform', 6]
		]);
	});

	it('keeps the same candidate when no single selected area covers half of it', () => {
		const briefing = buildTrainingBriefing(overlapFixture(['u1', 'u2']));

		expect(briefing.focus.areas.map((area) => [area.key, area.requirementCount])).toEqual([
			['wave', 6],
			['row:group:bravo', 6]
		]);
	});
});
