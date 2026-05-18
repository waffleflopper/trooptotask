import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseAccountSetupLinkStore } from '$lib/server/accountSetupLinks';
import type { AccountSetupAuthAdapter, AccountSetupCompletionStore } from '$lib/server/accountSetupCompletion';

function isExistingUserError(error: unknown): boolean {
	const message =
		typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
			? error.message.toLowerCase()
			: '';
	return message.includes('already been registered') || message.includes('already exists');
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

async function findUserByEmail(adminClient: SupabaseClient, email: string): Promise<User | null> {
	const normalizedEmail = normalizeEmail(email);
	let page = 1;

	while (page < 20) {
		const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
		if (error) {
			throw error;
		}

		const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
		if (user) {
			return user;
		}

		if (data.users.length < 1000) {
			return null;
		}
		page += 1;
	}

	return null;
}

export function createSupabaseAccountSetupCompletionStore(client: SupabaseClient): AccountSetupCompletionStore {
	const setupLinkStore = createSupabaseAccountSetupLinkStore(client);

	return {
		...setupLinkStore,
		async markAccessRequestSetupCompleted(accessRequestId, userId, completedAt) {
			const { error } = await client
				.from('access_requests')
				.update({
					setup_completed_at: completedAt.toISOString(),
					// Keep legacy invite audit compatibility while the old path is rolled off.
					invite_id: null
				})
				.eq('id', accessRequestId)
				.is('setup_completed_at', null);

			if (error) {
				throw error;
			}

			await Promise.resolve(userId);
		}
	};
}

export function createSupabaseAccountSetupAuthAdapter(
	adminClient: SupabaseClient,
	sessionClient: SupabaseClient
): AccountSetupAuthAdapter {
	return {
		async createOrActivateConfirmedUser(input) {
			const email = normalizeEmail(input.email);
			const created = await adminClient.auth.admin.createUser({
				email,
				password: input.password,
				email_confirm: true
			});

			if (!created.error && created.data.user) {
				return { userId: created.data.user.id };
			}

			if (!isExistingUserError(created.error)) {
				throw created.error ?? new Error('Could not create User Account');
			}

			const existingUser = await findUserByEmail(adminClient, email);
			if (!existingUser) {
				throw created.error ?? new Error('Could not find existing User Account');
			}

			const updated = await adminClient.auth.admin.updateUserById(existingUser.id, {
				password: input.password,
				email_confirm: true
			});

			if (updated.error) {
				throw updated.error;
			}

			return { userId: existingUser.id };
		},

		async signInWithPassword(input) {
			const { error } = await sessionClient.auth.signInWithPassword({
				email: normalizeEmail(input.email),
				password: input.password
			});

			if (error) {
				throw error;
			}
		}
	};
}
