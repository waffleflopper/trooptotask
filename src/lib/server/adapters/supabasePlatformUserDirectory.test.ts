import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformUserDirectoryStore } from './supabasePlatformUserDirectory';

describe('createSupabasePlatformUserDirectoryStore', () => {
	it('paginates auth users and maps provider fields into the directory contract', async () => {
		const listUsers = vi
			.fn()
			.mockResolvedValueOnce({
				data: {
					users: [
						{
							id: 'user-first',
							email: 'user-first@example.test',
							created_at: '2026-06-01T00:00:00.000Z',
							last_sign_in_at: null,
							email_confirmed_at: '2026-06-01T00:05:00.000Z'
						}
					],
					nextPage: 2
				},
				error: null
			})
			.mockResolvedValueOnce({
				data: {
					users: Array.from({ length: 1000 }, (_, index) => ({
						id: `user-${index}`,
						email: `user-${index}@example.test`,
						created_at: '2026-06-01T00:00:00.000Z',
						last_sign_in_at: null,
						email_confirmed_at: null
					})),
					nextPage: 3
				},
				error: null
			})
			.mockResolvedValueOnce({
				data: {
					users: [
						{
							id: 'user-final',
							email: null,
							created_at: '2026-06-02T00:00:00.000Z',
							last_sign_in_at: '2026-06-08T00:00:00.000Z',
							confirmed_at: '2026-06-02T00:05:00.000Z'
						}
					]
				},
				error: null
			});
		const store = createSupabasePlatformUserDirectoryStore({
			auth: { admin: { listUsers } }
		} as never);

		const result = await store.listAuthUsers();

		expect(listUsers).toHaveBeenCalledTimes(3);
		expect(listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 1000 });
		expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });
		expect(listUsers).toHaveBeenNthCalledWith(3, { page: 3, perPage: 1000 });
		expect(result).toMatchObject({
			status: 'ok',
			users: expect.arrayContaining([
				{
					id: 'user-final',
					email: null,
					createdAt: '2026-06-02T00:00:00.000Z',
					lastSignInAt: '2026-06-08T00:00:00.000Z',
					emailConfirmedAt: '2026-06-02T00:05:00.000Z'
				}
			])
		});
	});

	it('keeps auth pagination monotonic when the provider returns a backwards next page', async () => {
		const listUsers = vi.fn(async ({ page }: { page: number }) => ({
			data: {
				users: [
					{
						id: `user-${page}`,
						email: `user-${page}@example.test`,
						created_at: '2026-06-01T00:00:00.000Z',
						last_sign_in_at: null,
						email_confirmed_at: null
					}
				],
				nextPage: page < 10 ? page + 1 : page === 10 ? 1 : null
			},
			error: null
		}));
		const store = createSupabasePlatformUserDirectoryStore({
			auth: { admin: { listUsers } }
		} as never);

		const result = await store.listAuthUsers();

		expect(listUsers).toHaveBeenCalledTimes(11);
		expect(listUsers).toHaveBeenNthCalledWith(10, { page: 10, perPage: 1000 });
		expect(listUsers).toHaveBeenNthCalledWith(11, { page: 11, perPage: 1000 });
		expect(result).toMatchObject({
			status: 'ok',
			users: expect.arrayContaining([expect.objectContaining({ id: 'user-11' })])
		});
	});

	it('maps user memberships and suspension rows from provider-shaped records', async () => {
		const membershipRange = vi.fn().mockResolvedValue({
			data: [
				{
					role: 'owner',
					organizations: { id: 'org-1', name: 'Able Company', tier: 'team', gift_tier: 'unit' }
				},
				{
					role: 'member',
					organizations: null
				}
			],
			error: null
		});
		const suspensionMaybeSingle = vi.fn().mockResolvedValue({
			data: {
				user_id: 'user-1',
				suspended_at: '2026-06-04T00:00:00.000Z',
				suspended_by: 'admin-1',
				reason: 'Policy review'
			},
			error: null
		});
		const from = vi.fn((table: string) => {
			if (table === 'organization_memberships') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							range: membershipRange
						}))
					}))
				};
			}
			if (table === 'user_suspensions') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							maybeSingle: suspensionMaybeSingle
						}))
					}))
				};
			}
			throw new Error(`Unexpected table ${table}`);
		});
		const store = createSupabasePlatformUserDirectoryStore({
			auth: { admin: { listUsers: vi.fn(), getUserById: vi.fn() } },
			from
		} as never);

		await expect(store.listMembershipsForUser('user-1')).resolves.toEqual([
			{
				userId: 'user-1',
				role: 'owner',
				organization: { id: 'org-1', name: 'Able Company', tier: 'team', giftTier: 'unit' }
			},
			{
				userId: 'user-1',
				role: 'member',
				organization: null
			}
		]);
		await expect(store.getSuspensionForUser('user-1')).resolves.toEqual({
			userId: 'user-1',
			suspendedAt: '2026-06-04T00:00:00.000Z',
			suspendedBy: 'admin-1',
			reason: 'Policy review'
		});
	});

	it('maps auth-user detail success, missing users, and provider failures', async () => {
		const getUserById = vi
			.fn()
			.mockResolvedValueOnce({
				data: {
					user: {
						id: 'user-1',
						email: 'soldier@example.test',
						created_at: '2026-06-01T00:00:00.000Z',
						last_sign_in_at: null,
						email_confirmed_at: '2026-06-01T00:05:00.000Z'
					}
				},
				error: null
			})
			.mockResolvedValueOnce({ data: null, error: { status: 404, message: 'User not found' } })
			.mockResolvedValueOnce({ data: null, error: { message: 'identity provider unavailable' } })
			.mockResolvedValueOnce({ data: null, error: { message: 'preference not found' } });
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = createSupabasePlatformUserDirectoryStore({
			auth: { admin: { listUsers: vi.fn(), getUserById } }
		} as never);

		try {
			await expect(store.getAuthUser('user-1')).resolves.toEqual({
				status: 'ok',
				user: {
					id: 'user-1',
					email: 'soldier@example.test',
					createdAt: '2026-06-01T00:00:00.000Z',
					lastSignInAt: null,
					emailConfirmedAt: '2026-06-01T00:05:00.000Z'
				}
			});
			await expect(store.getAuthUser('missing-user')).resolves.toEqual({ status: 'not_found' });
			await expect(store.getAuthUser('user-2')).resolves.toEqual({
				status: 'auth_error',
				message: 'identity provider unavailable'
			});
			await expect(store.getAuthUser('user-3')).resolves.toEqual({
				status: 'auth_error',
				message: 'preference not found'
			});
		} finally {
			consoleError.mockRestore();
		}
	});

	it('returns membership and suspension user ids for list shaping', async () => {
		const membershipRange = vi.fn().mockResolvedValue({
			data: [{ user_id: 'user-1' }, { user_id: 'user-1' }, { user_id: 'user-2' }],
			error: null
		});
		const suspensionRange = vi.fn().mockResolvedValue({
			data: [{ user_id: 'user-2' }],
			error: null
		});
		const from = vi.fn((table: string) => {
			if (table === 'organization_memberships') {
				return {
					select: vi.fn(() => ({
						in: vi.fn(() => ({
							range: membershipRange
						}))
					}))
				};
			}
			if (table === 'user_suspensions') {
				return {
					select: vi.fn(() => ({
						in: vi.fn(() => ({
							range: suspensionRange
						}))
					}))
				};
			}
			throw new Error(`Unexpected table ${table}`);
		});
		const store = createSupabasePlatformUserDirectoryStore({
			auth: { admin: { listUsers: vi.fn(), getUserById: vi.fn() } },
			from
		} as never);

		await expect(store.listMembershipUserIds(['user-1', 'user-2'])).resolves.toEqual(['user-1', 'user-1', 'user-2']);
		await expect(store.listSuspendedUserIds(['user-1', 'user-2'])).resolves.toEqual(['user-2']);
		await expect(store.listMembershipUserIds([])).resolves.toEqual([]);
		await expect(store.listSuspendedUserIds([])).resolves.toEqual([]);
	});
});
