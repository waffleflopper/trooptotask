import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event),
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

import { actions } from './+page.server';

describe('admin user auth email actions', () => {
	const getUserById = vi.fn();
	const inviteUserByEmail = vi.fn();
	const resetPasswordForEmail = vi.fn();
	const audit = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		getUserById.mockResolvedValue({
			data: {
				user: {
					email: 'soldier@example.mil'
				}
			},
			error: null
		});
		inviteUserByEmail.mockResolvedValue({ error: null });
		resetPasswordForEmail.mockResolvedValue({ error: null });
	});

	it('resendInvite uses the app-owned invite confirmation redirect', async () => {
		const result = await actions.resendInvite({
			__ctx: {
				adminClient: {
					auth: {
						admin: {
							getUserById,
							inviteUserByEmail
						}
					}
				},
				audit
			},
			params: { userId: 'user-1' },
			url: new URL('http://localhost:4173/admin/users/user-1')
		} as unknown as Parameters<(typeof actions)['resendInvite']>[0]);

		expect(result).toEqual({ success: true, message: 'Invite email resent' });
		expect(inviteUserByEmail).toHaveBeenCalledWith('soldier@example.mil', {
			redirectTo: 'http://localhost:4173/auth/confirm?type=invite&next=%2Fauth%2Faccept-invite'
		});
	});

	it('resetPassword uses the app-owned recovery confirmation redirect', async () => {
		const result = await actions.resetPassword({
			__ctx: {
				adminClient: {
					auth: {
						admin: {
							getUserById
						},
						resetPasswordForEmail
					}
				},
				audit
			},
			params: { userId: 'user-1' },
			url: new URL('http://localhost:4173/admin/users/user-1')
		} as unknown as Parameters<(typeof actions)['resetPassword']>[0]);

		expect(result).toEqual({ success: true, message: 'Password reset email sent' });
		expect(resetPasswordForEmail).toHaveBeenCalledWith('soldier@example.mil', {
			redirectTo: 'http://localhost:4173/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
		});
	});
});
