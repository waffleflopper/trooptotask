import { vi } from 'vitest';
import {
	createPlatformAccessRequestAdministration,
	type PlatformAccessRequestAdministrationDependencies,
	type PlatformAccessRequestAdministrationStore
} from './accessRequestAdministration.server';
import type { AccountSetupLinkRecord, CreateAccountSetupLinkResult } from '$features/identity/index.server';
import type { SensitiveActionDecision } from '$features/identity/contracts';

export const now = new Date('2026-05-22T12:00:00.000Z');

export function makeSetupRecord(overrides: Partial<AccountSetupLinkRecord> = {}): AccountSetupLinkRecord {
	return {
		id: 'link-1',
		accessRequestId: 'request-1',
		tokenHash: 'hash',
		expiresAt: new Date('2026-06-01T12:00:00.000Z'),
		createdAt: new Date('2026-05-18T13:00:00.000Z'),
		claimedAt: null,
		failedAt: null,
		failureReason: null,
		usedAt: null,
		revokedAt: null,
		revocationReason: null,
		...overrides
	};
}

export function allowedDecision(action = 'platform.accessRequest.approve'): SensitiveActionDecision {
	return {
		allowed: true,
		action: action as SensitiveActionDecision['action'],
		reason: 'allowed.recentSession',
		actorUserId: 'admin-1',
		target: { type: 'access_request', id: 'request-1' },
		currentAssuranceLevel: 'aal1',
		nextAssuranceLevel: 'aal1',
		sessionAgeMs: 60_000,
		recentSessionWindowMs: 900_000,
		requiresStepUp: false
	};
}

export function createCreatedSetupResult(
	overrides: Partial<Extract<CreateAccountSetupLinkResult, { status: 'created' }>> = {}
) {
	return {
		status: 'created' as const,
		accessRequestId: 'request-1',
		rawToken: 'raw-token',
		setupPath: '/auth/setup-account?token=raw-token',
		expiresAt: new Date('2026-06-01T12:00:00.000Z'),
		link: makeSetupRecord(),
		revokedLinkIds: [],
		...overrides
	};
}

export function makeStore(
	overrides: Partial<PlatformAccessRequestAdministrationStore> = {}
): PlatformAccessRequestAdministrationStore {
	return {
		listAccessRequests: vi.fn().mockResolvedValue([]),
		getPendingAccessRequestForApproval: vi.fn().mockResolvedValue({
			id: 'request-1',
			email: 'Soldier@Example.mil',
			status: 'pending',
			setup_completed_at: null
		}),
		markPendingRequestApproved: vi.fn().mockResolvedValue('approved'),
		getApprovedAccessRequestForResend: vi.fn().mockResolvedValue({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setup_completed_at: null
		}),
		rejectPendingAccessRequestAndBlockLinkedInvitations: vi.fn().mockResolvedValue({
			status: 'rejected',
			blockedInvitations: []
		}),
		rescindApprovedAccessRequestAndBlockLinkedInvitations: vi.fn().mockResolvedValue({
			status: 'rescinded',
			blockedInvitations: []
		}),
		...overrides
	};
}

export function makeDeps(overrides: Partial<PlatformAccessRequestAdministrationDependencies> = {}) {
	const store = makeStore(overrides.store);
	const deps: PlatformAccessRequestAdministrationDependencies = {
		store,
		setupLinks: {
			createForAccessRequest: vi.fn().mockResolvedValue(createCreatedSetupResult())
		},
		setupDelivery: {
			send: vi.fn().mockResolvedValue({
				status: 'sent',
				outbox: { id: 'outbox-1', status: 'sent' }
			})
		},
		sensitiveActionAuthorizer: {
			authorize: vi.fn().mockResolvedValue(allowedDecision())
		},
		checkSetupRateLimit: vi.fn().mockResolvedValue({
			limited: false,
			action: 'approval',
			checks: []
		}),
		audit: vi.fn(),
		notifyGovernors: {
			notifyInvitationBlocked: vi.fn().mockResolvedValue(undefined)
		},
		now: () => now,
		...overrides
	};
	return { deps, admin: createPlatformAccessRequestAdministration(deps) };
}
