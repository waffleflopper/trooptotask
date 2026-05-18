import { createAccountSetupLinkService, type AccountSetupLinkStore } from './accountSetupLinks';

export type AccountSetupCompletionInvalidStatus = 'missing' | 'expired' | 'revoked' | 'used';

export interface AccountSetupCompletionStore extends AccountSetupLinkStore {
	markAccessRequestSetupCompleted(accessRequestId: string, userId: string, completedAt: Date): Promise<void>;
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

export function createAccountSetupCompletionService(store: AccountSetupCompletionStore, auth: AccountSetupAuthAdapter) {
	const setupLinks = createAccountSetupLinkService(store);

	return {
		async complete(input: { rawToken: string; password: string }): Promise<AccountSetupCompletionResult> {
			const validation = await setupLinks.validateToken(input.rawToken);
			if (validation.status !== 'valid') {
				return validation;
			}

			const accessRequest = await store.getAccessRequest(validation.accessRequestId);
			if (!accessRequest?.email) {
				return { status: 'access-request-missing' };
			}

			if (accessRequest.setupCompletedAt) {
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
				return {
					status: 'account-create-failed',
					message: errorMessage(error, 'Could not create your User Account. Please try again.')
				};
			}

			const completedAt = new Date();
			await store.markAccessRequestSetupCompleted(validation.accessRequestId, userId, completedAt);

			const consumed = await setupLinks.consumeToken(input.rawToken);
			if (consumed.status !== 'consumed') {
				return consumed;
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
				accessRequestId: validation.accessRequestId,
				userId
			};
		}
	};
}
