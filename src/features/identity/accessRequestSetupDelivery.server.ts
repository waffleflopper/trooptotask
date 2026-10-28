import { z } from 'zod';
import type { SupabaseClient } from '$lib/server/database';
import { addUtcDays } from './accountSetupDates';
import {
	createAccountSetupLinkIssuance,
	type AccountSetupLinkIssuance,
	type AccountSetupLinkIssuanceDependencies
} from './accountSetupLinkIssuance.server';
import { createSupabaseAccountSetupLinkIssuancePorts } from './accountSetupLinkIssuanceSupabase.server';
import { getAdminClient } from '$lib/server/supabase';
import { ACCESS_REQUEST_SETUP_RENEWAL_DAYS, type AccessRequestStatus } from './contracts';

export interface AccessRequestSetupRequest {
	id: string;
	email: string;
	status: AccessRequestStatus;
	createdAt: Date;
	reviewedAt: Date | null;
	setupCompletedAt: Date | null;
	setupGrantLive: boolean;
}

export interface CreatePendingAccessRequestInput {
	email: string;
	firstName: string;
	lastName: string;
	reason: string | null;
	heardAbout: string;
	heardAboutDetails: string | null;
}

export interface AccessRequestSetupDeliveryStore {
	listAccessRequestsByEmail(email: string): Promise<AccessRequestSetupRequest[]>;
	insertPendingAccessRequest(input: CreatePendingAccessRequestInput): Promise<void>;
}

export type AccessRequestSubmissionResult =
	| { status: 'pending-created' }
	| { status: 'already-pending' }
	| AccessRequestRenewalResult;

export type AccessRequestRenewalResult =
	| { status: 'fresh-setup-sent' }
	| { status: 'fresh-setup-delivery-failed' }
	| { status: 'no-public-action' };

interface AccessRequestSetupDeliveryOptions {
	now?: () => Date;
}

interface AccessRequestRow {
	id: string;
	email: string;
	status: string;
	created_at: string;
	reviewed_at: string | null;
	setup_completed_at: string | null;
	setup_grant_live: boolean;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function mapAccessRequest(row: AccessRequestRow): AccessRequestSetupRequest {
	return {
		id: row.id,
		email: row.email,
		status: z.enum(['pending', 'approved', 'rejected', 'rescinded']).parse(row.status),
		createdAt: new Date(row.created_at),
		reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
		setupCompletedAt: row.setup_completed_at ? new Date(row.setup_completed_at) : null,
		setupGrantLive: row.setup_grant_live
	};
}

function latestFirst(a: AccessRequestSetupRequest, b: AccessRequestSetupRequest): number {
	return b.createdAt.getTime() - a.createdAt.getTime();
}

function isApprovedIncompleteRenewable(request: AccessRequestSetupRequest, now: Date): boolean {
	if (request.status !== 'approved' || request.setupCompletedAt || !request.setupGrantLive) {
		return false;
	}

	const renewalStartedAt = request.reviewedAt ?? request.createdAt;
	return now <= addUtcDays(renewalStartedAt, ACCESS_REQUEST_SETUP_RENEWAL_DAYS);
}

function blocksFreshPendingRequest(request: AccessRequestSetupRequest): boolean {
	return (
		request.status === 'pending' ||
		request.status === 'rejected' ||
		(request.status === 'approved' && request.setupCompletedAt !== null)
	);
}

export function createAccessRequestSetupDeliveryService(
	store: AccessRequestSetupDeliveryStore,
	issuance: AccountSetupLinkIssuance,
	options: AccessRequestSetupDeliveryOptions = {}
) {
	const now = options.now ?? (() => new Date());

	async function deliverFreshSetupLink(
		request: AccessRequestSetupRequest,
		origin: string
	): Promise<AccessRequestRenewalResult> {
		if (!isApprovedIncompleteRenewable(request, now())) {
			return { status: 'no-public-action' };
		}

		const issued = await issuance.issue({
			accessRequestId: request.id,
			email: normalizeEmail(request.email),
			publicOrigin: origin,
			origin: 'public_renewal',
			deliveryErrorMode: 'throw'
		});
		if (issued.status === 'not_created') {
			return { status: 'no-public-action' };
		}

		return {
			status: issued.status === 'delivery_failed' ? 'fresh-setup-delivery-failed' : 'fresh-setup-sent'
		};
	}

	return {
		async submitAccessRequest(input: {
			email: string;
			firstName: string;
			lastName: string;
			reason: string | null;
			heardAbout: string;
			heardAboutDetails: string | null;
			origin: string;
		}): Promise<AccessRequestSubmissionResult> {
			const email = normalizeEmail(input.email);
			const existingRequests = (await store.listAccessRequestsByEmail(email)).sort(latestFirst);

			if (existingRequests.some((request) => request.status === 'pending')) {
				return { status: 'already-pending' };
			}

			const renewableRequest = existingRequests.find((request) => isApprovedIncompleteRenewable(request, now()));
			if (renewableRequest) {
				return deliverFreshSetupLink(renewableRequest, input.origin);
			}

			if (existingRequests.some(blocksFreshPendingRequest)) {
				return { status: 'no-public-action' };
			}

			await store.insertPendingAccessRequest({
				email,
				firstName: input.firstName,
				lastName: input.lastName,
				reason: input.reason,
				heardAbout: input.heardAbout,
				heardAboutDetails: input.heardAboutDetails
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
	return {
		async listAccessRequestsByEmail(email) {
			const { data, error } = await client
				.from('access_requests')
				.select('id, email, status, created_at, reviewed_at, setup_completed_at, setup_grant_live')
				.eq('email', normalizeEmail(email));

			if (error) {
				throw error;
			}

			return (data ?? []).map(mapAccessRequest);
		},

		async insertPendingAccessRequest(input) {
			const { error } = await client.from('access_requests').insert({
				email: normalizeEmail(input.email),
				name: `${input.firstName} ${input.lastName}`,
				first_name: input.firstName,
				last_name: input.lastName,
				reason: input.reason,
				heard_about: input.heardAbout,
				heard_about_details: input.heardAboutDetails
			});

			if (error) {
				throw error;
			}
		}
	};
}

export function createSupabaseAccessRequestSetupDeliveryService(
	client: SupabaseClient,
	audit: AccountSetupLinkIssuanceDependencies['audit']
) {
	return createAccessRequestSetupDeliveryService(
		createSupabaseAccessRequestSetupDeliveryStore(client),
		createAccountSetupLinkIssuance({ ...createSupabaseAccountSetupLinkIssuancePorts(client), audit })
	);
}

export function createPublicAccessRequestSetupDeliveryService(audit: AccountSetupLinkIssuanceDependencies['audit']) {
	return createSupabaseAccessRequestSetupDeliveryService(getAdminClient(), audit);
}
