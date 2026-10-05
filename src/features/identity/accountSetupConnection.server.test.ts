import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
import { createSupabaseAccountSetupRouteFlow } from './accountSetupRouteFlow.server';

const connection = vi.hoisted(() => ({ service: null as SupabaseClient | null }));

vi.mock('$lib/server/supabase', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/supabase')>();
	return {
		...original,
		getAdminClient() {
			if (!connection.service) throw new Error('Service test client is unavailable');
			return connection.service;
		}
	};
});

it('completes account creation with service authority and signs in the ordinary request session', async () => {
	const requestId = 'c2800000-0000-4000-8000-000000000101';
	const linkId = 'c2800000-0000-4000-8000-000000000201';
	const attemptId = 'c2800000-0000-4000-8000-000000000301';
	const userId = 'c2800000-0000-4000-8000-000000000401';
	const email = 'setup@example.test';
	const password = 'SyntheticPassword123!';
	const serviceKey = 'synthetic-service';
	const ordinaryKey = 'synthetic-anon';
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', exp: 4102444800 })}.${encode('synthetic')}`;
	const user = { id: userId, email, aud: 'authenticated', app_metadata: {}, user_metadata: {} };
	const state = { created: false, completed: false };
	const jar = new Map([['theme', 'dark']]);

	const service = createClient('https://service.invalid', serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (
					request.headers.get('authorization') !== `Bearer ${serviceKey}` ||
					request.headers.get('apikey') !== serviceKey
				)
					throw new Error('Setup administration requires service authority');
				if (request.method === 'GET' && url.pathname === '/rest/v1/access_requests') {
					if (url.searchParams.get('id') !== `eq.${requestId}`) throw new Error('Unexpected Access Request');
					return Response.json([
						{
							id: requestId,
							email,
							name: 'Synthetic Soldier',
							first_name: 'Synthetic',
							last_name: 'Soldier',
							status: 'approved',
							setup_completed_at: state.completed ? '2026-10-04T12:00:00Z' : null
						}
					]);
				}
				if (request.method === 'GET' && url.pathname === '/rest/v1/account_setup_attempts') {
					if (url.searchParams.get('setup_link_id') !== `eq.${linkId}`) throw new Error('Unexpected setup attempt');
					return Response.json([{ id: attemptId }]);
				}
				if (request.method === 'GET' && url.pathname === '/rest/v1/user_email_identities') {
					if (url.searchParams.get('normalized_email') !== `eq.${email}`) throw new Error('Unexpected account email');
					return Response.json([]);
				}
				if (request.method === 'POST' && url.pathname === '/auth/v1/admin/users') {
					const body = await request.json();
					if (
						body.email !== email ||
						body.password !== password ||
						body.email_confirm !== true ||
						body.user_metadata?.ttt_setup_attempt !== attemptId
					)
						throw new Error('Unexpected account creation');
					state.created = true;
					return Response.json(user);
				}
				if (request.method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
					const body = await request.json();
					switch (url.pathname.split('/').at(-1)) {
						case 'check_durable_rate_limit':
							return Response.json([{ limited: false, retry_after_ms: 0 }]);
						case 'claim_account_setup_link_for_session':
							if (body.p_setup_link_id !== linkId || body.p_access_request_id !== requestId)
								throw new Error('Unexpected setup claim');
							return Response.json({
								claim_status: 'claim-started',
								setup_link_id: linkId,
								access_request_id: requestId,
								expires_at: '2100-01-01T00:00:00Z',
								created_at: '2026-10-04T12:00:00Z',
								claimed_at: '2026-10-04T12:01:00Z',
								failed_at: null,
								failure_reason: null,
								used_at: null,
								revoked_at: null,
								revocation_reason: null
							});
						case 'reconcile_account_setup_claim':
							if (!state.created) throw new Error('Account has not been created');
							return Response.json({
								state: 'committed',
								sourceLinkId: linkId,
								sourceAccessRequestId: requestId,
								userId
							});
						case 'complete_account_setup_recovery':
							if (
								!state.created ||
								body.p_source_setup_link_id !== linkId ||
								body.p_target_access_request_id !== requestId
							)
								throw new Error('Unexpected setup completion');
							state.completed = true;
							return Response.json({ state: 'completed', userId });
					}
				}
				throw new Error('Unexpected service operation');
			}
		}
	});
	const ordinary = createServerClient('https://ordinary.invalid', ordinaryKey, {
		cookies: {
			encode: 'tokens-only',
			getAll: () => [...jar].map(([name, value]) => ({ name, value })),
			setAll: (values) => {
				for (const { name, value } of values) jar.set(name, value);
			}
		},
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (request.headers.get('apikey') !== ordinaryKey) throw new Error('Ordinary session needs its public key');
				if (
					request.method === 'POST' &&
					url.pathname === '/auth/v1/token' &&
					url.searchParams.get('grant_type') === 'password'
				) {
					const body = await request.json();
					if (
						!state.completed ||
						body.email !== email ||
						body.password !== password ||
						request.headers.get('authorization') !== `Bearer ${ordinaryKey}`
					)
						throw new Error('Unexpected ordinary sign-in');
					return Response.json({
						access_token: token,
						refresh_token: 'synthetic-refresh',
						expires_in: 3600,
						token_type: 'bearer',
						user
					});
				}
				if (
					request.method === 'GET' &&
					url.pathname === '/rest/v1/user_profiles' &&
					request.headers.get('authorization') === `Bearer ${token}`
				)
					return Response.json([{ id: userId }]);
				throw new Error('Unexpected ordinary operation');
			}
		}
	});
	connection.service = service;
	try {
		const flow = createSupabaseAccountSetupRouteFlow({ supabase: ordinary } as App.Locals, async () => {});
		await expect(
			flow.completeSetup({
				setupSession: { setupLinkId: linkId, accessRequestId: requestId, expiresAt: 4102444800000 },
				password,
				confirmPassword: password,
				clientIp: '192.0.2.1',
				userAgent: 'synthetic-agent'
			})
		).resolves.toEqual({ type: 'redirect', path: '/dashboard', clearSession: true });
		expect(state).toEqual({ created: true, completed: true });
		const session = JSON.parse(
			Buffer.from(jar.get('sb-ordinary-auth-token')!.replace(/^base64-/, ''), 'base64url').toString()
		);
		expect(session).toMatchObject({ access_token: token, refresh_token: 'synthetic-refresh' });
		expect(jar.get('theme')).toBe('dark');
		await expect(ordinary.from('user_profiles').select('id').maybeSingle()).resolves.toMatchObject({
			data: { id: userId },
			error: null
		});
		await expect(service.from('access_requests').select('id').eq('id', requestId).maybeSingle()).resolves.toMatchObject(
			{ data: { id: requestId }, error: null }
		);
	} finally {
		connection.service = null;
		await Promise.all([service.auth.stopAutoRefresh(), ordinary.auth.stopAutoRefresh()]);
	}
});
