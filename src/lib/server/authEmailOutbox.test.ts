import { describe, expect, it, vi } from 'vitest';
import {
	sendAccountSetupOutboxDelivery,
	type AuthEmailOutboxRecord,
	type AuthEmailOutboxStore,
	type CreateSetupEmailOutboxInput
} from './authEmailOutbox';

const NOW = new Date('2026-05-22T12:00:00.000Z');

function makeRecord(input: CreateSetupEmailOutboxInput): AuthEmailOutboxRecord {
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
		sentAt: null
	};
}

function makeStore() {
	const records: AuthEmailOutboxRecord[] = [];
	const store: AuthEmailOutboxStore & { records: AuthEmailOutboxRecord[] } = {
		records,
		async insertSetupEmailDelivery(input) {
			const record = makeRecord(input);
			records.push(record);
			return record;
		},
		async markSetupEmailDeliverySent(id, sentAt) {
			const record = records.find((item) => item.id === id);
			if (!record) throw new Error('outbox missing');
			record.status = 'sent';
			record.attemptCount = 1;
			record.lastError = null;
			record.updatedAt = sentAt;
			record.sentAt = sentAt;
			return record;
		},
		async markSetupEmailDeliveryFailed(id, failedAt, lastError) {
			const record = records.find((item) => item.id === id);
			if (!record) throw new Error('outbox missing');
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

describe('auth email outbox delivery', () => {
	it('records a sent Account Setup delivery without persisting raw tokens or setup URLs', async () => {
		const store = makeStore();
		const sendSetupEmail = vi.fn().mockResolvedValue(undefined);

		const result = await sendAccountSetupOutboxDelivery(store, sendSetupEmail, {
			accessRequestId: 'request-1',
			setupLinkId: 'link-1',
			email: 'Soldier@Example.mil',
			setupUrl: 'https://app.example/auth/setup-account?token=raw-token',
			expiresAt: new Date('2026-06-05T12:00:00.000Z'),
			now: NOW
		});

		expect(result.status).toBe('sent');
		expect(sendSetupEmail).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			setupUrl: 'https://app.example/auth/setup-account?token=raw-token',
			expiresAt: new Date('2026-06-05T12:00:00.000Z')
		});
		expect(store.records).toEqual([
			expect.objectContaining({
				accessRequestId: 'request-1',
				setupLinkId: 'link-1',
				recipient: 'soldier@example.mil',
				purpose: 'account_setup',
				status: 'sent',
				attemptCount: 1,
				lastError: null,
				sentAt: NOW
			})
		]);
		expect(JSON.stringify(store.records)).not.toContain('raw-token');
		expect(JSON.stringify(store.records)).not.toContain('/auth/setup-account?token=');
	});

	it('records a failed Account Setup delivery while preserving the setup link state', async () => {
		const store = makeStore();
		const sendSetupEmail = vi.fn().mockRejectedValue(new Error('mail provider unavailable'));

		const result = await sendAccountSetupOutboxDelivery(store, sendSetupEmail, {
			accessRequestId: 'request-1',
			setupLinkId: 'link-1',
			email: 'soldier@example.mil',
			setupUrl: 'https://app.example/auth/setup-account?token=raw-token',
			expiresAt: new Date('2026-06-05T12:00:00.000Z'),
			now: NOW
		});

		expect(result).toEqual({
			status: 'failed',
			error: 'mail provider unavailable',
			outbox: expect.objectContaining({
				setupLinkId: 'link-1',
				status: 'failed',
				attemptCount: 1,
				lastError: 'mail provider unavailable',
				sentAt: null
			})
		});
		expect(JSON.stringify(store.records)).not.toContain('raw-token');
		expect(JSON.stringify(store.records)).not.toContain('/auth/setup-account?token=');
	});

	it('redacts setup tokens and full setup URLs from stored delivery errors', async () => {
		const store = makeStore();
		const sendSetupEmail = vi
			.fn()
			.mockRejectedValue(
				new Error('provider rejected https://app.example/auth/setup-account?token=raw-token and token=raw-token')
			);

		const result = await sendAccountSetupOutboxDelivery(store, sendSetupEmail, {
			accessRequestId: 'request-1',
			setupLinkId: 'link-1',
			email: 'soldier@example.mil',
			setupUrl: 'https://app.example/auth/setup-account?token=raw-token',
			expiresAt: new Date('2026-06-05T12:00:00.000Z'),
			now: NOW
		});

		expect(result).toEqual({
			status: 'failed',
			error: 'provider rejected [redacted setup url] and token=[redacted]',
			outbox: expect.objectContaining({
				status: 'failed',
				lastError: 'provider rejected [redacted setup url] and token=[redacted]'
			})
		});
		expect(JSON.stringify(store.records)).not.toContain('raw-token');
		expect(JSON.stringify(store.records)).not.toContain('/auth/setup-account?token=');
	});
});
