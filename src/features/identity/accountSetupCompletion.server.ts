import { createAccountSetupLinkService, type AccountSetupLinkStore } from './accountSetupLinks.server';
import { PASSWORD_PROVIDER_REJECTION_MESSAGE } from './passwordPolicy';

// Only the Auth adapter may produce this after receiving a structured provider
// rejection. General transport/client errors cannot prove that Auth did not write.
export class AccountSetupPasswordRejectedError extends Error {}

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

export interface AccountSetupCompletionStore extends AccountSetupLinkStore {
	markAccessRequestSetupCompleted(accessRequestId: string, userId: string, completedAt: Date): Promise<void>;
	upsertUserProfile(input: { userId: string; firstName: string; lastName: string }): Promise<void>;
}

export interface AccountSetupAuthAdapter {
	createOrActivateConfirmedUser(input: { email: string; password: string }): Promise<{ userId: string }>;
	signInWithPassword(input: { email: string; password: string }): Promise<void>;
}

export type AccountSetupCompletionResult =
	| { status: 'completed'; accessRequestId: string; userId: string }
	| { status: AccountSetupCompletionInvalidStatus }
	| { status: 'access-request-missing' }
	| { status: 'access-request-completed' }
	| { status: 'account-create-failed'; message: string }
	| { status: 'setup-support-required' }
	| { status: 'setup-finalization-failed'; message: string }
	| { status: 'sign-in-failed'; message: string };

const SETUP_FINALIZATION_FAILED_MESSAGE =
	'Account setup could not finish after the password step. Contact platform support before using another setup link.';

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
		return error.message;
	}
	return fallback;
}

function splitLegacyFullName(name: string | null | undefined): { firstName: string; lastName: string } | null {
	const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
	if (parts.length < 2) {
		return null;
	}

	return {
		firstName: parts[0],
		lastName: parts.slice(1).join(' ')
	};
}

function resolveProfileName(accessRequest: {
	firstName?: string | null;
	lastName?: string | null;
	name?: string | null;
}): { firstName: string; lastName: string } | null {
	const firstName = accessRequest.firstName?.trim();
	const lastName = accessRequest.lastName?.trim();
	if (firstName && lastName) {
		return { firstName, lastName };
	}

	return splitLegacyFullName(accessRequest.name);
}

async function markClaimFailedSafely(
	setupLinks: ReturnType<typeof createAccountSetupLinkService>,
	linkId: string,
	failureReason: Parameters<ReturnType<typeof createAccountSetupLinkService>['markClaimFailed']>[1]
): Promise<boolean> {
	try {
		return (await setupLinks.markClaimFailed(linkId, failureReason)).status === 'failed';
	} catch (error) {
		console.error('Failed to mark Account Setup Link failure state:', {
			setupLinkId: linkId,
			failureReason,
			error: errorMessage(error, 'Unknown setup failure persistence error')
		});
		return false;
	}
}

export function createAccountSetupCompletionService(store: AccountSetupCompletionStore, auth: AccountSetupAuthAdapter) {
	const setupLinks = createAccountSetupLinkService(store);

	async function finishClaim(input: {
		claim: { accessRequestId: string; link: { id: string } };
		password: string;
	}): Promise<AccountSetupCompletionResult> {
		let accessRequest: Awaited<ReturnType<AccountSetupCompletionStore['getAccessRequest']>>;
		try {
			accessRequest = await store.getAccessRequest(input.claim.accessRequestId);
		} catch {
			return { status: 'setup-support-required' };
		}
		if (!accessRequest?.email) {
			const released = await markClaimFailedSafely(setupLinks, input.claim.link.id, 'access-request-missing');
			return { status: released ? 'access-request-missing' : 'setup-support-required' };
		}

		if (accessRequest.setupCompletedAt) {
			const released = await markClaimFailedSafely(setupLinks, input.claim.link.id, 'access-request-completed');
			return { status: released ? 'access-request-completed' : 'setup-support-required' };
		}

		if (accessRequest.status !== 'approved') {
			const released = await markClaimFailedSafely(setupLinks, input.claim.link.id, 'access-request-not-approved');
			return { status: released ? 'access-request-not-approved' : 'setup-support-required' };
		}

		const email = normalizeEmail(accessRequest.email);
		let userId: string;
		try {
			const user = await auth.createOrActivateConfirmedUser({
				email,
				password: input.password
			});
			userId = user.userId;
		} catch (error) {
			if (error instanceof AccountSetupPasswordRejectedError) {
				const released = await markClaimFailedSafely(setupLinks, input.claim.link.id, 'account-create-failed');
				if (released) {
					return { status: 'account-create-failed', message: PASSWORD_PROVIDER_REJECTION_MESSAGE };
				}
			}
			return { status: 'setup-support-required' };
		}

		const completedAt = new Date();
		const profileName = resolveProfileName(accessRequest);
		if (profileName) {
			try {
				await store.upsertUserProfile({ userId, ...profileName });
			} catch {
				return {
					status: 'setup-finalization-failed',
					message: SETUP_FINALIZATION_FAILED_MESSAGE
				};
			}
		}

		try {
			await store.markAccessRequestSetupCompleted(input.claim.accessRequestId, userId, completedAt);
		} catch {
			return {
				status: 'setup-finalization-failed',
				message: SETUP_FINALIZATION_FAILED_MESSAGE
			};
		}

		let completed: Awaited<ReturnType<typeof setupLinks.markClaimCompleted>>;
		try {
			completed = await setupLinks.markClaimCompleted(input.claim.link.id);
		} catch {
			return {
				status: 'setup-finalization-failed',
				message: SETUP_FINALIZATION_FAILED_MESSAGE
			};
		}

		if (completed.status !== 'completed') {
			return {
				status: 'setup-finalization-failed',
				message: SETUP_FINALIZATION_FAILED_MESSAGE
			};
		}

		try {
			await auth.signInWithPassword({ email, password: input.password });
		} catch (error) {
			return {
				status: 'sign-in-failed',
				message: errorMessage(error, 'Your account was created, but sign-in did not finish. Please sign in manually.')
			};
		}

		return {
			status: 'completed',
			accessRequestId: input.claim.accessRequestId,
			userId
		};
	}

	return {
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
			if (claim.status !== 'claim-started') return { status: claim.status };

			return finishClaim({
				claim,
				password: input.password
			});
		}
	};
}
