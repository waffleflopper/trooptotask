import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { assertCronEndpointAuthorized } from '$features/scheduled-maintenance/index.server';
import {
	cleanupRetainedAuditLogs,
	cleanupRetainedReadNotifications
} from '$lib/server/adapters/scheduledMaintenanceSources.server';

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);
	try {
		const auditLogsDeleted = await cleanupRetainedAuditLogs();
		const notificationsDeleted = await cleanupRetainedReadNotifications();
		return json({ auditLogsDeleted, notificationsDeleted });
	} catch {
		console.error('Old data cleanup failed');
		throw error(500, 'Failed to cleanup old data');
	}
};
