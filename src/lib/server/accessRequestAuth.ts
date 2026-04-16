import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthConfirmRedirectTo } from './authConfirm';
import { selectAllSupabaseRows } from './supabasePagination';

export type AccessRequestDeliveryMethod = 'invite' | 'recovery';
export type AccessRequestRenewalResult =
	| { attempted: false }
	| { attempted: true; deliveryMethod: AccessRequestDeliveryMethod };

type AccessRequestInviteJoin = { used_at: string | null } | Array<{ used_at: string | null }> | null | undefined;

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function isExistingUserInviteError(message: string | undefined): boolean {
	const normalized = message?.toLowerCase() ?? '';
	return normalized.includes('already been registered') || normalized.includes('already exists');
}

function hasInviteBeenUsed(inviteJoin: AccessRequestInviteJoin): boolean {
	if (!inviteJoin) {
		return false;
	}

	if (Array.isArray(inviteJoin)) {
		return inviteJoin.some((invite) => !!invite.used_at);
	}

	return !!inviteJoin.used_at;
}

export async function sendAccessRequestSetupEmail(
	adminClient: SupabaseClient,
	email: string,
	origin: string
): Promise<{ deliveryMethod: AccessRequestDeliveryMethod }> {
	const normalizedEmail = normalizeEmail(email);
	const inviteRedirectTo = getAuthConfirmRedirectTo(origin, 'invite');

	const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
		redirectTo: inviteRedirectTo
	});

	if (!inviteError) {
		return { deliveryMethod: 'invite' };
	}

	if (!isExistingUserInviteError(inviteError.message)) {
		throw inviteError;
	}

	const recoveryRedirectTo = getAuthConfirmRedirectTo(origin, 'recovery');
	const { error: recoveryError } = await adminClient.auth.resetPasswordForEmail(normalizedEmail, {
		redirectTo: recoveryRedirectTo
	});

	if (recoveryError) {
		throw recoveryError;
	}

	return { deliveryMethod: 'recovery' };
}

export async function renewApprovedAccessRequestInvite(
	adminClient: SupabaseClient,
	email: string,
	origin: string
): Promise<AccessRequestRenewalResult> {
	const normalizedEmail = normalizeEmail(email);
	const { data: approvedRequests, error: fetchError } = await selectAllSupabaseRows<{
		id: string;
		registration_invites: AccessRequestInviteJoin;
	}>(
		(from, to) =>
			adminClient
				.from('access_requests')
				.select('id, registration_invites(used_at)')
				.eq('status', 'approved')
				.eq('email', normalizedEmail)
				.range(from, to) as unknown as Promise<{
				data: { id: string; registration_invites: AccessRequestInviteJoin }[] | null;
				error: unknown;
			}>
	);

	if (fetchError) {
		throw fetchError;
	}

	if (!approvedRequests?.length) {
		return { attempted: false };
	}

	const hasCompletedSetup = approvedRequests.some((request) => hasInviteBeenUsed(request.registration_invites));
	if (hasCompletedSetup) {
		return { attempted: false };
	}

	const delivery = await sendAccessRequestSetupEmail(adminClient, normalizedEmail, origin);
	return { attempted: true, deliveryMethod: delivery.deliveryMethod };
}

export async function markApprovedAccessRequestCompleted(
	adminClient: SupabaseClient,
	email: string,
	userId: string
): Promise<{ updated: number }> {
	const normalizedEmail = normalizeEmail(email);
	const { data: approvedRequests, error: fetchError } = await selectAllSupabaseRows<{ invite_id: string | null }>(
		(from, to) =>
			adminClient
				.from('access_requests')
				.select('invite_id')
				.eq('status', 'approved')
				.eq('email', normalizedEmail)
				.not('invite_id', 'is', null)
				.range(from, to) as unknown as Promise<{
				data: { invite_id: string | null }[] | null;
				error: unknown;
			}>
	);

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
