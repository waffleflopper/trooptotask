import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { isPrivilegedRole } from '$lib/server/permissions';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { auditLog } from '$lib/server/auditLog';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (isSandbox) throw error(403, 'Not available in sandbox mode');
	if (!userId) throw error(401, 'Unauthorized');

	const { data: mem } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!mem || !isPrivilegedRole(mem.role)) {
		throw error(403, 'Only admins and owners can change settings');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { archiveRetentionMonths } = body;

	if (
		typeof archiveRetentionMonths !== 'number' ||
		archiveRetentionMonths < 1 ||
		archiveRetentionMonths > 120
	) {
		throw error(400, 'Retention months must be between 1 and 120');
	}

	const { error: dbError } = await supabase
		.from('organizations')
		.update({ archive_retention_months: Math.round(archiveRetentionMonths) })
		.eq('id', orgId);

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'organization.settings_updated',
			resourceType: 'organization',
			resourceId: orgId,
			orgId,
			details: {
				actor: locals.user?.email ?? userId,
				archive_retention_months: archiveRetentionMonths
			}
		},
		{ userId }
	);

	return json({ success: true });
};
