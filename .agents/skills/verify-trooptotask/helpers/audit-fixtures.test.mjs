import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedAudit } from './audit-fixtures.mjs';

test('an interrupted second Organization insert retains every attempted ID and both cleanup scopes', async () => {
	const fixture = {
		ids: Object.fromEntries(
			[
				'orgA',
				'orgB',
				'personA',
				'personForeign',
				'trainingRequired',
				'trainingForeignType',
				'statusLeave',
				'statusForeign'
			].map((name) => [name, name])
		),
		actors: { orgOwner: { id: 'owner-A' }, orgSettingsPeer: { id: 'owner-B' } }
	};
	const ownedState = { seeded: [] };
	let persisted;
	const attempts = [];
	const client = {
		from(table) {
			return {
				async insert(rows) {
					assert.equal(table, 'audit_logs');
					assert.ok(persisted, 'Record cleanup ownership before any write.');
					assert.deepEqual(
						persisted.seeded.map(({ organization }) => organization),
						['orgA', 'orgB']
					);
					for (const row of rows) {
						const owner = persisted.seeded.find((item) => fixture.ids[item.organization] === row.org_id);
						assert.ok(owner.ids.includes(row.id));
					}
					attempts.push(...rows);
					return rows[0].org_id === 'orgB' ? { error: { message: 'interrupted insert' } } : { error: null };
				}
			};
		}
	};
	await assert.rejects(
		seedAudit({
			client,
			fixture,
			tag: 'recovery',
			ownedState,
			save: async (value) => {
				persisted = structuredClone(value);
			}
		}),
		/interrupted insert/
	);
	assert.equal(attempts.length, 111);
	assert.equal(new Set(persisted.seeded.flatMap(({ ids }) => ids)).size, 111);
	await assert.rejects(
		seedAudit({ client, fixture, tag: 'duplicate', ownedState, save: async () => {} }),
		/Clean the existing audit seed/
	);
	assert.equal(attempts.length, 111, 'A duplicate cohort must make no provider write.');
});
