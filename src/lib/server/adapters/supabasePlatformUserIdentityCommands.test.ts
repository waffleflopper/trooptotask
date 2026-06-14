import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformUserIdentityCommandStore } from './supabasePlatformUserIdentityCommands';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROVIDER_ERROR = { message: 'raw provider outage', code: 'provider_secret_code' };

describe('createSupabasePlatformUserIdentityCommandStore', () => {
	it('maps auth user email lookup success, missing users, missing email, and provider errors', async () => {
		const getUserById = vi
			.fn()
			.mockResolvedValueOnce({
				data: { user: { id: USER_ID, email: 'soldier@example.mil' } },
				error: null
			})
			.mockResolvedValueOnce({ data: { user: null }, error: null })
			.mockResolvedValueOnce({ data: { user: { id: USER_ID, email: null } }, error: null })
			.mockResolvedValueOnce({ data: null, error: { status: 404, message: 'User not found' } })
			.mockResolvedValueOnce({ data: null, error: PROVIDER_ERROR });
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = createSupabasePlatformUserIdentityCommandStore({
			auth: { admin: { getUserById } }
		} as never);

		await expect(store.getUserEmailById(USER_ID)).resolves.toEqual({
			status: 'found',
			email: 'soldier@example.mil'
		});
		await expect(store.getUserEmailById(USER_ID)).resolves.toEqual({ status: 'not_found' });
		await expect(store.getUserEmailById(USER_ID)).resolves.toEqual({ status: 'not_found' });
		await expect(store.getUserEmailById(USER_ID)).resolves.toEqual({ status: 'not_found' });
		const providerErrorResult = await store.getUserEmailById(USER_ID);
		expect(providerErrorResult).toEqual({
			status: 'provider_error',
			message: 'Failed to load user identity'
		});
		expect(JSON.stringify(providerErrorResult)).not.toContain('provider_secret_code');
		expect(consoleError).toHaveBeenCalledWith('[admin/users] auth.admin.getUserById error:', PROVIDER_ERROR);

		consoleError.mockRestore();
	});

	it('sends password reset email through Supabase Auth with the supplied redirect', async () => {
		const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
		const store = createSupabasePlatformUserIdentityCommandStore({
			auth: { resetPasswordForEmail, admin: { getUserById: vi.fn() } }
		} as never);

		await expect(
			store.sendPasswordResetEmail({
				email: 'soldier@example.mil',
				redirectTo: 'https://trooptotask.org/auth/confirm?type=recovery'
			})
		).resolves.toEqual({ ok: true });

		expect(resetPasswordForEmail).toHaveBeenCalledWith('soldier@example.mil', {
			redirectTo: 'https://trooptotask.org/auth/confirm?type=recovery'
		});
	});

	it('sends invite email through Supabase Auth admin with the supplied redirect', async () => {
		const inviteUserByEmail = vi.fn().mockResolvedValue({ error: null });
		const store = createSupabasePlatformUserIdentityCommandStore({
			auth: { admin: { getUserById: vi.fn(), inviteUserByEmail } }
		} as never);

		await expect(
			store.sendInviteEmail({
				email: 'soldier@example.mil',
				redirectTo: 'https://trooptotask.org/auth/confirm?type=invite'
			})
		).resolves.toEqual({ ok: true });

		expect(inviteUserByEmail).toHaveBeenCalledWith('soldier@example.mil', {
			redirectTo: 'https://trooptotask.org/auth/confirm?type=invite'
		});
	});

	it('maps provider send errors without returning raw provider details', async () => {
		const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: PROVIDER_ERROR });
		const inviteUserByEmail = vi.fn().mockResolvedValue({ error: PROVIDER_ERROR });
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = createSupabasePlatformUserIdentityCommandStore({
			auth: {
				resetPasswordForEmail,
				admin: { getUserById: vi.fn(), inviteUserByEmail }
			}
		} as never);

		const resetResult = await store.sendPasswordResetEmail({
			email: 'soldier@example.mil',
			redirectTo: 'https://trooptotask.org/auth/confirm?type=recovery'
		});
		const inviteResult = await store.sendInviteEmail({
			email: 'soldier@example.mil',
			redirectTo: 'https://trooptotask.org/auth/confirm?type=invite'
		});

		expect(resetResult).toEqual({ ok: false, message: 'Failed to send password reset email' });
		expect(inviteResult).toEqual({ ok: false, message: 'Failed to send invite email' });
		expect(JSON.stringify([resetResult, inviteResult])).not.toContain('provider_secret_code');
		expect(consoleError).toHaveBeenCalledWith('[admin/users] auth.resetPasswordForEmail error:', PROVIDER_ERROR);
		expect(consoleError).toHaveBeenCalledWith('[admin/users] auth.admin.inviteUserByEmail error:', PROVIDER_ERROR);

		consoleError.mockRestore();
	});
});
