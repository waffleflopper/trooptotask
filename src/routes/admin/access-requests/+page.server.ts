import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { sendInviteEmail } from '$lib/server/email';
import crypto from 'crypto';

function generateInviteCode(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let code = '';
	const bytes = crypto.randomBytes(8);
	for (let i = 0; i < 8; i++) {
		code += chars[bytes[i] % chars.length];
	}
	return code;
}

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

		// Generate invite code
		const code = generateInviteCode();
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 7);

		// Create registration invite locked to the requester's email
		const { data: invite, error: inviteErr } = await supabase
			.from('registration_invites')
			.insert({
				code,
				email: accessRequest.email,
				created_by: user.id,
				expires_at: expiresAt.toISOString()
			})
			.select()
			.single();

		if (inviteErr || !invite) {
			console.error('Failed to create invite:', inviteErr);
			return fail(500, { error: 'Failed to create invite code' });
		}

		// Update access request
		const { error: updateErr } = await supabase
			.from('access_requests')
			.update({
				status: 'approved',
				reviewed_by: user.id,
				reviewed_at: new Date().toISOString(),
				invite_id: invite.id
			})
			.eq('id', requestId);

		if (updateErr) {
			console.error('Failed to update access request:', updateErr);
			return fail(500, { error: 'Failed to approve request' });
		}

		// Build registration URL
		const registrationUrl = `${url.origin}/auth/register?code=${code}&email=${encodeURIComponent(accessRequest.email)}`;

		// Send invite email
		try {
			await sendInviteEmail(accessRequest.email, accessRequest.name, registrationUrl);
		} catch (emailErr) {
			console.error('Failed to send invite email:', emailErr);
			// Don't fail — the invite was created, admin can share the link manually
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

		// Get the approved access request with its invite
		const { data: accessRequest, error: fetchErr } = await supabase
			.from('access_requests')
			.select('*, registration_invites(code, used_by, expires_at)')
			.eq('id', requestId)
			.eq('status', 'approved')
			.single();

		if (fetchErr || !accessRequest) {
			return fail(404, { error: 'Approved request not found' });
		}

		const invite = accessRequest.registration_invites;

		if (!invite) {
			return fail(400, { error: 'No invite code associated with this request' });
		}

		if (invite.used_by) {
			return fail(400, { error: 'This invite has already been used' });
		}

		// Check if expired — if so, create a fresh invite
		let code = invite.code;
		if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
			const newCode = generateInviteCode();
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + 7);

			const { data: newInvite, error: inviteErr } = await supabase
				.from('registration_invites')
				.insert({
					code: newCode,
					email: accessRequest.email,
					created_by: user.id,
					expires_at: expiresAt.toISOString()
				})
				.select()
				.single();

			if (inviteErr || !newInvite) {
				console.error('Failed to create new invite:', inviteErr);
				return fail(500, { error: 'Failed to create new invite code' });
			}

			// Update access request to point to new invite
			await supabase.from('access_requests').update({ invite_id: newInvite.id }).eq('id', requestId);

			code = newCode;
		}

		const registrationUrl = `${url.origin}/auth/register?code=${code}&email=${encodeURIComponent(accessRequest.email)}`;

		try {
			await sendInviteEmail(accessRequest.email, accessRequest.name, registrationUrl);
		} catch (emailErr) {
			console.error('Failed to resend invite email:', emailErr);
			return fail(500, { error: 'Failed to send email' });
		}

		return { success: true, action: 'resend' };
	}
};
