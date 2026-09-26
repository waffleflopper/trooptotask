import { createAccountSetupLinkService, type AccountSetupLinkStore } from './accountSetupLinks.server';
import { PASSWORD_PROVIDER_REJECTION_MESSAGE } from './passwordPolicy';

export class AccountSetupPasswordRejectedError extends Error {}
export class AccountSetupIdentityMismatchError extends Error {}

export type AccountSetupCompletionInvalidStatus =
	| 'missing'
	| 'expired'
	| 'revoked'
	| 'replaced'
	| 'used'
	| 'claimed'
	| 'claim-in-progress'
	| 'failed'
	| 'access-request-not-approved';

export type AccountSetupClaimReconciliation =
	| { state: 'clear' }
	| { state: 'fenced'; sourceLinkId: string; sourceAccessRequestId: string }
	| { state: 'committed'; sourceLinkId: string; sourceAccessRequestId: string; userId: string }
	| { state: 'support-required' };

export interface AccountSetupCompletionStore extends AccountSetupLinkStore {
	readAttemptId(setupLinkId: string): Promise<string | null>;
	reconcileClaim(input: { setupLinkId: string; accessRequestId: string }): Promise<AccountSetupClaimReconciliation>;
	completeRecovery(input: {
		sourceLinkId: string;
		targetLinkId: string;
		targetAccessRequestId: string;
		firstName: string | null;
		lastName: string | null;
	}): Promise<{ state: 'completed'; userId: string } | { state: 'support-required' }>;
}

export interface AccountSetupAuthAdapter {
	createOrActivateConfirmedUser(input: {
		email: string;
		password: string;
		attemptId: string;
	}): Promise<{ userId: string }>;
	signInWithPassword(input: { email: string; password: string }): Promise<void>;
}

export type AccountSetupCompletionResult =
	| { status: 'completed'; accessRequestId: string; userId: string }
	| { status: 'recovered'; userId: string }
	| { status: 'recovery-available' }
	| { status: 'retry-password' }
	| { status: 'fresh-link-required' }
	| { status: AccountSetupCompletionInvalidStatus }
	| { status: 'access-request-missing' }
	| { status: 'access-request-completed' }
	| { status: 'account-create-failed'; message: string }
	| { status: 'setup-support-required' }
	| { status: 'setup-finalization-failed'; message: string }
	| { status: 'sign-in-failed'; message: string };

const SETUP_FINALIZATION_FAILED_MESSAGE =
	'Your password step finished, but account setup could not finish. Check setup status to retry safely.';

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function resolveProfileName(accessRequest: {
	firstName?: string | null;
	lastName?: string | null;
	name?: string | null;
}): { firstName: string; lastName: string } | null {
	const firstName = accessRequest.firstName?.trim();
	const lastName = accessRequest.lastName?.trim();
	if (firstName && lastName) return { firstName, lastName };
	const parts = (accessRequest.name ?? '').trim().split(/\s+/).filter(Boolean);
	return parts.length < 2 ? null : { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

async function markClaimFailedSafely(
	setupLinks: ReturnType<typeof createAccountSetupLinkService>,
	linkId: string,
	failureReason: Parameters<ReturnType<typeof createAccountSetupLinkService>['markClaimFailed']>[1]
): Promise<boolean> {
	try {
		return (await setupLinks.markClaimFailed(linkId, failureReason)).status === 'failed';
	} catch {
		return false;
	}
}

export function createAccountSetupCompletionService(store: AccountSetupCompletionStore, auth: AccountSetupAuthAdapter) {
	const setupLinks = createAccountSetupLinkService(store);

	async function finishCommitted(
		claim: Extract<AccountSetupClaimReconciliation, { state: 'committed' }>,
		target: { setupLinkId: string; accessRequestId: string },
		password?: string
	): Promise<AccountSetupCompletionResult> {
		try {
			const source = await store.getAccessRequest(claim.sourceAccessRequestId);
			if (!source?.email || source.status !== 'approved') return { status: 'setup-support-required' };
			const name = resolveProfileName(source);
			const result = await store.completeRecovery({
				sourceLinkId: claim.sourceLinkId,
				targetLinkId: target.setupLinkId,
				targetAccessRequestId: target.accessRequestId,
				firstName: name?.firstName ?? null,
				lastName: name?.lastName ?? null
			});
			if (result.state !== 'completed' || result.userId !== claim.userId) {
				return { status: 'setup-support-required' };
			}
			if (!password) return { status: 'recovered', userId: claim.userId };
			try {
				await auth.signInWithPassword({ email: normalizeEmail(source.email), password });
			} catch {
				return {
					status: 'sign-in-failed',
					message: 'Setup finished. Sign in with the password you chose earlier, or reset it if needed.'
				};
			}
			return { status: 'completed', accessRequestId: claim.sourceAccessRequestId, userId: claim.userId };
		} catch {
			return { status: 'setup-finalization-failed', message: SETUP_FINALIZATION_FAILED_MESSAGE };
		}
	}

	async function validateRecoveryTarget(input: { setupLinkId: string; accessRequestId: string }) {
		const link = await store.getSetupLink(input.setupLinkId);
		if (!link || link.accessRequestId !== input.accessRequestId) return { status: 'missing' } as const;
		if (link.usedAt) return { status: 'used' } as const;
		if (link.failedAt) return { status: 'failed' } as const;
		if (link.revokedAt) return { status: link.revocationReason === 'replaced' ? 'replaced' : 'revoked' } as const;
		if (link.expiresAt <= new Date()) return { status: 'expired' } as const;
		const request = await store.getAccessRequest(input.accessRequestId);
		if (!request?.email) return { status: 'access-request-missing' } as const;
		if (request.status !== 'approved') return { status: 'access-request-not-approved' } as const;
		if (request.setupCompletedAt && !link.claimedAt) return { status: 'access-request-completed' } as const;
		return null;
	}

	return {
		async recoverSetupSession(input: {
			setupLinkId: string;
			accessRequestId: string;
		}): Promise<AccountSetupCompletionResult> {
			const invalid = await validateRecoveryTarget(input);
			if (invalid) return invalid;
			let reconciliation: AccountSetupClaimReconciliation;
			try {
				reconciliation = await store.reconcileClaim(input);
			} catch {
				return { status: 'setup-support-required' };
			}
			if (reconciliation.state === 'committed') return finishCommitted(reconciliation, input);
			if (reconciliation.state === 'support-required') return { status: 'setup-support-required' };
			if (reconciliation.state === 'fenced' && reconciliation.sourceLinkId === input.setupLinkId) {
				return { status: 'fresh-link-required' };
			}
			return { status: 'retry-password' };
		},

		async completeSetupSession(input: {
			setupLinkId: string;
			accessRequestId: string;
			password: string;
		}): Promise<AccountSetupCompletionResult> {
			const claim = await store.claimSetupLinkForSession({
				setupLinkId: input.setupLinkId,
				accessRequestId: input.accessRequestId,
				claimedAt: new Date()
			});
			if (claim.status === 'completed') return { status: 'used' };
			if (claim.status === 'claimed' || claim.status === 'claim-in-progress') {
				return { status: 'recovery-available' };
			}
			if (claim.status !== 'claim-started') return { status: claim.status };

			let request: Awaited<ReturnType<AccountSetupCompletionStore['getAccessRequest']>>;
			try {
				request = await store.getAccessRequest(claim.accessRequestId);
			} catch {
				return { status: 'setup-support-required' };
			}
			if (!request?.email) {
				const released = await markClaimFailedSafely(setupLinks, claim.link.id, 'access-request-missing');
				return { status: released ? 'access-request-missing' : 'setup-support-required' };
			}
			if (request.setupCompletedAt || request.status !== 'approved') {
				const reason = request.setupCompletedAt ? 'access-request-completed' : 'access-request-not-approved';
				const released = await markClaimFailedSafely(setupLinks, claim.link.id, reason);
				return { status: released ? reason : 'setup-support-required' };
			}

			let attemptId: string | null;
			try {
				attemptId = await store.readAttemptId(claim.link.id);
			} catch {
				return { status: 'setup-support-required' };
			}
			if (!attemptId) return { status: 'setup-support-required' };

			let providerRejected = false;
			let providerIdentityMismatch = false;
			let providerSucceeded = false;
			try {
				await auth.createOrActivateConfirmedUser({
					email: normalizeEmail(request.email),
					password: input.password,
					attemptId
				});
				providerSucceeded = true;
			} catch (error) {
				providerRejected = error instanceof AccountSetupPasswordRejectedError;
				providerIdentityMismatch = error instanceof AccountSetupIdentityMismatchError;
			}

			let reconciliation: AccountSetupClaimReconciliation;
			try {
				reconciliation = await store.reconcileClaim(input);
			} catch {
				return { status: 'setup-support-required' };
			}
			if (reconciliation.state === 'committed') return finishCommitted(reconciliation, input, input.password);
			if (reconciliation.state !== 'fenced') return { status: 'setup-support-required' };
			if (providerSucceeded) return { status: 'setup-support-required' };
			if (providerIdentityMismatch) return { status: 'setup-support-required' };
			if (providerRejected) return { status: 'account-create-failed', message: PASSWORD_PROVIDER_REJECTION_MESSAGE };
			return { status: 'fresh-link-required' };
		}
	};
}
