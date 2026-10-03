export type PlatformUserIdentityCommandResult =
	| { status: 'sent'; email: string; message: string }
	| { status: 'not_found' }
	| { status: 'provider_error'; message: string }
	| { status: 'rate_limited'; message: string };

export interface PlatformUserIdentityCommands {
	sendPasswordReset(input: { userId: string; inboundOrigin: string }): Promise<PlatformUserIdentityCommandResult>;
	resendInvite(input: { userId: string; inboundOrigin: string }): Promise<PlatformUserIdentityCommandResult>;
}
