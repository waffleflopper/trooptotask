import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAccessRequestHeardAboutLabel } from '$lib/accessRequests';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import {
	createAccountSetupLinkService,
	createSupabaseAccountSetupLinkStore,
	sendAccountSetupLinkEmail,
	type CreateAccountSetupLinkResult
} from '$lib/server/accountSetupLinks';

interface AccessRequestSetupLink {
	id: string;
	created_at: string;
	expires_at: string;
	used_at: string | null;
	revoked_at: string | null;
}

interface AccessRequestRow {
	id: string;
	name: string;
	email: string;
	reason: string | null;
	heard_about: string | null;
	heard_about_details: string | null;
	status: 'pending' | 'approved' | 'rejected';
	created_at: string;
	reviewed_at: string | null;
	setup_completed_at: string | null;
	account_setup_links: AccessRequestSetupLink | AccessRequestSetupLink[] | null;
}

interface AccessRequestItem {
	id: string;
	name: string;
	email: string;
	reason: string | null;
	heard_about: string | null;
	heard_about_label: string | null;
	heard_about_details: string | null;
	status: 'pending' | 'approved' | 'rejected';
	created_at: string;
	reviewed_at: string | null;
	setup_completed_at: string | null;
	setup_state: AccessRequestSetupState;
	setup_state_label: string;
	setup_state_detail: string;
	setup_completed_at_display: string | null;
	setup_link_expires_at: string | null;
	setup_link_replaced_at: string | null;
	has_replaced_setup_link: boolean;
}

type AccessRequestSetupState = 'not_sent' | 'pending' | 'expired' | 'replaced' | 'completed';

function normalizeSetupLinks(links: AccessRequestRow['account_setup_links']): AccessRequestSetupLink[] {
	if (!links) return [];
	const normalized = Array.isArray(links) ? links : [links];
	return normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function resolveSetupState(
	request: AccessRequestRow,
	now: Date
): Omit<
	AccessRequestItem,
	| 'id'
	| 'name'
	| 'email'
	| 'reason'
	| 'heard_about'
	| 'heard_about_label'
	| 'heard_about_details'
	| 'status'
	| 'created_at'
	| 'reviewed_at'
	| 'setup_completed_at'
> {
	const links = normalizeSetupLinks(request.account_setup_links);
	const latestLink = links[0] ?? null;
	const hasReplacedSetupLink = links.some((link) => link.revoked_at && !link.used_at);

	if (request.setup_completed_at || latestLink?.used_at) {
		const completedAt = request.setup_completed_at ?? latestLink?.used_at ?? null;
		return {
			setup_state: 'completed',
			setup_state_label: 'Completed',
			setup_state_detail: 'Account setup is complete. The user should sign in or reset their password if needed.',
			setup_completed_at_display: completedAt,
			setup_link_expires_at: latestLink?.expires_at ?? null,
			setup_link_replaced_at: null,
			has_replaced_setup_link: hasReplacedSetupLink
		};
	}

	if (!latestLink) {
		return {
			setup_state: 'not_sent',
			setup_state_label: 'Not sent',
			setup_state_detail: 'No account setup link has been sent yet.',
			setup_completed_at_display: null,
			setup_link_expires_at: null,
			setup_link_replaced_at: null,
			has_replaced_setup_link: false
		};
	}

	if (latestLink.revoked_at) {
		return {
			setup_state: 'replaced',
			setup_state_label: 'Replaced',
			setup_state_detail:
				'The latest known setup link was revoked or replaced. Send a fresh setup link if setup is still needed.',
			setup_completed_at_display: null,
			setup_link_expires_at: latestLink.expires_at,
			setup_link_replaced_at: latestLink.revoked_at,
			has_replaced_setup_link: true
		};
	}

	if (new Date(latestLink.expires_at) <= now) {
		return {
			setup_state: 'expired',
			setup_state_label: 'Expired',
			setup_state_detail: 'The current setup link has expired. Resend setup to deliver a fresh link.',
			setup_completed_at_display: null,
			setup_link_expires_at: latestLink.expires_at,
			setup_link_replaced_at: null,
			has_replaced_setup_link: hasReplacedSetupLink
		};
	}

	return {
		setup_state: 'pending',
		setup_state_label: 'Pending',
		setup_state_detail: 'A setup link is active and waiting for the recipient to finish account setup.',
		setup_completed_at_display: null,
		setup_link_expires_at: latestLink.expires_at,
		setup_link_replaced_at: null,
		has_replaced_setup_link: hasReplacedSetupLink
	};
}

function getAccountSetupOrigin(origin: string): string {
	const url = new URL(origin);
	if (url.hostname === 'admin.trooptotask.org') {
		return 'https://trooptotask.org';
	}
	return origin;
}

function makeSetupUrl(origin: string, setupPath: string): string {
	return new URL(setupPath, getAccountSetupOrigin(origin)).toString();
}

function mapSetupLinkResultToFailure(result: CreateAccountSetupLinkResult) {
	switch (result.status) {
		case 'access-request-missing':
			return fail(404, { error: 'Access request not found' });
		case 'access-request-not-approved':
			return fail(400, { error: 'Access request must be approved before setup can be sent.' });
		case 'access-request-completed':
			return fail(400, {
				error: 'This user has already completed account setup. They can sign in or use reset password if needed.'
			});
		case 'created':
			return null;
	}
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'access-requests',
	fn: async (ctx) => {
		const supabase = ctx.adminClient;

		const { data: requests, error: fetchError } = await selectAllSupabaseRows<AccessRequestRow>(
			(from, to) =>
				supabase
					.from('access_requests')
					.select(
						'id, name, email, reason, heard_about, heard_about_details, status, created_at, reviewed_at, setup_completed_at, account_setup_links(id, created_at, expires_at, used_at, revoked_at)'
					)
					.order('created_at', { ascending: false })
					.range(from, to) as unknown as Promise<{
					data: AccessRequestRow[] | null;
					error: unknown;
				}>
		);

		if (fetchError) {
			console.error('Failed to fetch access requests:', fetchError);
		}

		const now = new Date();
		const allRequests: AccessRequestItem[] = (requests ?? []).map((request) => ({
			id: request.id,
			name: request.name,
			email: request.email,
			reason: request.reason,
			heard_about: request.heard_about,
			heard_about_label: getAccessRequestHeardAboutLabel(request.heard_about),
			heard_about_details: request.heard_about_details,
			status: request.status,
			created_at: request.created_at,
			reviewed_at: request.reviewed_at,
			setup_completed_at: request.setup_completed_at,
			...resolveSetupState(request, now)
		}));

		return {
			pending: allRequests.filter((r) => r.status === 'pending'),
			reviewed: allRequests.filter((r) => r.status !== 'pending')
		};
	}
});

export const actions: Actions = {
	approve: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;

			const formData = await event.request.formData();
			const requestId = formData.get('requestId') as string;

			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const { data: accessRequest, error: fetchErr } = await adminClient
				.from('access_requests')
				.select('*')
				.eq('id', requestId)
				.eq('status', 'pending')
				.single();

			if (fetchErr || !accessRequest) {
				return fail(404, { error: 'Request not found or already reviewed' });
			}

			const { error: updateErr } = await adminClient
				.from('access_requests')
				.update({
					status: 'approved',
					reviewed_by: ctx.adminUser.id,
					reviewed_at: new Date().toISOString()
				})
				.eq('id', requestId);

			if (updateErr) {
				console.error('Failed to update access request:', updateErr);
				return fail(500, { error: 'Failed to approve request' });
			}

			const setupLinks = createAccountSetupLinkService(createSupabaseAccountSetupLinkStore(adminClient));
			const setupResult = await setupLinks.createForAccessRequest(requestId);
			if (setupResult.status !== 'created') {
				return mapSetupLinkResultToFailure(setupResult);
			}

			try {
				await sendAccountSetupLinkEmail({
					email: accessRequest.email,
					setupUrl: makeSetupUrl(event.url.origin, setupResult.setupPath),
					expiresAt: setupResult.expiresAt
				});
			} catch (setupEmailError) {
				console.error('Account setup email error:', setupEmailError);
				return fail(500, { error: 'Failed to send account setup email. Please try again.' });
			}

			ctx.audit({
				action: 'access_request.approved',
				resourceType: 'access_request',
				resourceId: requestId,
				details: { email: accessRequest.email }
			});
			ctx.audit({
				action: 'access_request.account_setup_link_sent',
				resourceType: 'access_request',
				resourceId: requestId,
				details: {
					email: accessRequest.email,
					setupLinkId: setupResult.link.id,
					expiresAt: setupResult.expiresAt.toISOString()
				},
				severity: 'info'
			});

			return { success: true, action: 'approve' };
		}
	}),

	reject: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const supabase = ctx.adminClient;

			const formData = await event.request.formData();
			const requestId = formData.get('requestId') as string;

			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const { error: updateErr } = await supabase
				.from('access_requests')
				.update({
					status: 'rejected',
					reviewed_by: ctx.adminUser.id,
					reviewed_at: new Date().toISOString()
				})
				.eq('id', requestId)
				.eq('status', 'pending');

			if (updateErr) {
				console.error('Failed to reject access request:', updateErr);
				return fail(500, { error: 'Failed to reject request' });
			}

			ctx.audit({
				action: 'access_request.rejected',
				resourceType: 'access_request',
				resourceId: requestId
			});

			return { success: true, action: 'reject' };
		}
	}),

	resend: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;

			const formData = await event.request.formData();
			const requestId = formData.get('requestId') as string;

			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const { data: accessRequest, error: fetchErr } = await adminClient
				.from('access_requests')
				.select('id, email, status, setup_completed_at')
				.eq('id', requestId)
				.eq('status', 'approved')
				.single();

			if (fetchErr || !accessRequest) {
				return fail(404, { error: 'Approved request not found' });
			}

			if (accessRequest.setup_completed_at) {
				return fail(400, {
					error: 'This user has already completed account setup. They can sign in or use reset password if needed.'
				});
			}

			const setupLinks = createAccountSetupLinkService(createSupabaseAccountSetupLinkStore(adminClient));
			const setupResult = await setupLinks.createForAccessRequest(requestId);
			if (setupResult.status !== 'created') {
				return mapSetupLinkResultToFailure(setupResult);
			}

			try {
				await sendAccountSetupLinkEmail({
					email: accessRequest.email,
					setupUrl: makeSetupUrl(event.url.origin, setupResult.setupPath),
					expiresAt: setupResult.expiresAt
				});
			} catch {
				return fail(500, { error: 'Failed to resend account setup email. Please try again.' });
			}

			ctx.audit({
				action: 'access_request.account_setup_link_resent',
				resourceType: 'access_request',
				resourceId: requestId,
				details: {
					email: accessRequest.email,
					setupLinkId: setupResult.link.id,
					expiresAt: setupResult.expiresAt.toISOString()
				},
				severity: 'info'
			});

			return { success: true, action: 'resend' };
		}
	})
};
