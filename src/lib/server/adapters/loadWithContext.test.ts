import { describe, it, expect } from 'vitest';
import { createTestContext, createInMemoryDataStore, createTestAuthContext } from './inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadWithContextCore } from './httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }): UseCaseContext {
	return createTestContext({ auth: overrides?.auth });
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
		const ctx = buildCtx({
			auth: {
				requireView() {
					viewCalled = true;
				}
			}
		});

		const result = await loadWithContextCore(ctx, {
			permission: 'none',
			fn: async () => ({ data: 'hello' })
		});

		expect(viewCalled).toBe(false);
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

	it('supports policy-first loads without legacy permission declarations', async () => {
		let legacyPermissionCalled = false;
		const ctx = buildCtx({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'view',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' },
				requireView() {
					legacyPermissionCalled = true;
				}
			}
		});

		const result = await loadWithContextCore(ctx, {
			policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
			policyResource: { kind: 'organization' },
			fn: async () => ({ items: [] })
		});

		expect(result).toEqual({ items: [] });
		expect(legacyPermissionCalled).toBe(false);
	});
});

describe('loadWithContextCore with defer: true', () => {
	it('checks permissions eagerly before returning the data promise', () => {
		const ctx = buildCtx({
			auth: {
				requireView() {
					throw new Error('No access');
				}
			}
		});

		expect(() =>
			loadWithContextCore(ctx, {
				permission: 'training',
				fn: async () => ({ items: [] }),
				defer: true
			})
		).toThrow('No access');
	});

	it('returns a deferred data promise that resolves to fn result', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('items', [{ id: '1', organization_id: 'test-org', name: 'A' }]);

		const { data } = loadWithContextCore(ctx, {
			permission: 'personnel',
			fn: async (c) => {
				const items = await c.store.findMany('items', c.auth.orgId);
				return { items };
			},
			defer: true
		});

		expect(data).toBeInstanceOf(Promise);
		const resolved = await data;
		expect(resolved.items).toHaveLength(1);
	});

	it('does not await fn — returns before fn resolves', async () => {
		const ctx = buildCtx();
		let fnFinished = false;

		const { data } = loadWithContextCore(ctx, {
			permission: 'none',
			fn: async () => {
				await new Promise((r) => setTimeout(r, 50));
				fnFinished = true;
				return { done: true };
			},
			defer: true
		});

		expect(fnFinished).toBe(false);
		await data;
		expect(fnFinished).toBe(true);
	});
});
