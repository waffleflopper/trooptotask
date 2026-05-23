import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	makeOrganizationInvitationUrl,
	sendOrganizationInvitationEmail,
	sendOrganizationInvitationOutboxDelivery,
	type OrganizationInvitationEmailOutboxRecord,
	type OrganizationInvitationEmailOutboxStore
} from './organizationInvitationDelivery';

const NOW = new Date('2026-05-22T12:00:00.000Z');

function makeStore() {
	const records: OrganizationInvitationEmailOutboxRecord[] = [];
	const store: OrganizationInvitationEmailOutboxStore & { records: OrganizationInvitationEmailOutboxRecord[] } = {
		records,
		async insertInvitationEmailDelivery(input) {
			const record: OrganizationInvitationEmailOutboxRecord = {
				id: `outbox-${records.length + 1}`,
				organizationId: input.organizationId,
				invitationId: input.invitationId,
				recipient: input.recipient,
				status: 'pending',
				attemptCount: 0,
				lastError: null,
				createdAt: input.createdAt,
				updatedAt: input.createdAt,
				sentAt: null
			};
			records.push(record);
			return record;
		},
		async markInvitationEmailDeliverySent(id, sentAt) {
			const record = records.find((item) => item.id === id);
			if (!record) throw new Error('missing outbox');
			record.status = 'sent';
			record.attemptCount = 1;
			record.lastError = null;
			record.updatedAt = sentAt;
			record.sentAt = sentAt;
			return record;
		},
		async markInvitationEmailDeliveryFailed(id, failedAt, lastError) {
			const record = records.find((item) => item.id === id);
			if (!record) throw new Error('missing outbox');
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

describe('organization invitation delivery', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('records sent delivery without storing the sign-in destination URL', async () => {
		const store = makeStore();
		const sendEmail = vi.fn().mockResolvedValue(undefined);

		const result = await sendOrganizationInvitationOutboxDelivery(store, sendEmail, {
			organizationId: 'org-1',
			invitationId: 'invite-1',
			email: 'Invitee@Example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			inviteUrl: 'https://trooptotask.test/auth/login?next=%2Fdashboard',
			requiresAccountSetup: false,
			now: NOW
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
		const store = makeStore();
		const sendEmail = vi.fn().mockRejectedValue(new Error('mail provider unavailable'));

		const result = await sendOrganizationInvitationOutboxDelivery(store, sendEmail, {
			organizationId: 'org-1',
			invitationId: 'invite-1',
			email: 'invitee@example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: null,
			inviteUrl: 'https://trooptotask.test/auth/login?next=%2Fdashboard',
			requiresAccountSetup: false,
			now: NOW
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

	it('builds a request-access destination for invitees who still need account setup', () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');

		expect(makeOrganizationInvitationUrl('https://trooptotask.test', { requiresAccountSetup: true })).toBe(
			'https://trooptotask.test/auth/request-access'
		);
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

	it('sends account setup guidance for invitees without a User Account', async () => {
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
		expect(body).toContain('account setup must be approved and completed');
		expect(body).toContain('Account Setup Link email');
		expect(body).not.toContain('Sign in to view and accept');
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
});
