import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedDashboard } from './dashboard-fixtures.mjs';

test('an interrupted source insert leaves complete tenant-bound cleanup ownership and refuses a duplicate cohort', async () => {
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
	const ownedState = { seeded: [] };
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
	await assert.rejects(seedDashboard(input), /provider interrupted/);
	assert.ok(
		persisted.seeded.some(({ organization }) => organization === 'orgB'),
		'The later foreign sentinel also remains recoverable.'
	);
	assert.equal(inserts, 2);
	await assert.rejects(seedDashboard(input), /Clean the existing Dashboard seed/);
	assert.equal(inserts, 2, 'A duplicate cohort must make no provider write.');
});
