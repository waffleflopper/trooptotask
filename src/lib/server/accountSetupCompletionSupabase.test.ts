import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAccountSetupAuthAdapter } from './accountSetupCompletionSupabase';

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
});
