import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { rejectAccessRequestAndBlockLinkedInvitations } from './accessRequestRejection.server';
import type {
	AccessRequestAuthEmailOutbox,
	AccessRequestSetupLink,
	IdentityPlatformAccessRequestStore,
	IdentitySupportAccessRequestRow,
	IdentitySupportAccessRequestCommandRow
} from './contracts';

const REQUEST_COLUMNS =
	'id, name, email, reason, heard_about, heard_about_details, status, created_at, reviewed_at, reviewed_by, setup_completed_at';
const LINK_COLUMNS =
	'access_request_id, id, created_at, expires_at, claimed_at, failed_at, failure_reason, used_at, revoked_at, revocation_reason';
const DELIVERY_COLUMNS =
	'access_request_id, id, setup_link_id, status, attempt_count, last_error, created_at, updated_at, sent_at';

type RequestRow = Omit<IdentitySupportAccessRequestRow, 'account_setup_links' | 'auth_email_outbox'>;
type LinkRow = AccessRequestSetupLink & { access_request_id: string };
type DeliveryRow = AccessRequestAuthEmailOutbox & { access_request_id: string };

/** Identity's source reads/effects; caller policy and Organization origin projection stay outside. */
export function createIdentityPlatformAccessRequestStore(client: SupabaseClient): IdentityPlatformAccessRequestStore {
	async function findRequest(accessRequestId: string, status: 'pending' | 'approved') {
		const { data, error } = await client
			.from('access_requests')
			.select('id, email, status, setup_completed_at')
			.eq('id', accessRequestId)
			.eq('status', status)
			.maybeSingle();
		if (error) throw new Error('Unable to read Access Request');
		if (!data) return null;
		if (
			typeof data.id !== 'string' ||
			data.id.toLowerCase() !== accessRequestId.toLowerCase() ||
			data.status !== status
		)
			throw new Error('Access Request identity could not be verified');
		return data as IdentitySupportAccessRequestCommandRow;
	}

	return {
		async listAccessRequests() {
			const { data, error } = await selectAllSupabaseRows<RequestRow>(async (from, to) => {
				const result = await client
					.from('access_requests')
					.select(REQUEST_COLUMNS)
					.order('created_at', { ascending: false })
					.order('id', { ascending: false })
					.range(from, to);
				if (!result.error && !Array.isArray(result.data)) throw new Error('Unable to read Access Requests');
				return result;
			});
			if (error || !data) throw new Error('Unable to read Access Requests');
			const requests: IdentitySupportAccessRequestRow[] = data.map((request) => ({
				...request,
				account_setup_links: [],
				auth_email_outbox: []
			}));
			const byId = new Map(requests.map((request) => [request.id, request]));
			const ids = [...byId.keys()];
			// Independent, complete child pagination avoids the provider's nested-row cap.
			// Bounded ID batches also keep the filter URL small for large review histories.
			for (let offset = 0; offset < ids.length; offset += 200) {
				const batch = ids.slice(offset, offset + 200);
				const [links, deliveries] = await Promise.all([
					selectAllSupabaseRows<LinkRow>(async (from, to) => {
						const result = await client
							.from('account_setup_links')
							.select(LINK_COLUMNS)
							.in('access_request_id', batch)
							.order('created_at', { ascending: false })
							.order('id', { ascending: false })
							.range(from, to);
						if (!result.error && !Array.isArray(result.data)) throw new Error('Unable to read setup links');
						return result;
					}),
					selectAllSupabaseRows<DeliveryRow>(async (from, to) => {
						const result = await client
							.from('auth_email_outbox')
							.select(DELIVERY_COLUMNS)
							.in('access_request_id', batch)
							.order('created_at', { ascending: false })
							.order('id', { ascending: false })
							.range(from, to);
						if (!result.error && !Array.isArray(result.data)) throw new Error('Unable to read setup deliveries');
						return result;
					})
				]);
				if (links.error || deliveries.error) throw new Error('Unable to read Access Request setup state');
				for (const { access_request_id: requestId, ...link } of links.data ?? []) {
					const request = byId.get(requestId);
					if (!request || !batch.includes(requestId)) throw new Error('Unexpected setup link request');
					(request.account_setup_links as AccessRequestSetupLink[]).push(link);
				}
				for (const { access_request_id: requestId, ...delivery } of deliveries.data ?? []) {
					const request = byId.get(requestId);
					if (!request || !batch.includes(requestId)) throw new Error('Unexpected setup delivery request');
					(request.auth_email_outbox as AccessRequestAuthEmailOutbox[]).push(delivery);
				}
			}
			return requests;
		},
		getPendingAccessRequestForApproval: (id) => findRequest(id, 'pending'),
		getApprovedAccessRequestForResend: (id) => findRequest(id, 'approved'),
		async markPendingRequestApproved(input) {
			const { data, error } = await client
				.from('access_requests')
				.update({
					status: 'approved',
					reviewed_by: input.reviewerId,
					reviewed_at: input.reviewedAt.toISOString()
				})
				.eq('id', input.accessRequestId)
				.eq('status', 'pending')
				.select('id')
				.maybeSingle();
			if (error) throw new Error('Access Request approval could not be confirmed');
			if (!data) return 'not_found';
			if (typeof data.id !== 'string' || data.id.toLowerCase() !== input.accessRequestId.toLowerCase())
				throw new Error('Access Request approval could not be confirmed');
			return 'approved';
		},
		rejectPendingAccessRequestAndBlockLinkedInvitations: (input) =>
			rejectAccessRequestAndBlockLinkedInvitations(client, {
				accessRequestId: input.accessRequestId,
				reviewerId: input.actorUserId
			})
	};
}
