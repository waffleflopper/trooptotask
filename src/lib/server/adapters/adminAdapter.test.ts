import { describe, it, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import {
	buildAdminContextCore,
	loadWithAdminContextCore,
	adminHandleCore,
	type AdminContext,
	type AdminLoadConfig,
	type AdminRouteConfig
} from './adminAdapter';

const mockEvent = {} as RequestEvent;

describe('buildAdminContextCore', () => {
	it('rejects when user is not a platform admin', async () => {
		await expect(
			buildAdminContextCore({
				userId: 'user-1',
				lookupRole: async () => null,
				requestInfo: { userId: 'user-1', ip: '127.0.0.1', userAgent: '' }
			})
		).rejects.toThrow(/access denied/i);
	});

	it('rejects when admin lacks access to the required page', async () => {
		await expect(
			buildAdminContextCore({
				userId: 'user-1',
				lookupRole: async () => 'billing',
				requestInfo: { userId: 'user-1', ip: '127.0.0.1', userAgent: '' },
				requiredPage: 'audit' // audit is super_admin only
			})
		).rejects.toThrow(/not authorized/i);
	});

	it('returns AdminContext for valid admin with page access', async () => {
		const ctx = await buildAdminContextCore({
			userId: 'user-1',
			lookupRole: async () => 'super_admin',
			requestInfo: { userId: 'user-1', ip: '127.0.0.1', userAgent: '' },
			requiredPage: 'audit'
		});

		expect(ctx.adminUser.id).toBe('user-1');
		expect(ctx.adminUser.role).toBe('super_admin');
	});

	it('returns AdminContext when no page restriction is specified', async () => {
		const ctx = await buildAdminContextCore({
			userId: 'user-1',
			lookupRole: async () => 'support',
			requestInfo: { userId: 'user-1', ip: '127.0.0.1', userAgent: '' }
		});

		expect(ctx.adminUser.role).toBe('support');
	});

	it('audit() is callable on the returned context', async () => {
		const ctx = await buildAdminContextCore({
			userId: 'user-1',
			lookupRole: async () => 'super_admin',
			requestInfo: { userId: 'user-1', ip: '127.0.0.1', userAgent: '' }
		});

		// Should not throw
		ctx.audit({ action: 'test', resourceType: 'test' });
	});
});

function makeCtx(role: AdminContext['adminUser']['role'] = 'super_admin'): AdminContext {
	return {
		adminUser: { id: 'user-1', role },
		adminClient: {} as AdminContext['adminClient'],
		audit() {}
	};
}

describe('loadWithAdminContextCore', () => {
	it('passes AdminContext to fn and returns result', async () => {
		const ctx = makeCtx();
		const config: AdminLoadConfig<{ count: number }> = {
			fn: async (c) => ({ count: 42 })
		};

		const result = await loadWithAdminContextCore(ctx, config, mockEvent);
		expect(result.count).toBe(42);
	});

	it('enforces requiredRole', async () => {
		const ctx = makeCtx('billing');
		const config: AdminLoadConfig<string> = {
			requiredRole: 'super_admin',
			fn: async () => 'data'
		};

		await expect(loadWithAdminContextCore(ctx, config, mockEvent)).rejects.toThrow(/not authorized/i);
	});

	it('allows matching requiredRole', async () => {
		const ctx = makeCtx('super_admin');
		const config: AdminLoadConfig<string> = {
			requiredRole: 'super_admin',
			fn: async () => 'data'
		};

		const result = await loadWithAdminContextCore(ctx, config, mockEvent);
		expect(result).toBe('data');
	});

	it('propagates errors from fn', async () => {
		const ctx = makeCtx();
		const config: AdminLoadConfig<string> = {
			fn: async () => {
				throw new Error('load failed');
			}
		};

		await expect(loadWithAdminContextCore(ctx, config, mockEvent)).rejects.toThrow('load failed');
	});
});

describe('adminHandleCore', () => {
	it('passes AdminContext and parsed input to fn', async () => {
		const ctx = makeCtx();
		const config: AdminRouteConfig<{ name: string }, string> = {
			fn: async (c, input) => `hello ${input.name}`
		};

		const result = await adminHandleCore(ctx, config, { name: 'Alice' });
		expect(result).toBe('hello Alice');
	});

	it('enforces requiredRole', async () => {
		const ctx = makeCtx('support');
		const config: AdminRouteConfig<void, string> = {
			requiredRole: 'super_admin',
			fn: async () => 'ok'
		};

		await expect(adminHandleCore(ctx, config, undefined)).rejects.toThrow(/not authorized/i);
	});

	it('returns result from fn', async () => {
		const ctx = makeCtx();
		const config: AdminRouteConfig<void, { success: boolean }> = {
			fn: async () => ({ success: true })
		};

		const result = await adminHandleCore(ctx, config, undefined);
		expect(result).toEqual({ success: true });
	});
});
