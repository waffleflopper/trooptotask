import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'access-requests',
	fn: async (ctx, event) => {
		const supabase = event.locals.supabase;

		const { data: requests, error: fetchError } = await supabase
			.from('access_requests')
			.select('*, registration_invites(code, used_by, expires_at)')
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

			const redirectTo = `${event.url.origin}/auth/accept-invite`;
			const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
				accessRequest.email,
				{ redirectTo }
			);

			if (inviteError) {
				console.error('Supabase invite error:', inviteError.message, inviteError);
				if (
					inviteError.message?.includes('already been registered') ||
					inviteError.message?.includes('already exists')
				) {
					return fail(400, {
						error: 'This email is already registered. The user may need to log in or reset their password.'
					});
				}
				return fail(500, { error: 'Failed to send invite. Please try again.' });
			}

			const { data: invite, error: auditErr } = await supabase
				.from('registration_invites')
				.insert({
					code: `supabase-invite-${Date.now()}`,
					email: accessRequest.email,
					created_by: ctx.adminUser.id,
					used_by: inviteData.user?.id ?? null,
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

			await supabase.rpc('log_admin_action', {
				p_target_user_id: ctx.adminUser.id,
				p_action: 'approve_access_request',
				p_details: { request_id: requestId, email: accessRequest.email }
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

			await supabase.rpc('log_admin_action', {
				p_target_user_id: ctx.adminUser.id,
				p_action: 'reject_access_request',
				p_details: { request_id: requestId }
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
				.select('*, registration_invites(code, used_by, expires_at)')
				.eq('id', requestId)
				.eq('status', 'approved')
				.single();

			if (fetchErr || !accessRequest) {
				return fail(404, { error: 'Approved request not found' });
			}

			const redirectTo = `${event.url.origin}/auth/accept-invite`;
			const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(accessRequest.email, {
				redirectTo
			});

			if (inviteError) {
				if (
					inviteError.message?.includes('already been registered') ||
					inviteError.message?.includes('already exists')
				) {
					return fail(400, {
						error: 'This user has already completed registration. They may need to log in or reset their password.'
					});
				}
				return fail(500, { error: 'Failed to resend invite. Please try again.' });
			}

			return { success: true, action: 'resend' };
		}
	})
};
