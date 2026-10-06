import { describe, expect, it, vi } from 'vitest';
import { createSupabaseSensitiveActionAuthorizer } from '$features/identity/index.server';
import { createOrganizationPlatformMembershipAdministration } from './platformMembership.server';
import type { OrganizationPlatformMembershipPort } from './platformMembershipTypes';

const actorId = 'd2103000-0000-4000-8000-000000000001';
const orgId = 'd2103000-0000-4000-8000-000000000101';
const targetUserId = 'd2103000-0000-4000-8000-000000000006';
function setup(role: 'super_admin' | 'support' | 'billing' = 'super_admin', stale = false) {
	const port = {
		listMembers: vi.fn<OrganizationPlatformMembershipPort['listMembers']>().mockResolvedValue([]),
		promoteMember: vi
			.fn<OrganizationPlatformMembershipPort['promoteMember']>()
			.mockResolvedValue({ status: 'provider_error' }),
		transferOwnership: vi
			.fn<OrganizationPlatformMembershipPort['transferOwnership']>()
			.mockResolvedValue({ status: 'provider_error' })
	};
	const loadActorFacts = vi.fn(async () => ({
		error: null,
		data: {
			currentLevel: 'aal1',
			nextLevel: 'aal1',
			currentAuthenticationMethods: [
				{
					method: 'password',
					timestamp: new Date(stale ? '2026-10-01T00:00:00Z' : '2026-10-03T00:00:00Z').getTime() / 1000
				}
			]
		}
	}));
	const audit = { log: vi.fn() };
	const administration = createOrganizationPlatformMembershipAdministration({
		actor: { userId: actorId, role },
		port,
		audit,
		sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
			authenticatedUserId: actorId,
			session: { access_token: 'synthetic-request-token', expires_at: 2000000000, user: { id: actorId } } as never,
			supabase: {
				auth: { mfa: { getAuthenticatorAssuranceLevel: loadActorFacts } },
				rpc: vi.fn(async () => ({ data: false, error: null }))
			} as never,
			now: () => new Date('2026-10-03T00:01:00Z')
		})
	});
	return { port, loadActorFacts, audit, administration };
}

describe('Organization privileged membership commands', () => {
	it.each(['support', 'billing'] as const)('denies %s before any assurance or privileged write', async (role) => {
		const { port, loadActorFacts, audit, administration } = setup(role);
		expect(await administration.makeAdmin({ orgId, targetUserId })).toEqual({ status: 'forbidden' });
		expect(await administration.transferOwnership({ orgId, targetUserId, confirmName: 'A' })).toEqual({
			status: 'forbidden'
		});
		expect(loadActorFacts).not.toHaveBeenCalled();
		expect(port.promoteMember).not.toHaveBeenCalled();
		expect(port.transferOwnership).not.toHaveBeenCalled();
		expect(audit.log).not.toHaveBeenCalled();
	});
	it.each(['makeAdmin', 'transferOwnership'] as const)(
		'requires step-up for stale-session %s and retains the denial details',
		async (method) => {
			const { port, audit, administration } = setup('super_admin', true);
			await expect(administration[method]({ orgId, targetUserId, confirmName: 'A' })).rejects.toMatchObject({
				status: 403,
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/login'
			});
			expect(port.promoteMember).not.toHaveBeenCalled();
			expect(port.transferOwnership).not.toHaveBeenCalled();
			expect(audit.log).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: 'warning',
					details: { sensitiveAction: expect.objectContaining({ actorUserId: actorId, reason: 'denied.staleSession' }) }
				})
			);
		}
	);
	it('binds the server actor and never audits a failed or denied provider result as success', async () => {
		const { port, audit, administration } = setup();
		await administration.makeAdmin({ orgId, targetUserId, actorUserId: 'forged' } as never);
		expect(port.promoteMember).toHaveBeenCalledWith({ orgId, targetUserId, actorUserId: actorId });
		port.transferOwnership.mockResolvedValue({ status: 'forbidden' });
		expect(await administration.transferOwnership({ orgId, targetUserId, confirmName: 'A' })).toEqual({
			status: 'forbidden'
		});
		expect(audit.log).not.toHaveBeenCalled();
	});
	it('records the acknowledged current owner and sensitive-action decision after transfer', async () => {
		const { port, audit, administration } = setup();
		const fromUserId = 'd2103000-0000-4000-8000-000000000005';
		port.transferOwnership.mockResolvedValue({
			status: 'updated',
			orgId,
			fromUserId,
			toUserId: targetUserId,
			orgName: 'A'
		});
		await administration.transferOwnership({ orgId, targetUserId, confirmName: 'A' });
		expect(audit.log).toHaveBeenCalledOnce();
		expect(audit.log).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'admin.org.transfer_ownership',
				orgId,
				details: {
					fromUserId,
					toUserId: targetUserId,
					orgName: 'A',
					sensitiveAction: expect.objectContaining({
						action: 'organization.transferOwnership',
						actorUserId: actorId,
						reason: 'allowed.recentSession'
					})
				}
			})
		);
	});
	it('allows support reads while billing cannot reach the reader', async () => {
		const support = setup('support');
		await support.administration.listMembers(orgId);
		expect(support.port.listMembers).toHaveBeenCalledWith(orgId);
		const billing = setup('billing');
		await expect(billing.administration.listMembers(orgId)).rejects.toMatchObject({ status: 403 });
		expect(billing.port.listMembers).not.toHaveBeenCalled();
	});
});
