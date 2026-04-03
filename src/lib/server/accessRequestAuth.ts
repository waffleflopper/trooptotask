import type { SupabaseClient } from '@supabase/supabase-js';

export type AccessRequestDeliveryMethod = 'invite' | 'recovery';

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function isExistingUserInviteError(message: string | undefined): boolean {
	const normalized = message?.toLowerCase() ?? '';
	return normalized.includes('already been registered') || normalized.includes('already exists');
}

export async function sendAccessRequestSetupEmail(
	adminClient: SupabaseClient,
	email: string,
	origin: string
): Promise<{ deliveryMethod: AccessRequestDeliveryMethod }> {
	const normalizedEmail = normalizeEmail(email);
	const inviteRedirectTo = `${origin}/auth/accept-invite`;

	const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
		redirectTo: inviteRedirectTo
	});

	if (!inviteError) {
		return { deliveryMethod: 'invite' };
	}

	if (!isExistingUserInviteError(inviteError.message)) {
		throw inviteError;
	}

	const recoveryRedirectTo = `${origin}/auth/reset-password`;
	const { error: recoveryError } = await adminClient.auth.resetPasswordForEmail(normalizedEmail, {
		redirectTo: recoveryRedirectTo
	});

	if (recoveryError) {
		throw recoveryError;
	}

	return { deliveryMethod: 'recovery' };
}

export async function markApprovedAccessRequestCompleted(
	adminClient: SupabaseClient,
	email: string,
	userId: string
): Promise<{ updated: number }> {
	const normalizedEmail = normalizeEmail(email);
	const { data: approvedRequests, error: fetchError } = await adminClient
		.from('access_requests')
		.select('invite_id')
		.eq('status', 'approved')
		.eq('email', normalizedEmail)
		.not('invite_id', 'is', null);

	if (fetchError) {
		throw fetchError;
	}

	const inviteIds = Array.from(
		new Set(
			(approvedRequests ?? [])
				.map((request) => request.invite_id)
				.filter((inviteId): inviteId is string => typeof inviteId === 'string' && inviteId.length > 0)
		)
	);

	if (inviteIds.length === 0) {
		return { updated: 0 };
	}

	const { data: updatedRows, error: updateError } = await adminClient
		.from('registration_invites')
		.update({
			used_by: userId,
			used_at: new Date().toISOString()
		})
		.in('id', inviteIds)
		.is('used_at', null)
		.select('id');

	if (updateError) {
		throw updateError;
	}

	return { updated: updatedRows?.length ?? 0 };
}
