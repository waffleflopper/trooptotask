import { isHttpError, type RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lookupRole, audit, getOrganizationDetail, command, authority } = vi.hoisted(() => ({
	lookupRole: vi.fn(),
	audit: vi.fn(),
	getOrganizationDetail: vi.fn(),
	command: vi.fn(),
	authority: { role: 'super_admin' as string | null, error: null as unknown }
}));
vi.mock('$lib/server/admin', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/admin')>()),
	getAdminRole: lookupRole
}));
vi.mock('$lib/server/supabase', () => ({
	getAdminClient: () => ({
		from: () => {
			const query = {
				select: () => query,
				eq: () => query,
				maybeSingle: async () => ({ data: authority.role ? { role: authority.role } : null, error: authority.error })
			};
			return query;
		},
		rpc: command
	})
}));
vi.mock('$lib/audit/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/audit/index.server')>()),
	auditLog: audit
}));
vi.mock('$lib/server/adapters/supabasePlatformOrganizationDetail', () => ({
	createSupabasePlatformOrganizationDetail: () => ({ getOrganizationDetail })
}));
import { actions, load } from './+page.server';
const orgId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const targetUserId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';
function event(form: Record<string, string> = { targetUserId, confirmName: 'Able Company' }, id = orgId): RequestEvent {
	return {
		locals: {
			actor: { userId: actorId },
			user: { id: 'untrusted-other-user' },
			session: {
				access_token: 'synthetic-request-token',
				expires_at: Math.floor(Date.now() / 1000) + 3600,
				user: { id: actorId }
			},
			supabase: {
				auth: {
					mfa: {
						getAuthenticatorAssuranceLevel: async () => ({
							error: null,
							data: {
								currentLevel: 'aal1',
								nextLevel: 'aal1',
								currentAuthenticationMethods: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }]
							}
						})
					}
				},
				rpc: async () => ({ data: false, error: null })
			}
		},
		params: { orgId: id },
		request: new Request(`http://localhost/admin/organizations/${id}`, {
			method: 'POST',
			body: new URLSearchParams(form)
		}),
		getClientAddress: () => '127.0.0.1'
	} as unknown as RequestEvent;
}
function loadDetail(request = event()) {
	return load(request as Parameters<typeof load>[0]);
}
function runAction(action: 'makeAdmin' | 'transferOwnership', request = event()) {
	return actions[action](request as Parameters<(typeof actions)[typeof action]>[0]);
}
function detail() {
	return {
		adminRole: 'super_admin',
		org: {
			id: orgId,
			name: 'Able Company',
			suspendedAt: null as string | null,
			createdAt: '2026-06-01T00:00:00.000Z',
			isSuspended: false
		},
		members: [{ userId: ownerId, email: 'owner@example.com', role: 'owner' }],
		personnelCount: 3,
		auditEvents: [{ id: 'audit-1', action: 'admin.org.make_admin', resourceId: orgId }]
	};
}
beforeEach(() => {
	vi.resetAllMocks();
	authority.role = 'super_admin';
	authority.error = null;
	lookupRole.mockResolvedValue('super_admin');
	getOrganizationDetail.mockResolvedValue({ status: 'found', detail: detail() });
	command.mockImplementation(async (name: string) => ({
		error: null,
		data:
			name === 'platform_promote_org_member'
				? { status: 'updated', org_id: orgId, target_user_id: targetUserId }
				: {
						status: 'updated',
						org_id: orgId,
						from_user_id: ownerId,
						to_user_id: targetUserId,
						org_name: 'Able Company'
					}
	}));
});
describe('admin organization detail load', () => {
	it('rejects malformed organization IDs before reading detail', async () => {
		await expect(loadDetail(event({}, 'not-a-uuid'))).rejects.toMatchObject({ status: 400 });
		expect(getOrganizationDetail).not.toHaveBeenCalled();
	});

	it('allows support to read retained identity, membership, suspension and audit data', async () => {
		lookupRole.mockResolvedValue('support');
		const suspended = detail();
		suspended.org.suspendedAt = '2026-06-02T00:00:00.000Z';
		suspended.org.isSuspended = true;
		getOrganizationDetail.mockResolvedValue({ status: 'found', detail: suspended });
		expect(await loadDetail()).toEqual(suspended);
	});

	it('maps missing organization detail results to 404', async () => {
		getOrganizationDetail.mockResolvedValue({ status: 'not_found' });
		await expect(loadDetail()).rejects.toMatchObject({ status: 404 });
	});

	it('maps provider failures to a sanitized 500', async () => {
		getOrganizationDetail.mockResolvedValue({ status: 'provider_error', message: 'database offline' });
		const caught = await Promise.resolve(loadDetail()).catch((error: unknown) => error);
		expect(isHttpError(caught, 500)).toBe(true);
		expect(caught).toMatchObject({ body: { message: 'Failed to load organization detail' } });
	});

	it.each([null, 'billing'])('denies detail access for role %s before reading protected data', async (role) => {
		lookupRole.mockResolvedValue(role);
		await expect(loadDetail()).rejects.toMatchObject({ status: 403 });
		expect(getOrganizationDetail).not.toHaveBeenCalled();
	});
});

describe('admin organization membership action delivery', () => {
	it.each(['makeAdmin', 'transferOwnership'] as const)(
		'binds %s to the admitted actor despite forged actor fields',
		async (action) => {
			expect(
				await runAction(action, event({ targetUserId, confirmName: 'Able Company', actorUserId: ownerId }))
			).toEqual({ success: true });
			expect(command).toHaveBeenCalledTimes(1);
			expect(command).toHaveBeenCalledWith(
				action === 'makeAdmin' ? 'platform_promote_org_member' : 'platform_transfer_org_ownership',
				expect.objectContaining({ p_actor_user_id: actorId, p_organization_id: orgId, p_target_user_id: targetUserId })
			);
			expect(audit).toHaveBeenCalledWith(
				expect.objectContaining({ orgId }),
				expect.objectContaining({ userId: actorId })
			);
		}
	);
	it.each(['support', 'billing', null])('denies current platform role %s before privileged commands', async (role) => {
		authority.role = role;
		await expect(runAction('transferOwnership')).rejects.toMatchObject({ status: 403 });
		expect(command).not.toHaveBeenCalled();
		expect(audit).not.toHaveBeenCalled();
	});
	it('reports unavailable current role as 503 without leaking provider details', async () => {
		authority.error = { message: 'private database details' };
		await expect(runAction('makeAdmin')).rejects.toMatchObject({
			status: 503,
			body: { message: 'Unable to verify platform administration access' }
		});
		expect(command).not.toHaveBeenCalled();
	});
	it.each([
		['organization', 'not-a-uuid', targetUserId],
		['target', orgId, 'not-a-uuid']
	])('rejects malformed %s before command effects', async (_, id, target) => {
		expect(await runAction('makeAdmin', event({ targetUserId: target }, id))).toMatchObject({ status: 400 });
		expect(command).not.toHaveBeenCalled();
		expect(audit).not.toHaveBeenCalled();
	});
	it('preserves actionable Identity step-up fields and makes no membership RPC', async () => {
		const request = event();
		request.locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			error: null,
			data: {
				currentLevel: 'aal1',
				nextLevel: 'aal2',
				currentAuthenticationMethods: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 3600 }]
			}
		});
		expect(await runAction('transferOwnership', request)).toMatchObject({
			status: 403,
			data: { requiresStepUp: true, stepUpPath: '/auth/mfa-verify', reason: 'denied.staleSession' }
		});
		expect(command).not.toHaveBeenCalled();
	});
	it.each([
		['name_mismatch', 400],
		['multiple_current_owners', 409],
		['forbidden', 403],
		['provider_error', 503]
	] as const)('maps %s to an honest action failure', async (status, httpStatus) => {
		command.mockResolvedValue({ data: { status }, error: null });
		expect(await runAction('transferOwnership')).toMatchObject({ status: httpStatus });
		expect(audit).not.toHaveBeenCalled();
	});
	it('does not report success from an unacknowledged RPC response', async () => {
		command.mockResolvedValue({ data: null, error: { message: 'private SQL detail' } });
		const result = await runAction('transferOwnership');
		expect(result).toMatchObject({
			status: 503,
			data: { error: { message: 'Could not confirm the transfer. Reload this page before trying again.' } }
		});
		expect(audit).not.toHaveBeenCalled();
	});
});
