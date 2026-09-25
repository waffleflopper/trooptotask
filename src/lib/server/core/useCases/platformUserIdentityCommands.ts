export type PlatformUserIdentityCommandResult =
	| { status: 'sent'; email: string; message: string }
	| { status: 'not_found' }
	| { status: 'provider_error'; message: string };

export interface PlatformUserIdentityCommands {
	sendPasswordReset(input: { userId: string; inboundOrigin: string }): Promise<PlatformUserIdentityCommandResult>;
	resendInvite(input: { userId: string; inboundOrigin: string }): Promise<PlatformUserIdentityCommandResult>;
}

export interface PlatformUserIdentityCommandStore {
	getUserEmailById(
		userId: string
	): Promise<
		{ status: 'found'; email: string } | { status: 'not_found' } | { status: 'provider_error'; message: string }
	>;
	sendPasswordResetEmail(input: {
		userId: string;
		email: string;
		redirectTo: string;
	}): Promise<{ ok: true } | { ok: false; message: string }>;
	sendInviteEmail(input: {
		userId: string;
		email: string;
		redirectTo: string;
	}): Promise<{ ok: true } | { ok: false; message: string }>;
}

export interface PlatformUserIdentityCommandAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}

export interface PlatformUserIdentityCommandDependencies {
	store: PlatformUserIdentityCommandStore;
	audit: { log(event: PlatformUserIdentityCommandAuditEvent): void };
	confirmationUrl: (inboundOrigin: string, type: 'recovery' | 'invite') => string;
}

export function createPlatformUserIdentityCommands(
	deps: PlatformUserIdentityCommandDependencies
): PlatformUserIdentityCommands {
	return {
		async sendPasswordReset(input) {
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
