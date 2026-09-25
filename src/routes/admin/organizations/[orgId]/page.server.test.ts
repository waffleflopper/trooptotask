import { isHttpError, type RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformMembershipRecord } from '$lib/server/core/useCases/platformMembershipAdministration';

const { lookupRole, audit, store, getOrganizationDetail } = vi.hoisted(() => ({
	lookupRole: vi.fn(),
	audit: vi.fn(),
	store: {
		listMembers: vi.fn(),
		getOrganization: vi.fn(),
		getMembership: vi.fn(),
		getCurrentOwner: vi.fn(),
		setMembershipRole: vi.fn()
	},
	getOrganizationDetail: vi.fn()
}));

vi.mock('$lib/server/admin', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/admin')>()),
	getAdminRole: lookupRole
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({}) }));
vi.mock('$lib/server/auditLog', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/auditLog')>()),
	auditLog: audit
}));
vi.mock('$lib/server/adapters/supabasePlatformMembershipAdministration', async () => {
	const { createPlatformMembershipAdministration } =
		await import('$lib/server/core/useCases/platformMembershipAdministration');
	return {
		createSupabasePlatformMembershipAdministration: (ctx: { audit: typeof audit }) =>
			createPlatformMembershipAdministration({ store, audit: ctx.audit })
	};
});
vi.mock('$lib/server/adapters/supabasePlatformOrganizationDetail', () => ({
	createSupabasePlatformOrganizationDetail: () => ({ getOrganizationDetail })
}));

import { actions, load } from './+page.server';

const orgId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const targetUserId = '33333333-3333-4333-8333-333333333333';
let memberships: PlatformMembershipRecord[];

function event(form: Record<string, string> = { targetUserId, confirmName: 'Able Company' }, id = orgId): RequestEvent {
	return {
		locals: { actor: { userId: 'admin-1' }, user: { id: 'admin-1' }, supabase: {}, session: null },
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
	lookupRole.mockResolvedValue('super_admin');
	getOrganizationDetail.mockResolvedValue({ status: 'found', detail: detail() });
	memberships = [
		{ orgId, userId: ownerId, role: 'owner' },
		{ orgId, userId: targetUserId, role: 'member' }
	];
	store.getOrganization.mockImplementation(async (id: string) => (id === orgId ? { id, name: 'Able Company' } : null));
	store.getMembership.mockImplementation(async (input: { orgId: string; userId: string }) => {
		const member = memberships.find((member) => member.orgId === input.orgId && member.userId === input.userId);
		return member ? { ...member } : null;
	});
	store.getCurrentOwner.mockImplementation(
		async (id: string) => memberships.find((member) => member.orgId === id && member.role === 'owner') ?? null
	);
	store.setMembershipRole.mockImplementation(async (input: PlatformMembershipRecord) => {
		const member = memberships.find((member) => member.orgId === input.orgId && member.userId === input.userId);
		if (!member) throw new Error('Membership not found');
		member.role = input.role;
	});
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

describe('admin organization membership actions', () => {
	it('promotes the selected member and preserves the existing owner', async () => {
		expect(await runAction('makeAdmin')).toEqual({ success: true });
		expect(memberships).toEqual([
			{ orgId, userId: ownerId, role: 'owner' },
			{ orgId, userId: targetUserId, role: 'admin' }
		]);
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'admin.org.make_admin', orgId }),
			expect.any(Object)
		);
	});

	it('transfers ownership to the selected member and preserves the former owner as admin', async () => {
		expect(await runAction('transferOwnership')).toEqual({ success: true });
		expect(memberships).toEqual([
			{ orgId, userId: ownerId, role: 'admin' },
			{ orgId, userId: targetUserId, role: 'owner' }
		]);
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'admin.org.transfer_ownership', orgId }),
			expect.any(Object)
		);
	});

	for (const action of ['makeAdmin', 'transferOwnership'] as const) {
		it(`${action} rejects support administrators before any membership work`, async () => {
			lookupRole.mockResolvedValue('support');
			expect(await runAction(action)).toMatchObject({ status: 403 });
			expect(store.getMembership).not.toHaveBeenCalled();
			expect(store.setMembershipRole).not.toHaveBeenCalled();
			expect(audit).not.toHaveBeenCalled();
		});

		it.each([null, 'billing'])(`${action} rejects role %s before protected effects`, async (role) => {
			lookupRole.mockResolvedValue(role);
			await expect(runAction(action)).rejects.toMatchObject({ status: 403 });
			expect(store.setMembershipRole).not.toHaveBeenCalled();
			expect(audit).not.toHaveBeenCalled();
		});

		it.each([
			['organization', 'not-a-uuid', targetUserId],
			['target user', orgId, 'not-a-uuid']
		])(`${action} rejects malformed %s IDs without mutations`, async (_, id, target) => {
			expect(await runAction(action, event({ targetUserId: target }, id))).toMatchObject({ status: 400 });
			expect(store.setMembershipRole).not.toHaveBeenCalled();
		});
	}

	it.each([
		['missing', 'Target user is not a member of this organization'],
		['admin', 'Target user is already an admin'],
		['owner', 'Target user is already the owner']
	] as const)('rejects make-admin for a target who is %s without mutations', async (role, message) => {
		if (role === 'missing') memberships.pop();
		else memberships[1].role = role;
		expect(await runAction('makeAdmin')).toMatchObject({ status: 400, data: { error: { message } } });
		expect(store.setMembershipRole).not.toHaveBeenCalled();
	});

	it('requires matching organization confirmation before ownership transfer', async () => {
		expect(await runAction('transferOwnership', event({ targetUserId, confirmName: 'Other Company' }))).toMatchObject({
			status: 400
		});
		expect(store.setMembershipRole).not.toHaveBeenCalled();
	});

	it('returns a sanitized failure when make-admin storage fails', async () => {
		store.setMembershipRole.mockRejectedValueOnce(new Error('private database details'));
		expect(await runAction('makeAdmin')).toMatchObject({
			status: 500,
			data: { error: { message: 'Failed to update membership' } }
		});
		expect(memberships[1].role).toBe('member');
		expect(audit).not.toHaveBeenCalled();
	});

	it('returns a sanitized failure when ownership lookup throws', async () => {
		store.getOrganization.mockRejectedValueOnce(new Error('private database details'));
		expect(await runAction('transferOwnership')).toMatchObject({
			status: 500,
			data: { error: { message: 'Transfer failed' } }
		});
		expect(store.setMembershipRole).not.toHaveBeenCalled();
	});

	it('restores the current owner when promotion fails and reports failure', async () => {
		store.setMembershipRole.mockImplementationOnce(async () => {
			memberships[0].role = 'admin';
		});
		store.setMembershipRole.mockRejectedValueOnce(new Error('promotion failed'));
		expect(await runAction('transferOwnership')).toMatchObject({
			status: 500,
			data: { error: { message: 'Transfer failed during promotion' } }
		});
		expect(memberships[0].role).toBe('owner');
		expect(memberships[1].role).toBe('member');
		expect(audit).not.toHaveBeenCalled();
	});

	it('reports when the current owner cannot be verified without changing ownership', async () => {
		store.getCurrentOwner.mockRejectedValueOnce(new Error('owner lookup failed'));
		expect(await runAction('transferOwnership')).toMatchObject({
			status: 500,
			data: { error: { message: 'Could not verify current owner' } }
		});
		expect(store.setMembershipRole).not.toHaveBeenCalled();
	});

	it('reports when ownership transfer rollback needs manual recovery', async () => {
		store.setMembershipRole.mockImplementationOnce(async () => {
			memberships[0].role = 'admin';
		});
		store.setMembershipRole.mockRejectedValueOnce(new Error('promotion failed'));
		store.setMembershipRole.mockRejectedValueOnce(new Error('rollback failed'));
		expect(await runAction('transferOwnership')).toMatchObject({
			status: 500,
			data: {
				error: { message: 'Transfer failed during promotion; original owner could not be restored automatically' }
			}
		});
		expect(audit).not.toHaveBeenCalled();
	});
});
