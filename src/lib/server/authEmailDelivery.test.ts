import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { getAdminClientMock } = vi.hoisted(() => ({ getAdminClientMock: vi.fn() }));
vi.mock('./supabase', () => ({ getAdminClient: getAdminClientMock }));

import { sendAuthEmail, sendPlatformAuthEmail, sendPublicRecoveryEmail } from './authEmailDelivery';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONFIRM_ORIGIN = 'https://trooptotask.org/auth/confirm';

function makeClient(type: 'invite' | 'recovery', error: unknown = null) {
	const generateLink = vi.fn().mockResolvedValue({
		data: error
			? null
			: {
					user: { id: USER_ID, email: 'soldier@example.mil' },
					properties: {
						hashed_token: 'synthetic-token-hash',
						verification_type: type,
						action_link: 'https://provider.example/auth/v1/verify?token=do-not-send'
					}
				},
		error
	});
	return { auth: { admin: { generateLink } } };
}

function input(type: 'invite' | 'recovery', supabase = makeClient(type)) {
	return {
		supabase: supabase as unknown as SupabaseClient,
		type,
		email: 'soldier@example.mil',
		redirectTo: `${CONFIRM_ORIGIN}?type=${type}&next=${type === 'invite' ? '%2Fauth%2Faccept-invite' : '%2Fauth%2Freset-password'}`,
		expectedUserId: USER_ID
	};
}

describe('sendAuthEmail', () => {
	beforeEach(() => {
		vi.stubEnv('RESEND_API_KEY', 'synthetic-resend-key');
		vi.stubEnv('RESEND_FROM_EMAIL', 'TroopToTask <noreply@example.test>');
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		getAdminClientMock.mockReset();
	});

	it('uses the server-only admin client for narrow public and platform operations', async () => {
		const recoveryClient = makeClient('recovery');
		const inviteClient = makeClient('invite');
		getAdminClientMock.mockReturnValueOnce(recoveryClient).mockReturnValueOnce(inviteClient);
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal('fetch', fetchImpl);
		const recoveryRedirect = `${CONFIRM_ORIGIN}?type=recovery&next=%2Fauth%2Freset-password`;
		const inviteRedirect = `${CONFIRM_ORIGIN}?type=invite&next=%2Fauth%2Faccept-invite`;
		await expect(sendPublicRecoveryEmail('soldier@example.mil', recoveryRedirect)).resolves.toBe('sent');
		await expect(
			sendPlatformAuthEmail({
				type: 'invite',
				userId: USER_ID,
				email: 'soldier@example.mil',
				redirectTo: inviteRedirect
			})
		).resolves.toBe('sent');
		expect(recoveryClient.auth.admin.generateLink).toHaveBeenCalledWith({
			type: 'recovery',
			email: 'soldier@example.mil',
			options: { redirectTo: recoveryRedirect }
		});
		expect(inviteClient.auth.admin.generateLink).toHaveBeenCalledWith({
			type: 'invite',
			email: 'soldier@example.mil',
			options: { redirectTo: inviteRedirect }
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it.each(['recovery', 'invite'] as const)('sends a %s app confirmation link through Resend', async (type) => {
		const client = makeClient(type);
		const authInput = input(type, client);
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		await expect(sendAuthEmail(authInput, fetchImpl)).resolves.toBe('sent');
		expect(client.auth.admin.generateLink).toHaveBeenCalledWith({
			type,
			email: 'soldier@example.mil',
			options: { redirectTo: authInput.redirectTo }
		});
		const [endpoint, request] = fetchImpl.mock.calls[0];
		expect(endpoint).toBe('https://api.resend.com/emails');
		expect(request.headers.Authorization).toBe('Bearer synthetic-resend-key');
		const message = JSON.parse(request.body);
		expect(message.from).toBe('TroopToTask <noreply@example.test>');
		expect(message.to).toEqual(['soldier@example.mil']);
		const link = new URL(message.text.match(/https:\/\/\S+/)?.[0]);
		expect(link.origin).toBe('https://trooptotask.org');
		expect(link.pathname).toBe('/auth/confirm');
		expect(link.searchParams.get('type')).toBe(type);
		expect(link.searchParams.get('token_hash')).toBe('synthetic-token-hash');
		expect(message.html).toContain('token_hash=synthetic-token-hash');
		expect(request.body).not.toContain('provider.example');
	});

	it('keeps unknown recovery accounts indistinguishable to the public form without sending mail', async () => {
		const fetchImpl = vi.fn();
		await expect(
			sendAuthEmail(input('recovery', makeClient('recovery', { code: 'user_not_found', status: 404 })), fetchImpl)
		).resolves.toBe('user_not_found');
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('refuses provider links for another user or verification type', async () => {
		const fetchImpl = vi.fn();
		const client = makeClient('invite');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(sendAuthEmail(input('recovery', client), fetchImpl)).resolves.toBe('failed');
		await expect(
			sendAuthEmail({ ...input('invite', client), expectedUserId: '22222222-2222-4222-8222-222222222222' }, fetchImpl)
		).resolves.toBe('failed');
		expect(fetchImpl).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it('does not generate a new token if Resend is unconfigured', async () => {
		vi.stubEnv('RESEND_API_KEY', '');
		const client = makeClient('recovery');
		const authInput = input('recovery', client);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(sendAuthEmail(authInput, vi.fn())).resolves.toBe('failed');
		expect(client.auth.admin.generateLink).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it('reports Resend rejection without logging the token or response body', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			sendAuthEmail(
				input('recovery'),
				vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'synthetic-token-hash' })
			)
		).resolves.toBe('failed');
		expect(JSON.stringify(consoleError.mock.calls)).not.toContain('synthetic-token-hash');
		consoleError.mockRestore();
	});

	it('contains unexpected provider failures without exposing their details', async () => {
		const client = makeClient('recovery');
		client.auth.admin.generateLink.mockRejectedValueOnce(new Error('private provider internals'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(sendAuthEmail(input('recovery', client), vi.fn())).resolves.toBe('failed');
		expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private provider internals');
		consoleError.mockRestore();
	});
});
