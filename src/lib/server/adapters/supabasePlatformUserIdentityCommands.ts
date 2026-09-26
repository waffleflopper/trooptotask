import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { getAuthConfirmRedirectTo, sendPlatformAuthEmail } from '$features/identity/index.server';
import { checkDurableRateLimit, createSupabaseDurableRateLimitStore } from '$lib/access/index.server';
import {
	createPlatformUserIdentityCommands,
	type PlatformUserIdentityCommandStore,
	type PlatformUserIdentityCommands
} from '$lib/server/core/useCases/platformUserIdentityCommands';

function isNotFoundAuthError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
	if (candidate.status === 404 || candidate.code === 'user_not_found') return true;
	return typeof candidate.message === 'string' && /\buser\b.*\bnot\s+found\b/i.test(candidate.message);
}

export function createSupabasePlatformUserIdentityCommandStore(
	supabase: SupabaseClient
): PlatformUserIdentityCommandStore {
	return {
		async getUserEmailById(userId) {
			const { data, error } = await supabase.auth.admin.getUserById(userId);
			if (error) {
				if (isNotFoundAuthError(error)) return { status: 'not_found' };
				console.error('[admin/users] Unable to load user identity');
				return { status: 'provider_error', message: 'Failed to load user identity' };
			}

			const email = data?.user?.email ?? null;
			if (!email) return { status: 'not_found' };
			return { status: 'found', email };
		},

		async sendPasswordResetEmail(input) {
			const result = await sendPlatformAuthEmail({
				type: 'recovery',
				userId: input.userId,
				email: input.email,
				redirectTo: input.redirectTo
			});
			if (result !== 'sent') {
				return { ok: false, message: 'Failed to send password reset email' };
			}

			return { ok: true };
		},

		async sendInviteEmail(input) {
			const result = await sendPlatformAuthEmail({
				type: 'invite',
				userId: input.userId,
				email: input.email,
				redirectTo: input.redirectTo
			});
			if (result !== 'sent') {
				return { ok: false, message: 'Failed to send invite email' };
			}

			return { ok: true };
		}
	};
}

export function createSupabasePlatformUserIdentityCommands(ctx: AdminContext): PlatformUserIdentityCommands {
	return createPlatformUserIdentityCommands({
		store: createSupabasePlatformUserIdentityCommandStore(ctx.adminClient),
		audit: { log: (event) => ctx.audit(event) },
		confirmationUrl: getAuthConfirmRedirectTo
	});
}

/** Limit repeated admin-generated OTP replacements and outbound email per target user and action. */
export async function checkAdminAuthEmailRateLimit(
	supabase: SupabaseClient,
	userId: string,
	type: 'recovery' | 'invite'
): Promise<boolean> {
	const decision = await checkDurableRateLimit({
		namespace: 'admin-auth-email',
		dimensions: [{ name: 'target', value: `${type}:${userId}` }],
		windowMs: 60 * 60 * 1000,
		maxRequests: 3,
		store: createSupabaseDurableRateLimitStore(supabase)
	});
	return decision.limited;
}
