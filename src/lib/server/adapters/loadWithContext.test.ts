import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort
} from './inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadWithContextCore } from './httpAdapter';

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }): UseCaseContext {
	const store = createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext(overrides?.auth),
		audit: createTestAuditPort(),
		readOnlyGuard: createTestReadOnlyGuard(),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort()
	};
}

describe('loadWithContextCore', () => {
	it('calls requireView for a FeatureArea permission', async () => {
		let viewCalled = false;
		const ctx = buildCtx({
			auth: {
				requireView() {
					viewCalled = true;
				}
			}
		});

		await loadWithContextCore(ctx, {
			permission: 'personnel',
			fn: async () => ({ items: [] })
		});

		expect(viewCalled).toBe(true);
	});

	it('skips permission check when permission is "none"', async () => {
		let viewCalled = false;
		let editCalled = false;
		const ctx = buildCtx({
			auth: {
				requireView() {
					viewCalled = true;
				},
				requireEdit() {
					editCalled = true;
				}
			}
		});

		const result = await loadWithContextCore(ctx, {
			permission: 'none',
			fn: async () => ({ data: 'hello' })
		});

		expect(viewCalled).toBe(false);
		expect(editCalled).toBe(false);
		expect(result).toEqual({ data: 'hello' });
	});

	it('passes UseCaseContext to fn and returns its result', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('items', [{ id: '1', organization_id: 'test-org', name: 'A' }]);

		const result = await loadWithContextCore(ctx, {
			permission: 'personnel',
			fn: async (c) => {
				const items = await c.store.findMany('items', c.auth.orgId);
				return { items };
			}
		});

		expect(result.items).toHaveLength(1);
	});

	it('calls requirePrivileged for privileged permission', async () => {
		let called = false;
		const ctx = buildCtx({
			auth: {
				requirePrivileged() {
					called = true;
				}
			}
		});

		await loadWithContextCore(ctx, {
			permission: 'privileged',
			fn: async () => ({})
		});

		expect(called).toBe(true);
	});

	it('propagates errors from fn', async () => {
		const ctx = buildCtx();

		await expect(
			loadWithContextCore(ctx, {
				permission: 'none',
				fn: async () => {
					throw new Error('load failed');
				}
			})
		).rejects.toThrow('load failed');
	});
});
