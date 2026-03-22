import { describe, it, expect } from 'vitest';
import { createInMemoryDataStore, createTestAuthContext } from '$lib/server/adapters/inMemory';
import { notifyAdminsViaStore } from './notifyAdminsHelper';

function buildStore() {
	const store = createInMemoryDataStore();
	// Seed two admins and one regular member
	store.seed('organization_memberships', [
		{ user_id: 'admin-1', organization_id: 'test-org', role: 'owner' },
		{ user_id: 'admin-2', organization_id: 'test-org', role: 'admin' },
		{ user_id: 'member-1', organization_id: 'test-org', role: 'member' }
	]);
	return store;
}

describe('notifyAdminsViaStore', () => {
	it('creates notifications for all admins/owners except the actor', async () => {
		const store = buildStore();
		const auth = createTestAuthContext({ userId: 'admin-1' });

		await notifyAdminsViaStore(store, auth.orgId, auth.userId, {
			type: 'config_type_deleted',
			title: 'Type Deleted',
			message: 'Someone deleted a type'
		});

		const notifications = await store.findMany<Record<string, unknown>>('notifications', 'test-org');

		// Should notify admin-2 but NOT admin-1 (the actor) and NOT member-1
		expect(notifications).toHaveLength(1);
		expect(notifications[0]).toMatchObject({
			user_id: 'admin-2',
			type: 'config_type_deleted',
			title: 'Type Deleted'
		});
	});

	it('notifies all admins when no excludeUserId is provided', async () => {
		const store = buildStore();

		await notifyAdminsViaStore(store, 'test-org', null, {
			type: 'test',
			title: 'Test',
			message: 'Test'
		});

		const notifications = await store.findMany<Record<string, unknown>>('notifications', 'test-org');
		expect(notifications).toHaveLength(2);
	});

	it('does nothing when no admins exist', async () => {
		const store = createInMemoryDataStore();
		store.seed('organization_memberships', [{ user_id: 'member-1', organization_id: 'test-org', role: 'member' }]);

		await notifyAdminsViaStore(store, 'test-org', null, {
			type: 'test',
			title: 'Test',
			message: 'Test'
		});

		const notifications = await store.findMany<Record<string, unknown>>('notifications', 'test-org');
		expect(notifications).toHaveLength(0);
	});
});
