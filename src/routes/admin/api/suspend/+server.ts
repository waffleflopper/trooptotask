import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminRole, validateSuspendRequest } from '$lib/server/admin';
import { getAdminClient } from '$lib/server/supabase';
import { auditLog, getRequestInfo } from '$lib/server/auditLog';

export const POST: RequestHandler = async (event) => {
	const { locals } = event;
	const { user, supabase } = locals;
	if (!user) throw error(401, 'Not authenticated');

	const role = await getAdminRole(supabase, user.id);
	if (role !== 'super_admin') throw error(403, 'Only super admins can suspend');

	const body = await event.request.json();
	const validation = validateSuspendRequest(body);
	if (!validation.valid) throw error(400, validation.error ?? 'Invalid request');

	const adminClient = getAdminClient();
	const { type, targetId, action, reason } = validation;

	if (type === 'user') {
		if (action === 'suspend') {
			const { error: dbError } = await adminClient
				.from('user_suspensions')
				.upsert({ user_id: targetId, suspended_by: user.id, reason });
			if (dbError) throw error(500, 'Operation failed');
		} else {
			const { error: dbError } = await adminClient
				.from('user_suspensions')
				.delete()
				.eq('user_id', targetId);
			if (dbError) throw error(500, 'Operation failed');
		}
	} else {
		if (action === 'suspend') {
			const { error: dbError } = await adminClient
				.from('organizations')
				.update({ suspended_at: new Date().toISOString() })
				.eq('id', targetId);
			if (dbError) throw error(500, 'Operation failed');
		} else {
			const { error: dbError } = await adminClient
				.from('organizations')
				.update({ suspended_at: null })
				.eq('id', targetId);
			if (dbError) throw error(500, 'Operation failed');
		}
	}

	await auditLog(
		{
			action: `${action}_${type}`,
			resourceType: type === 'user' ? 'user' : 'organization',
			resourceId: targetId,
			details: { reason },
			severity: 'critical'
		},
		getRequestInfo(event)
	);

	return json({ success: true });
};
