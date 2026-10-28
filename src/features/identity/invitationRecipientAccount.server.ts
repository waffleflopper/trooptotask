import type { SupabaseClient } from '$lib/server/database';
import { findUserEmailIdentityByEmail } from './userEmailIdentities.server';

export { normalizeUserEmailIdentity } from './userEmailIdentities.server';

export interface InvitationRecipientAccount {
	id: string;
	email: string;
	emailConfirmed: boolean;
}

interface AuthUserConfirmationRow {
	confirmed_at?: string | null;
	email_confirmed_at?: string | null;
}

/** Only the account facts an Organization invitation needs leave Identity. */
export async function findInvitationRecipientAccount(
	adminClient: SupabaseClient,
	email: string
): Promise<InvitationRecipientAccount | null> {
	const identity = await findUserEmailIdentityByEmail(adminClient, email);
	if (!identity) return null;

	const { data, error } = await adminClient.auth.admin.getUserById(identity.userId);
	if (error) throw error;

	const user = data?.user as AuthUserConfirmationRow | null;
	return {
		id: identity.userId,
		email: identity.normalizedEmail,
		emailConfirmed: hasTimestamp(user?.email_confirmed_at) || hasTimestamp(user?.confirmed_at)
	};
}

function hasTimestamp(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}
