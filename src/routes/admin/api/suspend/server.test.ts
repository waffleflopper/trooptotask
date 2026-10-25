import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const actorId = 'aaaaaaaa-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-06-01T12:00:00Z');
const state = vi.hoisted(() => ({
	operator: true,
	client: undefined as SupabaseClient | undefined,
	writes: 0,
	ack: true,
	audit: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => state.client }));
vi.mock('$lib/audit/index.server', () => ({
	auditLog: (...args: unknown[]) => state.audit(...args),
	getRequestInfo: () => ({ userId: actorId, ip: '127.0.0.1', userAgent: 'Synthetic route test' })
}));
function event(
	body: unknown,
	verificationAgeMs: number | null = 0,
	currentLevel = 'aal2',
	nextLevel = 'aal2'
): Parameters<typeof POST>[0] {
	const url = new URL('http://127.0.0.1:9/admin/api/suspend');
	return {
		locals: {
			actor: { userId: actorId },
			user: { id: actorId },
			session: {
				access_token: 'verified-request-token',
				expires_at: now.getTime() / 1000 + 3600,
				user: { id: actorId }
			},
			supabase: {
				auth: {
					mfa: {
						getAuthenticatorAssuranceLevel: async () => ({
							data: {
								currentLevel,
								nextLevel,
								currentAuthenticationMethods: [
									{ method: 'password', timestamp: now.getTime() / 1000 },
									...(verificationAgeMs === null
										? []
										: [{ method: 'totp', timestamp: (now.getTime() - verificationAgeMs) / 1000 }])
								]
							},
							error: null
						})
					}
				},
				rpc: async () => ({ data: false, error: null })
			}
		},
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof POST>[0];
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(now);
	state.operator = true;
	state.writes = 0;
	state.ack = true;
	state.audit.mockReset().mockResolvedValue();
	state.client = createClient('http://127.0.0.1:9', 'synthetic-service', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname === '/rest/v1/platform_operators')
					return Response.json(state.operator ? { user_id: actorId } : null);
				if (url.pathname.includes('/rpc/platform_') && url.pathname.endsWith('_organization')) {
					state.writes++;
					return Response.json(state.ack);
				}
				if (url.pathname.endsWith('/user_suspensions')) {
					state.writes++;
					return Response.json(state.ack ? [{ user_id: targetId }] : []);
				}
				throw new Error(`Unexpected provider ${url.pathname} ${init?.method}`);
			}
		}
	});
});
import { afterEach } from 'vitest';
afterEach(() => vi.useRealTimers());
describe('suspension HTTP safety', () => {
	it('refuses a signed-in non-operator before writes', async () => {
		state.operator = false;
		await expect(POST(event({ type: 'user', targetId, action: 'suspend' }))).rejects.toMatchObject({ status: 403 });
		expect(state.writes).toBe(0);
	});
	it.each(['aal1', 'aal2'])('denies an aal1 API request with the required MFA handoff for %s', async (next) => {
		await expect(POST(event({ type: 'user', targetId, action: 'suspend' }, 0, 'aal1', next))).rejects.toMatchObject({
			status: 403,
			body: { requiresStepUp: true, stepUpPath: next === 'aal2' ? '/auth/mfa-verify' : '/auth/mfa-setup' }
		});
		expect(state.writes).toBe(0);
	});
	it.each(['user', 'org'] as const)('requires recent MFA for both suspension changes on %s', async (type) => {
		for (const action of ['suspend', 'unsuspend']) {
			for (const age of [null, 601000, -1000]) {
				const response = await POST(event({ type, targetId, action, reason: 'Synthetic reason' }, age));
				expect(response.status).toBe(403);
				expect(await response.json()).toMatchObject({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' });
			}
		}
		expect(state.writes).toBe(0);
	});
	it.each(['user', 'org'] as const)('allows suspend and unsuspend with MFA within ten minutes on %s', async (type) => {
		for (const action of ['suspend', 'unsuspend']) {
			const response = await POST(event({ type, targetId, action, reason: 'Synthetic reason' }, 600000));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ success: true });
		}
		expect(state.writes).toBe(2);
	});
	it('rejects self-suspension even with recent MFA and an uppercase identifier', async () => {
		const response = await POST(event({ type: 'user', targetId: actorId.toUpperCase(), action: 'suspend' }));
		expect(response.status).toBe(403);
		expect(state.writes).toBe(0);
		expect(state.audit).not.toHaveBeenCalled();
	});
	it.each([null, { type: 'user', targetId, action: 'suspend', reason: 42 }])(
		'rejects invalid input before provider effects',
		async (body) => {
			await expect(POST(event(body))).rejects.toMatchObject({ status: 400 });
			expect(state.writes).toBe(0);
		}
	);
	it('attributes the audit to the admitted operator despite a forged raw identity', async () => {
		const request = event({ type: 'user', targetId, action: 'suspend' });
		request.locals.user = { id: targetId, email: 'forged@example.test' } as typeof request.locals.user;
		await POST(request);
		expect(state.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ userId: actorId, userEmail: null }),
			{ required: true }
		);
	});
	it('reports failure when the audit write rejects', async () => {
		state.audit.mockRejectedValueOnce(new Error('Audit unavailable'));
		await expect(POST(event({ type: 'user', targetId, action: 'suspend' }))).rejects.toMatchObject({ status: 500 });
	});
	it('reports an unacknowledged suspension write as a failure', async () => {
		state.ack = false;
		await expect(POST(event({ type: 'user', targetId, action: 'suspend' }))).rejects.toMatchObject({ status: 500 });
		expect(state.audit).not.toHaveBeenCalled();
	});
});
