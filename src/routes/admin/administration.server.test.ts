import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const { lookupRole, getAdminClient } = vi.hoisted(() => ({
	lookupRole: vi.fn(),
	getAdminClient: vi.fn()
}));
vi.mock('$lib/server/admin', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/admin')>()),
	getAdminRole: lookupRole
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { load } from './+page.server';
import { GET } from './api/search/+server';

function event(path = '/admin', authenticated = true) {
	const url = new URL(path, 'http://localhost');
	return {
		locals: { user: authenticated ? { id: 'admin-1' } : null, supabase: {}, session: null },
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof GET>[0];
}

function pageEvent(authenticated = true) {
	return event('/admin', authenticated) as unknown as Parameters<typeof load>[0];
}

// The provider exposes retained support data only. HTTP requests are serialized
// by the real SDK; commercial RPCs/columns fail as they would after retirement.
function provider() {
	return vi.fn<typeof fetch>(async (input, init) => {
		const url = new URL(String(input));
		const resource = url.pathname.replace('/rest/v1/', '');
		const params = url.searchParams;
		const body = init?.body ? JSON.parse(String(init.body)) : {};
		const count = (value: number) => new Response(null, { headers: { 'content-range': `*/${value}` } });
		switch (resource) {
			case 'rpc/count_platform_users':
				return Response.json({ total: 12, last_30_days: 3 });
			case 'rpc/daily_signups_last_30_days':
				return Response.json([{ date: '2026-06-01', count: 3 }]);
			case 'rpc/search_users_by_email':
				return Response.json(body.search_query === 'Clinic' ? [{ id: 'user-1', email: 'clinic@example.test' }] : []);
			case 'organizations':
				if (init?.method === 'HEAD') return count(4);
				if (
					params
						.get('select')
						?.split(',')
						.some((column) => !['id', 'name'].includes(column))
				)
					break;
				return Response.json(params.get('name') === 'ilike.%Clinic%' ? [{ id: 'org-1', name: 'Clinic' }] : []);
			case 'organization_memberships':
				return count(params.get('user_id') === 'eq.user-1' ? 2 : 0);
			case 'personnel':
				return count(params.get('organization_id') === 'eq.org-1' && params.get('archived_at') === 'is.null' ? 7 : 0);
			case 'access_requests':
				return count(params.get('status') === 'eq.pending' ? 5 : 9);
			case 'beta_feedback':
				return count(params.get('status') === 'eq.new' ? 6 : 11);
			case 'audit_logs':
				return Response.json([{ id: 'event-1', action: 'suspend_org', user_id: 'admin-1', timestamp: '2026-06-01' }]);
		}
		return Response.json({ message: 'Column or function unavailable', code: '42703' }, { status: 400 });
	});
}

describe('admin dashboard and search requests', () => {
	let fetchProvider: ReturnType<typeof provider>;
	beforeEach(() => {
		vi.clearAllMocks();
		lookupRole.mockResolvedValue('super_admin');
		fetchProvider = provider();
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
		'retains the dashboard for %s without commercial data',
		async (role) => {
			lookupRole.mockResolvedValue(role);
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

	it.each(['super_admin', 'support'])('returns retained search identities and scoped counts for %s', async (role) => {
		lookupRole.mockResolvedValue(role);
		const response = await GET(event('/admin/api/search?q=Clinic'));
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			users: [{ id: 'user-1', email: 'clinic@example.test', orgCount: 2 }],
			organizations: [{ id: 'org-1', name: 'Clinic', personnelCount: 7 }]
		});
	});

	it.each(['absent', 'ab'])('returns empty search results for %s', async (query) => {
		const response = await GET(event(`/admin/api/search?q=${query}`));
		await expect(response.json()).resolves.toEqual({ users: [], organizations: [] });
		if (query === 'ab') expect(fetchProvider).not.toHaveBeenCalled();
	});

	it.each([
		{ path: '/admin', role: null, authenticated: false, status: 303 },
		{ path: '/admin', role: null, authenticated: true, status: 403 },
		{ path: '/admin/api/search?q=Clinic', role: null, authenticated: false, status: 303 },
		{ path: '/admin/api/search?q=Clinic', role: null, authenticated: true, status: 403 },
		{ path: '/admin/api/search?q=Clinic', role: 'billing', authenticated: true, status: 403 }
	])(
		'denies $path for role $role (authenticated=$authenticated) before support reads',
		async ({ path, role, authenticated, status }) => {
			lookupRole.mockResolvedValue(role);
			const result = path === '/admin' ? load(pageEvent(authenticated)) : GET(event(path, authenticated));
			await expect(result).rejects.toMatchObject({ status });
			expect(fetchProvider).not.toHaveBeenCalled();
		}
	);

	it.each(['/admin', '/admin/api/search?q=Clinic'])(
		'reports sanitized failure instead of empty success at %s',
		async (path) => {
			fetchProvider.mockImplementation(async () =>
				Response.json({ message: 'private database failure' }, { status: 500 })
			);
			try {
				await (path === '/admin' ? load(pageEvent()) : GET(event(path)));
				expect.unreachable('Expected provider failure');
			} catch (error) {
				expect(isHttpError(error)).toBe(true);
				if (!isHttpError(error)) throw error;
				expect(error.status).toBe(500);
				expect(error.body.message).not.toContain('private database');
			}
		}
	);
});
