import { describe, expect, it, vi } from 'vitest';
import {
	createSupabaseAccountSetupAuthAdapter,
	createSupabaseAccountSetupCompletionStore
} from './accountSetupCompletionSupabase';

function makeAdminClient() {
	return {
		auth: {
			admin: {
				createUser: vi.fn().mockResolvedValue({
					data: { user: null },
					error: { code: 'user_already_exists', message: 'User already exists' }
				}),
				listUsers: vi.fn().mockResolvedValue({
					data: {
						users: [{ id: 'existing-user-1', email: 'soldier@example.mil' }]
					},
					error: null
				}),
				updateUserById: vi.fn().mockResolvedValue({
					data: { user: { id: 'existing-user-1' } },
					error: null
				})
			}
		}
	};
}

function makeSessionClient() {
	return {
		auth: {
			signInWithPassword: vi.fn().mockResolvedValue({ error: null })
		}
	};
}

describe('Supabase Account Setup auth adapter', () => {
	it('activates an existing User Account by confirming email and replacing the password', async () => {
		const adminClient = makeAdminClient();
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		const result = await adapter.createOrActivateConfirmedUser({
			email: ' Soldier@Example.MIL ',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({ userId: 'existing-user-1' });
		expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			password: 'ValidPassword123!',
			email_confirm: true
		});
		expect(adminClient.auth.admin.listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
		expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('existing-user-1', {
			password: 'ValidPassword123!',
			email_confirm: true
		});
	});

	it('scans later Supabase Auth pages when activating an existing User Account', async () => {
		const adminClient = makeAdminClient();
		adminClient.auth.admin.listUsers
			.mockResolvedValueOnce({
				data: {
					users: Array.from({ length: 1000 }, (_, index) => ({
						id: `other-user-${index}`,
						email: `other-${index}@example.mil`
					}))
				},
				error: null
			})
			.mockResolvedValueOnce({
				data: {
					users: [{ id: 'existing-user-2', email: 'soldier@example.mil' }]
				},
				error: null
			});
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		const result = await adapter.createOrActivateConfirmedUser({
			email: 'soldier@example.mil',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({ userId: 'existing-user-2' });
		expect(adminClient.auth.admin.listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 1000 });
		expect(adminClient.auth.admin.listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });
		expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('existing-user-2', {
			password: 'ValidPassword123!',
			email_confirm: true
		});
	});

	it('surfaces password update failures for existing User Accounts', async () => {
		const adminClient = makeAdminClient();
		adminClient.auth.admin.updateUserById.mockResolvedValueOnce({
			data: { user: null },
			error: { message: 'Password should be at least 12 characters' }
		});
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		await expect(
			adapter.createOrActivateConfirmedUser({
				email: 'soldier@example.mil',
				password: 'short'
			})
		).rejects.toEqual({ message: 'Password should be at least 12 characters' });
		expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('existing-user-1', {
			password: 'short',
			email_confirm: true
		});
	});

	it('records setup completion without creating an Organization Membership', async () => {
		const from = vi.fn((table: string) => {
			if (table === 'access_requests') {
				return {
					update: vi.fn(() => ({
						eq: vi.fn(() => ({
							is: vi.fn().mockResolvedValue({ error: null })
						}))
					}))
				};
			}

			if (table === 'user_profiles') {
				return {
					upsert: vi.fn().mockResolvedValue({ error: null })
				};
			}

			return {
				insert: vi.fn().mockResolvedValue({ error: null }),
				update: vi.fn().mockResolvedValue({ error: null }),
				upsert: vi.fn().mockResolvedValue({ error: null })
			};
		});
		const store = createSupabaseAccountSetupCompletionStore({ from } as never);

		await store.upsertUserProfile({ userId: 'user-123', firstName: 'Person', lastName: 'Example' });
		await store.markAccessRequestSetupCompleted('request-1', 'user-123', new Date('2026-05-22T12:00:00.000Z'));

		expect(from).toHaveBeenCalledWith('user_profiles');
		expect(from).toHaveBeenCalledWith('access_requests');
		expect(from).not.toHaveBeenCalledWith('organization_memberships');
	});
});
