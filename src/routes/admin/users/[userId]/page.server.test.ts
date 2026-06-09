import { beforeEach, describe, expect, it, vi } from 'vitest';

const { platformAuditMock, platformUserDirectoryMock } = vi.hoisted(() => ({
	platformAuditMock: {
		listLogs: vi.fn(),
		listRecentByOrganization: vi.fn(),
		listRecentByUser: vi.fn()
	},
	platformUserDirectoryMock: {
		getUserDetail: vi.fn()
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

import { actions, load } from './+page.server';

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

describe('admin user auth email actions', () => {
	const getUserById = vi.fn();
	const inviteUserByEmail = vi.fn();
	const resetPasswordForEmail = vi.fn();
	const audit = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();

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
		platformUserDirectoryMock.getUserDetail.mockResolvedValue({
			status: 'found',
			detail: {
				user: {
					id: 'user-1',
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
				resourceId: 'user-1',
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
			params: { userId: 'user-1' }
		} as unknown as Parameters<typeof load>[0]);

		expect(platformUserDirectoryMock.getUserDetail).toHaveBeenCalledWith('user-1');
		expect(platformAuditMock.listRecentByUser).toHaveBeenCalledWith({ userId: 'user-1', limit: 10 });
		expect(result).toMatchObject({
			user: {
				id: 'user-1',
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
					resourceId: 'user-1',
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
				params: { userId: 'user-1' }
			} as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 500 });
		expect(platformAuditMock.listRecentByUser).not.toHaveBeenCalled();
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

	it('uses the configured public app origin for admin-triggered auth emails', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');

		await actions.resendInvite({
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
			url: new URL('https://admin.trooptotask.org/admin/users/user-1')
		} as unknown as Parameters<(typeof actions)['resendInvite']>[0]);

		expect(inviteUserByEmail).toHaveBeenCalledWith('soldier@example.mil', {
			redirectTo: 'https://trooptotask.org/auth/confirm?type=invite&next=%2Fauth%2Faccept-invite'
		});
	});
});
