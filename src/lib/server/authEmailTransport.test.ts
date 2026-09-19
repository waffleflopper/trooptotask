import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendAccountSetupLinkEmail } from './accountSetupLinks';
import { sendOrganizationInvitationEmail } from './organizationInvitationDelivery';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const recipient = 'invitee@example.test';
const deliveries = [
	{
		purpose: 'account setup',
		send: (fetchImpl: typeof fetch) =>
			sendAccountSetupLinkEmail(
				{
					email: recipient,
					setupUrl: 'https://app.example.test/auth/setup-account?token=synthetic-token',
					expiresAt: new Date('2026-10-01T12:00:00Z')
				},
				fetchImpl
			)
	},
	{
		purpose: 'organization invitation',
		send: (fetchImpl: typeof fetch) =>
			sendOrganizationInvitationEmail(
				{
					email: recipient,
					organizationName: 'Synthetic Organization',
					invitedByEmail: null,
					inviteUrl: 'https://app.example.test/auth/login?next=%2Fdashboard',
					requiresAccountSetup: false
				},
				fetchImpl
			)
	}
];

describe.each(deliveries)('$purpose email transport', ({ send }) => {
	beforeEach(() => {
		vi.stubEnv('RESEND_API_KEY', 'synthetic-provider-key');
		vi.stubEnv('RESEND_FROM_EMAIL', 'sender@example.test');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('delivers to the configured provider with the intended sender and recipient', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
		await send(fetchImpl);
		expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
			'https://api.resend.com/emails',
			expect.objectContaining({
				method: 'POST',
				headers: {
					Authorization: 'Bearer synthetic-provider-key',
					'Content-Type': 'application/json'
				}
			})
		);
		expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toMatchObject({
			from: 'sender@example.test',
			to: [recipient],
			subject: expect.any(String),
			text: expect.any(String),
			html: expect.any(String)
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each(['RESEND_API_KEY', 'RESEND_FROM_EMAIL'])('fails closed without %s', async (setting) => {
		vi.stubEnv(setting, '');
		const fetchImpl = vi.fn<typeof fetch>();
		await expect(send(fetchImpl)).rejects.toThrow('email delivery is not configured');
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('reports provider rejection instead of treating the message as delivered', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('unavailable', { status: 503 }));
		await expect(send(fetchImpl)).rejects.toThrow('email delivery failed with status 503: unavailable');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('propagates transport failure to the outbox caller', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('connection refused'));
		await expect(send(fetchImpl)).rejects.toThrow('connection refused');
		expect(fetch).not.toHaveBeenCalled();
	});
});
