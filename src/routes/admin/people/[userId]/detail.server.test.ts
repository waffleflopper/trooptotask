import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { load, actions } from './+page.server';

const userId = 'a406f000-0000-4000-8000-000000000001';
const createdAt = '2026-06-01T00:00:00.000Z';
let operator = true;
let assurance: { currentLevel: 'aal1' | 'aal2'; nextLevel: 'aal1' | 'aal2' } = {
	currentLevel: 'aal2',
	nextLevel: 'aal2'
};
let actorUserId = 'admin-1';

function event(authenticated = true) {
	const url = new URL(`/admin/people/${userId}`, 'http://localhost');
	return {
		locals: {
			actor: authenticated ? { userId: actorUserId } : null,
			user: authenticated ? { id: actorUserId } : null,
			supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: assurance, error: null }) } } },
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
			case '/rest/v1/platform_operators':
				expect(params.get('user_id')).toBe(`eq.${actorUserId}`);
				return Response.json(operator ? { user_id: actorUserId } : null);
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
		operator = true;
		assurance = { currentLevel: 'aal2', nextLevel: 'aal2' };
		actorUserId = 'admin-1';
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

	it('loads the account and isolates an unavailable region', async () => {
		const result = await load(event());
		if (!result) throw new Error('Expected account detail');
		expect(result).toMatchObject({
			person: { id: userId, state: { kind: 'suspended', reason: 'Support review' } },
			isSelf: false,
			canSuspend: true,
			mfaEnabled: false
		});
		await expect(result.organizations).resolves.toMatchObject({
			status: 'ok',
			data: [
				{ role: 'owner', organization: { name: 'Able Clinic' } },
				{ role: 'member', organization: { name: 'Bravo Clinic' } }
			]
		});
		await expect(result.accountFacts).resolves.toMatchObject({ status: 'error' });
		await expect(result.recentActivity).resolves.toMatchObject({
			status: 'ok',
			data: [{ id: 'audit-1', action: 'view_personnel' }]
		});
	});
	it('disables self-suspension in the load and rejects a forged action on the server', async () => {
		actorUserId = userId;
		await expect(load(event())).resolves.toMatchObject({
			isSelf: true,
			canSuspend: false,
			suspendDisabledReason: expect.any(String)
		});
		const request = event();
		request.request = new Request(request.url, {
			method: 'POST',
			body: new URLSearchParams({ reason: 'Forged self suspend' })
		});
		const result = await actions.suspend(request as never);
		expect(result).toMatchObject({ status: 403 });
		expect(fetchProvider.mock.calls.filter(([, init]) => init?.method === 'POST')).toEqual([]);
	});

	it.each([
		{ name: 'a non-operator', operator: false, authenticated: true, status: 403 },
		{ name: 'a missing verified actor', operator: false, authenticated: false, status: 403 }
	])('denies detail and identity actions for $name', async ({ operator: isOperator, authenticated, status }) => {
		operator = isOperator;
		const request = event(authenticated);
		await expect(load(request)).rejects.toMatchObject({ status });
		for (const action of [actions.resetPassword, actions.suspend]) {
			await expect(action(request as unknown as Parameters<typeof action>[0])).rejects.toMatchObject({ status });
		}
		const paths = fetchProvider.mock.calls.map(([input]) => new URL(String(input)).pathname);
		expect(paths.every((path) => path === '/rest/v1/platform_operators')).toBe(true);
		if (!authenticated) expect(fetchProvider).not.toHaveBeenCalled();
	});

	it('sends an operator without a verified second factor to MFA before any account read', async () => {
		assurance = { currentLevel: 'aal1', nextLevel: 'aal2' };
		await expect(load(event())).rejects.toMatchObject({ status: 303 });
		expect(
			fetchProvider.mock.calls.every(([input]) => new URL(String(input)).pathname === '/rest/v1/platform_operators')
		).toBe(true);
	});

	it.each([
		{ providerStatus: 404, expectedStatus: 404 },
		{ providerStatus: 500, expectedStatus: 503 }
	])(
		'keeps identity failure $providerStatus distinct from a usable account',
		async ({ providerStatus, expectedStatus }) => {
			const original = fetchProvider.getMockImplementation()!;
			fetchProvider.mockImplementation(async (input, init) =>
				new URL(String(input)).pathname.startsWith('/auth/v1/')
					? Response.json(
							{ message: providerStatus === 404 ? 'User not found' : 'private provider error' },
							{ status: providerStatus }
						)
					: original(input, init)
			);
			await expect(load(event())).rejects.toMatchObject({ status: expectedStatus });
		}
	);

	it('does not let a user object replace the hook actor', async () => {
		operator = false;
		const request = event();
		request.locals.user = { id: 'forged-user', email: 'unverified@example.test' } as never;
		await expect(load(request)).rejects.toMatchObject({ status: 403 });
		expect(
			fetchProvider.mock.calls.every(([input]) => new URL(String(input)).pathname === '/rest/v1/platform_operators')
		).toBe(true);
	});

	it('reports an unavailable operator check as 503 without reading the target account', async () => {
		fetchProvider.mockImplementation(async () =>
			Response.json({ message: 'private authority failure' }, { status: 500 })
		);
		await expect(load(event())).rejects.toMatchObject({ status: 503 });
		expect(
			fetchProvider.mock.calls.every(([input]) => new URL(String(input)).pathname === '/rest/v1/platform_operators')
		).toBe(true);
	});
});
