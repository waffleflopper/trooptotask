import { vi } from 'vitest';
import {
	createAccessRequestSetupDeliveryService,
	createAccountSetupLinkIssuance,
	type AccountSetupLinkIssuanceDelivery,
	type AccountSetupLinkRecord
} from '$features/identity/index.server';

export function publicSetupDeliveryFixture(email: string, delivery: 'sent' | 'failed' = 'sent') {
	const now = new Date('2026-05-18T12:00:00.000Z');
	const expiresAt = new Date('2026-06-01T12:00:00.000Z');
	const link: AccountSetupLinkRecord = {
		id: 'setup-link-1',
		accessRequestId: 'request-1',
		tokenHash: 'synthetic-hash',
		expiresAt,
		createdAt: now,
		claimedAt: null,
		failedAt: null,
		failureReason: null,
		usedAt: null,
		revokedAt: null,
		revocationReason: null
	};
	const store = {
		listAccessRequestsByEmail: async () => [
			{
				id: 'request-1',
				email,
				status: 'approved' as const,
				createdAt: now,
				reviewedAt: now,
				setupCompletedAt: null,
				setupGrantLive: true
			}
		],
		insertPendingAccessRequest: vi.fn()
	};
	const outbox = {
		id: 'outbox-1',
		accessRequestId: 'request-1',
		setupLinkId: 'setup-link-1',
		recipient: email,
		purpose: 'account_setup' as const,
		status: delivery,
		attemptCount: 1,
		lastError: delivery === 'sent' ? null : 'mail provider unavailable',
		createdAt: now,
		updatedAt: now,
		sentAt: delivery === 'sent' ? now : null
	};
	const sendSetupDelivery = vi
		.fn<AccountSetupLinkIssuanceDelivery['send']>()
		.mockResolvedValue(
			delivery === 'sent'
				? { status: 'sent', outbox }
				: { status: 'failed', outbox, error: 'mail provider unavailable' }
		);

	return {
		store,
		sendSetupDelivery,
		createService(audit: Parameters<typeof createAccountSetupLinkIssuance>[0]['audit']) {
			return createAccessRequestSetupDeliveryService(
				store,
				createAccountSetupLinkIssuance({
					setupLinks: {
						createForAccessRequest: async () => ({
							status: 'created',
							accessRequestId: 'request-1',
							rawToken: 'synthetic-setup-token',
							link,
							expiresAt,
							setupPath: '/auth/setup-account?token=synthetic-setup-token',
							revokedLinkIds: ['previous-link']
						})
					},
					setupDelivery: { send: sendSetupDelivery },
					audit
				}),
				{ now: () => new Date(now) }
			);
		}
	};
}
