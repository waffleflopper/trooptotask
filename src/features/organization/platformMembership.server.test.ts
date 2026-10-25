import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '$lib/audit/contracts';
import { createSupabaseSensitiveActionAuthorizer } from '$features/identity/index.server';
import { createOrganizationPlatformMembershipAdministration } from './platformMembership.server';
import type { OrganizationPlatformMembershipPort } from './platformMembershipTypes';

const actorId = 'd2103000-0000-4000-8000-000000000001';
const orgId = 'd2103000-0000-4000-8000-000000000101';
const targetUserId = 'd2103000-0000-4000-8000-000000000006';
function setup(stale = false) {
	const port = {
		listMembers: vi.fn<OrganizationPlatformMembershipPort['listMembers']>().mockResolvedValue([]),
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
	const audit = { log: vi.fn(async (_event: AuditEvent) => {}) };
	const administration = createOrganizationPlatformMembershipAdministration({
		actor: { userId: actorId },
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
	it('requires step-up for a stale session and retains the denial details', async () => {
		const { port, audit, administration } = setup(true);
		await expect(administration.transferOwnership({ orgId, targetUserId, confirmName: 'A' })).rejects.toMatchObject({
			status: 403,
			reason: 'denied.staleSession',
			requiresStepUp: true,
			stepUpPath: '/auth/login'
		});
		expect(port.transferOwnership).not.toHaveBeenCalled();
		expect(audit.log).toHaveBeenCalledWith(
			expect.objectContaining({
				severity: 'warning',
				details: { sensitiveAction: expect.objectContaining({ actorUserId: actorId, reason: 'denied.staleSession' }) }
			})
		);
	});
	it('binds the server actor and never audits a failed or denied provider result as success', async () => {
		const { port, audit, administration } = setup();
		port.transferOwnership.mockResolvedValue({ status: 'forbidden' });
		expect(
			await administration.transferOwnership({ orgId, targetUserId, confirmName: 'A', actorUserId: 'forged' } as never)
		).toEqual({ status: 'forbidden' });
		expect(port.transferOwnership).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: actorId }));
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
	it('fails the transfer when its audit write fails', async () => {
		const { port, audit, administration } = setup();
		port.transferOwnership.mockResolvedValue({
			status: 'updated',
			orgId,
			fromUserId: 'd2103000-0000-4000-8000-000000000005',
			toUserId: targetUserId,
			orgName: 'A'
		});
		audit.log.mockRejectedValue(new Error('audit unavailable'));
		await expect(administration.transferOwnership({ orgId, targetUserId, confirmName: 'A' })).rejects.toThrow(
			'audit unavailable'
		);
	});
});
