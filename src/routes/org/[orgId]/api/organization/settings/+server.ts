import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase, isSandbox } = getApiContext(event.locals, event.cookies, orgId);

	if (isSandbox) throw error(403, 'Not available in sandbox');

	ctx.auth.requirePrivileged();

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

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

	ctx.audit.log({
		action: 'organization.settings_updated',
		resourceType: 'organization',
		resourceId: orgId,
		details: {
			actor: event.locals.user?.email ?? ctx.auth.userId,
			archive_retention_months: archiveRetentionMonths
		}
	});

	return json({ success: true });
};
