import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAdminClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;

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
};

export const actions: Actions = {
	approve: async ({ request, locals, url }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const requestId = formData.get('requestId') as string;

		if (!requestId) return fail(400, { error: 'Missing request ID' });

		const supabase = locals.supabase;
		const adminClient = getAdminClient();

		// Get the access request
		const { data: accessRequest, error: fetchErr } = await supabase
			.from('access_requests')
			.select('*')
			.eq('id', requestId)
			.eq('status', 'pending')
			.single();

		if (fetchErr || !accessRequest) {
			return fail(404, { error: 'Request not found or already reviewed' });
		}

		// Send Supabase invite email (creates user in "invited" state)
		const redirectTo = `${url.origin}/auth/accept-invite`;
		const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
			accessRequest.email,
			{ redirectTo }
		);

		if (inviteError) {
			if (inviteError.message?.includes('already been registered') || inviteError.message?.includes('already exists')) {
				return fail(400, {
					error: 'This email is already registered. The user may need to log in or reset their password.'
				});
			}
			return fail(500, { error: 'Failed to send invite. Please try again.' });
		}

		// Create registration_invites audit row
		const { data: invite, error: auditErr } = await supabase
			.from('registration_invites')
			.insert({
				code: `supabase-invite-${Date.now()}`,
				email: accessRequest.email,
				created_by: user.id,
				used_by: inviteData.user?.id ?? null,
				expires_at: null
			})
			.select()
			.single();

		if (auditErr) {
			console.error('Failed to create audit row:', auditErr);
		}

		// Update access request
		const { error: updateErr } = await supabase
			.from('access_requests')
			.update({
				status: 'approved',
				reviewed_by: user.id,
				reviewed_at: new Date().toISOString(),
				invite_id: invite?.id ?? null
			})
			.eq('id', requestId);

		if (updateErr) {
			console.error('Failed to update access request:', updateErr);
			return fail(500, { error: 'Failed to approve request' });
		}

		// Log admin action
		await supabase.rpc('log_admin_action', {
			p_target_user_id: user.id,
			p_action: 'approve_access_request',
			p_details: { request_id: requestId, email: accessRequest.email }
		});

		return { success: true, action: 'approve' };
	},

	reject: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const requestId = formData.get('requestId') as string;

		if (!requestId) return fail(400, { error: 'Missing request ID' });

		const supabase = locals.supabase;

		const { error: updateErr } = await supabase
			.from('access_requests')
			.update({
				status: 'rejected',
				reviewed_by: user.id,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', requestId)
			.eq('status', 'pending');

		if (updateErr) {
			console.error('Failed to reject access request:', updateErr);
			return fail(500, { error: 'Failed to reject request' });
		}

		// Log admin action
		await supabase.rpc('log_admin_action', {
			p_target_user_id: user.id,
			p_action: 'reject_access_request',
			p_details: { request_id: requestId }
		});

		return { success: true, action: 'reject' };
	},

	resend: async ({ request, locals, url }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const requestId = formData.get('requestId') as string;

		if (!requestId) return fail(400, { error: 'Missing request ID' });

		const supabase = locals.supabase;
		const adminClient = getAdminClient();

		// Get the approved access request
		const { data: accessRequest, error: fetchErr } = await supabase
			.from('access_requests')
			.select('*, registration_invites(code, used_by, expires_at)')
			.eq('id', requestId)
			.eq('status', 'approved')
			.single();

		if (fetchErr || !accessRequest) {
			return fail(404, { error: 'Approved request not found' });
		}

		// Re-invite via Supabase (handles unconfirmed users gracefully)
		const redirectTo = `${url.origin}/auth/accept-invite`;
		const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
			accessRequest.email,
			{ redirectTo }
		);

		if (inviteError) {
			if (inviteError.message?.includes('already been registered') || inviteError.message?.includes('already exists')) {
				return fail(400, {
					error: 'This user has already completed registration. They may need to log in or reset their password.'
				});
			}
			return fail(500, { error: 'Failed to resend invite. Please try again.' });
		}

		return { success: true, action: 'resend' };
	}
};
