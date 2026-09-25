import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAccountSetupLinkStore } from '$features/identity/index.server';
import type { AccountSetupAuthAdapter, AccountSetupCompletionStore } from '$lib/server/accountSetupCompletion';
import {
	findUserEmailIdentityByEmail,
	normalizeUserEmailIdentity,
	upsertUserEmailIdentity
} from '$lib/server/userEmailIdentities';

function isExistingUserError(error: unknown): boolean {
	const code =
		typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
			? error.code.toLowerCase()
			: '';
	if (code) {
		return code === 'user_already_exists' || code === 'email_exists';
	}
	const message =
		typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
			? error.message.toLowerCase()
			: '';
	return message.includes('already been registered') || message.includes('already exists');
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
					setup_user_id: userId
				})
				.eq('id', accessRequestId)
				.is('setup_completed_at', null);

			if (error) {
				throw error;
			}
		},
		async upsertUserProfile(input) {
			const { error } = await client.from('user_profiles').upsert(
				{
					user_id: input.userId,
					first_name: input.firstName,
					last_name: input.lastName
				},
				{ onConflict: 'user_id', ignoreDuplicates: true }
			);

			if (error) {
				throw error;
			}
		}
	};
}

export function createSupabaseAccountSetupAuthAdapter(
	adminClient: SupabaseClient,
	sessionClient: SupabaseClient
): AccountSetupAuthAdapter {
	return {
		async createOrActivateConfirmedUser(input) {
			const email = normalizeUserEmailIdentity(input.email);
			const created = await adminClient.auth.admin.createUser({
				email,
				password: input.password,
				email_confirm: true
			});

			if (!created.error && created.data.user) {
				await upsertUserEmailIdentity(adminClient, { userId: created.data.user.id, email });
				return { userId: created.data.user.id };
			}

			if (!isExistingUserError(created.error)) {
				throw created.error ?? new Error('Could not create User Account');
			}

			const existingIdentity = await findUserEmailIdentityByEmail(adminClient, email);
			if (!existingIdentity) {
				throw new Error('Could not find existing User Account email identity');
			}

			const updated = await adminClient.auth.admin.updateUserById(existingIdentity.userId, {
				password: input.password,
				email_confirm: true
			});

			if (updated.error) {
				throw updated.error;
			}

			await upsertUserEmailIdentity(adminClient, { userId: existingIdentity.userId, email });

			return { userId: existingIdentity.userId };
		},

		async signInWithPassword(input) {
			const { error } = await sessionClient.auth.signInWithPassword({
				email: normalizeUserEmailIdentity(input.email),
				password: input.password
			});

			if (error) {
				throw error;
			}
		}
	};
}
