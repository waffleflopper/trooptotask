import { beforeEach, describe, expect, it, vi } from 'vitest';

const { platformAuditMock, platformUserDirectoryMock, platformUserIdentityCommandsMock } = vi.hoisted(() => ({
	platformAuditMock: {
		listLogs: vi.fn(),
		listRecentByOrganization: vi.fn(),
		listRecentByUser: vi.fn()
	},
	platformUserDirectoryMock: {
		getUserDetail: vi.fn()
	},
	platformUserIdentityCommandsMock: {
		sendPasswordReset: vi.fn(),
		resendInvite: vi.fn()
	}
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event),
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformAudit', () => ({
	createSupabasePlatformAudit: () => platformAuditMock
}));

vi.mock('$lib/server/adapters/supabasePlatformUserDirectory', () => ({
	createSupabasePlatformUserDirectory: () => platformUserDirectoryMock
}));

vi.mock('$lib/server/adapters/supabasePlatformUserIdentityCommands', () => ({
	createSupabasePlatformUserIdentityCommands: () => platformUserIdentityCommandsMock
}));

import { actions, load } from './+page.server';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeUserDetailLoadClient() {
	return {
		auth: {
			admin: {
				getUserById: vi.fn(() => {
					throw new Error('route must use PlatformUserDirectory for user detail shaping');
				})
			}
		},
		from: vi.fn((table: string) => {
			if (table === 'audit_logs') throw new Error('route must use PlatformAudit for recent user activity');
			throw new Error(`route must not shape ${table} rows directly`);
		})
	};
}

function makeIdentityCommandActionClient() {
	return {
		get auth() {
			throw new Error('route must use PlatformUserIdentityCommands for identity email commands');
		},
		from: vi.fn((table: string) => {
			throw new Error(`route must not issue ${table} provider commands directly`);
		})
	};
}

describe('admin user auth email actions', () => {
	const audit = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();

		platformUserIdentityCommandsMock.sendPasswordReset.mockResolvedValue({
			status: 'sent',
			email: 'soldier@example.mil',
			message: 'Password reset email sent'
		});
		platformUserIdentityCommandsMock.resendInvite.mockResolvedValue({
			status: 'sent',
			email: 'soldier@example.mil',
			message: 'Invite email resent'
		});
		platformUserDirectoryMock.getUserDetail.mockResolvedValue({
			status: 'found',
			detail: {
				user: {
					id: USER_ID,
					email: 'soldier@example.mil',
					createdAt: '2026-06-01T00:00:00.000Z',
					lastSignInAt: '2026-06-08T00:00:00.000Z'
				},
				organizations: [
					{
						id: 'org-1',
						name: 'Able Company',
						role: 'owner',
						subscriptionTier: 'free',
						personnelCount: 5
					}
				],
				suspension: null,
				isSuspended: false
			}
		});
		platformAuditMock.listRecentByUser.mockResolvedValue([
			{
				id: 'audit-1',
				action: 'admin.user.resend_invite',
				resourceType: 'user',
				resourceId: USER_ID,
				orgId: 'org-1',
				timestamp: '2026-06-08T15:00:00.000Z',
				severity: 'warning'
			}
		]);
	});

	it('loads recent user activity through PlatformAudit', async () => {
		const result = await load({
			__ctx: {
				adminClient: makeUserDetailLoadClient(),
				adminUser: { id: 'admin-1', role: 'super_admin' },
				audit
			},
			params: { userId: USER_ID }
		} as unknown as Parameters<typeof load>[0]);

		expect(platformUserDirectoryMock.getUserDetail).toHaveBeenCalledWith(USER_ID);
		expect(platformAuditMock.listRecentByUser).toHaveBeenCalledWith({ userId: USER_ID, limit: 10 });
		expect(result).toMatchObject({
			user: {
				id: USER_ID,
				email: 'soldier@example.mil',
				createdAt: '2026-06-01T00:00:00.000Z',
				lastSignInAt: '2026-06-08T00:00:00.000Z'
			},
			organizations: [
				{
					id: 'org-1',
					name: 'Able Company',
					role: 'owner',
					subscriptionTier: 'free',
					personnelCount: 5
				}
			],
			suspension: null,
			isSuspended: false,
			recentActivity: [
				{
					id: 'audit-1',
					action: 'admin.user.resend_invite',
					resourceType: 'user',
					resourceId: USER_ID,
					orgId: 'org-1',
					timestamp: '2026-06-08T15:00:00.000Z',
					severity: 'warning'
				}
			]
		});
	});

	it('reports auth-provider user detail failures as server errors', async () => {
		platformUserDirectoryMock.getUserDetail.mockResolvedValueOnce({
			status: 'auth_error',
			message: 'identity provider unavailable'
		});

		await expect(
			load({
				__ctx: {
					adminClient: makeUserDetailLoadClient(),
					adminUser: { id: 'admin-1', role: 'super_admin' },
					audit
				},
				params: { userId: USER_ID }
			} as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 500 });
		expect(platformAuditMock.listRecentByUser).not.toHaveBeenCalled();
	});

	it('rejects malformed user IDs before reading user details', async () => {
		await expect(
			load({
				__ctx: {
					adminClient: makeUserDetailLoadClient(),
					adminUser: { id: 'admin-1', role: 'super_admin' },
					audit
				},
				params: { userId: 'not-a-uuid' }
			} as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 400 });

		expect(platformUserDirectoryMock.getUserDetail).not.toHaveBeenCalled();
		expect(platformAuditMock.listRecentByUser).not.toHaveBeenCalled();
	});

	it('resetPassword calls the identity command seam and preserves success mapping', async () => {
		const result = await actions.resetPassword({
			__ctx: {
				adminClient: makeIdentityCommandActionClient(),
				audit
			},
			params: { userId: USER_ID },
			url: new URL(`http://localhost:4173/admin/users/${USER_ID}`)
		} as unknown as Parameters<(typeof actions)['resetPassword']>[0]);

		expect(result).toEqual({ success: true, message: 'Password reset email sent' });
		expect(platformUserIdentityCommandsMock.sendPasswordReset).toHaveBeenCalledWith({
			userId: USER_ID,
			inboundOrigin: 'http://localhost:4173'
		});
	});

	it('resendInvite calls the identity command seam and preserves success mapping', async () => {
		const result = await actions.resendInvite({
			__ctx: {
				adminClient: makeIdentityCommandActionClient(),
				audit
			},
			params: { userId: USER_ID },
			url: new URL(`http://localhost:4173/admin/users/${USER_ID}`)
		} as unknown as Parameters<(typeof actions)['resendInvite']>[0]);

		expect(result).toEqual({ success: true, message: 'Invite email resent' });
		expect(platformUserIdentityCommandsMock.resendInvite).toHaveBeenCalledWith({
			userId: USER_ID,
			inboundOrigin: 'http://localhost:4173'
		});
	});

	it('rejects malformed user IDs before calling identity commands', async () => {
		const resetResult = await actions.resetPassword({
			__ctx: {
				adminClient: makeIdentityCommandActionClient(),
				audit
			},
			params: { userId: 'not-a-uuid' },
			url: new URL('http://localhost:4173/admin/users/not-a-uuid')
		} as unknown as Parameters<(typeof actions)['resetPassword']>[0]);
		const inviteResult = await actions.resendInvite({
			__ctx: {
				adminClient: makeIdentityCommandActionClient(),
				audit
			},
			params: { userId: 'not-a-uuid' },
			url: new URL('http://localhost:4173/admin/users/not-a-uuid')
		} as unknown as Parameters<(typeof actions)['resendInvite']>[0]);

		expect(resetResult).toEqual({ status: 400, data: { error: 'Invalid user ID' } });
		expect(inviteResult).toEqual({ status: 400, data: { error: 'Invalid user ID' } });
		expect(platformUserIdentityCommandsMock.sendPasswordReset).not.toHaveBeenCalled();
		expect(platformUserIdentityCommandsMock.resendInvite).not.toHaveBeenCalled();
	});

	it('maps identity command not-found results to the current 404 response', async () => {
		platformUserIdentityCommandsMock.sendPasswordReset.mockResolvedValueOnce({ status: 'not_found' });
		platformUserIdentityCommandsMock.resendInvite.mockResolvedValueOnce({ status: 'not_found' });

		const resetResult = await actions.resetPassword({
			__ctx: {
				adminClient: makeIdentityCommandActionClient(),
				audit
			},
			params: { userId: USER_ID },
			url: new URL(`http://localhost:4173/admin/users/${USER_ID}`)
		} as unknown as Parameters<(typeof actions)['resetPassword']>[0]);
		const inviteResult = await actions.resendInvite({
			__ctx: {
				adminClient: makeIdentityCommandActionClient(),
				audit
			},
			params: { userId: USER_ID },
			url: new URL(`http://localhost:4173/admin/users/${USER_ID}`)
		} as unknown as Parameters<(typeof actions)['resendInvite']>[0]);

		expect(resetResult).toEqual({ status: 404, data: { error: 'User not found' } });
		expect(inviteResult).toEqual({ status: 404, data: { error: 'User not found' } });
	});

	it('maps provider failures to the current password reset error response', async () => {
		platformUserIdentityCommandsMock.sendPasswordReset.mockResolvedValueOnce({
			status: 'provider_error',
			message: 'sanitized'
		});

		const result = await actions.resetPassword({
			__ctx: {
				adminClient: makeIdentityCommandActionClient(),
				audit
			},
			params: { userId: USER_ID },
			url: new URL(`http://localhost:4173/admin/users/${USER_ID}`)
		} as unknown as Parameters<(typeof actions)['resetPassword']>[0]);

		expect(result).toEqual({ status: 500, data: { error: 'Failed to send password reset' } });
	});

	it('maps provider failures to the current invite error response', async () => {
		platformUserIdentityCommandsMock.resendInvite.mockResolvedValueOnce({
			status: 'provider_error',
			message: 'sanitized'
		});

		const result = await actions.resendInvite({
			__ctx: {
				adminClient: makeIdentityCommandActionClient(),
				audit
			},
			params: { userId: USER_ID },
			url: new URL(`http://localhost:4173/admin/users/${USER_ID}`)
		} as unknown as Parameters<(typeof actions)['resendInvite']>[0]);

		expect(result).toEqual({ status: 500, data: { error: 'Failed to resend invite' } });
	});
});
