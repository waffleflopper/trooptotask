import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestContext,
	createTestSubscriptionPort,
	createWritePortsContext,
	createWriteWithNotificationsPortsContext,
	createWriteWithSubscriptionPortsContext,
	createQueryPortsContext,
	createQueryWithRawStorePortsContext,
	createUserWritePortsContext
} from './inMemory';

describe('InMemoryDataStore', () => {
	describe('insert + findOne', () => {
		it('auto-generates a UUID id when none provided', async () => {
			const store = createInMemoryDataStore();
			const inserted = await store.insert<{ id: string; name: string }>('people', 'org-1', {
				name: 'Alice'
			});

			expect(inserted.id).toBeDefined();
			expect(typeof inserted.id).toBe('string');
			expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/);
		});

		it('preserves explicit id when provided', async () => {
			const store = createInMemoryDataStore();
			const inserted = await store.insert<{ id: string }>('people', 'org-1', {
				id: 'my-custom-id',
				name: 'Bob'
			});

			expect(inserted.id).toBe('my-custom-id');
		});

		it('inserts a record and retrieves it by filters', async () => {
			const store = createInMemoryDataStore();
			const inserted = await store.insert<{ id: string; name: string }>('people', 'org-1', {
				id: 'p-1',
				name: 'Alice'
			});

			expect(inserted).toEqual({ id: 'p-1', name: 'Alice', organization_id: 'org-1' });

			const found = await store.findOne<{ id: string; name: string }>('people', 'org-1', {
				id: 'p-1'
			});
			expect(found).toEqual({ id: 'p-1', name: 'Alice', organization_id: 'org-1' });
		});

		it('scopes findOne by orgId — cannot find other org records', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });

			const found = await store.findOne('people', 'org-2', { id: 'p-1' });
			expect(found).toBeNull();
		});

		it('returns null when no matching record exists', async () => {
			const store = createInMemoryDataStore();
			const found = await store.findOne('people', 'org-1', { id: 'nonexistent' });
			expect(found).toBeNull();
		});
	});

	describe('findMany', () => {
		it('returns all records for an org when no filters given', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });
			await store.insert('people', 'org-1', { id: 'p-2', name: 'Bob' });

			const results = await store.findMany<{ id: string; name: string }>('people', 'org-1');
			expect(results).toHaveLength(2);
		});

		it('returns empty array when no records match', async () => {
			const store = createInMemoryDataStore();
			const results = await store.findMany('people', 'org-1');
			expect(results).toEqual([]);
		});

		it('filters by eq filters in options', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice', role: 'admin' });
			await store.insert('people', 'org-1', { id: 'p-2', name: 'Bob', role: 'member' });

			const results = await store.findMany<{ id: string }>('people', 'org-1', undefined, {
				filters: { role: 'admin' }
			});
			expect(results).toHaveLength(1);
			expect(results[0]).toMatchObject({ id: 'p-1' });
		});

		it('filters by inFilters (value in array)', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });
			await store.insert('people', 'org-1', { id: 'p-2', name: 'Bob' });
			await store.insert('people', 'org-1', { id: 'p-3', name: 'Charlie' });

			const results = await store.findMany<{ id: string }>('people', 'org-1', undefined, {
				inFilters: { id: ['p-1', 'p-3'] }
			});
			expect(results).toHaveLength(2);
			expect(results.map((r) => r.id)).toEqual(expect.arrayContaining(['p-1', 'p-3']));
		});

		it('orders by column ascending', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-2', name: 'Bob' });
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });

			const results = await store.findMany<{ name: string }>('people', 'org-1', undefined, {
				orderBy: [{ column: 'name', ascending: true }]
			});
			expect(results[0]).toMatchObject({ name: 'Alice' });
			expect(results[1]).toMatchObject({ name: 'Bob' });
		});

		it('orders by column descending', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });
			await store.insert('people', 'org-1', { id: 'p-2', name: 'Bob' });

			const results = await store.findMany<{ name: string }>('people', 'org-1', undefined, {
				orderBy: [{ column: 'name', ascending: false }]
			});
			expect(results[0]).toMatchObject({ name: 'Bob' });
			expect(results[1]).toMatchObject({ name: 'Alice' });
		});

		it('limits the number of results', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });
			await store.insert('people', 'org-1', { id: 'p-2', name: 'Bob' });
			await store.insert('people', 'org-1', { id: 'p-3', name: 'Charlie' });

			const results = await store.findMany('people', 'org-1', undefined, { limit: 2 });
			expect(results).toHaveLength(2);
		});

		it('combines filters with the top-level filters parameter', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice', role: 'admin' });
			await store.insert('people', 'org-1', { id: 'p-2', name: 'Bob', role: 'member' });

			const results = await store.findMany<{ id: string }>('people', 'org-1', { role: 'member' });
			expect(results).toHaveLength(1);
			expect(results[0]).toMatchObject({ id: 'p-2' });
		});
	});

	describe('update', () => {
		it('updates an existing record and returns the updated data', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice', role: 'member' });

			const updated = await store.update<{ id: string; name: string; role: string }>('people', 'org-1', 'p-1', {
				role: 'admin'
			});

			expect(updated).toMatchObject({ id: 'p-1', name: 'Alice', role: 'admin' });

			const found = await store.findOne<{ role: string }>('people', 'org-1', { id: 'p-1' });
			expect(found).toMatchObject({ role: 'admin' });
		});

		it('throws when record does not exist', async () => {
			const store = createInMemoryDataStore();
			await expect(store.update('people', 'org-1', 'nonexistent', { name: 'Ghost' })).rejects.toThrow();
		});

		it('cannot update a record from a different org', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });

			await expect(store.update('people', 'org-2', 'p-1', { name: 'Hacker' })).rejects.toThrow();
		});
	});

	describe('delete', () => {
		it('removes a record by id', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });

			await store.delete('people', 'org-1', 'p-1');

			const found = await store.findOne('people', 'org-1', { id: 'p-1' });
			expect(found).toBeNull();
		});

		it('throws when record does not exist', async () => {
			const store = createInMemoryDataStore();
			await expect(store.delete('people', 'org-1', 'nonexistent')).rejects.toThrow();
		});

		it('cannot delete a record from a different org', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });

			await expect(store.delete('people', 'org-2', 'p-1')).rejects.toThrow();
		});
	});

	describe('deleteManyByIds', () => {
		it('deletes multiple records by id in one call and returns count', async () => {
			const store = createInMemoryDataStore();
			await store.insert('records', 'org-1', { id: 'r-1', name: 'A' });
			await store.insert('records', 'org-1', { id: 'r-2', name: 'B' });
			await store.insert('records', 'org-1', { id: 'r-3', name: 'C' });

			const deleted = await store.deleteManyByIds('records', 'org-1', ['r-1', 'r-3']);
			expect(deleted).toBe(2);

			const remaining = await store.findMany('records', 'org-1');
			expect(remaining).toHaveLength(1);
			expect(remaining[0]).toMatchObject({ id: 'r-2' });
		});

		it('returns 0 for non-existent ids', async () => {
			const store = createInMemoryDataStore();
			await store.insert('records', 'org-1', { id: 'r-1', name: 'A' });

			const deleted = await store.deleteManyByIds('records', 'org-1', ['nonexistent']);
			expect(deleted).toBe(0);
		});

		it('does not delete records from other orgs', async () => {
			const store = createInMemoryDataStore();
			await store.insert('records', 'org-1', { id: 'r-1', name: 'A' });
			await store.insert('records', 'org-2', { id: 'r-2', name: 'B' });

			const deleted = await store.deleteManyByIds('records', 'org-1', ['r-1', 'r-2']);
			expect(deleted).toBe(1);

			const org2Records = await store.findMany('records', 'org-2');
			expect(org2Records).toHaveLength(1);
		});
	});

	describe('deleteWhere', () => {
		it('removes all records matching filters', async () => {
			const store = createInMemoryDataStore();
			await store.insert('records', 'org-1', { id: 'r-1', type_id: 'tt-1' });
			await store.insert('records', 'org-1', { id: 'r-2', type_id: 'tt-1' });
			await store.insert('records', 'org-1', { id: 'r-3', type_id: 'tt-2' });

			await store.deleteWhere('records', 'org-1', { type_id: 'tt-1' });

			const remaining = await store.findMany('records', 'org-1');
			expect(remaining).toHaveLength(1);
			expect(remaining[0]).toMatchObject({ id: 'r-3' });
		});

		it('does not affect records in other orgs', async () => {
			const store = createInMemoryDataStore();
			await store.insert('records', 'org-1', { id: 'r-1', type_id: 'tt-1' });
			await store.insert('records', 'org-2', { id: 'r-2', type_id: 'tt-1' });

			await store.deleteWhere('records', 'org-1', { type_id: 'tt-1' });

			const org2Records = await store.findMany('records', 'org-2');
			expect(org2Records).toHaveLength(1);
		});
	});

	describe('insertMany', () => {
		it('auto-generates UUIDs for each inserted record', async () => {
			const store = createInMemoryDataStore();
			const results = await store.insertMany<{ id: string; name: string }>('people', 'org-1', [
				{ name: 'Alice' },
				{ name: 'Bob' }
			]);

			expect(results[0].id).toBeDefined();
			expect(results[1].id).toBeDefined();
			expect(results[0].id).not.toBe(results[1].id);
		});

		it('inserts multiple records and returns them all', async () => {
			const store = createInMemoryDataStore();
			const results = await store.insertMany<{ id: string; name: string }>('people', 'org-1', [
				{ id: 'p-1', name: 'Alice' },
				{ id: 'p-2', name: 'Bob' }
			]);

			expect(results).toHaveLength(2);
			expect(results[0]).toMatchObject({ id: 'p-1', organization_id: 'org-1' });
			expect(results[1]).toMatchObject({ id: 'p-2', organization_id: 'org-1' });

			const all = await store.findMany('people', 'org-1');
			expect(all).toHaveLength(2);
		});
	});

	describe('multi-org isolation', () => {
		it('findMany only returns records for the queried org', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });
			await store.insert('people', 'org-2', { id: 'p-2', name: 'Bob' });
			await store.insert('people', 'org-1', { id: 'p-3', name: 'Charlie' });

			const org1 = await store.findMany('people', 'org-1');
			const org2 = await store.findMany('people', 'org-2');

			expect(org1).toHaveLength(2);
			expect(org2).toHaveLength(1);
		});

		it('delete in one org does not affect another org', async () => {
			const store = createInMemoryDataStore();
			await store.insert('people', 'org-1', { id: 'p-1', name: 'Alice' });
			await store.insert('people', 'org-2', { id: 'p-2', name: 'Bob' });

			await store.delete('people', 'org-1', 'p-1');

			const org2 = await store.findMany('people', 'org-2');
			expect(org2).toHaveLength(1);
		});
	});

	describe('seed', () => {
		it('pre-populates a table for test setup', async () => {
			const store = createInMemoryDataStore();
			store.seed('training_types', [
				{ id: 'tt-1', name: 'First Aid', organization_id: 'org-1' },
				{ id: 'tt-2', name: 'CPR', organization_id: 'org-1' }
			]);

			const results = await store.findMany('training_types', 'org-1');
			expect(results).toHaveLength(2);
		});

		it('seeded data is queryable by findOne', async () => {
			const store = createInMemoryDataStore();
			store.seed('types', [{ id: 't-1', name: 'Test', organization_id: 'org-1' }]);

			const found = await store.findOne('types', 'org-1', { id: 't-1' });
			expect(found).toMatchObject({ id: 't-1', name: 'Test' });
		});
	});

	describe('updateById', () => {
		it('updates a row by id without requiring organization_id match', async () => {
			const store = createInMemoryDataStore();
			// Seed directly — no organization_id on this row (like the organizations table)
			store.seed('organizations', [{ id: 'org-1', name: 'Old Name', archive_retention_months: 36 }]);

			const updated = await store.updateById<{ id: string; name: string; archive_retention_months: number }>(
				'organizations',
				'org-1',
				{ archive_retention_months: 12 }
			);

			expect(updated.archive_retention_months).toBe(12);
			expect(updated.name).toBe('Old Name'); // unchanged fields preserved
		});

		it('throws when no row matches the id', async () => {
			const store = createInMemoryDataStore();

			await expect(store.updateById('organizations', 'nonexistent', { name: 'X' })).rejects.toThrow('Record not found');
		});
	});
});

describe('TestAuthContext', () => {
	it('defaults to owner role with full permissions', () => {
		const auth = createTestAuthContext();

		expect(auth.role).toBe('owner');
		expect(auth.isPrivileged).toBe(true);
		expect(auth.isFullEditor).toBe(true);
		expect(auth.scopedGroupId).toBeNull();
		expect(auth.orgId).toBe('test-org');
		expect(auth.userId).toBe('test-user');
	});

	it('does not throw on any require* call by default', () => {
		const auth = createTestAuthContext();

		expect(() => auth.requireEdit('personnel')).not.toThrow();
		expect(() => auth.requireView('training')).not.toThrow();
		expect(() => auth.requirePrivileged()).not.toThrow();
		expect(() => auth.requireOwner()).not.toThrow();
		expect(() => auth.requireFullEditor()).not.toThrow();
	});

	it('does not throw on group access calls by default', async () => {
		const auth = createTestAuthContext();

		await expect(auth.requireGroupAccess('p-1')).resolves.toBeUndefined();
		await expect(auth.requireGroupAccessBatch(['p-1', 'p-2'])).resolves.toBeUndefined();
		await expect(auth.requireGroupAccessByRecord('table', 'r-1', 'personnel_id')).resolves.toBeUndefined();
	});

	it('allows overriding role and properties', () => {
		const auth = createTestAuthContext({
			role: 'member',
			isPrivileged: false,
			isFullEditor: false,
			scopedGroupId: 'group-A'
		});

		expect(auth.role).toBe('member');
		expect(auth.isPrivileged).toBe(false);
		expect(auth.isFullEditor).toBe(false);
		expect(auth.scopedGroupId).toBe('group-A');
	});

	it('allows overriding requireGroupAccess to throw', async () => {
		const auth = createTestAuthContext({
			scopedGroupId: 'group-A',
			async requireGroupAccess(personnelId: string) {
				if (personnelId === 'p-outside') throw new Error('Access denied');
			}
		});

		await expect(auth.requireGroupAccess('p-inside')).resolves.toBeUndefined();
		await expect(auth.requireGroupAccess('p-outside')).rejects.toThrow('Access denied');
	});

	it('allows overriding requireEdit to throw', () => {
		const auth = createTestAuthContext({
			requireEdit() {
				throw new Error('No edit permission');
			}
		});

		expect(() => auth.requireEdit('personnel')).toThrow('No edit permission');
	});
});

describe('TestAuditPort', () => {
	it('starts with empty events array', () => {
		const audit = createTestAuditPort();
		expect(audit.events).toEqual([]);
	});

	it('collects logged events for assertion', () => {
		const audit = createTestAuditPort();

		audit.log({ action: 'create', resourceType: 'training_record', resourceId: 'tr-1' });
		audit.log({ action: 'delete', resourceType: 'personnel', resourceId: 'p-1', details: { reason: 'test' } });

		expect(audit.events).toHaveLength(2);
		expect(audit.events[0]).toEqual({
			action: 'create',
			resourceType: 'training_record',
			resourceId: 'tr-1'
		});
		expect(audit.events[1]).toMatchObject({
			action: 'delete',
			resourceType: 'personnel',
			details: { reason: 'test' }
		});
	});
});

describe('TestReadOnlyGuard', () => {
	it('defaults to not read-only (false)', async () => {
		const guard = createTestReadOnlyGuard();
		expect(await guard.check()).toBe(false);
	});

	it('can be set to read-only (true)', async () => {
		const guard = createTestReadOnlyGuard(true);
		expect(await guard.check()).toBe(true);
	});
});

describe('TestSubscriptionPort', () => {
	it('defaults to allowing personnel additions', async () => {
		const sub = createTestSubscriptionPort();
		const result = await sub.canAddPersonnel();
		expect(result.allowed).toBe(true);
	});

	it('can be configured to deny personnel additions', async () => {
		const sub = createTestSubscriptionPort(false, 'Limit reached');
		const result = await sub.canAddPersonnel();
		expect(result.allowed).toBe(false);
		expect(result.message).toBe('Limit reached');
	});

	it('tracks tier cache invalidation', () => {
		const sub = createTestSubscriptionPort();
		expect(sub.tierCacheInvalidated).toBe(false);
		sub.invalidateTierCache();
		expect(sub.tierCacheInvalidated).toBe(true);
	});
});

describe('createTestContext', () => {
	it('provides all ports including subscription', () => {
		const ctx = createTestContext();
		expect(ctx.store).toBeDefined();
		expect(ctx.rawStore).toBeDefined();
		expect(ctx.auth).toBeDefined();
		expect(ctx.audit).toBeDefined();
		expect(ctx.readOnlyGuard).toBeDefined();
		expect(ctx.subscription).toBeDefined();
	});

	it('subscription defaults to allowing additions', async () => {
		const ctx = createTestContext();
		const result = await ctx.subscription.canAddPersonnel();
		expect(result.allowed).toBe(true);
	});

	it('accepts subscription override', async () => {
		const ctx = createTestContext({ subscriptionAllowed: false });
		const result = await ctx.subscription.canAddPersonnel();
		expect(result.allowed).toBe(false);
	});
});

describe('Port bundle context builders', () => {
	it('createWritePortsContext returns exactly store, auth, audit, readOnlyGuard', () => {
		const ctx = createWritePortsContext();
		const keys = Object.keys(ctx).sort();
		expect(keys).toEqual(['audit', 'auth', 'readOnlyGuard', 'store']);
	});

	it('createWriteWithNotificationsPortsContext returns WritePorts + notifications', () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const keys = Object.keys(ctx).sort();
		expect(keys).toEqual(['audit', 'auth', 'notifications', 'readOnlyGuard', 'store']);
	});

	it('createWriteWithSubscriptionPortsContext returns WritePorts + subscription', () => {
		const ctx = createWriteWithSubscriptionPortsContext();
		const keys = Object.keys(ctx).sort();
		expect(keys).toEqual(['audit', 'auth', 'readOnlyGuard', 'store', 'subscription']);
	});

	it('createUserWritePortsContext returns exactly store, auth, audit', () => {
		const ctx = createUserWritePortsContext();
		const keys = Object.keys(ctx).sort();
		expect(keys).toEqual(['audit', 'auth', 'store']);
	});

	it('createQueryPortsContext returns exactly store, auth', () => {
		const ctx = createQueryPortsContext();
		const keys = Object.keys(ctx).sort();
		expect(keys).toEqual(['auth', 'store']);
	});

	it('createQueryWithRawStorePortsContext returns store, auth, rawStore', () => {
		const ctx = createQueryWithRawStorePortsContext();
		const keys = Object.keys(ctx).sort();
		expect(keys).toEqual(['auth', 'rawStore', 'store']);
	});
});
