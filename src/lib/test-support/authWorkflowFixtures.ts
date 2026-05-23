import type { OrganizationMemberPermissions } from '$lib/types';
import type { TargetMemberAccessCommand } from '$lib/access/memberAccessCommands';
import type {
	AccessRequestSetupDeliveryStore,
	AccessRequestSetupRequest,
	CreatePendingAccessRequestInput
} from '../server/accessRequestSetupDelivery';
import type { AccountSetupAuthAdapter } from '../server/accountSetupCompletion';
import type { AccountSetupLinkRecord, CreateAccountSetupLinkInput } from '../server/accountSetupLinks';
import type {
	AuthEmailOutboxRecord,
	AuthEmailOutboxStore,
	CreateSetupEmailOutboxInput
} from '../server/authEmailOutbox';
import type {
	OrganizationInvitationEmailOutboxRecord,
	OrganizationInvitationEmailOutboxStore
} from '../server/organizationInvitationDelivery';
import type {
	OrganizationInvitationRateLimitAction,
	OrganizationInvitationRateLimiter
} from '../server/organizationInvitationRateLimit';

export const AUTH_WORKFLOW_NOW = new Date('2026-05-22T12:00:00.000Z');
export const AUTH_WORKFLOW_REVIEWED_AT = new Date('2026-05-02T12:00:00.000Z');
export const AUTH_WORKFLOW_CREATED_AT = new Date('2026-05-01T12:00:00.000Z');
export const AUTH_WORKFLOW_SETUP_EXPIRES_AT = new Date('2026-06-05T12:00:00.000Z');

export function fixedAuthWorkflowTime(now: Date = AUTH_WORKFLOW_NOW): { now: Date; nowFn: () => Date } {
	return {
		now,
		nowFn: () => new Date(now)
	};
}

export function accessRequestFixture(overrides: Partial<AccessRequestSetupRequest> = {}): AccessRequestSetupRequest {
	return {
		id: 'request-1',
		email: 'test@example.com',
		status: 'approved',
		createdAt: AUTH_WORKFLOW_CREATED_AT,
		reviewedAt: AUTH_WORKFLOW_REVIEWED_AT,
		setupCompletedAt: null,
		...overrides
	};
}

export function accountSetupLinkFixture(overrides: Partial<AccountSetupLinkRecord> = {}): AccountSetupLinkRecord {
	return {
		id: 'setup-link-1',
		accessRequestId: 'request-1',
		tokenHash: 'token-hash-1',
		expiresAt: AUTH_WORKFLOW_SETUP_EXPIRES_AT,
		createdAt: AUTH_WORKFLOW_NOW,
		claimedAt: null,
		failedAt: null,
		failureReason: null,
		usedAt: null,
		revokedAt: null,
		revocationReason: null,
		...overrides
	};
}

export interface OrganizationInvitationFixture {
	id: string;
	organizationId: string;
	email: string;
	status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked' | 'blocked';
	role: 'member' | 'admin';
	requiresAccountSetup: boolean;
	createdAt: Date;
	expiresAt: Date;
}

export function organizationInvitationFixture(
	overrides: Partial<OrganizationInvitationFixture> = {}
): OrganizationInvitationFixture {
	return {
		id: 'invite-1',
		organizationId: 'org-1',
		email: 'invitee@example.com',
		status: 'pending',
		role: 'member',
		requiresAccountSetup: false,
		createdAt: AUTH_WORKFLOW_CREATED_AT,
		expiresAt: AUTH_WORKFLOW_SETUP_EXPIRES_AT,
		...overrides
	};
}

export interface UserAccountFixture {
	id: string;
	email: string;
}

export function userAccountFixture(overrides: Partial<UserAccountFixture> = {}): UserAccountFixture {
	return {
		id: 'user-1',
		email: 'user@example.com',
		...overrides
	};
}

export interface OrganizationMembershipFixture {
	id: string;
	organizationId: string;
	userId: string | null;
	email: string | null;
	role: 'owner' | 'admin' | 'member' | null;
	canManageMembers: boolean | null;
	permissions?: OrganizationMemberPermissions;
	memberAccess: TargetMemberAccessCommand;
}

export function organizationMembershipFixture(
	overrides: Partial<OrganizationMembershipFixture> = {}
): OrganizationMembershipFixture {
	return {
		id: 'membership-1',
		organizationId: 'org-1',
		userId: 'user-1',
		email: 'member@example.com',
		role: 'member',
		canManageMembers: false,
		memberAccess: memberAccessFixture(),
		...overrides
	};
}

export function memberAccessFixture(overrides: Partial<TargetMemberAccessCommand> = {}): TargetMemberAccessCommand {
	return {
		memberPreset: 'editor',
		capabilityOverrides: {},
		scopeSet: { kind: 'organization' },
		...overrides
	};
}

export function authEmailOutboxRecordFixture(
	input: CreateSetupEmailOutboxInput,
	overrides: Partial<AuthEmailOutboxRecord> = {}
): AuthEmailOutboxRecord {
	return {
		id: 'outbox-1',
		accessRequestId: input.accessRequestId,
		setupLinkId: input.setupLinkId,
		recipient: input.recipient,
		purpose: 'account_setup',
		status: 'pending',
		attemptCount: 0,
		lastError: null,
		createdAt: input.createdAt,
		updatedAt: input.createdAt,
		sentAt: null,
		...overrides
	};
}

export function organizationInvitationEmailOutboxRecordFixture(
	input: { organizationId: string; invitationId: string; recipient: string; createdAt: Date },
	overrides: Partial<OrganizationInvitationEmailOutboxRecord> = {}
): OrganizationInvitationEmailOutboxRecord {
	return {
		id: 'outbox-1',
		organizationId: input.organizationId,
		invitationId: input.invitationId,
		recipient: input.recipient,
		status: 'pending',
		attemptCount: 0,
		lastError: null,
		createdAt: input.createdAt,
		updatedAt: input.createdAt,
		sentAt: null,
		...overrides
	};
}

export function createAuthEmailOutboxStore() {
	const records: AuthEmailOutboxRecord[] = [];
	const store: AuthEmailOutboxStore & { records: AuthEmailOutboxRecord[] } = {
		records,
		async insertSetupEmailDelivery(input) {
			const record = authEmailOutboxRecordFixture(input, { id: `outbox-${records.length + 1}` });
			records.push(record);
			return record;
		},
		async markSetupEmailDeliverySent(id, sentAt) {
			const record = findOutboxRecord(records, id);
			record.status = 'sent';
			record.attemptCount = 1;
			record.lastError = null;
			record.updatedAt = sentAt;
			record.sentAt = sentAt;
			return record;
		},
		async markSetupEmailDeliveryFailed(id, failedAt, lastError) {
			const record = findOutboxRecord(records, id);
			record.status = 'failed';
			record.attemptCount = 1;
			record.lastError = lastError;
			record.updatedAt = failedAt;
			record.sentAt = null;
			return record;
		}
	};
	return store;
}

export function createOrganizationInvitationEmailOutboxStore() {
	const records: OrganizationInvitationEmailOutboxRecord[] = [];
	const store: OrganizationInvitationEmailOutboxStore & { records: OrganizationInvitationEmailOutboxRecord[] } = {
		records,
		async insertInvitationEmailDelivery(input) {
			const record = organizationInvitationEmailOutboxRecordFixture(input, { id: `outbox-${records.length + 1}` });
			records.push(record);
			return record;
		},
		async markInvitationEmailDeliverySent(id, sentAt) {
			const record = findOutboxRecord(records, id);
			record.status = 'sent';
			record.attemptCount = 1;
			record.lastError = null;
			record.updatedAt = sentAt;
			record.sentAt = sentAt;
			return record;
		},
		async markInvitationEmailDeliveryFailed(id, failedAt, lastError) {
			const record = findOutboxRecord(records, id);
			record.status = 'failed';
			record.attemptCount = 1;
			record.lastError = lastError;
			record.updatedAt = failedAt;
			record.sentAt = null;
			return record;
		}
	};
	return store;
}

export function createAccessRequestSetupDeliveryStore(requests: AccessRequestSetupRequest[] = []) {
	const setupLinks: AccountSetupLinkRecord[] = [];
	const outboxStore = createAuthEmailOutboxStore();
	const insertedRequests: CreatePendingAccessRequestInput[] = [];
	const revokedAccessRequestIds: string[] = [];
	let linkId = 0;

	const store: AccessRequestSetupDeliveryStore & {
		insertedRequests: CreatePendingAccessRequestInput[];
		revokedAccessRequestIds: string[];
		setupLinks: AccountSetupLinkRecord[];
		outboxRecords: AuthEmailOutboxRecord[];
	} = {
		...outboxStore,
		insertedRequests,
		revokedAccessRequestIds,
		setupLinks,
		outboxRecords: outboxStore.records,
		async listAccessRequestsByEmail(email) {
			return requests.filter((request) => request.email.toLowerCase() === email.toLowerCase());
		},
		async insertPendingAccessRequest(input) {
			insertedRequests.push(input);
		},
		async getAccessRequest(id) {
			const request = requests.find((item) => item.id === id);
			if (!request) return null;
			return {
				id: request.id,
				email: request.email,
				status: request.status,
				setupCompletedAt: request.setupCompletedAt
			};
		},
		async revokeUnusedLinksForAccessRequest(accessRequestId, revokedAt) {
			const revoked: AccountSetupLinkRecord[] = [];
			revokedAccessRequestIds.push(accessRequestId);
			for (const link of setupLinks) {
				if (
					link.accessRequestId === accessRequestId &&
					!link.claimedAt &&
					!link.failedAt &&
					!link.usedAt &&
					!link.revokedAt
				) {
					link.revokedAt = revokedAt;
					link.revocationReason = 'replaced';
					revoked.push(link);
				}
			}
			return revoked;
		},
		async insertSetupLink(input: CreateAccountSetupLinkInput) {
			const record = accountSetupLinkFixture({
				id: `setup-link-${++linkId}`,
				accessRequestId: input.accessRequestId,
				tokenHash: input.tokenHash,
				expiresAt: input.expiresAt,
				createdAt: input.createdAt
			});
			setupLinks.push(record);
			return record;
		},
		async findByTokenHash(tokenHash) {
			return setupLinks.find((link) => link.tokenHash === tokenHash) ?? null;
		},
		async getSetupLink(id) {
			return setupLinks.find((link) => link.id === id) ?? null;
		},
		async claimPendingLink(id, claimedAt) {
			const link = setupLinks.find((item) => item.id === id);
			if (!link || link.claimedAt || link.failedAt || link.usedAt || link.revokedAt || link.expiresAt <= claimedAt) {
				return null;
			}
			link.claimedAt = claimedAt;
			return link;
		},
		async markCompleted(id, completedAt) {
			const link = setupLinks.find((item) => item.id === id);
			if (!link || !link.claimedAt || link.failedAt || link.usedAt || link.revokedAt) return null;
			link.usedAt = completedAt;
			return link;
		},
		async markFailed(id, failedAt, failureReason) {
			const link = setupLinks.find((item) => item.id === id);
			if (!link || !link.claimedAt || link.failedAt || link.usedAt || link.revokedAt) return null;
			link.failedAt = failedAt;
			link.failureReason = failureReason;
			return link;
		},
		async listCleanupEligible() {
			return [];
		},
		async revokeExpiredUnusedLinks() {
			return [];
		},
		async countActiveLinks() {
			return 0;
		}
	};

	return store;
}

export function createFakeAccountSetupAuthAdapter(
	options: { userId?: string; createError?: Error; signInError?: Error } = {}
): AccountSetupAuthAdapter & {
	createdUsers: Array<{ email: string; password: string }>;
	signIns: Array<{ email: string; password: string }>;
} {
	const createdUsers: Array<{ email: string; password: string }> = [];
	const signIns: Array<{ email: string; password: string }> = [];
	return {
		createdUsers,
		signIns,
		async createOrActivateConfirmedUser(input) {
			createdUsers.push(input);
			if (options.createError) throw options.createError;
			return { userId: options.userId ?? 'user-1' };
		},
		async signInWithPassword(input) {
			signIns.push(input);
			if (options.signInError) throw options.signInError;
		}
	};
}

export function createFakeOrganizationInvitationDeliveryPort(status: 'sent' | 'failed' = 'sent') {
	const deliveries: unknown[] = [];
	return {
		deliveries,
		async sendInvitationEmail(input: unknown) {
			deliveries.push(input);
			return status === 'sent'
				? { status: 'sent' as const, outbox: { id: 'outbox-1' } }
				: { status: 'failed' as const, outbox: { id: 'outbox-1' }, error: 'mail provider unavailable' };
		}
	};
}

export function createFakeOrganizationInvitationRateLimiter(
	decision: { limited: boolean; retryAfterMs?: number; action?: OrganizationInvitationRateLimitAction } = {
		limited: false
	}
): OrganizationInvitationRateLimiter & { checks: unknown[] } {
	const checks: unknown[] = [];
	return {
		checks,
		async check(input) {
			checks.push(input);
			const action = decision.action ?? input.action;
			const durableDecision = decision.limited
				? {
						limited: true as const,
						namespace: `organization-invitation-${action}-recipient`,
						dimensions: ['recipient'],
						limitedDimensions: ['recipient'],
						windowMs: 900_000,
						maxRequests: 3,
						retryAfterMs: decision.retryAfterMs ?? 90_000
					}
				: {
						limited: false as const,
						namespace: `organization-invitation-${action}-recipient`,
						dimensions: ['recipient'],
						limitedDimensions: [],
						windowMs: 900_000,
						maxRequests: 3
					};
			return {
				limited: decision.limited,
				retryAfterMs: decision.retryAfterMs,
				action,
				checks: [durableDecision]
			};
		}
	};
}

function findOutboxRecord<T extends { id: string }>(records: T[], id: string): T {
	const record = records.find((item) => item.id === id);
	if (!record) throw new Error('missing outbox');
	return record;
}
