import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { lookupRole, getAdminClient } = vi.hoisted(() => ({
	lookupRole: vi.fn(),
	getAdminClient: vi.fn()
}));
vi.mock('$lib/server/admin', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/admin')>()),
	getAdminRole: lookupRole
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { load, actions } from './+page.server';

const userId = 'a406f000-0000-4000-8000-000000000001';
const createdAt = '2026-06-01T00:00:00.000Z';

function event(authenticated = true) {
	const url = new URL(`/admin/users/${userId}`, 'http://localhost');
	return {
		locals: { user: authenticated ? { id: 'admin-1' } : null, supabase: {}, session: null },
		params: { userId },
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof load>[0];
}

// Retained-only provider schema, reached through the real SDK and route admission.
// Missing commercial columns reject requests instead of silently supplying fixtures.
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
			case '/rest/v1/organization_memberships':
				if (params.get('select')?.match(/\b(tier|gift_tier)\b/)) break;
				return Response.json(
					params.get('user_id') === `eq.${userId}`
						? [
								{ role: 'owner', organizations: { id: 'org-a', name: 'Able Clinic' } },
								{ role: 'member', organizations: [{ id: 'org-b', name: 'Bravo Clinic' }] }
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

	it.each(['super_admin', 'support'])(
		'loads identity, memberships, suspension and activity for %s without commercial data',
		async (role) => {
			lookupRole.mockResolvedValue(role);
			await expect(load(event())).resolves.toEqual({
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
		}
	);

	it.each([
		{ role: 'billing', authenticated: true, status: 403 },
		{ role: null, authenticated: true, status: 403 },
		{ role: null, authenticated: false, status: 303 }
	])(
		'denies detail and identity actions for $role (authenticated=$authenticated)',
		async ({ role, authenticated, status }) => {
			lookupRole.mockResolvedValue(role);
			const request = event(authenticated);
			await expect(load(request)).rejects.toMatchObject({ status });
			for (const action of [actions.resetPassword, actions.resendInvite]) {
				await expect(action(request as unknown as Parameters<typeof action>[0])).rejects.toMatchObject({ status });
			}
			expect(fetchProvider).not.toHaveBeenCalled();
		}
	);

	it('reports a sanitized identity-provider failure', async () => {
		fetchProvider.mockImplementation(async () =>
			Response.json({ message: 'private provider failure' }, { status: 503 })
		);
		await expect(load(event())).rejects.toMatchObject({
			status: 500,
			body: { message: 'Failed to load user identity' }
		});
	});
});
