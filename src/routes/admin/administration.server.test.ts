import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { load } from './+page.server';

function event(path = '/admin', authenticated = true) {
	const url = new URL(path, 'http://localhost');
	return {
		locals: {
			actor: authenticated ? { userId: 'admin-1' } : null,
			user: authenticated ? { id: 'admin-1' } : null,
			supabase: {},
			session: null
		},
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof load>[0];
}

function pageEvent(authenticated = true) {
	return event('/admin', authenticated) as unknown as Parameters<typeof load>[0];
}

// The provider exposes retained support data only. HTTP requests are serialized
// by the real SDK.
function provider(role: () => string | null) {
	return vi.fn<typeof fetch>(async (input, init) => {
		const url = new URL(String(input));
		const resource = url.pathname.replace('/rest/v1/', '');
		const params = url.searchParams;
		const count = (value: number) => new Response(null, { headers: { 'content-range': `*/${value}` } });
		switch (resource) {
			case 'platform_admins':
				return Response.json(role() ? [{ role: role() }] : []);
			case 'rpc/count_platform_users':
				return Response.json({ total: 12, last_30_days: 3 });
			case 'rpc/daily_signups_last_30_days':
				return Response.json([{ date: '2026-06-01', count: 3 }]);
			case 'organizations':
				if (init?.method === 'HEAD') return count(4);
				break;
			case 'access_requests':
				return count(params.get('status') === 'eq.pending' ? 5 : 9);
			case 'beta_feedback':
				return count(params.get('status') === 'eq.new' ? 6 : 11);
			case 'audit_logs':
				return Response.json([
					{
						id: 'event-1',
						action: 'suspend_org',
						user_id: 'admin-1',
						timestamp: '2026-06-01',
						details: { actor: 'private@example.test', note: 'private note' },
						ip_address: '203.0.113.10',
						user_agent: 'private browser',
						resource_id: 'private-resource'
					}
				]);
		}
		return Response.json({ message: 'Column or function unavailable', code: '42703' }, { status: 400 });
	});
}

describe('admin dashboard requests', () => {
	let fetchProvider: ReturnType<typeof provider>;
	let activeRole: string | null;
	beforeEach(() => {
		vi.clearAllMocks();
		activeRole = 'super_admin';
		fetchProvider = provider(() => activeRole);
		getAdminClient.mockReturnValue(
			createClient('http://localhost:9', 'synthetic-service-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: { fetch: fetchProvider }
			})
		);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});
	afterEach(() => vi.restoreAllMocks());

	it.each(['super_admin', 'support', 'billing'])(
		'retains the dashboard for %s and excludes sensitive Audit fields',
		async (role) => {
			activeRole = role;
			await expect(load(pageEvent())).resolves.toEqual({
				userStats: { total: 12, last_30_days: 3 },
				signupTrend: [{ date: '2026-06-01', count: 3 }],
				totalOrganizations: 4,
				pendingAccessRequests: 5,
				pendingFeedback: 6,
				recentActivity: [{ id: 'event-1', action: 'suspend_org', user_id: 'admin-1', timestamp: '2026-06-01' }]
			});
		}
	);

	it.each([
		{ path: '/admin', role: null, authenticated: false, status: 303 },
		{ path: '/admin', role: null, authenticated: true, status: 403 }
	])(
		'denies $path for role $role (authenticated=$authenticated) before support reads',
		async ({ role, authenticated, status }) => {
			activeRole = role;
			await expect(load(pageEvent(authenticated))).rejects.toMatchObject({ status });
			const requestedResources = fetchProvider.mock.calls.map(([input]) => new URL(String(input)).pathname);
			expect(requestedResources).toEqual(authenticated ? ['/rest/v1/platform_admins'] : []);
		}
	);

	it('reports sanitized dashboard failure instead of empty success', async () => {
		fetchProvider.mockImplementation(async (input) =>
			new URL(String(input)).pathname === '/rest/v1/platform_admins'
				? Response.json([{ role: 'super_admin' }])
				: Response.json({ message: 'private database failure' }, { status: 400 })
		);
		try {
			await load(pageEvent());
			expect.unreachable('Expected provider failure');
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
			if (!isHttpError(error)) throw error;
			expect(error.status).toBe(500);
			expect(error.body.message).not.toContain('private database');
		}
	});
});
