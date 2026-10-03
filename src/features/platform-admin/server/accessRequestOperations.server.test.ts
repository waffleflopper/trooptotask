import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { createPlatformAccessRequestOperations } from '$features/platform-admin/index.server';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const FORGED = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const SERVICE_KEY = 'synthetic-service-role';

type ProviderOptions = {
	role?: string | null;
	authorityUnavailable?: boolean;
	aal?: 'aal1' | 'aal2';
	assuranceUnavailable?: boolean;
	sessionActor?: string;
};

function fixture(options: ProviderOptions = {}) {
	const now = Math.floor(Date.now() / 1000);
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const token = [
		encode({ alg: 'HS256', typ: 'JWT' }),
		encode({
			sub: ACTOR,
			exp: now + 3600,
			aal: options.aal ?? 'aal2',
			amr: [{ method: 'password', timestamp: now - 3600 }]
		}),
		Buffer.from('synthetic-signature').toString('base64url')
	].join('.');
	const rejectCalls: unknown[] = [];
	const auditRows: Array<Record<string, unknown>> = [];
	const privilegedFetch = vi.fn<typeof fetch>(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		expect(request.headers.get('authorization')).toBe(`Bearer ${SERVICE_KEY}`);
		if (url.pathname === '/rest/v1/platform_admins') {
			expect(request.method).toBe('GET');
			expect(url.searchParams.get('user_id')).toBe(`eq.${ACTOR}`);
			expect(url.searchParams.get('is_active')).toBe('eq.true');
			if (options.authorityUnavailable) return Response.json({ message: 'private authority failure' }, { status: 500 });
			const role = options.role === undefined ? 'super_admin' : options.role;
			return Response.json(role ? { role } : null);
		}
		if (url.pathname === '/rest/v1/rpc/reject_access_request_and_block_linked_invitations') {
			expect(request.method).toBe('POST');
			rejectCalls.push(await request.json());
			return Response.json([{ reject_status: 'rejected' }]);
		}
		if (url.pathname === '/rest/v1/audit_logs') {
			expect(request.method).toBe('POST');
			auditRows.push(await request.json());
			return new Response(null, { status: 201 });
		}
		throw new Error(`Unexpected privileged provider request: ${request.method} ${url.pathname}`);
	});
	const sessionFetch = vi.fn<typeof fetch>(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
		if (url.pathname === '/auth/v1/user') {
			expect(request.method).toBe('GET');
			if (options.assuranceUnavailable) return Response.json({ message: 'private assurance failure' }, { status: 400 });
			return Response.json({ id: ACTOR, created_at: new Date(now * 1000).toISOString(), factors: [] });
		}
		if (url.pathname === '/rest/v1/rpc/is_user_suspended') {
			expect(request.method).toBe('POST');
			expect(await request.json()).toEqual({ check_user_id: ACTOR });
			return Response.json(false);
		}
		throw new Error(`Unexpected session provider request: ${request.method} ${url.pathname}`);
	});
	const client = (key: string, fetch: typeof globalThis.fetch, authorization?: string) =>
		createClient('http://127.0.0.1:9', key, {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch, headers: authorization ? { Authorization: authorization } : {} }
		});
	getAdminClient.mockReturnValue(client(SERVICE_KEY, privilegedFetch));
	const url = new URL('https://app.example.test/admin/access-requests?/reject');
	const event = {
		locals: {
			actor: { userId: ACTOR },
			user: { id: FORGED, email: 'forged@example.test', role: 'super_admin' },
			supabase: client('synthetic-session-key', sessionFetch, `Bearer ${token}`),
			session: { access_token: token, expires_at: now + 3600, user: { id: options.sessionActor ?? ACTOR } }
		},
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { 'user-agent': 'synthetic-review-client' },
			body: new URLSearchParams({ requestId: REQUEST, actorUserId: FORGED, p_reviewer_id: FORGED })
		}),
		getClientAddress: () => '127.0.0.1'
	} as unknown as RequestEvent;
	return { event, privilegedFetch, sessionFetch, rejectCalls, auditRows };
}

describe('admitted Access Request operation composition', () => {
	beforeEach(() => vi.clearAllMocks());

	it('requires a hook-verified actor even when the raw user claims to be an administrator', async () => {
		const facts = fixture();
		facts.event.locals.actor = null;
		await expect(createPlatformAccessRequestOperations(facts.event)).rejects.toMatchObject({ status: 303 });
		expect(getAdminClient).not.toHaveBeenCalled();
		expect(facts.privilegedFetch).not.toHaveBeenCalled();
		expect(facts.sessionFetch).not.toHaveBeenCalled();
	});

	it.each([
		{ options: { role: 'billing' }, status: 403 },
		{ options: { role: null }, status: 403 },
		{ options: { role: 'unrecognized' }, status: 503 },
		{ options: { authorityUnavailable: true }, status: 503 }
	])(
		'denies unverified or unavailable current role $options without privileged commands',
		async ({ options, status }) => {
			const facts = fixture(options);
			await expect(createPlatformAccessRequestOperations(facts.event)).rejects.toMatchObject({ status });
			expect(facts.rejectCalls).toEqual([]);
			expect(facts.auditRows).toEqual([]);
			expect(facts.sessionFetch).not.toHaveBeenCalled();
		}
	);

	it.each([
		{ options: { sessionActor: FORGED }, reason: 'denied.unauthenticated', requiresStepUp: true, sessionReads: false },
		{ options: { aal: 'aal1' as const }, reason: 'denied.staleSession', requiresStepUp: true, sessionReads: true },
		{
			options: { assuranceUnavailable: true },
			reason: 'denied.assuranceUnavailable',
			requiresStepUp: false,
			sessionReads: true
		}
	])(
		'uses the request session to enforce $reason before atomic rejection',
		async ({ options, reason, requiresStepUp, sessionReads }) => {
			const facts = fixture(options);
			const operations = await createPlatformAccessRequestOperations(facts.event);
			await expect(operations.reject(REQUEST)).resolves.toMatchObject({
				status: 'authorization_denied',
				failure: { reason, requiresStepUp }
			});
			expect(facts.rejectCalls).toEqual([]);
			if (sessionReads) expect(facts.sessionFetch).toHaveBeenCalled();
			else expect(facts.sessionFetch).not.toHaveBeenCalled();
			await vi.waitFor(() => expect(facts.auditRows).toHaveLength(1));
			expect(facts.auditRows[0]).toMatchObject({
				user_id: ACTOR,
				action: 'access_request.rejection_authorization_denied',
				resource_id: REQUEST
			});
		}
	);

	it.each(['super_admin', 'support'])(
		'binds allowed %s rejection and its audit to the hook actor despite forged user/form identities',
		async (role) => {
			const facts = fixture({ role });
			const operations = await createPlatformAccessRequestOperations(facts.event);
			await expect(operations.reject(REQUEST)).resolves.toEqual({ status: 'rejected' });
			expect(facts.rejectCalls).toEqual([{ p_access_request_id: REQUEST, p_reviewer_id: ACTOR }]);
			expect(facts.sessionFetch).toHaveBeenCalled();
			await vi.waitFor(() => expect(facts.auditRows).toHaveLength(1));
			expect(facts.auditRows[0]).toMatchObject({
				user_id: ACTOR,
				action: 'access_request.rejected',
				resource_type: 'access_request',
				resource_id: REQUEST,
				ip_address: '127.0.0.1',
				user_agent: 'synthetic-review-client',
				details: { blockedInvitationCount: 0 }
			});
		}
	);
});
