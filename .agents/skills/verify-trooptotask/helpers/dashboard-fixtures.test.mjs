import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedDashboard, seedDashboardCurrency, seedDashboardOverflow } from './dashboard-fixtures.mjs';

for (const [name, seed, initial] of [
	['combined', seedDashboard, []],
	[
		'currency',
		seedDashboardCurrency,
		[{ kind: 'dashboard', table: 'personnel', organization: 'orgA', ids: ['loss', 'archived'] }]
	]
])
	test(`${name}: an interrupted source insert leaves complete tenant-bound cleanup ownership and refuses a duplicate cohort`, async () => {
		const fixture = {
			ids: Object.fromEntries(
				[
					'orgA',
					'orgB',
					'groupA',
					'groupB',
					'personA',
					'personB',
					'personUnassigned',
					'personForeign',
					'trainingRequired',
					'trainingTargeted',
					'typePersonnel',
					'typeGroup',
					'onboardingTemplate',
					'onboardingCheckbox',
					'onboardingPaperwork',
					'onboardingTraining'
				].map((key) => [key, key])
			),
			dates: { ui: '2026-10-03' }
		};
		const ownedState = { seeded: structuredClone(initial) };
		let persisted;
		let inserts = 0;
		const client = {
			from(table) {
				return {
					async insert(rows) {
						assert.ok(persisted, 'Cleanup ownership must precede provider writes.');
						for (const row of rows) {
							const owner = persisted.seeded.find(
								(item) => item.table === table && fixture.ids[item.organization] === row.organization_id
							);
							assert.ok(
								owner?.ids.includes(row.id),
								'Every attempted row must have its exact table/tenant cleanup owner.'
							);
						}
						inserts++;
						return { error: table === 'personnel_trainings' ? { message: 'provider interrupted' } : null };
					}
				};
			}
		};
		const input = {
			client,
			fixture,
			tag: 'recovery',
			ownedState,
			save: async (value) => {
				persisted = structuredClone(value);
			}
		};
		await assert.rejects(seed(input), /provider interrupted/);
		assert.ok(
			persisted.seeded.some(({ organization }) => organization === 'orgB'),
			'The later foreign sentinel also remains recoverable.'
		);
		assert.equal(inserts, 2);
		await assert.rejects(seed(input), /Clean the existing Dashboard/);
		assert.equal(inserts, 2, 'A duplicate cohort must make no provider write.');
	});

test('overflow: journals People before their leave entries, keeps ETS to four, and refuses a duplicate cohort', async () => {
	const fixture = {
		ids: Object.fromEntries(['orgA', 'groupA', 'statusLeave'].map((key) => [key, key])),
		dates: { ui: '2026-10-03' }
	};
	const ownedState = { seeded: [] };
	const written = [];
	let persisted;
	const client = {
		from(table) {
			return {
				async insert(rows) {
					assert.ok(persisted, 'Cleanup ownership must precede provider writes.');
					written.push([table, rows]);
					return { error: null };
				}
			};
		}
	};
	const input = {
		client,
		fixture,
		tag: 'tag',
		ownedState,
		save: async (value) => {
			persisted = structuredClone(value);
		}
	};
	const result = await seedDashboardOverflow(input);
	assert.deepEqual(
		persisted.seeded.map(({ table }) => table),
		['personnel', 'availability_entries']
	);
	const [[, people], [, entries]] = written;
	assert.equal(people.length, 7);
	assert.deepEqual(
		people.map(({ ets }) => ets),
		['2026-10-23', '2026-10-28', '2026-11-02', '2026-11-07', undefined, undefined, undefined]
	);
	assert.deepEqual(
		entries.map(({ personnel_id }) => personnel_id),
		people.map(({ id }) => id)
	);
	assert.ok(entries.every((entry) => entry.start_date === '2026-10-03' && entry.end_date === '2026-10-06'));
	assert.equal(result.people.length, 7);
	await assert.rejects(seedDashboardOverflow(input), /Clean the existing Dashboard overflow/);
	assert.equal(written.length, 2, 'A duplicate cohort must make no provider write.');
});
