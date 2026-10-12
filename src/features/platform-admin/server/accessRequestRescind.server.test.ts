import { describe, expect, it, vi } from 'vitest';
import { allowedDecision, makeDeps, makeStore } from './accessRequestAdministration.test-support.server';

describe('Platform Access Request rescind', () => {
	it('rescinds an approved incomplete request, blocks its pending invitations and tells their governors', async () => {
		const { admin, deps } = makeDeps({
			sensitiveActionAuthorizer: {
				authorize: vi.fn().mockResolvedValue(allowedDecision('platform.accessRequest.rescind'))
			},
			store: makeStore({
				rescindApprovedAccessRequestAndBlockLinkedInvitations: vi.fn().mockResolvedValue({
					status: 'rescinded',
					blockedInvitations: [
						{
							id: 'invite-1',
							organizationId: 'org-1',
							email: 'invitee@example.com',
							blockedAt: '2026-05-22T12:00:00.000Z'
						}
					]
				})
			})
		});

		expect(await admin.rescind({ accessRequestId: 'request-1', actorUserId: 'admin-1' })).toEqual({
			status: 'rescinded'
		});
		expect(vi.mocked(deps.audit).mock.calls.map(([event]) => event)).toEqual([
			{
				action: 'access_request.rescinded',
				resourceType: 'access_request',
				resourceId: 'request-1',
				details: { blockedInvitationCount: 1 },
				severity: 'warning'
			}
		]);
		expect(vi.mocked(deps.notifyGovernors.notifyInvitationBlocked).mock.calls).toEqual([
			[{ organizationId: 'org-1', adminUserId: 'admin-1', email: 'invitee@example.com', reason: 'rescinded' }]
		]);
	});

	it('requires a fresh step-up before rescinding and leaves the request untouched when denied', async () => {
		const rescindApprovedAccessRequestAndBlockLinkedInvitations = vi.fn();
		const { admin, deps } = makeDeps({
			sensitiveActionAuthorizer: {
				authorize: vi.fn().mockResolvedValue({
					...allowedDecision('platform.accessRequest.rescind'),
					allowed: false,
					reason: 'denied.staleSession',
					nextAssuranceLevel: 'aal2',
					requiresStepUp: true
				})
			},
			store: makeStore({ rescindApprovedAccessRequestAndBlockLinkedInvitations })
		});

		expect(await admin.rescind({ accessRequestId: 'request-1', actorUserId: 'admin-1' })).toMatchObject({
			status: 'authorization_denied',
			failure: { reason: 'denied.staleSession', requiresStepUp: true, stepUpPath: '/auth/mfa-verify' }
		});
		expect(rescindApprovedAccessRequestAndBlockLinkedInvitations).not.toHaveBeenCalled();
		expect(vi.mocked(deps.audit).mock.calls.map(([event]) => [event.action, event.severity])).toEqual([
			['access_request.rescission_authorization_denied', 'warning']
		]);
	});

	it.each([
		['claim-held', 'claim_held'],
		['completed', 'setup_completed'],
		['not_found', 'not_approved']
	] as const)('refuses to rescind a %s request without auditing a rescission', async (storeStatus, status) => {
		const { admin, deps } = makeDeps({
			store: makeStore({
				rescindApprovedAccessRequestAndBlockLinkedInvitations: vi
					.fn()
					.mockResolvedValue({ status: storeStatus, blockedInvitations: [] })
			})
		});

		expect(await admin.rescind({ accessRequestId: 'request-1', actorUserId: 'admin-1' })).toEqual({ status });
		expect(deps.audit).not.toHaveBeenCalled();
		expect(deps.notifyGovernors.notifyInvitationBlocked).not.toHaveBeenCalled();
	});
});
