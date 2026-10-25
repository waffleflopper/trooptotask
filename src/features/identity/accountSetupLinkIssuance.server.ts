import type { CreateAccountSetupLinkResult } from './accountSetupLinks.server';
import type { SendAccountSetupOutboxDeliveryResult } from './authEmailOutbox.server';
import { makePublicAppUrl } from './publicAppOrigin.server';

/**
 * Names the audit event the issuance emits. It has no other effect: every caller
 * decides for itself whether a non-created result is fatal to its own workflow.
 */
export type AccountSetupLinkIssuanceOrigin =
	| 'platform_approval'
	| 'platform_resend'
	| 'organization_invitation'
	| 'public_renewal';

export type AccountSetupLinkNotCreatedReason = Exclude<CreateAccountSetupLinkResult['status'], 'created'>;

export interface AccountSetupLinkIssuanceAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}

export interface AccountSetupLinkIssuanceCreator {
	createForAccessRequest(accessRequestId: string): Promise<CreateAccountSetupLinkResult>;
}

export interface AccountSetupLinkIssuanceDelivery {
	send(input: {
		accessRequestId: string;
		setupLinkId: string;
		email: string;
		setupUrl: string;
		expiresAt: Date;
	}): Promise<SendAccountSetupOutboxDeliveryResult>;
}

export interface AccountSetupLinkIssuanceDependencies {
	setupLinks: AccountSetupLinkIssuanceCreator;
	setupDelivery: AccountSetupLinkIssuanceDelivery;
	audit: (event: AccountSetupLinkIssuanceAuditEvent) => void | Promise<void>;
}

export interface AccountSetupLinkIssuanceCommand {
	accessRequestId: string;
	email: string;
	publicOrigin: string;
	origin: AccountSetupLinkIssuanceOrigin;
	/** Public renewals keep unexpected persistence failures retryable through their routes. */
	deliveryErrorMode?: 'return' | 'throw';
	/** Caller-supplied audit detail. The issuance does not interpret it. */
	context?: Record<string, unknown>;
}

export type AccountSetupLinkIssuanceResult =
	| { status: 'sent' }
	| { status: 'email_sent_audit_failed' }
	| { status: 'email_sent_recording_failed' }
	| { status: 'delivery_failed' }
	| { status: 'not_created'; reason: AccountSetupLinkNotCreatedReason };

export interface AccountSetupLinkIssuance {
	issue(command: AccountSetupLinkIssuanceCommand): Promise<AccountSetupLinkIssuanceResult>;
}

const DELIVERY_AUDIT_ACTIONS: Record<AccountSetupLinkIssuanceOrigin, { sent: string; failed: string }> = {
	platform_approval: {
		sent: 'access_request.account_setup_link_sent',
		failed: 'access_request.account_setup_link_delivery_failed'
	},
	platform_resend: {
		sent: 'access_request.account_setup_link_resent',
		failed: 'access_request.account_setup_link_delivery_failed'
	},
	// The invitation lane deliberately reuses the existing names: they describe what
	// happened to the credential, and the auto-stamped org_id is what filters the lane.
	organization_invitation: {
		sent: 'access_request.account_setup_link_sent',
		failed: 'access_request.account_setup_link_delivery_failed'
	},
	public_renewal: {
		sent: 'access_request.account_setup_link_resent',
		failed: 'access_request.account_setup_link_delivery_failed'
	}
};

export function redactProviderError(error: unknown): string {
	const message =
		error instanceof Error && error.message
			? error.message
			: typeof error === 'string' && error
				? error
				: typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
					? error.message
					: 'Provider operation failed';

	return message
		.replace(/https?:\/\/[^\s"'<>]+\/auth\/setup-account\?token=[^\s"'<>]+/gi, '[redacted setup url]')
		.replace(/\btoken=[^&\s"'<>]+/gi, 'token=[redacted]')
		.replace(/\b[A-Fa-f0-9]{64}\b/g, '[redacted hash]');
}

function isCreatedSetupLinkResult(
	result: CreateAccountSetupLinkResult
): result is Extract<CreateAccountSetupLinkResult, { status: 'created' }> {
	return result.status === 'created';
}

async function auditRevokedSetupLinks(
	audit: AccountSetupLinkIssuanceDependencies['audit'],
	input: { accessRequestId: string; replacementSetupLinkId: string; revokedLinkIds: string[] }
): Promise<void> {
	await Promise.all(
		input.revokedLinkIds.map((revokedLinkId) =>
			audit({
				action: 'account_setup.link_revoked',
				resourceType: 'account_setup_link',
				resourceId: revokedLinkId,
				details: {
					accessRequestId: input.accessRequestId,
					replacementSetupLinkId: input.replacementSetupLinkId,
					stateTransition: 'pending.replaced'
				}
			})
		)
	);
}

/**
 * Creates an Account Setup Link, delivers it, and records the credential audit
 * trail. Its only dependencies are the setup-link creator, the setup-delivery
 * sender, and audit — authorization, rate limiting, and Access Request storage
 * stay with the callers that own them.
 */
export function createAccountSetupLinkIssuance(deps: AccountSetupLinkIssuanceDependencies): AccountSetupLinkIssuance {
	return {
		async issue(command) {
			const setupResult = await deps.setupLinks.createForAccessRequest(command.accessRequestId);
			if (!isCreatedSetupLinkResult(setupResult)) {
				return { status: 'not_created', reason: setupResult.status };
			}

			await auditRevokedSetupLinks(deps.audit, {
				accessRequestId: command.accessRequestId,
				replacementSetupLinkId: setupResult.link.id,
				revokedLinkIds: setupResult.revokedLinkIds
			});

			const auditActions = DELIVERY_AUDIT_ACTIONS[command.origin];

			let delivery: SendAccountSetupOutboxDeliveryResult;
			try {
				delivery = await deps.setupDelivery.send({
					accessRequestId: command.accessRequestId,
					setupLinkId: setupResult.link.id,
					email: command.email,
					setupUrl: makePublicAppUrl(setupResult.setupPath, { inboundOrigin: command.publicOrigin }),
					expiresAt: setupResult.expiresAt
				});
			} catch (error) {
				await deps.audit({
					action: auditActions.failed,
					resourceType: 'access_request',
					resourceId: command.accessRequestId,
					details: {
						...command.context,
						email: command.email,
						setupLinkId: setupResult.link.id,
						error: redactProviderError(error)
					},
					severity: 'warning'
				});
				if (command.deliveryErrorMode === 'throw') throw error;
				return { status: 'delivery_failed' };
			}
			if (delivery.status === 'sent_recording_failed') {
				try {
					await deps.audit({
						action: 'access_request.account_setup_link_recording_failed',
						resourceType: 'access_request',
						resourceId: command.accessRequestId,
						severity: 'warning',
						details: {
							...command.context,
							email: command.email,
							setupLinkId: setupResult.link.id,
							error: redactProviderError(delivery.error)
						}
					});
				} catch {
					return { status: 'email_sent_audit_failed' };
				}
				return { status: 'email_sent_recording_failed' };
			}
			try {
				await deps.audit({
					action: delivery.status === 'sent' ? auditActions.sent : auditActions.failed,
					resourceType: 'access_request',
					resourceId: command.accessRequestId,
					details: {
						...command.context,
						email: command.email,
						setupLinkId: setupResult.link.id,
						outboxId: delivery.outbox.id,
						...(delivery.status === 'sent' ? { expiresAt: setupResult.expiresAt.toISOString() } : {})
					},
					severity: delivery.status === 'sent' ? 'info' : 'warning'
				});
			} catch (error) {
				if (delivery.status === 'sent') return { status: 'email_sent_audit_failed' };
				throw error;
			}
			return delivery.status === 'sent' ? { status: 'sent' } : { status: 'delivery_failed' };
		}
	};
}
