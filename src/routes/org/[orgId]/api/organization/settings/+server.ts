import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { auditLog } from '$lib/server/auditLog';

export const POST = apiRoute(
	{ permission: { privileged: true }, blockSandbox: true },
	async ({ supabase, orgId, userId }, event) => {
		const body = await event.request.json();
		const { archiveRetentionMonths } = body;

		if (typeof archiveRetentionMonths !== 'number' || archiveRetentionMonths < 1 || archiveRetentionMonths > 120) {
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
					actor: event.locals.user?.email ?? userId,
					archive_retention_months: archiveRetentionMonths
				}
			},
			{ userId }
		);

		return json({ success: true });
	}
);
