import type { SupabaseClient } from '$lib/server/database';
import { sendAuthEmail } from './authEmailDelivery.server';
import { createIdentityPlatformSupportReader } from './platformSupportReader.server';
import type { IdentityPlatformAccountEmailPort } from './contracts';

/** Source-owned account lookup and OTP delivery for already-authorized Platform commands. */
export function createIdentityPlatformAccountEmailPort(client: SupabaseClient): IdentityPlatformAccountEmailPort {
	const accounts = createIdentityPlatformSupportReader(client);
	return {
		async getUserEmailById(userId) {
			const account = await accounts.getAuthUser(userId);
			if (account.status === 'auth_error') return { status: 'provider_error', message: account.message };
			if (account.status === 'not_found' || !account.user.email) return { status: 'not_found' };
			return { status: 'found', email: account.user.email };
		},
		async sendPasswordResetEmail(input) {
			const result = await sendAuthEmail({
				supabase: client,
				type: 'recovery',
				email: input.email,
				redirectTo: input.redirectTo,
				expectedUserId: input.userId
			});
			return result === 'sent' ? { ok: true } : { ok: false, message: 'Failed to send password reset email' };
		}
	};
}
