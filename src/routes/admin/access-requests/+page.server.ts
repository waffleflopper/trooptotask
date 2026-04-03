import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { sendAccessRequestSetupEmail } from '$lib/server/accessRequestAuth';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'access-requests',
	fn: async (ctx, event) => {
		const supabase = event.locals.supabase;

		const { data: requests, error: fetchError } = await supabase
			.from('access_requests')
			.select('*, registration_invites(id, code, used_by, used_at, expires_at)')
			.order('created_at', { ascending: false });

		if (fetchError) {
			console.error('Failed to fetch access requests:', fetchError);
		}

		const allRequests = requests ?? [];

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
			const supabase = event.locals.supabase;

			const formData = await event.request.formData();
			const requestId = formData.get('requestId') as string;

			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const { data: accessRequest, error: fetchErr } = await supabase
				.from('access_requests')
				.select('*')
				.eq('id', requestId)
				.eq('status', 'pending')
				.single();

			if (fetchErr || !accessRequest) {
				return fail(404, { error: 'Request not found or already reviewed' });
			}

			try {
				await sendAccessRequestSetupEmail(adminClient, accessRequest.email, event.url.origin);
			} catch (inviteError) {
				console.error('Supabase invite error:', inviteError);
				return fail(500, { error: 'Failed to send invite. Please try again.' });
			}

			const { data: invite, error: auditErr } = await supabase
				.from('registration_invites')
				.insert({
					code: `supabase-invite-${Date.now()}`,
					email: accessRequest.email,
					created_by: ctx.adminUser.id,
					used_by: null,
					used_at: null,
					expires_at: null
				})
				.select()
				.single();

			if (auditErr) {
				console.error('Failed to create audit row:', auditErr);
			}

			const { error: updateErr } = await supabase
				.from('access_requests')
				.update({
					status: 'approved',
					reviewed_by: ctx.adminUser.id,
					reviewed_at: new Date().toISOString(),
					invite_id: invite?.id ?? null
				})
				.eq('id', requestId);

			if (updateErr) {
				console.error('Failed to update access request:', updateErr);
				return fail(500, { error: 'Failed to approve request' });
			}

			ctx.audit({
				action: 'access_request.approved',
				resourceType: 'access_request',
				resourceId: requestId,
				details: { email: accessRequest.email }
			});

			return { success: true, action: 'approve' };
		}
	}),

	reject: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const supabase = event.locals.supabase;

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
			const supabase = event.locals.supabase;

			const formData = await event.request.formData();
			const requestId = formData.get('requestId') as string;

			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const { data: accessRequest, error: fetchErr } = await supabase
				.from('access_requests')
				.select('*, registration_invites(id, code, used_by, used_at, expires_at)')
				.eq('id', requestId)
				.eq('status', 'approved')
				.single();

			if (fetchErr || !accessRequest) {
				return fail(404, { error: 'Approved request not found' });
			}

			if (accessRequest.registration_invites?.used_at) {
				return fail(400, {
					error: 'This user has already completed account setup. They can sign in or use reset password if needed.'
				});
			}

			try {
				await sendAccessRequestSetupEmail(adminClient, accessRequest.email, event.url.origin);
			} catch {
				return fail(500, { error: 'Failed to resend invite. Please try again.' });
			}

			return { success: true, action: 'resend' };
		}
	})
};
