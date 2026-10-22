import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { load, actions } from './+page.server';

const userId = 'a406f000-0000-4000-8000-000000000001';
const createdAt = '2026-06-01T00:00:00.000Z';
let currentRole: string | null = 'super_admin';

function event(authenticated = true) {
	const url = new URL(`/admin/users/${userId}`, 'http://localhost');
	return {
		locals: {
			actor: authenticated ? { userId: 'admin-1' } : null,
			user: authenticated ? { id: 'admin-1' } : null,
			supabase: {},
			session: null
		},
		params: { userId },
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof load>[0];
}

function provider() {
	return vi.fn<typeof fetch>(async (input, init) => {
		const url = new URL(String(input));
		const params = url.searchParams;
		if (url.pathname === `/auth/v1/admin/users/${userId}`)
			return Response.json({
				id: userId,
				email: 'soldier@example.test',
				created_at: createdAt,
				email_confirmed_at: createdAt
			});
		switch (url.pathname) {
			case '/rest/v1/platform_admins':
				expect(params.get('user_id')).toBe('eq.admin-1');
				expect(params.get('is_active')).toBe('eq.true');
				return Response.json(currentRole ? { role: currentRole } : null);
			case '/rest/v1/organization_memberships':
				return Response.json(
					params.get('user_id') === `eq.${userId}`
						? [
								{
									user_id: userId,
									organization_id: 'org-a',
									role: 'owner',
									organizations: { id: 'org-a', name: 'Able Clinic' }
								},
								{
									user_id: userId,
									organization_id: 'org-b',
									role: 'member',
									organizations: [{ id: 'org-b', name: 'Bravo Clinic' }]
								}
							]
						: []
				);
			case '/rest/v1/user_suspensions':
				return Response.json(
					params.get('user_id') === `eq.${userId}`
						? {
								user_id: userId,
								suspended_at: createdAt,
								suspended_by: 'admin-1',
								reason: 'Support review'
							}
						: null
				);
			case '/rest/v1/rpc/count_personnel_by_organization': {
				const body = JSON.parse(String(init?.body));
				return Response.json(
					[
						{ organization_id: 'org-a', personnel_count: 3 },
						{ organization_id: 'org-b', personnel_count: 1 },
						{ organization_id: 'foreign-org', personnel_count: 99 }
					].filter((row) => body.p_org_ids.includes(row.organization_id))
				);
			}
			case '/rest/v1/audit_logs':
				return Response.json(
					params.get('user_id') === `eq.${userId}`
						? [
								{
									id: 'audit-1',
									user_id: userId,
									org_id: 'org-a',
									action: 'view_personnel',
									resource_type: 'personnel',
									resource_id: 'person-1',
									severity: 'info',
									timestamp: createdAt
								}
							]
						: []
				);
		}
		return Response.json({ message: 'Column unavailable', code: '42703' }, { status: 400 });
	});
}

describe('user detail request admission and retained projections', () => {
	let fetchProvider: ReturnType<typeof provider>;
	beforeEach(() => {
		vi.clearAllMocks();
		currentRole = 'super_admin';
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

	it.each(['super_admin', 'support'])('loads identity, memberships, suspension and activity for %s', async (role) => {
		currentRole = role;
		await expect(load(event())).resolves.toEqual({
			adminRole: role,
			user: {
				id: userId,
				email: 'soldier@example.test',
				createdAt,
				lastSignInAt: null,
				emailConfirmedAt: createdAt,
				emailConfirmationStatus: 'confirmed'
			},
			organizations: [
				{ id: 'org-a', name: 'Able Clinic', role: 'owner', personnelCount: 3 },
				{ id: 'org-b', name: 'Bravo Clinic', role: 'member', personnelCount: 1 }
			],
			suspension: { suspendedAt: createdAt, suspendedBy: 'admin-1', reason: 'Support review' },
			isSuspended: true,
			recentActivity: [
				{
					id: 'audit-1',
					action: 'view_personnel',
					resourceType: 'personnel',
					resourceId: 'person-1',
					orgId: 'org-a',
					timestamp: createdAt,
					severity: 'info'
				}
			]
		});
	});

	it.each([
		{ role: 'billing', authenticated: true, status: 403 },
		{ role: null, authenticated: true, status: 403 },
		{ role: null, authenticated: false, status: 303 },
		{ role: 'unrecognized-role', authenticated: true, status: 503 }
	])(
		'denies detail and identity actions for $role (authenticated=$authenticated)',
		async ({ role, authenticated, status }) => {
			currentRole = role;
			const request = event(authenticated);
			await expect(load(request)).rejects.toMatchObject({ status });
			for (const action of [actions.resetPassword, actions.resendInvite]) {
				await expect(action(request as unknown as Parameters<typeof action>[0])).rejects.toMatchObject({ status });
			}
			const paths = fetchProvider.mock.calls.map(([input]) => new URL(String(input)).pathname);
			expect(paths.every((path) => path === '/rest/v1/platform_admins')).toBe(true);
			if (!authenticated) expect(fetchProvider).not.toHaveBeenCalled();
		}
	);

	it('requires the hook actor even when an unverified user object is present', async () => {
		const request = event(false);
		request.locals.user = { id: 'admin-1', email: 'unverified@example.test' } as never;
		await expect(load(request)).rejects.toMatchObject({ status: 303 });
		expect(fetchProvider).not.toHaveBeenCalled();
	});

	it('does not let a user object confer a role or replace the hook actor', async () => {
		currentRole = 'billing';
		const request = event();
		request.locals.user = { id: 'forged-user', email: 'unverified@example.test', role: 'super_admin' } as never;
		await expect(load(request)).rejects.toMatchObject({ status: 403 });
		expect(
			fetchProvider.mock.calls.every(([input]) => new URL(String(input)).pathname === '/rest/v1/platform_admins')
		).toBe(true);
	});

	it('reports unavailable authority as 503 without reading the target account', async () => {
		fetchProvider.mockImplementation(async () =>
			Response.json({ message: 'private authority failure' }, { status: 500 })
		);
		await expect(load(event())).rejects.toMatchObject({ status: 503 });
		expect(
			fetchProvider.mock.calls.every(([input]) => new URL(String(input)).pathname === '/rest/v1/platform_admins')
		).toBe(true);
	});

	it('reports a sanitized identity-provider failure', async () => {
		const standardProvider = fetchProvider.getMockImplementation()!;
		fetchProvider.mockImplementation(async (input, init) =>
			new URL(String(input)).pathname.startsWith('/auth/v1/')
				? Response.json({ message: 'private provider failure' }, { status: 500 })
				: standardProvider(input, init)
		);
		await expect(load(event())).rejects.toMatchObject({
			status: 500,
			body: { message: 'Failed to load user identity' }
		});
	});
});
