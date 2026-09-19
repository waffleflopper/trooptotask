import { createAccessRequestSetupDeliveryService } from './accessRequestSetupDelivery';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ORGANIZATION_INVITATION_EMAIL_MAX_ATTEMPTS,
	makeOrganizationInvitationUrl,
	retryOrganizationInvitationOutboxDelivery,
	sendOrganizationInvitationEmail,
	sendOrganizationInvitationOutboxDelivery
} from './organizationInvitationDelivery';
import {
	AUTH_WORKFLOW_NOW,
	createAccessRequestSetupDeliveryStore,
	createOrganizationInvitationEmailOutboxStore,
	organizationInvitationFixture
} from '$lib/test-support/authWorkflowFixtures';

async function renderSetupInvitationEmail(): Promise<{ text: string; html: string }> {
	vi.stubEnv('RESEND_API_KEY', 'resend-key');
	vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@trooptotask.test');
	const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202, text: async () => '' });

	await sendOrganizationInvitationEmail(
		{
			email: 'invitee@example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: 'admin@example.mil',
			inviteUrl: 'https://trooptotask.test/auth/renew-invite?email=invitee%40example.mil',
			requiresAccountSetup: true
		},
		fetchImpl
	);

	return JSON.parse(fetchImpl.mock.calls[0][1].body as string) as { text: string; html: string };
}

describe('organization invitation delivery', () => {
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
			requiresAccountSetup: false,
			requiresAccessRequest: undefined
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

	it('builds a setup-link recovery destination for reviewed invitees who still need account setup', () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');

		expect(
			makeOrganizationInvitationUrl('https://trooptotask.test', {
				requiresAccountSetup: true,
				email: 'Invitee@Example.mil'
			})
		).toBe('https://trooptotask.test/auth/renew-invite?email=invitee%40example.mil');
	});

	it('refuses to build a setup-link recovery destination without the invitee email', () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');

		expect(() => makeOrganizationInvitationUrl('https://trooptotask.test', { requiresAccountSetup: true })).toThrow(
			'Organization invitation setup recovery URL requires the invitee email'
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

	it('points reviewed invitees without a User Account at the separate setup email', async () => {
		const body = await renderSetupInvitationEmail();

		expect(body.text).toContain('a separate email carries your account setup link');
		expect(body.html).toContain('a separate email carries your account setup link');
		expect(body.text).toContain('Sign in to accept this organization invitation from your dashboard');
		expect(body.html).toContain('Sign in to accept this organization invitation from your dashboard');
		expect(body.text).not.toContain('access request');
		expect(body.html).not.toContain('access request');
		expect(body.text).not.toContain('platform approval');
		expect(body.html).not.toContain('platform approval');
	});

	it('offers the setup-link recovery route as recovery rather than the next step', async () => {
		const body = await renderSetupInvitationEmail();

		expect(body.text).toContain(
			"Didn't get your setup link? https://trooptotask.test/auth/renew-invite?email=invitee%40example.mil"
		);
		expect(body.html).toContain(
			'<a href="https://trooptotask.test/auth/renew-invite?email=invitee%40example.mil">Didn\'t get your setup link?</a>'
		);
		expect(body.text).toContain('only if the setup email never arrived');
		expect(body.html).toContain('only if the setup email never arrived');
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
			requiresAccountSetup: false,
			requiresAccessRequest: false
		});
	});

	it('lets a legacy recipient submit a pending Access Request from the retry email without minting credentials', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.test');
		vi.stubEnv('RESEND_API_KEY', 'synthetic-capture-only');
		vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@example.test');
		const store = createOrganizationInvitationEmailOutboxStore();
		await store.insertInvitationEmailDelivery({
			organizationId: 'org-1',
			invitationId: 'invite-1',
			recipient: 'invitee@example.mil',
			createdAt: AUTH_WORKFLOW_NOW
		});
		const messages: { text: string; html: string }[] = [];
		const result = await retryOrganizationInvitationOutboxDelivery(
			store,
			async (input) => {
				await sendOrganizationInvitationEmail(input, async (_url, init) => {
					messages.push(JSON.parse(init.body as string));
					return { ok: true, status: 202, text: async () => '' };
				});
			},
			{
				outboxId: 'outbox-1',
				origin: 'https://trooptotask.test',
				invitation: organizationInvitationFixture({ requiresAccountSetup: false, recipientHasUserAccount: false }),
				organizationName: 'Alpha Company',
				invitedByEmail: null,
				now: AUTH_WORKFLOW_NOW
			}
		);
		expect(result.status).toBe('sent');
		const requestStore = createAccessRequestSetupDeliveryStore();
		const sendSetupEmail = vi.fn();
		const service = createAccessRequestSetupDeliveryService(requestStore, sendSetupEmail, {
			now: () => AUTH_WORKFLOW_NOW
		});
		const destination = new URL(messages[0].html.match(/href="([^"]+)"/)![1]);
		expect(destination.pathname).toBe('/auth/request-access');
		for (const body of [messages[0].text, messages[0].html]) {
			expect(body).toContain(destination.href);
			expect(body).toMatch(/request access/i);
			expect(body).toMatch(/approv/i);
			expect(body).not.toMatch(/a separate email carries your account setup link/i);
		}
		const submitted = await service.submitAccessRequest({
			email: 'invitee@example.mil',
			firstName: 'Synthetic',
			lastName: 'Invitee',
			reason: null,
			heardAbout: 'search_engine',
			heardAboutDetails: null,
			origin: destination.origin
		});
		expect(submitted.status).toBe('pending-created');
		expect(requestStore.insertedRequests).toEqual([expect.objectContaining({ email: 'invitee@example.mil' })]);
		expect(requestStore.setupLinks).toEqual([]);
		expect(sendSetupEmail).not.toHaveBeenCalled();
	});

	it('retries legacy invitations for recipients who now have accounts to sign-in', async () => {
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
			requiresAccountSetup: false,
			requiresAccessRequest: false
		});
	});

	it('keeps linked reviewed invitation retries on setup recovery until setup completes', async () => {
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
			inviteUrl: 'https://trooptotask.test/auth/renew-invite?email=invitee%40example.mil',
			requiresAccountSetup: true,
			requiresAccessRequest: false
		});
	});

	it('re-renders the same setup-recovery invitation URL on every resend', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = createOrganizationInvitationEmailOutboxStore();
		const sendEmail = vi.fn().mockResolvedValue(undefined);
		const invitation = organizationInvitationFixture({
			id: 'invite-1',
			organizationId: 'org-1',
			email: 'invitee@example.mil',
			status: 'pending',
			requiresAccountSetup: true,
			recipientHasUserAccount: false,
			expiresAt: new Date('2026-06-01T12:00:00.000Z')
		});

		for (const outboxId of ['outbox-1', 'outbox-2']) {
			await store.insertInvitationEmailDelivery({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				recipient: 'invitee@example.mil',
				createdAt: AUTH_WORKFLOW_NOW
			});
			await retryOrganizationInvitationOutboxDelivery(store, sendEmail, {
				outboxId,
				origin: 'https://trooptotask.test',
				invitation,
				organizationName: 'Alpha Company',
				invitedByEmail: 'admin@example.mil',
				now: AUTH_WORKFLOW_NOW
			});
		}

		expect(sendEmail.mock.calls.map(([input]) => input.inviteUrl)).toEqual([
			'https://trooptotask.test/auth/renew-invite?email=invitee%40example.mil',
			'https://trooptotask.test/auth/renew-invite?email=invitee%40example.mil'
		]);
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

	it('redacts setup-recovery invitation URLs out of stored delivery failures', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = createOrganizationInvitationEmailOutboxStore();
		const sendEmail = vi
			.fn()
			.mockRejectedValue(
				new Error('provider rejected https://trooptotask.test/auth/renew-invite?email=invitee%40example.mil')
			);

		const result = await sendOrganizationInvitationOutboxDelivery(store, sendEmail, {
			organizationId: 'org-1',
			invitationId: 'invite-1',
			email: 'invitee@example.mil',
			organizationName: 'Alpha Company',
			invitedByEmail: null,
			inviteUrl: 'https://trooptotask.test/auth/renew-invite?email=invitee%40example.mil',
			requiresAccountSetup: true,
			now: AUTH_WORKFLOW_NOW
		});

		expect(result).toMatchObject({
			status: 'failed',
			error: 'provider rejected [redacted invitation url]'
		});
		expect(JSON.stringify(store.records)).not.toContain('/auth/renew-invite');
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
