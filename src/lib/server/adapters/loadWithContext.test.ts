import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { createTestContext, createInMemoryDataStore, createTestAuthContext } from './inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadWithContextCore } from './httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }): UseCaseContext {
	return createTestContext({ auth: overrides?.auth });
}

describe('loadWithContextCore', () => {
	it('passes UseCaseContext to fn and returns its result', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('items', [{ id: '1', organization_id: 'test-org', name: 'A' }]);

		const result = await loadWithContextCore(ctx, {
			policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
			policyResource: { kind: 'organization' },
			fn: async (c) => {
				const items = await c.store.findMany('items', c.auth.orgId);
				return { items };
			}
		});

		expect(result.items).toHaveLength(1);
	});

	it('propagates errors from fn', async () => {
		const ctx = buildCtx();

		await expect(
			loadWithContextCore(ctx, {
				policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
				fn: async () => {
					throw new Error('load failed');
				}
			})
		).rejects.toThrow('load failed');
	});

	it('supports policy-first loads without legacy permission declarations', async () => {
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
				scopeSet: { kind: 'organization' }
			}
		});

		const result = await loadWithContextCore(ctx, {
			policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
			policyResource: { kind: 'organization' },
			fn: async () => ({ items: [] })
		});

		expect(result).toEqual({ items: [] });
	});

	it('turns denied page loads into SvelteKit 403 errors instead of unhandled errors', async () => {
		const ctx = buildCtx({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		try {
			await loadWithContextCore(ctx, {
				policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
				policyResource: { kind: 'organization' },
				fn: async () => ({ items: [] })
			});
			throw new Error('Expected loadWithContextCore to throw');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			expect(err).toMatchObject({
				status: 403,
				body: {
					message:
						"You don't have permission. This requires Personnel can manage permissions. Talk to your organization owner or admin."
				}
			});
		}
	});
});

describe('loadWithContextCore with defer: true', () => {
	it('checks policies before resolving the data promise', async () => {
		const ctx = buildCtx({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		const { data } = loadWithContextCore(ctx, {
			policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
			policyResource: { kind: 'organization' },
			fn: async () => ({ items: [] }),
			defer: true
		});

		try {
			await data;
			throw new Error('Expected deferred load to reject');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			expect(err).toMatchObject({
				status: 403,
				body: {
					message:
						"You don't have permission. This requires Training can view permissions. Talk to your organization owner or admin."
				}
			});
		}
	});

	it('returns a deferred data promise that resolves to fn result', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('items', [{ id: '1', organization_id: 'test-org', name: 'A' }]);

		const { data } = loadWithContextCore(ctx, {
			policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
			policyResource: { kind: 'organization' },
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
			policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
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
