import type { AccountSetupLinkRecord } from './accountSetupLinks.server';
import type {
	AuthEmailOutboxRecord,
	AuthEmailOutboxStore,
	CreateSetupEmailOutboxInput
} from './authEmailOutbox.server';
import { AUTH_WORKFLOW_NOW, AUTH_WORKFLOW_SETUP_EXPIRES_AT } from '$lib/test-support/authWorkflowFixtures';

export function fixedAuthWorkflowTime(now: Date = AUTH_WORKFLOW_NOW): { now: Date; nowFn: () => Date } {
	return {
		now,
		nowFn: () => new Date(now)
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

function findOutboxRecord<T extends { id: string }>(records: T[], id: string): T {
	const record = records.find((item) => item.id === id);
	if (!record) throw new Error('missing outbox');
	return record;
}
