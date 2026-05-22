import { createAccountSetupLinkService, type AccountSetupLinkStore } from './accountSetupLinks';

export type AccountSetupCompletionInvalidStatus =
	| 'missing'
	| 'expired'
	| 'revoked'
	| 'replaced'
	| 'used'
	| 'claimed'
	| 'failed';

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
	| { status: 'sign-in-failed'; message: string };

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
): Promise<void> {
	try {
		await setupLinks.markClaimFailed(linkId, failureReason);
	} catch (error) {
		console.error('Failed to mark Account Setup Link failure state:', {
			setupLinkId: linkId,
			failureReason,
			error: errorMessage(error, 'Unknown setup failure persistence error')
		});
	}
}

export function createAccountSetupCompletionService(store: AccountSetupCompletionStore, auth: AccountSetupAuthAdapter) {
	const setupLinks = createAccountSetupLinkService(store);

	return {
		async complete(input: { rawToken: string; password: string }): Promise<AccountSetupCompletionResult> {
			const claim = await setupLinks.claimToken(input.rawToken);
			if (claim.status === 'completed') {
				return { status: 'used' };
			}
			if (claim.status !== 'claim-started') {
				return { status: claim.status };
			}

			const accessRequest = await store.getAccessRequest(claim.accessRequestId);
			if (!accessRequest?.email) {
				await markClaimFailedSafely(setupLinks, claim.link.id, 'access-request-missing');
				return { status: 'access-request-missing' };
			}

			if (accessRequest.setupCompletedAt) {
				await markClaimFailedSafely(setupLinks, claim.link.id, 'access-request-completed');
				return { status: 'access-request-completed' };
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
				await markClaimFailedSafely(setupLinks, claim.link.id, 'account-create-failed');
				return {
					status: 'account-create-failed',
					message: errorMessage(error, 'Could not create your User Account. Please try again.')
				};
			}

			const completedAt = new Date();
			const profileName = resolveProfileName(accessRequest);
			try {
				if (profileName) {
					await store.upsertUserProfile({ userId, ...profileName });
				}
				await store.markAccessRequestSetupCompleted(claim.accessRequestId, userId, completedAt);
			} catch (error) {
				await markClaimFailedSafely(setupLinks, claim.link.id, 'completion-tracking-failed');
				throw error;
			}

			const completed = await setupLinks.markClaimCompleted(claim.link.id);
			if (completed.status !== 'completed') {
				return { status: completed.status };
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
				accessRequestId: claim.accessRequestId,
				userId
			};
		}
	};
}
