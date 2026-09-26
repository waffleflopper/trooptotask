import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAccountSetupOutboxDelivery } from './authEmailOutbox.server';
import { AUTH_WORKFLOW_NOW } from '$lib/test-support/authWorkflowFixtures';
import { createAuthEmailOutboxStore } from './accountSetupFixtures.server';

describe('auth email outbox delivery', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('records a sent Account Setup delivery without persisting raw tokens or setup URLs', async () => {
		const store = createAuthEmailOutboxStore();
		const sendSetupEmail = vi.fn().mockResolvedValue(undefined);

		const result = await sendAccountSetupOutboxDelivery(store, sendSetupEmail, {
			accessRequestId: 'request-1',
			setupLinkId: 'link-1',
			email: 'Soldier@Example.mil',
			setupUrl: 'https://app.example/auth/setup-account?token=raw-token',
			expiresAt: new Date('2026-06-05T12:00:00.000Z'),
			now: AUTH_WORKFLOW_NOW
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
				sentAt: AUTH_WORKFLOW_NOW
			})
		]);
		expect(JSON.stringify(store.records)).not.toContain('raw-token');
		expect(JSON.stringify(store.records)).not.toContain('/auth/setup-account?token=');
	});

	it('records a failed Account Setup delivery while preserving the setup link state', async () => {
		const store = createAuthEmailOutboxStore();
		const sendSetupEmail = vi.fn().mockRejectedValue(new Error('mail provider unavailable'));

		const result = await sendAccountSetupOutboxDelivery(store, sendSetupEmail, {
			accessRequestId: 'request-1',
			setupLinkId: 'link-1',
			email: 'soldier@example.mil',
			setupUrl: 'https://app.example/auth/setup-account?token=raw-token',
			expiresAt: new Date('2026-06-05T12:00:00.000Z'),
			now: AUTH_WORKFLOW_NOW
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
		const store = createAuthEmailOutboxStore();
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
			now: AUTH_WORKFLOW_NOW
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

	it('redacts a standalone setup token hash from provider errors before persisting it', async () => {
		const hash = '0123456789abcdef'.repeat(4);
		const store = createAuthEmailOutboxStore();
		const result = await sendAccountSetupOutboxDelivery(
			store,
			vi.fn().mockRejectedValue(new Error(`provider rejected hash ${hash}`)),
			{
				accessRequestId: 'request-1',
				setupLinkId: 'link-1',
				email: 'soldier@example.mil',
				setupUrl: 'https://app.example/auth/setup-account?token=raw-token',
				expiresAt: new Date('2026-06-05T12:00:00.000Z'),
				now: AUTH_WORKFLOW_NOW
			}
		);

		expect(result.status).toBe('failed');
		if (result.status !== 'failed') throw new Error('Expected delivery failure');
		expect(result.error).toBe('provider rejected hash [redacted hash]');
		expect(result.outbox.lastError).toBe('provider rejected hash [redacted hash]');
		expect(JSON.stringify(store.records)).not.toContain(hash);
	});
});
