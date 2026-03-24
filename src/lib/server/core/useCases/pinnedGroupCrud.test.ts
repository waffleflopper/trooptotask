import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createPinnedGroupUseCases } from './pinnedGroupCrud';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
	subscription: ReturnType<typeof createTestSubscriptionPort>;
};

function buildContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
}): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext(overrides?.auth);
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	const subscription = createTestSubscriptionPort();
	return {
		store,
		rawStore: store,
		auth,
		audit: auditPort,
		readOnlyGuard,
		subscription,
		auditPort,
		notifications: createTestNotificationPort()
	};
}

describe('Pinned groups — replace', () => {
	it('replaces all pinned groups for the user', async () => {
		const ctx = buildContext();
		const { replace } = createPinnedGroupUseCases();

		// Seed existing pins
		ctx.store.seed('user_pinned_groups', [
			{ id: 'pg-1', user_id: 'test-user', organization_id: 'test-org', group_name: 'Old Group', sort_order: 0 }
		]);

		const result = await replace(ctx, ['Alpha', 'Bravo']);

		expect(result).toEqual({ success: true, groups: ['Alpha', 'Bravo'] });

		const stored = (await ctx.store.findMany('user_pinned_groups', 'test-org')) as Record<string, unknown>[];
		expect(stored).toHaveLength(2);
		expect(stored[0].group_name).toBe('Alpha');
		expect(stored[1].group_name).toBe('Bravo');
	});

	it('returns no-op for sandbox mode (null userId)', async () => {
		const ctx = buildContext({ auth: { userId: null } });
		const { replace } = createPinnedGroupUseCases();

		const result = await replace(ctx, ['Alpha']);
		expect(result).toEqual({ success: true, groups: [] });
	});
});

describe('Pinned groups — pin', () => {
	it('pins a single group', async () => {
		const ctx = buildContext();
		const { pin } = createPinnedGroupUseCases();

		const result = (await pin(ctx, { groupName: 'Alpha', sortOrder: 0 })) as Record<string, unknown>;

		expect(result.groupName).toBe('Alpha');
		expect(result.sortOrder).toBe(0);

		const stored = await ctx.store.findMany('user_pinned_groups', 'test-org');
		expect(stored).toHaveLength(1);
	});

	it('returns no-op for sandbox mode', async () => {
		const ctx = buildContext({ auth: { userId: null } });
		const { pin } = createPinnedGroupUseCases();

		const result = await pin(ctx, { groupName: 'Alpha', sortOrder: 0 });
		expect(result).toEqual({ success: true });
	});
});

describe('Pinned groups — unpin', () => {
	it('unpins a group by name', async () => {
		const ctx = buildContext();
		const { unpin } = createPinnedGroupUseCases();

		ctx.store.seed('user_pinned_groups', [
			{ id: 'pg-1', user_id: 'test-user', organization_id: 'test-org', group_name: 'Alpha', sort_order: 0 },
			{ id: 'pg-2', user_id: 'test-user', organization_id: 'test-org', group_name: 'Bravo', sort_order: 1 }
		]);

		await unpin(ctx, 'Alpha');

		const stored = (await ctx.store.findMany('user_pinned_groups', 'test-org')) as Record<string, unknown>[];
		expect(stored).toHaveLength(1);
		expect(stored[0].group_name).toBe('Bravo');
	});

	it('returns no-op for sandbox mode', async () => {
		const ctx = buildContext({ auth: { userId: null } });
		const { unpin } = createPinnedGroupUseCases();

		const result = await unpin(ctx, 'Alpha');
		expect(result).toEqual({ success: true });
	});
});
