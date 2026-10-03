import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const actorId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const state = vi.hoisted(() => ({
	role: 'super_admin' as 'super_admin' | 'support',
	client: undefined as SupabaseClient | undefined,
	requests: 0,
	audit: vi.fn()
}));
vi.mock('$lib/server/admin', () => ({ getAdminRole: async () => state.role, canAccessPage: () => true }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => state.client }));
vi.mock('$lib/audit/index.server', () => ({
	createSupabasePlatformAudit: () => ({ listRecentActivity: vi.fn() }),
	auditLog: (...args: unknown[]) => state.audit(...args),
	getRequestInfo: () => ({ userId: actorId, ip: '127.0.0.1', userAgent: 'Synthetic route test' })
}));
function event(body: unknown): Parameters<typeof POST>[0] {
	return {
		locals: { actor: { userId: actorId }, supabase: state.client, session: null },
		url: new URL('http://127.0.0.1:9/admin/api/suspend'),
		request: new Request('http://127.0.0.1:9/admin/api/suspend', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as unknown as Parameters<typeof POST>[0];
}
beforeEach(() => {
	state.role = 'super_admin';
	state.requests = 0;
	state.audit.mockClear();
	state.client = createClient('http://127.0.0.1:9', 'synthetic-service', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async () => {
				state.requests++;
				return Response.json([{ user_id: targetId }]);
			}
		}
	});
});
describe('suspension HTTP delivery', () => {
	it.each([
		null,
		{ type: 'user', targetId, action: 'suspend', reason: 42 },
		{ type: 'user', targetId: [targetId], action: 'suspend' }
	])('adapts decoded command validation to a real HTTP 400 before provider effects: %j', async (body) => {
		const failure = await Promise.resolve(POST(event(body))).catch((cause: unknown) => cause);
		expect(isHttpError(failure, 400)).toBe(true);
		expect(state.requests).toBe(0);
		expect(state.audit).not.toHaveBeenCalled();
	});
	it('admits a valid acknowledged write and returns JSON success', async () => {
		const response = await POST(event({ type: 'user', targetId, action: 'suspend', reason: 'Synthetic reason' }));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(state.requests).toBe(1);
		expect(state.audit).toHaveBeenCalledTimes(1);
	});
	it('denies Support without any provider write or successful audit', async () => {
		state.role = 'support';
		const failure = await Promise.resolve(POST(event({ type: 'user', targetId, action: 'suspend' }))).catch(
			(cause: unknown) => cause
		);
		expect(isHttpError(failure, 403)).toBe(true);
		expect(state.requests).toBe(0);
		expect(state.audit).not.toHaveBeenCalled();
	});
});
