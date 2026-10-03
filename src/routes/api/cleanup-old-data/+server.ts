import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';
import { cleanupAuditLogs } from '$lib/audit/index.server';

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);
	try {
		return json({ auditLogsDeleted: await cleanupAuditLogs(getAdminClient()) });
	} catch {
		console.error('Audit cleanup failed');
		throw error(500, 'Failed to cleanup old data');
	}
};
