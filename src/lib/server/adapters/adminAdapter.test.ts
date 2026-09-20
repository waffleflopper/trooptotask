import { createSupabasePlatformAccessRequestAdministration } from './supabasePlatformAccessRequestAdministration';
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	buildAdminContextCore,
	loadWithAdminContextCore,
	adminHandleCore,
	type AdminContext,
	type AdminLoadConfig,
	type AdminRouteConfig
} from './adminAdapter';

const mockEvent = {} as RequestEvent;
const mockAdminClient = {} as SupabaseClient;

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

	it.each(['super_admin', 'support', 'billing'] as const)(
		'rejects the retired billing-event capability for %s',
		async (role) => {
			await expect(
				buildAdminContextCore({
					userId: 'user-1',
					lookupRole: async () => role,
					requestInfo: { userId: 'user-1', ip: '127.0.0.1', userAgent: '' },
					requiredPage: 'billing-events',
					adminClient: mockAdminClient
				})
			).rejects.toThrow(/not authorized/i);
		}
	);

	it('returns AdminContext for valid admin with page access', async () => {
		const ctx = await buildAdminContextCore({
			userId: 'user-1',
			lookupRole: async () => 'super_admin',
			requestInfo: { userId: 'user-1', ip: '127.0.0.1', userAgent: '' },
			requiredPage: 'audit',
			adminClient: mockAdminClient
		});

		expect(ctx.adminUser.id).toBe('user-1');
		expect(ctx.adminUser.role).toBe('super_admin');
	});

	it('returns AdminContext when no page restriction is specified', async () => {
		const ctx = await buildAdminContextCore({
			userId: 'user-1',
			lookupRole: async () => 'support',
			requestInfo: { userId: 'user-1', ip: '127.0.0.1', userAgent: '' },
			adminClient: mockAdminClient
		});

		expect(ctx.adminUser.role).toBe('support');
	});

	it('audit() is callable on the returned context', async () => {
		const ctx = await buildAdminContextCore({
			userId: 'user-1',
			lookupRole: async () => 'super_admin',
			requestInfo: { userId: 'user-1', ip: '127.0.0.1', userAgent: '' },
			adminClient: mockAdminClient
		});

		// Should not throw
		ctx.audit({ action: 'test', resourceType: 'test' });
	});
});

function makeCtx(role: AdminContext['adminUser']['role'] = 'super_admin'): AdminContext {
	return {
		adminUser: { id: 'user-1', role },
		adminClient: {} as AdminContext['adminClient'],
		sessionClient: {} as AdminContext['sessionClient'],
		session: null,
		audit() {}
	};
}

describe('loadWithAdminContextCore', () => {
	it('passes AdminContext to fn and returns result', async () => {
		const ctx = makeCtx();
		const config: AdminLoadConfig<{ count: number }> = {
			fn: async (c, event) => {
				expect(c).toBe(ctx);
				expect(event).toBe(mockEvent);
				return { count: 42 };
			}
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

describe('platform sensitive-action wiring', () => {
	it('uses session-scoped assurance and prevents mismatched actors from reaching privileged mutations', async () => {
		const privilegedRpc = vi.fn().mockResolvedValue({ data: [{ reject_status: 'rejected' }], error: null });
		const assurance = vi.fn().mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
		const session = {
			access_token: 'verified-platform-token',
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: { id: 'admin-1' }
		};
		const admin = createSupabasePlatformAccessRequestAdministration({
			adminUser: { id: 'admin-1', role: 'super_admin' },
			adminClient: { rpc: privilegedRpc } as never,
			sessionClient: {
				auth: { mfa: { getAuthenticatorAssuranceLevel: assurance } },
				rpc: vi.fn().mockResolvedValue({ data: false, error: null })
			} as never,
			session: session as never,
			audit: vi.fn()
		});
		await expect(admin.reject({ accessRequestId: 'request-1', actorUserId: 'another-admin' })).resolves.toMatchObject({
			status: 'authorization_denied',
			failure: { reason: 'denied.unauthenticated' }
		});
		expect(privilegedRpc).not.toHaveBeenCalled();
		expect(assurance).not.toHaveBeenCalled();
		assurance.mockRejectedValueOnce(new Error('provider unavailable'));
		await expect(admin.reject({ accessRequestId: 'request-1', actorUserId: 'admin-1' })).resolves.toMatchObject({
			status: 'authorization_denied',
			failure: { reason: 'denied.assuranceUnavailable', requiresStepUp: false }
		});
		expect(privilegedRpc).not.toHaveBeenCalled();
		await expect(admin.reject({ accessRequestId: 'request-1', actorUserId: 'admin-1' })).resolves.toEqual({
			status: 'rejected'
		});
		expect(privilegedRpc).toHaveBeenCalledOnce();
		expect(assurance).toHaveBeenLastCalledWith('verified-platform-token');
	});
});
