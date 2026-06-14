import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
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
				console.error('[admin/users] auth.admin.getUserById error:', error);
				return { status: 'provider_error', message: 'Failed to load user identity' };
			}

			const email = data?.user?.email ?? null;
			if (!email) return { status: 'not_found' };
			return { status: 'found', email };
		},

		async sendPasswordResetEmail(input) {
			const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
				redirectTo: input.redirectTo
			});
			if (error) {
				console.error('[admin/users] auth.resetPasswordForEmail error:', error);
				return { ok: false, message: 'Failed to send password reset email' };
			}

			return { ok: true };
		},

		async sendInviteEmail(input) {
			const { error } = await supabase.auth.admin.inviteUserByEmail(input.email, {
				redirectTo: input.redirectTo
			});
			if (error) {
				console.error('[admin/users] auth.admin.inviteUserByEmail error:', error);
				return { ok: false, message: 'Failed to send invite email' };
			}

			return { ok: true };
		}
	};
}

export function createSupabasePlatformUserIdentityCommands(ctx: AdminContext): PlatformUserIdentityCommands {
	return createPlatformUserIdentityCommands({
		store: createSupabasePlatformUserIdentityCommandStore(ctx.adminClient),
		audit: { log: (event) => ctx.audit(event) }
	});
}
