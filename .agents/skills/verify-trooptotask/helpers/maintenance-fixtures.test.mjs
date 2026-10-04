import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedMaintenance, readMaintenance } from './maintenance-fixtures.mjs';

const fixture = { ids: { orgA: 'a', orgB: 'b', personA: 'person' } };

test('interrupted setup retains every attempted target in the durable cleanup ledger', async () => {
	const ownedState = { seeded: [] };
	let persisted;
	const client = {
		from(table) {
			return {
				async insert(rows) {
					assert.ok(persisted, 'Ownership must survive interruption before the first write.');
					for (const row of rows)
						assert.ok(persisted.seeded.some((item) => item.table === table && item.ids.includes(row.id)));
					if (table === 'account_setup_links') return { error: { message: 'controlled interruption' } };
					return { error: null };
				}
			};
		}
	};
	await assert.rejects(
		seedMaintenance({
			client,
			fixture,
			kind: 'maintenance-retention',
			tag: 'test',
			ownedState,
			save: async (value) => {
				persisted = structuredClone(value);
			}
		}),
		/controlled interruption/
	);
	assert.equal(
		persisted.seeded.filter((item) => item.table === 'access_requests').flatMap((item) => item.ids).length,
		6
	);
	assert.equal(
		persisted.seeded.filter((item) => item.table === 'account_setup_links').flatMap((item) => item.ids).length,
		6
	);
});

test('large setup and readback expose all recorded rows without publishing setup token hashes', async () => {
	const ownedState = { seeded: [] };
	const stored = new Map();
	const client = {
		from(table) {
			return {
				async insert(rows) {
					stored.set(table, [...(stored.get(table) ?? []), ...rows]);
					return { error: null };
				},
				select(fields) {
					return {
						in(_field, ids) {
							assert.ok(ids.length <= 100, 'Readback URLs must remain bounded.');
							const rows = stored.get(table).filter((row) => ids.includes(row.id));
							const projected = rows.map((row) =>
								fields === '*' ? row : Object.fromEntries(fields.split(',').map((field) => [field, row[field]]))
							);
							return {
								eq(field, value) {
									return Promise.resolve({ data: projected.filter((row) => row[field] === value), error: null });
								},
								then(resolve) {
									resolve({ data: projected, error: null });
								}
							};
						}
					};
				}
			};
		}
	};
	const result = await seedMaintenance({
		client,
		fixture,
		kind: 'maintenance-retention-1001',
		tag: 'test',
		ownedState,
		save: async () => {}
	});
	assert.equal(stored.get('account_setup_links').length, 1006);
	assert.equal(stored.get('ict_tasks').length, 1005);
	assert.equal(JSON.stringify(result).includes('token_hash'), false);
	const readback = await readMaintenance({ client, fixture, ownedState });
	assert.equal(readback.batches.find((item) => item.table === 'account_setup_links').count, 1006);
	assert.equal(JSON.stringify(readback).includes('token_hash'), false);
});
