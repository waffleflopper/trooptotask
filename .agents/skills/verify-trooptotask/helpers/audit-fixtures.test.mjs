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
		actors: { orgOwner: { id: 'owner-A' }, orgAdmin: { id: 'admin-A' }, orgSettingsPeer: { id: 'owner-B' } }
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

test('the old entry is the only one a person, member or kind filter can reach', async () => {
	const fixture = {
		ids: {
			orgA: 'orgA',
			orgB: 'orgB',
			personA: 'personA',
			personForeign: 'pf',
			trainingRequired: 't',
			trainingForeignType: 'tf',
			statusLeave: 's',
			statusForeign: 'sf'
		},
		actors: { orgOwner: { id: 'owner-A' }, orgAdmin: { id: 'admin-A' }, orgSettingsPeer: { id: 'owner-B' } }
	};
	const seeded = await seedAudit({
		client: { from: () => ({ insert: async () => ({ error: null }) }) },
		fixture,
		tag: 'filters',
		ownedState: { seeded: [] },
		save: async () => {}
	});
	const inA = seeded.rows.filter(
		(row) => row.org_id === 'orgA' && !row.action.startsWith('auth.') && !row.action.startsWith('security.')
	);

	const old = inA.filter((row) => row.subject_personnel_id === 'personA');
	assert.deepEqual(
		old.map((row) => row.id),
		[seeded.witnesses.old]
	);
	assert.deepEqual(
		inA.filter((row) => row.user_id === 'admin-A').map((row) => row.id),
		[seeded.witnesses.old]
	);
	assert.deepEqual(
		inA.filter((row) => row.action === 'personnel.updated').map((row) => row.id),
		[seeded.witnesses.old]
	);
	assert.equal(inA.filter((row) => row.timestamp > old[0].timestamp).length, 105);
});
