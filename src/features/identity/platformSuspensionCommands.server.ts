import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdentityPlatformSuspensionCommands } from './contracts';

function acknowledgeUser(response: { data: unknown; error: unknown }, userId: string): void {
	const rows = response.data;
	if (
		response.error ||
		!Array.isArray(rows) ||
		rows.length !== 1 ||
		!rows[0] ||
		typeof rows[0].user_id !== 'string' ||
		rows[0].user_id.toLowerCase() !== userId.toLowerCase()
	)
		throw new Error('User suspension change could not be confirmed');
}

/** Identity persists the exact account effect; Platform owns operator admission and audit. */
export function createIdentityPlatformSuspensionCommands(client: SupabaseClient): IdentityPlatformSuspensionCommands {
	return {
		async suspendUser(input) {
			const response = await client
				.from('user_suspensions')
				.upsert({ user_id: input.userId, suspended_by: input.suspendedBy, reason: input.reason })
				.select('user_id');
			acknowledgeUser(response, input.userId);
		},
		async unsuspendUser(userId) {
			const response = await client.from('user_suspensions').delete().eq('user_id', userId).select('user_id');
			acknowledgeUser(response, userId);
		}
	};
}
