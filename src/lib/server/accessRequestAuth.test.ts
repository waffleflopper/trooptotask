/* eslint-disable @typescript-eslint/no-explicit-any -- mock Supabase chains are intentionally partial */
import { describe, expect, it, vi } from 'vitest';
import {
	markApprovedAccessRequestCompleted,
	renewApprovedAccessRequestInvite,
	sendAccessRequestSetupEmail
} from './accessRequestAuth';

describe('sendAccessRequestSetupEmail', () => {
	it('sends a fresh invite when the user does not exist yet', async () => {
		const inviteUserByEmail = vi.fn().mockResolvedValue({ error: null });
		const resetPasswordForEmail = vi.fn();
		const adminClient = {
			auth: {
				admin: { inviteUserByEmail },
				resetPasswordForEmail
			}
		};

		const result = await sendAccessRequestSetupEmail(adminClient as any, 'Test@Example.com', 'http://localhost:5173');

		expect(result).toEqual({ deliveryMethod: 'invite' });
		expect(inviteUserByEmail).toHaveBeenCalledWith('test@example.com', {
			redirectTo: 'http://localhost:5173/auth/accept-invite'
		});
		expect(resetPasswordForEmail).not.toHaveBeenCalled();
	});

	it('falls back to recovery when Supabase reports the user already exists', async () => {
		const inviteUserByEmail = vi.fn().mockResolvedValue({
			error: { message: 'A user with this email address has already been registered' }
		});
		const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
		const adminClient = {
			auth: {
				admin: { inviteUserByEmail },
				resetPasswordForEmail
			}
		};

		const result = await sendAccessRequestSetupEmail(adminClient as any, 'Test@Example.com', 'http://localhost:5173');

		expect(result).toEqual({ deliveryMethod: 'recovery' });
		expect(resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
			redirectTo: 'http://localhost:5173/auth/reset-password'
		});
	});

	it('rethrows non-existing-user invite errors', async () => {
		const inviteUserByEmail = vi.fn().mockResolvedValue({
			error: { message: 'SMTP temporarily unavailable' }
		});
		const adminClient = {
			auth: {
				admin: { inviteUserByEmail },
				resetPasswordForEmail: vi.fn()
			}
		};

		await expect(
			sendAccessRequestSetupEmail(adminClient as any, 'test@example.com', 'http://localhost:5173')
		).rejects.toMatchObject({
			message: 'SMTP temporarily unavailable'
		});
	});
});

describe('markApprovedAccessRequestCompleted', () => {
	it('marks linked approved-request invite rows as used', async () => {
		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					not: vi.fn().mockReturnValue({
						range: vi.fn().mockResolvedValue({
							data: [{ invite_id: 'invite-1' }, { invite_id: 'invite-2' }, { invite_id: 'invite-2' }],
							error: null
						})
					})
				})
			})
		});

		const updateChain = {
			in: vi.fn().mockReturnValue({
				is: vi.fn().mockReturnValue({
					select: vi.fn().mockResolvedValue({
						data: [{ id: 'invite-1' }, { id: 'invite-2' }],
						error: null
					})
				})
			})
		};

		const update = vi.fn().mockReturnValue(updateChain);

		const adminClient = {
			from: vi.fn((table: string) => {
				if (table === 'access_requests') {
					return { select };
				}
				if (table === 'registration_invites') {
					return { update };
				}
				throw new Error(`Unexpected table ${table}`);
			})
		};

		const result = await markApprovedAccessRequestCompleted(adminClient as any, 'Test@Example.com', 'user-123');

		expect(result).toEqual({ updated: 2 });
		expect(update).toHaveBeenCalled();
		expect(update.mock.calls[0][0]).toMatchObject({
			used_by: 'user-123'
		});
		expect(updateChain.in).toHaveBeenCalledWith('id', ['invite-1', 'invite-2']);
	});

	it('returns zero when there are no linked approved-request invites', async () => {
		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					not: vi.fn().mockReturnValue({
						range: vi.fn().mockResolvedValue({
							data: [],
							error: null
						})
					})
				})
			})
		});

		const update = vi.fn();
		const adminClient = {
			from: vi.fn((table: string) => {
				if (table === 'access_requests') {
					return { select };
				}
				if (table === 'registration_invites') {
					return { update };
				}
				throw new Error(`Unexpected table ${table}`);
			})
		};

		const result = await markApprovedAccessRequestCompleted(adminClient as any, 'test@example.com', 'user-123');

		expect(result).toEqual({ updated: 0 });
		expect(update).not.toHaveBeenCalled();
	});
});

describe('renewApprovedAccessRequestInvite', () => {
	it('resends setup email for approved requests that are still incomplete', async () => {
		const inviteUserByEmail = vi.fn().mockResolvedValue({ error: null });
		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					range: vi.fn().mockResolvedValue({
						data: [{ id: 'request-1', registration_invites: { used_at: null } }],
						error: null
					})
				})
			})
		});

		const adminClient = {
			auth: {
				admin: { inviteUserByEmail },
				resetPasswordForEmail: vi.fn()
			},
			from: vi.fn(() => ({ select }))
		};

		const result = await renewApprovedAccessRequestInvite(
			adminClient as any,
			'Test@Example.com',
			'http://localhost:5173'
		);

		expect(result).toEqual({ attempted: true, deliveryMethod: 'invite' });
		expect(inviteUserByEmail).toHaveBeenCalledWith('test@example.com', {
			redirectTo: 'http://localhost:5173/auth/accept-invite'
		});
	});

	it('does not resend when there is no approved request for the email', async () => {
		const inviteUserByEmail = vi.fn();
		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					range: vi.fn().mockResolvedValue({
						data: [],
						error: null
					})
				})
			})
		});

		const adminClient = {
			auth: {
				admin: { inviteUserByEmail },
				resetPasswordForEmail: vi.fn()
			},
			from: vi.fn(() => ({ select }))
		};

		const result = await renewApprovedAccessRequestInvite(
			adminClient as any,
			'test@example.com',
			'http://localhost:5173'
		);

		expect(result).toEqual({ attempted: false });
		expect(inviteUserByEmail).not.toHaveBeenCalled();
	});

	it('does not resend when account setup was already completed', async () => {
		const inviteUserByEmail = vi.fn();
		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					range: vi.fn().mockResolvedValue({
						data: [{ id: 'request-1', registration_invites: { used_at: '2026-04-02T00:00:00.000Z' } }],
						error: null
					})
				})
			})
		});

		const adminClient = {
			auth: {
				admin: { inviteUserByEmail },
				resetPasswordForEmail: vi.fn()
			},
			from: vi.fn(() => ({ select }))
		};

		const result = await renewApprovedAccessRequestInvite(
			adminClient as any,
			'test@example.com',
			'http://localhost:5173'
		);

		expect(result).toEqual({ attempted: false });
		expect(inviteUserByEmail).not.toHaveBeenCalled();
	});
});
