import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { auditLog } from '$lib/server/auditLog';
import { notifyAdmins } from '$lib/server/notifications';

export const GET = apiRoute(
	{ permission: { none: true }, readOnly: false },
	async ({ supabase, orgId, userId }, event) => {
		const status = event.url.searchParams.get('status');

		// Check membership role to determine access level
		let isPrivileged = false;
		if (userId) {
			const { data: membership } = await supabase
				.from('organization_memberships')
				.select('role')
				.eq('organization_id', orgId)
				.eq('user_id', userId)
				.single();

			isPrivileged = membership?.role === 'owner' || membership?.role === 'admin';
		}

		let query = supabase
			.from('deletion_requests')
			.select('*')
			.eq('organization_id', orgId)
			.order('created_at', { ascending: false });

		if (status) {
			query = query.eq('status', status);
		}

		// Non-privileged users can only see their own requests
		if (!isPrivileged && userId) {
			query = query.eq('requested_by', userId);
		}

		const { data, error: dbError } = await query;

		if (dbError) throw error(500, dbError.message);

		return json(data);
	}
);

export const POST = apiRoute(
	{ permission: { none: true }, readOnly: false },
	async ({ supabase, orgId, userId }, event) => {
		if (!userId) throw error(401, 'Unauthorized');

		const body = await event.request.json();
		const { resourceType, resourceId, resourceDescription, resourceUrl } = body;

		if (!resourceType || !resourceId || !resourceDescription) {
			throw error(400, 'Missing required fields: resourceType, resourceId, resourceDescription');
		}

		// Check for existing pending request for the same resource
		const { data: existing } = await supabase
			.from('deletion_requests')
			.select('id')
			.eq('organization_id', orgId)
			.eq('resource_type', resourceType)
			.eq('resource_id', resourceId)
			.eq('status', 'pending')
			.maybeSingle();

		if (existing) {
			return json({ error: 'A pending deletion request already exists for this resource' }, { status: 409 });
		}

		// Get user email for the request
		const userEmail = event.locals.user?.email ?? 'unknown';

		const { data, error: dbError } = await supabase
			.from('deletion_requests')
			.insert({
				organization_id: orgId,
				requested_by: userId,
				requested_by_email: userEmail,
				resource_type: resourceType,
				resource_id: resourceId,
				resource_description: resourceDescription,
				resource_url: resourceUrl ?? null,
				status: 'pending'
			})
			.select()
			.single();

		if (dbError) throw error(500, dbError.message);

		auditLog(
			{
				action: 'deletion_request.created',
				resourceType: 'deletion_request',
				resourceId: data.id,
				orgId,
				details: { resource_type: resourceType, resource_id: resourceId, resource_description: resourceDescription }
			},
			{ userId }
		);

		// Notify admins/owners about the pending request
		const isPersonnel = resourceType === 'personnel';
		const actionWord = isPersonnel ? 'archive' : 'delete';

		await notifyAdmins(orgId, userId, {
			type: 'deletion_request_pending',
			title: `${isPersonnel ? 'Archival' : 'Deletion'} Request`,
			message: `${userEmail} requested to ${actionWord} "${resourceDescription}". Review in Admin Hub.`,
			link: `/org/${orgId}/admin/approvals`
		});

		return json(data, { status: 201 });
	}
);

export const DELETE = apiRoute(
	{ permission: { none: true }, readOnly: false },
	async ({ supabase, orgId, userId }, event) => {
		if (!userId) throw error(401, 'Unauthorized');

		const body = await event.request.json();
		const { id } = body;

		if (!id) throw error(400, 'Missing id');

		const { error: dbError } = await supabase
			.from('deletion_requests')
			.delete()
			.eq('id', id)
			.eq('requested_by', userId)
			.eq('status', 'pending')
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);

		auditLog(
			{
				action: 'deletion_request.cancelled',
				resourceType: 'deletion_request',
				resourceId: id,
				orgId
			},
			{ userId }
		);

		return json({ success: true });
	}
);
