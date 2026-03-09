import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext, getAdminClient } from '$lib/server/supabase';
import { isPrivilegedRole } from '$lib/server/permissions';
import { auditLog } from '$lib/server/auditLog';

const RESOURCE_TYPE_TABLE_MAP: Record<string, string> = {
	personnel: 'personnel',
	counseling_record: 'counseling_records',
	personnel_training: 'personnel_trainings',
	development_goal: 'development_goals',
	training_type: 'training_types',
	counseling_type: 'counseling_types',
	rating_scheme_entry: 'rating_scheme_entries'
};

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId } = getApiContext(locals, cookies, orgId);

	if (!userId) throw error(401, 'Unauthorized');

	// Check membership: must be owner or admin
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership || !isPrivilegedRole(membership.role)) {
		throw error(403, 'Only owners and admins can review deletion requests');
	}

	const body = await request.json();
	const { id, action, denialReason } = body;

	if (!id || !action) throw error(400, 'Missing required fields: id, action');
	if (action !== 'approve' && action !== 'deny') {
		throw error(400, 'Action must be "approve" or "deny"');
	}

	// Fetch the pending deletion request
	const { data: request_record, error: fetchError } = await supabase
		.from('deletion_requests')
		.select('*')
		.eq('id', id)
		.eq('organization_id', orgId)
		.eq('status', 'pending')
		.single();

	if (fetchError || !request_record) {
		throw error(404, 'Pending deletion request not found');
	}

	const adminClient = getAdminClient();

	// Update the deletion request status
	const newStatus = action === 'approve' ? 'approved' : 'denied';
	const { error: updateError } = await adminClient
		.from('deletion_requests')
		.update({
			status: newStatus,
			reviewed_by: userId,
			reviewed_at: new Date().toISOString(),
			denial_reason: action === 'deny' ? (denialReason ?? null) : null
		})
		.eq('id', id);

	if (updateError) throw error(500, updateError.message);

	// If approved, perform the actual deletion (or archive for personnel)
	if (action === 'approve') {
		const tableName = RESOURCE_TYPE_TABLE_MAP[request_record.resource_type];
		if (tableName) {
			if (request_record.resource_type === 'personnel') {
				// Archive instead of hard-delete for personnel
				const { error: archiveError } = await adminClient
					.from('personnel')
					.update({ archived_at: new Date().toISOString() })
					.eq('id', request_record.resource_id)
					.eq('organization_id', orgId);

				if (archiveError) {
					console.error('Failed to archive personnel:', archiveError.message);
				}
			} else {
				// Hard-delete for other resource types
				const { error: deleteError } = await adminClient
					.from(tableName)
					.delete()
					.eq('id', request_record.resource_id)
					.eq('organization_id', orgId);

				if (deleteError) {
					console.error('Failed to delete resource:', deleteError.message);
				}
			}
		}
	}

	// Create notification for the requester
	const notificationType = action === 'approve' ? 'deletion_approved' : 'deletion_denied';
	const notificationTitle = action === 'approve' ? 'Deletion Approved' : 'Deletion Denied';
	const notificationMessage =
		action === 'approve'
			? request_record.resource_type === 'personnel'
				? `Your request to archive "${request_record.resource_description}" has been approved.`
				: `Your request to delete "${request_record.resource_description}" has been approved.`
			: `Your request to delete "${request_record.resource_description}" has been denied.${denialReason ? ` Reason: ${denialReason}` : ''}`;

	await adminClient.from('notifications').insert({
		user_id: request_record.requested_by,
		organization_id: orgId,
		type: notificationType,
		title: notificationTitle,
		message: notificationMessage,
		link: action === 'deny' ? request_record.resource_url : null
	});

	auditLog(
		{
			action: `deletion_request.${newStatus}`,
			resourceType: 'deletion_request',
			resourceId: id,
			orgId,
			details: {
				reviewer: userId,
				resource_type: request_record.resource_type,
				resource_id: request_record.resource_id,
				resource_description: request_record.resource_description,
				denial_reason: denialReason ?? null
			}
		},
		{ userId }
	);

	return json({ success: true });
};
