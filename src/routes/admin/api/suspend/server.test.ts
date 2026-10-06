import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const actorId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const state = vi.hoisted(() => ({
	role: 'super_admin' as string | null,
	client: undefined as SupabaseClient | undefined,
	writes: 0,
	ack: true,
	audit: vi.fn()
}));
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
	state.writes = 0;
	state.ack = true;
	state.audit.mockClear();
	state.client = createClient('http://127.0.0.1:9', 'synthetic-service', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname === '/rest/v1/platform_admins') {
					expect(url.searchParams.get('user_id')).toBe(`eq.${actorId}`);
					expect(url.searchParams.get('is_active')).toBe('eq.true');
					return Response.json(state.role ? { role: state.role } : null);
				}
				expect(url.pathname).toBe('/rest/v1/user_suspensions');
				expect(init?.method).toBe('POST');
				state.writes++;
				return Response.json(state.ack ? [{ user_id: targetId }] : []);
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
		expect(state.writes).toBe(0);
		expect(state.audit).not.toHaveBeenCalled();
	});
	it('admits a valid acknowledged write and returns JSON success', async () => {
		const response = await POST(event({ type: 'user', targetId, action: 'suspend', reason: 'Synthetic reason' }));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(state.writes).toBe(1);
		expect(state.audit).toHaveBeenCalledTimes(1);
	});
	it.each(['support', 'billing', null])(
		'denies current role %s without any provider write or successful audit',
		async (role) => {
			state.role = role;
			const failure = await Promise.resolve(POST(event({ type: 'user', targetId, action: 'suspend' }))).catch(
				(cause: unknown) => cause
			);
			expect(isHttpError(failure, 403)).toBe(true);
			expect(state.writes).toBe(0);
			expect(state.audit).not.toHaveBeenCalled();
		}
	);
	it('does not report success or audit an unacknowledged write', async () => {
		state.ack = false;
		await expect(POST(event({ type: 'user', targetId, action: 'suspend' }))).rejects.toMatchObject({
			status: 500,
			body: { message: 'Could not confirm the suspension change. Reload details before trying again.' }
		});
		expect(state.writes).toBe(1);
		expect(state.audit).not.toHaveBeenCalled();
	});
	it('uses the verified actor for successful audit despite a forged raw identity', async () => {
		const request = event({ type: 'user', targetId, action: 'suspend' });
		request.locals.user = { id: targetId, email: 'forged@example.test' } as typeof request.locals.user;
		await POST(request);
		expect(state.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ userId: actorId, userEmail: null })
		);
	});
});
