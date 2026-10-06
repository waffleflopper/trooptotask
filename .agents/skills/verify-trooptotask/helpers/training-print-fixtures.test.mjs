import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedTrainingPrint, cleanTrainingPrint } from './training-print-fixtures.mjs';

function setup() {
	const fixture = {
		ids: { orgA: 'org-a', orgB: 'org-b' },
		dates: { ui: '2026-10-05' },
		actors: { trainingConfigure: { id: 'configure' } }
	};
	const originals = ['groups', 'personnel', 'training_types', 'training_views', 'personnel_trainings'].map((table) => [
		table,
		[
			{ id: `original-${table}`, organization_id: 'org-a' },
			{ id: `foreign-${table}`, organization_id: 'org-b' }
		]
	]);
	const stored = new Map(structuredClone(originals));
	const ownedState = {
		seeded: [{ kind: 'another-fixture', table: 'personnel', organization: 'orgA', ids: ['other'] }]
	};
	let journal;
	let failInsert;
	let failDelete;
	let writes = 0;
	const client = {
		from(table) {
			return {
				async insert(rows) {
					writes++;
					for (const row of rows) {
						assert.ok(
							journal.seeded.some(
								(item) =>
									item.table === table &&
									fixture.ids[item.organization] === row.organization_id &&
									item.ids.includes(row.id)
							),
							'Every attempted row is already journaled with its tenant.'
						);
					}
					if (failInsert === writes) return { error: { message: 'insert interrupted' } };
					stored.get(table).push(...structuredClone(rows));
					return { error: null };
				},
				delete() {
					return {
						eq(column, organization) {
							assert.equal(column, 'organization_id');
							return {
								async in(column, ids) {
									assert.equal(column, 'id');
									if (failDelete === table) return { error: { message: 'cleanup interrupted' } };
									stored.set(
										table,
										stored.get(table).filter((row) => row.organization_id !== organization || !ids.includes(row.id))
									);
									return { error: null };
								}
							};
						}
					};
				}
			};
		}
	};
	const input = {
		client,
		fixture,
		tag: 'recovery',
		ownedState,
		save: async (state) => {
			journal = structuredClone(state);
		}
	};
	return {
		input,
		stored,
		originals,
		journal: () => journal,
		writes: () => writes,
		interruptInsert: (ordinal) => {
			failInsert = ordinal;
		},
		interruptCleanup: (table) => {
			failDelete = table;
		}
	};
}

for (const ordinal of [1, 2, 4, 5, 6, 12, 24]) {
	test(`interrupted insert ${ordinal} leaves recoverable ownership and preserves original rows`, async () => {
		const run = setup();
		run.interruptInsert(ordinal);
		await assert.rejects(seedTrainingPrint(run.input), /insert interrupted/);
		assert.equal(run.journal().seeded.filter((item) => item.kind === 'training-print').length, 5);
		await assert.rejects(seedTrainingPrint(run.input), /Clean the existing training-print/);
		assert.equal(run.writes(), ordinal, 'A retry must not create a second cohort.');
		await cleanTrainingPrint({ ...run.input, ownedState: run.journal() });
		assert.deepEqual([...run.stored], run.originals);
		assert.deepEqual(run.journal().seeded, [
			{ kind: 'another-fixture', table: 'personnel', organization: 'orgA', ids: ['other'] }
		]);
	});
}

test('a failed ownership save prevents every provider write', async () => {
	const run = setup();
	await assert.rejects(
		seedTrainingPrint({
			...run.input,
			save: async () => {
				throw new Error('journal unavailable');
			}
		}),
		/journal unavailable/
	);
	assert.equal(run.writes(), 0);
	assert.deepEqual([...run.stored], run.originals);
});

test('cleanup resumes after a failed delete and keeps unrelated seed ownership', async () => {
	const run = setup();
	await seedTrainingPrint(run.input);
	const recovered = { ...run.input, ownedState: run.journal() };
	const trainingType = recovered.ownedState.seeded.find((item) => item.table === 'training_types').ids[0];
	run.stored.get('training_types').push({ id: trainingType, organization_id: 'org-b' });
	run.interruptCleanup('training_types');
	await assert.rejects(cleanTrainingPrint(recovered), /cleanup interrupted/);
	assert.deepEqual(
		run
			.journal()
			.seeded.filter((item) => item.kind === 'training-print')
			.map((item) => item.table),
		['groups', 'personnel', 'training_types']
	);
	run.interruptCleanup(null);
	await cleanTrainingPrint({ ...run.input, ownedState: run.journal() });
	await cleanTrainingPrint({ ...run.input, ownedState: run.journal() });
	const expected = structuredClone(run.originals);
	expected.find(([table]) => table === 'training_types')[1].push({ id: trainingType, organization_id: 'org-b' });
	assert.deepEqual([...run.stored], expected);
	assert.deepEqual(run.journal().seeded, [
		{ kind: 'another-fixture', table: 'personnel', organization: 'orgA', ids: ['other'] }
	]);
});
