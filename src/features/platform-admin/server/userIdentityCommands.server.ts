import type { IdentityPlatformAccountEmailPort } from '$features/identity/contracts';

import type { PlatformUserIdentityCommands } from '../userIdentityTypes';
export type { PlatformUserIdentityCommands, PlatformUserIdentityCommandResult } from '../userIdentityTypes';

export interface PlatformUserIdentityCommandAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}

export interface PlatformUserIdentityCommandDependencies {
	store: IdentityPlatformAccountEmailPort;
	checkRateLimit: (userId: string, type: 'recovery' | 'invite') => Promise<boolean>;
	audit: { log(event: PlatformUserIdentityCommandAuditEvent): void };
	confirmationUrl: (inboundOrigin: string, type: 'recovery' | 'invite') => string;
}

export function createPlatformUserIdentityCommands(
	deps: PlatformUserIdentityCommandDependencies
): PlatformUserIdentityCommands {
	return {
		async sendPasswordReset(input) {
			if (await deps.checkRateLimit(input.userId, 'recovery'))
				return { status: 'rate_limited', message: 'Too many password reset emails. Please try again later.' };
			const userEmail = await deps.store.getUserEmailById(input.userId);
			if (userEmail.status === 'not_found') return { status: 'not_found' };
			if (userEmail.status === 'provider_error') {
				return { status: 'provider_error', message: 'Failed to send password reset' };
			}

			const sendResult = await deps.store.sendPasswordResetEmail({
				userId: input.userId,
				email: userEmail.email,
				redirectTo: deps.confirmationUrl(input.inboundOrigin, 'recovery')
			});
			if (!sendResult.ok) return { status: 'provider_error', message: 'Failed to send password reset' };

			deps.audit.log({
				action: 'admin.user.password_reset',
				resourceType: 'user',
				resourceId: input.userId,
				details: { targetEmail: userEmail.email },
				severity: 'warning'
			});

			return {
				status: 'sent',
				email: userEmail.email,
				message: 'Password reset email sent'
			};
		},

		async resendInvite(input) {
			if (await deps.checkRateLimit(input.userId, 'invite'))
				return { status: 'rate_limited', message: 'Too many invite emails. Please try again later.' };
			const userEmail = await deps.store.getUserEmailById(input.userId);
			if (userEmail.status === 'not_found') return { status: 'not_found' };
			if (userEmail.status === 'provider_error') {
				return { status: 'provider_error', message: 'Failed to resend invite' };
			}

			const sendResult = await deps.store.sendInviteEmail({
				userId: input.userId,
				email: userEmail.email,
				redirectTo: deps.confirmationUrl(input.inboundOrigin, 'invite')
			});
			if (!sendResult.ok) return { status: 'provider_error', message: 'Failed to resend invite' };

			deps.audit.log({
				action: 'admin.user.resend_invite',
				resourceType: 'user',
				resourceId: input.userId,
				details: { targetEmail: userEmail.email },
				severity: 'info'
			});

			return {
				status: 'sent',
				email: userEmail.email,
				message: 'Invite email resent'
			};
		}
	};
}
