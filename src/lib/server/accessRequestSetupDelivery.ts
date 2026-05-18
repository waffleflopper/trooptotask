import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createAccountSetupLinkService,
	createSupabaseAccountSetupLinkStore,
	sendAccountSetupLinkEmail,
	type AccountSetupLinkStore,
	type CreateAccountSetupLinkResult
} from './accountSetupLinks';

export const ACCESS_REQUEST_SETUP_RENEWAL_DAYS = 90;

export interface AccessRequestSetupRequest {
	id: string;
	email: string;
	status: 'pending' | 'approved' | 'rejected';
	createdAt: Date;
	reviewedAt: Date | null;
	setupCompletedAt: Date | null;
}

export interface CreatePendingAccessRequestInput {
	email: string;
	name: string;
	reason: string | null;
}

export interface AccessRequestSetupDeliveryStore extends AccountSetupLinkStore {
	listAccessRequestsByEmail(email: string): Promise<AccessRequestSetupRequest[]>;
	insertPendingAccessRequest(input: CreatePendingAccessRequestInput): Promise<void>;
}

export type AccessRequestSubmissionResult =
	| { status: 'pending-created' }
	| { status: 'already-pending' }
	| { status: 'fresh-setup-sent'; accessRequestId: string }
	| { status: 'no-public-action' };

export type AccessRequestRenewalResult =
	| { status: 'fresh-setup-sent'; accessRequestId: string }
	| { status: 'no-public-action' };

interface AccessRequestSetupDeliveryOptions {
	now?: () => Date;
}

interface SendSetupEmailInput {
	email: string;
	setupUrl: string;
	expiresAt: Date;
}

type SetupEmailSender = (input: SendSetupEmailInput) => Promise<void>;

interface AccessRequestRow {
	id: string;
	email: string;
	status: 'pending' | 'approved' | 'rejected';
	created_at: string;
	reviewed_at: string | null;
	setup_completed_at: string | null;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

function mapAccessRequest(row: AccessRequestRow): AccessRequestSetupRequest {
	return {
		id: row.id,
		email: row.email,
		status: row.status,
		createdAt: new Date(row.created_at),
		reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
		setupCompletedAt: row.setup_completed_at ? new Date(row.setup_completed_at) : null
	};
}

function makeSetupUrl(origin: string, setupPath: string): string {
	return new URL(setupPath, origin).toString();
}

function latestFirst(a: AccessRequestSetupRequest, b: AccessRequestSetupRequest): number {
	return b.createdAt.getTime() - a.createdAt.getTime();
}

function isApprovedIncompleteRenewable(request: AccessRequestSetupRequest, now: Date): boolean {
	if (request.status !== 'approved' || request.setupCompletedAt) {
		return false;
	}

	const renewalStartedAt = request.reviewedAt ?? request.createdAt;
	return now < addDays(renewalStartedAt, ACCESS_REQUEST_SETUP_RENEWAL_DAYS);
}

function assertCreated(
	result: CreateAccountSetupLinkResult
): Extract<CreateAccountSetupLinkResult, { status: 'created' }> {
	if (result.status !== 'created') {
		throw new Error(`Could not create account setup link: ${result.status}`);
	}

	return result;
}

export function createAccessRequestSetupDeliveryService(
	store: AccessRequestSetupDeliveryStore,
	sendSetupEmail: SetupEmailSender,
	options: AccessRequestSetupDeliveryOptions = {}
) {
	const now = options.now ?? (() => new Date());
	const setupLinks = createAccountSetupLinkService(store, { now });

	async function deliverFreshSetupLink(
		request: AccessRequestSetupRequest,
		origin: string
	): Promise<AccessRequestRenewalResult> {
		if (!isApprovedIncompleteRenewable(request, now())) {
			return { status: 'no-public-action' };
		}

		const setupResult = assertCreated(await setupLinks.createForAccessRequest(request.id));
		await sendSetupEmail({
			email: normalizeEmail(request.email),
			setupUrl: makeSetupUrl(origin, setupResult.setupPath),
			expiresAt: setupResult.expiresAt
		});

		return {
			status: 'fresh-setup-sent',
			accessRequestId: request.id
		};
	}

	return {
		async submitAccessRequest(input: {
			email: string;
			name: string;
			reason: string | null;
			origin: string;
		}): Promise<AccessRequestSubmissionResult> {
			const email = normalizeEmail(input.email);
			const existingRequests = (await store.listAccessRequestsByEmail(email)).sort(latestFirst);

			if (existingRequests.some((request) => request.status === 'pending')) {
				return { status: 'already-pending' };
			}

			const renewableRequest = existingRequests.find((request) => isApprovedIncompleteRenewable(request, now()));
			if (renewableRequest) {
				const delivered = await deliverFreshSetupLink(renewableRequest, input.origin);
				if (delivered.status === 'fresh-setup-sent') {
					return delivered;
				}
			}

			if (existingRequests.length > 0) {
				return { status: 'no-public-action' };
			}

			await store.insertPendingAccessRequest({
				email,
				name: input.name,
				reason: input.reason
			});

			return { status: 'pending-created' };
		},

		async requestFreshSetupLink(input: { email: string; origin: string }): Promise<AccessRequestRenewalResult> {
			const email = normalizeEmail(input.email);
			const existingRequests = (await store.listAccessRequestsByEmail(email)).sort(latestFirst);
			const renewableRequest = existingRequests.find((request) => isApprovedIncompleteRenewable(request, now()));

			if (!renewableRequest) {
				return { status: 'no-public-action' };
			}

			return deliverFreshSetupLink(renewableRequest, input.origin);
		}
	};
}

export function createSupabaseAccessRequestSetupDeliveryStore(client: SupabaseClient): AccessRequestSetupDeliveryStore {
	const setupLinkStore = createSupabaseAccountSetupLinkStore(client);

	return {
		...setupLinkStore,

		async listAccessRequestsByEmail(email) {
			const { data, error } = await client
				.from('access_requests')
				.select('id, email, status, created_at, reviewed_at, setup_completed_at')
				.ilike('email', normalizeEmail(email));

			if (error) {
				throw error;
			}

			return ((data ?? []) as AccessRequestRow[]).map(mapAccessRequest);
		},

		async insertPendingAccessRequest(input) {
			const { error } = await client.from('access_requests').insert({
				email: normalizeEmail(input.email),
				name: input.name,
				reason: input.reason
			});

			if (error) {
				throw error;
			}
		}
	};
}

export function createSupabaseAccessRequestSetupDeliveryService(client: SupabaseClient) {
	return createAccessRequestSetupDeliveryService(
		createSupabaseAccessRequestSetupDeliveryStore(client),
		sendAccountSetupLinkEmail
	);
}
