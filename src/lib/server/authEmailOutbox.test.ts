import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoverAccountSetupEmailDelivery, sendAccountSetupOutboxDelivery } from './authEmailOutbox';
import { AUTH_WORKFLOW_NOW, createAuthEmailOutboxStore } from '$lib/test-support/authWorkflowFixtures';

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

	it('recovers a failed Account Setup delivery by creating a fresh replacement setup link', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://app.example');
		const store = createAuthEmailOutboxStore();
		const setupLinks = {
			createForAccessRequest: vi.fn().mockResolvedValue({
				status: 'created',
				accessRequestId: 'request-1',
				rawToken: 'fresh-raw-token',
				setupPath: '/auth/setup-account?token=fresh-raw-token',
				expiresAt: new Date('2026-06-05T12:00:00.000Z'),
				link: { id: 'new-link-1' },
				revokedLinks: [{ id: 'old-link-1' }]
			})
		};
		const sendSetupEmail = vi.fn().mockResolvedValue(undefined);
		await store.insertSetupEmailDelivery({
			accessRequestId: 'request-1',
			setupLinkId: 'old-link-1',
			recipient: 'soldier@example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});
		await store.markSetupEmailDeliveryFailed('outbox-1', AUTH_WORKFLOW_NOW, 'mail provider unavailable');

		const result = await recoverAccountSetupEmailDelivery(store, setupLinks, sendSetupEmail, {
			outboxId: 'outbox-1',
			publicOrigin: 'https://app.example',
			now: AUTH_WORKFLOW_NOW
		});

		expect(result).toEqual({
			status: 'sent',
			outbox: expect.objectContaining({ setupLinkId: 'new-link-1', status: 'sent' }),
			replacement: expect.objectContaining({ setupLinkId: 'new-link-1', revokedSetupLinkIds: ['old-link-1'] })
		});
		expect(setupLinks.createForAccessRequest).toHaveBeenCalledWith('request-1');
		expect(sendSetupEmail).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			setupUrl: 'https://app.example/auth/setup-account?token=fresh-raw-token',
			expiresAt: new Date('2026-06-05T12:00:00.000Z')
		});
		expect(JSON.stringify(store.records)).not.toContain('fresh-raw-token');
		expect(JSON.stringify(store.records)).not.toContain('/auth/setup-account?token=');
	});

	it('uses the trusted app origin resolver for recovered Account Setup delivery URLs', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://official.example');
		const store = createAuthEmailOutboxStore();
		const setupLinks = {
			createForAccessRequest: vi.fn().mockResolvedValue({
				status: 'created',
				accessRequestId: 'request-1',
				rawToken: 'fresh-raw-token',
				setupPath: '/auth/setup-account?token=fresh-raw-token',
				expiresAt: new Date('2026-06-05T12:00:00.000Z'),
				link: { id: 'new-link-1' },
				revokedLinks: [{ id: 'old-link-1' }]
			})
		};
		const sendSetupEmail = vi.fn().mockResolvedValue(undefined);
		await store.insertSetupEmailDelivery({
			accessRequestId: 'request-1',
			setupLinkId: 'old-link-1',
			recipient: 'soldier@example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});
		await store.markSetupEmailDeliveryFailed('outbox-1', AUTH_WORKFLOW_NOW, 'mail provider unavailable');

		await recoverAccountSetupEmailDelivery(store, setupLinks, sendSetupEmail, {
			outboxId: 'outbox-1',
			publicOrigin: 'https://evil.example',
			now: AUTH_WORKFLOW_NOW
		});

		expect(sendSetupEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				setupUrl: 'https://official.example/auth/setup-account?token=fresh-raw-token'
			})
		);
	});

	it('does not recover already sent Account Setup deliveries', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://app.example');
		const store = createAuthEmailOutboxStore();
		await store.insertSetupEmailDelivery({
			accessRequestId: 'request-1',
			setupLinkId: 'old-link-1',
			recipient: 'soldier@example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});
		await store.markSetupEmailDeliverySent('outbox-1', AUTH_WORKFLOW_NOW);

		const result = await recoverAccountSetupEmailDelivery(store, { createForAccessRequest: vi.fn() }, vi.fn(), {
			outboxId: 'outbox-1',
			publicOrigin: 'https://app.example',
			now: AUTH_WORKFLOW_NOW
		});

		expect(result).toEqual({ status: 'not-recoverable' });
	});
});
