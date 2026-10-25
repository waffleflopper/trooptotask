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
	checkRateLimit: (userId: string, type: 'recovery') => Promise<boolean>;
	audit: { log(event: PlatformUserIdentityCommandAuditEvent): Promise<void> };
	confirmationUrl: (inboundOrigin: string, type: 'recovery') => string;
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

			try {
				await deps.audit.log({
					action: 'admin.user.password_reset',
					resourceType: 'user',
					resourceId: input.userId,
					details: { targetEmail: userEmail.email },
					severity: 'warning'
				});
			} catch {
				return {
					status: 'email_sent_audit_failed',
					email: userEmail.email,
					message: 'The email was sent, but the required audit could not be recorded. Reload before sending again.'
				};
			}
			return {
				status: 'sent',
				email: userEmail.email,
				message: 'Password reset email sent'
			};
		}
	};
}
