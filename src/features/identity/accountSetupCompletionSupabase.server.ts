import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAccountSetupLinkStore } from './accountSetupLinks.server';
import {
	AccountSetupIdentityMismatchError,
	AccountSetupPasswordRejectedError,
	type AccountSetupClaimReconciliation,
	type AccountSetupAuthAdapter,
	type AccountSetupCompletionStore
} from './accountSetupCompletion.server';
import { findUserEmailIdentityByEmail, normalizeUserEmailIdentity } from '$lib/server/userEmailIdentities';

function isStructuredPasswordRejection(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'weak_password';
}

function isExistingUserError(error: unknown): boolean {
	const code =
		typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
			? error.code.toLowerCase()
			: '';
	if (code) return code === 'user_already_exists' || code === 'email_exists';
	const message =
		typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
			? error.message.toLowerCase()
			: '';
	return message.includes('already been registered') || message.includes('already exists');
}

function readReconciliation(data: unknown): AccountSetupClaimReconciliation {
	if (!data || typeof data !== 'object' || !('state' in data)) return { state: 'support-required' };
	if (data.state === 'clear') return { state: 'clear' };
	if (data.state === 'support-required') return { state: 'support-required' };
	if (
		!('sourceLinkId' in data) ||
		typeof data.sourceLinkId !== 'string' ||
		!('sourceAccessRequestId' in data) ||
		typeof data.sourceAccessRequestId !== 'string'
	)
		return { state: 'support-required' };
	if (data.state === 'fenced') {
		return { state: 'fenced', sourceLinkId: data.sourceLinkId, sourceAccessRequestId: data.sourceAccessRequestId };
	}
	if (data.state === 'committed' && 'userId' in data && typeof data.userId === 'string') {
		return {
			state: 'committed',
			sourceLinkId: data.sourceLinkId,
			sourceAccessRequestId: data.sourceAccessRequestId,
			userId: data.userId
		};
	}
	return { state: 'support-required' };
}

function readCompletion(data: unknown): { state: 'completed'; userId: string } | { state: 'support-required' } {
	if (
		data &&
		typeof data === 'object' &&
		'state' in data &&
		data.state === 'completed' &&
		'userId' in data &&
		typeof data.userId === 'string'
	) {
		return { state: 'completed', userId: data.userId };
	}
	return { state: 'support-required' };
}

export function createSupabaseAccountSetupCompletionStore(client: SupabaseClient): AccountSetupCompletionStore {
	const setupLinkStore = createSupabaseAccountSetupLinkStore(client);

	return {
		...setupLinkStore,
		async readAttemptId(setupLinkId) {
			const { data, error } = await client
				.from('account_setup_attempts')
				.select('id')
				.eq('setup_link_id', setupLinkId)
				.maybeSingle<{ id: string }>();
			if (error) throw error;
			return data?.id ?? null;
		},
		async reconcileClaim(input) {
			const { data, error } = await client.rpc('reconcile_account_setup_claim', {
				p_target_setup_link_id: input.setupLinkId,
				p_target_access_request_id: input.accessRequestId
			});
			if (error) throw error;
			return readReconciliation(data);
		},
		async completeRecovery(input) {
			const { data, error } = await client.rpc('complete_account_setup_recovery', {
				p_source_setup_link_id: input.sourceLinkId,
				p_target_setup_link_id: input.targetLinkId,
				p_target_access_request_id: input.targetAccessRequestId,
				p_first_name: input.firstName,
				p_last_name: input.lastName
			});
			if (error) throw error;
			return readCompletion(data);
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
			const existingIdentity = await findUserEmailIdentityByEmail(adminClient, email);
			const mutation = existingIdentity
				? await adminClient.auth.admin.updateUserById(existingIdentity.userId, {
						password: input.password,
						email_confirm: true,
						user_metadata: { ttt_setup_attempt: input.attemptId }
					})
				: await adminClient.auth.admin.createUser({
						email,
						password: input.password,
						email_confirm: true,
						user_metadata: { ttt_setup_attempt: input.attemptId }
					});
			if (mutation.error || !mutation.data?.user) {
				if (isStructuredPasswordRejection(mutation.error)) {
					throw new AccountSetupPasswordRejectedError('Provider rejected setup password');
				}
				if (!existingIdentity && isExistingUserError(mutation.error)) {
					throw new AccountSetupIdentityMismatchError('Existing Auth user has no email identity');
				}
				throw mutation.error ?? new Error('Could not set up User Account');
			}
			return { userId: mutation.data.user.id };
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
