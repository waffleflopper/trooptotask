import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createPlatformUserIdentityCommands,
	type PlatformUserIdentityCommandStore
} from './platformUserIdentityCommands';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeCommands(options: Partial<PlatformUserIdentityCommandStore> = {}) {
	const audit = vi.fn();
	const store: PlatformUserIdentityCommandStore = {
		getUserEmailById: vi.fn().mockResolvedValue({ status: 'found', email: 'soldier@example.mil' }),
		sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true }),
		sendInviteEmail: vi.fn().mockResolvedValue({ ok: true }),
		...options
	};

	return {
		audit,
		store,
		commands: createPlatformUserIdentityCommands({
			store,
			audit: { log: audit }
		})
	};
}

describe('PlatformUserIdentityCommands', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
	});

	it('sends password reset with the app-owned recovery redirect and audits after the provider send succeeds', async () => {
		const audit = vi.fn();
		const sendPasswordResetEmail = vi.fn(async () => {
			expect(audit).not.toHaveBeenCalled();
			return { ok: true } as const;
		});
		const store: PlatformUserIdentityCommandStore = {
			getUserEmailById: vi.fn().mockResolvedValue({ status: 'found', email: 'soldier@example.mil' }),
			sendPasswordResetEmail,
			sendInviteEmail: vi.fn().mockResolvedValue({ ok: true })
		};
		const commands = createPlatformUserIdentityCommands({ store, audit: { log: audit } });

		const result = await commands.sendPasswordReset({
			userId: USER_ID,
			inboundOrigin: 'http://localhost:4173'
		});

		expect(result).toEqual({
			status: 'sent',
			email: 'soldier@example.mil',
			message: 'Password reset email sent'
		});
		expect(store.sendPasswordResetEmail).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			redirectTo: 'http://localhost:4173/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
		});
		expect(audit).toHaveBeenCalledWith({
			action: 'admin.user.password_reset',
			resourceType: 'user',
			resourceId: USER_ID,
			details: { targetEmail: 'soldier@example.mil' },
			severity: 'warning'
		});
	});

	it('sends invite with the app-owned invite confirmation redirect', async () => {
		const { audit, commands, store } = makeCommands();

		const result = await commands.resendInvite({
			userId: USER_ID,
			inboundOrigin: 'http://localhost:4173'
		});

		expect(result).toEqual({
			status: 'sent',
			email: 'soldier@example.mil',
			message: 'Invite email resent'
		});
		expect(store.sendInviteEmail).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			redirectTo: 'http://localhost:4173/auth/confirm?type=invite&next=%2Fauth%2Faccept-invite'
		});
		expect(audit).toHaveBeenCalledWith({
			action: 'admin.user.resend_invite',
			resourceType: 'user',
			resourceId: USER_ID,
			details: { targetEmail: 'soldier@example.mil' },
			severity: 'info'
		});
	});

	it('honors APP_PUBLIC_ORIGIN when deriving provider redirects', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		const { commands, store } = makeCommands();

		await commands.resendInvite({
			userId: USER_ID,
			inboundOrigin: 'https://admin.trooptotask.org'
		});

		expect(store.sendInviteEmail).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			redirectTo: 'https://trooptotask.org/auth/confirm?type=invite&next=%2Fauth%2Faccept-invite'
		});
	});

	it('returns not-found without sending provider email or auditing when the user email is missing', async () => {
		const { audit, commands, store } = makeCommands({
			getUserEmailById: vi.fn().mockResolvedValue({ status: 'not_found' })
		});

		await expect(
			commands.sendPasswordReset({
				userId: USER_ID,
				inboundOrigin: 'http://localhost:4173'
			})
		).resolves.toEqual({ status: 'not_found' });

		expect(store.sendPasswordResetEmail).not.toHaveBeenCalled();
		expect(audit).not.toHaveBeenCalled();
	});

	it('does not audit provider send failures and returns a sanitized command result', async () => {
		const { audit, commands } = makeCommands({
			sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: false, message: 'raw provider timeout secret' })
		});

		await expect(
			commands.sendPasswordReset({
				userId: USER_ID,
				inboundOrigin: 'http://localhost:4173'
			})
		).resolves.toEqual({ status: 'provider_error', message: 'Failed to send password reset' });

		expect(JSON.stringify(audit.mock.calls)).not.toContain('soldier@example.mil');
		expect(audit).not.toHaveBeenCalled();
	});

	it('does not audit provider lookup failures and returns a sanitized command result', async () => {
		const { audit, commands, store } = makeCommands({
			getUserEmailById: vi.fn().mockResolvedValue({ status: 'provider_error', message: 'raw auth object' })
		});

		await expect(
			commands.resendInvite({
				userId: USER_ID,
				inboundOrigin: 'http://localhost:4173'
			})
		).resolves.toEqual({ status: 'provider_error', message: 'Failed to resend invite' });

		expect(store.sendInviteEmail).not.toHaveBeenCalled();
		expect(audit).not.toHaveBeenCalled();
	});
});
