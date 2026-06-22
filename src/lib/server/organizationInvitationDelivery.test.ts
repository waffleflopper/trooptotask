import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ORGANIZATION_INVITATION_EMAIL_MAX_ATTEMPTS,
	makeOrganizationInvitationUrl,
	retryOrganizationInvitationOutboxDelivery,
	sendOrganizationInvitationEmail,
	sendOrganizationInvitationOutboxDelivery
} from './organizationInvitationDelivery';
import {
	AUTH_WORKFLOW_NOW,
	createOrganizationInvitationEmailOutboxStore,
	organizationInvitationFixture
} from '$lib/test-support/authWorkflowFixtures';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => false)
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

describe('organization invitation delivery', () => {
	beforeEach(() => {
		billingEnabledMock.mockReturnValue(false);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('records sent delivery without storing the sign-in destination URL', async () => {
		const store = createOrganizationInvitationEmailOutboxStore();
		const sendEmail = vi.fn().mockResolvedValue(undefined);

		const result = await sendOrganizationInvitationOutboxDelivery(store, sendEmail, {
			organizationId: 'org-1',
			invitationId: 'invite-1',
			email: 'Invitee@Example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			inviteUrl: 'https://trooptotask.test/auth/login?next=%2Fdashboard',
			requiresAccountSetup: false,
			now: AUTH_WORKFLOW_NOW
		});

		expect(result.status).toBe('sent');
		expect(sendEmail).toHaveBeenCalledWith({
			email: 'invitee@example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			inviteUrl: 'https://trooptotask.test/auth/login?next=%2Fdashboard',
			requiresAccountSetup: false
		});
		expect(store.records).toEqual([
			expect.objectContaining({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				recipient: 'invitee@example.mil',
				status: 'sent',
				attemptCount: 1
			})
		]);
		expect(JSON.stringify(store.records)).not.toContain('/auth/login');
	});

	it('records failed delivery as retryable history without deleting the invitation', async () => {
		const store = createOrganizationInvitationEmailOutboxStore();
		const sendEmail = vi.fn().mockRejectedValue(new Error('mail provider unavailable'));

		const result = await sendOrganizationInvitationOutboxDelivery(store, sendEmail, {
			organizationId: 'org-1',
			invitationId: 'invite-1',
			email: 'invitee@example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: null,
			inviteUrl: 'https://trooptotask.test/auth/login?next=%2Fdashboard',
			requiresAccountSetup: false,
			now: AUTH_WORKFLOW_NOW
		});

		expect(result).toMatchObject({
			status: 'failed',
			error: 'mail provider unavailable',
			outbox: expect.objectContaining({
				invitationId: 'invite-1',
				status: 'failed',
				lastError: 'mail provider unavailable'
			})
		});
	});

	it('builds a login destination for existing users to view dashboard invitations', () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');

		expect(makeOrganizationInvitationUrl('https://trooptotask.test')).toBe(
			'https://trooptotask.test/auth/login?next=%2Fdashboard'
		);
	});

	it('builds a request-access destination for billing-disabled invitees who still need account setup', () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');

		expect(makeOrganizationInvitationUrl('https://trooptotask.test', { requiresAccountSetup: true })).toBe(
			'https://trooptotask.test/auth/request-access'
		);
	});

	it('builds a self-service signup destination for billing-enabled invitees who still need account setup', () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');

		expect(
			makeOrganizationInvitationUrl('https://trooptotask.test', {
				requiresAccountSetup: true,
				selfServiceSignupEnabled: true
			})
		).toBe('https://trooptotask.test/auth/sign-up?next=%2Fdashboard');
	});

	it('sends email through the configured provider with sign-in acceptance copy', async () => {
		vi.stubEnv('RESEND_API_KEY', 'resend-key');
		vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@trooptotask.test');
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202, text: async () => '' });

		await sendOrganizationInvitationEmail(
			{
				email: 'invitee@example.mil',
				organizationName: 'Alpha Company',
				invitedByEmail: 'admin@example.mil',
				inviteUrl: 'https://trooptotask.test/auth/login?next=%2Fdashboard',
				requiresAccountSetup: false
			},
			fetchImpl
		);

		expect(fetchImpl).toHaveBeenCalledWith(
			'https://api.resend.com/emails',
			expect.objectContaining({
				method: 'POST',
				body: expect.stringContaining('Sign in to view and accept')
			})
		);
		expect(fetchImpl.mock.calls[0][1].body).toContain('Membership is created only after you sign in and accept');
	});

	it('sends reviewed-access setup guidance for billing-disabled invitees without a User Account', async () => {
		vi.stubEnv('RESEND_API_KEY', 'resend-key');
		vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@trooptotask.test');
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202, text: async () => '' });

		await sendOrganizationInvitationEmail(
			{
				email: 'invitee@example.mil',
				organizationName: 'Alpha Company',
				invitedByEmail: 'admin@example.mil',
				inviteUrl: 'https://trooptotask.test/auth/request-access',
				requiresAccountSetup: true
			},
			fetchImpl
		);

		const body = fetchImpl.mock.calls[0][1].body as string;
		expect(body).toContain('submitted a platform access request for this email on your behalf');
		expect(body).toContain('You do not need to submit another access request');
		expect(body).toContain('Account Setup Link email');
		expect(body).not.toContain('Sign in to view and accept');
	});

	it('sends self-service signup guidance for billing-enabled invitees without a User Account', async () => {
		vi.stubEnv('RESEND_API_KEY', 'resend-key');
		vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@trooptotask.test');
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202, text: async () => '' });

		await sendOrganizationInvitationEmail(
			{
				email: 'invitee@example.mil',
				organizationName: 'Alpha Company',
				invitedByEmail: 'admin@example.mil',
				inviteUrl: 'https://trooptotask.test/auth/sign-up?next=%2Fdashboard',
				requiresAccountSetup: true,
				selfServiceSignupEnabled: true
			},
			fetchImpl
		);

		const body = fetchImpl.mock.calls[0][1].body as string;
		expect(body).toContain('Create your TroopToTask account');
		expect(body).toContain('confirm your email first');
		expect(body).toContain('open your dashboard to accept this organization invitation');
		expect(body).not.toContain('submitted a platform access request');
		expect(body).not.toContain('Account Setup Link email');
	});

	it('rejects non-local HTTP invitation URLs before sending mail', async () => {
		vi.stubEnv('RESEND_API_KEY', 'resend-key');
		vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@trooptotask.test');

		await expect(
			sendOrganizationInvitationEmail(
				{
					email: 'invitee@example.mil',
					organizationName: 'Alpha Company',
					invitedByEmail: null,
					inviteUrl: 'http://trooptotask.test/auth/login?next=%2Fdashboard',
					requiresAccountSetup: false
				},
				vi.fn()
			)
		).rejects.toThrow('Organization invitation email URL must use HTTPS outside local development');
	});

	it('retries a pending unexpired organization invitation delivery on the existing outbox row', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = createOrganizationInvitationEmailOutboxStore();
		const sendEmail = vi.fn().mockResolvedValue(undefined);
		await store.insertInvitationEmailDelivery({
			organizationId: 'org-1',
			invitationId: 'invite-1',
			recipient: 'Invitee@Example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});

		const result = await retryOrganizationInvitationOutboxDelivery(store, sendEmail, {
			outboxId: 'outbox-1',
			origin: 'https://trooptotask.test',
			invitation: organizationInvitationFixture({
				id: 'invite-1',
				organizationId: 'org-1',
				email: 'invitee@example.mil',
				status: 'pending',
				expiresAt: new Date('2026-06-01T12:00:00.000Z')
			}),
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			now: AUTH_WORKFLOW_NOW
		});

		expect(result.status).toBe('sent');
		expect(store.records).toHaveLength(1);
		expect(store.records[0]).toMatchObject({ id: 'outbox-1', status: 'sent', attemptCount: 1, lastError: null });
		expect(sendEmail).toHaveBeenCalledWith({
			email: 'invitee@example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			inviteUrl: 'https://trooptotask.test/auth/login?next=%2Fdashboard',
			requiresAccountSetup: false
		});
	});

	it('retries billing-enabled non-user invitations without Access Request links to self-service signup', async () => {
		billingEnabledMock.mockReturnValue(true);
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = createOrganizationInvitationEmailOutboxStore();
		const sendEmail = vi.fn().mockResolvedValue(undefined);
		await store.insertInvitationEmailDelivery({
			organizationId: 'org-1',
			invitationId: 'invite-1',
			recipient: 'invitee@example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});

		const result = await retryOrganizationInvitationOutboxDelivery(store, sendEmail, {
			outboxId: 'outbox-1',
			origin: 'https://trooptotask.test',
			invitation: organizationInvitationFixture({
				id: 'invite-1',
				organizationId: 'org-1',
				email: 'invitee@example.mil',
				status: 'pending',
				requiresAccountSetup: false,
				recipientHasUserAccount: false,
				expiresAt: new Date('2026-06-01T12:00:00.000Z')
			}),
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			now: AUTH_WORKFLOW_NOW
		});

		expect(result.status).toBe('sent');
		expect(sendEmail).toHaveBeenCalledWith({
			email: 'invitee@example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			inviteUrl: 'https://trooptotask.test/auth/sign-up?next=%2Fdashboard',
			requiresAccountSetup: true,
			selfServiceSignupEnabled: true
		});
	});

	it('retries billing-enabled invitations for recipients who now have accounts to sign-in', async () => {
		billingEnabledMock.mockReturnValue(true);
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = createOrganizationInvitationEmailOutboxStore();
		const sendEmail = vi.fn().mockResolvedValue(undefined);
		await store.insertInvitationEmailDelivery({
			organizationId: 'org-1',
			invitationId: 'invite-1',
			recipient: 'invitee@example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});

		const result = await retryOrganizationInvitationOutboxDelivery(store, sendEmail, {
			outboxId: 'outbox-1',
			origin: 'https://trooptotask.test',
			invitation: organizationInvitationFixture({
				id: 'invite-1',
				organizationId: 'org-1',
				email: 'invitee@example.mil',
				status: 'pending',
				requiresAccountSetup: true,
				recipientHasUserAccount: true,
				expiresAt: new Date('2026-06-01T12:00:00.000Z')
			}),
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			now: AUTH_WORKFLOW_NOW
		});

		expect(result.status).toBe('sent');
		expect(sendEmail).toHaveBeenCalledWith({
			email: 'invitee@example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			inviteUrl: 'https://trooptotask.test/auth/login?next=%2Fdashboard',
			requiresAccountSetup: false
		});
	});

	it.each(['accepted', 'declined', 'revoked', 'blocked', 'expired'] as const)(
		'refuses to retry %s organization invitations',
		async (status) => {
			const store = createOrganizationInvitationEmailOutboxStore();
			await store.insertInvitationEmailDelivery({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				recipient: 'invitee@example.mil',
				createdAt: AUTH_WORKFLOW_NOW
			});

			const result = await retryOrganizationInvitationOutboxDelivery(store, vi.fn(), {
				outboxId: 'outbox-1',
				origin: 'https://trooptotask.test',
				invitation: organizationInvitationFixture({ status }),
				organizationName: 'Alpha Company',
				invitedByEmail: null,
				now: AUTH_WORKFLOW_NOW
			});

			expect(result).toEqual({ status: 'not-retryable' });
			expect(store.records[0].attemptCount).toBe(0);
		}
	);

	it('refuses to retry pending organization invitations after expiration', async () => {
		const store = createOrganizationInvitationEmailOutboxStore();
		await store.insertInvitationEmailDelivery({
			organizationId: 'org-1',
			invitationId: 'invite-1',
			recipient: 'invitee@example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});

		const result = await retryOrganizationInvitationOutboxDelivery(store, vi.fn(), {
			outboxId: 'outbox-1',
			origin: 'https://trooptotask.test',
			invitation: organizationInvitationFixture({
				status: 'pending',
				expiresAt: new Date('2026-05-01T12:00:00.000Z')
			}),
			organizationName: 'Alpha Company',
			invitedByEmail: null,
			now: AUTH_WORKFLOW_NOW
		});

		expect(result).toEqual({ status: 'expired' });
		expect(store.records[0].attemptCount).toBe(0);
	});

	it('increments organization invitation retry attempts and redacts retry URL failures', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = createOrganizationInvitationEmailOutboxStore();
		await store.insertInvitationEmailDelivery({
			organizationId: 'org-1',
			invitationId: 'invite-1',
			recipient: 'invitee@example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});
		await store.markInvitationEmailDeliveryFailed('outbox-1', AUTH_WORKFLOW_NOW, 'first failure');
		const sendEmail = vi
			.fn()
			.mockRejectedValue(new Error('provider rejected https://trooptotask.test/auth/login?next=%2Fdashboard'));

		const result = await retryOrganizationInvitationOutboxDelivery(store, sendEmail, {
			outboxId: 'outbox-1',
			origin: 'https://trooptotask.test',
			invitation: organizationInvitationFixture(),
			organizationName: 'Alpha Company',
			invitedByEmail: null,
			now: AUTH_WORKFLOW_NOW
		});

		expect(result).toMatchObject({
			status: 'failed',
			error: 'provider rejected [redacted invitation url]'
		});
		expect(store.records[0]).toMatchObject({
			status: 'failed',
			attemptCount: 2,
			lastError: 'provider rejected [redacted invitation url]'
		});
	});

	it('caps organization invitation retry attempts before sending another email', async () => {
		const store = createOrganizationInvitationEmailOutboxStore();
		await store.insertInvitationEmailDelivery({
			organizationId: 'org-1',
			invitationId: 'invite-1',
			recipient: 'invitee@example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});
		store.records[0].status = 'failed';
		store.records[0].attemptCount = ORGANIZATION_INVITATION_EMAIL_MAX_ATTEMPTS;
		const sendEmail = vi.fn();

		const result = await retryOrganizationInvitationOutboxDelivery(store, sendEmail, {
			outboxId: 'outbox-1',
			origin: 'https://trooptotask.test',
			invitation: organizationInvitationFixture(),
			organizationName: 'Alpha Company',
			invitedByEmail: null,
			now: AUTH_WORKFLOW_NOW
		});

		expect(result).toEqual({ status: 'max-attempts' });
		expect(sendEmail).not.toHaveBeenCalled();
		expect(store.records[0].attemptCount).toBe(ORGANIZATION_INVITATION_EMAIL_MAX_ATTEMPTS);
	});
});
